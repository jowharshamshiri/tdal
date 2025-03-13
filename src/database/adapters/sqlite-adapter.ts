/**
 * SQLite database adapter
 * Implements the database adapter interface for SQLite
 */

import * as path from "path";
import * as fs from "fs";
import Database from "better-sqlite3";
import {
	DatabaseAdapter,
	DbQueryResult,
	DateFunctions,
	JoinOptions,
	AggregateFunction,
	AggregateOptions,
	TransactionIsolationLevel,
	FindOptions,
	QueryOptions,
	UpdateOptions,
	DeleteOptions,
	RelationOptions,
	ConditionOperator
} from "../core/types";
import { DbConnection, SQLiteConfig } from "../core/connection-types";
import { DatabaseAdapterBase } from "./adapter-base";
import { SQLiteQueryBuilder } from "../query/sqlite-query-builder";
import { QueryBuilder } from "../query";

/**
 * SQLite date functions implementation
 */
export class SQLiteDateFunctions implements DateFunctions {
	/**
	 * Get current date expression
	 */
	currentDate(): string {
		return "date('now')";
	}

	/**
	 * Get current date and time expression
	 */
	currentDateTime(): string {
		return "datetime('now')";
	}

	/**
	 * Get date difference expression
	 */
	dateDiff(
		date1: string,
		date2: string,
		unit: "day" | "month" | "year"
	): string {
		switch (unit) {
			case "day":
				return `CAST((julianday(${date1}) - julianday(${date2})) AS INTEGER)`;
			case "month":
				return `CAST(((julianday(${date1}) - julianday(${date2})) / 30) AS INTEGER)`;
			case "year":
				return `CAST(((julianday(${date1}) - julianday(${date2})) / 365) AS INTEGER)`;
			default:
				return `CAST((julianday(${date1}) - julianday(${date2})) AS INTEGER)`;
		}
	}

	/**
	 * Get date addition expression
	 */
	dateAdd(
		date: string,
		amount: number,
		unit: "day" | "month" | "year"
	): string {
		return `datetime(${date}, '+${amount} ${unit}s')`;
	}

	/**
	 * Get date formatting expression
	 */
	formatDate(date: string, format: string): string {
		// SQLite doesn't have sophisticated date formatting, we use strftime
		// with simplified format codes
		return `strftime('${format}', ${date})`;
	}

	/**
	 * Get date validation expression
	 */
	isDateValid(date: string): string {
		return `CASE WHEN datetime(${date}) IS NOT NULL THEN 1 ELSE 0 END`;
	}
}

/**
 * SQLite connection implementation
 */
export class SQLiteConnection implements DbConnection {
	/**
	 * Constructor
	 * @param db SQLite database instance
	 */
	constructor(private db: Database.Database) { }

	/**
	 * Close the database connection
	 */
	close(): void {
		if (this.db) {
			this.db.close();
		}
	}
}

/**
 * SQLite database adapter implementation
 */
