/**
 * Abstract database adapter
 * Base class for all database system-specific adapters
 */

import {
  DatabaseAdapter,
  DbQueryResult,
  QueryOptions,
  QueryBuilder,
  WhereCondition,
  DateFunctions,
  JoinOptions,
} from "../core/types";
import { DbConnection } from "../core/connection-types";

/**
 * Abstract base class for database adapters
 * Provides common functionality and default implementations
 */
export abstract class DatabaseAdapterBase implements DatabaseAdapter {
  /**
   * Connect to the database
   */
  abstract connect(): Promise<DbConnection>;

  /**
   * Close the database connection
   */
  abstract close(): void;

  /**
   * Begin a transaction
   */
  abstract beginTransaction(): Promise<void>;

  /**
   * Commit a transaction
   */
  abstract commitTransaction(): Promise<void>;

  /**
   * Rollback a transaction
   */
  abstract rollbackTransaction(): Promise<void>;

  /**
   * Get database-specific date functions
   */
  abstract getDateFunctions(): DateFunctions;

  /**
   * Create a query builder instance
   */
  abstract createQueryBuilder(): QueryBuilder;

  /**
   * Execute a transaction
   * @param callback Function to execute within the transaction
   * @returns Result of the callback
   */
  async transaction<T>(
    callback: (db: DatabaseAdapter) => Promise<T>
  ): Promise<T> {
    try {
      await this.beginTransaction();
      const result = await callback(this);
      await this.commitTransaction();
      return result;
    } catch (error) {
      await this.rollbackTransaction();
      throw error;
    }
  }

  /**
   * Execute a query
   * @param query SQL query
   * @param params Query parameters
   * @returns Query results
   */
  abstract query<T>(query: string, ...params: unknown[]): Promise<T[]>;

  /**
   * Execute a query that returns a single row
   * @param query SQL query
   * @param params Query parameters
   * @returns Single row result or undefined
   */
  abstract querySingle<T>(
    query: string,
    ...params: unknown[]
  ): Promise<T | undefined>;

  /**
   * Execute a non-query SQL statement
   * @param query SQL statement
   * @param params Statement parameters
   * @returns Query result information
   */
  abstract execute(query: string, ...params: unknown[]): Promise<DbQueryResult>;

  /**
   * Execute a SQL script
   * @param sql SQL script
   */
  abstract executeScript(sql: string): Promise<void>;

  /**
   * Find a record by ID
   * @param tableName Table name
   * @param idField ID field name
   * @param id ID value
   * @returns Record or undefined if not found
   */
  async findById<T>(
    tableName: string,
    idField: string,
    id: number | string
  ): Promise<T | undefined> {
    const query = `SELECT * FROM ${tableName} WHERE ${idField} = ?`;
    return this.querySingle<T>(query, id);
  }

  /**
   * Find all records
   * @param tableName Table name
   * @param options Query options
   * @returns Array of records
   */
  async findAll<T>(tableName: string, options?: QueryOptions): Promise<T[]> {
    const qb = this.createQueryBuilder();

    // Add fields if specified, otherwise select all
    if (options?.fields && options.fields.length > 0) {
      qb.select(options.fields);
    } else {
      qb.select(["*"]);
    }

    qb.from(tableName);

    // Add joins if specified
    if (options?.joins && options.joins.length > 0) {
      for (const join of options.joins) {
        qb.join(
          join.type,
          join.table,
          join.alias || join.table,
          join.on,
          ...(join.params || [])
        );
      }
    }

    // Add order by if specified
    if (options?.orderBy && options.orderBy.length > 0) {
      for (const order of options.orderBy) {
        qb.orderBy(order.field, order.direction);
      }
    }

    // Add group by if specified
    if (options?.groupBy && options.groupBy.length > 0) {
      qb.groupBy(options.groupBy);
    }

    // Add having if specified
    if (options?.having) {
      qb.having(options.having, ...(options.havingParams || []));
    }

    // Add limit and offset if specified
    if (options?.limit !== undefined) {
      qb.limit(options.limit);

      if (options?.offset !== undefined) {
        qb.offset(options.offset);
      }
    }

    return qb.execute<T>();
  }

