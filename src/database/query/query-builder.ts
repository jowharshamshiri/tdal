/**
 * Query builder interfaces
 * Defines interfaces for constructing SQL queries
 */

import { WhereCondition } from "../core/types";

/**
 * Base query builder interface
 * Defines common methods for all query builders
 */
export interface QueryBuilder {
  /**
   * Set fields to select
   * @param fields Field names or expressions
   * @param params Optional parameters for parameterized expressions
   * @returns Query builder instance for chaining
   */
  select(fields: string | string[], ...params: unknown[]): QueryBuilder;

  /**
   * Set a raw SQL expression to select
   * @param expression Raw SQL expression
   * @param params Optional parameters for the expression
   * @returns Query builder instance for chaining
   */
  selectRaw(expression: string, ...params: unknown[]): QueryBuilder;

  /**
   * Set the table to query from
   * @param table Table name
   * @param alias Optional table alias
   * @returns Query builder instance for chaining
   */
  from(table: string, alias?: string): QueryBuilder;

  /**
   * Add a WHERE condition
   * @param condition Condition object or raw condition string
   * @param params Optional parameters for parameterized conditions
   * @returns Query builder instance for chaining
   */
  where(condition: WhereCondition | string, ...params: unknown[]): QueryBuilder;

  /**
   * Add an AND WHERE condition
   * @param condition Condition object or raw condition string
   * @param params Optional parameters for parameterized conditions
   * @returns Query builder instance for chaining
   */
  andWhere(
    condition: WhereCondition | string,
    ...params: unknown[]
  ): QueryBuilder;

  /**
   * Add an OR WHERE condition
   * @param condition Condition object or raw condition string
   * @param params Optional parameters for parameterized conditions
   * @returns Query builder instance for chaining
   */
  orWhere(
    condition: WhereCondition | string,
    ...params: unknown[]
  ): QueryBuilder;

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
  ): QueryBuilder;

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
  ): QueryBuilder;

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
  ): QueryBuilder;

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
  ): QueryBuilder;

  /**
   * Add an ORDER BY clause
   * @param field Field to order by
   * @param direction Sort direction
   * @returns Query builder instance for chaining
   */
  orderBy(field: string, direction?: "ASC" | "DESC"): QueryBuilder;

  /**
   * Add a GROUP BY clause
   * @param fields Fields to group by
   * @returns Query builder instance for chaining
   */
  groupBy(fields: string | string[]): QueryBuilder;

  /**
   * Add a HAVING clause
   * @param condition Having condition
   * @param params Optional parameters for parameterized conditions
   * @returns Query builder instance for chaining
   */
  having(condition: string, ...params: unknown[]): QueryBuilder;

  /**
   * Set a LIMIT clause
   * @param limit Maximum number of rows to return
   * @returns Query builder instance for chaining
   */
  limit(limit: number): QueryBuilder;

  /**
   * Set an OFFSET clause
   * @param offset Number of rows to skip
   * @returns Query builder instance for chaining
   */
  offset(offset: number): QueryBuilder;

  /**
   * Get the generated SQL query
   * @returns SQL query string
   */
  getQuery(): string;

  /**
   * Get the parameters for the query
   * @returns Array of parameter values
   */
  getParameters(): unknown[];

  /**
   * Convert the query to a SQL string with parameters
   * Note: This is for debugging only, not for execution
   * @returns SQL query with parameter placeholders
   */
  toSql(): string;

  /**
   * Execute the query and return multiple results
   * @returns Promise resolving to an array of results
   */
  execute<T>(): Promise<T[]>;

  /**
   * Execute the query and return a single result
   * @returns Promise resolving to a single result or undefined
   */
  getOne<T>(): Promise<T | undefined>;

  /**
   * Execute a count query
   * @returns Promise resolving to the count
   */
  getCount(): Promise<number>;
}

/**
 * Union query builder interface
 * For creating UNION queries
 */
