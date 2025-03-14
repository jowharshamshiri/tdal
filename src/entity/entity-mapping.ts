/**
 * Entity mapping definitions
 * Provides the mapping between entities and database tables/columns
 */

import { EntityApiConfig, Workflow } from "@/core/types";
import { Relation } from "../database/orm/relation-types";

/**
 * Column mapping type
 * Maps a logical column name to its physical representation
 */
export interface ColumnMapping {
	/**
	 * Logical column name (used in code)
	 */
	logical: string;

	/**
	 * Physical column name (in database)
	 */
	physical: string;

	/**
	 * Column data type
	 */
	type?: string;

	/**
	 * Whether this column is the primary key
	 */
	primaryKey?: boolean;

	/**
	 * Whether this column is auto-incrementing
	 */
	autoIncrement?: boolean;

	/**
	 * Whether this column allows NULL values
	 */
	nullable?: boolean;

	/**
	 * Default value for the column
	 */
	defaultValue?: unknown;

	/**
	 * Whether this column is unique
	 */
	unique?: boolean;

	/**
	 * Column comment/description
	 */
	comment?: string;

	/**
	 * Column length (for string types)
	 */
	length?: number;

	/**
	 * Column precision (for numeric types)
	 */
	precision?: number;

	/**
	 * Column scale (for numeric types)
	 */
	scale?: number;

	/**
	 * Whether this column should be indexed
	 */
	index?: boolean | string;

	/**
	 * Foreign key reference (table.column)
	 */
	foreignKey?: string;

	/**
	 * Whether this column is a timestamp managed by the ORM
	 */
	managedTimestamp?: 'create' | 'update' | 'delete';

	/**
	 * Custom database-specific options
	 */
	options?: Record<string, unknown>;
}

/**
 * Index definition
 */
export interface IndexMapping {
	/**
	 * Index name
	 */
	name: string;

	/**
	 * Columns included in the index (logical names)
	 */
	columns: string[];

	/**
	 * Whether this is a unique index
	 */
	unique?: boolean;

	/**
	 * Index type (database-specific)
	 */
	type?: string;

	/**
	 * Whether this is a fulltext index
	 */
	fulltext?: boolean;

	/**
	 * Whether this is a spatial index
	 */
	spatial?: boolean;

	/**
	 * Where condition for partial indexes (database-specific)
	 */
	where?: string;
}

/**
 * Computed property definition
 * Represents a property whose value is derived from other entity properties
 */
export interface ComputedProperty {
	/**
	 * Property name
	 */
	name: string;

	/**
	 * Properties this computed property depends on
	 */
	dependencies?: string[];

	/**
	 * Inline implementation or path to external file
	 */
	implementation: string;

	/**
	 * Whether this property should be cached
	 */
	cache?: boolean;

	/**
	 * Description of the computed property
	 */
	description?: string;
}

/**
 * Entity hook definition
 */
export interface EntityHook {
	/**
	 * Hook name
	 */
	name: string;

	/**
	 * Inline implementation or path to external file
	 */
	implementation: string;

	/**
	 * Optional condition for hook execution
	 */
	condition?: string;

	/**
	 * Hook priority (lower numbers run first)
	 */
	priority?: number;

	/**
	 * Whether the hook should be async
	 */
	async?: boolean;
}


/**
 * Validation rules by field
 */
export interface ValidationRules {
	/**
	 * Field-specific validation rules
	 */
	[field: string]: ValidationRule[];
}

/**
 * Entity validation rule
 */
export interface ValidationRule {
	/**
	 * Rule type
	 */
	type: 'required' | 'minLength' | 'maxLength' | 'min' | 'max' | 'pattern' | 'email' | 'custom';

	/**
	 * Rule value (if applicable)
	 */
	value?: any;

	/**
	 * Error message
	 */
	message: string;

	/**
	 * Custom implementation for custom rules
	 */
	implementation?: string;
}

/**
 * Entity validation rules
 */
