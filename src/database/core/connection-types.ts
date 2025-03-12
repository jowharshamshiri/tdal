/**
 * Database connection types
 * Defines the interfaces for database connections and configuration
 */

/**
 * Database connection interface
 * Represents an active connection to a database
 */
export interface DbConnection {
  /**
   * Close the database connection
   */
  close(): void;
}

/**
 * Base database configuration
 */
export interface DbConfigBase {
  /**
   * Database type (e.g., 'sqlite', 'postgres')
   */
  type: string;

  /**
   * Whether to use the test database
   */
  useTestDatabase?: boolean;

  /**
   * Connection pool options
   */
  pool?: {
    /**
     * Minimum number of connections in pool
     */
    min?: number;

    /**
     * Maximum number of connections in pool
     */
    max?: number;

    /**
     * Connection idle timeout in milliseconds
     */
    idleTimeoutMillis?: number;
  };

  /**
   * Debug mode
   */
  debug?: boolean;
}

/**
 * SQLite specific configuration
 */
export interface SQLiteConfig extends DbConfigBase {
  type: "sqlite";

  /**
   * Connection details
   */
  connection: {
    /**
     * Path to the database file
     */
    filename: string;

    /**
     * Path to the test database file
     */
    testFilename?: string;

    /**
     * Memory database flag
     */
    memory?: boolean;

    /**
     * Read-only mode
     */
    readonly?: boolean;

    /**
     * File open mode
     */
    mode?: number;
  };
}

/**
 * PostgreSQL specific configuration
 */
export interface PostgresConfig extends DbConfigBase {
  type: "postgres";

  /**
   * Connection details
   */
  connection: {
    /**
     * Database host
     */
    host: string;

    /**
     * Database port
     */
    port: number;

    /**
     * Database name
     */
    database: string;

    /**
     * Test database name
     */
    testDatabase?: string;

    /**
     * Database user
     */
    user: string;

    /**
     * Database password
     */
    password: string;

    /**
     * SSL configuration
     */
    ssl?:
      | boolean
      | {
          rejectUnauthorized?: boolean;
          ca?: string;
          cert?: string;
          key?: string;
        };

    /**
     * Connection timeout in milliseconds
     */
    connectionTimeoutMillis?: number;
  };
}

/**
 * MySQL specific configuration
 */
export interface MySQLConfig extends DbConfigBase {
  type: "mysql";

  /**
   * Connection details
   */
  connection: {
    /**
     * Database host
     */
    host: string;

    /**
     * Database port
     */
    port: number;

    /**
     * Database name
     */
    database: string;

    /**
     * Test database name
     */
    testDatabase?: string;

    /**
     * Database user
     */
    user: string;

    /**
     * Database password
     */
    password: string;

    /**
     * Character set
     */
    charset?: string;

    /**
     * Connection timeout in milliseconds
     */
    connectTimeout?: number;

    /**
     * Whether to enable debug output
     */
    debug?: boolean;
  };
}

/**
 * Union type of all database configurations
 */
export type DbConfig = SQLiteConfig | PostgresConfig | MySQLConfig;
