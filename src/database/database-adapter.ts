/**
 * Database Adapter Interface
 * Defines the interface for all database adapters
 */

import { DbQueryResult, TransactionIsolationLevel } from '../core/types';

/**
 * Database connection interface
 */
export interface DbConnection {
	/**
	 * Close the database connection
	 */
	close(): void;
}

/**
 * Database adapter interface
 * All database adapters must implement this interface
 */
export interface DatabaseAdapter {
	/**
	 * Connect to the database
	 * @returns Database connection
	 */
	connect(): Promise<DbConnection>;

	/**
	 * Close the database connection
	 */
	close(): Promise<void>;

	/**
	 * Begin a transaction
	 * @param isolationLevel Optional transaction isolation level
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
	 * @param callback Function to execute within the transaction
	 * @param isolationLevel Optional transaction isolation level
	 * @returns Result of the callback
	 */
	transaction<T>(
		callback: (db: DatabaseAdapter) => Promise<T>,
		isolationLevel?: TransactionIsolationLevel
	): Promise<T>;

	/**
	 * Execute a query that returns multiple rows
	 * @param query SQL query
	 * @param params Query parameters
	 * @returns Query results
	 */
	query<T>(query: string, ...params: unknown[]): Promise<T[]>;

	/**
	 * Execute a query that returns a single row
	 * @param query SQL query
	 * @param params Query parameters
	 * @returns Single row result or undefined
	 */
	querySingle<T>(query: string, ...params: unknown[]): Promise<T | undefined>;

	/**
	 * Execute a query that doesn't return rows (INSERT, UPDATE, DELETE)
	 * @param query SQL query
	 * @param params Query parameters
	 * @returns Query result information
	 */
	execute(query: string, ...params: unknown[]): Promise<DbQueryResult>;

	/**
	 * Execute a raw SQL script
	 * @param sql SQL script
	 */
	executeScript(sql: string): Promise<void>;

	/**
	 * Create the database schema
	 * @param schemaScript SQL schema script
	 */
	createSchema(schemaScript: string): Promise<void>;

	/**
	 * Drop all tables from the database
	 * Useful for testing
	 */
	dropAllTables(): Promise<void>;

	/**
	 * Get the table names in the database
	 * @returns Array of table names
	 */
	getTableNames(): Promise<string[]>;

	/**
	 * Get the columns for a table
	 * @param tableName Table name
	 * @returns Array of column information
	 */
	getTableColumns(tableName: string): Promise<any[]>;

	/**
	 * Get the primary key for a table
	 * @param tableName Table name
	 * @returns Primary key column name
	 */
	getPrimaryKey(tableName: string): Promise<string>;

	/**
	 * Check if a table exists
	 * @param tableName Table name
	 * @returns Whether the table exists
	 */
	tableExists(tableName: string): Promise<boolean>;

	/**
	 * Check if a column exists in a table
	 * @param tableName Table name
	 * @param columnName Column name
	 * @returns Whether the column exists
	 */
	columnExists(tableName: string, columnName: string): Promise<boolean>;

	/**
	 * Get database information
	 * @returns Database information
	 */
	getDatabaseInfo(): Promise<any>;

	/**
	 * Create a query builder
	 * @returns Query builder instance
	 */
	createQueryBuilder(): any;
}

/**
 * Base database adapter class
 * Provides common functionality
 */
export abstract class DatabaseAdapterBase implements DatabaseAdapter {
	/**
	 * Current transaction nesting level
	 */
	protected transactionLevel: number = 0;

	/**
	 * Connect to the database
	 */
	abstract connect(): Promise<DbConnection>;

	/**
	 * Close the database connection
	 */
	abstract close(): Promise<void>;

	/**
	 * Begin a transaction
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
	 * Execute a query that returns multiple rows
	 */
	abstract query<T>(query: string, ...params: unknown[]): Promise<T[]>;

	/**
	 * Execute a query that returns a single row
	 */
	abstract querySingle<T>(query: string, ...params: unknown[]): Promise<T | undefined>;

	/**
	 * Execute a query that doesn't return rows
	 */
	abstract execute(query: string, ...params: unknown[]): Promise<DbQueryResult>;

	/**
	 * Execute a raw SQL script
	 */
	abstract executeScript(sql: string): Promise<void>;

	/**
	 * Create the database schema
	 */
	abstract createSchema(schemaScript: string): Promise<void>;

	/**
	 * Drop all tables from the database
	 */
	abstract dropAllTables(): Promise<void>;

	/**
	 * Get the table names in the database
	 */
	abstract getTableNames(): Promise<string[]>;

	/**
	 * Get the columns for a table
	 */
	abstract getTableColumns(tableName: string): Promise<any[]>;

	/**
	 * Get the primary key for a table
	 */
	abstract getPrimaryKey(tableName: string): Promise<string>;

	/**
	 * Check if a table exists
	 */
	abstract tableExists(tableName: string): Promise<boolean>;

