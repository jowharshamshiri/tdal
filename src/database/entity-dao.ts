/**
 * Entity Data Access Object
 * Provides CRUD operations for entities defined in YAML
 */

import { EntityConfig, HookContext, Hook, Logger } from '../core/types';
import { DatabaseAdapter } from './database-adapter';
import {
	ComputedPropertyImplementations,
	loadComputedPropertyImplementations,
	processComputedProperties,
	processComputedPropertiesForArray
} from '../entity/computed-properties';
import { EntityHookHandler } from '../entity/entity-manager';

/**
 * Query options for entity operations
 */
export interface EntityQueryOptions {
	/** Fields to select (defaults to all) */
	fields?: string[];
	/** Where conditions */
	where?: Record<string, any>;
	/** Order by criteria */
	orderBy?: Array<{ field: string; direction?: 'ASC' | 'DESC' }>;
	/** Limit number of results */
	limit?: number;
	/** Skip results */
	offset?: number;
	/** Group by fields */
	groupBy?: string[];
	/** Having clause */
	having?: string;
	/** Relations to include */
	include?: string[];
	/** Raw parameters for having clause */
	havingParams?: any[];
}

/**
 * Entity data access object
 * Handles CRUD operations for entities defined in YAML
 */
export class EntityDao<T> {
	/** Entity configuration */
	private readonly config: EntityConfig;

	/** Database adapter */
	private readonly db: DatabaseAdapter;

	/** Computed property implementations */
	private computedProperties: ComputedPropertyImplementations = {};

	/** Entity hook handler */
	private hookHandler?: EntityHookHandler;

	/** Logger instance */
	private logger?: Logger;

	/** Entity table name */
	public get tableName(): string {
		return this.config.table;
	}

	/** Entity primary key field */
	public get idField(): string {
		return this.config.idField;
	}

	/** Physical ID field name (in database) */
	private get physicalIdField(): string {
		const idColumn = this.config.columns.find(col => col.logical === this.idField);
		return idColumn?.physical || this.idField;
	}

	/**
	 * Constructor
	 * @param config Entity configuration
	 * @param db Database adapter
	 * @param logger Optional logger instance
	 */
	constructor(config: EntityConfig, db: DatabaseAdapter, logger?: Logger) {
		this.config = config;
		this.db = db;
		this.logger = logger;
	}

	/**
	 * Initialize the DAO with hooks and computed properties
	 * @param hookHandler Entity hook handler
	 * @param configLoader Configuration loader for external code
	 */
	async initialize(hookHandler?: EntityHookHandler, configLoader?: any): Promise<void> {
		this.hookHandler = hookHandler;

		if (configLoader && this.config.computed && this.config.computed.length > 0 && this.logger) {
			// Load computed property implementations
			this.computedProperties = await loadComputedPropertyImplementations(
				this.config,
				this.logger,
				configLoader
			);
		}
	}

	/**
	 * Execute a hook
	 * @param hookType Hook type
	 * @param params Hook parameters
	 * @param context Hook context
	 * @returns Hook result
	 */
	private async executeHook(hookType: string, params: any, context: HookContext): Promise<any> {
		if (!this.hookHandler) return params;

		try {
			return await this.hookHandler.executeHook(
				hookType as any,
				params,
				context
			);
		} catch (error) {
			if (this.logger) {
				this.logger.error(`Error executing ${hookType} hook: ${error}`);
			}
			throw error;
		}
	}