  /**
   * Find records by conditions
   * @param tableName Table name
   * @param conditions Filter conditions
   * @param options Query options
   * @returns Array of records
   */
  async findBy<T>(
    tableName: string,
    conditions: Record<string, unknown>,
    options?: QueryOptions
  ): Promise<T[]> {
    const qb = this.createQueryBuilder();

    // Add fields if specified, otherwise select all
    if (options?.fields && options.fields.length > 0) {
      qb.select(options.fields);
    } else {
      qb.select(["*"]);
    }

    qb.from(tableName);

    // Add joins if specified
    if (options?.joins && options.joins.length > 0) {
      for (const join of options.joins) {
        qb.join(
          join.type,
          join.table,
          join.alias || join.table,
          join.on,
          ...(join.params || [])
        );
      }
    }

    // Add conditions
    this.addConditionsToQueryBuilder(qb, conditions);

    // Add order by if specified
    if (options?.orderBy && options.orderBy.length > 0) {
      for (const order of options.orderBy) {
        qb.orderBy(order.field, order.direction);
      }
    }

    // Add group by if specified
    if (options?.groupBy && options.groupBy.length > 0) {
      qb.groupBy(options.groupBy);
    }

    // Add having if specified
    if (options?.having) {
      qb.having(options.having, ...(options.havingParams || []));
    }

    // Add limit and offset if specified
    if (options?.limit !== undefined) {
      qb.limit(options.limit);

      if (options?.offset !== undefined) {
        qb.offset(options.offset);
      }
    }

    return qb.execute<T>();
  }

  /**
   * Find a single record by conditions
   * @param tableName Table name
   * @param conditions Filter conditions
   * @returns Record or undefined if not found
   */
  async findOneBy<T>(
    tableName: string,
    conditions: Record<string, unknown>
  ): Promise<T | undefined> {
    const qb = this.createQueryBuilder();
    qb.select(["*"]).from(tableName);

    // Add conditions
    this.addConditionsToQueryBuilder(qb, conditions);

    qb.limit(1);

    return qb.getOne<T>();
  }

  /**
   * Count records matching conditions
   * @param tableName Table name
   * @param conditions Filter conditions
   * @returns Count of matching records
   */
  async count(
    tableName: string,
    conditions?: Record<string, unknown>
  ): Promise<number> {
    const qb = this.createQueryBuilder();
    qb.select("COUNT(*) as count").from(tableName);

    // Add conditions if specified
    if (conditions) {
      this.addConditionsToQueryBuilder(qb, conditions);
    }

    const result = await qb.getOne<{ count: number }>();
    return result?.count || 0;
  }

  /**
   * Insert a record
   * @param tableName Table name
   * @param data Record data
   * @returns Inserted record ID
   */
  async insert<T>(tableName: string, data: Partial<T>): Promise<number> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = this.getPlaceholders(values.length);

    const query = `
			INSERT INTO ${tableName} (${keys.join(", ")})
			VALUES (${placeholders})
		  `;