export interface EntityValidation {
	/**
	 * Field-specific validation rules
	 */
	rules: Record<string, ValidationRule[]>;
}

/**
 * Entity mapping interface
 * Maps an entity to its database representation
 */
export interface EntityMapping {
	/**
	 * Entity name (logical)
	 */
	entity: string;

	/**
	 * Database table name (logical)
	 */
	table: string;

	/**
	 * Primary key field name (logical)
	 */
	idField: string;

	/**
	 * Optional schema name
	 */
	schema?: string;

	/**
	 * Column mappings
	 */
	columns: ColumnMapping[];

	/**
	 * Entity relationships
	 */
	relations?: Relation[];

	/**
	 * Table indexes
	 */
	indexes?: IndexMapping[];

	/**
	 * Whether soft delete is enabled
	 */
	softDelete?: {
		/**
		 * Column used for soft deletes
		 */
		column: string;

		/**
		 * Value indicating a deleted record
		 */
		deletedValue: unknown;

		/**
		 * Value indicating a non-deleted record
		 */
		nonDeletedValue: unknown;
	};

	/**
	 * Timestamp columns
	 */
	timestamps?: {
		/**
		 * Created at column name
		 */
		createdAt?: string;

		/**
		 * Updated at column name
		 */
		updatedAt?: string;

		/**
		 * Deleted at column name (for soft deletes)
		 */
		deletedAt?: string;
	};

	/**
	 * Hooks for entity lifecycle events
	 */
	hooks?: {
		/**
		 * Before create hooks
		 */
		beforeCreate?: EntityHook[];

		/**
		 * After create hooks
		 */
		afterCreate?: EntityHook[];

		/**
		 * Before update hooks
		 */
		beforeUpdate?: EntityHook[];

		/**
		 * After update hooks
		 */
		afterUpdate?: EntityHook[];

		/**
		 * Before delete hooks
		 */
		beforeDelete?: EntityHook[];

		/**
		 * After delete hooks
		 */
		afterDelete?: EntityHook[];

		/**
		 * Before find hooks
		 */
		beforeFind?: EntityHook[];

		/**
		 * After find hooks
		 */
		afterFind?: EntityHook[];
	};

	/**
	 * Computed properties
	 */
	computed?: ComputedProperty[];

	/**
	 * API configuration
	 */
	api?: EntityApiConfig;

	/**
	 * Entity workflows
	 */
	workflows?: Workflow[];

	/**
	 * Validation rules
	 */
	validation?: EntityValidation;

	/**
	 * Custom actions
	 */
	actions?: {
		/**
		 * Action name
		 */
		name: string;

		/**
		 * HTTP method
		 */
		method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

		/**
		 * Route path
		 */
		path: string;

		/**
		 * Implementation or path to external file
		 */
		implementation: string;

		/**
		 * Required roles
		 */
		roles?: string[];
	}[];

	/**
	 * Custom database-specific options
	 */
	options?: Record<string, unknown>;
}

/**
 * Column selector type
 */
export type ColumnSelector<T> = Array<keyof T>;

/**
 * Find a column mapping by logical name
 *
 * @param mapping Entity mapping
 * @param logicalName Logical column name
 * @returns Column mapping or undefined if not found
 */
export function findColumnMapping(
	mapping: EntityMapping,
	logicalName: string
): ColumnMapping | undefined {
	return mapping.columns.find((col) => col.logical === logicalName);
}

/**
 * Get the primary key column mapping
 *
 * @param mapping Entity mapping
 * @returns Primary key column mapping
 */
export function getPrimaryKeyMapping(mapping: EntityMapping): ColumnMapping {
	const pkColumn = mapping.columns.find((col) => col.primaryKey);

	if (!pkColumn) {
		// Default to idField if no column is explicitly marked as primary key
		const idColumn = mapping.columns.find(
			(col) => col.logical === mapping.idField
		);

		if (!idColumn) {
			throw new Error(
				`No primary key column found for entity ${mapping.entity}`
			);
		}

		return idColumn;
	}

	return pkColumn;
}

