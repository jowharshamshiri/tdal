/**
 * Migration Generator
 * Generates database migrations from entity changes
 */

import * as fs from 'fs';
import * as path from 'path';
import { EntityConfig, EntityColumn, Logger } from '../core/types';
import { getColumnDefinition } from '../entity/entity-schema';

/**
 * Migration operation types
 */
export enum MigrationType {
	CREATE_TABLE = 'CREATE_TABLE',
	DROP_TABLE = 'DROP_TABLE',
	ADD_COLUMN = 'ADD_COLUMN',
	REMOVE_COLUMN = 'REMOVE_COLUMN',
	MODIFY_COLUMN = 'MODIFY_COLUMN',
	ADD_INDEX = 'ADD_INDEX',
	REMOVE_INDEX = 'REMOVE_INDEX',
	ADD_FOREIGN_KEY = 'ADD_FOREIGN_KEY',
	REMOVE_FOREIGN_KEY = 'REMOVE_FOREIGN_KEY',
	RAW_SQL = 'RAW_SQL'
}

/**
 * Base migration operation interface
 */
export interface MigrationOperation {
	/** Operation type */
	type: MigrationType;
	/** Target table name */
	table?: string;
}

/**
 * Create table operation
 */
export interface CreateTableOperation extends MigrationOperation {
	type: MigrationType.CREATE_TABLE;
	table: string;
	/** Entity configuration */
	entity: EntityConfig;
}

/**
 * Drop table operation
 */
export interface DropTableOperation extends MigrationOperation {
	type: MigrationType.DROP_TABLE;
	table: string;
}

/**
 * Add column operation
 */
export interface AddColumnOperation extends MigrationOperation {
	type: MigrationType.ADD_COLUMN;
	table: string;
	/** Column to add */
	column: EntityColumn;
	/** Whether to automatically add index */
	addIndex?: boolean;
	/** SQL column definition */
	columnSql?: string;
}

/**
 * Remove column operation
 */
export interface RemoveColumnOperation extends MigrationOperation {
	type: MigrationType.REMOVE_COLUMN;
	table: string;
	/** Column name to remove */
	columnName: string;
}

/**
 * Modify column operation
 */
export interface ModifyColumnOperation extends MigrationOperation {
	type: MigrationType.MODIFY_COLUMN;
	table: string;
	/** Column name to modify */
	columnName: string;
	/** New column definition */
	column: EntityColumn;
	/** SQL column definition */
	columnSql?: string;
}

/**
 * Add index operation
 */
export interface AddIndexOperation extends MigrationOperation {
	type: MigrationType.ADD_INDEX;
	table: string;
	/** Index name */
	indexName: string;
	/** Columns in the index */
	columns: string[];
	/** Whether this is a unique index */
	unique?: boolean;
}

/**
 * Remove index operation
 */
export interface RemoveIndexOperation extends MigrationOperation {
	type: MigrationType.REMOVE_INDEX;
	table: string;
	/** Index name */
	indexName: string;
}

/**
 * Add foreign key operation
 */
export interface AddForeignKeyOperation extends MigrationOperation {
	type: MigrationType.ADD_FOREIGN_KEY;
	table: string;
	/** Foreign key name */
	foreignKeyName: string;
	/** Column in the source table */
	columnName: string;
	/** Referenced table */
	referencedTable: string;
	/** Referenced column */
	referencedColumn: string;
	/** Action on delete */
	onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
	/** Action on update */
	onUpdate?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
}

/**
 * Remove foreign key operation
 */
export interface RemoveForeignKeyOperation extends MigrationOperation {
	type: MigrationType.REMOVE_FOREIGN_KEY;
	table: string;
	/** Foreign key name */
	foreignKeyName: string;
}

/**
 * Raw SQL operation
 */
export interface RawSqlOperation extends MigrationOperation {
	type: MigrationType.RAW_SQL;
	/** SQL statement */
	sql: string;
}

/**
 * Migration definition
 */
export interface Migration {
	/** Migration ID */
	id: string;
	/** Migration name */
	name: string;
	/** Migration timestamp */
	timestamp: number;
	/** Migration operations */
	operations: MigrationOperation[];
}

/**
 * Migration generator class
 */
export class MigrationGenerator {
	/** SQL dialect to generate migrations for */
	private dialect: 'sqlite' | 'mysql' | 'postgres';
	/** Logger instance */
	private logger: Logger;
	/** Migrations directory */
	private migrationsDir: string;

