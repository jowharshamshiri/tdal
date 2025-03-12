/**
 * SQLite-specific query builder implementation
 */

import {
  DatabaseAdapter,
  QueryBuilder,
  WhereCondition,
  ConditionOperator,
  DateFunctions,
} from "../core/types";
import { EntityMapping, mapColumnToPhysical } from "../orm/entity-mapping";
import {
  EntityQueryBuilder,
  EntityQueryBuilderBase,
} from "./entity-query-builder";
import {
  Relation,
  ManyToManyRelation,
  OneToManyRelation,
  OneToOneRelation,
  ManyToOneRelation,
  findRelation,
} from "../orm/relation-types";

/**
 * SQLite query builder implementation
 */
export class SQLiteQueryBuilder implements QueryBuilder {
  private selectFields: string[] = ["*"];
  private fromTable = "";
  private fromAlias = "";
  private whereConditions: string[] = [];
  private joinClauses: string[] = [];
  private orderByClauses: string[] = [];
  private limitValue?: number;
  private offsetValue?: number;
  private groupByFields: string[] = [];
  private havingCondition?: string;
  private queryParams: unknown[] = [];

  /**
   * Constructor
   * @param adapter Database adapter
   */
  constructor(private adapter: DatabaseAdapter) {}

  /**
   * Set the SELECT clause fields
   * @param fields Field names or expressions
   * @param params Optional parameters for parameterized expressions
   * @returns Query builder instance for chaining
   */
  select(fields: string | string[], ...params: unknown[]): QueryBuilder {
    if (typeof fields === "string") {
      this.selectFields = [fields];
    } else {
      this.selectFields = fields;
    }

    this.queryParams.push(...params);
    return this;
  }

  /**
   * Set a raw SQL expression to select
   * @param expression Raw SQL expression
   * @param params Optional parameters for the expression
   * @returns Query builder instance for chaining
   */
  selectRaw(expression: string, ...params: unknown[]): QueryBuilder {
    this.selectFields.push(expression);
    this.queryParams.push(...params);
    return this;
  }

  /**
   * Set the FROM clause table
   * @param table Table name
   * @param alias Optional table alias
   * @returns Query builder instance for chaining
   */
  from(table: string, alias?: string): QueryBuilder {
    this.fromTable = table;
    this.fromAlias = alias || "";
    return this;
  }

  /**
   * Add a WHERE condition
   * @param condition Condition object or raw condition string
   * @param params Optional parameters for parameterized conditions
   * @returns Query builder instance for chaining
   */
  where(
    condition: WhereCondition | string,
    ...params: unknown[]
  ): QueryBuilder {
    this.whereConditions = []; // Reset where conditions

    if (typeof condition === "string") {
      this.whereConditions.push(`(${condition})`);
      this.queryParams.push(...params);
    } else {
      const { sql, params: conditionParams } =
        this.processWhereCondition(condition);
      this.whereConditions.push(`(${sql})`);
      this.queryParams.push(...conditionParams);
    }

    return this;
  }

  /**
   * Add an AND WHERE condition
   * @param condition Condition object or raw condition string
   * @param params Optional parameters for parameterized conditions
   * @returns Query builder instance for chaining
   */
  andWhere(
    condition: WhereCondition | string,
    ...params: unknown[]
  ): QueryBuilder {
    if (this.whereConditions.length === 0) {
      return this.where(condition, ...params);
    }

    if (typeof condition === "string") {
      this.whereConditions.push(`AND (${condition})`);
      this.queryParams.push(...params);
    } else {
      const { sql, params: conditionParams } =
        this.processWhereCondition(condition);
      this.whereConditions.push(`AND (${sql})`);
      this.queryParams.push(...conditionParams);
    }

    return this;
  }