	/**
	 * Check if a column exists in a table
	 */
	abstract columnExists(tableName: string, columnName: string): Promise<boolean>;

	/**
	 * Get database information
	 */
	abstract getDatabaseInfo(): Promise<any>;

	/**
	 * Create a query builder
	 */
	abstract createQueryBuilder(): any;

	/**
	 * Execute a function within a transaction
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
	 * Check if currently in a transaction
	 * @returns Whether in a transaction
	 */
	isInTransaction(): boolean {
		return this.transactionLevel > 0;
	}

	/**
	 * Find records by ID
	 * @param tableName Table name
	 * @param idField ID field name
	 * @param id ID value
	 * @returns Record or undefined if not found
	 */
	async findById<T>(tableName: string, idField: string, id: any): Promise<T | undefined> {
		const query = `SELECT * FROM ${tableName} WHERE ${idField} = ?`;
		return this.querySingle<T>(query, id);
	}

	/**
	 * Find all records in a table
	 * @param tableName Table name
	 * @returns Array of records
	 */
	async findAll<T>(tableName: string): Promise<T[]> {
		const query = `SELECT * FROM ${tableName}`;
		return this.query<T>(query);
	}

	/**
	 * Find records by conditions
	 * @param tableName Table name
	 * @param conditions Field-value pairs to filter by
	 * @returns Array of records
	 */
	async findBy<T>(tableName: string, conditions: Record<string, any>): Promise<T[]> {
		const entries = Object.entries(conditions);
		if (entries.length === 0) {
			return this.findAll<T>(tableName);
		}

		const whereClauses = [];
		const params = [];

		for (const [field, value] of entries) {
			if (value === null) {
				whereClauses.push(`${field} IS NULL`);
			} else if (Array.isArray(value)) {
				if (value.length === 0) {
					// Empty array means no results
					return [];
				}
				const placeholders = value.map(() => '?').join(', ');
				whereClauses.push(`${field} IN (${placeholders})`);
				params.push(...value);
			} else {
				whereClauses.push(`${field} = ?`);
				params.push(value);
			}
		}

		const query = `SELECT * FROM ${tableName} WHERE ${whereClauses.join(' AND ')}`;
		return this.query<T>(query, ...params);
	}

	/**
	 * Insert a record
	 * @param tableName Table name
	 * @param data Record data
	 * @returns ID of the inserted record
	 */
	async insert<T>(tableName: string, data: Record<string, any>): Promise<number> {
		const fields = Object.keys(data);
		const placeholders = fields.map(() => '?').join(', ');
		const values = Object.values(data);

		const query = `INSERT INTO ${tableName} (${fields.join(', ')}) VALUES (${placeholders})`;
		const result = await this.execute(query, ...values);

		return result.lastInsertRowid ?? 0;
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
		id: any,
		data: Record<string, any>
	): Promise<number> {
		const fields = Object.keys(data);
		const setClauses = fields.map(field => `${field} = ?`).join(', ');
		const values = [...Object.values(data), id];

		const query = `UPDATE ${tableName} SET ${setClauses} WHERE ${idField} = ?`;
		const result = await this.execute(query, ...values);

		return result.changes ?? 0;
	}

	/**
	 * Delete a record by ID
	 * @param tableName Table name
	 * @param idField ID field name
	 * @param id ID value
	 * @returns Number of affected rows
	 */
	async delete(tableName: string, idField: string, id: any): Promise<number> {
		const query = `DELETE FROM ${tableName} WHERE ${idField} = ?`;
		const result = await this.execute(query, id);

		return result.changes ?? 0;
	}

	/**
	 * Count records in a table
	 * @param tableName Table name
	 * @param conditions Optional conditions
	 * @returns Record count
	 */
	async count(tableName: string, conditions?: Record<string, any>): Promise<number> {
		let query = `SELECT COUNT(*) AS count FROM ${tableName}`;
		const params: any[] = [];

		if (conditions && Object.keys(conditions).length > 0) {
			const whereClauses = [];

			for (const [field, value] of Object.entries(conditions)) {
				if (value === null) {
					whereClauses.push(`${field} IS NULL`);
				} else if (Array.isArray(value)) {
					if (value.length === 0) {
						// Empty array means no results
						return 0;
					}
					const placeholders = value.map(() => '?').join(', ');
					whereClauses.push(`${field} IN (${placeholders})`);
					params.push(...value);
				} else {
					whereClauses.push(`${field} = ?`);
					params.push(value);
				}
			}

			query += ` WHERE ${whereClauses.join(' AND ')}`;
		}

		const result = await this.querySingle<{ count: number }>(query, ...params);
		return result?.count ?? 0;
	}

	/**
	 * Check if a record exists
	 * @param tableName Table name
	 * @param conditions Conditions
	 * @returns Whether a record exists
	 */
	async exists(tableName: string, conditions: Record<string, any>): Promise<boolean> {
		const count = await this.count(tableName, conditions);
		return count > 0;
	}
}