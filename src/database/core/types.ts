// src/database/core/types.ts
/**
 * Core database types
 * Defines the interfaces and types for database operations
 */

import { DbConnection } from "./connection-types";

/**
 * Result of database operations like INSERT/UPDATE/DELETE
 */
export interface DbQueryResult {
  /**
   * ID of the last inserted row (if applicable)
   */
  lastInsertRowid?: number;

  /**
   * Number of rows affected by the operation
   */
  changes?: number;
}

/**
 * Transaction isolation levels
 */
export enum TransactionIsolationLevel {
  /**
   * Read uncommitted isolation level
   */
  READ_UNCOMMITTED = "READ UNCOMMITTED",

  /**
   * Read committed isolation level
   */
  READ_COMMITTED = "READ COMMITTED",

  /**
   * Repeatable read isolation level
   */
  REPEATABLE_READ = "REPEATABLE READ",

  /**
   * Serializable isolation level
   */
  SERIALIZABLE = "SERIALIZABLE"
}

/**
 * Aggregate function types
 */
export type AggregateFunction = "COUNT" | "SUM" | "AVG" | "MIN" | "MAX";

/**
 * Options for joining tables in queries
 */
export interface JoinOptions {
  /**
   * Join type (INNER, LEFT, RIGHT)
   */
  type: "INNER" | "LEFT" | "RIGHT";

  /**
   * Table to join with
   */
  table: string;

  /**
   * Join condition
   */
  on: string;

  /**
   * Optional table alias
   */
  alias?: string;

  /**
   * Optional parameters for parameterized join conditions
   */
  params?: unknown[];
  
  /**
   * Nested join specification
   */
  nestedJoin?: JoinOptions;
}

/**
 * Options for find operations
 */
export interface FindOptions {
  /**
   * Fields to select (if not specified, selects all fields)
   */
  fields?: string[];
  
  /**
   * Relations to include
   */
  relations?: RelationOptions[];
}

/**
 * Options for update operations
 */
export interface UpdateOptions {
  /**
   * Maximum number of rows to update
   */
  limit?: number;
  
  /**
   * Return updated data
   */
  returning?: boolean;
}

/**
 * Options for query operations
 */
export interface QueryOptions {
  /**
   * Fields to select (if not specified, selects all fields)
   */
  fields?: string[];

  /**
   * Order by clauses
   */
  orderBy?: Array<{
    /**
     * Field to order by
     */
    field: string;

    /**
     * Order direction
     */
    direction?: "ASC" | "DESC";
  }>;

  /**
   * Maximum number of rows to return
   */
  limit?: number;

  /**
   * Number of rows to skip
   */
  offset?: number;

  /**
   * Join clauses
   */
  joins?: JoinOptions[];

  /**
   * Group by clauses
   */
  groupBy?: string[];

  /**
   * Having clause for filtering grouped results
   */
  having?: string;

  /**
   * Raw parameters for the having clause
   */
  havingParams?: unknown[];
  
  /**
   * Relations to include
   */
  relations?: RelationOptions[];
}

/**
 * Options for relational queries
 */
export interface RelationOptions {
  /**
   * Name of the relation
   */
  name: string;
  
  /**
   * Type of join to use
   */
  type: 'inner' | 'left';
  
  /**
   * Target entity mapping
   */
  mapping: {
    table: string;
    idField: string;
    entity: string;
    columns: any[];
  };
  
  /**
   * Source field for the join
   */
  sourceField?: string;
  
  /**
   * Target field for the join
   */
  targetField?: string;
  
  /**
   * Custom join condition
   */
  joinCondition?: string;
  
  /**
   * Parameters for the join condition
   */
  joinParams?: unknown[];
  
  /**
   * Alias for the joined table
   */
  alias?: string;
  
  /**
   * Nested relations to include
   */
  nestedRelations?: RelationOptions[];
}

/**
 * Options for delete operations
 */
export interface DeleteOptions {
  /**
   * Maximum number of rows to delete
   */
  limit?: number;
}

/**
 * Options for aggregate operations
 */
export interface AggregateOptions {
  /**
   * Aggregate functions to apply
   */
  aggregates: Array<{
    /**
     * Aggregate function to apply
     */
    function: AggregateFunction;
    
    /**
     * Field to aggregate
     */
    field: string;
    
    /**
     * Alias for the result
     */
    alias: string;
    
    /**
     * Whether to use DISTINCT
     */
    distinct?: boolean;
  }>;
  
  /**
   * Fields to group by
   */
  groupBy?: string[];
  
  /**
   * Conditions to filter by
   */
  conditions?: Record<string, unknown>;
  
  /**
   * Order by clauses
   */
  orderBy?: Array<{
    field: string;
    direction?: "ASC" | "DESC";
  }>;
  
  /**
   * Having clause for filtering grouped results
   */
  having?: string;
  
  /**
   * Parameters for the having clause
   */
  havingParams?: unknown[];
  
