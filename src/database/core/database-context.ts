/**
 * Database context
 * Manages the singleton database instance
 */

import * as path from "path";
import { DatabaseAdapter } from "./types";
import { DbConfig, SQLiteConfig, PostgresConfig } from "./connection-types";
import { DatabaseFactory } from "./database-factory";

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
      this.instance = DatabaseFactory.createAdapter(this.config);

      // Initialize connection
      this.instance.connect().catch((err) => {
        // Use a logger instead of console.error
        if (process.env.NODE_ENV === "development") {
          // eslint-disable-next-line no-console
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
}