/**
 * Maps logical column names to physical column names
 *
 * @param mapping Entity mapping
 * @param logicalNames Array of logical column names
 * @returns Array of physical column names
 */
export function mapColumnsToPhysical(
	mapping: EntityMapping,
	logicalNames: string[]
): string[] {
	return logicalNames.map((name) => {
		const column = findColumnMapping(mapping, name);
		return column ? column.physical : name;
	});
}

/**
 * Maps logical column name to physical column name
 *
 * @param mapping Entity mapping
 * @param logicalName Logical column name
 * @returns Physical column name
 */
export function mapColumnToPhysical(
	mapping: EntityMapping,
	logicalName: string
): string {
	const column = findColumnMapping(mapping, logicalName);
	return column ? column.physical : logicalName;
}

/**
 * Convert a record with logical column names to physical column names
 *
 * @param mapping Entity mapping
 * @param record Record with logical column names
 * @returns Record with physical column names
 */
export function mapRecordToPhysical(
	mapping: EntityMapping,
	record: Record<string, unknown>
): Record<string, unknown> {
	const result: Record<string, unknown> = {};

	for (const [logicalName, value] of Object.entries(record)) {
		const physicalName = mapColumnToPhysical(mapping, logicalName);
		result[physicalName] = value;
	}

	return result;
}

/**
 * Convert a record with physical column names to logical column names
 *
 * @param mapping Entity mapping
 * @param record Record with physical column names
 * @returns Record with logical column names
 */
export function mapRecordToLogical(
	mapping: EntityMapping,
	record: Record<string, unknown>
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	const physicalToLogical = new Map<string, string>();

	// Build a map of physical to logical names
	for (const column of mapping.columns) {
		physicalToLogical.set(column.physical, column.logical);
	}

	for (const [physicalName, value] of Object.entries(record)) {
		const logicalName = physicalToLogical.get(physicalName) || physicalName;
		result[logicalName] = value;
	}

	return result;
}

/**
 * Get columns by type
 * 
 * @param mapping Entity mapping
 * @param types Array of column types to filter by
 * @returns Array of column mappings matching the specified types
 */
export function getColumnsByType(
	mapping: EntityMapping,
	types: string[]
): ColumnMapping[] {
	return mapping.columns.filter(col =>
		col.type !== undefined && types.includes(col.type.toLowerCase())
	);
}

/**
 * Get columns by property
 * 
 * @param mapping Entity mapping
 * @param property Column property to filter by
 * @param value Value to match
 * @returns Array of column mappings where the property matches the value
 */
export function getColumnsByProperty<K extends keyof ColumnMapping>(
	mapping: EntityMapping,
	property: K,
	value: ColumnMapping[K]
): ColumnMapping[] {
	return mapping.columns.filter(col => col[property] === value);
}

/**
 * Get all physical column names from an entity mapping
 * 
 * @param mapping Entity mapping
 * @returns Array of physical column names
 */
export function getAllPhysicalColumns(
	mapping: EntityMapping
): string[] {
	return mapping.columns.map(col => col.physical);
}

/**
 * Get all logical column names from an entity mapping
 * 
 * @param mapping Entity mapping
 * @returns Array of logical column names
 */
export function getAllLogicalColumns(
	mapping: EntityMapping
): string[] {
	return mapping.columns.map(col => col.logical);
}

/**
 * Get auto-generated columns
 * 
 * @param mapping Entity mapping
 * @returns Array of column mappings that are auto-generated (auto-increment, timestamps, etc.)
 */
