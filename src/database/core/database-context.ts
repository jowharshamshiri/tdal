/**
 * Database context
 * Manages the singleton database instance
 */

import * as path from "path";
import { DatabaseAdapter } from "./types";
import { DbConfig, SQLiteConfig, PostgresConfig } from "./connection-types";
import { DatabaseFactory } from "./database-factory";
import { Logger } from "../../core/types";
import { AppContext } from "../../core/app-context";

/**
 * Default SQLite configuration
 */
const defaultConfig: SQLiteConfig = {
	type: "sqlite",
	connection: {
		filename: path.join(process.cwd(), ".netlify", "data", "tdal.db"),
		testFilename: path.join(
			process.cwd(),
			".netlify",
			"test_data",
			"test_tdal.db"
		),
	},
	useTestDatabase: process.env.NODE_ENV === "test",
};

/**
 * Database context that manages the singleton database instance
 */
export class DatabaseContext {
	private static instance: DatabaseAdapter | null = null;
	private static config: DbConfig = defaultConfig;
	private static appContext: AppContext | null = null;
	private static logger: Logger | null = null;

	/**
	 * Configure the database with custom settings
	 * @param config Partial configuration to merge with defaults
	 */
	static configure(config: Partial<DbConfig>): void {
		// Determine the base config based on the type
		if (config.type === "postgres") {
			// Create a PostgreSQL config
			const postgresConfig: PostgresConfig = {
				type: "postgres",
				connection: {
					host: "localhost",
					port: 5432,
					database: "tdal",
					user: "postgres",
					password: "postgres",
					testDatabase: "tdal_test",
					...((config.connection as Partial<PostgresConfig["connection"]>) ||
						{}),
				},
				useTestDatabase:
					config.useTestDatabase || process.env.NODE_ENV === "test",
				pool: config.pool,
				debug: config.debug,
			};

			this.config = postgresConfig;
		} else {
			// Default to SQLite
			const sqliteConfig: SQLiteConfig = {
				type: "sqlite",
				connection: {
					...defaultConfig.connection,
					...((config.connection as Partial<SQLiteConfig["connection"]>) || {}),
				},
				useTestDatabase:
					config.useTestDatabase || defaultConfig.useTestDatabase,
				pool: config.pool,
				debug: config.debug,
			};

			this.config = sqliteConfig;
		}

		// Reset instance if it already exists
		if (this.instance) {
			this.instance.close();
			this.instance = null;
		}
	}

	/**
	 * Get the current database configuration
	 * @returns Current database configuration
	 */
	static getConfig(): DbConfig {
		return this.config;
	}

	/**
	 * Get or create the database adapter instance
	 * @returns Database adapter instance
	 */
	static getDatabase(): DatabaseAdapter {
		if (!this.instance) {
			// Use factory to create adapter with proper configuration
			this.instance = DatabaseFactory.createAdapter(this.config);

			// Initialize connection
			this.instance.connect().catch((err) => {
				if (this.logger) {
					this.logger.error(`Failed to connect to database: ${err}`);
				} else if (process.env.NODE_ENV === "development") {
					// Fallback to console if no logger is available
					console.error("Failed to connect to database:", err);
				}
			});
		}

		return this.instance;
	}

	/**
	 * Close the database connection and reset the instance
	 */
	static closeDatabase(): void {
		if (this.instance) {
			this.instance.close();
			this.instance = null;
		}
	}

	/**
	 * Reset the database configuration to defaults
	 */
	static resetConfig(): void {
		this.config = defaultConfig;
		this.closeDatabase();
	}

	/**
	 * Check if a database instance exists
	 * @returns True if a database instance exists
	 */
	static hasInstance(): boolean {
		return this.instance !== null;
	}

	/**
	 * Set the application context
	 * This allows the database context to access the application context
	 * @param context Application context
	 */
	static setAppContext(context: AppContext): void {
		this.appContext = context;

		// If the context provides a logger, use it
		if (context && context.getLogger()) {
			this.logger = context.getLogger();
		}
	}

	/**
	 * Get the application context
	 * @returns Application context or null if not set
	 */
	static getAppContext(): AppContext | null {
		return this.appContext;
	}

	/**
	 * Set logger for database operations
	 * @param logger Logger implementation
	 */
	static setLogger(logger: Logger): void {
		this.logger = logger;
	}

	/**
	 * Get the logger
	 * @returns Logger or null if not set
	 */
	static getLogger(): Logger | null {
		return this.logger;
	}

	/**
	 * Log a message using the configured logger or fallback to console
	 * @param level Log level
	 * @param message Log message
	 * @param args Additional arguments
	 */
	static log(level: 'info' | 'warn' | 'error' | 'debug', message: string, ...args: any[]): void {
		if (this.logger) {
			this.logger[level](message, ...args);
		} else if (process.env.NODE_ENV === "development") {
			// Fallback to console if no logger available
			console[level](message, ...args);
		}
	}
}