  /**
   * Add an OR WHERE condition
   * @param condition Condition object or raw condition string
   * @param params Optional parameters for parameterized conditions
   * @returns Query builder instance for chaining
   */
  orWhere(
    condition: WhereCondition | string,
    ...params: unknown[]
  ): QueryBuilder {
    if (this.whereConditions.length === 0) {
      return this.where(condition, ...params);
    }

    if (typeof condition === "string") {
      this.whereConditions.push(`OR (${condition})`);
      this.queryParams.push(...params);
    } else {
      const { sql, params: conditionParams } =
        this.processWhereCondition(condition);
      this.whereConditions.push(`OR (${sql})`);
      this.queryParams.push(...conditionParams);
    }

    return this;
  }

  /**
   * Add a JOIN clause
   * @param type Join type
   * @param table Table to join
   * @param alias Table alias
   * @param condition Join condition
   * @param params Optional parameters for parameterized conditions
   * @returns Query builder instance for chaining
   */
  join(
    type: "INNER" | "LEFT" | "RIGHT",
    table: string,
    alias: string,
    condition: string,
    ...params: unknown[]
  ): QueryBuilder {
    // SQLite doesn't support RIGHT JOIN, convert to LEFT JOIN with reversed condition
    if (type === "RIGHT") {
      console.warn(
        "SQLite doesn't support RIGHT JOIN, converting to LEFT JOIN with reversed condition."
      );
      // This is a simplistic approach - for complex conditions it may not work correctly
      const parts = condition.split("=");
      if (parts.length === 2) {
        const reversedCondition = `${parts[1].trim()} = ${parts[0].trim()}`;
        this.joinClauses.push(
          `LEFT JOIN ${table} ${alias} ON ${reversedCondition}`
        );
      } else {
        // Fall back to LEFT JOIN with original condition if we can't easily reverse it
        this.joinClauses.push(`LEFT JOIN ${table} ${alias} ON ${condition}`);
      }
    } else {
      this.joinClauses.push(`${type} JOIN ${table} ${alias} ON ${condition}`);
    }

    this.queryParams.push(...params);
    return this;
  }

  /**
   * Add an INNER JOIN clause
   * @param table Table to join
   * @param alias Table alias
   * @param condition Join condition
   * @param params Optional parameters for parameterized conditions
   * @returns Query builder instance for chaining
   */
  innerJoin(
    table: string,
    alias: string,
    condition: string,
    ...params: unknown[]
  ): QueryBuilder {
    return this.join("INNER", table, alias, condition, ...params);
  }

  /**
   * Add a LEFT JOIN clause
   * @param table Table to join
   * @param alias Table alias
   * @param condition Join condition
   * @param params Optional parameters for parameterized conditions
   * @returns Query builder instance for chaining
   */
  leftJoin(
    table: string,
    alias: string,
    condition: string,
    ...params: unknown[]
  ): QueryBuilder {
    return this.join("LEFT", table, alias, condition, ...params);
  }

  /**
   * Add a RIGHT JOIN clause
   * @param table Table to join
   * @param alias Table alias
   * @param condition Join condition
   * @param params Optional parameters for parameterized conditions
   * @returns Query builder instance for chaining
   */
  rightJoin(
    table: string,
    alias: string,
    condition: string,
    ...params: unknown[]
  ): QueryBuilder {
    return this.join("RIGHT", table, alias, condition, ...params);
  }

  /**
   * Add an ORDER BY clause
   * @param field Field to order by
   * @param direction Sort direction
   * @returns Query builder instance for chaining
   */
  orderBy(field: string, direction: "ASC" | "DESC" = "ASC"): QueryBuilder {
    this.orderByClauses.push(`${field} ${direction}`);
    return this;
  }

  /**
   * Add a GROUP BY clause
   * @param fields Fields to group by
   * @returns Query builder instance for chaining
   */
  groupBy(fields: string | string[]): QueryBuilder {
    if (typeof fields === "string") {
      this.groupByFields.push(fields);
    } else {
      this.groupByFields.push(...fields);
    }
    return this;
  }

  /**
   * Add a HAVING clause
   * @param condition Having condition
   * @param params Optional parameters for parameterized conditions
   * @returns Query builder instance for chaining
   */
  having(condition: string, ...params: unknown[]): QueryBuilder {
    this.havingCondition = condition;
    this.queryParams.push(...params);
    return this;
  }

