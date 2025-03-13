/**
 * Database Adapter Factory
 * Creates database adapters based on configuration
 */

import { DatabaseConfig, Logger } from '../core/types';
import { DatabaseAdapter } from './database-adapter';

/**
 * Adapter factory class
 * Creates database adapters based on configuration
 */
export class AdapterFactory {
  // Map of registered adapters
  private static adapters: Record<string, new (config: any, logger: Logger) => DatabaseAdapter> = {};

  /**
   * Register a database adapter implementation
   * @param type Database type (sqlite, postgres, mysql)
   * @param adapterClass Adapter class
   */
  static registerAdapter(
    type: string,
    adapterClass: new (config: any, logger: Logger) => DatabaseAdapter
  ): void {
    this.adapters[type] = adapterClass;
  }

  /**
   * Create a database adapter based on configuration
   * @param config Database configuration
   * @param logger Logger instance
   * @returns Database adapter instance
   */
  static createAdapter(config: DatabaseConfig, logger: Logger): DatabaseAdapter {
    const { type } = config;
    
    if (!type) {
      throw new Error('Database type is required');
    }
    
    const AdapterClass = this.adapters[type];
    if (!AdapterClass) {
      throw new Error(`Unsupported database type: ${type}`);
    }
    
    return new AdapterClass(config, logger);
  }

  /**
   * Load and register all available adapters
   * Called at startup to register all adapters
   */
  static async loadAdapters(logger: Logger): Promise<void> {
    try {
      // Try to load SQLite adapter
      try {
        const { SQLiteAdapter } = await import('./sqlite-adapter');
        this.registerAdapter('sqlite', SQLiteAdapter);
        logger.info('SQLite adapter registered');
      } catch (error) {
        logger.warn(`SQLite adapter not available: ${error}`);
      }
      
      // Try to load PostgreSQL adapter
      try {
        const { PostgresAdapter } = await import('./postgres-adapter');
        this.registerAdapter('postgres', PostgresAdapter);
        logger.info('PostgreSQL adapter registered');
      } catch (error) {
        logger.warn(`PostgreSQL adapter not available: ${error}`);
      }
      
      // Try to load MySQL adapter
      try {
        const { MySQLAdapter } = await import('./mysql-adapter');
        this.registerAdapter('mysql', MySQLAdapter);
        logger.info('MySQL adapter registered');
      } catch (error) {
        logger.warn(`MySQL adapter not available: ${error}`);
      }
    } catch (error) {
      logger.error(`Failed to load database adapters: ${error}`);
    }
  }
}

/**
 * SQLite adapter configuration
 */
export interface SQLiteConfig extends DatabaseConfig {
  type: 'sqlite';
  connection: {
    filename: string;
    memory?: boolean;
    readonly?: boolean;
  };
}

/**
 * PostgreSQL adapter configuration
 */
export interface PostgresConfig extends DatabaseConfig {
  type: 'postgres';
  connection: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl?: boolean;
  };
}

/**
 * MySQL adapter configuration
 */
export interface MySQLConfig extends DatabaseConfig {
  type: 'mysql';
  connection: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl?: boolean;
  };
}

/**
 * Create a SQLite in-memory database configuration
 * Useful for testing
 * @returns SQLite configuration for in-memory database
 */
export function createInMemoryConfig(): SQLiteConfig {
  return {
    type: 'sqlite',
    connection: {
      filename: ':memory:',
      memory: true
    }
  };
}

/**
 * Create a SQLite file database configuration
 * @param filename Database file path
 * @returns SQLite configuration for file database
 */
export function createSQLiteConfig(filename: string): SQLiteConfig {
  return {
    type: 'sqlite',
    connection: {
      filename
    }
  };
}

/**
 * Create a PostgreSQL database configuration
 * @param host Database host
 * @param port Database port
 * @param database Database name
 * @param user Database user
 * @param password Database password
 * @param ssl Whether to use SSL
 * @returns PostgreSQL configuration
 */
export function createPostgresConfig(
  host: string,
  port: number,
  database: string,
  user: string,
  password: string,
  ssl: boolean = false
): PostgresConfig {
  return {
    type: 'postgres',
    connection: {
      host,
      port,
      database,
      user,
      password,
      ssl
    }
  };
}

/**
 * Create a MySQL database configuration
 * @param host Database host
 * @param port Database port
 * @param database Database name
 * @param user Database user
 * @param password Database password
 * @param ssl Whether to use SSL
 * @returns MySQL configuration
 */
export function createMySQLConfig(
  host: string,
  port: number,
  database: string,
  user: string,
  password: string,
  ssl: boolean = false
): MySQLConfig {
  return {
    type: 'mysql',
    connection: {
      host,
      port,
      database,
      user,
      password,
      ssl
    }
  };
}