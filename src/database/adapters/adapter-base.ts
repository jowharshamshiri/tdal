/**
 * Abstract database adapter
 * Base class for all database system-specific adapters
 */

import {
	DatabaseAdapter,
	DbQueryResult,
	QueryOptions,
	WhereCondition,
	DateFunctions,
	JoinOptions,
	TransactionIsolationLevel,
	UpdateOptions,
	FindOptions,
	DeleteOptions,
	RelationOptions,
	AggregateOptions,
	AggregateFunction,
  } from "../core/types";
  import { DbConnection } from "../core/connection-types";
  import { EntityMapping } from "../orm/entity-mapping";
import { QueryBuilder } from "../query";
  
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
	 * @param isolationLevel Optional transaction isolation level
	 */
	abstract beginTransaction(isolationLevel?: TransactionIsolationLevel): Promise<void>;
  
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
	 * Current transaction nesting level
	 * @private
	 */
	private transactionLevel: number = 0;
  
	/**
	 * Execute a transaction
	 * @param callback Function to execute within the transaction
	 * @param isolationLevel Optional transaction isolation level
	 * @returns Result of the callback
	 */
	async transaction<T>(
	  callback: (db: DatabaseAdapter) => Promise<T>,
	  isolationLevel?: TransactionIsolationLevel
	): Promise<T> {
	  // Handle nested transactions - only start a real transaction on the outermost call
	  const isOutermostTransaction = this.transactionLevel === 0;
	  
	  try {
		this.transactionLevel++;
		
		if (isOutermostTransaction) {
		  await this.beginTransaction(isolationLevel);
		}
		
		const result = await callback(this);
		
		if (isOutermostTransaction) {
		  await this.commitTransaction();
		}
		
		return result;
	  } catch (error) {
		if (isOutermostTransaction) {
		  await this.rollbackTransaction();
		}
		throw error;
	  } finally {
		this.transactionLevel--;
	  }
	}
  
	/**
	 * Check if a transaction is currently active
	 * @returns Whether a transaction is active
	 */
	isInTransaction(): boolean {
	  return this.transactionLevel > 0;
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
	 * @param options Additional find options
	 * @returns Record or undefined if not found
	 */
	async findById<T>(
	  tableName: string,
	  idField: string,
	  id: number | string,
	  options?: FindOptions
	): Promise<T | undefined> {
	  const qb = this.createQueryBuilder();
	  
	  // Select all fields unless specific fields are requested
	  if (options?.fields && options.fields.length > 0) {
		qb.select(options.fields);
	  } else {
		qb.select(["*"]);
	  }
	  
	  // Add the base table
	  qb.from(tableName);
	  
	  // Add ID condition
	  qb.where(`${idField} = ?`, id);
	  
	  // Add relations if specified
	  if (options?.relations && options.relations.length > 0) {
		this.applyRelations(qb, tableName, options.relations);
	  }
	  
	  return qb.getOne<T>();
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
		this.applyJoins(qb, options.joins);
	  }
	  
	  // Add relations if specified
	  if (options?.relations && options.relations.length > 0) {
		this.applyRelations(qb, tableName, options.relations);
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
		this.applyJoins(qb, options.joins);
	  }
	  
	  // Add relations if specified
	  if (options?.relations && options.relations.length > 0) {
		this.applyRelations(qb, tableName, options.relations);
	  }
  
	  // Add conditions
	  this.applyConditionsToQueryBuilder(qb, conditions);
  
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
	 * @param options Additional find options
	 * @returns Record or undefined if not found
	 */
	async findOneBy<T>(
	  tableName: string,
	  conditions: Record<string, unknown>,
	  options?: FindOptions
	): Promise<T | undefined> {
	  const qb = this.createQueryBuilder();
	  
	  // Select fields if specified, otherwise select all
	  if (options?.fields && options.fields.length > 0) {
		qb.select(options.fields);
	  } else {
		qb.select(["*"]);
	  }
	  
	  qb.from(tableName);
  
	  // Add conditions
	  this.applyConditionsToQueryBuilder(qb, conditions);
	  
	  // Add relations if specified
	  if (options?.relations && options.relations.length > 0) {
		this.applyRelations(qb, tableName, options.relations);
	  }
  
	  // Always limit to 1 for findOneBy
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
		this.applyConditionsToQueryBuilder(qb, conditions);
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
	 * Bulk insert multiple records
	 * @param tableName Table name
	 * @param data Array of record data
	 * @returns Number of inserted records
	 */
	async bulkInsert<T>(tableName: string, data: Partial<T>[]): Promise<number> {
	  if (data.length === 0) return 0;
	  
	  // Get all keys from the first item
	  const keys = Object.keys(data[0]);
	  
	  // Start building the query
	  const valueGroups: string[] = [];
	  const allValues: unknown[] = [];
	  
	  // Process each data item
	  for (const item of data) {
		const values = keys.map(key => (item as any)[key]);
		const placeholders = this.getPlaceholders(values.length);
		valueGroups.push(`(${placeholders})`);
		allValues.push(...values);
	  }
	  
	  const query = `
		INSERT INTO ${tableName} (${keys.join(", ")})
		VALUES ${valueGroups.join(", ")}
	  `;
	  
	  const result = await this.execute(query, ...allValues);
	  return result.changes || 0;
	}
  
	/**
	 * Update a record by ID
	 * @param tableName Table name
	 * @param idField ID field name
	 * @param id ID value
	 * @param data Update data
	 * @param options Update options
	 * @returns Number of affected rows
	 */
	async update<T>(
	  tableName: string,
	  idField: string,
	  id: number | string,
	  data: Partial<T>,
	  options?: UpdateOptions
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
	 * @param options Update options
	 * @returns Number of affected rows
	 */
	async updateBy<T>(
	  tableName: string,
	  conditions: Record<string, unknown>,
	  data: Partial<T>,
	  options?: UpdateOptions
	): Promise<number> {
	  const keys = Object.keys(data);
	  const values = Object.values(data);
	  const setClause = keys.map((key) => `${key} = ?`).join(", ");
  
	  const qb = this.createQueryBuilder();
	  qb.from(tableName);
  
	  // Add conditions
	  this.applyConditionsToQueryBuilder(qb, conditions);
	  
	  // Add limit if specified
	  if (options?.limit) {
		qb.limit(options.limit);
	  }
  
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
	  options?: DeleteOptions
	): Promise<number> {
	  const qb = this.createQueryBuilder();
	  qb.from(tableName);
  
	  // Add conditions
	  this.applyConditionsToQueryBuilder(qb, conditions);
  
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
	  this.applyJoins(qb, joins);
  
	  // Add conditions if specified
	  if (conditions) {
		this.applyConditionsToQueryBuilder(qb, conditions);
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
	  this.applyJoins(qb, joins);
  
	  // Add conditions
	  this.applyConditionsToQueryBuilder(qb, conditions);
  
	  qb.limit(1);
  
	  return qb.getOne<T>();
	}
	
	/**
	 * Calculate an aggregate value with optional grouping
	 * @param tableName Table name
	 * @param options Aggregate options
	 * @returns Aggregate results
	 */
	async aggregate<T = Record<string, unknown>>(
	  tableName: string,
	  options: AggregateOptions
	): Promise<T[]> {
	  const qb = this.createQueryBuilder();
	  
	  // Start with the basic select, always include the group by fields in the select
	  const selectFields: string[] = [];
	  
	  // Add group by fields to select
	  if (options.groupBy && options.groupBy.length > 0) {
		selectFields.push(...options.groupBy);
	  }
	  
	  // Add aggregate functions
	  for (const agg of options.aggregates) {
		// Handle different aggregate functions
		let aggExpression: string;
		
		switch (agg.function) {
		  case "COUNT":
			aggExpression = agg.distinct 
			  ? `COUNT(DISTINCT ${agg.field})` 
			  : `COUNT(${agg.field})`;
			break;
		  case "SUM":
			aggExpression = `SUM(${agg.field})`;
			break;
		  case "AVG":
			aggExpression = `AVG(${agg.field})`;
			break;
		  case "MIN":
			aggExpression = `MIN(${agg.field})`;
			break;
		  case "MAX":
			aggExpression = `MAX(${agg.field})`;
			break;
		  default:
			throw new Error(`Unsupported aggregate function: ${agg.function}`);
		}
		
		// Add alias if provided
		if (agg.alias) {
		  aggExpression = `${aggExpression} as ${agg.alias}`;
		}
		
		selectFields.push(aggExpression);
	  }
	  
	  qb.select(selectFields).from(tableName);
	  
	  // Add conditions if provided
	  if (options.conditions) {
		this.applyConditionsToQueryBuilder(qb, options.conditions);
	  }
	  
	  // Add joins if specified
	  if (options.joins && options.joins.length > 0) {
		this.applyJoins(qb, options.joins);
	  }
	  
	  // Add group by
	  if (options.groupBy && options.groupBy.length > 0) {
		qb.groupBy(options.groupBy);
	  }
	  
	  // Add having clause if specified
	  if (options.having) {
		qb.having(options.having, ...(options.havingParams || []));
	  }
	  
	  // Add order by if specified
	  if (options.orderBy && options.orderBy.length > 0) {
		for (const order of options.orderBy) {
		  qb.orderBy(order.field, order.direction);
		}
	  }
	  
	  // Add limit and offset if specified
	  if (options.limit !== undefined) {
		qb.limit(options.limit);
		
		if (options.offset !== undefined) {
		  qb.offset(options.offset);
		}
	  }
	  
	  return qb.execute<T>();
	}
  
	/**
	 * Check if a record exists
	 * @param tableName Table name
	 * @param conditions Filter conditions
	 * @returns Whether a matching record exists
	 */
	async exists(
	  tableName: string,
	  conditions: Record<string, unknown>
	): Promise<boolean> {
	  const count = await this.count(tableName, conditions);
	  return count > 0;
	}
  
	/**
	 * Get diagnostic information about the database
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
	protected applyConditionsToQueryBuilder(
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
		if (firstValue.length === 0) {
		  qb.where("0 = 1"); // Always false for empty IN clause
		} else {
		  const placeholders = firstValue.map(() => "?").join(", ");
		  qb.where(`${firstKey} IN (${placeholders})`, ...firstValue);
		}
	  } else {
		qb.where(`${firstKey} = ?`, firstValue);
	  }
  
	  // Add remaining conditions with AND
	  for (let i = 1; i < entries.length; i++) {
		const [key, value] = entries[i];
  
		if (value === null) {
		  qb.andWhere(`${key} IS NULL`);
		} else if (Array.isArray(value)) {
		  if (value.length === 0) {
			qb.andWhere("0 = 1"); // Always false for empty IN clause
		  } else {
			const placeholders = value.map(() => "?").join(", ");
			qb.andWhere(`${key} IN (${placeholders})`, ...value);
		  }
		} else {
		  qb.andWhere(`${key} = ?`, value);
		}
	  }
	}
	
	/**
	 * Apply joins to a query builder
	 * @param qb Query builder
	 * @param joins Join specifications
	 */
	protected applyJoins(
	  qb: QueryBuilder,
	  joins: JoinOptions[]
	): void {
	  for (const join of joins) {
		qb.join(
		  join.type,
		  join.table,
		  join.alias || join.table,
		  join.on,
		  ...(join.params || [])
		);
	  }
	}
	
	/**
	 * Apply relations to a query builder
	 * @param qb Query builder
	 * @param mainTable Main table name
	 * @param relations Relation options
	 */
	protected applyRelations(
	  qb: QueryBuilder,
	  mainTable: string,
	  relations: RelationOptions[]
	): void {
	  for (const relation of relations) {
		if (!relation.mapping) {
		  throw new Error(`Relation ${relation.name} is missing entity mapping`);
		}
		
		const mapping = relation.mapping;
		const targetTable = mapping.table;
		const targetAlias = relation.alias || targetTable.charAt(0);
		
		// Determine the join type
		const joinType = relation.type === 'inner' ? 'INNER' : 'LEFT';
		
		// Build the join condition based on the relation configuration
		let joinCondition = '';
		const joinParams: unknown[] = [];
		
		if (relation.joinCondition) {
		  // Use custom join condition if provided
		  joinCondition = relation.joinCondition;
		  if (relation.joinParams) {
			joinParams.push(...relation.joinParams);
		  }
		} else if (relation.sourceField && relation.targetField) {
		  // Build a simple join condition based on fields
		  joinCondition = `${mainTable}.${relation.sourceField} = ${targetAlias}.${relation.targetField}`;
		} else {
		  throw new Error(`Relation ${relation.name} is missing join configuration`);
		}
		
		// Add the join
		qb.join(joinType, targetTable, targetAlias, joinCondition, ...joinParams);
		
		// Add any nested relations
		if (relation.nestedRelations && relation.nestedRelations.length > 0) {
		  this.applyRelations(qb, targetAlias, relation.nestedRelations);
		}
	  }
	}
  }