	/**
	 * Constructor
	 * @param dialect SQL dialect
	 * @param migrationsDir Migrations directory
	 * @param logger Logger instance
	 */
	constructor(
		dialect: 'sqlite' | 'mysql' | 'postgres',
		migrationsDir: string,
		logger: Logger
	) {
		this.dialect = dialect;
		this.migrationsDir = migrationsDir;
		this.logger = logger;

		// Ensure migrations directory exists
		if (!fs.existsSync(migrationsDir)) {
			fs.mkdirSync(migrationsDir, { recursive: true });
		}
	}

	/**
	 * Generate a migration to create a table from an entity
	 * @param entity Entity configuration
	 * @param migrationName Migration name
	 * @returns Migration filename
	 */
	generateCreateTableMigration(entity: EntityConfig, migrationName?: string): string {
		const timestamp = Date.now();
		const name = migrationName || `create_${entity.table}_table`;
		const id = timestamp.toString();

		const migration: Migration = {
			id,
			name,
			timestamp,
			operations: [
				{
					type: MigrationType.CREATE_TABLE,
					table: entity.table,
					entity
				}
			]
		};

		return this.writeMigration(migration);
	}

	/**
	 * Generate a migration to add columns to a table
	 * @param tableName Table name
	 * @param columns Columns to add
	 * @param migrationName Migration name
	 * @returns Migration filename
	 */
	generateAddColumnsMigration(
		tableName: string,
		columns: EntityColumn[],
		migrationName?: string
	): string {
		const timestamp = Date.now();
		const name = migrationName || `add_columns_to_${tableName}`;
		const id = timestamp.toString();

		const operations: MigrationOperation[] = columns.map(column => ({
			type: MigrationType.ADD_COLUMN,
			table: tableName,
			column,
			columnSql: getColumnDefinition(column, this.dialect)
		}));

		const migration: Migration = {
			id,
			name,
			timestamp,
			operations
		};

		return this.writeMigration(migration);
	}

	/**
	 * Generate a migration to remove columns from a table
	 * @param tableName Table name
	 * @param columnNames Column names to remove
	 * @param migrationName Migration name
	 * @returns Migration filename
	 */
	generateRemoveColumnsMigration(
		tableName: string,
		columnNames: string[],
		migrationName?: string
	): string {
		const timestamp = Date.now();
		const name = migrationName || `remove_columns_from_${tableName}`;
		const id = timestamp.toString();

		const operations: MigrationOperation[] = columnNames.map(columnName => ({
			type: MigrationType.REMOVE_COLUMN,
			table: tableName,
			columnName
		}));

		const migration: Migration = {
			id,
			name,
			timestamp,
			operations
		};

		return this.writeMigration(migration);
	}

