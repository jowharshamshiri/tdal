/**
 * Schema loader utility
 * Provides functionality for loading database schemas and migrations
 */

import * as fs from "fs";
import * as path from "path";
import { DatabaseAdapter } from "../core/types";

/**
 * Schema loader options
 */
export interface SchemaLoaderOptions {
  /**
   * Base directory containing SQL files
   */
  baseDir?: string;

  /**
   * Schema directory (relative to base directory)
   */
  schemaDir?: string;

  /**
   * Migrations directory (relative to base directory)
   */
  migrationsDir?: string;

  /**
   * Seed data directory (relative to base directory)
   */
  seedDir?: string;

  /**
   * Test data directory (relative to base directory)
   */
  testDir?: string;

  /**
   * Migration table name
   */
  migrationTable?: string;

  /**
   * Whether to log progress
   */
  verbose?: boolean;

  /**
   * Custom logger function
   */
  logger?: (message: string) => void;
}

/**
 * Migration information
 */
export interface Migration {
  /**
   * Migration ID
   */
  id: string;

  /**
   * Migration name
   */
  name: string;

  /**
   * Migration timestamp
   */
  timestamp: number;

  /**
   * Path to migration file
   */
  filepath: string;

  /**
   * Migration SQL content
   */
  sql?: string;
}

/**
 * Migration execution result
 */
export interface MigrationResult {
  /**
   * Whether the migration was successful
   */
  success: boolean;

  /**
   * Migration ID
   */
  migrationId: string;

  /**
   * Migration name
   */
  name: string;

  /**
   * Error message (if any)
   */
  error?: string;

  /**
   * Execution duration in milliseconds
   */
  duration: number;
}

/**
 * Schema loader default options
 */
const DEFAULT_OPTIONS: SchemaLoaderOptions = {
  baseDir: process.cwd(),
  schemaDir: "sql/schema",
  migrationsDir: "sql/migrations",
  seedDir: "sql/seed",
  testDir: "sql/test",
  migrationTable: "schema_migrations",
  verbose: false,
  logger: undefined,
};

/**
 * Schema loader class
 * Handles loading database schemas and migrations
 */
export class SchemaLoader {
  private options: SchemaLoaderOptions;