  /**
   * Maximum number of rows to return
   */
  limit?: number;
  
  /**
   * Number of rows to skip
   */
  offset?: number;
  
  /**
   * Joins to include
   */
  joins?: JoinOptions[];
  
  /**
   * Source table name (if not the default entity table)
   */
  from?: string;
}

/**
 * Condition operators for query conditions
 */
export type ConditionOperator =
  | "="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "LIKE"
  | "NOT LIKE"
  | "IN"
  | "NOT IN"
  | "IS NULL"
  | "IS NOT NULL"
  | "BETWEEN";

/**
 * Condition for query building
 */
export interface WhereCondition {
  /**
   * Field name
   */
  field: string;

  /**
   * Condition operator
   */
  operator: ConditionOperator;

  /**
   * Value to compare against
   */
  value: unknown;
}

/**
 * Query builder interface for constructing SQL queries
 */
export interface QueryBuilder {
  /**
   * Set fields to select
   */
  select(fields: string | string[], ...params: unknown[]): QueryBuilder;

  /**
   * Set a raw SQL expression to select
   */
  selectRaw(expression: string, ...params: unknown[]): QueryBuilder;
  
  /**
   * Select a calculated expression and assign it an alias
   */
  selectExpression(expression: string, alias: string, ...params: unknown[]): QueryBuilder;

  /**
   * Set the table to query from
   */
  from(table: string, alias?: string): QueryBuilder;

  /**
   * Add a WHERE condition
   */
  where(condition: WhereCondition | string, ...params: unknown[]): QueryBuilder;

  /**
   * Add an AND WHERE condition
   */
  andWhere(
    condition: WhereCondition | string,
    ...params: unknown[]
  ): QueryBuilder;

  /**
   * Add an OR WHERE condition
   */
  orWhere(
    condition: WhereCondition | string,
    ...params: unknown[]
  ): QueryBuilder;
  
  /**
   * Add a WHERE condition on a specific column
   */
  whereColumn(
    column: string,
    operator: ConditionOperator,
    value: unknown
  ): QueryBuilder;
  
  /**
   * Add a WHERE condition on a date column
   */
  whereDateColumn(
    column: string,
    operator: ConditionOperator,
    value: Date | string
  ): QueryBuilder;
  
  /**
   * Add a WHERE condition with a raw expression
   */
  whereExpression(
    expression: string,
    ...params: unknown[]
  ): QueryBuilder;
  
  /**
   * Add a LIKE condition with wildcards
   */
  whereLike(
    column: string,
    value: string,
    position?: "start" | "end" | "both" | "none"
  ): QueryBuilder;
  
  /**
   * Add an OR LIKE condition with wildcards
   */
  orWhereLike(
    column: string,
    value: string,
    position?: "start" | "end" | "both" | "none"
  ): QueryBuilder;

  /**
   * Add a JOIN clause
   */
  join(
    type: "INNER" | "LEFT" | "RIGHT",
    table: string,
    alias: string,
    condition: string,
    ...params: unknown[]
  ): QueryBuilder;

  /**
   * Add an INNER JOIN clause
   */
  innerJoin(
    table: string,
    alias: string,
    condition: string,
    ...params: unknown[]
  ): QueryBuilder;

  /**
   * Add a LEFT JOIN clause
   */
  leftJoin(
    table: string,
    alias: string,
    condition: string,
    ...params: unknown[]
  ): QueryBuilder;

  /**
   * Add a RIGHT JOIN clause
   */
  rightJoin(
    table: string,
    alias: string,
    condition: string,
    ...params: unknown[]
  ): QueryBuilder;

  /**
   * Add an ORDER BY clause
   */
  orderBy(field: string, direction?: "ASC" | "DESC"): QueryBuilder;

  /**
   * Add a GROUP BY clause
   */
  groupBy(field: string | string[]): QueryBuilder;

  /**
   * Add a HAVING clause
   */
  having(condition: string, ...params: unknown[]): QueryBuilder;

  /**
   * Set the LIMIT clause
   */
  limit(limit: number): QueryBuilder;

  /**
   * Set the OFFSET clause
   */
  offset(offset: number): QueryBuilder;
  
  /**
   * Calculate an aggregate value
   */
  aggregate(
    func: AggregateFunction,
    field: string,
    alias: string,
    distinct?: boolean
  ): Promise<any[]>;

  /**
   * Get the generated SQL query
   */
  getQuery(): string;

  /**
   * Get the parameters for the query
   */
  getParameters(): unknown[];

  /**
   * Convert query to SQL string
   */
  toSql(): string;

  /**
   * Execute the query and return multiple results
   */
  execute<T>(): Promise<T[]>;

  /**
   * Execute the query and return a single result
   */
  getOne<T>(): Promise<T | undefined>;

  /**
   * Execute a count query
   */
  getCount(): Promise<number>;
}

/**
 * Date helper functions that are database agnostic
 */