	/**
	 * Generate a migration to create a relationship
	 * @param sourceEntity Source entity
	 * @param targetEntity Target entity
	 * @param relation Relation name
	 * @param migrationName Migration name
	 * @returns Migration filename
	 */
	generateRelationshipMigration(
		sourceEntity: EntityConfig,
		targetEntity: EntityConfig,
		relation: any,
		migrationName?: string
	): string {
		const timestamp = Date.now();
		const name = migrationName || `add_${relation.name}_relationship`;
		const id = timestamp.toString();

		let operations: MigrationOperation[] = [];

		// Handle different relationship types
		switch (relation.type) {
			case 'oneToOne':
			case 'manyToOne':
				// Add foreign key column if not exists
				operations.push({
					type: MigrationType.ADD_COLUMN,
					table: sourceEntity.table,
					column: {
						logical: relation.sourceColumn,
						physical: relation.sourceColumn,
						type: 'integer',
						nullable: true,
						foreignKey: `${targetEntity.table}.${relation.targetColumn}`
					}
				});

				// Add foreign key constraint
				operations.push({
					type: MigrationType.ADD_FOREIGN_KEY,
					table: sourceEntity.table,
					foreignKeyName: `fk_${sourceEntity.table}_${relation.sourceColumn}`,
					columnName: relation.sourceColumn,
					referencedTable: targetEntity.table,
					referencedColumn: relation.targetColumn,
					onDelete: 'SET NULL',
					onUpdate: 'CASCADE'
				});
				break;

			case 'manyToMany':
				// Create junction table if relation owns it
				if (!relation.inverseName || relation.inverseName > relation.name) {
					const junctionTableOp: CreateTableOperation = {
						type: MigrationType.CREATE_TABLE,
						table: relation.junctionTable,
						entity: {
							entity: '',
							table: relation.junctionTable,
							idField: '',
							columns: [
								{
									logical: relation.junctionSourceColumn,
									physical: relation.junctionSourceColumn,
									type: 'integer',
									nullable: false,
									foreignKey: `${sourceEntity.table}.${relation.sourceColumn}`
								},
								{
									logical: relation.junctionTargetColumn,
									physical: relation.junctionTargetColumn,
									type: 'integer',
									nullable: false,
									foreignKey: `${targetEntity.table}.${relation.targetColumn}`
								}
							]
						}
					};

					operations.push(junctionTableOp);

					// Add indexes
					operations.push({
						type: MigrationType.ADD_INDEX,
						table: relation.junctionTable,
						indexName: `idx_${relation.junctionTable}_source`,
						columns: [relation.junctionSourceColumn]
					});

					operations.push({
						type: MigrationType.ADD_INDEX,
						table: relation.junctionTable,
						indexName: `idx_${relation.junctionTable}_target`,
						columns: [relation.junctionTargetColumn]
					});

					// Add unique index for the pair
					operations.push({
						type: MigrationType.ADD_INDEX,
						table: relation.junctionTable,
						indexName: `idx_${relation.junctionTable}_unique`,
						columns: [relation.junctionSourceColumn, relation.junctionTargetColumn],
						unique: true
					});

					// Add foreign keys
					operations.push({
						type: MigrationType.ADD_FOREIGN_KEY,
						table: relation.junctionTable,
						foreignKeyName: `fk_${relation.junctionTable}_source`,
						columnName: relation.junctionSourceColumn,
						referencedTable: sourceEntity.table,
						referencedColumn: relation.sourceColumn,
						onDelete: 'CASCADE',
						onUpdate: 'CASCADE'
					});

					operations.push({
						type: MigrationType.ADD_FOREIGN_KEY,
						table: relation.junctionTable,
						foreignKeyName: `fk_${relation.junctionTable}_target`,
						columnName: relation.junctionTargetColumn,
						referencedTable: targetEntity.table,
						referencedColumn: relation.targetColumn,
						onDelete: 'CASCADE',
						onUpdate: 'CASCADE'
					});
				}
				break;
		}

		const migration: Migration = {
			id,
			name,
			timestamp,
			operations
		};

		return this.writeMigration(migration);
	}

	/**
	 * Generate a raw SQL migration
	 * @param sql SQL statement
	 * @param migrationName Migration name
	 * @returns Migration filename
	 */
	generateRawSqlMigration(sql: string, migrationName: string): string {
		const timestamp = Date.now();
		const id = timestamp.toString();

		const migration: Migration = {
			id,
			name: migrationName,
			timestamp,
			operations: [
				{
					type: MigrationType.RAW_SQL,
					sql
				}
			]
		};

		return this.writeMigration(migration);
	}

	/**
	 * Generate a migration from entity changes
	 * @param oldEntity Previous entity state
	 * @param newEntity Current entity state
	 * @param migrationName Migration name
	 * @returns Migration filename
	 */
	generateEntityChangeMigration(
		oldEntity: EntityConfig | null,
		newEntity: EntityConfig,
		migrationName?: string
	): string {
		const timestamp = Date.now();
		const name = migrationName || `update_${newEntity.table}`;
		const id = timestamp.toString();

		const operations: MigrationOperation[] = [];

		if (!oldEntity) {
			// New entity, create table
			operations.push({
				type: MigrationType.CREATE_TABLE,
				table: newEntity.table,
				entity: newEntity
			});
		} else {
			// Existing entity, detect changes

			// Check for table rename
			if (oldEntity.table !== newEntity.table) {
				// SQLite doesn't support renaming tables directly in all versions
				// For simplicity, we'll create a new table and copy the data
				operations.push({
					type: MigrationType.RAW_SQL,
					sql: this.generateTableRenameSql(oldEntity.table, newEntity.table)
				});
			}

			// Find added columns
			const oldColumns = new Set(oldEntity.columns.map(col => col.logical));
			const newColumns = new Set(newEntity.columns.map(col => col.logical));

			const addedColumns = newEntity.columns.filter(col => !oldColumns.has(col.logical));

			for (const column of addedColumns) {
				operations.push({
					type: MigrationType.ADD_COLUMN,
					table: newEntity.table,
					column,
					columnSql: getColumnDefinition(column, this.dialect)
				});
			}

			// Find removed columns
			const removedColumnNames = Array.from(oldColumns).filter(col => !newColumns.has(col));

			for (const columnName of removedColumnNames) {
				const column = oldEntity.columns.find(col => col.logical === columnName);
				if (column) {
					operations.push({
						type: MigrationType.REMOVE_COLUMN,
						table: newEntity.table,
						columnName: column.physical
					});
				}
			}

			// Find modified columns
			const commonColumns = newEntity.columns.filter(col => oldColumns.has(col.logical));

			for (const newColumn of commonColumns) {
				const oldColumn = oldEntity.columns.find(col => col.logical === newColumn.logical);

				if (oldColumn && this.columnHasChanged(oldColumn, newColumn)) {
					operations.push({
						type: MigrationType.MODIFY_COLUMN,
						table: newEntity.table,
						columnName: oldColumn.physical,
						column: newColumn,
						columnSql: getColumnDefinition(newColumn, this.dialect)
					});
				}
			}

			// TODO: Detect changes in indexes and foreign keys
		}

		const migration: Migration = {
			id,
			name,
			timestamp,
			operations
		};

		return this.writeMigration(migration);
	}

