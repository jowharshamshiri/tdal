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

			// Create junction tables for many-to-many relationships
			await this.createJunctionTables(entities, { dropIfExists: dropTables, dialect });

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
			// Check if table exists
			const tableExists = await this.tableExists(tableName);

			// Drop table if requested and it exists
			if (dropIfExists && tableExists) {
				await this.dropTable(tableName);
				this.logger.info(`Dropped table ${tableName}`);
			}

			// Skip creation if table already exists
			if (tableExists && !dropIfExists) {
				this.logger.debug(`Table ${tableName} already exists, skipping creation`);
				return;
			}

			// Generate CREATE TABLE SQL using column definitions
			const createTableSQL = this.generateCreateTableSQL(entity, dialect);

			// Execute the statement through the database adapter
			await this.db.execute(createTableSQL);

			this.logger.info(`Created table ${tableName}`);
		} catch (error: any) {
			this.logger.error(`Error creating table ${tableName}: ${error.message}`);
			throw error;
		}
	}

	/**
 * Generate CREATE TABLE SQL statement
 * @param entity Entity configuration
 * @param dialect SQL dialect
 * @returns CREATE TABLE SQL statement
 */
	private generateCreateTableSQL(entity: EntityConfig, dialect: 'sqlite' | 'mysql' | 'postgres'): string {
		const tableName = entity.table;
		let sql = `CREATE TABLE ${tableName} (\n`;

		// Add columns
		const columnDefinitions = entity.columns.map(column => {
			const columnType = getSqlColumnType(column, dialect);
			let definition = `${column.physical} ${columnType}`;

			// Add constraints
			if (column.primaryKey) {
				if (!Array.isArray(entity.idField) || entity.idField.length === 1) {
					definition += ' PRIMARY KEY';
				}
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

		// Add composite primary key if needed
		if (Array.isArray(entity.idField) && entity.idField.length > 1) {
			const pkColumns = entity.idField.map(fieldName => {
				const column = entity.columns.find(col => col.logical === fieldName);
				return column ? column.physical : fieldName;
			});

			sql += ',\n';
			sql += `PRIMARY KEY (${pkColumns.join(', ')})`;
		}

		sql += '\n)';

		return sql;
	}

	/**
 * Create junction tables for many-to-many relationships
 * @param entities Entity configurations
 * @param options Table creation options
 */
	async createJunctionTables(
		entities: Map<string, EntityConfig>,
		options: { dropIfExists?: boolean; dialect?: 'sqlite' | 'mysql' | 'postgres' } = {}
	): Promise<void> {
		this.logger.info('Creating junction tables for many-to-many relationships');

		for (const [entityName, config] of entities.entries()) {
			// Check explicit junction table configurations
			if (config.junctionTables && config.junctionTables.length > 0) {
				for (const junction of config.junctionTables) {
					await this.createJunctionTable(junction, options);
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

						await this.createJunctionTable(junctionConfig, options);
					}
				}
			}
		}
	}

	/**
	 * Create a single junction table
	 * @param junction Junction table configuration
	 * @param options Table creation options
	 */
	private async createJunctionTable(
		junction: any,
		options: { dropIfExists?: boolean; dialect?: 'sqlite' | 'mysql' | 'postgres' } = {}
	): Promise<void> {
		const { dropIfExists = false, dialect = 'sqlite' } = options;
		const tableName = junction.table;

		try {
			// Check if table exists
			const tableExists = await this.tableExists(tableName);

			// Drop table if requested and it exists
			if (dropIfExists && tableExists) {
				await this.dropTable(tableName);
				this.logger.info(`Dropped junction table ${tableName}`);
			}

			// Skip creation if table already exists
			if (tableExists && !dropIfExists) {
				this.logger.debug(`Junction table ${tableName} already exists, skipping creation`);
				return;
			}

			// Generate SQL for junction table
			let sql = `CREATE TABLE ${tableName} (\n`;

			// Add source columns
			const sourceColumns = Array.isArray(junction.sourceColumn)
				? junction.sourceColumn
				: [junction.sourceColumn];

			sourceColumns.forEach(column => {
				sql += `  ${column} INTEGER NOT NULL,\n`;
			});

			// Add target columns
			const targetColumns = Array.isArray(junction.targetColumn)
				? junction.targetColumn
				: [junction.targetColumn];

			targetColumns.forEach(column => {
				sql += `  ${column} INTEGER NOT NULL,\n`;
			});

			// Add extra columns if defined
			if (junction.extraColumns) {
				for (const col of junction.extraColumns) {
					const columnType = this.getColumnType(col.type, dialect);
					const nullableStr = col.nullable === false ? ' NOT NULL' : '';
					let defaultStr = '';

					if (col.defaultValue !== undefined) {
						if (typeof col.defaultValue === 'string') {
							defaultStr = ` DEFAULT '${col.defaultValue}'`;
						} else if (col.defaultValue === null) {
							defaultStr = ' DEFAULT NULL';
						} else {
							defaultStr = ` DEFAULT ${col.defaultValue}`;
						}
					}

					sql += `  ${col.name} ${columnType}${nullableStr}${defaultStr},\n`;
				}
			}

			// Add primary key constraint
			const pkColumns = [...sourceColumns, ...targetColumns];
			sql += `  PRIMARY KEY (${pkColumns.join(', ')})\n`;

			sql += ')';

			// Execute the SQL
			await this.db.execute(sql);
			this.logger.info(`Created junction table ${tableName}`);
		} catch (error: any) {
			this.logger.error(`Error creating junction table ${tableName}: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Get SQL column type based on type name
	 * Simple utility function for junction table creation
	 */
	private getColumnType(type: string, dialect: 'sqlite' | 'mysql' | 'postgres'): string {
		type = type.toLowerCase();

		switch (dialect) {
			case 'sqlite':
				if (type === 'string' || type === 'text') return 'TEXT';
				if (type === 'integer' || type === 'int') return 'INTEGER';
				if (type === 'number' || type === 'float' || type === 'decimal') return 'REAL';
				if (type === 'boolean') return 'INTEGER';
				if (type === 'date' || type === 'datetime') return 'TEXT';
				if (type === 'json') return 'TEXT';
				return 'TEXT';

			case 'mysql':
				if (type === 'string') return 'VARCHAR(255)';
				if (type === 'text') return 'TEXT';
				if (type === 'integer' || type === 'int') return 'INT';
				if (type === 'number' || type === 'float') return 'FLOAT';
				if (type === 'decimal') return 'DECIMAL(10,2)';
				if (type === 'boolean') return 'TINYINT(1)';
				if (type === 'date') return 'DATE';
				if (type === 'datetime') return 'DATETIME';
				if (type === 'json') return 'JSON';
				return 'VARCHAR(255)';

			case 'postgres':
				if (type === 'string') return 'VARCHAR(255)';
				if (type === 'text') return 'TEXT';
				if (type === 'integer' || type === 'int') return 'INTEGER';
				if (type === 'number' || type === 'float') return 'REAL';
				if (type === 'decimal') return 'DECIMAL(10,2)';
				if (type === 'boolean') return 'BOOLEAN';
				if (type === 'date') return 'DATE';
				if (type === 'datetime') return 'TIMESTAMP';
				if (type === 'json') return 'JSONB';
				return 'VARCHAR(255)';

			default:
				return 'TEXT';
		}
	}

	/**
	 * Drop a table if it exists
	 * @param tableName Table name
	 */
	private async dropTable(tableName: string): Promise<void> {
		await this.db.execute(`DROP TABLE IF EXISTS ${tableName}`);
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

				try {
					// Generate and execute ALTER TABLE SQL
					const alterTableSQL = this.generateForeignKeySQL(
						tableName,
						column.physical,
						referencedTable,
						referencedColumn,
						constraintName
					);

					await this.db.execute(alterTableSQL);
					this.logger.info(`Added foreign key constraint ${constraintName} to table ${tableName}`);
				} catch (error: any) {
					this.logger.error(`Error adding foreign key for column ${column.logical}: ${error.message}`, { cause: error });
					// Continue with other foreign keys even if one fails
				}
			}
		} catch (error: any) {
			this.logger.error(`Error adding foreign keys to table ${tableName}: ${error.message}`, { cause: error });
			// Don't throw here - continue with other tables even if foreign keys fail
		}
	}

	/**
	 * Generate ALTER TABLE SQL for foreign key
	 * @param tableName Table name
	 * @param columnName Column name
	 * @param referencedTable Referenced table name
	 * @param referencedColumn Referenced column name
	 * @param constraintName Constraint name
	 * @returns ALTER TABLE SQL statement
	 */
	private generateForeignKeySQL(
		tableName: string,
		columnName: string,
		referencedTable: string,
		referencedColumn: string,
		constraintName: string
	): string {
		let sql = `ALTER TABLE ${tableName} ADD CONSTRAINT ${constraintName} `;
		sql += `FOREIGN KEY (${columnName}) REFERENCES ${referencedTable}(${referencedColumn})`;
		sql += ' ON DELETE CASCADE ON UPDATE CASCADE';
		return sql;
	}

	/**
	 * Check if a table exists in the database
	 * @param tableName Table name
	 * @returns Whether the table exists
	 */
	async tableExists(tableName: string): Promise<boolean> {
		try {
			// This query is SQLite-specific; would need to adjust for other databases
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