export interface DateFunctions {
  /**
   * Get current date expression
   */
  currentDate(): string;

  /**
   * Get current date and time expression
   */
  currentDateTime(): string;

  /**
   * Get date difference expression
   */
  dateDiff(
    date1: string,
    date2: string,
    unit: "day" | "month" | "year"
  ): string;

  /**
   * Get date addition expression
   */
  dateAdd(date: string, amount: number, unit: "day" | "month" | "year"): string;

  /**
   * Get date formatting expression
   */
  formatDate(date: string, format: string): string;

  /**
   * Get date validation expression
   */
  isDateValid(date: string): string;
}

/**
 * Core database adapter interface
 * Defines the methods that all database adapters must implement
 */
export interface DatabaseAdapter {
  /**
   * Connect to the database
   */
  connect(): Promise<DbConnection>;

  /**
   * Close the database connection
   */
  close(): void;

  /**
   * Begin a transaction
   */
  beginTransaction(isolationLevel?: TransactionIsolationLevel): Promise<void>;

  /**
   * Commit a transaction
   */
  commitTransaction(): Promise<void>;

  /**
   * Rollback a transaction
   */
  rollbackTransaction(): Promise<void>;

  /**
   * Execute a function within a transaction
   */
  transaction<T>(
    callback: (db: DatabaseAdapter) => Promise<T>,
    isolationLevel?: TransactionIsolationLevel
  ): Promise<T>;

  /**
   * Execute a query that returns multiple rows
   */
  query<T>(query: string, ...params: unknown[]): Promise<T[]>;

  /**
   * Execute a query that returns a single row
   */
  querySingle<T>(query: string, ...params: unknown[]): Promise<T | undefined>;

  /**
   * Execute a query that doesn't return rows (INSERT, UPDATE, DELETE)
   */
  execute(query: string, ...params: unknown[]): Promise<DbQueryResult>;

  /**
   * Execute a raw SQL script
   */
  executeScript(sql: string): Promise<void>;

  /**
   * Find a record by ID
   */
  findById<T>(
    tableName: string,
    idField: string,
    id: number | string,
    options?: FindOptions
  ): Promise<T | undefined>;

  /**
   * Find all records in a table
   */
  findAll<T>(tableName: string, options?: QueryOptions): Promise<T[]>;

  /**
   * Find records by conditions
   */
  findBy<T>(
    tableName: string,
    conditions: Record<string, unknown>,
    options?: QueryOptions
  ): Promise<T[]>;

  /**
   * Find a single record by conditions
   */
  findOneBy<T>(
    tableName: string,
    conditions: Record<string, unknown>,
    options?: FindOptions
  ): Promise<T | undefined>;

  /**
   * Count records matching conditions
   */
  count(
    tableName: string,
    conditions?: Record<string, unknown>
  ): Promise<number>;

  /**
   * Insert a record
   */
  insert<T>(tableName: string, data: Partial<T>): Promise<number>;
  
  /**
   * Bulk insert multiple records
   */
  bulkInsert<T>(tableName: string, data: Partial<T>[]): Promise<number>;

  /**
   * Update a record by ID
   */
  update<T>(
    tableName: string,
    idField: string,
    id: number | string,
    data: Partial<T>,
    options?: UpdateOptions
  ): Promise<number>;

  /**
   * Update records by conditions
   */
  updateBy<T>(
    tableName: string,
    conditions: Record<string, unknown>,
    data: Partial<T>,
    options?: UpdateOptions
  ): Promise<number>;

  /**
   * Delete a record by ID
   */
  delete(
    tableName: string,
    idField: string,
    id: number | string
  ): Promise<number>;

  /**
   * Delete records by conditions
   */
  deleteBy(
    tableName: string,
    conditions: Record<string, unknown>,
    options?: DeleteOptions
  ): Promise<number>;

  /**
   * Find records with joins
   */
  findWithJoin<T>(
    mainTable: string,
    joins: JoinOptions[],
    conditions?: Record<string, unknown>,
    options?: QueryOptions
  ): Promise<T[]>;

  /**
   * Find a single record with joins
   */
  findOneWithJoin<T>(
    mainTable: string,
    joins: JoinOptions[],
    conditions: Record<string, unknown>
  ): Promise<T | undefined>;
  
  /**
   * Check if a record exists
   */
  exists(
    tableName: string,
    conditions: Record<string, unknown>
  ): Promise<boolean>;
  
  /**
   * Calculate an aggregate value
   */
  aggregate<T>(
    tableName: string,
    options: AggregateOptions
  ): Promise<T[]>;

  /**
   * Create a query builder instance
   */
  createQueryBuilder(): QueryBuilder;

  /**
   * Get database-agnostic date functions
   */
  getDateFunctions(): DateFunctions;

  /**
   * Get diagnostic information about the database
   */
  getDatabaseInfo(): Promise<Record<string, unknown>>;
}