	/**
	 * Generate SQL for a migration
	 * @param migration Migration definition
	 * @returns SQL statements
	 */
	generateMigrationSql(migration: Migration): string {
		const statements: string[] = [];

		for (const operation of migration.operations) {
			const sql = this.generateOperationSql(operation);
			if (sql) {
				statements.push(sql);
			}
		}

		if (this.dialect === 'sqlite') {
			// For SQLite, add PRAGMA foreign_keys = OFF/ON around the migration
			statements.unshift('PRAGMA foreign_keys = OFF;');
			statements.push('PRAGMA foreign_keys = ON;');
		}

		return statements.join('\n\n');
	}

	/**
	 * Generate SQL for a migration operation
	 * @param operation Migration operation
	 * @returns SQL statement
	 */
	private generateOperationSql(operation: MigrationOperation): string {
		switch (operation.type) {
			case MigrationType.CREATE_TABLE:
				return this.generateCreateTableSql(operation as CreateTableOperation);
			case MigrationType.DROP_TABLE:
				return this.generateDropTableSql(operation as DropTableOperation);
			case MigrationType.ADD_COLUMN:
				return this.generateAddColumnSql(operation as AddColumnOperation);
			case MigrationType.REMOVE_COLUMN:
				return this.generateRemoveColumnSql(operation as RemoveColumnOperation);
			case MigrationType.MODIFY_COLUMN:
				return this.generateModifyColumnSql(operation as ModifyColumnOperation);
			case MigrationType.ADD_INDEX:
				return this.generateAddIndexSql(operation as AddIndexOperation);
			case MigrationType.REMOVE_INDEX:
				return this.generateRemoveIndexSql(operation as RemoveIndexOperation);
			case MigrationType.ADD_FOREIGN_KEY:
				return this.generateAddForeignKeySql(operation as AddForeignKeyOperation);
			case MigrationType.REMOVE_FOREIGN_KEY:
				return this.generateRemoveForeignKeySql(operation as RemoveForeignKeyOperation);
			case MigrationType.RAW_SQL:
				return (operation as RawSqlOperation).sql;
			default:
				this.logger.warn(`Unknown migration operation type: ${(operation as any).type}`);
				return '';
		}
	}

	/**
	 * Generate SQL to create a table
	 * @param operation Create table operation
	 * @returns SQL statement
	 */
	private generateCreateTableSql(operation: CreateTableOperation): string {
		const { table, entity } = operation;
		let sql = `CREATE TABLE ${table} (\n`;

		// Add column definitions
		const columnDefs = entity.columns.map(column => {
			return `  ${getColumnDefinition(column, this.dialect)}`;
		});

		sql += columnDefs.join(',\n');

		// Add primary key if not in a column
		const pkColumn = entity.columns.find(col => col.primaryKey);
		if (!pkColumn && entity.idField) {
			const idColumn = entity.columns.find(col => col.logical === entity.idField);
			if (idColumn) {
				sql += `,\n  PRIMARY KEY (${idColumn.physical})`;
			}
		}

		// Add foreign key constraints
		const foreignKeyColumns = entity.columns.filter(col => col.foreignKey);
		if (foreignKeyColumns.length > 0) {
			for (const column of foreignKeyColumns) {
				const [refTable, refColumn] = column.foreignKey!.split('.');
				sql += `,\n  FOREIGN KEY (${column.physical}) REFERENCES ${refTable}(${refColumn})`;
			}
		}

		sql += '\n);';

		// Add indexes
		if (entity.columns.some(col => col.unique)) {
			for (const column of entity.columns.filter(col => col.unique)) {
				sql += `\n\nCREATE UNIQUE INDEX idx_${table}_${column.physical}_unique ON ${table} (${column.physical});`;
			}
		}

		return sql;
	}