export function getAutoGeneratedColumns(
	mapping: EntityMapping
): ColumnMapping[] {
	const autoColumns: ColumnMapping[] = [];

	// Auto-increment columns
	autoColumns.push(...mapping.columns.filter(col => col.autoIncrement));

	// Timestamp columns
	if (mapping.timestamps) {
		const timestampFields = [
			mapping.timestamps.createdAt,
			mapping.timestamps.updatedAt,
			mapping.timestamps.deletedAt
		].filter(Boolean);

		for (const field of timestampFields) {
			const column = findColumnMapping(mapping, field as string);
			if (column) {
				autoColumns.push(column);
			}
		}
	}

	// Managed timestamp columns
	autoColumns.push(...mapping.columns.filter(col => col.managedTimestamp !== undefined));

	return autoColumns;
}

/**
 * Process hooks for an entity
 * 
 * @param mapping Entity mapping
 * @param hookType Hook type to process
 * @param entity Entity to process
 * @param context Context for hook execution
 * @returns Processed entity
 */
export async function processHooks(
	mapping: EntityMapping,
	hookType: string,
	entity: Record<string, unknown>,
	context: any = {}
): Promise<Record<string, unknown>> {
	if (!mapping.hooks || !(mapping.hooks as any)[hookType]) {
		return entity;
	}

	let result = { ...entity };
	const hooks = (mapping.hooks as any)[hookType] as EntityHook[];

	// Sort hooks by priority if specified
	const sortedHooks = [...hooks].sort((a, b) =>
		(a.priority || 0) - (b.priority || 0)
	);

	for (const hook of sortedHooks) {
		// Check if condition is met
		if (hook.condition) {
			const conditionFn = new Function('entity', 'context', `return ${hook.condition};`);
			if (!conditionFn(result, context)) {
				continue;
			}
		}

		try {
			// Execute hook
			if (hook.implementation.startsWith('./')) {
				// TODO
				// External implementation - would need to be loaded
				// For now, we'll assume the implementation is already loaded
				// In a real implementation, this would use dynamic import or require
				continue;
			} else {
				// Inline implementation
				const hookFn = new Function('entity', 'context', `
          ${hook.async ? 'return (async () => {' : ''}
          ${hook.implementation}
          ${hook.async ? '})();' : ''}
        `);

				const hookResult = hook.async
					? await hookFn(result, context)
					: hookFn(result, context);

				if (hookResult !== undefined) {
					result = hookResult;
				}
			}
		} catch (error) {
			console.error(`Error executing ${hookType} hook ${hook.name}:`, error);
		}
	}

	return result;
}

/**
 * Process computed properties for an entity
 * 
 * @param mapping Entity mapping
 * @param entity Entity to process
 * @returns Entity with computed properties
 */
export function processComputedProperties(
	mapping: EntityMapping,
	entity: Record<string, unknown>
): Record<string, unknown> {
	if (!mapping.computed || mapping.computed.length === 0) {
		return entity;
	}

	const result = { ...entity };

	// Build dependency graph
	const dependencies = new Map<string, string[]>();
	const implementations = new Map<string, string>();

	for (const prop of mapping.computed) {
		dependencies.set(prop.name, prop.dependencies || []);
		implementations.set(prop.name, prop.implementation);
	}

	// Calculate property order with dependency resolution
	const propertyOrder = calculateComputedPropertyOrder(dependencies);

	// Calculate properties in order
	for (const propName of propertyOrder) {
		const implementation = implementations.get(propName);
		if (!implementation) continue;

		try {
			// Create and execute the implementation function
			if (implementation.startsWith('./')) {
				// External implementation - would need to be loaded
				// For now, we'll skip external implementations
				continue;
			} else {
				// Inline implementation
				const fn = new Function('entity', `return (${implementation})(entity);`);
				result[propName] = fn(result);
			}
		} catch (error) {
			console.error(`Error calculating computed property ${propName}:`, error);
		}
	}

	return result;
}

/**
 * Calculate the order to execute computed properties based on dependencies
 * 
 * @param dependencies Map of property names to their dependencies
 * @returns Array of property names in execution order
 */