  /**
   * Set a LIMIT clause
   * @param limit Maximum number of rows to return
   * @returns Query builder instance for chaining
   */
  limit(limit: number): QueryBuilder {
    this.limitValue = limit;
    return this;
  }

  /**
   * Set an OFFSET clause
   * @param offset Number of rows to skip
   * @returns Query builder instance for chaining
   */
  offset(offset: number): QueryBuilder {
    this.offsetValue = offset;
    return this;
  }

  /**
   * Get the generated SQL query
   * @returns SQL query string
   */
  getQuery(): string {
    // Build the query
    let query = `SELECT ${this.selectFields.join(", ")} FROM ${this.fromTable}`;

    // Add alias if provided
    if (this.fromAlias) {
      query += ` ${this.fromAlias}`;
    }

    // Add joins
    if (this.joinClauses.length > 0) {
      query += ` ${this.joinClauses.join(" ")}`;
    }

    // Add where conditions
    if (this.whereConditions.length > 0) {
      query += ` WHERE ${this.whereConditions.join(" ")}`;
    }

    // Add group by
    if (this.groupByFields.length > 0) {
      query += ` GROUP BY ${this.groupByFields.join(", ")}`;
    }

    // Add having
    if (this.havingCondition) {
      query += ` HAVING ${this.havingCondition}`;
    }

    // Add order by
    if (this.orderByClauses.length > 0) {
      query += ` ORDER BY ${this.orderByClauses.join(", ")}`;
    }

    // Add limit and offset
    if (this.limitValue !== undefined) {
      query += ` LIMIT ${this.limitValue}`;

      if (this.offsetValue !== undefined) {
        query += ` OFFSET ${this.offsetValue}`;
      }
    }

    return query;
  }

  /**
   * Get the parameters for the query
   * @returns Array of parameter values
   */
  getParameters(): unknown[] {
    return this.queryParams;
  }

  /**
   * Convert the query to a SQL string with parameters
   * @returns SQL query with parameter placeholders
   */
  toSql(): string {
    return this.getQuery();
  }

  /**
   * Execute the query and return multiple results
   * @returns Promise resolving to an array of results
   */
  async execute<T>(): Promise<T[]> {
    const query = this.getQuery();
    const params = this.getParameters();
    return this.adapter.query<T>(query, ...params);
  }

  /**
   * Execute the query and return a single result
   * @returns Promise resolving to a single result or undefined
   */
  async getOne<T>(): Promise<T | undefined> {
    // Set limit to 1 if not already set
    if (this.limitValue === undefined) {
      this.limit(1);
    }

    const query = this.getQuery();
    const params = this.getParameters();
    return this.adapter.querySingle<T>(query, ...params);
  }

  /**
   * Execute a count query
   * @returns Promise resolving to the count
   */
  async getCount(): Promise<number> {
    // Save original select fields
    const originalSelect = [...this.selectFields];

    // Modify to do a count
    this.selectFields = ["COUNT(*) as count"];

    // Remove order by, limit, and offset
    const originalOrderBy = [...this.orderByClauses];
    const originalLimit = this.limitValue;
    const originalOffset = this.offsetValue;

    this.orderByClauses = [];
    this.limitValue = undefined;
    this.offsetValue = undefined;

    const query = this.getQuery();
    const params = this.getParameters();

    // Restore original values
    this.selectFields = originalSelect;
    this.orderByClauses = originalOrderBy;
    this.limitValue = originalLimit;
    this.offsetValue = originalOffset;

    const result = await this.adapter.querySingle<{ count: number }>(
      query,
      ...params
    );
    return result?.count || 0;
  }