	/**
	 * Generate SQL to drop a table
	 * @param operation Drop table operation
	 * @returns SQL statement
	 */
	private generateDropTableSql(operation: DropTableOperation): string {
		return `DROP TABLE ${operation.table};`;
	}

	/**
	 * Generate SQL to add a column
	 * @param operation Add column operation
	 * @returns SQL statement
	 */
	private generateAddColumnSql(operation: AddColumnOperation): string {
		const { table, column, columnSql } = operation;

		let sql = `ALTER TABLE ${table} ADD `;

		if (columnSql) {
			sql += columnSql;
		} else {
			sql += `${column.physical} ${getColumnDefinition(column, this.dialect)}`;
		}

		sql += ';';

		// Add index if requested
		if (operation.addIndex) {
			sql += `\n\nCREATE INDEX idx_${table}_${column.physical} ON ${table} (${column.physical});`;
		}

		// Add unique constraint if needed
		if (column.unique) {
			sql += `\n\nCREATE UNIQUE INDEX idx_${table}_${column.physical}_unique ON ${table} (${column.physical});`;
		}

		return sql;
	}

	/**
	 * Generate SQL to remove a column
	 * @param operation Remove column operation
	 * @returns SQL statement
	 */
	private generateRemoveColumnSql(operation: RemoveColumnOperation): string {
		const { table, columnName } = operation;

		if (this.dialect === 'sqlite') {
			// SQLite doesn't support dropping columns directly
			this.logger.warn('SQLite does not support dropping columns directly');
			return `-- Cannot drop column ${columnName} from ${table} in SQLite, need to recreate table`;
		}

		return `ALTER TABLE ${table} DROP COLUMN ${columnName};`;
	}

	/**
	 * Generate SQL to modify a column
	 * @param operation Modify column operation
	 * @returns SQL statement
	 */
	private generateModifyColumnSql(operation: ModifyColumnOperation): string {
		const { table, columnName, column, columnSql } = operation;

		if (this.dialect === 'sqlite') {
			// SQLite doesn't support modifying columns directly
			this.logger.warn('SQLite does not support modifying columns directly');
			return `-- Cannot modify column ${columnName} in ${table} in SQLite, need to recreate table`;
		}

		let sql: string;

		switch (this.dialect) {
			case 'mysql':
				sql = `ALTER TABLE ${table} MODIFY COLUMN `;
				if (columnSql) {
					sql += columnSql;
				} else {
					sql += `${column.physical} ${getColumnDefinition(column, this.dialect)}`;
				}
				break;
			case 'postgres':
				// PostgreSQL uses multiple statements to modify a column
				sql = `ALTER TABLE ${table} ALTER COLUMN ${columnName} TYPE `;
				if (column.type) {
					sql += `${getColumnDefinition(column, this.dialect).split(' ')[0]}`;
				} else {
					sql += 'TEXT';
				}

				// Handle nullability
				if (column.nullable === false) {
					sql += `;\nALTER TABLE ${table} ALTER COLUMN ${columnName} SET NOT NULL`;
				} else if (column.nullable === true) {
					sql += `;\nALTER TABLE ${table} ALTER COLUMN ${columnName} DROP NOT NULL`;
				}
				break;
			default:
				return `-- Cannot modify column ${columnName} in ${table} in ${this.dialect}`;
		}

		return sql + ';';
	}

	/**
	 * Generate SQL to add an index
	 * @param operation Add index operation
	 * @returns SQL statement
	 */
	private generateAddIndexSql(operation: AddIndexOperation): string {
		const { table, indexName, columns, unique } = operation;

		const uniqueStr = unique ? 'UNIQUE ' : '';
		return `CREATE ${uniqueStr}INDEX ${indexName} ON ${table} (${columns.join(', ')});`;
	}