function calculateComputedPropertyOrder(
	dependencies: Map<string, string[]>
): string[] {
	const result: string[] = [];
	const visited = new Set<string>();
	const visiting = new Set<string>();

	function visit(node: string): void {
		if (visited.has(node)) return;
		if (visiting.has(node)) {
			throw new Error(`Circular dependency detected in computed properties: ${node}`);
		}

		visiting.add(node);

		for (const dep of dependencies.get(node) || []) {
			if (dependencies.has(dep)) {
				visit(dep);
			}
		}

		visiting.delete(node);
		visited.add(node);
		result.push(node);
	}

	for (const node of dependencies.keys()) {
		if (!visited.has(node)) {
			visit(node);
		}
	}

	return result;
}

/**
 * Apply hooks to a record
 * 
 * @param mapping Entity mapping
 * @param record The record to apply hooks to
 * @param hookType The type of hook to apply
 * @returns The record after hooks have been applied
 */
export function applyHooks(
	mapping: EntityMapping,
	record: Record<string, unknown>,
	hookType: 'beforeCreate' | 'afterCreate' | 'beforeUpdate' | 'afterUpdate'
): Record<string, unknown> {
	if (!mapping.hooks || !mapping.hooks[hookType]) {
		return record;
	}

	const result = { ...record };

	for (const hook of mapping.hooks[hookType] || []) {
		try {
			// Simple inline execution for example purposes
			// In a real implementation, this would handle external files and async hooks
			const fn = new Function('entity', `
        ${hook.implementation}
        return entity;
      `);

			const hookResult = fn(result);
			if (hookResult !== undefined) {
				Object.assign(result, hookResult);
			}
		} catch (error) {
			console.error(`Error applying ${hookType} hook:`, error);
		}
	}

	return result;
}

/**
 * Generate a create table SQL statement from an entity mapping
 * 
 * @param mapping Entity mapping
 * @param dialect SQL dialect to use ('sqlite', 'mysql', 'postgres')
 * @returns SQL statement for creating the table
 */
export function generateCreateTableSQL(
	mapping: EntityMapping,
	dialect: 'sqlite' | 'mysql' | 'postgres' = 'sqlite'
): string {
	let sql = `CREATE TABLE IF NOT EXISTS ${mapping.table} (\n`;

	// Add column definitions
	const columnDefs = mapping.columns.map(col => {
		let def = `  ${col.physical}`;

		// Add column type based on the dialect
		if (col.type) {
			switch (dialect) {
				case 'mysql':
					def += ` ${getMySQLColumnType(col)}`;
					break;
				case 'postgres':
					def += ` ${getPostgresColumnType(col)}`;
					break;
				case 'sqlite':
				default:
					def += ` ${getSQLiteColumnType(col)}`;
					break;
			}
		}

		// Add constraints
		if (col.primaryKey) {
			def += ' PRIMARY KEY';
		}

		if (col.autoIncrement) {
			switch (dialect) {
				case 'mysql':
					def += ' AUTO_INCREMENT';
					break;
				case 'postgres':
					// For PostgreSQL, we would typically use SERIAL or BIGSERIAL instead
					// But if adding to an existing column definition, use this syntax
					def += ' GENERATED ALWAYS AS IDENTITY';
					break;
				case 'sqlite':
				default:
					def += ' AUTOINCREMENT';
					break;
			}
		}

		if (col.nullable === false) {
			def += ' NOT NULL';
		}

		if (col.defaultValue !== undefined) {
			def += ` DEFAULT ${formatDefaultValue(col.defaultValue, dialect)}`;
		}

		if (col.unique) {
			def += ' UNIQUE';
		}

		return def;
	});

	sql += columnDefs.join(',\n');

	// Add primary key if not already defined on a column
	const pkColumn = mapping.columns.find(col => col.primaryKey);
	if (!pkColumn && mapping.idField) {
		const idColumn = mapping.columns.find(col => col.logical === mapping.idField);
		if (idColumn) {
			sql += `,\n  PRIMARY KEY (${idColumn.physical})`;
		}
	}

	// Add indexes (simple implementation - might need refinement for each dialect)
	if (mapping.indexes && mapping.indexes.length > 0) {
		for (const index of mapping.indexes) {
			const physicalColumns = index.columns.map(col => {
				const column = findColumnMapping(mapping, col);
				return column ? column.physical : col;
			});

			// Adding as separate statements after table creation would be more appropriate
			// for complex index types
		}
	}

	sql += '\n)';

	// Add dialect-specific table options
	switch (dialect) {
		case 'mysql':
			sql += ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
			break;
		case 'postgres':
			// PostgreSQL doesn't typically have table options like this
			break;
		case 'sqlite':
		default:
			// SQLite doesn't typically have table options
			break;
	}

	return sql;
}

