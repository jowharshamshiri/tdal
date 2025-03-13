/**
 * SQLite-specific query builder implementation
 */

import {
	DatabaseAdapter,
	WhereCondition,
	ConditionOperator,
	JoinOptions,
	AggregateFunction
} from "../core/types";
import {
	QueryBuilder,
	UpdateQueryBuilder,
	InsertQueryBuilder,
	DeleteQueryBuilder,
	queryHelpers
} from "./query-builder";

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
	private unionQueries: Array<{ builder: QueryBuilder; all: boolean }> = [];
	private queryParams: unknown[] = [];

	/**
	 * Constructor
	 * @param adapter Database adapter
	 */
	constructor(private adapter: DatabaseAdapter) { }

	/**
	 * Get access to the select fields array
	 * Used by the aggregate method to save/restore state
	 */
	getSelect(): string[] {
		return this.selectFields;
	}

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
	where(condition: WhereCondition | string, ...params: unknown[]): QueryBuilder {
		this.whereConditions = []; // Reset where conditions

		if (typeof condition === "string") {
			this.whereConditions.push(`(${condition})`);
			this.queryParams.push(...params);
		} else {
			const { sql, params: conditionParams } = this.processWhereCondition(condition);
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
	andWhere(condition: WhereCondition | string, ...params: unknown[]): QueryBuilder {
		if (this.whereConditions.length === 0) {
			return this.where(condition, ...params);
		}

		if (typeof condition === "string") {
			this.whereConditions.push(`AND (${condition})`);
			this.queryParams.push(...params);
		} else {
			const { sql, params: conditionParams } = this.processWhereCondition(condition);
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
	orWhere(condition: WhereCondition | string, ...params: unknown[]): QueryBuilder {
		if (this.whereConditions.length === 0) {
			return this.where(condition, ...params);
		}

		if (typeof condition === "string") {
			this.whereConditions.push(`OR (${condition})`);
			this.queryParams.push(...params);
		} else {
			const { sql, params: conditionParams } = this.processWhereCondition(condition);
			this.whereConditions.push(`OR (${sql})`);
			this.queryParams.push(...conditionParams);
		}

		return this;
	}

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
	): QueryBuilder {
		return this.where({ field: column, operator, value });
	}

	/**
	 * Add a WHERE condition with raw SQL expression
	 * @param expression SQL expression
	 * @param params Optional parameters for the expression
	 * @returns Query builder instance for chaining
	 */
	whereExpression(
		expression: string,
		...params: unknown[]
	): QueryBuilder {
		return this.where(expression, ...params);
	}

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
		position: "start" | "end" | "both" | "none" = "both"
	): QueryBuilder {
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
			default:
				pattern = `%${searchText}%`;
		}
		return this.where(`${column} LIKE ?`, pattern);
	}

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
		position: "start" | "end" | "both" | "none" = "both"
	): QueryBuilder {
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
			default:
				pattern = `%${searchText}%`;
		}
		return this.orWhere(`${column} LIKE ?`, pattern);
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
		type: "INNER" | "LEFT" | "RIGHT" | "FULL",
		table: string,
		alias: string,
		condition: string,
		...params: unknown[]
	): QueryBuilder {
		// SQLite doesn't support RIGHT JOIN or FULL JOIN
		// Convert RIGHT JOIN to LEFT JOIN with reversed condition
		if (type === "RIGHT") {
			console.warn(
				"SQLite doesn't support RIGHT JOIN, converting to LEFT JOIN."
			);
			type = "LEFT";
			// Note: We're not automatically reversing the condition as it can be complex
			// The caller should provide the correct condition
		} else if (type === "FULL") {
			console.warn(
				"SQLite doesn't support FULL JOIN, converting to LEFT JOIN."
			);
			type = "LEFT";
			// Full outer joins are more complex to emulate, would need UNION
		}

		this.joinClauses.push(`${type} JOIN ${table} ${alias} ON ${condition}`);
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
	): QueryBuilder {
		return this.join("FULL", table, alias, condition, ...params);
	}

	/**
	 * Add a JOIN clause with an options object
	 * @param options Join options
	 * @returns Query builder instance for chaining
	 */
	joinWith(options: JoinOptions): QueryBuilder {
		return this.join(
			options.type,
			options.table,
			options.alias || options.table,
			options.on,
			...(options.params || [])
		);
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
	 * Add a UNION with another query
	 * @param queryBuilder The query to union with
	 * @returns Query builder instance for chaining
	 */
	union(queryBuilder: QueryBuilder): QueryBuilder {
		this.unionQueries.push({ builder: queryBuilder, all: false });
		return this;
	}

	/**
	 * Add a UNION ALL with another query
	 * @param queryBuilder The query to union with
	 * @returns Query builder instance for chaining
	 */
	unionAll(queryBuilder: QueryBuilder): QueryBuilder {
		this.unionQueries.push({ builder: queryBuilder, all: true });
		return this;
	}

	/**
	 * Add an EXISTS subquery condition
	 * @param queryBuilder The subquery
	 * @param not Whether to negate the condition (NOT EXISTS)
	 * @returns Query builder instance for chaining
	 */
	exists(queryBuilder: QueryBuilder, not: boolean = false): QueryBuilder {
		const existsClause = not
			? `NOT EXISTS (${queryBuilder.getQuery()})`
			: `EXISTS (${queryBuilder.getQuery()})`;

		if (this.whereConditions.length === 0) {
			this.whereConditions.push(`(${existsClause})`);
		} else {
			this.whereConditions.push(`AND (${existsClause})`);
		}

		this.queryParams.push(...queryBuilder.getParameters());
		return this;
	}

	/**
	 * Add an IN subquery condition
	 * @param field The field to check
	 * @param queryBuilder The subquery providing values
	 * @param not Whether to negate the condition (NOT IN)
	 * @returns Query builder instance for chaining
	 */
	inSubquery(field: string, queryBuilder: QueryBuilder, not: boolean = false): QueryBuilder {
		const inClause = not
			? `${field} NOT IN (${queryBuilder.getQuery()})`
			: `${field} IN (${queryBuilder.getQuery()})`;

		if (this.whereConditions.length === 0) {
			this.whereConditions.push(`(${inClause})`);
		} else {
			this.whereConditions.push(`AND (${inClause})`);
		}

		this.queryParams.push(...queryBuilder.getParameters());
		return this;
	}


	/**
	 * Get the generated SQL query
	 * @returns SQL query string
	 */
	getQuery(): string {
		// Build the main select query
		let query = this.buildSelectQuery();

		// Add unions if any
		if (this.unionQueries.length > 0) {
			for (const union of this.unionQueries) {
				const unionType = union.all ? 'UNION ALL' : 'UNION';
				query = `(${query}) ${unionType} (${union.builder.getQuery()})`;
			}
		}

		return query;
	}

	/**
	 * Build the basic SELECT query without unions
	 * @returns SELECT query string
	 */
	private buildSelectQuery(): string {
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
		let params = [...this.queryParams];

		// Add parameters from union queries
		for (const union of this.unionQueries) {
			params = params.concat(union.builder.getParameters());
		}

		return params;
	}

	/**
	 * Convert the query to a SQL string with parameters
	 * @returns SQL query with parameter placeholders
	 */
	toSql(): string {
		return this.getQuery();
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

		const result = await this.adapter.querySingle<{ count: number }>(query, ...params);
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


	/**
	 * Add an aggregate function with optional DISTINCT
	 * Enhanced to properly handle complex expressions and CASE statements
	 * @param func Aggregate function name (COUNT, SUM, AVG, etc.)
	 * @param field Field or expression to aggregate
	 * @param alias Result alias
	 * @param distinct Whether to use DISTINCT
	 * @returns Query builder instance for chaining
	 */
	aggregate(
		func: AggregateFunction | string,
		field: string,
		alias: string,
		distinct: boolean = false
	): Promise<any[]> {
		// Save current state
		const prevSelect = [...this.selectFields];

		// For CASE expressions or other complex expressions, wrap them in parentheses
		// to ensure they're treated as expressions rather than column names
		let fieldExpr = field;
		if (field.toUpperCase().includes("CASE WHEN")) {
			fieldExpr = `(${field})`;
		}

		// Create the aggregate expression
		let expression: string;
		if (distinct && !field.includes("*")) {
			expression = `${func}(DISTINCT ${fieldExpr})`;
		} else {
			expression = `${func}(${fieldExpr})`;
		}

		// Use the select expression method to ensure proper handling
		this.selectFields = [];
		this.selectExpression(expression, alias);

		// Execute and restore original state
		const result = this.execute();
		this.selectFields = prevSelect;

		return result;
	}

	/**
	 * Improved selectExpression method
	 * Better handling of SQL expressions to avoid parameter binding issues
	 */
	selectExpression(expression: string, alias: string, ...params: unknown[]): QueryBuilder {
		// Detect complex expressions that should not be parameterized
		const isComplexExpression =
			expression.toUpperCase().includes('CASE WHEN') ||
			expression.includes('SELECT ') ||
			expression.includes('(SELECT ') ||
			expression.includes('SUM(') ||
			expression.includes('COUNT(') ||
			expression.includes('AVG(') ||
			expression.includes('MAX(') ||
			expression.includes('MIN(') ||
			expression.includes('julianday(') ||
			expression.includes('datetime(');

		if (isComplexExpression) {
			// Use selectRaw to avoid parameter binding for complex expressions
			this.selectRaw(`${expression} AS ${alias}`);
		} else {
			// For simpler expressions, use parameter binding
			this.selectRaw(`${expression} AS ${alias}`, ...params);
		}
		return this;
	}

	/**
	 * Improved whereDateColumn method
	 * Better handles date expressions in WHERE clauses
	 */
	whereDateColumn(column: string, operator: ConditionOperator, value: Date | string): QueryBuilder {
		const isDateFunction = column.includes('datetime(') || column.includes('julianday(');

		// If the column includes date functions, handle it differently
		if (isDateFunction) {
			return this.whereExpression(`${column} ${operator} ?`, value);
		}

		const dateValue = value instanceof Date ? value.toISOString() : value;
		return this.where(`${column} ${operator} ?`, dateValue);
	}

	/**
	 * New method for SQL expressions with date functions
	 * Handles common date operations in a database-agnostic way
	 */
	whereDateExpression(expression: string, ...params: unknown[]): QueryBuilder {
		// Mark the query as having date expressions to handle parameter binding correctly
		(this as any).hasDateExpressions = true;

		if (this.whereConditions.length === 0) {
			this.whereConditions.push(`(${expression})`);
		} else {
			this.whereConditions.push(`AND (${expression})`);
		}

		this.queryParams.push(...params);
		return this;
	}

	/**
	 * Helper to create CASE expressions
	 * Generates the correct SQL for CASE WHEN statements
	 */
	caseWhen(conditions: Array<{ condition: string, value: any }>, elseValue: any): string {
		let caseExpr = "CASE";

		for (const { condition, value } of conditions) {
			// Add proper quoting for string values
			const formattedValue = typeof value === 'string'
				? `'${value.replace(/'/g, "''")}'`
				: value;

			caseExpr += ` WHEN ${condition} THEN ${formattedValue}`;
		}

		// Add ELSE clause with proper quoting
		const formattedElse = typeof elseValue === 'string'
			? `'${elseValue.replace(/'/g, "''")}'`
			: elseValue;

		caseExpr += ` ELSE ${formattedElse} END`;

		return caseExpr;
	}

	/**
	 * New method for subqueries
	 * Properly handles embedding subqueries with parameters
	 */
	subquery(subqueryBuilder: QueryBuilder): string {
		// Extract the SQL from the subquery builder
		const subquerySql = subqueryBuilder.getQuery();

		// Add parameters from the subquery to the main query
		this.queryParams.push(...subqueryBuilder.getParameters());

		// Return the subquery SQL to be embedded in the main query
		return `(${subquerySql})`;
	}

	/**
	 * Enhanced execute method to handle complex queries correctly
	 */
	async execute<T>(): Promise<T[]> {
		// Check if we have complex expressions that require special handling
		const hasComplexExpressions =
			(this as any).hasDateExpressions ||
			this.selectFields.some(field =>
				field.includes('CASE WHEN') ||
				field.includes('SELECT') ||
				field.includes('SUM(') ||
				field.includes('datetime(') ||
				field.includes('julianday(')
			);

		const query = this.getQuery();
		const params = this.getParameters();

		if (hasComplexExpressions) {
			// For complex queries, use the raw query method
			return this.adapter.query<T>(query, ...params);
		} else {
			// For standard queries, use the normal execute path
			return this.adapter.query<T>(query, ...params);
		}
	}
}

/**
 * SQLite update query builder implementation
 */
export class SQLiteUpdateQueryBuilder implements UpdateQueryBuilder {
	private tableName = "";
	private tableAlias = "";
	private setValues: Record<string, unknown> = {};
	private whereConditions: string[] = [];
	private joinClauses: string[] = [];
	private limitValue?: number;
	private returningColumns: string[] = [];
	private queryParams: unknown[] = [];

	/**
	 * Constructor
	 * @param adapter Database adapter
	 */
	constructor(private adapter: DatabaseAdapter) { }

	/**
	 * Set the table to update
	 * @param table Table name
	 * @param alias Table alias
	 * @returns Update query builder instance for chaining
	 */
	table(table: string, alias?: string): UpdateQueryBuilder {
		this.tableName = table;
		this.tableAlias = alias || "";
		return this;
	}

	/**
	 * Set the values to update
	 * @param values Record with column values
	 * @returns Update query builder instance for chaining
	 */
	set(values: Record<string, unknown>): UpdateQueryBuilder {
		this.setValues = { ...values };
		return this;
	}

	/**
	 * Add a WHERE condition
	 * @param condition Condition object or raw condition string
	 * @param params Optional parameters for parameterized conditions
	 * @returns Update query builder instance for chaining
	 */
	where(condition: WhereCondition | string, ...params: unknown[]): UpdateQueryBuilder {
		this.whereConditions = []; // Reset where conditions

		if (typeof condition === "string") {
			this.whereConditions.push(`(${condition})`);
			this.queryParams.push(...params);
		} else {
			const { sql, params: conditionParams } = this.processWhereCondition(condition);
			this.whereConditions.push(`(${sql})`);
			this.queryParams.push(...conditionParams);
		}

		return this;
	}

	/**
	 * Add an AND WHERE condition
	 * @param condition Condition object or raw condition string
	 * @param params Optional parameters for parameterized conditions
	 * @returns Update query builder instance for chaining
	 */
	andWhere(condition: WhereCondition | string, ...params: unknown[]): UpdateQueryBuilder {
		if (this.whereConditions.length === 0) {
			return this.where(condition, ...params);
		}

		if (typeof condition === "string") {
			this.whereConditions.push(`AND (${condition})`);
			this.queryParams.push(...params);
		} else {
			const { sql, params: conditionParams } = this.processWhereCondition(condition);
			this.whereConditions.push(`AND (${sql})`);
			this.queryParams.push(...conditionParams);
		}

		return this;
	}

	/**
	 * Add an OR WHERE condition
	 * @param condition Condition object or raw condition string
	 * @param params Optional parameters for parameterized conditions
	 * @returns Update query builder instance for chaining
	 */
	orWhere(condition: WhereCondition | string, ...params: unknown[]): UpdateQueryBuilder {
		if (this.whereConditions.length === 0) {
			return this.where(condition, ...params);
		}

		if (typeof condition === "string") {
			this.whereConditions.push(`OR (${condition})`);
			this.queryParams.push(...params);
		} else {
			const { sql, params: conditionParams } = this.processWhereCondition(condition);
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
	 * @returns Update query builder instance for chaining
	 */
	join(
		type: "INNER" | "LEFT" | "RIGHT" | "FULL",
		table: string,
		alias: string,
		condition: string,
		...params: unknown[]
	): UpdateQueryBuilder {
		// SQLite UPDATE with JOIN requires special handling
		// We will convert it to a subquery in getQuery()
		this.joinClauses.push(`${type} JOIN ${table} ${alias} ON ${condition}`);
		this.queryParams.push(...params);

		return this;
	}

	/**
	 * Set a LIMIT clause
	 * @param limit Maximum number of rows to update
	 * @returns Update query builder instance for chaining
	 */
	limit(limit: number): UpdateQueryBuilder {
		this.limitValue = limit;
		return this;
	}

	/**
	 * Set the columns to return after update
	 * @param columns Columns to return
	 * @returns Update query builder instance for chaining
	 */
	returning(columns: string | string[]): UpdateQueryBuilder {
		if (typeof columns === "string") {
			this.returningColumns = [columns];
		} else {
			this.returningColumns = columns;
		}
		return this;
	}

	/**
	 * Get the generated SQL query
	 * @returns SQL query string
	 */
	getQuery(): string {
		// Validate we have a table and values
		if (!this.tableName) {
			throw new Error("Table name must be specified for UPDATE");
		}

		if (Object.keys(this.setValues).length === 0) {
			throw new Error("SET values must be specified for UPDATE");
		}

		// SQLite doesn't support UPDATE with JOIN directly
		// For JOINs, we'll need to use a subquery approach
		if (this.joinClauses.length > 0) {
			return this.getQueryWithJoins();
		}

		// Generate the SET clause
		const setClause = Object.entries(this.setValues)
			.map(([column, _]) => `${column} = ?`)
			.join(", ");

		// Build the basic UPDATE query
		let query = `UPDATE ${this.tableName}`;

		// Add alias if provided
		if (this.tableAlias) {
			query += ` ${this.tableAlias}`;
		}

		query += ` SET ${setClause}`;

		// Add where conditions
		if (this.whereConditions.length > 0) {
			query += ` WHERE ${this.whereConditions.join(" ")}`;
		}

		// Add limit (SQLite supports LIMIT clause in UPDATE since version 3.25.0)
		if (this.limitValue !== undefined) {
			query += ` LIMIT ${this.limitValue}`;
		}

		return query;
	}

	/**
	 * Get a query that handles JOINs (using a subquery approach)
	 * @returns SQL query with JOINs
	 */
	private getQueryWithJoins(): string {
		// SQLite doesn't support JOINs in UPDATE directly
		// We need to use a subquery approach

		// The basic approach is to create a subquery that selects the IDs
		// of records to update, then use that in the WHERE clause
		const primaryKey = 'rowid'; // Using rowid as default, should be overridden

		// Start building the subquery
		let subquery = `SELECT ${this.tableAlias || this.tableName}.${primaryKey} FROM ${this.tableName}`;

		// Add alias if provided
		if (this.tableAlias) {
			subquery += ` ${this.tableAlias}`;
		}

		// Add joins
		if (this.joinClauses.length > 0) {
			subquery += ` ${this.joinClauses.join(" ")}`;
		}

		// Add where conditions
		if (this.whereConditions.length > 0) {
			subquery += ` WHERE ${this.whereConditions.join(" ")}`;
		}

		// Build the main query using the subquery
		const setClause = Object.entries(this.setValues)
			.map(([column, _]) => `${column} = ?`)
			.join(", ");

		let query = `UPDATE ${this.tableName} SET ${setClause}`;
		query += ` WHERE ${primaryKey} IN (${subquery})`;

		// Add limit (SQLite supports LIMIT clause in UPDATE since version 3.25.0)
		if (this.limitValue !== undefined) {
			query += ` LIMIT ${this.limitValue}`;
		}

		return query;
	}

	/**
	 * Get the parameters for the query
	 * @returns Array of parameter values
	 */
	getParameters(): unknown[] {
		// First add the SET values
		const setParams = Object.values(this.setValues);

		// Then add the WHERE parameters
		return [...setParams, ...this.queryParams];
	}

	/**
	 * Convert the query to a SQL string with parameters
	 * @returns SQL query with parameter placeholders
	 */
	toSql(): string {
		return this.getQuery();
	}

	/**
	 * Execute the update query
	 * @returns Promise resolving to the number of affected rows
	 */
	async execute(): Promise<number> {
		const query = this.getQuery();
		const params = this.getParameters();
		const result = await this.adapter.execute(query, ...params);
		return result.changes || 0;
	}

	/**
	 * Execute the update query and return updated rows
	 * SQLite doesn't support RETURNING clause, so we emulate it
	 * @returns Promise resolving to the updated rows
	 */
	async executeAndReturn<T>(): Promise<T[]> {
		if (this.returningColumns.length === 0) {
			this.returningColumns = ["*"];
		}

		// First perform the update
		const changes = await this.execute();

		if (changes === 0) {
			return [];
		}

		// Then fetch the updated rows
		// This would ideally use the same transaction, but for now we're just querying
		const selectBuilder = new SQLiteQueryBuilder(this.adapter);
		selectBuilder.select(this.returningColumns);
		selectBuilder.from(this.tableName);

		// Add the same where conditions
		if (this.whereConditions.length > 0) {
			for (let i = 0; i < this.whereConditions.length; i++) {
				const condition = this.whereConditions[i];
				if (i === 0) {
					selectBuilder.where(condition.replace(/^AND |^OR /, ''));
				} else {
					// Remove the AND/OR prefix before adding
					if (condition.startsWith('AND ')) {
						selectBuilder.andWhere(condition.substring(4));
					} else if (condition.startsWith('OR ')) {
						selectBuilder.orWhere(condition.substring(3));
					} else {
						selectBuilder.andWhere(condition);
					}
				}
			}
		}

		return selectBuilder.execute<T>();
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
 * SQLite insert query builder implementation
 */
export class SQLiteInsertQueryBuilder implements InsertQueryBuilder {
	private tableName = "";
	private insertValues: Record<string, unknown> | Record<string, unknown>[] = {};
	private returningColumns: string[] = [];
	private conflictOptions: {
		columns: string[];
		action: 'ignore' | 'update';
		updateValues?: Record<string, unknown>;
	} | null = null;

	/**
	 * Constructor
	 * @param adapter Database adapter
	 */
	constructor(private adapter: DatabaseAdapter) { }

	/**
	 * Set the table to insert into
	 * @param table Table name
	 * @returns Insert query builder instance for chaining
	 */
	into(table: string): InsertQueryBuilder {
		this.tableName = table;
		return this;
	}

	/**
	 * Set the values to insert
	 * @param values Record with column values or array of records for bulk insert
	 * @returns Insert query builder instance for chaining
	 */
	values(
		values: Record<string, unknown> | Record<string, unknown>[]
	): InsertQueryBuilder {
		this.insertValues = values;
		return this;
	}

	/**
	 * Set the columns to return after insert
	 * @param columns Columns to return
	 * @returns Insert query builder instance for chaining
	 */
	returning(columns: string | string[]): InsertQueryBuilder {
		if (typeof columns === "string") {
			this.returningColumns = [columns];
		} else {
			this.returningColumns = columns;
		}
		return this;
	}

	/**
	 * Add ON CONFLICT clause (for SQLite/PostgreSQL) or ON DUPLICATE KEY UPDATE (for MySQL)
	 * @param columns Columns that may conflict
	 * @param action Action to take on conflict ('ignore' or 'update')
	 * @param updateValues Values to update on conflict (only with 'update' action)
	 * @returns Insert query builder instance for chaining
	 */
	onConflict(
		columns: string | string[],
		action: 'ignore' | 'update',
		updateValues?: Record<string, unknown>
	): InsertQueryBuilder {
		this.conflictOptions = {
			columns: Array.isArray(columns) ? columns : [columns],
			action,
			updateValues
		};
		return this;
	}

	/**
	 * Get the generated SQL query
	 * @returns SQL query string
	 */
	getQuery(): string {
		// Validate we have a table and values
		if (!this.tableName) {
			throw new Error("Table name must be specified for INSERT");
		}

		if (Array.isArray(this.insertValues) && this.insertValues.length === 0) {
			throw new Error("INSERT values cannot be empty");
		} else if (!Array.isArray(this.insertValues) && Object.keys(this.insertValues).length === 0) {
			throw new Error("INSERT values cannot be empty");
		}

		// Handle single record vs. multiple records
		let query: string;
		if (Array.isArray(this.insertValues)) {
			query = this.getBulkInsertQuery();
		} else {
			query = this.getSingleInsertQuery();
		}

		// Add ON CONFLICT clause if specified
		if (this.conflictOptions) {
			query += this.getConflictClause();
		}

		return query;
	}

	/**
	 * Get query for single record insert
	 * @returns SQL query for single record insert
	 */
	private getSingleInsertQuery(): string {
		const values = this.insertValues as Record<string, unknown>;
		const columns = Object.keys(values);
		const placeholders = columns.map(() => "?").join(", ");

		return `INSERT INTO ${this.tableName} (${columns.join(", ")}) VALUES (${placeholders})`;
	}

	/**
	 * Get query for bulk insert
	 * @returns SQL query for bulk insert
	 */
	private getBulkInsertQuery(): string {
		const records = this.insertValues as Record<string, unknown>[];
		const columns = Object.keys(records[0]);

		// Create placeholders for each record
		const recordPlaceholders = records.map(() =>
			`(${columns.map(() => "?").join(", ")})`
		).join(", ");

		return `INSERT INTO ${this.tableName} (${columns.join(", ")}) VALUES ${recordPlaceholders}`;
	}

	/**
	 * Get ON CONFLICT clause
	 * @returns ON CONFLICT clause
	 */
	private getConflictClause(): string {
		if (!this.conflictOptions) return '';

		const { columns, action, updateValues } = this.conflictOptions;

		// Build the conflict target
		const conflictTarget = columns.join(", ");

		if (action === 'ignore') {
			return ` ON CONFLICT(${conflictTarget}) DO NOTHING`;
		} else if (action === 'update' && updateValues) {
			const updateClause = Object.keys(updateValues)
				.map(column => `${column} = ?`)
				.join(", ");

			return ` ON CONFLICT(${conflictTarget}) DO UPDATE SET ${updateClause}`;
		}

		return '';
	}

	/**
	 * Get the parameters for the query
	 * @returns Array of parameter values
	 */
	getParameters(): unknown[] {
		const params: unknown[] = [];

		// Add INSERT parameters
		if (Array.isArray(this.insertValues)) {
			// For bulk insert, flatten all values
			for (const record of this.insertValues) {
				params.push(...Object.values(record));
			}
		} else {
			// For single insert, just add the values
			params.push(...Object.values(this.insertValues));
		}

		// Add ON CONFLICT parameters if needed
		if (this.conflictOptions?.action === 'update' && this.conflictOptions.updateValues) {
			params.push(...Object.values(this.conflictOptions.updateValues));
		}

		return params;
	}

	/**
	 * Convert the query to a SQL string with parameters
	 * @returns SQL query with parameter placeholders
	 */
	toSql(): string {
		return this.getQuery();
	}

	/**
	 * Execute the insert query
	 * @returns Promise resolving to the insert ID
	 */
	async execute(): Promise<number> {
		const query = this.getQuery();
		const params = this.getParameters();
		const result = await this.adapter.execute(query, ...params);
		return result.lastInsertRowid || 0;
	}

	/**
	 * Execute the insert query and return inserted rows
	 * SQLite doesn't support RETURNING clause, so we emulate it
	 * @returns Promise resolving to the inserted rows
	 */
	async executeAndReturn<T>(): Promise<T[]> {
		if (this.returningColumns.length === 0) {
			this.returningColumns = ["*"];
		}

		// First perform the insert
		const insertId = await this.execute();

		if (insertId === 0) {
			return [];
		}

		// Then fetch the inserted rows
		// For a single record, we can just fetch by ID
		if (!Array.isArray(this.insertValues)) {
			const selectBuilder = new SQLiteQueryBuilder(this.adapter);
			selectBuilder.select(this.returningColumns);
			selectBuilder.from(this.tableName);
			selectBuilder.where("rowid = ?", insertId);

			return selectBuilder.execute<T>();
		}

		// For multiple records, we need to be more careful
		// This is an approximation and might not work reliably for all cases
		const recordCount = (this.insertValues as Record<string, unknown>[]).length;

		const selectBuilder = new SQLiteQueryBuilder(this.adapter);
		selectBuilder.select(this.returningColumns);
		selectBuilder.from(this.tableName);
		selectBuilder.where("rowid BETWEEN ? AND ?", insertId - recordCount + 1, insertId);

		return selectBuilder.execute<T>();
	}
}

/**
 * SQLite delete query builder implementation
 */
export class SQLiteDeleteQueryBuilder implements DeleteQueryBuilder {
	private tableName = "";
	private tableAlias = "";
	private whereConditions: string[] = [];
	private joinClauses: string[] = [];
	private limitValue?: number;
	private returningColumns: string[] = [];
	private queryParams: unknown[] = [];

	/**
	 * Constructor
	 * @param adapter Database adapter
	 */
	constructor(private adapter: DatabaseAdapter) { }

	/**
	 * Set the table to delete from
	 * @param table Table name
	 * @param alias Optional table alias
	 * @returns Delete query builder instance for chaining
	 */
	from(table: string, alias?: string): DeleteQueryBuilder {
		this.tableName = table;
		this.tableAlias = alias || "";
		return this;
	}

	/**
	 * Add a WHERE condition
	 * @param condition Condition object or raw condition string
	 * @param params Optional parameters for parameterized conditions
	 * @returns Delete query builder instance for chaining
	 */
	where(condition: WhereCondition | string, ...params: unknown[]): DeleteQueryBuilder {
		this.whereConditions = []; // Reset where conditions

		if (typeof condition === "string") {
			this.whereConditions.push(`(${condition})`);
			this.queryParams.push(...params);
		} else {
			const { sql, params: conditionParams } = this.processWhereCondition(condition);
			this.whereConditions.push(`(${sql})`);
			this.queryParams.push(...conditionParams);
		}

		return this;
	}

	/**
	 * Add an AND WHERE condition
	 * @param condition Condition object or raw condition string
	 * @param params Optional parameters for parameterized conditions
	 * @returns Delete query builder instance for chaining
	 */
	andWhere(condition: WhereCondition | string, ...params: unknown[]): DeleteQueryBuilder {
		if (this.whereConditions.length === 0) {
			return this.where(condition, ...params);
		}

		if (typeof condition === "string") {
			this.whereConditions.push(`AND (${condition})`);
			this.queryParams.push(...params);
		} else {
			const { sql, params: conditionParams } = this.processWhereCondition(condition);
			this.whereConditions.push(`AND (${sql})`);
			this.queryParams.push(...conditionParams);
		}

		return this;
	}

	/**
	 * Add an OR WHERE condition
	 * @param condition Condition object or raw condition string
	 * @param params Optional parameters for parameterized conditions
	 * @returns Delete query builder instance for chaining
	 */
	orWhere(condition: WhereCondition | string, ...params: unknown[]): DeleteQueryBuilder {
		if (this.whereConditions.length === 0) {
			return this.where(condition, ...params);
		}

		if (typeof condition === "string") {
			this.whereConditions.push(`OR (${condition})`);
			this.queryParams.push(...params);
		} else {
			const { sql, params: conditionParams } = this.processWhereCondition(condition);
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
	 * @returns Delete query builder instance for chaining
	 */
	join(
		type: "INNER" | "LEFT",
		table: string,
		alias: string,
		condition: string,
		...params: unknown[]
	): DeleteQueryBuilder {
		// SQLite DELETE with JOIN requires special handling
		// We will convert it to a subquery in getQuery()
		this.joinClauses.push(`${type} JOIN ${table} ${alias} ON ${condition}`);
		this.queryParams.push(...params);

		return this;
	}

	/**
	 * Set a LIMIT clause
	 * @param limit Maximum number of rows to delete
	 * @returns Delete query builder instance for chaining
	 */
	limit(limit: number): DeleteQueryBuilder {
		this.limitValue = limit;
		return this;
	}

	/**
	 * Set the columns to return after delete
	 * @param columns Columns to return
	 * @returns Delete query builder instance for chaining
	 */
	returning(columns: string | string[]): DeleteQueryBuilder {
		if (typeof columns === "string") {
			this.returningColumns = [columns];
		} else {
			this.returningColumns = columns;
		}
		return this;
	}

	/**
	 * Get the generated SQL query
	 * @returns SQL query string
	 */
	getQuery(): string {
		// Validate we have a table
		if (!this.tableName) {
			throw new Error("Table name must be specified for DELETE");
		}

		// SQLite doesn't support DELETE with JOIN directly
		// For JOINs, we'll need to use a subquery approach
		if (this.joinClauses.length > 0) {
			return this.getQueryWithJoins();
		}

		// Build the basic DELETE query
		let query = `DELETE FROM ${this.tableName}`;

		// Add where conditions
		if (this.whereConditions.length > 0) {
			query += ` WHERE ${this.whereConditions.join(" ")}`;
		}

		// Add limit
		if (this.limitValue !== undefined) {
			query += ` LIMIT ${this.limitValue}`;
		}

		return query;
	}

	/**
	 * Get a query that handles JOINs (using a subquery approach)
	 * @returns SQL query with JOINs
	 */
	private getQueryWithJoins(): string {
		// SQLite doesn't support JOINs in DELETE directly
		// We need to use a subquery approach

		// The basic approach is to create a subquery that selects the IDs
		// of records to delete, then use that in the WHERE clause
		const primaryKey = 'rowid'; // Using rowid as default, should be overridden

		// Start building the subquery
		let subquery = `SELECT ${this.tableAlias || this.tableName}.${primaryKey} FROM ${this.tableName}`;

		// Add alias if provided
		if (this.tableAlias) {
			subquery += ` ${this.tableAlias}`;
		}

		// Add joins
		if (this.joinClauses.length > 0) {
			subquery += ` ${this.joinClauses.join(" ")}`;
		}

		// Add where conditions
		if (this.whereConditions.length > 0) {
			subquery += ` WHERE ${this.whereConditions.join(" ")}`;
		}

		// Build the main query using the subquery
		let query = `DELETE FROM ${this.tableName}`;
		query += ` WHERE ${primaryKey} IN (${subquery})`;

		// Add limit
		if (this.limitValue !== undefined) {
			query += ` LIMIT ${this.limitValue}`;
		}

		return query;
	}

	/**
	 * Get the parameters for the query
	 * @returns Array of parameter values
	 */
	getParameters(): unknown[] {
		return [...this.queryParams];
	}

	/**
	 * Convert the query to a SQL string with parameters
	 * @returns SQL query with parameter placeholders
	 */
	toSql(): string {
		return this.getQuery();
	}

	/**
	 * Execute the delete query
	 * @returns Promise resolving to the number of affected rows
	 */
	async execute(): Promise<number> {
		const query = this.getQuery();
		const params = this.getParameters();
		const result = await this.adapter.execute(query, ...params);
		return result.changes || 0;
	}

	/**
	 * Execute the delete query and return deleted rows
	 * SQLite doesn't support RETURNING clause, so this is not truly possible
	 * This is a best-effort implementation that requires pre-selecting the rows
	 * @returns Promise resolving to the deleted rows
	 */
	async executeAndReturn<T>(): Promise<T[]> {
		if (this.returningColumns.length === 0) {
			this.returningColumns = ["*"];
		}

		// First select the rows that will be deleted
		const selectBuilder = new SQLiteQueryBuilder(this.adapter);
		selectBuilder.select(this.returningColumns);
		selectBuilder.from(this.tableName);

		// Add the same where conditions
		if (this.whereConditions.length > 0) {
			for (let i = 0; i < this.whereConditions.length; i++) {
				const condition = this.whereConditions[i];
				if (i === 0) {
					selectBuilder.where(condition.replace(/^AND |^OR /, ''));
				} else {
					// Remove the AND/OR prefix before adding
					if (condition.startsWith('AND ')) {
						selectBuilder.andWhere(condition.substring(4));
					} else if (condition.startsWith('OR ')) {
						selectBuilder.orWhere(condition.substring(3));
					} else {
						selectBuilder.andWhere(condition);
					}
				}
			}
		}

		// Apply any limit
		if (this.limitValue !== undefined) {
			selectBuilder.limit(this.limitValue);
		}

		// Get the rows that will be deleted
		const rowsToDelete = await selectBuilder.execute<T>();

		// Now perform the actual delete
		await this.execute();

		return rowsToDelete;
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
 * SQLite query builder factory
 */
export class SQLiteQueryBuilderFactory {
	/**
	 * Constructor
	 * @param adapter Database adapter
	 */
	constructor(private adapter: DatabaseAdapter) { }

	/**
	 * Create a SELECT query builder
	 * @param fields Optional fields to select
	 * @param params Optional parameters for field expressions
	 * @returns Query builder instance
	 */
	select(fields?: string | string[], ...params: unknown[]): QueryBuilder {
		const builder = new SQLiteQueryBuilder(this.adapter);
		if (fields) {
			builder.select(fields, ...params);
		}
		return builder;
	}

	/**
	 * Create an INSERT query builder
	 * @param table Optional table name
	 * @returns Insert query builder instance
	 */
	insert(table?: string): InsertQueryBuilder {
		const builder = new SQLiteInsertQueryBuilder(this.adapter);
		if (table) {
			builder.into(table);
		}
		return builder;
	}

	/**
	 * Create an UPDATE query builder
	 * @param table Optional table name
	 * @returns Update query builder instance
	 */
	update(table?: string): UpdateQueryBuilder {
		const builder = new SQLiteUpdateQueryBuilder(this.adapter);
		if (table) {
			builder.table(table);
		}
		return builder;
	}

	/**
	 * Create a DELETE query builder
	 * @param table Optional table name
	 * @returns Delete query builder instance
	 */
	delete(table?: string): DeleteQueryBuilder {
		const builder = new SQLiteDeleteQueryBuilder(this.adapter);
		if (table) {
			builder.from(table);
		}
		return builder;
	}
}