export interface UnionQueryBuilder {
  /**
   * Add a UNION clause
   * @param queryBuilder Query builder for the union
   * @returns Union query builder instance for chaining
   */
  union(queryBuilder: QueryBuilder): UnionQueryBuilder;

  /**
   * Add a UNION ALL clause
   * @param queryBuilder Query builder for the union
   * @returns Union query builder instance for chaining
   */
  unionAll(queryBuilder: QueryBuilder): UnionQueryBuilder;

  /**
   * Add an ORDER BY clause to the union query
   * @param field Field to order by
   * @param direction Sort direction
   * @returns Union query builder instance for chaining
   */
  orderBy(field: string, direction?: "ASC" | "DESC"): UnionQueryBuilder;

  /**
   * Set a LIMIT clause for the union query
   * @param limit Maximum number of rows to return
   * @returns Union query builder instance for chaining
   */
  limit(limit: number): UnionQueryBuilder;

  /**
   * Set an OFFSET clause for the union query
   * @param offset Number of rows to skip
   * @returns Union query builder instance for chaining
   */
  offset(offset: number): UnionQueryBuilder;

  /**
   * Get the generated SQL query
   * @returns SQL query string
   */
  getQuery(): string;

  /**
   * Get the parameters for the query
   * @returns Array of parameter values
   */
  getParameters(): unknown[];

  /**
   * Execute the union query and return multiple results
   * @returns Promise resolving to an array of results
   */
  execute<T>(): Promise<T[]>;
}

/**
 * Insert query builder interface
 * For constructing INSERT queries
 */
export interface InsertQueryBuilder {
  /**
   * Set the table to insert into
   * @param table Table name
   * @returns Insert query builder instance for chaining
   */
  into(table: string): InsertQueryBuilder;

  /**
   * Set the values to insert
   * @param values Record with column values or array of records for bulk insert
   * @returns Insert query builder instance for chaining
   */
  values(
    values: Record<string, unknown> | Record<string, unknown>[]
  ): InsertQueryBuilder;

  /**
   * Set the columns to return after insert
   * @param columns Columns to return
   * @returns Insert query builder instance for chaining
   */
  returning(columns: string | string[]): InsertQueryBuilder;

  /**
   * Get the generated SQL query
   * @returns SQL query string
   */
  getQuery(): string;

  /**
   * Get the parameters for the query
   * @returns Array of parameter values
   */
  getParameters(): unknown[];

  /**
   * Execute the insert query
   * @returns Promise resolving to the insert result
   */
  execute(): Promise<number>;

  /**
   * Execute the insert query and return inserted rows
   * @returns Promise resolving to the inserted rows
   */
  executeAndReturn<T>(): Promise<T[]>;
}

/**
 * Update query builder interface
 * For constructing UPDATE queries
 */
export interface UpdateQueryBuilder {
  /**
   * Set the table to update
   * @param table Table name
   * @returns Update query builder instance for chaining
   */
  table(table: string): UpdateQueryBuilder;

  /**
   * Set the values to update
   * @param values Record with column values
   * @returns Update query builder instance for chaining
   */
  set(values: Record<string, unknown>): UpdateQueryBuilder;

  /**
   * Add a WHERE condition
   * @param condition Condition object or raw condition string
   * @param params Optional parameters for parameterized conditions
   * @returns Update query builder instance for chaining
   */
  where(
    condition: WhereCondition | string,
    ...params: unknown[]
  ): UpdateQueryBuilder;

  /**
   * Add an AND WHERE condition
   * @param condition Condition object or raw condition string
   * @param params Optional parameters for parameterized conditions
   * @returns Update query builder instance for chaining
   */
  andWhere(
    condition: WhereCondition | string,
    ...params: unknown[]
  ): UpdateQueryBuilder;

  /**
   * Add an OR WHERE condition
   * @param condition Condition object or raw condition string
   * @param params Optional parameters for parameterized conditions
   * @returns Update query builder instance for chaining
   */
  orWhere(
    condition: WhereCondition | string,
    ...params: unknown[]
  ): UpdateQueryBuilder;