/**
 * Helper function to get SQLite column type
 */
function getSQLiteColumnType(column: ColumnMapping): string {
	if (!column.type) return 'TEXT';

	const type = column.type.toLowerCase();

	switch (type) {
		case 'integer':
		case 'int':
		case 'bigint':
		case 'smallint':
		case 'tinyint':
			return 'INTEGER';
		case 'real':
		case 'float':
		case 'double':
		case 'decimal':
			return 'REAL';
		case 'boolean':
		case 'bool':
			return 'INTEGER';
		case 'date':
		case 'datetime':
		case 'timestamp':
			return 'TEXT';
		case 'blob':
		case 'binary':
			return 'BLOB';
		case 'varchar':
		case 'string':
		case 'char':
		case 'text':
		default:
			return 'TEXT';
	}
}

/**
 * Helper function to get MySQL column type
 */
function getMySQLColumnType(column: ColumnMapping): string {
	if (!column.type) return 'VARCHAR(255)';

	const type = column.type.toLowerCase();

	switch (type) {
		case 'integer':
		case 'int':
			return 'INT';
		case 'bigint':
			return 'BIGINT';
		case 'smallint':
			return 'SMALLINT';
		case 'tinyint':
			return 'TINYINT';
		case 'float':
			return 'FLOAT';
		case 'double':
			return 'DOUBLE';
		case 'decimal':
			if (column.precision && column.scale) {
				return `DECIMAL(${column.precision},${column.scale})`;
			}
			return 'DECIMAL(10,2)';
		case 'boolean':
		case 'bool':
			return 'TINYINT(1)';
		case 'date':
			return 'DATE';
		case 'datetime':
		case 'timestamp':
			return 'DATETIME';
		case 'blob':
		case 'binary':
			return 'BLOB';
		case 'text':
			return 'TEXT';
		case 'varchar':
		case 'string':
			return column.length ? `VARCHAR(${column.length})` : 'VARCHAR(255)';
		case 'char':
			return column.length ? `CHAR(${column.length})` : 'CHAR(1)';
		default:
			return 'VARCHAR(255)';
	}
}

/**
 * Helper function to get PostgreSQL column type
 */
function getPostgresColumnType(column: ColumnMapping): string {
	if (!column.type) return 'VARCHAR(255)';

	const type = column.type.toLowerCase();

	switch (type) {
		case 'integer':
		case 'int':
			return 'INTEGER';
		case 'bigint':
			return 'BIGINT';
		case 'smallint':
			return 'SMALLINT';
		case 'tinyint':
			return 'SMALLINT';
		case 'float':
			return 'REAL';
		case 'double':
			return 'DOUBLE PRECISION';
		case 'decimal':
			if (column.precision && column.scale) {
				return `DECIMAL(${column.precision},${column.scale})`;
			}
			return 'DECIMAL(10,2)';
		case 'boolean':
		case 'bool':
			return 'BOOLEAN';
		case 'date':
			return 'DATE';
		case 'datetime':
		case 'timestamp':
			return 'TIMESTAMP';
		case 'blob':
		case 'binary':
			return 'BYTEA';
		case 'text':
			return 'TEXT';
		case 'varchar':
		case 'string':
			return column.length ? `VARCHAR(${column.length})` : 'VARCHAR(255)';
		case 'char':
			return column.length ? `CHAR(${column.length})` : 'CHAR(1)';
		default:
			return 'VARCHAR(255)';
	}
}