	/**
	 * Generate SQL to remove an index
	 * @param operation Remove index operation
	 * @returns SQL statement
	 */
	private generateRemoveIndexSql(operation: RemoveIndexOperation): string {
		const { indexName } = operation;

		switch (this.dialect) {
			case 'mysql':
				return `DROP INDEX ${indexName} ON ${operation.table};`;
			case 'postgres':
			case 'sqlite':
			default:
				return `DROP INDEX ${indexName};`;
		}
	}

	/**
	 * Generate SQL to add a foreign key
	 * @param operation Add foreign key operation
	 * @returns SQL statement
	 */
	private generateAddForeignKeySql(operation: AddForeignKeyOperation): string {
		const {
			table,
			foreignKeyName,
			columnName,
			referencedTable,
			referencedColumn,
			onDelete,
			onUpdate
		} = operation;

		let sql = `ALTER TABLE ${table} ADD CONSTRAINT ${foreignKeyName} `;
		sql += `FOREIGN KEY (${columnName}) REFERENCES ${referencedTable}(${referencedColumn})`;

		if (onDelete) {
			sql += ` ON DELETE ${onDelete}`;
		}

		if (onUpdate) {
			sql += ` ON UPDATE ${onUpdate}`;
		}

		return sql + ';';
	}

	/**
	 * Generate SQL to remove a foreign key
	 * @param operation Remove foreign key operation
	 * @returns SQL statement
	 */
	private generateRemoveForeignKeySql(operation: RemoveForeignKeyOperation): string {
		const { table, foreignKeyName } = operation;

		switch (this.dialect) {
			case 'mysql':
			case 'postgres':
				return `ALTER TABLE ${table} DROP CONSTRAINT ${foreignKeyName};`;
			case 'sqlite':
				// SQLite doesn't support dropping foreign keys
				return `-- Cannot drop foreign key ${foreignKeyName} in SQLite`;
			default:
				return `ALTER TABLE ${table} DROP CONSTRAINT ${foreignKeyName};`;
		}
	}

	/**
	 * Generate SQL to rename a table
	 * @param oldTable Old table name
	 * @param newTable New table name
	 * @returns SQL statement
	 */
	private generateTableRenameSql(oldTable: string, newTable: string): string {
		switch (this.dialect) {
			case 'sqlite':
			case 'mysql':
			case 'postgres':
				return `ALTER TABLE ${oldTable} RENAME TO ${newTable};`;
			default:
				return `ALTER TABLE ${oldTable} RENAME TO ${newTable};`;
		}
	}

	/**
	 * Write a migration to a file
	 * @param migration Migration definition
	 * @returns Migration filename
	 */
	private writeMigration(migration: Migration): string {
		const filename = `${migration.timestamp}_${migration.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.js`;
		const filePath = path.join(this.migrationsDir, filename);

		const migrationSql = this.generateMigrationSql(migration);

		const content = `/**
 * Migration: ${migration.name}
 * Created at: ${new Date(migration.timestamp).toISOString()}
 */
 
/**
 * Run the migration
 * @param db Database adapter
 */
exports.up = async function(db) {
  // Migration operations
${migrationSql.split('\n').map(line => `  await db.executeScript(\`${line}\`);`).join('\n')}
};

/**
 * Revert the migration
 * @param db Database adapter
 */
exports.down = async function(db) {
  // TODO: Implement down migration
};

/**
 * Migration metadata
 */
exports.metadata = ${JSON.stringify({
			id: migration.id,
			name: migration.name,
			timestamp: migration.timestamp
		}, null, 2)};
`;

		fs.writeFileSync(filePath, content, 'utf8');
		this.logger.info(`Generated migration: ${filename}`);

		return filename;
	}

	/**
	 * Check if a column has changed
	 * @param oldColumn Old column definition
	 * @param newColumn New column definition
	 * @returns Whether the column has changed
	 */
	private columnHasChanged(oldColumn: EntityColumn, newColumn: EntityColumn): boolean {
		// Check if physical name changed
		if (oldColumn.physical !== newColumn.physical) {
			return true;
		}

		// Check if type changed
		if (oldColumn.type !== newColumn.type) {
			return true;
		}

		// Check if nullability changed
		if (oldColumn.nullable !== newColumn.nullable) {
			return true;
		}

		// Check if uniqueness changed
		if (oldColumn.unique !== newColumn.unique) {
			return true;
		}

		// Check if foreign key changed
		if (oldColumn.foreignKey !== newColumn.foreignKey) {
			return true;
		}

		return false;
	}
}