	/**
	 * Find all entities
	 * @param options Query options
	 * @param context Hook context
	 * @returns Array of entities
	 */
	async findAll(options?: EntityQueryOptions, context?: HookContext): Promise<T[]> {
		// Execute beforeGetAll hook
		const queryOptions = context ?
			await this.executeHook('beforeGetAll', options || {}, context) :
			options;

		// Build query
		let query = `SELECT * FROM ${this.tableName}`;
		const params: any[] = [];

		// Add where conditions
		if (queryOptions?.where && Object.keys(queryOptions.where).length > 0) {
			const whereClauses = [];

			for (const [field, value] of Object.entries(queryOptions.where)) {
				// Convert logical field name to physical
				const column = this.getPhysicalColumnName(field);

				if (value === null) {
					whereClauses.push(`${column} IS NULL`);
				} else if (Array.isArray(value)) {
					if (value.length === 0) {
						continue;
					}
					const placeholders = value.map(() => '?').join(', ');
					whereClauses.push(`${column} IN (${placeholders})`);
					params.push(...value);
				} else if (typeof value === 'object' && value !== null) {
					// Handle operators like $gt, $lt, etc.
					for (const [op, val] of Object.entries(value)) {
						const condition = this.getOperatorCondition(column, op, val);
						if (condition) {
							whereClauses.push(condition.clause);
							if (condition.value !== undefined) {
								params.push(condition.value);
							}
						}
					}
				} else {
					whereClauses.push(`${column} = ?`);
					params.push(value);
				}
			}

			if (whereClauses.length > 0) {
				query += ` WHERE ${whereClauses.join(' AND ')}`;
			}
		}

		// Add order by
		if (queryOptions?.orderBy && queryOptions.orderBy.length > 0) {
			const orderClauses = queryOptions.orderBy.map(order => {
				const column = this.getPhysicalColumnName(order.field);
				return `${column} ${order.direction || 'ASC'}`;
			});

			query += ` ORDER BY ${orderClauses.join(', ')}`;
		}

		// Add group by
		if (queryOptions?.groupBy && queryOptions.groupBy.length > 0) {
			const groupColumns = queryOptions.groupBy.map(field => {
				return this.getPhysicalColumnName(field);
			});

			query += ` GROUP BY ${groupColumns.join(', ')}`;
		}

		// Add having
		if (queryOptions?.having) {
			query += ` HAVING ${queryOptions.having}`;
			if (queryOptions.havingParams) {
				params.push(...queryOptions.havingParams);
			}
		}

		// Add limit and offset
		if (queryOptions?.limit !== undefined) {
			query += ` LIMIT ?`;
			params.push(queryOptions.limit);

			if (queryOptions.offset !== undefined) {
				query += ` OFFSET ?`;
				params.push(queryOptions.offset);
			}
		}

		// Execute query
		let results = await this.db.query<Record<string, any>>(query, ...params);

		// Convert to entity objects
		results = results.map(row => this.mapToEntity(row));

		// Add computed properties
		let entities = this.addComputedProperties(results);

		// Execute afterGetAll hook
		if (context) {
			entities = await this.executeHook('afterGetAll', entities, context);
		}

		return entities as T[];
	}

	/**
	 * Find entity by ID
	 * @param id Entity ID
	 * @param context Hook context
	 * @returns Entity or undefined if not found
	 */
	async findById(id: any, context?: HookContext): Promise<T | undefined> {
		// Execute beforeGetById hook
		const entityId = context ?
			await this.executeHook('beforeGetById', id, context) :
			id;

		// Convert logical ID field to physical
		const physicalIdField = this.physicalIdField;

		const query = `SELECT * FROM ${this.tableName} WHERE ${physicalIdField} = ?`;
		const result = await this.db.querySingle<Record<string, any>>(query, entityId);

		if (!result) {
			return undefined;
		}

		// Convert to entity object
		let entity = this.mapToEntity(result);

		// Add computed properties
		entity = this.addComputedProperties(entity);

		// Execute afterGetById hook
		if (context) {
			entity = await this.executeHook('afterGetById', entity, context);
		}

		return entity as T;
	}

	/**
	 * Find entities by condition
	 * @param conditions Where conditions
	 * @param options Query options
	 * @param context Hook context
	 * @returns Array of entities
	 */
	async findBy(
		conditions: Record<string, any>,
		options?: EntityQueryOptions,
		context?: HookContext
	): Promise<T[]> {
		// Combine options and conditions
		const combinedOptions: EntityQueryOptions = {
			...options,
			where: {
				...(options?.where || {}),
				...conditions
			}
		};

		return this.findAll(combinedOptions, context);
	}

	/**
	 * Find a single entity by condition
	 * @param conditions Where conditions
	 * @param context Hook context
	 * @returns Entity or undefined if not found
	 */
	async findOne(
		conditions: Record<string, any>,
		context?: HookContext
	): Promise<T | undefined> {
		const results = await this.findBy(conditions, { limit: 1 }, context);
		return results.length > 0 ? results[0] : undefined;
	}