  /**
   * Process a WHERE condition object into SQL
   * @param condition Where condition
   * @returns SQL string and parameters
   */
  private processWhereCondition(condition: WhereCondition): {
    sql: string;
    params: unknown[];
  } {
    const { field, operator, value } = condition;
    let sql = "";
    const params: unknown[] = [];

    switch (operator) {
      case "IS NULL":
        sql = `${field} IS NULL`;
        break;
      case "IS NOT NULL":
        sql = `${field} IS NOT NULL`;
        break;
      case "IN":
        if (Array.isArray(value) && value.length > 0) {
          const placeholders = value.map(() => "?").join(", ");
          sql = `${field} IN (${placeholders})`;
          params.push(...value);
        } else {
          // If empty array, use a condition that's always false
          sql = "0 = 1";
        }
        break;
      case "NOT IN":
        if (Array.isArray(value) && value.length > 0) {
          const placeholders = value.map(() => "?").join(", ");
          sql = `${field} NOT IN (${placeholders})`;
          params.push(...value);
        } else {
          // If empty array, use a condition that's always true
          sql = "1 = 1";
        }
        break;
      case "BETWEEN":
        if (Array.isArray(value) && value.length === 2) {
          sql = `${field} BETWEEN ? AND ?`;
          params.push(value[0], value[1]);
        } else {
          throw new Error(
            "BETWEEN operator requires an array of exactly two values"
          );
        }
        break;
      default:
        sql = `${field} ${operator} ?`;
        params.push(value);
        break;
    }

    return { sql, params };
  }
}

/**
 * SQLite entity query builder implementation
 */
