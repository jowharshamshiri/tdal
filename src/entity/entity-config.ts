/**
 * Entity Configuration
 * Defines the structure and behavior of entities in the framework
 */

import { EntityApiConfig, MiddlewareConfig, Workflow } from "@/core/types";
import { Relation } from "@/database";

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

	/**
	 * API exposure configuration for this field
	 */
	api?: {
		/**
		 * Whether this field is readable through the API
		 */
		readable?: boolean;

		/**
		 * Whether this field is writable through the API (for creates/updates)
		 */
		writable?: boolean;

		/**
		 * Role-based field access control
		 */
		roles?: {
			/**
			 * Roles that can read this field
			 */
			read?: string[];

			/**
			 * Roles that can write this field
			 */
			write?: string[];
		};
	};
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

	/**
	 * Whether this computed property is exposed in the API
	 */
	exposeInApi?: boolean;
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

	/**
	 * Whether this validation applies to API requests
	 */
	applyToApi?: boolean;
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
 * Entity action definition
 * Defines a custom business logic action for an entity
 */
export interface EntityAction {
	/**
	 * Action name (e.g., "approve", "publish", "calculateTotal")
	 */
	name: string;

	/**
	 * Description of what the action does
	 */
	description?: string;

	/**
	 * Implementation function or path to external file
	 */
	implementation: string | Function;

	/**
	 * HTTP method if this action is exposed via API
	 */
	httpMethod?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

	/**
	 * API route path (relative to entity base path)
	 * Can include parameters like ':id'
	 */
	route?: string;

	/**
	 * Roles allowed to execute this action
	 */
	roles?: string[];

	/**
	 * Parameter schema for the action
	 */
	parameters?: {
		/**
		 * Parameter name
		 */
		name: string;

		/**
		 * Parameter type
		 */
		type: 'string' | 'number' | 'boolean' | 'object' | 'array';

		/**
		 * Whether the parameter is required
		 */
		required?: boolean;

		/**
		 * Parameter description
		 */
		description?: string;

		/**
		 * Validation rules for this parameter
		 */
		validation?: ValidationRule[];
	}[];

	/**
	 * Return type schema for the action
	 */
	returns?: {
		/**
		 * Return type
		 */
		type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'void';

		/**
		 * Description of the return value
		 */
		description?: string;
	};

	/**
	 * Whether this action requires a transaction
	 */
	transactional?: boolean;

	/**
	 * Middleware to apply to this action when exposed via API
	 */
	middleware?: string[];
}

/**
 * API route configuration for an entity
 */
export interface EntityRouteConfig {
	/**
	 * Custom base path for this entity's API
	 * Defaults to /api/{entity-name}
	 */
	basePath?: string;

	/**
	 * Enable/disable specific CRUD operations
	 */
	operations?: {
		/**
		 * Whether to enable GET all endpoint
		 */
		getAll?: boolean;

		/**
		 * Whether to enable GET by ID endpoint
		 */
		getById?: boolean;

		/**
		 * Whether to enable POST (create) endpoint
		 */
		create?: boolean;

		/**
		 * Whether to enable PUT/PATCH (update) endpoint
		 */
		update?: boolean;

		/**
		 * Whether to enable DELETE endpoint
		 */
		delete?: boolean;
	};

	/**
	 * Role-based permissions for operations
	 */
	permissions?: {
		/**
		 * Roles that can access getAll
		 */
		getAll?: string[];

		/**
		 * Roles that can access getById
		 */
		getById?: string[];

		/**
		 * Roles that can access create
		 */
		create?: string[];

		/**
		 * Roles that can access update
		 */
		update?: string[];

		/**
		 * Roles that can access delete
		 */
		delete?: string[];
	};

	/**
	 * Custom middleware to apply to this entity's routes
	 */
	middleware?: {
		/**
		 * Middleware for all routes
		 */
		all?: string[];

		/**
		 * Middleware for getAll
		 */
		getAll?: string[];

		/**
		 * Middleware for getById
		 */
		getById?: string[];

		/**
		 * Middleware for create
		 */
		create?: string[];

		/**
		 * Middleware for update
		 */
		update?: string[];

		/**
		 * Middleware for delete
		 */
		delete?: string[];
	};

	/**
	 * Custom response transformers
	 */
	transformers?: {
		/**
		 * Transform the response after getAll
		 */
		getAll?: string;

		/**
		 * Transform the response after getById
		 */
		getById?: string;

		/**
		 * Transform the response after create
		 */
		create?: string;

		/**
		 * Transform the response after update
		 */
		update?: string;

		/**
		 * Transform the response after delete
		 */
		delete?: string;
	};