/**
 * Format a default value for SQL based on the dialect
 */
function formatDefaultValue(value: unknown, dialect: 'sqlite' | 'mysql' | 'postgres'): string {
	if (value === null) {
		return 'NULL';
	}

	if (typeof value === 'boolean') {
		switch (dialect) {
			case 'postgres':
				return value ? 'TRUE' : 'FALSE';
			case 'mysql':
			case 'sqlite':
			default:
				return value ? '1' : '0';
		}
	}

	if (typeof value === 'number') {
		return value.toString();
	}

	if (typeof value === 'string') {
		// Escape single quotes
		const escaped = value.replace(/'/g, "''");
		return `'${escaped}'`;
	}

	// For complex values, convert to string
	return `'${String(value)}'`;
}

/**
 * Create a type-safe entity mapping
 * @param entity Entity name
 * @param table Table name
 * @param idField ID field name
 * @param columns Column mappings
 * @param options Additional mapping options
 * @returns Configured entity mapping
 */
export function createEntityMapping(
	entity: string,
	table: string,
	idField: string,
	columns: ColumnMapping[],
	options?: Partial<Omit<EntityMapping, 'entity' | 'table' | 'idField' | 'columns'>>
): EntityMapping {
	return {
		entity,
		table,
		idField,
		columns,
		...options
	};
}

/**
 * Create a column mapping
 * @param logical Logical column name
 * @param physical Physical column name
 * @param type Column data type
 * @param options Additional column options
 * @returns Configured column mapping
 */
export function createColumn(
	logical: string,
	physical: string,
	type?: string,
	options?: Partial<Omit<ColumnMapping, 'logical' | 'physical' | 'type'>>
): ColumnMapping {
	return {
		logical,
		physical,
		type,
		...options
	};
}

/**
 * Create a primary key column mapping
 * @param logical Logical column name
 * @param physical Physical column name
 * @param options Additional column options
 * @returns Configured primary key column mapping
 */
export function createPrimaryKey(
	logical: string,
	physical?: string,
	options?: Partial<Omit<ColumnMapping, 'logical' | 'physical' | 'primaryKey'>>
): ColumnMapping {
	return {
		logical,
		physical: physical || logical,
		primaryKey: true,
		...options
	};
}

/**
 * Create an auto-increment primary key column mapping
 * @param logical Logical column name
 * @param physical Physical column name
 * @param options Additional column options
 * @returns Configured auto-increment primary key column mapping
 */
export function createAutoIncrementPK(
	logical: string,
	physical?: string,
	options?: Partial<Omit<ColumnMapping, 'logical' | 'physical' | 'primaryKey' | 'autoIncrement'>>
): ColumnMapping {
	return {
		logical,
		physical: physical || logical,
		primaryKey: true,
		autoIncrement: true,
		type: 'integer',
		...options
	};
}

/**
 * Create timestamp columns for an entity
 * @param createdAt Created at column name
 * @param updatedAt Updated at column name
 * @param deletedAt Deleted at column name (for soft delete)
 * @returns Array of timestamp column mappings
 */
export function createTimestampColumns(
	createdAt: string = 'created_at',
	updatedAt: string = 'updated_at',
	deletedAt?: string
): ColumnMapping[] {
	const columns: ColumnMapping[] = [
		{
			logical: createdAt,
			physical: createdAt,
			type: 'datetime',
			nullable: false,
			managedTimestamp: 'create'
		},
		{
			logical: updatedAt,
			physical: updatedAt,
			type: 'datetime',
			nullable: true,
			managedTimestamp: 'update'
		}
	];

	if (deletedAt) {
		columns.push({
			logical: deletedAt,
			physical: deletedAt,
			type: 'datetime',
			nullable: true,
			managedTimestamp: 'delete'
		});
	}

	return columns;
}