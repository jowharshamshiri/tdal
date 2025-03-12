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
  QueryBuilder,
  JoinOptions,
} from "../core/types";
import { DbConnection, SQLiteConfig } from "../core/connection-types";
import { DatabaseAdapterBase } from "./adapter-base";
import { SQLiteQueryBuilder } from "../query/sqlite-query-builder";

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
  constructor(private db: Database.Database) {}

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
  implements DatabaseAdapter
{
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
   */
  async beginTransaction(): Promise<void> {
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

    if (this.dbInstance) {
      return this.dbInstance.prepare(query).all(...params) as T[];
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
   * Create a SQLite-specific query builder
   * @returns Query builder instance
   */
  createQueryBuilder(): QueryBuilder {
    return new SQLiteQueryBuilder(this);
  }

  /**
   * Get database-specific date functions
   * @returns Date functions
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
   * @returns Record or undefined if not found
   */
  async findById<T>(
    tableName: string,
    idField: string,
    id: number | string
  ): Promise<T | undefined> {
    const query = `SELECT * FROM "${tableName}" WHERE "${idField}" = ?`;
    return this.querySingle<T>(query, id);
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
    id: number | string,
    data: Partial<T>
  ): Promise<number> {
    const keys = Object.keys(data);
    if (keys.length === 0) return 0;

    const values = Object.values(data);
    const setClause = keys.map((key) => `"${key}" = ?`).join(", ");

    const query = `UPDATE "${tableName}" SET ${setClause} WHERE "${idField}" = ?`;

    try {
      const result = await this.execute(query, ...values, id);
      return result.changes || 0;
    } catch (error) {
      this.logDebug(`[SQLite Update Error] ${error}`);
      throw error;
    }
  }

  /**
   * Delete a record by ID
   * @param tableName Table name
   * @param idField ID field name
   * @param id ID value
   * @returns Number of affected rows
   */
  async delete(
    tableName: string,
    idField: string,
    id: number | string
  ): Promise<number> {
    const query = `DELETE FROM "${tableName}" WHERE "${idField}" = ?`;

    try {
      const result = await this.execute(query, id);
      return result.changes || 0;
    } catch (error) {
      this.logDebug(`[SQLite Delete Error] ${error}`);
      throw error;
    }
  }
}