	/**
	 * Query parameter handling
	 */
	queryParams?: {
		/**
		 * Parameters for filtering
		 */
		filters?: string[];

		/**
		 * Parameters for sorting
		 */
		sort?: string[];

		/**
		 * Whether to enable pagination
		 */
		pagination?: boolean;

		/**
		 * Custom parameters and their handlers
		 */
		custom?: Record<string, string>;
	};
}

/**
 * Entity mapping interface
 * Maps an entity to its database representation
 */
export interface EntityConfig {
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

		/**
		 * Before API hooks (run before processing an API request)
		 */
		beforeApi?: EntityHook[];

		/**
		 * After API hooks (run after processing an API request)
		 */
		afterApi?: EntityHook[];
	};

	/**
	 * Computed properties
	 */
	computed?: ComputedProperty[];

	/**
	 * API configuration
	 */
	api?: EntityApiConfig & EntityRouteConfig;

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
	actions?: EntityAction[];

	/**
	 * Custom database-specific options
	 */
	options?: Record<string, unknown>;

	/**
	 * API-specific middleware configuration
	 */
	middleware?: MiddlewareConfig;
}

/**
 * Column selector type
 */
export type ColumnSelector<T> = Array<keyof T>;

/**
 * Find a column mapping by logical name
 * @param mapping Entity mapping
 * @param logicalName Logical column name
 * @returns Column mapping or undefined if not found
 */
export function findColumnMapping(
	mapping: EntityConfig,
	logicalName: string
): ColumnMapping | undefined {
	return mapping.columns.find((col) => col.logical === logicalName);
}

/**
 * Get the primary key column mapping
 * @param mapping Entity mapping
 * @returns Primary key column mapping
 * @throws Error if no primary key column is found
 */