    const result = await this.execute(query, ...values);
    return result.lastInsertRowid || 0;
  }

  /**
   * Update a record by ID
   * @param tableName Table name
   * @param idField ID field name
   * @param id ID value
   * @param data Update data
   * @returns Number of affected rows
   */
  async update<T>(
    tableName: string,
    idField: string,
    id: number | string,
    data: Partial<T>
  ): Promise<number> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((key) => `${key} = ?`).join(", ");

    const query = `
			UPDATE ${tableName}
			SET ${setClause}
			WHERE ${idField} = ?
		  `;

    const result = await this.execute(query, ...values, id);
    return result.changes || 0;
  }

  /**
   * Update records by conditions
   * @param tableName Table name
   * @param conditions Filter conditions
   * @param data Update data
   * @returns Number of affected rows
   */
  async updateBy<T>(
    tableName: string,
    conditions: Record<string, unknown>,
    data: Partial<T>
  ): Promise<number> {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((key) => `${key} = ?`).join(", ");

    const qb = this.createQueryBuilder();
    qb.from(tableName);

    // Add conditions
    this.addConditionsToQueryBuilder(qb, conditions);

    const whereClause = qb
      .getQuery()
      .replace(/^SELECT \* FROM \w+ (?:AS \w+ )?WHERE /i, "");
    const conditionParams = qb.getParameters();

    const query = `
			UPDATE ${tableName}
			SET ${setClause}
			WHERE ${whereClause}
		  `;

    const result = await this.execute(query, ...values, ...conditionParams);
    return result.changes || 0;
  }

  /**
   * Delete a record by ID
   * @param tableName Table name
   * @param idField ID field name
   * @param id ID value
   * @returns Number of affected rows
   */
  async delete(
    tableName: string,
    idField: string,
    id: number | string
  ): Promise<number> {
    const query = `DELETE FROM ${tableName} WHERE ${idField} = ?`;
    const result = await this.execute(query, id);
    return result.changes || 0;
  }

  /**
   * Delete records by conditions
   * @param tableName Table name
   * @param conditions Filter conditions
   * @param options Delete options
   * @returns Number of affected rows
   */
  async deleteBy(
    tableName: string,
    conditions: Record<string, unknown>,
    options?: { limit?: number }
  ): Promise<number> {
    const qb = this.createQueryBuilder();
    qb.from(tableName);

    // Add conditions
    this.addConditionsToQueryBuilder(qb, conditions);

    // Add limit if specified
    if (options?.limit !== undefined) {
      qb.limit(options.limit);
    }

    const whereClause = qb
      .getQuery()
      .replace(/^SELECT \* FROM \w+ (?:AS \w+ )?WHERE /i, "");
    const params = qb.getParameters();

    const query = `DELETE FROM ${tableName} WHERE ${whereClause}`;
    const result = await this.execute(query, ...params);
    return result.changes || 0;
  }

  /**
   * Find records with joins
   * @param mainTable Main table name
   * @param joins Join specifications
   * @param conditions Filter conditions
   * @param options Query options
   * @returns Array of records
   */
  async findWithJoin<T>(
    mainTable: string,
    joins: JoinOptions[],
    conditions?: Record<string, unknown>,
    options?: QueryOptions
  ): Promise<T[]> {
    const qb = this.createQueryBuilder();

    // Add fields if specified, otherwise select all from main table
    if (options?.fields && options.fields.length > 0) {
      qb.select(options.fields);
    } else {
      qb.select([`${mainTable}.*`]);
    }

    qb.from(mainTable);

    // Add joins
    for (const join of joins) {
      qb.join(
        join.type,
        join.table,
        join.alias || join.table,
        join.on,
        ...(join.params || [])
      );
    }

    // Add conditions if specified
    if (conditions) {
      this.addConditionsToQueryBuilder(qb, conditions);
    }

    // Add order by if specified
    if (options?.orderBy && options.orderBy.length > 0) {
      for (const order of options.orderBy) {
        qb.orderBy(order.field, order.direction);
      }
    }

    // Add group by if specified
    if (options?.groupBy && options.groupBy.length > 0) {
      qb.groupBy(options.groupBy);
    }

    // Add having if specified
    if (options?.having) {
      qb.having(options.having, ...(options.havingParams || []));
    }

    // Add limit and offset if specified
    if (options?.limit !== undefined) {
      qb.limit(options.limit);

      if (options?.offset !== undefined) {
        qb.offset(options.offset);
      }
    }

    return qb.execute<T>();
  }

  /**
   * Find a single record with joins
   * @param mainTable Main table name
   * @param joins Join specifications
   * @param conditions Filter conditions
   * @returns Record or undefined if not found
   */
  async findOneWithJoin<T>(
    mainTable: string,
    joins: JoinOptions[],
    conditions: Record<string, unknown>
  ): Promise<T | undefined> {
    const qb = this.createQueryBuilder();
    qb.select([`${mainTable}.*`]).from(mainTable);

    // Add joins
    for (const join of joins) {
      qb.join(
        join.type,
        join.table,
        join.alias || join.table,
        join.on,
        ...(join.params || [])
      );
    }

    // Add conditions
    this.addConditionsToQueryBuilder(qb, conditions);

    qb.limit(1);

    return qb.getOne<T>();
  }

  /**
   * Get database diagnostic information
   */
  abstract getDatabaseInfo(): Promise<Record<string, unknown>>;

  /**
   * Get placeholder string for prepared statements
   * May be overridden for databases that use different placeholder formats
   * @param count Number of placeholders
   * @returns Comma-separated placeholder string
   */
  protected getPlaceholders(count: number): string {
    return Array(count).fill("?").join(", ");
  }

  /**
   * Add conditions to a query builder
   * @param qb Query builder
   * @param conditions Conditions to add
   */
  protected addConditionsToQueryBuilder(
    qb: QueryBuilder,
    conditions: Record<string, unknown>
  ): void {
    const entries = Object.entries(conditions);

    // Skip if no conditions
    if (entries.length === 0) {
      return;
    }

    // Add first condition with WHERE
    const [firstKey, firstValue] = entries[0];

    if (firstValue === null) {
      qb.where(`${firstKey} IS NULL`);
    } else if (Array.isArray(firstValue)) {
      const placeholders = firstValue.map(() => "?").join(", ");
      qb.where(`${firstKey} IN (${placeholders})`, ...firstValue);
    } else {
      qb.where(`${firstKey} = ?`, firstValue);
    }

    // Add remaining conditions with AND
    for (let i = 1; i < entries.length; i++) {
      const [key, value] = entries[i];

      if (value === null) {
        qb.andWhere(`${key} IS NULL`);
      } else if (Array.isArray(value)) {
        const placeholders = value.map(() => "?").join(", ");
        qb.andWhere(`${key} IN (${placeholders})`, ...value);
      } else {
        qb.andWhere(`${key} = ?`, value);
      }
    }
  }
}