export class SQLiteAdapter
	extends DatabaseAdapterBase
	implements DatabaseAdapter {
	/**
	 * SQLite database instance
	 */
	private dbInstance: Database.Database | null = null;

	/**
	 * SQLite configuration
	 */
	private config: SQLiteConfig;

	/**
	 * Whether to use the test database
	 */
	private isTestMode: boolean;

	/**
	 * Date functions implementation
	 */
	private dateFunctions: SQLiteDateFunctions;

	/**
	 * Constructor
	 * @param config SQLite configuration
	 * @param isTestMode Whether to use the test database
	 */
	constructor(config: SQLiteConfig, isTestMode = false) {
		super();

		// Create a properly merged config to avoid property overwrites
		const defaultConnection = {
			memory: false,
			filename: ":memory:",
		};

		// Handle the case where config might be undefined
		if (!config) {
			this.config = {
				type: "sqlite",
				connection: defaultConnection,
			};
		} else {
			this.config = {
				...config,
				connection: {
					...defaultConnection,
					...(config.connection || {}),
				},
			};
		}

		this.isTestMode = isTestMode;
		this.dateFunctions = new SQLiteDateFunctions();

		// Ensure database directory exists if needed
		if (!this.config.connection.memory) {
			const dbPath = this.getDbPath();
			const dbDir = path.dirname(dbPath);
			if (!fs.existsSync(dbDir)) {
				fs.mkdirSync(dbDir, { recursive: true });
			}
		}
	}

	/**
	 * Get the database file path
	 * @returns Database file path
	 */
	private getDbPath(): string {
		if (this.config.connection.memory) {
			return ":memory:";
		}

		return this.isTestMode && this.config.connection.testFilename
			? this.config.connection.testFilename
			: this.config.connection.filename;
	}

	/**
	 * Connect to the database
	 * @returns Database connection
	 */
	async connect(): Promise<DbConnection> {
		if (!this.dbInstance) {
			const options: Database.Options = {};

			if (this.config.connection.readonly) {
				options.readonly = true;
			}

			if (this.config.connection.mode !== undefined) {
				options.fileMustExist = true;
			}

			this.dbInstance = new Database(this.getDbPath(), options);

			// Enable foreign keys by default
			this.dbInstance.pragma("foreign_keys = ON");

			// Check database integrity
			const integrityCheck = this.dbInstance.pragma("integrity_check", {
				simple: true,
			}) as string;

			if (integrityCheck !== "ok") {
				// Use a logger instead of console.warn
				if (this.config.debug) {
					this.logWarning(`Database integrity check failed: ${integrityCheck}`);
				}
			}

			// Set busy timeout to prevent SQLITE_BUSY errors
			this.dbInstance.pragma("busy_timeout = 5000");
		}

		return new SQLiteConnection(this.dbInstance);
	}

	/**
	 * Close the database connection
	 */
	close(): void {
		if (this.dbInstance) {
			this.dbInstance.close();
			this.dbInstance = null;
		}
	}

	/**
	 * Begin a transaction
	 * @param isolationLevel Transaction isolation level (ignored in SQLite)
	 */
	async beginTransaction(isolationLevel?: TransactionIsolationLevel): Promise<void> {
		this.ensureConnection();
		if (this.dbInstance) {
			this.dbInstance.prepare("BEGIN TRANSACTION").run();
		}
	}

	/**
	 * Commit a transaction
	 */
	async commitTransaction(): Promise<void> {
		this.ensureConnection();
		if (this.dbInstance) {
			this.dbInstance.prepare("COMMIT").run();
		}
	}

	/**
	 * Rollback a transaction
	 */
	async rollbackTransaction(): Promise<void> {
		this.ensureConnection();
		if (this.dbInstance) {
			this.dbInstance.prepare("ROLLBACK").run();
		}
	}

	/**
	 * Execute a query that returns multiple rows
	 * @param query SQL query
	 * @param params Query parameters
	 * @returns Query results
	 */
	async query<T>(query: string, ...params: unknown[]): Promise<T[]> {
		this.ensureConnection();

		if (this.config.debug) {
			this.logDebug(`[SQLite Query] ${query}`, params);
		}

		// Sanitize parameters to ensure they're SQLite compatible
		const sanitizedParams = params.map(param => {
			if (typeof param === 'boolean') {
				return param ? 1 : 0;
			}
			return param;
		});

		if (this.dbInstance) {
			try {
				return this.dbInstance.prepare(query).all(...sanitizedParams) as T[];
			} catch (error) {
				this.logDebug(`[SQLite Error] ${error}`);
				throw error;
			}
		}

		return [];
	}

	/**
	 * Execute a non-query SQL statement
	 * @param query SQL statement
	 * @param params Statement parameters
	 * @returns Query result information
	 */
	async execute(query: string, ...params: unknown[]): Promise<DbQueryResult> {
		this.ensureConnection();

		if (this.config.debug) {
			this.logDebug(`[SQLite Execute] ${query}`, params);
		}

		if (this.dbInstance) {
			const result = this.dbInstance.prepare(query).run(...params);
			return {
				lastInsertRowid:
					typeof result.lastInsertRowid === "bigint"
						? Number(result.lastInsertRowid)
						: (result.lastInsertRowid as number),
				changes: result.changes,
			};
		}

		return { changes: 0 };
	}

	/**
	 * Execute a SQL script
	 * @param sql SQL script
	 */
	async executeScript(sql: string): Promise<void> {
		this.ensureConnection();

		if (this.config.debug) {
			this.logDebug(`[SQLite Execute Script] ${sql.substring(0, 100)}...`);
		}

		if (this.dbInstance) {
			this.dbInstance.exec(sql);
		}
	}

	/**
	 * Create a query builder instance
	 * @returns Query builder instance
	 */
	createQueryBuilder(): QueryBuilder {
		const builder = new SQLiteQueryBuilder(this);

		// Add the missing methods to the SQLiteQueryBuilder to satisfy interface
		(builder as any).selectExpression = (expression: string, alias: string, ...params: unknown[]) => {
			builder.selectRaw(`${expression} AS ${alias}`, ...params);
			return builder;
		};

		(builder as any).whereColumn = (column: string, operator: string, value: unknown) => {
			return builder.where({ field: column, operator: operator as ConditionOperator, value });
		};

		(builder as any).whereDateColumn = (column: string, operator: string, value: Date | string) => {
			const dateValue = value instanceof Date ? value.toISOString() : value;
			return builder.where(`${column} ${operator} ?`, dateValue);
		};

		(builder as any).whereExpression = (expression: string, ...params: unknown[]) => {
			return builder.where(expression, ...params);
		};

		(builder as any).whereLike = (column: string, value: string, position: string = "both") => {
			let pattern: string;
			switch (position) {
				case "start": pattern = `%${value}`; break;
				case "end": pattern = `${value}%`; break;
				case "both": pattern = `%${value}%`; break;
				case "none": pattern = value; break;
				default: pattern = `%${value}%`;
			}
			return builder.where(`${column} LIKE ?`, pattern);
		};

		(builder as any).orWhereLike = (column: string, value: string, position: string = "both") => {
			let pattern: string;
			switch (position) {
				case "start": pattern = `%${value}`; break;
				case "end": pattern = `${value}%`; break;
				case "both": pattern = `%${value}%`; break;
				case "none": pattern = value; break;
				default: pattern = `%${value}%`;
			}
			return builder.orWhere(`${column} LIKE ?`, pattern);
		};

		(builder as any).aggregate = async (
			func: AggregateFunction,
			field: string,
			alias: string,
			distinct: boolean = false
		) => {
			const prevSelect = [...builder.getSelect()];
			const expression = distinct ? `${func}(DISTINCT ${field})` : `${func}(${field})`;
			builder.select([`${expression} AS ${alias}`]);
			const result = await builder.execute();
			// Restore the previous select
			builder.getSelect().length = 0;
			prevSelect.forEach(sel => builder.getSelect().push(sel));
			return result;
		};

		return builder;
	}

	/**
	 * Get database-specific date functions
	 */
	getDateFunctions(): DateFunctions {
		return this.dateFunctions;
	}

	/**
	 * Get diagnostic information about the database
	 * @returns Database information
	 */
	async getDatabaseInfo(): Promise<Record<string, unknown>> {
		this.ensureConnection();
		if (!this.dbInstance) {
			return {};
		}

		const tables = await this.query<{ name: string }>(
			"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
		);

		const tableCount = await this.querySingle<{ count: number }>(
			"SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
		);

		const version = this.dbInstance.pragma("user_version", {
			simple: true,
		}) as number;

		const journalMode = this.dbInstance.pragma("journal_mode", {
			simple: true,
		}) as string;

		const foreignKeys = this.dbInstance.pragma("foreign_keys", {
			simple: true,
		}) as number;

		const syncMode = this.dbInstance.pragma("synchronous", {
			simple: true,
		}) as number;

		const cacheSize = this.dbInstance.pragma("cache_size", {
			simple: true,
		}) as number;

		return {
			engine: "SQLite",
			version: {
				sqlite: this.dbInstance.pragma("sqlite_version", { simple: true }),
				user: version,
			},
			tables,
			tableCount: tableCount ? tableCount.count : 0,
			path: this.getDbPath(),
			isMemory: this.config.connection.memory === true,
			isReadOnly: this.config.connection.readonly === true,
			settings: {
				journalMode,
				foreignKeys,
				synchronous: syncMode,
				cacheSize,
			},
		};
	}

	/**
	 * Logging functions to replace console statements
	 */
	private logDebug(message: string, params?: unknown[]): void {
		if (this.config.debug) {
			// In a real implementation, you might use a proper logger
			if (params) {
				this.logMessage(`${message} ${JSON.stringify(params)}`);
			} else {
				this.logMessage(message);
			}
		}
	}

	private logWarning(message: string): void {
		if (this.config.debug) {
			// In a real implementation, you might use a proper logger
			this.logMessage(`WARNING: ${message}`);
		}
	}

	private logMessage(message: string): void {
		// Replace console.log with a configurable logger
		// This could be passed in during initialization
		if (this.config.debug) {
			if (
				typeof process !== "undefined" &&
				process.env &&
				process.env.NODE_ENV === "development"
			) {
				// Only log in development mode
				// eslint-disable-next-line no-console
				console.log(message);
			}
		}
	}

	/**
	 * Ensure that a database connection exists
	 * @throws Error if not connected
	 */
	private ensureConnection(): void {
		if (!this.dbInstance) {
			throw new Error(
				"Database connection not established. Call connect() first."
			);
		}
	}

	/**
	 * Execute a query that returns a single row
	 * @param query SQL query
	 * @param params Query parameters
	 * @returns Single row result or undefined
	 */
	async querySingle<T>(
		query: string,
		...params: unknown[]
	): Promise<T | undefined> {
		this.ensureConnection();

		if (this.config.debug) {
			this.logDebug(`[SQLite Query Single] ${query}`, params);
		}

		if (this.dbInstance) {
			try {
				return this.dbInstance.prepare(query).get(...params) as T | undefined;
			} catch (error) {
				this.logDebug(`[SQLite Error] ${error}`);
				throw error;
			}
		}

		return undefined;
	}

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

		// Convert string relation names to relation options if needed
		const relationOptions: RelationOptions[] = [];

		if (options?.relations && options.relations.length > 0) {
			// Handle both RelationOptions[] and string[] cases
			if (typeof options.relations[0] === 'string') {
				// Convert string relation names to default relation options
				for (const relationName of options.relations as unknown as string[]) {
					relationOptions.push({
						name: relationName,
						type: 'left',
						mapping: {
							table: '', // Will be filled by applyRelations
							idField: '',
							entity: '',
							columns: []
						}
					});
				}
				this.applyRelations(qb, tableName, relationOptions);
			} else {
				this.applyRelations(qb, tableName, options.relations as RelationOptions[]);
			}
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

		// Convert string relation names to relation options if needed
		const relationOptions: RelationOptions[] = [];

		if (options?.relations && options.relations.length > 0) {
			// Handle both RelationOptions[] and string[] cases
			if (typeof options.relations[0] === 'string') {
				// Convert string relation names to default relation options
				for (const relationName of options.relations as unknown as string[]) {
					relationOptions.push({
						name: relationName,
						type: 'left',
						mapping: {
							table: '', // Will be filled by applyRelations
							idField: '',
							entity: '',
							columns: []
						}
					});
				}
				this.applyRelations(qb, tableName, relationOptions);
			} else {
				this.applyRelations(qb, tableName, options.relations as RelationOptions[]);
			}
		}

		// Add order by if specified
		if (options?.orderBy && options.orderBy.length > 0) {
			for (const order of options.orderBy) {
				qb.orderBy(order.field, order.direction as "ASC" | "DESC");
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
	 * Perform an aggregate operation
	 * @param tableName Table name
	 * @param options Aggregate options
	 * @returns Aggregate results
	 */
	async aggregate<T>(tableName: string, options: AggregateOptions): Promise<T[]> {
		const qb = this.createQueryBuilder();

		// Start with an empty selection
		const selects: string[] = [];

		// Add group by fields to select
		if (options.groupBy && options.groupBy.length > 0) {
			selects.push(...options.groupBy);
		}

		// Add aggregate expressions
		for (const agg of options.aggregates) {
			// Create the expression based on function and field
			let expr: string;
			const fn = agg.function;
			const field = agg.field === '*' ? '*' : `"${agg.field}"`;

			if (agg.distinct && field !== '*') {
				expr = `${fn}(DISTINCT ${field})`;
			} else {
				expr = `${fn}(${field})`;
			}

			// Add alias if provided
			if (agg.alias) {
				expr += ` AS "${agg.alias}"`;
			}

			selects.push(expr);
		}

		// Set the select fields
		qb.select(selects);

		// Set the base table
		qb.from(options.from || tableName);

		// Add conditions if provided
		if (options.conditions) {
			for (const [key, value] of Object.entries(options.conditions)) {
				if (value === null) {
					qb.where(`${key} IS NULL`);
				} else if (Array.isArray(value)) {
					const placeholders = value.map(() => '?').join(', ');
					qb.where(`${key} IN (${placeholders})`, ...value);
				} else {
					qb.where(`${key} = ?`, value);
				}
			}
		}

		// Add joins if specified
		if (options.joins && options.joins.length > 0) {
			this.applyJoins(qb, options.joins);
		}

		// Add group by
		if (options.groupBy && options.groupBy.length > 0) {
			qb.groupBy(options.groupBy);
		}

		// Add having
		if (options.having) {
			qb.having(options.having, ...(options.havingParams || []));
		}

		// Add order by
		if (options.orderBy && options.orderBy.length > 0) {
			for (const order of options.orderBy) {
				qb.orderBy(order.field, order.direction as "ASC" | "DESC");
			}
		}

		// Add limit and offset
		if (options.limit !== undefined) {
			qb.limit(options.limit);

			if (options.offset !== undefined) {
				qb.offset(options.offset);
			}
		}

		return qb.execute<T>();
	}
}