  /**
   * Set a LIMIT clause
   * @param limit Maximum number of rows to update
   * @returns Update query builder instance for chaining
   */
  limit(limit: number): UpdateQueryBuilder;

  /**
   * Set the columns to return after update
   * @param columns Columns to return
   * @returns Update query builder instance for chaining
   */
  returning(columns: string | string[]): UpdateQueryBuilder;

  /**
   * Get the generated SQL query
   * @returns SQL query string
   */
  getQuery(): string;

  /**
   * Get the parameters for the query
   * @returns Array of parameter values
   */
  getParameters(): unknown[];

  /**
   * Execute the update query
   * @returns Promise resolving to the number of affected rows
   */
  execute(): Promise<number>;

  /**
   * Execute the update query and return updated rows
   * @returns Promise resolving to the updated rows
   */
  executeAndReturn<T>(): Promise<T[]>;
}

/**
 * Delete query builder interface
 * For constructing DELETE queries
 */
export interface DeleteQueryBuilder {
  /**
   * Set the table to delete from
   * @param table Table name
   * @returns Delete query builder instance for chaining
   */
  from(table: string): DeleteQueryBuilder;

  /**
   * Add a WHERE condition
   * @param condition Condition object or raw condition string
   * @param params Optional parameters for parameterized conditions
   * @returns Delete query builder instance for chaining
   */
  where(
    condition: WhereCondition | string,
    ...params: unknown[]
  ): DeleteQueryBuilder;

  /**
   * Add an AND WHERE condition
   * @param condition Condition object or raw condition string
   * @param params Optional parameters for parameterized conditions
   * @returns Delete query builder instance for chaining
   */
  andWhere(
    condition: WhereCondition | string,
    ...params: unknown[]
  ): DeleteQueryBuilder;

  /**
   * Add an OR WHERE condition
   * @param condition Condition object or raw condition string
   * @param params Optional parameters for parameterized conditions
   * @returns Delete query builder instance for chaining
   */
  orWhere(
    condition: WhereCondition | string,
    ...params: unknown[]
  ): DeleteQueryBuilder;

  /**
   * Set a LIMIT clause
   * @param limit Maximum number of rows to delete
   * @returns Delete query builder instance for chaining
   */
  limit(limit: number): DeleteQueryBuilder;

  /**
   * Set the columns to return after delete
   * @param columns Columns to return
   * @returns Delete query builder instance for chaining
   */
  returning(columns: string | string[]): DeleteQueryBuilder;

  /**
   * Get the generated SQL query
   * @returns SQL query string
   */
  getQuery(): string;

  /**
   * Get the parameters for the query
   * @returns Array of parameter values
   */
  getParameters(): unknown[];

  /**
   * Execute the delete query
   * @returns Promise resolving to the number of affected rows
   */
  execute(): Promise<number>;

  /**
   * Execute the delete query and return deleted rows
   * @returns Promise resolving to the deleted rows
   */
  executeAndReturn<T>(): Promise<T[]>;
}

/**
 * Query builder factory interface
 * Creates different types of query builders
 */
export interface QueryBuilderFactory {
  /**
   * Create a SELECT query builder
   * @returns Query builder instance
   */
  select(fields?: string | string[]): QueryBuilder;

  /**
   * Create an INSERT query builder
   * @param table Optional table name
   * @returns Insert query builder instance
   */
  insert(table?: string): InsertQueryBuilder;

  /**
   * Create an UPDATE query builder
   * @param table Optional table name
   * @returns Update query builder instance
   */
  update(table?: string): UpdateQueryBuilder;

  /**
   * Create a DELETE query builder
   * @param table Optional table name
   * @returns Delete query builder instance
   */
  delete(table?: string): DeleteQueryBuilder;

  /**
   * Create a UNION query builder
   * @param queryBuilders Query builders to union
   * @returns Union query builder instance
   */
  union(...queryBuilders: QueryBuilder[]): UnionQueryBuilder;
}
