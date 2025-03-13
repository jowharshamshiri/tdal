/**
 * Entity-aware query builder interface
 * Enhances the basic query builder with entity mapping awareness
 */

import { 
	ConditionOperator, 
	QueryBuilder, 
	DatabaseAdapter,
	JoinOptions,
	AggregateFunction, 
	WhereCondition
  } from "../core/types";
  import { 
	EntityMapping, 
	mapColumnToPhysical, 
	mapRecordToPhysical 
  } from "../orm/entity-mapping";
  import { 
	Relation, 
	ManyToManyRelation, 
	OneToManyRelation, 
	OneToOneRelation, 
	ManyToOneRelation, 
	findRelation, 
	isRelationType 
  } from "../orm/relation-types";
  import { DateExpressions } from "../orm/date-functions";
  
  /**
   * Entity-aware query builder
   * Provides methods that work with logical column names from entity mappings
   */
  export interface EntityQueryBuilder extends QueryBuilder {
	/**
	 * Get the entity mapping this query builder is using
	 * @returns Entity mapping
	 */
	getEntityMapping(): EntityMapping;
  
	/**
	 * Select specific logical columns from the entity
	 * @param logicalColumnNames Logical column names
	 * @returns Query builder instance for chaining
	 */
	selectColumns(logicalColumnNames: string[]): EntityQueryBuilder;
  
	/**
	 * Select a single logical column from the entity
	 * @param logicalColumnName Logical column name
	 * @returns Query builder instance for chaining
	 */
	selectColumn(logicalColumnName: string): EntityQueryBuilder;
  
	/**
	 * Add a WHERE condition using a logical column name
	 * @param logicalColumnName Logical column name
	 * @param operator Condition operator
	 * @param value Value to compare against
	 * @returns Query builder instance for chaining
	 */
	whereColumn(
	  logicalColumnName: string,
	  operator: ConditionOperator,
	  value: unknown
	): EntityQueryBuilder;
  
	/**
	 * Add an AND WHERE condition using a logical column name
	 * @param logicalColumnName Logical column name
	 * @param operator Condition operator
	 * @param value Value to compare against
	 * @returns Query builder instance for chaining
	 */
	andWhereColumn(
	  logicalColumnName: string,
	  operator: ConditionOperator,
	  value: unknown
	): EntityQueryBuilder;
  
	/**
	 * Add an OR WHERE condition using a logical column name
	 * @param logicalColumnName Logical column name
	 * @param operator Condition operator
	 * @param value Value to compare against
	 * @returns Query builder instance for chaining
	 */
	orWhereColumn(
	  logicalColumnName: string,
	  operator: ConditionOperator,
	  value: unknown
	): EntityQueryBuilder;
  
	/**
	 * Add an ORDER BY clause using a logical column name
	 * @param logicalColumnName Logical column name
	 * @param direction Sort direction
	 * @returns Query builder instance for chaining
	 */
	orderByColumn(
	  logicalColumnName: string,
	  direction?: "ASC" | "DESC"
	): EntityQueryBuilder;
  
	/**
	 * Add a GROUP BY clause using logical column names
	 * @param logicalColumnNames Logical column names
	 * @returns Query builder instance for chaining
	 */
	groupByColumns(logicalColumnNames: string[]): EntityQueryBuilder;
  
	/**
	 * Join with a related entity based on a relationship
	 * @param relationName Relationship name defined in the entity mapping
	 * @param alias Optional alias for the joined table
	 * @returns Query builder instance for chaining
	 */
	joinRelated(relationName: string, alias?: string): EntityQueryBuilder;
  
	/**
	 * Left join with a related entity based on a relationship
	 * @param relationName Relationship name defined in the entity mapping
	 * @param alias Optional alias for the joined table
	 * @returns Query builder instance for chaining
	 */
	leftJoinRelated(relationName: string, alias?: string): EntityQueryBuilder;
  
	/**
	 * Add a date-based condition using a logical column name
	 * Uses database-agnostic date expressions
	 * @param logicalColumnName Logical column name for the date field
	 * @param operator Condition operator
	 * @param value Date value to compare against
	 * @returns Query builder instance for chaining
	 */
	whereDateColumn(
	  logicalColumnName: string,
	  operator: ConditionOperator,
	  value: Date | string
	): EntityQueryBuilder;
  
	/**
	 * Add a condition comparing a date column to the current date
	 * @param logicalColumnName Logical column name for the date field
	 * @param operator Condition operator
	 * @returns Query builder instance for chaining
	 */
	whereCurrentDate(
	  logicalColumnName: string,
	  operator: ConditionOperator
	): EntityQueryBuilder;
  
	/**
	 * Add a full-text search condition for a text column
	 * @param logicalColumnName Logical column name for the text field
	 * @param searchText Text to search for
	 * @returns Query builder instance for chaining
	 */
	whereFullText(
	  logicalColumnName: string,
	  searchText: string
	): EntityQueryBuilder;
  
	/**
	 * Add a LIKE condition with automatic wildcards
	 * @param logicalColumnName Logical column name
	 * @param searchText Text to search for
	 * @param position Where to add wildcards (start, end, both, or none)
	 * @returns Query builder instance for chaining
	 */
	whereLike(
	  logicalColumnName: string,
	  searchText: string,
	  position?: "start" | "end" | "both" | "none"
	): EntityQueryBuilder;
  
	/**
	 * Add a nested condition with subquery
	 * @param callback Function that builds the subquery
	 * @returns Query builder instance for chaining
	 */
	whereSubquery(
	  callback: (subQuery: EntityQueryBuilder) => EntityQueryBuilder
	): EntityQueryBuilder;
  
	/**
	 * Select a calculated expression and assign it an alias
	 * @param expression SQL expression
	 * @param alias Column alias
	 * @param params Optional parameters for the expression
	 * @returns Query builder instance for chaining
	 */
	selectExpression(
	  expression: string,
	  alias: string,
	  ...params: unknown[]
	): EntityQueryBuilder;
	
	/**
	 * Add an aggregate function to the SELECT clause
	 * @param function Aggregate function (COUNT, SUM, AVG, MIN, MAX)
	 * @param logicalColumnName Logical column name
	 * @param alias Alias for the result
	 * @param distinct Whether to use DISTINCT
	 * @returns Query builder instance for chaining
	 */
	selectAggregate(
	  func: AggregateFunction, 
	  logicalColumnName: string, 
	  alias: string, 
	  distinct?: boolean
	): EntityQueryBuilder;
	
	/**
	 * Add a condition to check if a value exists in a subquery
	 * @param logicalColumnName Logical column name
	 * @param callback Function that builds the subquery
	 * @returns Query builder instance for chaining
	 */
	whereExists(
	  callback: (subQuery: EntityQueryBuilder) => EntityQueryBuilder
	): EntityQueryBuilder;
	
	/**
	 * Add a condition to check if a value does not exist in a subquery
	 * @param logicalColumnName Logical column name
	 * @param callback Function that builds the subquery
	 * @returns Query builder instance for chaining
	 */
	whereNotExists(
	  callback: (subQuery: EntityQueryBuilder) => EntityQueryBuilder
	): EntityQueryBuilder;
	
	/**
	 * Add a condition to check if a column is in a list of values from a subquery
	 * @param logicalColumnName Logical column name
	 * @param callback Function that builds the subquery
	 * @returns Query builder instance for chaining
	 */
	whereInSubquery(
	  logicalColumnName: string,
	  callback: (subQuery: EntityQueryBuilder) => EntityQueryBuilder
	): EntityQueryBuilder;
	
	/**
	 * Add a condition to check if a column is not in a list of values from a subquery
	 * @param logicalColumnName Logical column name
	 * @param callback Function that builds the subquery
	 * @returns Query builder instance for chaining
	 */
	whereNotInSubquery(
	  logicalColumnName: string,
	  callback: (subQuery: EntityQueryBuilder) => EntityQueryBuilder
	): EntityQueryBuilder;
  
	/**
	 * Execute the query and map the results to entity instances
	 * @returns Promise resolving to an array of entity instances
	 */
	executeAndMap<T>(): Promise<T[]>;
  
	/**
	 * Get one result and map it to an entity instance
	 * @returns Promise resolving to an entity instance or undefined
	 */
	getOneAndMap<T>(): Promise<T | undefined>;
  }
  
  /**
   * Entity-aware query builder factory
   * Creates entity-aware query builders for different entity types
   */
  export interface EntityQueryBuilderFactory {
	/**
	 * Create an entity query builder for the specified entity
	 * @param entityMapping Entity mapping
	 * @returns Entity query builder
	 */
	createEntityQueryBuilder(entityMapping: EntityMapping): EntityQueryBuilder;
  
	/**
	 * Create an entity query builder for a one-to-many relationship
	 * @param sourceMapping Source entity mapping
	 * @param relation Relationship definition
	 * @param sourceId Source entity ID
	 * @returns Entity query builder for the target entity
	 */
	createOneToManyQueryBuilder(
	  sourceMapping: EntityMapping,
	  relation: Relation,
	  sourceId: number | string
	): EntityQueryBuilder;
  
	/**
	 * Create an entity query builder for a many-to-many relationship
	 * @param sourceMapping Source entity mapping
	 * @param relation Relationship definition
	 * @param sourceId Source entity ID
	 * @returns Entity query builder for the target entity
	 */
	createManyToManyQueryBuilder(
	  sourceMapping: EntityMapping,
	  relation: Relation,
	  sourceId: number | string
	): EntityQueryBuilder;
  }
  
  /**
   * Define an abstract base class for entity query builders
   */
  export abstract class EntityQueryBuilderBase implements EntityQueryBuilder {
	whereExpression(expression: string, ...params: unknown[]): QueryBuilder {
		throw new Error("Method not implemented.");
	}
	orWhereLike(column: string, value: string, position?: "start" | "end" | "both" | "none"): QueryBuilder {
		throw new Error("Method not implemented.");
	}
	aggregate(func: AggregateFunction, field: string, alias: string, distinct?: boolean): Promise<any[]> {
		throw new Error("Method not implemented.");
	}
	/**
	 * Get the entity mapping
	 */
	abstract getEntityMapping(): EntityMapping;
  
	/**
	 * Map a logical column name to a physical column name
	 * @param logicalColumnName Logical column name
	 * @returns Physical column name
	 */
	protected abstract mapColumnName(logicalColumnName: string): string;
  
	/**
	 * Get a relationship from the entity mapping
	 * @param relationName Relationship name
	 * @returns Relation object
	 */
	protected abstract getRelation(relationName: string): Relation;
  
	// Implement the required methods from QueryBuilder and EntityQueryBuilder
	abstract select(
	  fields: string | string[],
	  ...params: unknown[]
	): QueryBuilder;
	abstract selectRaw(expression: string, ...params: unknown[]): QueryBuilder;
	abstract from(table: string, alias?: string): QueryBuilder;
	abstract where(
	  condition: string | unknown,
	  ...params: unknown[]
	): QueryBuilder;
	abstract andWhere(
	  condition: string | unknown,
	  ...params: unknown[]
	): QueryBuilder;
	abstract orWhere(
	  condition: string | unknown,
	  ...params: unknown[]
	): QueryBuilder;
	abstract join(
	  type: string,
	  table: string,
	  alias: string,
	  condition: string,
	  ...params: unknown[]
	): QueryBuilder;
	abstract innerJoin(
	  table: string,
	  alias: string,
	  condition: string,
	  ...params: unknown[]
	): QueryBuilder;
	abstract leftJoin(
	  table: string,
	  alias: string,
	  condition: string,
	  ...params: unknown[]
	): QueryBuilder;
	abstract rightJoin(
	  table: string,
	  alias: string,
	  condition: string,
	  ...params: unknown[]
	): QueryBuilder;
	abstract orderBy(field: string, direction?: string | undefined): QueryBuilder;
	abstract groupBy(fields: string | string[]): QueryBuilder;
	abstract having(condition: string, ...params: unknown[]): QueryBuilder;
	abstract limit(limit: number): QueryBuilder;
	abstract offset(offset: number): QueryBuilder;
	abstract getQuery(): string;
	abstract getParameters(): unknown[];
	abstract toSql(): string;
	abstract execute<T>(): Promise<T[]>;
	abstract getOne<T>(): Promise<T | undefined>;
	abstract getCount(): Promise<number>;
  
	// Implement entity-aware methods
	abstract selectColumns(logicalColumnNames: string[]): EntityQueryBuilder;
	abstract selectColumn(logicalColumnName: string): EntityQueryBuilder;
	abstract whereColumn(
	  logicalColumnName: string,
	  operator: ConditionOperator,
	  value: unknown
	): EntityQueryBuilder;
	abstract andWhereColumn(
	  logicalColumnName: string,
	  operator: ConditionOperator,
	  value: unknown
	): EntityQueryBuilder;
	abstract orWhereColumn(
	  logicalColumnName: string,
	  operator: ConditionOperator,
	  value: unknown
	): EntityQueryBuilder;
	abstract orderByColumn(
	  logicalColumnName: string,
	  direction?: "ASC" | "DESC"
	): EntityQueryBuilder;
	abstract groupByColumns(logicalColumnNames: string[]): EntityQueryBuilder;
	abstract joinRelated(
	  relationName: string,
	  alias?: string
	): EntityQueryBuilder;
	abstract leftJoinRelated(
	  relationName: string,
	  alias?: string
	): EntityQueryBuilder;
	abstract whereDateColumn(
	  logicalColumnName: string,
	  operator: ConditionOperator,
	  value: Date | string
	): EntityQueryBuilder;
	abstract whereCurrentDate(
	  logicalColumnName: string,
	  operator: ConditionOperator
	): EntityQueryBuilder;
	abstract whereFullText(
	  logicalColumnName: string,
	  searchText: string
	): EntityQueryBuilder;
	abstract whereLike(
	  logicalColumnName: string,
	  searchText: string,
	  position?: "start" | "end" | "both" | "none"
	): EntityQueryBuilder;
	abstract whereSubquery(
	  callback: (subQuery: EntityQueryBuilder) => EntityQueryBuilder
	): EntityQueryBuilder;
	abstract selectExpression(
	  expression: string,
	  alias: string,
	  ...params: unknown[]
	): EntityQueryBuilder;
	abstract selectAggregate(
	  func: AggregateFunction, 
	  logicalColumnName: string, 
	  alias: string, 
	  distinct?: boolean
	): EntityQueryBuilder;
	abstract whereExists(
	  callback: (subQuery: EntityQueryBuilder) => EntityQueryBuilder
	): EntityQueryBuilder;
	abstract whereNotExists(
	  callback: (subQuery: EntityQueryBuilder) => EntityQueryBuilder
	): EntityQueryBuilder;
	abstract whereInSubquery(
	  logicalColumnName: string,
	  callback: (subQuery: EntityQueryBuilder) => EntityQueryBuilder
	): EntityQueryBuilder;
	abstract whereNotInSubquery(
	  logicalColumnName: string,
	  callback: (subQuery: EntityQueryBuilder) => EntityQueryBuilder
	): EntityQueryBuilder;
	abstract executeAndMap<T>(): Promise<T[]>;
	abstract getOneAndMap<T>(): Promise<T | undefined>;
  }
  
  /**
   * Generic entity query builder implementation
   * Adapts a standard query builder to be entity-aware
   */
  export class GenericEntityQueryBuilder implements EntityQueryBuilder {
	constructor(
	  protected queryBuilder: QueryBuilder,
	  protected mapping: EntityMapping,
	  protected adapter: DatabaseAdapter
	) {}
	  whereExpression(expression: string, ...params: unknown[]): QueryBuilder {
		  throw new Error("Method not implemented.");
	  }
	  orWhereLike(column: string, value: string, position?: "start" | "end" | "both" | "none"): QueryBuilder {
		  throw new Error("Method not implemented.");
	  }
	  aggregate(func: AggregateFunction, field: string, alias: string, distinct?: boolean): Promise<any[]> {
		  throw new Error("Method not implemented.");
	  }
  
	/**
	 * Get the entity mapping
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
	  if (!this.mapping.relations) {
		throw new Error(`No relations defined for entity ${this.mapping.entity}`);
	  }
  
	  const relation = findRelation(this.mapping.relations, relationName);
	  if (!relation) {
		throw new Error(`Relation '${relationName}' not found in entity ${this.mapping.entity}`);
	  }
  
	  return relation;
	}
  
	// Delegate methods to the underlying query builder
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
  
	where(condition: string | WhereCondition, ...params: unknown[]): QueryBuilder {
	  this.queryBuilder.where(condition, ...params);
	  return this;
	}
  
	andWhere(condition: string | WhereCondition, ...params: unknown[]): QueryBuilder {
	  this.queryBuilder.andWhere(condition, ...params);
	  return this;
	}
  
	orWhere(condition: string | WhereCondition, ...params: unknown[]): QueryBuilder {
	  this.queryBuilder.orWhere(condition, ...params);
	  return this;
	}
  
	join(
	  type: "INNER" | "LEFT" | "RIGHT",
	  table: string,
	  alias: string,
	  condition: string,
	  ...params: unknown[]
	): QueryBuilder {
	  this.queryBuilder.join(type, table, alias, condition, ...params);
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
  
	getQuery(): string {
	  return this.queryBuilder.getQuery();
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
	  const physicalColumns = logicalColumnNames.map(name => this.mapColumnName(name));
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
	  const physicalColumns = logicalColumnNames.map(name => this.mapColumnName(name));
	  this.queryBuilder.groupBy(physicalColumns);
	  return this;
	}
  
	joinRelated(relationName: string, alias?: string): EntityQueryBuilder {
	  const relation = this.getRelation(relationName);
	  const targetTable = relation.targetEntity.toLowerCase();
	  const targetAlias = alias || targetTable.charAt(0);
	  const tableName = this.mapping.table;
  
	  if (isRelationType<ManyToManyRelation>(relation, "manyToMany")) {
		// For many-to-many, join the junction table first
		const junctionAlias = `j_${relationName}`;
		
		this.queryBuilder.innerJoin(
		  relation.junctionTable,
		  junctionAlias,
		  `${tableName}.${relation.sourceColumn} = ${junctionAlias}.${relation.junctionSourceColumn}`
		);
		
		// Then join the target table
		this.queryBuilder.innerJoin(
		  targetTable,
		  targetAlias,
		  `${junctionAlias}.${relation.junctionTargetColumn} = ${targetAlias}.${relation.targetColumn}`
		);
	  } else if (isRelationType<OneToManyRelation>(relation, "oneToMany")) {
		this.queryBuilder.innerJoin(
		  targetTable,
		  targetAlias,
		  `${tableName}.${relation.sourceColumn} = ${targetAlias}.${relation.targetColumn}`
		);
	  } else if (isRelationType<ManyToOneRelation>(relation, "manyToOne")) {
		this.queryBuilder.innerJoin(
		  targetTable,
		  targetAlias,
		  `${tableName}.${relation.sourceColumn} = ${targetAlias}.${relation.targetColumn}`
		);
	  } else if (isRelationType<OneToOneRelation>(relation, "oneToOne")) {
		if (relation.isOwner) {
		  this.queryBuilder.innerJoin(
			targetTable,
			targetAlias,
			`${tableName}.${relation.sourceColumn} = ${targetAlias}.${relation.targetColumn}`
		  );
		} else {
		  this.queryBuilder.innerJoin(
			targetTable,
			targetAlias,
			`${tableName}.${relation.sourceColumn} = ${targetAlias}.${relation.targetColumn}`
		  );
		}
	  }
  
	  return this;
	}
  
	leftJoinRelated(relationName: string, alias?: string): EntityQueryBuilder {
	  const relation = this.getRelation(relationName);
	  const targetTable = relation.targetEntity.toLowerCase();
	  const targetAlias = alias || targetTable.charAt(0);
	  const tableName = this.mapping.table;
  
	  if (isRelationType<ManyToManyRelation>(relation, "manyToMany")) {
		// For many-to-many, join the junction table first
		const junctionAlias = `j_${relationName}`;
		
		this.queryBuilder.leftJoin(
		  relation.junctionTable,
		  junctionAlias,
		  `${tableName}.${relation.sourceColumn} = ${junctionAlias}.${relation.junctionSourceColumn}`
		);
		
		// Then join the target table
		this.queryBuilder.leftJoin(
		  targetTable,
		  targetAlias,
		  `${junctionAlias}.${relation.junctionTargetColumn} = ${targetAlias}.${relation.targetColumn}`
		);
	  } else if (isRelationType<OneToManyRelation>(relation, "oneToMany")) {
		this.queryBuilder.leftJoin(
		  targetTable,
		  targetAlias,
		  `${tableName}.${relation.sourceColumn} = ${targetAlias}.${relation.targetColumn}`
		);
	  } else if (isRelationType<ManyToOneRelation>(relation, "manyToOne")) {
		this.queryBuilder.leftJoin(
		  targetTable,
		  targetAlias,
		  `${tableName}.${relation.sourceColumn} = ${targetAlias}.${relation.targetColumn}`
		);
	  } else if (isRelationType<OneToOneRelation>(relation, "oneToOne")) {
		if (relation.isOwner) {
		  this.queryBuilder.leftJoin(
			targetTable,
			targetAlias,
			`${tableName}.${relation.sourceColumn} = ${targetAlias}.${relation.targetColumn}`
		  );
		} else {
		  this.queryBuilder.leftJoin(
			targetTable,
			targetAlias,
			`${tableName}.${relation.sourceColumn} = ${targetAlias}.${relation.targetColumn}`
		  );
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
	  const dateValue = value instanceof Date ? value.toISOString() : value;
	  
	  this.queryBuilder.where(`${physicalColumn} ${operator} ?`, dateValue);
	  
	  return this;
	}
  
	whereCurrentDate(
	  logicalColumnName: string,
	  operator: ConditionOperator
	): EntityQueryBuilder {
	  const physicalColumn = this.mapColumnName(logicalColumnName);
	  const currentDateExpr = this.adapter.getDateFunctions().currentDate();
	  
	  this.queryBuilder.where(`${physicalColumn} ${operator} ${currentDateExpr}`);
	  
	  return this;
	}
  
	whereFullText(
	  logicalColumnName: string,
	  searchText: string
	): EntityQueryBuilder {
	  // Full-text search depends on the database engine
	  // This is a simple implementation that uses LIKE with wildcards
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
	  const subQueryBuilder = new GenericEntityQueryBuilder(
		this.adapter.createQueryBuilder(),
		this.mapping,
		this.adapter
	  );
	  
	  // Let the callback populate the subquery
	  const builtSubQuery = callback(subQueryBuilder);
	  
	  // Add the subquery to the main query
	  this.queryBuilder.where(
		`EXISTS (${builtSubQuery.getQuery()})`,
		...builtSubQuery.getParameters()
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
	
	selectAggregate(
	  func: AggregateFunction, 
	  logicalColumnName: string, 
	  alias: string, 
	  distinct: boolean = false
	): EntityQueryBuilder {
	  const physicalColumn = this.mapColumnName(logicalColumnName);
	  let expression: string;
	  
	  if (distinct) {
		expression = `${func}(DISTINCT ${physicalColumn})`;
	  } else {
		expression = `${func}(${physicalColumn})`;
	  }
	  
	  this.queryBuilder.selectRaw(`${expression} AS ${alias}`);
	  return this;
	}
	
	whereExists(
	  callback: (subQuery: EntityQueryBuilder) => EntityQueryBuilder
	): EntityQueryBuilder {
	  // Create a new entity query builder for the subquery
	  const subQueryBuilder = new GenericEntityQueryBuilder(
		this.adapter.createQueryBuilder(),
		this.mapping,
		this.adapter
	  );
	  
	  // Let the callback populate the subquery
	  const builtSubQuery = callback(subQueryBuilder);
	  
	  // Add the EXISTS condition
	  this.queryBuilder.where(
		`EXISTS (${builtSubQuery.getQuery()})`,
		...builtSubQuery.getParameters()
	  );
	  
	  return this;
	}
	
	whereNotExists(
	  callback: (subQuery: EntityQueryBuilder) => EntityQueryBuilder
	): EntityQueryBuilder {
	  // Create a new entity query builder for the subquery
	  const subQueryBuilder = new GenericEntityQueryBuilder(
		this.adapter.createQueryBuilder(),
		this.mapping,
		this.adapter
	  );
	  
	  // Let the callback populate the subquery
	  const builtSubQuery = callback(subQueryBuilder);
	  
	  // Add the NOT EXISTS condition
	  this.queryBuilder.where(
		`NOT EXISTS (${builtSubQuery.getQuery()})`,
		...builtSubQuery.getParameters()
	  );
	  
	  return this;
	}
	
	whereInSubquery(
	  logicalColumnName: string,
	  callback: (subQuery: EntityQueryBuilder) => EntityQueryBuilder
	): EntityQueryBuilder {
	  const physicalColumn = this.mapColumnName(logicalColumnName);
	  
	  // Create a new entity query builder for the subquery
	  const subQueryBuilder = new GenericEntityQueryBuilder(
		this.adapter.createQueryBuilder(),
		this.mapping,
		this.adapter
	  );
	  
	  // Let the callback populate the subquery
	  const builtSubQuery = callback(subQueryBuilder);
	  
	  // Add the IN condition
	  this.queryBuilder.where(
		`${physicalColumn} IN (${builtSubQuery.getQuery()})`,
		...builtSubQuery.getParameters()
	  );
	  
	  return this;
	}
	
	whereNotInSubquery(
	  logicalColumnName: string,
	  callback: (subQuery: EntityQueryBuilder) => EntityQueryBuilder
	): EntityQueryBuilder {
	  const physicalColumn = this.mapColumnName(logicalColumnName);
	  
	  // Create a new entity query builder for the subquery
	  const subQueryBuilder = new GenericEntityQueryBuilder(
		this.adapter.createQueryBuilder(),
		this.mapping,
		this.adapter
	  );
	  
	  // Let the callback populate the subquery
	  const builtSubQuery = callback(subQueryBuilder);
	  
	  // Add the NOT IN condition
	  this.queryBuilder.where(
		`${physicalColumn} NOT IN (${builtSubQuery.getQuery()})`,
		...builtSubQuery.getParameters()
	  );
	  
	  return this;
	}
  
	async executeAndMap<T>(): Promise<T[]> {
	  const results = await this.queryBuilder.execute<Record<string, unknown>>();
	  
	  // Map results to logical column names
	  // This would ideally use a more comprehensive mapping based on the entity definition
	  return results.map(result => {
		const mappedResult: Record<string, unknown> = {};
		
		for (const [key, value] of Object.entries(result)) {
		  // For each column in the result, find its logical name
		  const column = this.mapping.columns.find(c => c.physical === key);
		  
		  if (column) {
			// If a matching column is found, use its logical name
			mappedResult[column.logical] = value;
		  } else {
			// Otherwise, keep the original name
			mappedResult[key] = value;
		  }
		}
		
		return mappedResult as unknown as T;
	  });
	}
  
	async getOneAndMap<T>(): Promise<T | undefined> {
	  const result = await this.queryBuilder.getOne<Record<string, unknown>>();
	  
	  if (!result) {
		return undefined;
	  }
	  
	  // Map result to logical column names
	  const mappedResult: Record<string, unknown> = {};
	  
	  for (const [key, value] of Object.entries(result)) {
		// For each column in the result, find its logical name
		const column = this.mapping.columns.find(c => c.physical === key);
		
		if (column) {
		  // If a matching column is found, use its logical name
		  mappedResult[column.logical] = value;
		} else {
		  // Otherwise, keep the original name
		  mappedResult[key] = value;
		}
	  }
	  
	  return mappedResult as unknown as T;
	}
  }
  
  /**
   * Entity query builder factory
   * Creates entity-aware query builders
   */
  export class EntityQueryBuilderFactory implements EntityQueryBuilderFactory {
	constructor(private adapter: DatabaseAdapter) {}
  
	/**
	 * Create an entity query builder for the specified entity
	 * @param entityMapping Entity mapping
	 * @returns Entity query builder
	 */
	createEntityQueryBuilder(entityMapping: EntityMapping): EntityQueryBuilder {
	  const queryBuilder = this.adapter.createQueryBuilder();
	  return new GenericEntityQueryBuilder(queryBuilder, entityMapping, this.adapter);
	}
  
	/**
	 * Create an entity query builder for a one-to-many relationship
	 * @param sourceMapping Source entity mapping
	 * @param relation Relationship definition
	 * @param sourceId Source entity ID
	 * @returns Entity query builder for the target entity
	 */
	createOneToManyQueryBuilder(
	  sourceMapping: EntityMapping,
	  relation: OneToManyRelation,
	  sourceId: number | string
	): EntityQueryBuilder {
	  // This would need knowledge of the target entity mapping
	  // For now, we'll create a generic query builder
	  const queryBuilder = this.adapter.createQueryBuilder();
	  
	  // Assume the target entity has a matching mapping
	  const targetMapping: EntityMapping = {
		entity: relation.targetEntity,
		table: relation.targetEntity.toLowerCase(),
		idField: "id", // Assume a generic ID field
		columns: [
		  { logical: "id", physical: "id", primaryKey: true },
		  { logical: relation.targetColumn, physical: relation.targetColumn }
		]
	  };
	  
	  const builder = new GenericEntityQueryBuilder(queryBuilder, targetMapping, this.adapter);
	  
	  // Add the filter condition for the relationship
	  builder.from(targetMapping.table);
	  builder.where(`${relation.targetColumn} = ?`, sourceId);
	  
	  return builder;
	}
  
	/**
	 * Create an entity query builder for a many-to-many relationship
	 * @param sourceMapping Source entity mapping
	 * @param relation Relationship definition
	 * @param sourceId Source entity ID
	 * @returns Entity query builder for the target entity
	 */
	createManyToManyQueryBuilder(
	  sourceMapping: EntityMapping,
	  relation: ManyToManyRelation,
	  sourceId: number | string
	): EntityQueryBuilder {
	  // This would need knowledge of the target entity mapping
	  // For now, we'll create a generic query builder
	  const queryBuilder = this.adapter.createQueryBuilder();
	  
	  // Assume the target entity has a matching mapping
	  const targetMapping: EntityMapping = {
		entity: relation.targetEntity,
		table: relation.targetEntity.toLowerCase(),
		idField: "id", // Assume a generic ID field
		columns: [
		  { logical: "id", physical: "id", primaryKey: true },
		  { logical: relation.targetColumn, physical: relation.targetColumn }
		]
	  };
	  
	  const builder = new GenericEntityQueryBuilder(queryBuilder, targetMapping, this.adapter);
	  
	  // Set up the query with joins
	  builder.from(targetMapping.table, "t");
	  builder.innerJoin(
		relation.junctionTable, 
		"j", 
		`t.${relation.targetColumn} = j.${relation.junctionTargetColumn}`
	  );
	  
	  // Add the filter condition for the relationship
	  builder.where(`j.${relation.junctionSourceColumn} = ?`, sourceId);
	  
	  return builder;
	}
  }