export function getPrimaryKeyMapping(mapping: EntityConfig): ColumnMapping {
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
 * @param mapping Entity mapping
 * @param logicalNames Array of logical column names
 * @returns Array of physical column names
 */
export function mapColumnsToPhysical(
	mapping: EntityConfig,
	logicalNames: string[]
): string[] {
	return logicalNames.map((name) => {
		const column = findColumnMapping(mapping, name);
		return column ? column.physical : name;
	});
}

/**
 * Maps logical column name to physical column name
 * @param mapping Entity mapping
 * @param logicalName Logical column name
 * @returns Physical column name
 */
export function mapColumnToPhysical(
	mapping: EntityConfig,
	logicalName: string
): string {
	const column = findColumnMapping(mapping, logicalName);
	return column ? column.physical : logicalName;
}

/**
 * Convert a record with logical column names to physical column names
 * @param mapping Entity mapping
 * @param record Record with logical column names
 * @returns Record with physical column names
 */
export function mapRecordToPhysical(
	mapping: EntityConfig,
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
 * @param mapping Entity mapping
 * @param record Record with physical column names
 * @returns Record with logical column names
 */
export function mapRecordToLogical(
	mapping: EntityConfig,
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
 * @param mapping Entity mapping
 * @param types Array of column types to filter by
 * @returns Array of column mappings matching the specified types
 */
export function getColumnsByType(
	mapping: EntityConfig,
	types: string[]
): ColumnMapping[] {
	return mapping.columns.filter(col =>
		col.type !== undefined && types.includes(col.type.toLowerCase())
	);
}

/**
 * Get columns by property
 * @param mapping Entity mapping
 * @param property Column property to filter by
 * @param value Value to match
 * @returns Array of column mappings where the property matches the value
 */
export function getColumnsByProperty<K extends keyof ColumnMapping>(
	mapping: EntityConfig,
	property: K,
	value: ColumnMapping[K]
): ColumnMapping[] {
	return mapping.columns.filter(col => col[property] === value);
}

/**
 * Get all physical column names from an entity mapping
 * @param mapping Entity mapping
 * @returns Array of physical column names
 */
export function getAllPhysicalColumns(
	mapping: EntityConfig
): string[] {
	return mapping.columns.map(col => col.physical);
}

/**
 * Get all logical column names from an entity mapping
 * @param mapping Entity mapping
 * @returns Array of logical column names
 */
export function getAllLogicalColumns(
	mapping: EntityConfig
): string[] {
	return mapping.columns.map(col => col.logical);
}

/**
 * Get all API-readable columns
 * @param mapping Entity mapping
 * @param role Optional role for role-based filtering
 * @returns Array of logical column names that are readable via API
 */
export function getApiReadableColumns(
	mapping: EntityConfig,
	role?: string
): string[] {
	return mapping.columns
		.filter(col => {
			// If api property is undefined, default to true
			if (col.api === undefined) return true;

			// If readable is explicitly set, use that value
			if (col.api.readable !== undefined) {
				if (!col.api.readable) return false;
			}

			// Check role-based access if role is provided
			if (role && col.api.roles?.read) {
				return col.api.roles.read.includes(role);
			}

			// Default to readable if not specified
			return true;
		})
		.map(col => col.logical);
}

/**
 * Get all API-writable columns
 * @param mapping Entity mapping
 * @param role Optional role for role-based filtering
 * @returns Array of logical column names that are writable via API
 */
export function getApiWritableColumns(
	mapping: EntityConfig,
	role?: string
): string[] {
	return mapping.columns
		.filter(col => {
			// If api property is undefined, default to true
			if (col.api === undefined) return true;

			// If writable is explicitly set, use that value
			if (col.api.writable !== undefined) {
				if (!col.api.writable) return false;
			}

			// Check role-based access if role is provided
			if (role && col.api.roles?.write) {
				return col.api.roles.write.includes(role);
			}

			// Default to writable if not specified
			return true;
		})
		.map(col => col.logical);
}

/**
 * Get auto-generated columns
 * @param mapping Entity mapping
 * @returns Array of column mappings that are auto-generated (auto-increment, timestamps, etc.)
 */
export function getAutoGeneratedColumns(
	mapping: EntityConfig
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
 * Find an action by name
 * @param mapping Entity mapping
 * @param actionName Action name
 * @returns Action or undefined if not found
 */
export function findAction(
	mapping: EntityConfig,
	actionName: string
): EntityAction | undefined {
	return mapping.actions?.find(action => action.name === actionName);
}

/**
 * Get all API-exposed actions
 * @param mapping Entity mapping
 * @param role Optional role for role-based filtering
 * @returns Array of actions that are exposed via API
 */
export function getApiActions(
	mapping: EntityConfig,
	role?: string
): EntityAction[] {
	if (!mapping.actions) return [];

	return mapping.actions.filter(action => {
		// Must have route and httpMethod to be API-exposed
		if (!action.route || !action.httpMethod) return false;

		// Check role-based access if role is provided
		if (role && action.roles) {
			return action.roles.includes(role);
		}

		return true;
	});
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
export function createEntityConfig(
	entity: string,
	table: string,
	idField: string,
	columns: ColumnMapping[],
	options?: Partial<Omit<EntityConfig, 'entity' | 'table' | 'idField' | 'columns'>>
): EntityConfig {
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
	logical: string = 'id',
	physical?: string,
	options?: Partial<Omit<ColumnMapping, 'logical' | 'physical' | 'primaryKey' | 'autoIncrement' | 'type'>>
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

/**
 * Create an API configuration for an entity
 * @param exposed Whether the entity should be exposed via API
 * @param basePath Base path for the API endpoints
 * @param options Additional API configuration options
 * @returns API configuration
 */
export function createApiConfig(
	exposed: boolean,
	basePath?: string,
	options?: Partial<Omit<EntityApiConfig & EntityRouteConfig, 'exposed'>>
): EntityApiConfig & EntityRouteConfig {
	return {
		exposed,
		basePath,
		...options
	};
}

/**
 * Create an entity action
 * @param name Action name
 * @param implementation Action implementation
 * @param options Additional action options
 * @returns Entity action
 */
export function createEntityAction(
	name: string,
	implementation: string | Function,
	options?: Partial<Omit<EntityAction, 'name' | 'implementation'>>
): EntityAction {
	return {
		name,
		implementation,
		...options
	};
}



/**
 * Enhanced mapToEntity with better type conversion
 * @param record Database record with physical column names
 * @returns Entity with logical column names and correct types
 */
export function mapToEntity(entityConfig: EntityConfig, record: Record<string, unknown>): unknown {
	const logicalRecord = mapRecordToLogical(entityConfig, record);
	return convertToEntityValues(entityConfig, logicalRecord);
}

/**
 * Convert database values to entity values
 * @param data Database data
 * @returns Converted data with entity-specific types
 */
export function convertToEntityValues(entityConfig: EntityConfig, data: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, unknown> = { ...data };

	// Find boolean columns
	const booleanColumns = getColumnsByType(entityConfig, ["boolean", "bool"]);
	const booleanColumnNames = booleanColumns.map(col => col.logical);

	// Find date columns
	const dateColumns = getColumnsByType(entityConfig, ["date", "datetime", "timestamp"]);
	const dateColumnNames = dateColumns.map(col => col.logical);

	for (const col of booleanColumnNames) {
		if (col in result) {
			const value = result[col];
			// Convert 0/1 or string "0"/"1" to boolean
			result[col] = value === 1 || value === "1" || value === true;
		}
	}

	for (const col of dateColumnNames) {
		if (col in result && result[col] !== null && typeof result[col] === 'string') {
			try {
				// Try to convert string to Date object
				result[col] = new Date(result[col] as string);
			} catch (e) {
				// If conversion fails, keep as string
			}
		}
	}

	return result;
}