	/**
	 * Create a new entity
	 * @param data Entity data
	 * @param context Hook context
	 * @returns Created entity ID
	 */
	async create(data: Partial<T>, context?: HookContext): Promise<any> {
		// Execute beforeCreate hook
		let entityData = context ?
			await this.executeHook('beforeCreate', data, context) :
			data;

		// Add timestamps if configured
		entityData = this.addTimestamps(entityData, 'create');

		// Convert logical field names to physical
		const physicalData = this.mapToPhysical(entityData as Record<string, any>);

		// Insert into database
		const id = await this.db.insert(this.tableName, physicalData);

		// Get the created entity
		const createdEntity = await this.findById(id);

		// Execute afterCreate hook
		if (context && createdEntity) {
			await this.executeHook('afterCreate', createdEntity, context);
		}

		return id;
	}

	/**
	 * Update an entity
	 * @param id Entity ID
	 * @param data Update data
	 * @param context Hook context
	 * @returns Number of affected rows
	 */
	async update(id: any, data: Partial<T>, context?: HookContext): Promise<number> {
		// Execute beforeUpdate hook
		let entityData = context ?
			await this.executeHook('beforeUpdate', { id, data }, context) :
			data;

		// Add timestamps if configured
		entityData = this.addTimestamps(entityData, 'update');

		// Convert logical field names to physical
		const physicalData = this.mapToPhysical(entityData as Record<string, any>);

		// Update in database
		const result = await this.db.update(
			this.tableName,
			this.physicalIdField,
			id,
			physicalData
		);

		// Execute afterUpdate hook
		if (context && result > 0) {
			const updatedEntity = await this.findById(id);
			if (updatedEntity) {
				await this.executeHook('afterUpdate', { id, entity: updatedEntity }, context);
			}
		}

		return result;
	}

	/**
	 * Delete an entity
	 * @param id Entity ID
	 * @param context Hook context
	 * @returns Number of affected rows
	 */
	async delete(id: any, context?: HookContext): Promise<number> {
		// Execute beforeDelete hook
		const shouldDelete = context ?
			await this.executeHook('beforeDelete', id, context) :
			true;

		if (shouldDelete === false) {
			return 0;
		}

		// Check if using soft delete
		if (this.config.softDelete) {
			const { column, deletedValue } = this.config.softDelete;

			// Use update for soft delete
			const result = await this.update(
				id,
				{ [column]: deletedValue } as unknown as Partial<T>,
				context
			);

			// Execute afterDelete hook
			if (context && result > 0) {
				await this.executeHook('afterDelete', id, context);
			}

			return result;
		}

		// Perform hard delete
		const result = await this.db.delete(this.tableName, this.physicalIdField, id);

		// Execute afterDelete hook
		if (context && result > 0) {
			await this.executeHook('afterDelete', id, context);
		}

		return result;
	}

	/**
	 * Count entities
	 * @param conditions Where conditions
	 * @returns Entity count
	 */
	async count(conditions?: Record<string, any>): Promise<number> {
		if (!conditions || Object.keys(conditions).length === 0) {
			return this.db.count(this.tableName);
		}

		// Convert logical field names to physical
		const physicalConditions = this.mapToPhysical(conditions);

		return this.db.count(this.tableName, physicalConditions);
	}

	/**
	 * Check if an entity exists
	 * @param conditions Where conditions
	 * @returns Whether entity exists
	 */
	async exists(conditions: Record<string, any>): Promise<boolean> {
		const count = await this.count(conditions);
		return count > 0;
	}

	/**
	 * Get the raw database adapter
	 * For advanced operations not covered by the DAO
	 * @returns Database adapter
	 */
	getRawAdapter(): DatabaseAdapter {
		return this.db;
	}

	/**
	 * Execute a custom database query
	 * @param query SQL query
	 * @param params Query parameters
	 * @returns Query results
	 */
	async executeRawQuery<R>(query: string, ...params: any[]): Promise<R[]> {
		return this.db.query<R>(query, ...params);
	}

	/**
	 * Execute a transaction
	 * @param callback Transaction callback
	 * @returns Transaction result
	 */
	async transaction<R>(callback: (dao: EntityDao<T>) => Promise<R>): Promise<R> {
		return this.db.transaction(async () => {
			return callback(this);
		});
	}