export class SQLiteEntityQueryBuilder
  extends EntityQueryBuilderBase
  implements EntityQueryBuilder
{
  private queryBuilder: SQLiteQueryBuilder;
  private readonly mapping: EntityMapping;
  private readonly dateFunctions: DateFunctions;

  constructor(private adapter: DatabaseAdapter, mapping: EntityMapping) {
    super();
    this.mapping = mapping;
    this.queryBuilder = new SQLiteQueryBuilder(adapter);
    this.queryBuilder.from(mapping.table);
    this.dateFunctions = adapter.getDateFunctions();
  }

  /**
   * Get the entity mapping
   * @returns Entity mapping
   */
  getEntityMapping(): EntityMapping {
    return this.mapping;
  }

  /**
   * Map a logical column name to a physical column name
   * @param logicalColumnName Logical column name
   * @returns Physical column name
   */
  protected mapColumnName(logicalColumnName: string): string {
    return mapColumnToPhysical(this.mapping, logicalColumnName);
  }

  /**
   * Get a relationship from the entity mapping
   * @param relationName Relationship name
   * @returns Relation object
   */
  protected getRelation(relationName: string): Relation {
    const relation = findRelation(this.mapping.relations, relationName);

    if (!relation) {
      throw new Error(
        `Relationship '${relationName}' not found in entity '${this.mapping.entity}'`
      );
    }

    return relation;
  }

  // Implement QueryBuilder methods by delegating to the internal query builder
  select(fields: string | string[], ...params: unknown[]): QueryBuilder {
    this.queryBuilder.select(fields, ...params);
    return this;
  }

  selectRaw(expression: string, ...params: unknown[]): QueryBuilder {
    this.queryBuilder.selectRaw(expression, ...params);
    return this;
  }

  from(table: string, alias?: string): QueryBuilder {
    this.queryBuilder.from(table, alias);
    return this;
  }

  where(
    condition: WhereCondition | string,
    ...params: unknown[]
  ): QueryBuilder {
    this.queryBuilder.where(condition, ...params);
    return this;
  }

  andWhere(
    condition: WhereCondition | string,
    ...params: unknown[]
  ): QueryBuilder {
    this.queryBuilder.andWhere(condition, ...params);
    return this;
  }

  orWhere(
    condition: WhereCondition | string,
    ...params: unknown[]
  ): QueryBuilder {
    this.queryBuilder.orWhere(condition, ...params);
    return this;
  }

  innerJoin(
    table: string,
    alias: string,
    condition: string,
    ...params: unknown[]
  ): QueryBuilder {
    this.queryBuilder.innerJoin(table, alias, condition, ...params);
    return this;
  }

  leftJoin(
    table: string,
    alias: string,
    condition: string,
    ...params: unknown[]
  ): QueryBuilder {
    this.queryBuilder.leftJoin(table, alias, condition, ...params);
    return this;
  }

  rightJoin(
    table: string,
    alias: string,
    condition: string,
    ...params: unknown[]
  ): QueryBuilder {
    this.queryBuilder.rightJoin(table, alias, condition, ...params);
    return this;
  }

  orderBy(field: string, direction?: "ASC" | "DESC"): QueryBuilder {
    this.queryBuilder.orderBy(field, direction);
    return this;
  }

  groupBy(fields: string | string[]): QueryBuilder {
    this.queryBuilder.groupBy(fields);
    return this;
  }

  having(condition: string, ...params: unknown[]): QueryBuilder {
    this.queryBuilder.having(condition, ...params);
    return this;
  }

  limit(limit: number): QueryBuilder {
    this.queryBuilder.limit(limit);
    return this;
  }

  offset(offset: number): QueryBuilder {
    this.queryBuilder.offset(offset);
    return this;
  }

  getParameters(): unknown[] {
    return this.queryBuilder.getParameters();
  }

  toSql(): string {
    return this.queryBuilder.toSql();
  }

  async execute<T>(): Promise<T[]> {
    return this.queryBuilder.execute<T>();
  }

  async getOne<T>(): Promise<T | undefined> {
    return this.queryBuilder.getOne<T>();
  }

  async getCount(): Promise<number> {
    return this.queryBuilder.getCount();
  }

  // Implement entity-aware methods
  selectColumns(logicalColumnNames: string[]): EntityQueryBuilder {
    const physicalColumns = logicalColumnNames.map((name) =>
      this.mapColumnName(name)
    );
    this.queryBuilder.select(physicalColumns);
    return this;
  }

  selectColumn(logicalColumnName: string): EntityQueryBuilder {
    const physicalColumn = this.mapColumnName(logicalColumnName);
    this.queryBuilder.select([physicalColumn]);
    return this;
  }

  whereColumn(
    logicalColumnName: string,
    operator: ConditionOperator,
    value: unknown
  ): EntityQueryBuilder {
    const physicalColumn = this.mapColumnName(logicalColumnName);
    this.queryBuilder.where({ field: physicalColumn, operator, value });
    return this;
  }

  andWhereColumn(
    logicalColumnName: string,
    operator: ConditionOperator,
    value: unknown
  ): EntityQueryBuilder {
    const physicalColumn = this.mapColumnName(logicalColumnName);
    this.queryBuilder.andWhere({ field: physicalColumn, operator, value });
    return this;
  }

  orWhereColumn(
    logicalColumnName: string,
    operator: ConditionOperator,
    value: unknown
  ): EntityQueryBuilder {
    const physicalColumn = this.mapColumnName(logicalColumnName);
    this.queryBuilder.orWhere({ field: physicalColumn, operator, value });
    return this;
  }

  orderByColumn(
    logicalColumnName: string,
    direction?: "ASC" | "DESC"
  ): EntityQueryBuilder {
    const physicalColumn = this.mapColumnName(logicalColumnName);
    this.queryBuilder.orderBy(physicalColumn, direction);
    return this;
  }

  groupByColumns(logicalColumnNames: string[]): EntityQueryBuilder {
    const physicalColumns = logicalColumnNames.map((name) =>
      this.mapColumnName(name)
    );
    this.queryBuilder.groupBy(physicalColumns);
    return this;
  }

  joinRelated(relationName: string, alias?: string): EntityQueryBuilder {
    const relation = this.getRelation(relationName);

    // Create join based on relationship type
    switch (relation.type) {
      case "oneToOne": {
        const oneToOne = relation as OneToOneRelation;
        const targetTable = oneToOne.targetEntity.toLowerCase();
        const targetAlias = alias || targetTable.charAt(0);
        const sourceColumn = this.mapColumnName(oneToOne.sourceColumn);
        const targetColumn = oneToOne.targetColumn;

        this.queryBuilder.innerJoin(
          targetTable,
          targetAlias,
          `${this.mapping.table}.${sourceColumn} = ${targetAlias}.${targetColumn}`
        );
        break;
      }
      case "oneToMany": {
        const oneToMany = relation as OneToManyRelation;
        const targetTable = oneToMany.targetEntity.toLowerCase();
        const targetAlias = alias || targetTable.charAt(0);
        const sourceColumn = this.mapColumnName(oneToMany.sourceColumn);
        const targetColumn = oneToMany.targetColumn;

        this.queryBuilder.innerJoin(
          targetTable,
          targetAlias,
          `${this.mapping.table}.${sourceColumn} = ${targetAlias}.${targetColumn}`
        );
        break;
      }
      case "manyToOne": {
        const manyToOne = relation as ManyToOneRelation;
        const targetTable = manyToOne.targetEntity.toLowerCase();
        const targetAlias = alias || targetTable.charAt(0);
        const sourceColumn = this.mapColumnName(manyToOne.sourceColumn);
        const targetColumn = manyToOne.targetColumn;

        this.queryBuilder.innerJoin(
          targetTable,
          targetAlias,
          `${this.mapping.table}.${sourceColumn} = ${targetAlias}.${targetColumn}`
        );
        break;
      }
      case "manyToMany": {
        const manyToMany = relation as ManyToManyRelation;
        const junctionTable = manyToMany.junctionTable;
        const junctionAlias = "j_" + relationName;
        const targetTable = manyToMany.targetEntity.toLowerCase();
        const targetAlias = alias || targetTable.charAt(0);

        // Join with junction table
        this.queryBuilder.innerJoin(
          junctionTable,
          junctionAlias,
          `${this.mapping.table}.${this.mapping.idField} = ${junctionAlias}.${manyToMany.junctionSourceColumn}`
        );

        // Join with target table
        this.queryBuilder.innerJoin(
          targetTable,
          targetAlias,
          `${junctionAlias}.${manyToMany.junctionTargetColumn} = ${targetAlias}.${manyToMany.targetColumn}`
        );
        break;
      }
    }

    return this;
  }

  leftJoinRelated(relationName: string, alias?: string): EntityQueryBuilder {
    const relation = this.getRelation(relationName);

    // Create join based on relationship type
    switch (relation.type) {
      case "oneToOne": {
        const oneToOne = relation as OneToOneRelation;
        const targetTable = oneToOne.targetEntity.toLowerCase();
        const targetAlias = alias || targetTable.charAt(0);
        const sourceColumn = this.mapColumnName(oneToOne.sourceColumn);
        const targetColumn = oneToOne.targetColumn;

        this.queryBuilder.leftJoin(
          targetTable,
          targetAlias,
          `${this.mapping.table}.${sourceColumn} = ${targetAlias}.${targetColumn}`
        );
        break;
      }
      case "oneToMany": {
        const oneToMany = relation as OneToManyRelation;
        const targetTable = oneToMany.targetEntity.toLowerCase();
        const targetAlias = alias || targetTable.charAt(0);
        const sourceColumn = this.mapColumnName(oneToMany.sourceColumn);
        const targetColumn = oneToMany.targetColumn;

        this.queryBuilder.leftJoin(
          targetTable,
          targetAlias,
          `${this.mapping.table}.${sourceColumn} = ${targetAlias}.${targetColumn}`
        );
        break;
      }
      case "manyToOne": {
        const manyToOne = relation as ManyToOneRelation;
        const targetTable = manyToOne.targetEntity.toLowerCase();
        const targetAlias = alias || targetTable.charAt(0);
        const sourceColumn = this.mapColumnName(manyToOne.sourceColumn);
        const targetColumn = manyToOne.targetColumn;

        this.queryBuilder.leftJoin(
          targetTable,
          targetAlias,
          `${this.mapping.table}.${sourceColumn} = ${targetAlias}.${targetColumn}`
        );
        break;
      }
      case "manyToMany": {
        const manyToMany = relation as ManyToManyRelation;
        const junctionTable = manyToMany.junctionTable;
        const junctionAlias = "j_" + relationName;
        const targetTable = manyToMany.targetEntity.toLowerCase();
        const targetAlias = alias || targetTable.charAt(0);

        // Join with junction table
        this.queryBuilder.leftJoin(
          junctionTable,
          junctionAlias,
          `${this.mapping.table}.${this.mapping.idField} = ${junctionAlias}.${manyToMany.junctionSourceColumn}`
        );

        // Join with target table
        this.queryBuilder.leftJoin(
          targetTable,
          targetAlias,
          `${junctionAlias}.${manyToMany.junctionTargetColumn} = ${targetAlias}.${manyToMany.targetColumn}`
        );
        break;
      }
    }

    return this;
  }

  whereDateColumn(
    logicalColumnName: string,
    operator: ConditionOperator,
    value: Date | string
  ): EntityQueryBuilder {
    const physicalColumn = this.mapColumnName(logicalColumnName);

    // Convert value to string if it's a Date
    const dateValue = value instanceof Date ? value.toISOString() : value;

    // Use database-agnostic date functions
    this.queryBuilder.where(`${physicalColumn} ${operator} ?`, dateValue);

    return this;
  }

  whereCurrentDate(
    logicalColumnName: string,
    operator: ConditionOperator
  ): EntityQueryBuilder {
    const physicalColumn = this.mapColumnName(logicalColumnName);
    const currentDateExpr = this.dateFunctions.currentDate();

    // Use database-agnostic date functions
    this.queryBuilder.where(`${physicalColumn} ${operator} ${currentDateExpr}`);

    return this;
  }

  whereFullText(
    logicalColumnName: string,
    searchText: string
  ): EntityQueryBuilder {
    // SQLite doesn't have built-in full-text search without FTS modules
    // This is a simple LIKE-based implementation
    return this.whereLike(logicalColumnName, searchText, "both");
  }

  whereLike(
    logicalColumnName: string,
    searchText: string,
    position: "start" | "end" | "both" | "none" = "both"
  ): EntityQueryBuilder {
    const physicalColumn = this.mapColumnName(logicalColumnName);
    let pattern: string;

    switch (position) {
      case "start":
        pattern = `%${searchText}`;
        break;
      case "end":
        pattern = `${searchText}%`;
        break;
      case "both":
        pattern = `%${searchText}%`;
        break;
      case "none":
        pattern = searchText;
        break;
    }

    this.queryBuilder.where(`${physicalColumn} LIKE ?`, pattern);

    return this;
  }

  whereSubquery(
    callback: (subQuery: EntityQueryBuilder) => EntityQueryBuilder
  ): EntityQueryBuilder {
    // Create a new entity query builder for the subquery
    const subQuery = new SQLiteEntityQueryBuilder(this.adapter, this.mapping);

    // Let the callback populate the subquery
    callback(subQuery);

    // Add the subquery to the main query
    this.queryBuilder.where(
      `EXISTS (${subQuery.getQuery()})`,
      ...subQuery.getParameters()
    );

    return this;
  }

  selectExpression(
    expression: string,
    alias: string,
    ...params: unknown[]
  ): EntityQueryBuilder {
    this.queryBuilder.selectRaw(`${expression} AS ${alias}`, ...params);
    return this;
  }

  async executeAndMap<T>(): Promise<T[]> {
    // Execute the query
    const results = await this.queryBuilder.execute<Record<string, unknown>>();

    // For now, this is just a pass-through since entity mapping is not fully implemented
    return results as unknown as T[];
  }

  async getOneAndMap<T>(): Promise<T | undefined> {
    // Execute the query
    const result = await this.queryBuilder.getOne<Record<string, unknown>>();

    if (!result) {
      return undefined;
    }

    // For now, this is just a pass-through since entity mapping is not fully implemented
    return result as unknown as T;
  }

  /**
   * Add a JOIN clause
   * @param type Join type
   * @param table Table to join
   * @param alias Table alias
   * @param condition Join condition
   * @param params Optional parameters for parameterized conditions
   * @returns Query builder instance for chaining
   */
  join(
    type: "INNER" | "LEFT" | "RIGHT",
    table: string,
    alias: string,
    condition: string,
    ...params: unknown[]
  ): QueryBuilder {
    // Delegate to the internal query builder
    this.queryBuilder.join(type, table, alias, condition, ...params);
    return this;
  }

  /**
   * Get the generated SQL query
   * @returns SQL query string
   */
  getQuery(): string {
    return this.queryBuilder.getQuery();
  }
}
