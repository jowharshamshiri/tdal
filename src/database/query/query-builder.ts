// Import necessary types
import {
	JoinOptions,
	WhereCondition,
	ConditionOperator,
	AggregateFunction
  } from "../core/types";
  
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
	): QueryBuilder;
  
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
	 * Add a WHERE condition on a specific column
	 * @param column Column name
	 * @param operator Condition operator
	 * @param value Value to compare against
	 * @returns Query builder instance for chaining
	 */
	whereColumn(
	  column: string,
	  operator: ConditionOperator,
	  value: unknown
	): QueryBuilder;
  
	/**
	 * Add a WHERE condition with raw SQL expression
	 * @param expression SQL expression
	 * @param params Optional parameters for the expression
	 * @returns Query builder instance for chaining
	 */
	whereExpression(
	  expression: string,
	  ...params: unknown[]
	): QueryBuilder;
  
	/**
	 * Add a WHERE condition for a date column
	 * @param column Date column name
	 * @param operator Condition operator
	 * @param value Date value to compare against
	 * @returns Query builder instance for chaining
	 */
	whereDateColumn(
	  column: string,
	  operator: ConditionOperator,
	  value: Date | string
	): QueryBuilder;
  
	/**
	 * Add a LIKE condition with automatic wildcards
	 * @param column Column name
	 * @param searchText Text to search for
	 * @param position Where to add wildcards (start, end, both, or none)
	 * @returns Query builder instance for chaining
	 */
	whereLike(
	  column: string,
	  searchText: string,
	  position?: "start" | "end" | "both" | "none"
	): QueryBuilder;
  
	/**
	 * Add an OR LIKE condition with automatic wildcards
	 * @param column Column name
	 * @param searchText Text to search for
	 * @param position Where to add wildcards (start, end, both, or none)
	 * @returns Query builder instance for chaining
	 */
	orWhereLike(
	  column: string,
	  searchText: string,
	  position?: "start" | "end" | "both" | "none"
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
	  type: "INNER" | "LEFT" | "RIGHT" | "FULL",
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
	 * Add a FULL OUTER JOIN clause
	 * @param table Table to join
	 * @param alias Table alias
	 * @param condition Join condition
	 * @param params Optional parameters for parameterized conditions
	 * @returns Query builder instance for chaining
	 */
	fullOuterJoin(
	  table: string,
	  alias: string,
	  condition: string,
	  ...params: unknown[]
	): QueryBuilder;
  
	/**
	 * Add a JOIN clause with an options object
	 * @param options Join options
	 * @returns Query builder instance for chaining
	 */
	joinWith(options: JoinOptions): QueryBuilder;
  
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
	 * Add a UNION with another query
	 * @param queryBuilder The query to union with
	 * @returns Query builder instance for chaining
	 */
	union(queryBuilder: QueryBuilder): QueryBuilder;
	
	/**
	 * Add a UNION ALL with another query
	 * @param queryBuilder The query to union with
	 * @returns Query builder instance for chaining
	 */
	unionAll(queryBuilder: QueryBuilder): QueryBuilder;
	
	/**
	 * Add an EXISTS subquery condition
	 * @param queryBuilder The subquery
	 * @param not Whether to negate the condition (NOT EXISTS)
	 * @returns Query builder instance for chaining
	 */
	exists(queryBuilder: QueryBuilder, not?: boolean): QueryBuilder;
	
	/**
	 * Add an IN subquery condition
	 * @param field The field to check
	 * @param queryBuilder The subquery providing values
	 * @param not Whether to negate the condition (NOT IN)
	 * @returns Query builder instance for chaining
	 */
	inSubquery(field: string, queryBuilder: QueryBuilder, not?: boolean): QueryBuilder;
	
	/**
	 * Calculate an aggregate value
	 * @param func The aggregate function (COUNT, SUM, AVG, etc.)
	 * @param field The field to aggregate
	 * @param alias Column alias for the result
	 * @param distinct Whether to use DISTINCT
	 * @returns Promise resolving to the aggregate results
	 */
	aggregate(
	  func: AggregateFunction | string, 
	  field: string, 
	  alias: string,
	  distinct?: boolean
	): Promise<any[]>;
  
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
   * Update query builder interface
   * For constructing UPDATE queries
   */
  export interface UpdateQueryBuilder {
	// [existing implementation]
	table(table: string, alias?: string): UpdateQueryBuilder;
	set(values: Record<string, unknown>): UpdateQueryBuilder;
	where(condition: WhereCondition | string, ...params: unknown[]): UpdateQueryBuilder;
	andWhere(condition: WhereCondition | string, ...params: unknown[]): UpdateQueryBuilder;
	orWhere(condition: WhereCondition | string, ...params: unknown[]): UpdateQueryBuilder;
	join(type: "INNER" | "LEFT" | "RIGHT" | "FULL", table: string, alias: string, condition: string, ...params: unknown[]): UpdateQueryBuilder;
	limit(limit: number): UpdateQueryBuilder;
	returning(columns: string | string[]): UpdateQueryBuilder;
	getQuery(): string;
	getParameters(): unknown[];
	toSql(): string;
	execute(): Promise<number>;
	executeAndReturn<T>(): Promise<T[]>;
  }
  
  /**
   * Insert query builder interface
   * For constructing INSERT queries
   */
  export interface InsertQueryBuilder {
	// [existing implementation]
	into(table: string): InsertQueryBuilder;
	values(values: Record<string, unknown> | Record<string, unknown>[]): InsertQueryBuilder;
	returning(columns: string | string[]): InsertQueryBuilder;
	onConflict(columns: string | string[], action: 'ignore' | 'update', updateValues?: Record<string, unknown>): InsertQueryBuilder;
	getQuery(): string;
	getParameters(): unknown[];
	toSql(): string;
	execute(): Promise<number>;
	executeAndReturn<T>(): Promise<T[]>;
  }
  
  /**
   * Delete query builder interface
   * For constructing DELETE queries
   */
  export interface DeleteQueryBuilder {
	// [existing implementation]
	from(table: string, alias?: string): DeleteQueryBuilder;
	where(condition: WhereCondition | string, ...params: unknown[]): DeleteQueryBuilder;
	andWhere(condition: WhereCondition | string, ...params: unknown[]): DeleteQueryBuilder;
	orWhere(condition: WhereCondition | string, ...params: unknown[]): DeleteQueryBuilder;
	join(type: "INNER" | "LEFT", table: string, alias: string, condition: string, ...params: unknown[]): DeleteQueryBuilder;
	limit(limit: number): DeleteQueryBuilder;
	returning(columns: string | string[]): DeleteQueryBuilder;
	getQuery(): string;
	getParameters(): unknown[];
	toSql(): string;
	execute(): Promise<number>;
	executeAndReturn<T>(): Promise<T[]>;
  }
  
  /**
   * Query builder factory interface
   * Creates different types of query builders
   */
  export interface QueryBuilderFactory {
	// [existing implementation]
	select(fields?: string | string[], ...params: unknown[]): QueryBuilder;
	insert(table?: string): InsertQueryBuilder;
	update(table?: string): UpdateQueryBuilder;
	delete(table?: string): DeleteQueryBuilder;
  }
  
  /**
   * Helper functions for query building
   */
  export const queryHelpers = {
	/**
	 * Create a placeholder string for prepared statements
	 * @param count Number of placeholders
	 * @returns Comma-separated placeholder string
	 */
	createPlaceholders: (count: number): string => {
	  return Array(count).fill("?").join(", ");
	},
  
	/**
	 * Escape a column name for use in SQL queries
	 * @param column Column name
	 * @returns Escaped column name
	 */
	escapeColumn: (column: string): string => {
	  return `"${column.replace(/"/g, '""')}"`;
	},
  
	/**
	 * Create a LIKE pattern with wildcards
	 * @param value Value to search for
	 * @param position Where to add wildcards (start, end, both, or none)
	 * @returns LIKE pattern
	 */
	createLikePattern: (
	  value: string,
	  position: "start" | "end" | "both" | "none" = "both"
	): string => {
	  switch (position) {
		case "start":
		  return `%${value}`;
		case "end":
		  return `${value}%`;
		case "both":
		  return `%${value}%`;
		case "none":
		  return value;
	  }
	},
	
	/**
	 * Format a value for use in SQL
	 * @param value The value to format
	 * @returns SQL-formatted value string
	 */
	formatValue: (value: unknown): string => {
	  if (value === null) {
		return 'NULL';
	  }
	  
	  if (typeof value === 'boolean') {
		return value ? '1' : '0';
	  }
	  
	  if (typeof value === 'number') {
		return value.toString();
	  }
	  
	  if (typeof value === 'string') {
		// Escape single quotes
		return `'${value.replace(/'/g, "''")}'`;
	  }
	  
	  if (value instanceof Date) {
		return `'${value.toISOString()}'`;
	  }
	  
	  // For arrays or objects, convert to JSON string
	  if (typeof value === 'object') {
		return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
	  }
	  
	  return `'${String(value)}'`;
	},
	
	/**
	 * Create a WHERE condition string
	 * @param field Field name
	 * @param operator Operator (=, >, <, etc.)
	 * @param value Value
	 * @returns WHERE condition string
	 */
	createCondition: (field: string, operator: string, value: unknown): string => {
	  if (value === null) {
		if (operator === '=') {
		  return `${field} IS NULL`;
		}
		if (operator === '!=') {
		  return `${field} IS NOT NULL`;
		}
	  }
	  
	  if (Array.isArray(value)) {
		if (operator === '=') {
		  return `${field} IN (${value.map(() => '?').join(', ')})`;
		}
		if (operator === '!=') {
		  return `${field} NOT IN (${value.map(() => '?').join(', ')})`;
		}
	  }
	  
	  return `${field} ${operator} ?`;
	}
  };