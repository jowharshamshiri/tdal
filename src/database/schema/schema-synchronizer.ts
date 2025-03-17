/**
 * Schema Synchronizer
 * Creates database tables based on entity definitions
 */

import { EntityConfig } from '../../entity/entity-config';
import { Logger } from '../../logging';
import { DatabaseAdapter } from '../core/types';
import { getSqlColumnType } from '../../entity/entity-schema';

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
	 * Drop a table if it exists
	 * @param tableName Table name
	 */
	private async dropTable(tableName: string): Promise<void> {
		await this.db.execute(`DROP TABLE IF EXISTS ${tableName}`);
	}


	async synchronize(
		entities: Map<string, EntityConfig>,
		options: SchemaSyncOptions = {}
	): Promise<boolean> {
		const { dropTables = false, createForeignKeys = true } = options;

		try {
			this.logger.info(`Synchronizing database schema for ${entities.size} entities`);

			// Get database info to determine capabilities
			const dbInfo = await this.db.getDatabaseInfo();
			const isSQLite = dbInfo.type === 'sqlite';

			// Create tables for all entities
			for (const [entityName, config] of entities.entries()) {
				await this.db.createTable(config, dropTables);
			}

			// Create junction tables for many-to-many relationships
			await this.createJunctionTables(entities, dropTables);

			// Create foreign keys if enabled and database supports it
			if (createForeignKeys && !isSQLite) {
				await this.createForeignKeys(entities);
			}

			this.logger.info('Database schema synchronization completed successfully');
			return true;
		} catch (error: any) {
			this.logger.error(`Error synchronizing database schema: ${error.message}`);
			return false;
		}
	}

	private async createJunctionTables(
		entities: Map<string, EntityConfig>,
		dropIfExists: boolean
	): Promise<void> {
		this.logger.info('Creating junction tables for many-to-many relationships');

		for (const [entityName, config] of entities.entries()) {
			// Check explicit junction table configurations
			if (config.junctionTables && config.junctionTables.length > 0) {
				for (const junction of config.junctionTables) {
					await this.db.createJunctionTable(junction, dropIfExists);
				}
			}

			// Check for implicit junction tables in many-to-many relationships
			if (config.relations) {
				for (const relation of config.relations) {
					if (relation.type === 'manyToMany' && relation.implicitJunction) {
						// Create junction table configuration from relation
						const junctionConfig = {
							table: relation.junctionTable,
							sourceEntity: relation.sourceEntity,
							targetEntity: relation.targetEntity,
							sourceColumn: relation.junctionSourceColumn,
							targetColumn: relation.junctionTargetColumn,
							extraColumns: relation.junctionExtraColumns
						};

						await this.db.createJunctionTable(junctionConfig, dropIfExists);
					}
				}
			}
		}
	}

	private async createForeignKeys(entities: Map<string, EntityConfig>): Promise<void> {
		this.logger.info('Creating foreign key constraints');

		for (const [entityName, config] of entities.entries()) {
			// Find columns with foreign keys
			const columnsWithForeignKeys = config.columns.filter(column => column.foreignKey);

			if (columnsWithForeignKeys.length === 0) {
				continue;
			}

			// For each foreign key column, add a constraint
			for (const column of columnsWithForeignKeys) {
				try {
					let referencedTable: string;
					let referencedColumn: string;

					// Handle both string and object formats for foreign keys
					if (typeof column.foreignKey === 'string') {
						const parts = column.foreignKey.split('.');
						if (parts.length !== 2) {
							this.logger.warn(`Invalid foreign key format for column ${column.logical}: ${column.foreignKey}`);
							continue;
						}
						[referencedTable, referencedColumn] = parts;
					} else if (column.foreignKey && typeof column.foreignKey === 'object') {
						referencedTable = column.foreignKey.table;
						referencedColumn = Array.isArray(column.foreignKey.columns)
							? column.foreignKey.columns[0]
							: column.foreignKey.columns;
					} else {
						this.logger.warn(`Invalid foreign key format for column ${column.logical}`);
						continue;
					}

					// Create constraint name
					const constraintName = `fk_${config.table}_${column.physical}_${referencedTable}_${referencedColumn}`;

					// Let the adapter handle foreign key creation
					await this.db.createForeignKeyConstraint(
						config.table,
						column.physical,
						referencedTable,
						referencedColumn,
						constraintName
					);
				} catch (error: any) {
					this.logger.error(`Error adding foreign key for column ${column.logical}: ${error.message}`);
					// Continue with other foreign keys even if one fails
				}
			}
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