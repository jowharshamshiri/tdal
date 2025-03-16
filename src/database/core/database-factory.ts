/**
 * Database factory
 * Creates database adapters based on configuration
 */

import { DatabaseAdapter } from "./types";
import {
	DbConfig,
	SQLiteConfig,
	PostgresConfig,
	MySQLConfig,
} from "./connection-types";

/**
 * Factory class for creating database adapters based on configuration
 */
export class DatabaseFactory {
	/**
	 * Create a database adapter instance based on the provided configuration
	 *
	 * @param config Database configuration
	 * @returns An implementation of DatabaseAdapter
	 */
	static createAdapter(config: DbConfig): DatabaseAdapter {
		// Validate the configuration
		if (!config || typeof config !== "object") {
			throw new Error(
				"Invalid database configuration: config must be an object"
			);
		}

		if (!("type" in config)) {
			throw new Error("Invalid database configuration: type is required");
		}

		const databaseType = config.type;
		switch (config.type) {
			case "sqlite":
				// Dynamic import to avoid circular dependencies
				return this.createSQLiteAdapter(config as SQLiteConfig);

			case "postgres":
				// Dynamic import to avoid circular dependencies
				return this.createPostgresAdapter(config as PostgresConfig);

			//   case "mysql":
			//     // Dynamic import to avoid circular dependencies
			//     return this.createMySQLAdapter(config as MySQLConfig);

			default:
				throw new Error(`Unsupported database type: ${databaseType}`);
		}
	}

	/**
   * Create a SQLite adapter
   *
   * @param config SQLite configuration
   * @returns SQLite adapter instance
   */
	private static createSQLiteAdapter(config: SQLiteConfig): DatabaseAdapter {
		// Dynamically import the SQLiteAdapter to avoid circular dependencies
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const { SQLiteAdapter } = require("../adapters/sqlite-adapter");

		return new SQLiteAdapter(
			config,
			config.useTestDatabase ?? false
		);
	}

	/**
	 * Create a PostgreSQL adapter
	 *
	 * @param config PostgreSQL configuration
	 * @returns PostgreSQL adapter instance
	 */
	private static createPostgresAdapter(
		config: PostgresConfig
	): DatabaseAdapter {
		// Dynamically import the PostgresAdapter to avoid circular dependencies
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const { PostgresAdapter } = require("../adapters/postgres-adapter");
		return new PostgresAdapter(config.connection);
	}

	/**
	 * Create a MySQL adapter
	 *
	 * @param config MySQL configuration
	 * @returns MySQL adapter instance
	 */
	//   private static createMySQLAdapter(config: MySQLConfig): DatabaseAdapter {
	//     // Dynamically import the MySQLAdapter to avoid circular dependencies
	//     // eslint-disable-next-line @typescript-eslint/no-var-requires
	//     const { MySQLAdapter } = require("../adapters/mysql-adapter");
	//     return new MySQLAdapter(config.connection);
	//   }

	/**
	 * Register a custom adapter factory
	 * This allows for extending the factory with additional database types
	 *
	 * @param type Database type
	 * @param factory Factory function to create the adapter
	 */
	static registerAdapterFactory(
		type: string,
		factory: (config: unknown) => DatabaseAdapter
	): void {
		// Create a safe way to extend the class with dynamic properties
		const factoryName = `create${type.charAt(0).toUpperCase() + type.slice(1)
			}Adapter`;
		// Use type assertion to safely add the dynamic property
		(this as unknown as Record<string, (config: unknown) => DatabaseAdapter>)[
			factoryName
		] = factory;
	}
}