	/**
	 * Convert a database row to an entity object
	 * @param row Database row
	 * @returns Entity object
	 */
	private mapToEntity(row: Record<string, any>): Record<string, any> {
		const entity: Record<string, any> = {};

		// Map physical column names to logical names
		for (const column of this.config.columns) {
			if (row[column.physical] !== undefined) {
				entity[column.logical] = this.convertValueToType(row[column.physical], column.type);
			}
		}

		return entity;
	}

	/**
	 * Convert an entity object to a database row
	 * @param entity Entity object
	 * @returns Database row
	 */
	private mapToPhysical(entity: Record<string, any>): Record<string, any> {
		const row: Record<string, any> = {};

		// Map logical field names to physical column names
		for (const [field, value] of Object.entries(entity)) {
			const column = this.config.columns.find(col => col.logical === field);
			if (column) {
				row[column.physical] = value;
			}
		}

		return row;
	}

	/**
	 * Add timestamps to an entity
	 * @param entity Entity data
	 * @param operation Operation type (create or update)
	 * @returns Entity with timestamps
	 */
	private addTimestamps(entity: Partial<T>, operation: 'create' | 'update'): Partial<T> {
		if (!this.config.timestamps) return entity;

		const now = new Date().toISOString();
		const result = { ...entity };

		if (operation === 'create' && this.config.timestamps.createdAt) {
			(result as any)[this.config.timestamps.createdAt] = now;
		}

		if (this.config.timestamps.updatedAt) {
			(result as any)[this.config.timestamps.updatedAt] = now;
		}

		return result;
	}

	/**
	 * Add computed properties to an entity or entities
	 * @param entity Entity or array of entities
	 * @returns Entity or array of entities with computed properties
	 */
	private addComputedProperties<E>(entity: E): E {
		if (!this.computedProperties || Object.keys(this.computedProperties).length === 0) {
			return entity;
		}

		if (Array.isArray(entity)) {
			return processComputedPropertiesForArray(entity, this.computedProperties) as unknown as E;
		} else {
			return processComputedProperties(entity, this.computedProperties);
		}
	}

	/**
	 * Get the physical column name for a logical field
	 * @param field Logical field name
	 * @returns Physical column name
	 */
	private getPhysicalColumnName(field: string): string {
		const column = this.config.columns.find(col => col.logical === field);
		return column ? column.physical : field;
	}

	/**
	 * Get SQL condition for an operator
	 * @param column Column name
	 * @param operator Operator ($eq, $gt, $lt, etc.)
	 * @param value Value to compare against
	 * @returns SQL condition clause and value
	 */
	private getOperatorCondition(
		column: string,
		operator: string,
		value: any
	): { clause: string; value?: any } | null {
		switch (operator) {
			case '$eq':
				return { clause: `${column} = ?`, value };
			case '$ne':
				return { clause: `${column} != ?`, value };
			case '$gt':
				return { clause: `${column} > ?`, value };
			case '$gte':
				return { clause: `${column} >= ?`, value };
			case '$lt':
				return { clause: `${column} < ?`, value };
			case '$lte':
				return { clause: `${column} <= ?`, value };
			case '$like':
				return { clause: `${column} LIKE ?`, value };
			case '$notLike':
				return { clause: `${column} NOT LIKE ?`, value };
			case '$null':
				return { clause: value ? `${column} IS NULL` : `${column} IS NOT NULL` };
			default:
				return null;
		}
	}

	/**
	 * Convert a database value to the appropriate type
	 * @param value Raw database value
	 * @param type Column type
	 * @returns Converted value
	 */
	private convertValueToType(value: any, type?: string): any {
		if (value === null || value === undefined) {
			return value;
		}

		if (!type) return value;

		switch (type.toLowerCase()) {
			case 'boolean':
			case 'bool':
				return value === 1 || value === true || value === 'true';
			case 'number':
			case 'float':
			case 'double':
			case 'decimal':
				return typeof value === 'number' ? value : parseFloat(value);
			case 'integer':
			case 'int':
				return typeof value === 'number' ? Math.floor(value) : parseInt(value, 10);
			case 'date':
			case 'datetime':
			case 'timestamp':
				return value instanceof Date ? value : new Date(value);
			case 'json':
			case 'object':
				if (typeof value === 'string') {
					try {
						return JSON.parse(value);
					} catch (e) {
						return value;
					}
				}
				return value;
			default:
				return value;
		}
	}
}