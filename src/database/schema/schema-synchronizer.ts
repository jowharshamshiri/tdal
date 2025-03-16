/**
 * Schema Synchronizer
 * Creates database tables based on entity definitions
 */

import { EntityConfig, getSqlColumnType } from '../../entity/entity-config';
import { Logger } from '../../core/types';
import { DatabaseAdapter } from '../core/types';

/**
 * Schema synchronization options
 */
export interface SchemaSyncOptions {
	/**
	 * Whether to drop tables if they exist
	 */
	dropTables?: boolean;

	/**
	 * SQL dialect to use
	 */
	dialect?: 'sqlite' | 'mysql' | 'postgres';

	/**
	 * Whether to create foreign keys
	 */
	createForeignKeys?: boolean;
}

/**
 * Schema synchronizer class
 * Handles database schema synchronization based on entity definitions
 */
export class SchemaSynchronizer {
	/**
	 * Constructor
	 * @param db Database adapter
	 * @param logger Logger instance
	 */
	constructor(private db: DatabaseAdapter, private logger: Logger) { }

	/**
	 * Synchronize database schema with entity definitions
	 * @param entities Map of entity configurations
	 * @param options Synchronization options
	 * @returns Whether the synchronization was successful
	 */
	async synchronize(
		entities: Map<string, EntityConfig>,
		options: SchemaSyncOptions = {}
	): Promise<boolean> {
		const { dropTables = false, dialect = 'sqlite', createForeignKeys = true } = options;

		try {
			this.logger.info(`Synchronizing database schema for ${entities.size} entities`);

			// Create tables for all entities
			for (const [entityName, config] of entities.entries()) {
				await this.createTable(config, { dropIfExists: dropTables, dialect });
			}

			// Create foreign keys if enabled
			if (createForeignKeys) {
				for (const [entityName, config] of entities.entries()) {
					await this.createForeignKeys(config, { dialect });
				}
			}

			this.logger.info('Database schema synchronization completed successfully');
			return true;
		} catch (error: any) {
			this.logger.error(`Error synchronizing database schema: ${error.message}`);
			return false;
		}
	}

	/**
	 * Create a database table for an entity
	 * @param entity Entity configuration
	 * @param options Table creation options
	 */
	async createTable(
		entity: EntityConfig,
		options: { dropIfExists?: boolean; dialect?: 'sqlite' | 'mysql' | 'postgres' } = {}
	): Promise<void> {
		const { dropIfExists = false, dialect = 'sqlite' } = options;
		const tableName = entity.table;

		try {
			// Drop table if requested
			if (dropIfExists) {
				await this.db.execute(`DROP TABLE IF EXISTS ${tableName}`);
			}

			// Check if table exists
			const tableExists = await this.tableExists(tableName);
			if (tableExists) {
				this.logger.debug(`Table ${tableName} already exists, skipping creation`);
				return;
			}

			// Build create table SQL
			let sql = `CREATE TABLE ${tableName} (\n`;

			// Add columns
			const columnDefinitions = entity.columns.map(column => {
				const columnType = getSqlColumnType(column, dialect);
				let definition = `${column.physical} ${columnType}`;

				// Add constraints
				if (column.primaryKey) {
					definition += ' PRIMARY KEY';
				}
				if (column.autoIncrement) {
					definition += dialect === 'postgres' ? ' SERIAL' : ' AUTOINCREMENT';
				}
				if (!column.nullable && !column.primaryKey) {
					definition += ' NOT NULL';
				}
				if (column.unique) {
					definition += ' UNIQUE';
				}
				if (column.defaultValue !== undefined) {
					if (typeof column.defaultValue === 'string') {
						definition += ` DEFAULT '${column.defaultValue}'`;
					} else if (column.defaultValue === null) {
						definition += ' DEFAULT NULL';
					} else {
						definition += ` DEFAULT ${column.defaultValue}`;
					}
				}

				return definition;
			});

			sql += columnDefinitions.join(',\n');
			sql += '\n)';

			// Execute CREATE TABLE
			await this.db.execute(sql);
			this.logger.info(`Created table ${tableName}`);
		} catch (error: any) {
			this.logger.error(`Error creating table ${tableName}: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Create foreign keys for an entity
	 * @param entity Entity configuration
	 * @param options Foreign key creation options
	 */
	async createForeignKeys(
		entity: EntityConfig,
		options: { dialect?: 'sqlite' | 'mysql' | 'postgres' } = {}
	): Promise<void> {
		const { dialect = 'sqlite' } = options;
		const tableName = entity.table;

		try {
			// Find columns with foreign keys
			const columnsWithForeignKeys = entity.columns.filter(column => column.foreignKey);

			if (columnsWithForeignKeys.length === 0) {
				return;
			}

			// For each foreign key column, add a foreign key constraint
			for (const column of columnsWithForeignKeys) {
				// Parse foreign key reference (table.column)
				const [referencedTable, referencedColumn] = column.foreignKey!.split('.');

				if (!referencedTable || !referencedColumn) {
					this.logger.warn(`Invalid foreign key format for column ${column.logical}: ${column.foreignKey}`);
					continue;
				}

				// Create constraint name
				const constraintName = `fk_${tableName}_${column.physical}_${referencedTable}_${referencedColumn}`;

				// Build ALTER TABLE SQL
				let sql = `ALTER TABLE ${tableName} ADD CONSTRAINT ${constraintName} `;
				sql += `FOREIGN KEY (${column.physical}) REFERENCES ${referencedTable}(${referencedColumn})`;

				// Add ON DELETE and ON UPDATE actions
				sql += ' ON DELETE CASCADE ON UPDATE CASCADE';

				// Execute ALTER TABLE
				await this.db.execute(sql);
				this.logger.info(`Added foreign key constraint ${constraintName} to table ${tableName}`);
			}
		} catch (error: any) {
			this.logger.error(`Error adding foreign keys to table ${tableName}: ${error.message}`);
			// Don't throw here - continue with other tables even if foreign keys fail
		}
	}

	/**
	 * Check if a table exists in the database
	 * @param tableName Table name
	 * @returns Whether the table exists
	 */
	async tableExists(tableName: string): Promise<boolean> {
		try {
			// SQLite-specific query to check if table exists
			const result = await this.db.query(
				`SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
				tableName
			);
			return result.length > 0;
		} catch (error: any) {
			this.logger.error(`Error checking if table exists: ${error.message}`);
			return false;
		}
	}
}

/**
 * Create a schema synchronizer
 * @param db Database adapter
 * @param logger Logger instance
 * @returns Schema synchronizer instance
 */
export function createSchemaSynchronizer(
	db: DatabaseAdapter,
	logger: Logger
): SchemaSynchronizer {
	return new SchemaSynchronizer(db, logger);
}