  /**
   * Constructor
   * @param adapter Database adapter
   * @param options Schema loader options
   */
  constructor(
    private adapter: DatabaseAdapter,
    options: SchemaLoaderOptions = {}
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Get the base directory path
   * @returns Base directory path
   */
  private getBaseDir(): string {
    return this.options.baseDir || process.cwd();
  }

  /**
   * Get the schema directory path
   * @returns Schema directory path
   */
  private getSchemaDir(): string {
    return path.join(this.getBaseDir(), this.options.schemaDir || "sql/schema");
  }

  /**
   * Get the migrations directory path
   * @returns Migrations directory path
   */
  private getMigrationsDir(): string {
    return path.join(
      this.getBaseDir(),
      this.options.migrationsDir || "sql/migrations"
    );
  }

  /**
   * Get the seed directory path
   * @returns Seed directory path
   */
  private getSeedDir(): string {
    return path.join(this.getBaseDir(), this.options.seedDir || "sql/seed");
  }

  /**
   * Get the test directory path
   * @returns Test directory path
   */
  private getTestDir(): string {
    return path.join(this.getBaseDir(), this.options.testDir || "sql/test");
  }

  /**
   * Log message if verbose option is enabled
   * @param message Message to log
   */
  private log(message: string): void {
    if (this.options.verbose) {
      if (this.options.logger) {
        this.options.logger(`[SchemaLoader] ${message}`);
      } else {
        // Using console.log is expected here for logging
        console.log(`[SchemaLoader] ${message}`);
      }
    }
  }

  /**
   * Load and execute SQL from a file
   * @param filePath Path to the SQL file
   * @returns Whether the operation was successful
   */
  async loadSqlFile(filePath: string): Promise<boolean> {
    try {
      if (!fs.existsSync(filePath)) {
        this.log(`SQL file not found: ${filePath}`);
        return false;
      }

      const sql = fs.readFileSync(filePath, "utf8");
      await this.adapter.executeScript(sql);
      this.log(`Successfully executed SQL from ${filePath}`);
      return true;
    } catch (error) {
      this.log(`Error executing SQL from ${filePath}: ${error}`);
      throw error;
    }
  }

  /**
   * Load schema file
   * @param schemaFile Schema file name
   * @returns Whether the operation was successful
   */
  async loadSchema(schemaFile = "schema.sql"): Promise<boolean> {
    const schemaPath = path.join(this.getSchemaDir(), schemaFile);
    this.log(`Loading schema from ${schemaPath}`);
    return this.loadSqlFile(schemaPath);
  }

  /**
   * Load seed data
   * @param seedFile Seed file name
   * @returns Whether the operation was successful
   */
  async loadSeedData(seedFile = "seed-data.sql"): Promise<boolean> {
    const seedPath = path.join(this.getSeedDir(), seedFile);
    this.log(`Loading seed data from ${seedPath}`);
    return this.loadSqlFile(seedPath);
  }

  /**
   * Load test data
   * @param testFile Test file name
   * @returns Whether the operation was successful
   */
  async loadTestData(testFile = "test-data.sql"): Promise<boolean> {
    const testPath = path.join(this.getTestDir(), testFile);
    this.log(`Loading test data from ${testPath}`);
    return this.loadSqlFile(testPath);
  }

  /**
   * Initialize database with schema and seed data
   * @param schemaFile Schema file name
   * @param seedFile Seed file name
   * @returns Whether the operation was successful
   */
  async initializeDatabase(
    schemaFile = "schema.sql",
    seedFile = "seed-data.sql"
  ): Promise<boolean> {
    try {
      const schemaResult = await this.loadSchema(schemaFile);

      if (!schemaResult) {
        return false;
      }

      const seedResult = await this.loadSeedData(seedFile);
      return seedResult;
    } catch (error) {
      this.log(`Error initializing database: ${error}`);
      return false;
    }
  }

  /**
   * Initialize test database with schema and test data
   * @param schemaFile Schema file name
   * @param testFile Test file name
   * @returns Whether the operation was successful
   */
  async initializeTestDatabase(
    schemaFile = "schema.sql",
    testFile = "test-data.sql"
  ): Promise<boolean> {
    try {
      const schemaResult = await this.loadSchema(schemaFile);

      if (!schemaResult) {
        return false;
      }

      const testResult = await this.loadTestData(testFile);
      return testResult;
    } catch (error) {
      this.log(`Error initializing test database: ${error}`);
      return false;
    }
  }

  /**
   * Ensure the migrations table exists
   */
  private async ensureMigrationsTable(): Promise<void> {
    const tableName = this.options.migrationTable || "schema_migrations";

    const sql = `
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        executed_at TEXT NOT NULL,
        duration INTEGER NOT NULL
      )
    `;

    await this.adapter.executeScript(sql);
  }

  /**
   * Get all migrations from the migrations directory
   * @returns Array of migrations
   */
  async getMigrations(): Promise<Migration[]> {
    const migrationsDir = this.getMigrationsDir();

    if (!fs.existsSync(migrationsDir)) {
      this.log(`Migrations directory not found: ${migrationsDir}`);
      return [];
    }

    // Read all SQL files in the migrations directory
    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"));

    // Parse migration filenames
    const migrations: Migration[] = [];

    for (const file of files) {
      // Expected format: <timestamp>_<name>.sql
      const match = file.match(/^(\d+)_(.+)\.sql$/);

      if (match) {
        const [, timestampStr, name] = match;
        const timestamp = parseInt(timestampStr, 10);

        migrations.push({
          id: timestampStr,
          name,
          timestamp,
          filepath: path.join(migrationsDir, file),
        });
      }
    }

    // Sort migrations by timestamp
    return migrations.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Get executed migrations from the database
   * @returns Array of executed migration IDs
   */
  async getExecutedMigrations(): Promise<string[]> {
    const tableName = this.options.migrationTable || "schema_migrations";

    try {
      // Check if the migrations table exists
      await this.ensureMigrationsTable();

      // Get executed migrations
      const rows = await this.adapter.query<{ id: string }>(
        `SELECT id FROM ${tableName} ORDER BY timestamp ASC`
      );

      return rows.map((row) => row.id);
    } catch (error) {
      this.log(`Error getting executed migrations: ${error}`);
      return [];
    }
  }

  /**
   * Get pending migrations
   * @returns Array of pending migrations
   */
  async getPendingMigrations(): Promise<Migration[]> {
    const allMigrations = await this.getMigrations();
    const executedMigrationIds = await this.getExecutedMigrations();

    return allMigrations.filter(
      (migration) => !executedMigrationIds.includes(migration.id)
    );
  }

  /**
   * Record a migration in the migrations table
   * @param migration Migration to record
   * @param duration Execution duration in milliseconds
   */
  private async recordMigration(
    migration: Migration,
    duration: number
  ): Promise<void> {
    const tableName = this.options.migrationTable || "schema_migrations";

    const query = `
      INSERT INTO ${tableName} (id, name, timestamp, executed_at, duration)
      VALUES (?, ?, ?, datetime('now'), ?)
    `;

    await this.adapter.execute(
      query,
      migration.id,
      migration.name,
      migration.timestamp,
      duration
    );
  }

  /**
   * Execute a single migration
   * @param migration Migration to execute
   * @returns Migration result
   */
  async executeMigration(migration: Migration): Promise<MigrationResult> {
    const startTime = Date.now();

    try {
      // Load migration SQL
      if (!migration.sql) {
        migration.sql = fs.readFileSync(migration.filepath, "utf8");
      }

      // Execute migration within a transaction
      await this.adapter.transaction(async (db) => {
        await db.executeScript(migration.sql as string);
      });

      const duration = Date.now() - startTime;

      // Record migration
      await this.recordMigration(migration, duration);

      this.log(
        `Successfully executed migration ${migration.id}_${migration.name} (${duration}ms)`
      );

      return {
        success: true,
        migrationId: migration.id,
        name: migration.name,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.log(
        `Error executing migration ${migration.id}_${migration.name}: ${errorMessage}`
      );

      return {
        success: false,
        migrationId: migration.id,
        name: migration.name,
        error: errorMessage,
        duration,
      };
    }
  }

  /**
   * Execute all pending migrations
   * @returns Array of migration results
   */
  async migrate(): Promise<MigrationResult[]> {
    const pendingMigrations = await this.getPendingMigrations();

    if (pendingMigrations.length === 0) {
      this.log("No pending migrations");
      return [];
    }

    this.log(`Executing ${pendingMigrations.length} pending migrations`);

    const results: MigrationResult[] = [];

    for (const migration of pendingMigrations) {
      const result = await this.executeMigration(migration);
      results.push(result);

      if (!result.success) {
        this.log("Migration failed, aborting");
        break;
      }
    }

    return results;
  }

  /**
   * Create a new migration file
   * @param name Migration name
   * @returns Path to the created migration file
   */
  createMigration(name: string): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const safeName = name.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
    const filename = `${timestamp}_${safeName}.sql`;
    const filepath = path.join(this.getMigrationsDir(), filename);

    // Create migrations directory if it doesn't exist
    const migrationsDir = this.getMigrationsDir();
    if (!fs.existsSync(migrationsDir)) {
      fs.mkdirSync(migrationsDir, { recursive: true });
    }

    // Create migration file with template
    const template = `-- Migration: ${name}
-- Created at: ${new Date().toISOString()}

-- Write your migration SQL here

`;

    fs.writeFileSync(filepath, template, "utf8");

    this.log(`Created migration file: ${filepath}`);

    return filepath;
  }
}
