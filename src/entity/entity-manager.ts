/**
 * Entity Manager
 * Provides entity lifecycle management, DAO factory, and API operations
 */

import { EntityHook, EntityConfig, EntityAction, getColumnsByType, mapColumnToPhysical, mapRecordToLogical, mapRecordToPhysical, getApiReadableColumns, getApiWritableColumns, findAction, mapToEntity, JunctionTableConfig } from './entity-config';
import { DatabaseAdapter } from '../database/core/types';
import { processComputedProperties, loadComputedPropertyImplementations, ComputedPropertyImplementations, createComputedPropertyFunction } from './computed-properties';
import { HookContext, ControllerContext, ActionFunction, HookFunction, EntityHookHandler, ActionImplementations } from '../core/types';
import { AggregateOptions, DatabaseContext, DeleteOptions, FindOptions, findRelation, isRelationType, JoinOptions, ManyToManyRelation, ManyToOneRelation, OneToManyRelation, OneToOneRelation, QueryOptions, Relation, RelationOptions, TransactionIsolationLevel, UpdateOptions } from '../database';
import { executeHookWithTimeout, HookExecutor, HookImplementation } from '../hooks/hooks-executor';
import { HookError } from '../hooks/hook-context';
import { Logger } from '@/logging';


/**
 * Action handler for entity actions
 * Used to execute actions defined in entity configuration
 */
export class EntityActionHandler {
	private implementations: ActionImplementations = {};
	private loadedActions: Set<string> = new Set();
	private logger: Logger;
	private config: EntityConfig;
	private configLoader: any;

	/**
	 * Constructor
	 * @param config Entity configuration
	 * @param logger Logger instance
	 * @param configLoader Configuration loader for loading external code
	 */
	constructor(config: EntityConfig, logger: Logger, configLoader: any) {
		this.config = config;
		this.logger = logger;
		this.configLoader = configLoader;
	}

	/**
	 * Initialize all actions
	 */
	async initialize(): Promise<void> {
		if (!this.config.actions || this.config.actions.length === 0) {
			return;
		}

		// Load all actions
		for (const action of this.config.actions) {
			try {
				await this.loadAction(action);
			} catch (error: any) {
				this.logger.error(`Failed to load action ${action.name} for ${this.config.entity}: ${error}`);
			}
		}
	}

	/**
	 * Load a specific action
	 * @param action Action definition
	 */
	private async loadAction(action: EntityAction): Promise<void> {
		// Skip if already loaded
		if (this.loadedActions.has(action.name)) {
			return;
		}

		try {
			let implementation: ActionFunction;

			// If implementation is a file path, load it
			if (action.implementation && typeof action.implementation === 'string' && action.implementation.startsWith('./')) {
				const actionModule = await this.configLoader.loadExternalCode(action.implementation);
				implementation = actionModule.default || actionModule;
			} else {
				// Otherwise, it's an inline implementation
				// Convert the string to a function
				implementation = new Function('params', 'context', `
					return (async (params, context) => {
						${action.implementation}
					})(params, context);
				`) as ActionFunction;
			}

			// Store the implementation
			this.implementations[action.name] = implementation;
			this.loadedActions.add(action.name);
			this.logger.debug(`Loaded action ${action.name} for ${this.config.entity}`);
		} catch (error: any) {
			this.logger.error(`Failed to load action ${action.name} for ${this.config.entity}: ${error}`);
			throw error;
		}
	}

	/**
	 * Execute an action
	 * @param actionName Action name
	 * @param params Action parameters
	 * @param context Action context
	 * @returns Action result
	 */
	async executeAction(
		actionName: string,
		params: any,
		context: HookContext
	): Promise<any> {
		// Find the action configuration
		const actionConfig = this.config.actions?.find(a => a.name === actionName);
		if (!actionConfig) {
			throw new Error(`Action ${actionName} not found for entity ${this.config.entity}`);
		}

		// Get the implementation
		const implementation = this.implementations[actionName];
		if (!implementation) {
			throw new Error(`Implementation for action ${actionName} not found`);
		}

		try {
			// Check if the action is transactional
			if (actionConfig.transactional) {
				// Execute in a transaction
				const db = context.db || DatabaseContext.getDatabase();
				return await db.transaction(async () => {
					return await implementation(params, context);
				});
			} else {
				// Execute without a transaction
				return await implementation(params, context);
			}
		} catch (error: any) {
			this.logger.error(`Error executing action ${actionName} for ${this.config.entity}: ${error}`);
			throw error;
		}
	}

	/**
	 * Get all API-exposed actions
	 * @param role Optional role for filtering actions by access control
	 * @returns List of API-exposed actions
	 */
	getApiActions(role?: string): EntityAction[] {
		if (!this.config.actions) return [];

		return this.config.actions.filter(action => {
			// Must have route and httpMethod to be API-exposed
			if (!action.route || !action.httpMethod) return false;

			// Check role-based access if role is provided
			if (role && action.roles && action.roles.length > 0) {
				return action.roles.includes(role);
			}

			return true;
		});
	}
}


/**
 * Enhanced Data Access Object class with common CRUD operations,
 * hooks, computed property support, and API operations
 * @template T The model type
 * @template IdType The type of the ID field (usually number)
 */
export class EntityDao<T, IdType = string | number> {
	/**
	 * The database adapter instance
	 */
	protected db: DatabaseAdapter;

	/**
	 * Entity mapping for the DAO
	 */
	protected readonly entityConfig: EntityConfig = {} as EntityConfig;

	/**
	 * Computed properties processor function
	 */
	private computedPropertiesProcessor: (entity: any) => any = (entity) => entity;

	/**
	 * Hook handler for entity lifecycle events
	 */
	private hookHandler?: EntityHookHandler;

	/**
	 * Hook executor for entity lifecycle hooks
	 */
	private hookExecutors: Map<string, HookExecutor<any>> = new Map();

	/**
	 * Action handler for entity actions
	 */
	private actionHandler?: EntityActionHandler;

	/**
	 * Logger instance
	 */
	private logger?: Logger;

	/**
	 * Constructor
	 * @param entityConfig Entity mapping configuration
	 * @param db Optional database adapter instance (uses singleton if not provided)
	 * @param logger Optional logger instance
	 * @param configLoader Optional configuration loader for hooks and computed properties
	 */
	constructor(
		entityConfigOrDb: EntityConfig | DatabaseAdapter,
		dbOrLogger?: DatabaseAdapter | Logger,
		loggerOrConfigLoader?: Logger | any,
		configLoader?: any
	) {
		// Check if first parameter is an EntityConfig or DatabaseAdapter
		if ((entityConfigOrDb as EntityConfig).entity &&
			(entityConfigOrDb as EntityConfig).table &&
			(entityConfigOrDb as EntityConfig).columns) {
			// First parameter is EntityConfig
			this.entityConfig = entityConfigOrDb as EntityConfig;
			this.db = dbOrLogger as DatabaseAdapter || DatabaseContext.getDatabase();
			this.logger = loggerOrConfigLoader as Logger;

			// Initialize if logger and configLoader are provided
			if (this.logger && configLoader) {
				this.initialize(configLoader).catch(error => {
					this.logger!.error(`Failed to initialize entity dao for ${this.entityConfig.entity}: ${error.message}`);
				});
			}
		} else {
			// First parameter is DatabaseAdapter
			// In this case, entityConfig should be provided by the subclass
			this.db = entityConfigOrDb as DatabaseAdapter;
			this.logger = dbOrLogger as Logger;

			// Default no-op computed properties processor
			this.computedPropertiesProcessor = (entity) => entity;

			// We don't initialize hooks, actions, and computed properties here
			// as they should be handled by the subclass
		}
	}

	/**
	 * Load computed property implementations
	 * @param configLoader Configuration loader
	 * @returns Map of computed property implementations
	 */
	private async loadComputedPropertyImplementations(configLoader: any): Promise<ComputedPropertyImplementations> {
		if (!this.entityConfig.computed || !this.logger) {
			return {};
		}

		const implementations: ComputedPropertyImplementations = {};

		for (const prop of this.entityConfig.computed) {
			try {
				let implementation: (entity: any) => any;

				if (typeof prop.implementation === 'string') {
					if (prop.implementation.startsWith('./')) {
						// External file
						const module = await configLoader.loadExternalCode(prop.implementation);
						implementation = module.default || module;
					} else {
						// Inline implementation
						implementation = createComputedPropertyFunction(prop);
					}
				} else if (typeof prop.implementation === 'function') {
					// Direct function reference
					implementation = prop.implementation;
				} else {
					throw new Error(`Invalid implementation for computed property ${prop.name}`);
				}

				implementations[prop.name] = implementation;
				this.logger.debug(`Loaded computed property ${prop.name} for ${this.entityConfig.entity}`);
			} catch (error: any) {
				if (this.logger) {
					this.logger.error(`Failed to load computed property ${prop.name} for ${this.entityConfig.entity}: ${error}`);
				}
			}
		}

		return implementations;
	}

	/**
	 * Get the database adapter
	 * @returns Database adapter
	 */
	protected getDatabase(): DatabaseAdapter {
		return this.db;
	}

	/**
	 * Get the entity mapping
	 * @returns Entity mapping
	 */
	getEntityConfig(): EntityConfig {
		return this.entityConfig;
	}

	/**
	 * Get the table name for the entity
	 */
	protected get tableName(): string {
		return this.entityConfig.table;
	}

	/**
	 * Get the ID field name for the entity
	 */
	protected get idField(): string {
		return this.entityConfig.idField;
	}

	/**
	 * Get the physical ID field name for the entity
	 */
	protected get physicalIdField(): string {
		return mapColumnToPhysical(this.entityConfig, this.idField);
	}

	/**
 * Find a single entity by conditions
 * @param conditions Field-value pairs to filter by
 * @param options Optional find options
 * @param context Optional hook context
 * @returns The entity or undefined if not found
 */
	async findOneBy(conditions: Partial<T>, options?: FindOptions, context?: HookContext): Promise<T | undefined> {
		const ctx = context || this.createDefaultContext();

		// Process conditions through hooks
		const processedConditions = await this.executeHooks('beforeFindBy', { ...conditions }, ctx);

		const physicalConditions = mapRecordToPhysical(
			this.entityConfig,
			processedConditions as unknown as Record<string, unknown>
		);

		const findOptions = this.enhanceFindOptions(options);

		const result = await this.db.findOneBy<Record<string, unknown>>(
			this.tableName,
			physicalConditions,
			findOptions
		);

		if (!result) {
			return undefined;
		}

		// Map result and apply computed properties
		const mappedResult = mapToEntity(this.entityConfig, result) as T;
		const withComputed = this.computedPropertiesProcessor(mappedResult);

		// Process result through hooks
		return await this.executeHooks('afterFindBy', withComputed, ctx);
	}

	/**
	 * Count entities matching conditions
	 * @param conditions Optional field-value pairs to filter by
	 * @returns Count of matching entities
	 */
	async count(conditions?: Partial<T>): Promise<number> {
		if (!conditions) {
			return this.db.count(this.tableName);
		}

		const physicalConditions = mapRecordToPhysical(
			this.entityConfig,
			conditions as unknown as Record<string, unknown>
		);

		return this.db.count(this.tableName, physicalConditions);
	}

	/**
	 * Execute a function within a transaction
	 * @param callback Function to execute within transaction
	 * @param isolationLevel Optional transaction isolation level
	 * @returns Result of the callback
	 */
	async transaction<R>(
		callback: (dao: this) => Promise<R>,
		isolationLevel?: TransactionIsolationLevel
	): Promise<R> {
		return this.db.transaction(async (db) => {
			// Create a new instance of this DAO with the transaction's database connection
			const transactionDao = new (this.constructor as new (
				mapping: EntityConfig,
				db: DatabaseAdapter,
				logger?: Logger,
				configLoader?: any
			) => this)(this.entityConfig, db, this.logger);

			// Copy hook executors to the new DAO instance
			(transactionDao as any).hookExecutors = this.hookExecutors;
			(transactionDao as any).computedPropertiesProcessor = this.computedPropertiesProcessor;

			return callback(transactionDao);
		}, isolationLevel);
	}

	/**
 * Delete an entity
 * @param id The entity ID or object with composite key values
 * @param context Optional hook context
 * @returns Number of affected rows
 */
	async delete(id: IdType | Record<string, any>, context?: HookContext): Promise<number> {
		const ctx = context || this.createDefaultContext();

		try {
			// Execute before hooks
			if (this.hookHandler) {
				const shouldProceed = await this.hookHandler.executeHook('beforeDelete', id, ctx);
				if (shouldProceed === false) {
					return 0; // Hook prevented deletion
				}
			}

			// Check if soft delete is enabled
			if (this.entityConfig.softDelete) {
				const { column, deletedValue } = this.entityConfig.softDelete;

				// Apply soft delete
				return this.update(id, {
					[column]: deletedValue,
				} as unknown as Partial<T>, ctx);
			}

			let result: number;

			if (Array.isArray(this.entityConfig.idField)) {
				// Handle composite primary key
				if (typeof id !== 'object') {
					throw new Error(`Composite primary key requires an object with key-value pairs`);
				}

				// Build conditions object for composite key
				const conditions: Record<string, unknown> = {};
				for (const field of this.entityConfig.idField) {
					if ((id as Record<string, unknown>)[field] === undefined) {
						throw new Error(`Missing value for primary key field "${field}"`);
					}
					conditions[mapColumnToPhysical(this.entityConfig, field)] = (id as Record<string, unknown>)[field];
				}

				result = await this.db.deleteBy(this.tableName, conditions);
			} else {
				// Handle single primary key
				result = await this.db.delete(
					this.tableName,
					this.physicalIdField,
					id as unknown as number | string
				);
			}

			// Execute after hooks
			if (this.hookHandler) {
				await this.hookHandler.executeHook('afterDelete', id, ctx);
			}

			return result;
		} catch (error: any) {
			if (this.logger) {
				this.logger.error(`Error deleting entity: ${error}`);
			}
			return 0;
		}
	}

	/**
	 * Delete entities by conditions
	 * @param conditions The filter conditions
	 * @param options Optional delete options
	 * @returns Number of affected rows
	 */
	async deleteBy(conditions: Partial<T>, options?: DeleteOptions): Promise<number> {
		try {
			// Check if soft delete is enabled
			if (this.entityConfig.softDelete) {
				const { column, deletedValue } = this.entityConfig.softDelete;

				// Apply soft delete with update
				return this.updateBy(conditions, {
					[column]: deletedValue,
				} as unknown as Partial<T>);
			}

			const physicalConditions = mapRecordToPhysical(
				this.entityConfig,
				conditions as unknown as Record<string, unknown>
			);

			return this.db.deleteBy(this.tableName, physicalConditions, options);
		} catch (error: any) {
			if (this.logger) {
				this.logger.error(`Error deleting entities by conditions: ${error}`);
			}
			return 0;
		}
	}

	/**
 * Check if an entity exists
 * @param id The entity ID
 * @param context Optional hook context
 * @returns Whether the entity exists
 */
	async exists(id: IdType, context?: HookContext): Promise<boolean> {
		const ctx = context || this.createDefaultContext();

		try {
			// Process ID through hooks
			const processedId = await this.executeHooks('beforeGetById', id, ctx);

			const exists = await this.db.exists(this.tableName, {
				[this.physicalIdField]: processedId,
			});

			return exists;
		} catch (error: any) {
			if (this.logger) {
				this.logger.error(`Error checking if entity exists: ${error}`);
			}
			throw error;
		}
	}

	/**
	 * Create a new entity
	 * @param data The entity data
	 * @param context Optional hook context
	 * @returns The ID of the created entity
	 */
	async create(data: Partial<T>, context?: HookContext): Promise<IdType> {
		const ctx = context || this.createDefaultContext();

		// Execute before hooks
		let processedData = { ...data };
		if (this.hookHandler) {
			processedData = await this.hookHandler.executeHook('beforeCreate', data, ctx);
		}

		this.applyTimestamps(processedData, "create");

		// Convert booleans to database-specific format
		const convertedData = this.convertToDbValues(processedData);

		const physicalData = mapRecordToPhysical(
			this.entityConfig,
			convertedData
		);

		const id = await this.db.insert<Record<string, unknown>>(
			this.tableName,
			physicalData
		);

		// Execute after hooks
		if (this.hookHandler) {
			await this.hookHandler.executeHook('afterCreate', { id, ...processedData }, ctx);
		}

		return id as unknown as IdType;
	}

	/**
	 * Update entities by conditions
	 * @param conditions The filter conditions
	 * @param data The data to update
	 * @param options Optional update options
	 * @returns Number of affected rows
	 */
	async updateBy(
		conditions: Partial<T>,
		data: Partial<T>,
		options?: UpdateOptions
	): Promise<number> {
		this.applyTimestamps(data, "update");

		try {
			// Convert booleans to database-specific format
			const convertedData = this.convertToDbValues(data);

			const physicalData = mapRecordToPhysical(
				this.entityConfig,
				convertedData
			);

			const physicalConditions = mapRecordToPhysical(
				this.entityConfig,
				conditions as unknown as Record<string, unknown>
			);

			return this.db.updateBy<Record<string, unknown>>(
				this.tableName,
				physicalConditions,
				physicalData,
				options
			);
		} catch (error: any) {
			if (this.logger) {
				this.logger.error(`Error updating entities by conditions: ${error}`);
			}
			return 0;
		}
	}

	/**
	 * Insert or update an entity based on ID
	 * @param data The entity data
	 * @param context Optional hook context
	 * @returns The ID of the entity
	 */
	async save(data: Partial<T>, context?: HookContext): Promise<IdType> {
		// If the ID field exists and has a value, update; otherwise, create
		const idValue = (data as any)[this.idField];

		const ctx = context || this.createDefaultContext();

		if (idValue !== undefined && idValue !== null) {
			// Run update operation
			const updateData = { ...data };
			// Remove ID from update data to avoid attempting to update the ID
			delete (updateData as any)[this.idField];
			// Also remove generic 'id' field if it exists and differs from entity ID field
			if (this.idField !== 'id' && 'id' in updateData) {
				delete (updateData as any)['id'];
			}

			await this.update(idValue as IdType, updateData, ctx);
			return idValue as IdType;
		} else {
			// Run create operation
			return this.create(data, ctx);
		}
	}

	/**
 * Perform a bulk insert of multiple entities
 * @param dataArray Array of entity data
 * @param context Optional hook context
 * @returns Number of inserted entities
 */
	async bulkCreate(dataArray: Partial<T>[], context?: HookContext): Promise<number> {
		if (dataArray.length === 0) return 0;

		const ctx = context || this.createDefaultContext();

		// Process each entity through beforeCreate hooks
		const processedArray = [];
		for (const data of dataArray) {
			// Process through hooks
			const processedData = await this.executeHooks('beforeCreate', { ...data }, ctx);

			// Apply timestamps
			this.applyTimestamps(processedData, "create");

			processedArray.push(processedData);
		}

		// Convert booleans and map to physical columns
		const physicalDataArray = processedArray.map(data => {
			const convertedData = this.convertToDbValues(data);
			return mapRecordToPhysical(
				this.entityConfig,
				convertedData
			);
		});

		// Perform bulk insert
		const result = await this.db.bulkInsert(this.tableName, physicalDataArray);

		// Process each entity through afterCreate hooks
		// Note: We don't have individual IDs here, so we pass null as ID
		for (const data of processedArray) {
			await this.executeHooks('afterCreate', { id: null, ...data }, ctx);
		}

		return result;
	}

	/**
	 * Calculate an aggregate value with optional grouping
	 * @param options Aggregate options
	 * @returns Aggregate results
	 */
	async aggregate<R = Record<string, unknown>>(
		options: AggregateOptions
	): Promise<R[]> {
		// Map logical field names to physical column names
		if (options.groupBy) {
			options.groupBy = options.groupBy.map(field =>
				mapColumnToPhysical(this.entityConfig, field)
			);
		}

		if (options.aggregates) {
			options.aggregates = options.aggregates.map(agg => ({
				...agg,
				field: mapColumnToPhysical(this.entityConfig, agg.field)
			}));
		}

		if (options.conditions) {
			options.conditions = mapRecordToPhysical(
				this.entityConfig,
				options.conditions
			);
		}

		if (options.orderBy) {
			options.orderBy = options.orderBy.map(order => ({
				...order,
				field: mapColumnToPhysical(this.entityConfig, order.field)
			}));
		}

		return this.db.aggregate<R>(this.tableName, options);
	}

	/**
 * Find related entities through a relationship
 * @param id ID of the source entity
 * @param relationName Name of the relationship
 * @param options Query options
 * @param context Optional hook context
 * @returns Array of related entities
 */
	async findRelated<R>(
		id: IdType,
		relationName: string,
		options?: QueryOptions,
		context?: HookContext
	): Promise<R[]> {
		const ctx = context || this.createDefaultContext();

		// Process parameters through hooks
		const processedParams = await this.executeHooks('beforeFindRelated', { id, relationName }, ctx);
		const processedId = processedParams.id;
		const processedRelationName = processedParams.relationName;

		if (!this.entityConfig.relations) {
			throw new Error(
				`No relationships defined for entity ${this.entityConfig.entity}`
			);
		}

		const relation = findRelation(this.entityConfig.relations, processedRelationName);

		if (!relation) {
			throw new Error(
				`Relationship ${processedRelationName} not found on entity ${this.entityConfig.entity}`
			);
		}

		// Handle different relationship types
		let results: R[];

		if (isRelationType<ManyToManyRelation>(relation, "manyToMany")) {
			results = await this.findManyToManyRelated<R>(processedId, relation, options);
		} else if (isRelationType<OneToManyRelation>(relation, "oneToMany")) {
			results = await this.findOneToManyRelated<R>(processedId, relation, options);
		} else if (isRelationType<ManyToOneRelation>(relation, "manyToOne")) {
			results = await this.findManyToOneRelated<R>(processedId, relation, options);
		} else if (isRelationType<OneToOneRelation>(relation, "oneToOne")) {
			results = await this.findOneToOneRelated<R>(processedId, relation, options);
		} else {
			throw new Error(
				`Unsupported relationship type for findRelated: ${processedRelationName}`
			);
		}

		// Process results through hooks
		return await this.executeHooks('afterFindRelated', results, {
			...ctx,
			data: {
				...ctx.data,
				id: processedId,
				relationName: processedRelationName
			}
		});
	}

	/**
	 * Add a related entity through a many-to-many relationship
	 * @param id ID of the source entity
	 * @param relationName Name of the relationship
	 * @param targetId ID of the target entity
	 * @returns Success indicator
	 */
	async addRelation(
		id: IdType,
		relationName: string,
		targetId: number | string
	): Promise<boolean> {
		if (!this.entityConfig.relations) {
			throw new Error(
				`No relationships defined for entity ${this.entityConfig.entity}`
			);
		}

		const relation = findRelation(this.entityConfig.relations, relationName);

		if (!relation) {
			throw new Error(
				`Relationship ${relationName} not found on entity ${this.entityConfig.entity}`
			);
		}

		// Only many-to-many relationships support adding relations directly
		if (!isRelationType<ManyToManyRelation>(relation, "manyToMany")) {
			throw new Error(
				`Relationship ${relationName} is not a many-to-many relationship`
			);
		}

		try {
			// Check if the relation already exists
			const exists = await this.db.exists(relation.junctionTable, {
				[relation.junctionSourceColumn]: id,
				[relation.junctionTargetColumn]: targetId,
			});

			if (exists) {
				return true; // Relation already exists
			}

			await this.db.insert<Record<string, unknown>>(relation.junctionTable, {
				[relation.junctionSourceColumn]: id,
				[relation.junctionTargetColumn]: targetId,
			});

			return true;
		} catch (error: any) {
			if (this.logger) {
				this.logger.error(`Error adding relation ${relationName}: ${error}`);
			}
			return false;
		}
	}

	/**
	 * Remove a related entity through a many-to-many relationship
	 * @param id ID of the source entity
	 * @param relationName Name of the relationship
	 * @param targetId ID of the target entity
	 * @returns Success indicator
	 */
	async removeRelation(
		id: IdType,
		relationName: string,
		targetId: number | string
	): Promise<boolean> {
		if (!this.entityConfig.relations) {
			throw new Error(
				`No relationships defined for entity ${this.entityConfig.entity}`
			);
		}

		const relation = findRelation(this.entityConfig.relations, relationName);

		if (!relation) {
			throw new Error(
				`Relationship ${relationName} not found on entity ${this.entityConfig.entity}`
			);
		}

		// Only many-to-many relationships support removing relations directly
		if (!isRelationType<ManyToManyRelation>(relation, "manyToMany")) {
			throw new Error(
				`Relationship ${relationName} is not a many-to-many relationship`
			);
		}

		try {
			const result = await this.db.deleteBy(relation.junctionTable, {
				[relation.junctionSourceColumn]: id,
				[relation.junctionTargetColumn]: targetId,
			});

			return result > 0;
		} catch (error: any) {
			if (this.logger) {
				this.logger.error(`Error removing relation ${relationName}: ${error}`);
			}
			return false;
		}
	}

	/**
 * Find entities by conditions with improved type handling
 * @param conditions Field-value pairs to filter by
 * @param options Optional query options
 * @param context Optional hook context
 * @returns Array of entities
 */
	async findBy(conditions: Partial<T>, options?: QueryOptions, context?: HookContext): Promise<T[]> {
		const ctx = context || this.createDefaultContext();

		// Process conditions through hooks
		const processedConditions = await this.executeHooks('beforeFindBy', { ...conditions }, ctx);

		// Convert boolean conditions to 0/1 for SQLite
		const convertedConditions: Record<string, unknown> = {};

		// Find boolean columns
		const booleanColumns = getColumnsByType(this.entityConfig, ["boolean", "bool"]);
		const booleanColumnNames = booleanColumns.map(col => col.logical);

		for (const [key, value] of Object.entries(processedConditions)) {
			if (booleanColumnNames.includes(key) && typeof value === "boolean") {
				convertedConditions[key] = value ? 1 : 0;
			} else {
				convertedConditions[key] = value;
			}
		}

		const physicalConditions = mapRecordToPhysical(
			this.entityConfig,
			convertedConditions as Record<string, unknown>
		);

		const queryOptions = this.enhanceQueryOptions(options);

		const results = await this.db.findBy<Record<string, unknown>>(
			this.tableName,
			physicalConditions,
			queryOptions
		);

		// Map results and apply computed properties
		const mappedResults = results.map((result) => mapToEntity(this.entityConfig, result) as T);
		const withComputed = mappedResults.map(entity => this.computedPropertiesProcessor(entity));

		// Process results through hooks
		return await this.executeHooks('afterFindBy', withComputed, ctx);
	}

	/**
	 * Execute a raw query while still leveraging entity mapping for results
	 * @param query SQL query
	 * @param params Query parameters
	 * @returns Mapped entity results
	 */
	async executeRawQuery<R>(query: string, ...params: unknown[]): Promise<R[]> {
		try {
			const results = await this.db.query<Record<string, unknown>>(query, ...params);
			return results.map(result => mapToEntity(this.entityConfig, result)) as R[];
		} catch (error: any) {
			if (this.logger) {
				this.logger.error(`Error executing raw query: ${error}`);
			}
			throw error;
		}
	}

	/**
	 * Execute a raw query that returns a single result
	 * @param query SQL query
	 * @param params Query parameters
	 * @returns Mapped entity result
	 */
	async executeRawQuerySingle<R>(query: string, ...params: unknown[]): Promise<R | undefined> {
		try {
			const result = await this.db.querySingle<Record<string, unknown>>(query, ...params);
			if (!result) {
				return undefined;
			}
			return mapToEntity(this.entityConfig, result) as R;
		} catch (error: any) {
			if (this.logger) {
				this.logger.error(`Error executing raw query for single result: ${error}`);
			}
			throw error;
		}
	}

	/**
	 * Enhanced aggregate method for complex aggregations
	 * @param tableName Optional override table name
	 * @param aggregateFunctions Array of aggregate function definitions
	 * @param conditions Where conditions
	 * @param groupBy Group by fields
	 * @param having Having clause
	 * @returns Aggregate results
	 */
	async complexAggregate<R>(
		tableName: string = this.tableName,
		aggregateFunctions: {
			function: string;
			field: string;
			alias: string;
			distinct?: boolean;
		}[],
		conditions?: Record<string, unknown>,
		groupBy?: string[],
		having?: string
	): Promise<R[]> {
		// Construct the aggregate options
		const options: AggregateOptions = {
			aggregates: aggregateFunctions.map(agg => ({
				function: agg.function as any,
				field: agg.field,
				alias: agg.alias,
				distinct: agg.distinct
			})),
			from: tableName
		};

		if (conditions) {
			options.conditions = conditions;
		}

		if (groupBy) {
			options.groupBy = groupBy;
		}

		if (having) {
			options.having = having;
		}

		return this.aggregate<R>(options);
	}

	/**
	 * Execute a custom entity action
	 * @param actionName Name of the action to execute
	 * @param params Parameters for the action
	 * @param context Optional hook context
	 * @returns Result of the action
	 */
	async executeAction(
		actionName: string,
		params: any,
		context?: HookContext
	): Promise<any> {
		const ctx = context || this.createDefaultContext();

		// Find the action definition
		const actionConfig = findAction(this.entityConfig, actionName);
		if (!actionConfig) {
			throw new HookError(`Action ${actionName} not found for entity ${this.entityConfig.entity}`, 404);
		}

		try {
			// Process parameters through hooks
			const processedParams = await this.executeHooks('beforeAction', {
				actionName,
				params
			}, {
				...ctx,
				action: actionName
			});

			let implementationFn: (params: any, context: HookContext) => Promise<any>;

			// Load the implementation if it's a string path
			if (typeof actionConfig.implementation === 'string') {
				if (actionConfig.implementation.startsWith('./')) {
					// This should be already loaded by the ActionRegistry
					throw new HookError(`Action ${actionName} implementation not loaded by the action registry`, 500);
				} else {
					// Inline code string
					implementationFn = new Function(
						'params',
						'context',
						`return (async (params, context) => { ${actionConfig.implementation} })(params, context);`
					) as any;
				}
			} else if (typeof actionConfig.implementation === 'function') {
				implementationFn = actionConfig.implementation as (params: any, context: HookContext) => Promise<any>;
			} else {
				throw new HookError(`Invalid implementation for action ${actionName}`, 500);
			}

			// Execute the action with timeout
			const result = await executeHookWithTimeout(
				implementationFn,
				[processedParams.params, ctx],
				10000 // Default timeout of 10 seconds
			);

			// Process result through hooks
			return await this.executeHooks('afterAction', {
				actionName,
				result
			}, {
				...ctx,
				action: actionName
			});
		} catch (error: any) {
			this.logger?.error(`Error executing action ${actionName}: ${error.message}`);
			throw new HookError(
				`Action execution failed: ${error.message}`,
				(error as any).statusCode || 500
			);
		}
	}
	/**
	 * Get API configuration for this entity
	 * @returns API configuration or undefined if not exposed
	 */
	getApiConfig() {
		return this.entityConfig.api;
	}

	/**
	 * Get API-exposed actions for this entity
	 * @param role Optional role for filtering actions by access control
	 * @returns List of API-exposed actions
	 */
	getApiActions(role?: string): EntityAction[] {
		if (!this.actionHandler) {
			return [];
		}

		return this.actionHandler.getApiActions(role);
	}

	/**
	 * Get API-readable fields for this entity
	 * @param role Optional role for filtering fields by access control
	 * @returns List of API-readable fields
	 */
	getApiReadableFields(role?: string): string[] {
		return getApiReadableColumns(this.entityConfig, role);
	}

	/**
	 * Get API-writable fields for this entity
	 * @param role Optional role for filtering fields by access control
	 * @returns List of API-writable fields
	 */
	getApiWritableFields(role?: string): string[] {
		return getApiWritableColumns(this.entityConfig, role);
	}

	/**
	 * Create SQL expressions for complex conditions
	 * @returns SQL expression factory
	 */
	sql() {
		return {
			/**
			 * Raw SQL expression
			 */
			raw: (sql: string, ...params: unknown[]) => ({ sql, params }),

			/**
			 * CASE WHEN expression
			 */
			caseWhen: (cases: Array<{ condition: string; result: unknown }>, elseResult: unknown) => {
				let sql = 'CASE';
				const params: unknown[] = [];

				for (const item of cases) {
					sql += ` WHEN ${item.condition} THEN ?`;
					params.push(item.result);
				}

				sql += ' ELSE ? END';
				params.push(elseResult);

				return { sql, params };
			},

			/**
			 * Date comparison expression
			 */
			dateCompare: (field: string, operator: string, value: Date | string) => {
				const dateValue = value instanceof Date ? value.toISOString() : value;
				return { sql: `${operator} ?`, params: [dateValue] };
			},

			/**
			 * Subquery expression
			 */
			subquery: (subquerySql: string, ...params: unknown[]) => ({
				sql: `IN (${subquerySql})`,
				params
			}),

			/**
			 * Between expression
			 */
			between: (low: unknown, high: unknown) => ({
				sql: 'BETWEEN ? AND ?',
				params: [low, high]
			}),
		};
	}

	/**
 * Find related entities through a many-to-many relationship
 * @param sourceId Source entity ID or composite key object
 * @param relation Many-to-many relationship definition
 * @param options Query options
 * @returns Array of related entities
 */
	private async findManyToManyRelated<R>(
		sourceId: any,
		relation: ManyToManyRelation,
		options?: QueryOptions
	): Promise<R[]> {
		const context = DatabaseContext.getAppContext();
		const targetConfig = context?.getEntityConfig(relation.targetEntity);
		const targetTable = targetConfig?.table || relation.targetEntity.toLowerCase();

		// Build where conditions for junction table
		const conditions: Record<string, unknown> = {};

		// Handle composite keys
		if (Array.isArray(relation.sourceColumn)) {
			if (typeof sourceId !== 'object') {
				throw new Error('Composite key requires an object with key-value pairs');
			}

			for (let i = 0; i < relation.sourceColumn.length; i++) {
				const sourceCol = relation.sourceColumn[i];
				const junctionSourceCol = Array.isArray(relation.junctionSourceColumn)
					? relation.junctionSourceColumn[i]
					: relation.junctionSourceColumn;

				conditions[`j.${junctionSourceCol}`] = sourceId[sourceCol];
			}
		} else {
			// Handle single column key
			conditions[`j.${relation.junctionSourceColumn}`] = typeof sourceId === 'object'
				? sourceId[relation.sourceColumn]
				: sourceId;
		}

		// Build join options
		const joins: JoinOptions[] = [
			{
				type: "INNER",
				table: relation.junctionTable,
				alias: "j",
				on: this.buildJunctionJoinCondition(relation, targetTable)
			},
		];

		const results = await this.db.findWithJoin<Record<string, unknown>>(
			targetTable,
			joins,
			conditions,
			options
		);

		// Return results as is - they should be properly mapped by the target entity's repository
		return results as unknown as R[];
	}

	/**
	 * Build join condition for many-to-many junction table
	 * @param relation Many-to-many relationship definition
	 * @param targetTable Target table name
	 * @returns Join condition SQL
	 */
	private buildJunctionJoinCondition(relation: ManyToManyRelation, targetTable: string): string {
		// Handle composite keys
		if (Array.isArray(relation.targetColumn)) {
			// Build composite key join condition
			const conditions: string[] = [];

			for (let i = 0; i < relation.targetColumn.length; i++) {
				const targetCol = relation.targetColumn[i];
				const junctionTargetCol = Array.isArray(relation.junctionTargetColumn)
					? relation.junctionTargetColumn[i]
					: relation.junctionTargetColumn;

				conditions.push(`j.${junctionTargetCol} = ${targetTable}.${targetCol}`);
			}

			return conditions.join(' AND ');
		} else {
			// Simple single column join
			return `j.${relation.junctionTargetColumn} = ${targetTable}.${relation.targetColumn}`;
		}
	}

	/**
	 * Find related entities through a one-to-many relationship
	 * @param id ID of the source entity
	 * @param relation One-to-many relationship
	 * @param options Query options
	 * @returns Array of related entities
	 */
	private async findOneToManyRelated<R>(
		id: IdType,
		relation: OneToManyRelation,
		options?: QueryOptions
	): Promise<R[]> {
		const context = DatabaseContext.getAppContext();
		const targetConfig = context?.getEntityConfig(relation.targetEntity);
		const targetTable = targetConfig?.table || relation.targetEntity.toLowerCase();

		const conditions = {
			[relation.targetColumn]: id,
		};

		const results = await this.db.findBy<Record<string, unknown>>(
			targetTable,
			conditions,
			options
		);

		// Return results as is - they should be properly mapped by the target entity's repository
		return results as unknown as R[];
	}

	/**
	 * Find related entity through a many-to-one relationship
	 * @param id ID of the source entity
	 * @param relation Many-to-one relationship
	 * @param options Query options
	 * @returns Related entity or undefined if not found
	 */
	private async findManyToOneRelated<R>(
		id: IdType,
		relation: ManyToOneRelation,
		options?: QueryOptions
	): Promise<R[]> {
		// First get the source entity to find the foreign key value
		const sourceEntity = await this.findById(id);
		if (!sourceEntity) {
			return [];
		}

		const foreignKeyValue = (sourceEntity as any)[relation.sourceColumn];
		if (foreignKeyValue === undefined || foreignKeyValue === null) {
			return [];
		}

		const context = DatabaseContext.getAppContext();
		const targetConfig = context?.getEntityConfig(relation.targetEntity);
		const targetTable = targetConfig?.table || relation.targetEntity.toLowerCase();

		const conditions = {
			[relation.targetColumn]: foreignKeyValue,
		};

		const results = await this.db.findBy<Record<string, unknown>>(
			targetTable,
			conditions,
			options
		);

		// Return results as is - they should be properly mapped by the target entity's repository
		return results as unknown as R[];
	}

	/**
	 * Find related entity through a one-to-one relationship
	 * @param id ID of the source entity
	 * @param relation One-to-one relationship
	 * @param options Query options
	 * @returns Related entity or undefined if not found
	 */
	private async findOneToOneRelated<R>(
		id: IdType,
		relation: OneToOneRelation,
		options?: QueryOptions
	): Promise<R[]> {
		if (relation.isOwner) {
			// If this entity is the owner, it has the foreign key
			const sourceEntity = await this.findById(id);
			if (!sourceEntity) {
				return [];
			}

			const foreignKeyValue = (sourceEntity as any)[relation.sourceColumn];
			if (foreignKeyValue === undefined || foreignKeyValue === null) {
				return [];
			}

			const context = DatabaseContext.getAppContext();
			const targetConfig = context?.getEntityConfig(relation.targetEntity);
			const targetTable = targetConfig?.table || relation.targetEntity.toLowerCase();

			const conditions = {
				[relation.targetColumn]: foreignKeyValue,
			};

			const results = await this.db.findBy<Record<string, unknown>>(
				targetTable,
				conditions,
				options
			);

			return results as unknown as R[];
		} else {
			// If this entity is not the owner, the related entity has the foreign key
			const context = DatabaseContext.getAppContext();
			const targetConfig = context?.getEntityConfig(relation.targetEntity);
			const targetTable = targetConfig?.table || relation.targetEntity.toLowerCase();

			const conditions = {
				[relation.targetColumn]: id,
			};

			const results = await this.db.findBy<Record<string, unknown>>(
				targetTable,
				conditions,
				options
			);

			return results as unknown as R[];
		}
	}

	/**
	 * Apply timestamps to an entity
	 * @param data Entity data
	 * @param operation Operation type (create or update)
	 */
	private applyTimestamps(
		data: Partial<T>,
		operation: "create" | "update"
	): void {
		if (!this.entityConfig.timestamps) {
			return;
		}

		const now = new Date().toISOString();

		// First check if the columns exist in the mapping before applying
		if (operation === "create" && this.entityConfig.timestamps.createdAt) {
			const createdAtColumn = this.entityConfig.columns.find(
				(col) => col.logical === this.entityConfig.timestamps?.createdAt
			);

			if (createdAtColumn) {
				(data as Record<string, unknown>)[
					this.entityConfig.timestamps.createdAt
				] = now;
			}
		}

		if (this.entityConfig.timestamps.updatedAt) {
			const updatedAtColumn = this.entityConfig.columns.find(
				(col) => col.logical === this.entityConfig.timestamps?.updatedAt
			);

			if (updatedAtColumn) {
				(data as Record<string, unknown>)[
					this.entityConfig.timestamps.updatedAt
				] = now;
			}
		}
	}

	/**
	 * Enhance query options with entity-specific mappings
	 * @param options Original query options
	 * @returns Enhanced query options
	 */
	private enhanceQueryOptions(options?: QueryOptions): QueryOptions {
		if (!options) return {};

		const enhancedOptions: QueryOptions = { ...options };

		// Map relation names to join options if relations are provided
		if (options.relations && options.relations.length > 0 && this.entityConfig.relations) {
			enhancedOptions.joins = enhancedOptions.joins || [];

			for (const r of options.relations) {
				const relation = findRelation(this.entityConfig.relations, r.name);
				if (relation) {
					const joinOptions = this.relationToJoinOptions(relation);
					if (joinOptions) {
						enhancedOptions.joins.push(joinOptions);
					}
				}
			}
		}

		return enhancedOptions;
	}

	/**
	 * Enhance find options with entity-specific mappings
	 * @param options Original find options
	 * @returns Enhanced find options
	 */
	private enhanceFindOptions(options?: FindOptions): FindOptions {
		if (!options) return {};

		const enhancedOptions: FindOptions = { ...options };

		// Map relation names to relation options if relations are provided
		if (options.relations && options.relations.length > 0 && this.entityConfig.relations) {
			enhancedOptions.relations = [];

			for (const r of options.relations) {
				const relation = findRelation(this.entityConfig.relations, r.name);
				if (relation) {
					// Create RelationOptions from the Relation definition
					const relationType = relation.type === "manyToMany" || relation.type === "oneToMany" ? "left" : "inner";

					const relationOptions: RelationOptions = {
						name: relation.name,
						type: relationType,
						mapping: {
							table: relation.targetEntity.toLowerCase(),
							idField: '', // We don't need this here
							entity: relation.targetEntity,
							columns: [] // We don't need this here
						},
						sourceField: '',
						targetField: ''
					};

					// Set the appropriate fields based on relation type
					if (isRelationType<ManyToManyRelation>(relation, "manyToMany")) {
						// For many-to-many, we need a junction table
						relationOptions.joinCondition =
							`${this.tableName}.${relation.sourceColumn} = ${relation.junctionTable}.${relation.junctionSourceColumn}` +
							` AND ${relation.junctionTable}.${relation.junctionTargetColumn} = ${relationOptions.mapping.table}.${relation.targetColumn}`;
					} else if (isRelationType<OneToManyRelation>(relation, "oneToMany")) {
						relationOptions.sourceField = relation.sourceColumn;
						relationOptions.targetField = relation.targetColumn;
					} else if (isRelationType<ManyToOneRelation>(relation, "manyToOne")) {
						relationOptions.sourceField = relation.sourceColumn;
						relationOptions.targetField = relation.targetColumn;
					} else if (isRelationType<OneToOneRelation>(relation, "oneToOne")) {
						relationOptions.sourceField = relation.sourceColumn;
						relationOptions.targetField = relation.targetColumn;
					}

					enhancedOptions.relations.push(relationOptions);
				}
			}
		}

		return enhancedOptions;
	}

	/**
	 * Convert a relation to join options
	 * @param relation The relation definition
	 * @returns Join options
	 */
	private relationToJoinOptions(relation: Relation): JoinOptions | null {
		const context = DatabaseContext.getAppContext();
		const targetConfig = context?.getEntityConfig(relation.targetEntity);
		const targetTable = targetConfig?.table || relation.targetEntity.toLowerCase();
		const alias = targetTable.charAt(0);

		if (isRelationType<ManyToManyRelation>(relation, "manyToMany")) {
			// For many-to-many, we need to create two joins
			const junctionAlias = "j_" + relation.name;

			return {
				type: "INNER",
				table: relation.junctionTable,
				alias: junctionAlias,
				on: `${this.tableName}.${relation.sourceColumn} = ${junctionAlias}.${relation.junctionSourceColumn}`,
				nestedJoin: {
					type: "INNER",
					table: targetTable,
					alias,
					on: `${junctionAlias}.${relation.junctionTargetColumn} = ${alias}.${relation.targetColumn}`
				}
			};
		} else if (isRelationType<OneToManyRelation>(relation, "oneToMany")) {
			return {
				type: "LEFT",
				table: targetTable,
				alias,
				on: `${this.tableName}.${relation.sourceColumn} = ${alias}.${relation.targetColumn}`
			};
		} else if (isRelationType<ManyToOneRelation>(relation, "manyToOne")) {
			return {
				type: "LEFT",
				table: targetTable,
				alias,
				on: `${this.tableName}.${relation.sourceColumn} = ${alias}.${relation.targetColumn}`
			};
		} else if (isRelationType<OneToOneRelation>(relation, "oneToOne")) {
			if (relation.isOwner) {
				return {
					type: "LEFT",
					table: targetTable,
					alias,
					on: `${this.tableName}.${relation.sourceColumn} = ${alias}.${relation.targetColumn}`
				};
			} else {
				return {
					type: "LEFT",
					table: targetTable,
					alias,
					on: `${this.tableName}.${relation.sourceColumn} = ${alias}.${relation.targetColumn}`
				};
			}
		}

		return null;
	}

	/**
	 * Convert entity values to database-specific values
	 * Handles booleans and dates properly
	 * @param data Entity data
	 * @returns Converted data with database-specific types
	 */
	/**
 * Convert entity values to database-specific values
 * Handles booleans and dates properly
 * @param data Entity data
 * @returns Converted data with database-specific types
 */
	private convertToDbValues(data: Partial<T>): Record<string, unknown> {
		const result: Record<string, unknown> = {};

		// Find boolean columns
		const booleanColumns = getColumnsByType(this.entityConfig, ["boolean", "bool"]);
		const booleanColumnNames = booleanColumns.map(col => col.logical);

		// Find date columns
		const dateColumns = getColumnsByType(this.entityConfig, ["date", "datetime", "timestamp"]);
		const dateColumnNames = dateColumns.map(col => col.logical);

		for (const [key, value] of Object.entries(data)) {
			if (booleanColumnNames.includes(key) && typeof value === "boolean") {
				// Convert boolean to 0/1 for SQLite compatibility
				result[key] = value ? 1 : 0;
			} else if (dateColumnNames.includes(key) && value instanceof Date) {
				// Convert Date objects to ISO strings
				result[key] = value.toISOString();
			} else if (value === undefined) {
				// Handle undefined values (convert to null)
				result[key] = null;
			} else {
				result[key] = value;
			}
		}

		return result;
	}

	/**
	 * Initialize hooks for the entity
	 * @param configLoader Configuration loader
	 */
	private async initializeHooks(configLoader: any): Promise<void> {
		if (!this.entityConfig.hooks) {
			return;
		}

		for (const [hookType, hooks] of Object.entries(this.entityConfig.hooks)) {
			if (!Array.isArray(hooks) || hooks.length === 0) {
				continue;
			}

			// Create hook executor for this hook type
			const executor = new HookExecutor<any>(this.logger);

			// Load and add each hook
			for (const hook of hooks) {
				try {
					const hookImpl = await this.loadHookImplementation(hook, hookType, configLoader);
					executor.add(hookImpl);
				} catch (error: any) {
					this.logger?.error(`Failed to load hook ${hookType}.${hook.name}: ${error.message}`);
				}
			}

			// Store the executor
			this.hookExecutors.set(hookType, executor);
		}
	}

	/**
	 * Get all registered hook types
	 * @returns Array of hook types
	 */
	getHookTypes(): string[] {
		return Array.from(this.hookExecutors.keys());
	}

	/**
	 * Check if a specific hook type has any hooks
	 * @param hookType Hook type
	 * @returns Whether the hook type has any hooks
	 */
	hasHooks(hookType: string): boolean {
		const executor = this.hookExecutors.get(hookType);
		return !!executor && executor.hasHooks();
	}

	/**
	 * Get count of hooks for a specific hook type
	 * @param hookType Hook type
	 * @returns Number of hooks registered for the type
	 */
	getHookCount(hookType: string): number {
		const executor = this.hookExecutors.get(hookType);
		return executor ? executor.count() : 0;
	}

	/**
	 * Load a hook implementation
	 * @param hook Hook definition
	 * @param hookType Hook type
	 * @param configLoader Configuration loader
	 * @returns Hook implementation
	 */
	private async loadHookImplementation(
		hook: any,
		hookType: string,
		configLoader: any
	): Promise<HookImplementation> {
		let fn: HookFunction;

		// Load implementation based on type
		if (typeof hook.implementation === 'function') {
			// Direct function reference
			fn = hook.implementation;
		} else if (typeof hook.implementation === 'string') {
			if (hook.implementation.startsWith('./') || hook.implementation.startsWith('../')) {
				// External file
				const module = await configLoader.loadExternalCode(hook.implementation);
				fn = module.default || module;
			} else {
				// Inline implementation
				fn = new Function(
					'entity',
					'context',
					`return (async (entity, context) => {
          ${hook.implementation}
        })(entity, context);`
				) as HookFunction;
			}
		} else {
			throw new Error(`Invalid hook implementation for ${hookType}.${hook.name}`);
		}

		// Create condition function if specified
		let condition: ((data: any, context: HookContext) => boolean | Promise<boolean>) | undefined;
		if (hook.condition) {
			condition = new Function(
				'entity',
				'context',
				`return ${hook.condition};`
			) as (data: any, context: HookContext) => boolean;
		}

		// Create hook implementation
		return {
			name: `${this.entityConfig.entity}.${hookType}.${hook.name}`,
			fn,
			isAsync: hook.async !== false, // Default to async=true
			priority: hook.priority || 10,
			timeout: hook.timeout,
			condition
		};
	}

	/**
	 * Create a query builder for this entity
	 * @returns Query builder instance
	 */
	protected createQueryBuilder(): any {
		return this.db.createQueryBuilder();
	}

	/**
	 * Execute hooks for a given hook type
	 * @param hookType Hook type
	 * @param data Data to pass to hooks
	 * @param context Hook context
	 * @returns Result after all hooks have executed
	 */
	protected async executeHooks<D = any>(
		hookType: string,
		data: D,
		context: HookContext
	): Promise<D> {
		const executor = this.hookExecutors.get(hookType);

		if (!executor || !executor.hasHooks()) {
			return data;
		}

		return executor.execute(data, { context });
	}

	/**
	 * Initialize the entity DAO
	 * @param configLoader Configuration loader
	 */
	public async initialize(configLoader: any): Promise<void> {
		// Initialize hooks
		await this.initializeHooks(configLoader);

		// Initialize computed properties
		if (this.entityConfig.computed && this.entityConfig.computed.length > 0 && this.logger) {
			const implementations = await this.loadComputedPropertyImplementations(configLoader);
			this.computedPropertiesProcessor = (entity: any) => processComputedProperties(entity, implementations);
		}
	}
	/**
 * Update an entity
 * @param id The entity ID or object with composite key values
 * @param data The data to update
 * @param context Optional hook context
 * @returns Number of affected rows
 */
	async update(
		id: IdType | Record<string, any>,
		data: Partial<T>,
		context?: HookContext
	): Promise<number> {
		const ctx = context || this.createDefaultContext();

		// Create a properly structured object for the hooks that doesn't use a generic 'id' property
		let hookData: Record<string, any> = { ...data };

		// Store ID in a separate property for internal use only
		ctx.data = ctx.data || {};
		ctx.data._entityId = id;

		// Execute before hooks with just the data, not mixing in the ID
		let processedData = await this.executeHooks('beforeUpdate', hookData, ctx);

		this.applyTimestamps(processedData, "update");

		try {
			// Remove any ID fields from the update data
			if (typeof this.entityConfig.idField === 'string') {
				delete processedData[this.entityConfig.idField];
				// Also remove the generic 'id' field if it exists
				delete processedData['id'];
			} else if (Array.isArray(this.entityConfig.idField)) {
				for (const field of this.entityConfig.idField) {
					delete processedData[field];
				}
				// Also remove the generic 'id' field if it exists
				delete processedData['id'];
			}

			// Convert booleans to database-specific format
			const convertedData = this.convertToDbValues(processedData);

			const physicalData = mapRecordToPhysical(
				this.entityConfig,
				convertedData
			);

			let result: number;

			if (Array.isArray(this.entityConfig.idField)) {
				// Handle composite primary key
				if (typeof id !== 'object') {
					throw new Error(`Composite primary key requires an object with key-value pairs`);
				}

				// Build conditions object for composite key
				const conditions: Record<string, unknown> = {};
				for (const field of this.entityConfig.idField) {
					if ((id as Record<string, unknown>)[field] === undefined) {
						throw new Error(`Missing value for primary key field "${field}"`);
					}
					conditions[mapColumnToPhysical(this.entityConfig, field)] = (id as Record<string, unknown>)[field];
				}

				result = await this.db.updateBy<Record<string, unknown>>(
					this.tableName,
					conditions,
					physicalData
				);
			} else {
				// Handle single primary key
				result = await this.db.update<Record<string, unknown>>(
					this.tableName,
					this.physicalIdField,
					id as unknown as number | string,
					physicalData
				);
			}

			// Execute after hooks
			await this.executeHooks('afterUpdate', processedData, ctx);

			return result;
		} catch (error: any) {
			if (this.logger) {
				this.logger.error(new Error(`Error updating entity: ${error.message}`, { cause: error }));
			}
			throw error;
		}
	}

	/**
 * Manage a many-to-many relationship with implicit junction table
 * @param sourceId Source entity ID or object with composite key values
 * @param relationName Name of the many-to-many relationship
 * @param targetIds Target entity IDs to add or remove
 * @param operation 'add', 'remove', or 'set'
 * @returns Number of affected records
 */
	async manageManyToMany(
		sourceId: IdType | Record<string, any>,
		relationName: string,
		targetIds: (IdType | Record<string, any>)[],
		operation: 'add' | 'remove' | 'set' = 'add'
	): Promise<number> {
		if (!this.entityConfig.relations) {
			throw new Error(
				`No relationships defined for entity ${this.entityConfig.entity}`
			);
		}

		const relation = this.entityConfig.relations.find(r => r.name === relationName);
		if (!relation) {
			throw new Error(
				`Relationship ${relationName} not found on entity ${this.entityConfig.entity}`
			);
		}

		if (relation.type !== 'manyToMany') {
			throw new Error(
				`Relationship ${relationName} is not a many-to-many relationship`
			);
		}

		try {
			const junctionTable = relation.junctionTable;

			// Ensure the junction table exists
			const junctionTableExists = await this.db.tableExists(junctionTable);
			if (!junctionTableExists) {
				this.logger?.info(`Creating junction table ${junctionTable}`);

				// Create junction table configuration
				const junctionConfig: JunctionTableConfig = {
					table: junctionTable,
					sourceEntity: relation.sourceEntity,
					targetEntity: relation.targetEntity,
					sourceColumn: relation.junctionSourceColumn,
					targetColumn: relation.junctionTargetColumn,
					extraColumns: relation.junctionExtraColumns || []
				};

				// Create the junction table
				await this.db.createJunctionTable(junctionConfig, true);
			}

			// Handle operation types
			if (operation === 'set') {
				// For 'set', clear existing relations first
				await this.clearManyToManyRelations(sourceId, relation);

				// Then add new relations
				return this.addManyToManyRelations(sourceId, relation, targetIds);
			} else if (operation === 'add') {
				return this.addManyToManyRelations(sourceId, relation, targetIds);
			} else if (operation === 'remove') {
				return this.removeManyToManyRelations(sourceId, relation, targetIds);
			}

			return 0;
		} catch (error: any) {
			if (this.logger) {
				this.logger.error(`Error managing many-to-many relationship: ${error.message}`);
			}
			throw error;
		}
	}

	/**
	 * Clear all many-to-many relations for a source entity
	 * @param sourceId Source entity ID or object with composite key values
	 * @param relation Many-to-many relation
	 * @returns Number of affected records
	 */
	private async clearManyToManyRelations(
		sourceId: IdType | Record<string, any>,
		relation: any
	): Promise<number> {
		const conditions: Record<string, unknown> = {};

		// Handle source ID which can be composite
		if (Array.isArray(relation.sourceColumn)) {
			if (typeof sourceId !== 'object') {
				throw new Error('Composite key requires an object with key-value pairs');
			}

			relation.sourceColumn.forEach((col: string, index: number) => {
				const sourceField = Array.isArray(relation.junctionSourceColumn)
					? relation.junctionSourceColumn[index]
					: relation.junctionSourceColumn;

				conditions[sourceField] = (sourceId as Record<string, unknown>)[col];
			});
		} else {
			const sourceField = relation.junctionSourceColumn;
			conditions[sourceField] = typeof sourceId === 'object'
				? (sourceId as Record<string, unknown>)[relation.sourceColumn]
				: sourceId;
		}

		return this.db.deleteBy(relation.junctionTable, conditions);
	}

	/**
	 * Add many-to-many relations
	 * @param sourceId Source entity ID or object with composite key values
	 * @param relation Many-to-many relation
	 * @param targetIds Target entity IDs to add
	 * @returns Number of affected records
	 */
	private async addManyToManyRelations(
		sourceId: IdType | Record<string, any>,
		relation: any,
		targetIds: (IdType | Record<string, any>)[]
	): Promise<number> {
		if (targetIds.length === 0) return 0;

		// Create records to insert
		const records: Record<string, unknown>[] = [];

		for (const targetId of targetIds) {
			const record: Record<string, unknown> = {};

			// Handle source ID which can be composite
			if (Array.isArray(relation.sourceColumn)) {
				if (typeof sourceId !== 'object') {
					throw new Error('Composite key requires an object with key-value pairs');
				}

				relation.sourceColumn.forEach((col: string, index: number) => {
					const sourceField = Array.isArray(relation.junctionSourceColumn)
						? relation.junctionSourceColumn[index]
						: relation.junctionSourceColumn;

					record[sourceField] = (sourceId as Record<string, unknown>)[col];
				});
			} else {
				const sourceField = relation.junctionSourceColumn;
				record[sourceField] = typeof sourceId === 'object'
					? (sourceId as Record<string, unknown>)[relation.sourceColumn]
					: sourceId;
			}

			// Handle target ID which can be composite
			if (Array.isArray(relation.targetColumn)) {
				if (typeof targetId !== 'object') {
					throw new Error('Composite key requires an object with key-value pairs');
				}

				relation.targetColumn.forEach((col: string, index: number) => {
					const targetField = Array.isArray(relation.junctionTargetColumn)
						? relation.junctionTargetColumn[index]
						: relation.junctionTargetColumn;

					record[targetField] = (targetId as Record<string, unknown>)[col];
				});
			} else {
				const targetField = relation.junctionTargetColumn;
				record[targetField] = typeof targetId === 'object'
					? (targetId as Record<string, unknown>)[relation.targetColumn]
					: targetId;
			}

			records.push(record);
		}

		return this.db.bulkInsert(relation.junctionTable, records);
	}

	/**
	 * Remove many-to-many relations
	 * @param sourceId Source entity ID or object with composite key values
	 * @param relation Many-to-many relation
	 * @param targetIds Target entity IDs to remove
	 * @returns Number of affected records
	 */
	private async removeManyToManyRelations(
		sourceId: IdType | Record<string, any>,
		relation: any,
		targetIds: (IdType | Record<string, any>)[]
	): Promise<number> {
		if (targetIds.length === 0) return 0;

		let affectedRows = 0;

		for (const targetId of targetIds) {
			const conditions: Record<string, unknown> = {};

			// Handle source ID which can be composite
			if (Array.isArray(relation.sourceColumn)) {
				if (typeof sourceId !== 'object') {
					throw new Error('Composite key requires an object with key-value pairs');
				}

				relation.sourceColumn.forEach((col: string, index: number) => {
					const sourceField = Array.isArray(relation.junctionSourceColumn)
						? relation.junctionSourceColumn[index]
						: relation.junctionSourceColumn;

					conditions[sourceField] = (sourceId as Record<string, unknown>)[col];
				});
			} else {
				const sourceField = relation.junctionSourceColumn;
				conditions[sourceField] = typeof sourceId === 'object'
					? (sourceId as Record<string, unknown>)[relation.sourceColumn]
					: sourceId;
			}

			// Handle target ID which can be composite
			if (Array.isArray(relation.targetColumn)) {
				if (typeof targetId !== 'object') {
					throw new Error('Composite key requires an object with key-value pairs');
				}

				relation.targetColumn.forEach((col: string, index: number) => {
					const targetField = Array.isArray(relation.junctionTargetColumn)
						? relation.junctionTargetColumn[index]
						: relation.junctionTargetColumn;

					conditions[targetField] = (targetId as Record<string, unknown>)[col];
				});
			} else {
				const targetField = relation.junctionTargetColumn;
				conditions[targetField] = typeof targetId === 'object'
					? (targetId as Record<string, unknown>)[relation.targetColumn]
					: targetId;
			}

			const result = await this.db.deleteBy(relation.junctionTable, conditions);
			affectedRows += result;
		}

		return affectedRows;
	}

	/**
	 * Find all entities
	 * @param options Optional query options
	 * @param context Optional hook context
	 * @returns Array of entities
	 */
	async findAll(options?: QueryOptions, context?: HookContext): Promise<T[]> {
		const ctx = context || this.createDefaultContext();

		// Execute before hooks
		let processedOptions = await this.executeHooks('beforeGetAll', options, ctx);

		const queryOptions = this.enhanceQueryOptions(processedOptions);
		const results = await this.db.findAll<Record<string, unknown>>(
			this.tableName,
			queryOptions
		);

		// Map results and apply computed properties
		const mappedResults = results.map((result) => mapToEntity(this.entityConfig, result) as T);
		const withComputed = mappedResults.map(entity => this.computedPropertiesProcessor(entity));

		// Execute after hooks
		return await this.executeHooks('afterGetAll', withComputed, ctx);
	}

	/**
 * Find entity by ID
 * @param id The entity ID or object with composite key values
 * @param options Optional find options
 * @param context Optional hook context
 * @returns The entity or undefined if not found
 */
	async findById(
		id: IdType | Record<string, any>,
		options?: FindOptions,
		context?: HookContext
	): Promise<T | undefined> {
		const ctx = context || this.createDefaultContext();

		// Execute before hooks
		let processedId = await this.executeHooks('beforeGetById', id, ctx);

		const findOptions = this.enhanceFindOptions(options);

		try {
			let result: Record<string, unknown> | undefined;

			if (Array.isArray(this.entityConfig.idField)) {
				// Handle composite primary key
				if (typeof processedId !== 'object') {
					throw new Error(`Composite primary key requires an object with key-value pairs`);
				}

				// Build conditions object for composite key
				const conditions: Record<string, unknown> = {};
				for (const field of this.entityConfig.idField) {
					if (processedId[field] === undefined) {
						throw new Error(`Missing value for primary key field "${field}"`);
					}
					conditions[mapColumnToPhysical(this.entityConfig, field)] = processedId[field];
				}

				result = await this.db.findOneBy<Record<string, unknown>>(
					this.tableName,
					conditions,
					findOptions
				);
			} else {
				// Handle single primary key
				result = await this.db.findById<Record<string, unknown>>(
					this.tableName,
					this.physicalIdField,
					processedId as unknown as number | string,
					findOptions
				);
			}

			if (!result) {
				return undefined;
			}

			// Map result and apply computed properties
			const mappedResult = mapToEntity(this.entityConfig, result) as T;
			const withComputed = this.computedPropertiesProcessor(mappedResult);

			// Execute after hooks
			return await this.executeHooks('afterGetById', withComputed, ctx);
		} catch (error: any) {
			if (this.logger) {
				this.logger.error(`Error finding entity by ID: ${error}`);
			}
			throw error;
		}
	}

	/**
	 * Process an API request through the entity's API hooks
	 * @param request The API request
	 * @param operation The API operation (getAll, getById, create, update, delete, action)
	 * @param context Controller context
	 * @returns Processed request
	 */
	async processApiRequest(
		request: any,
		operation: string,
		context: HookContext
	): Promise<any> {
		// Enhanced context with operation info
		const enhancedContext = {
			...context,
			operation
		};

		// Execute beforeApi hooks
		return await this.executeHooks('beforeApi', request, enhancedContext);
	}

	/**
	 * Process an API response through the entity's API hooks
	 * @param response The API response
	 * @param operation The API operation (getAll, getById, create, update, delete, action)
	 * @param context Controller context
	 * @returns Processed response
	 */
	async processApiResponse(
		response: any,
		operation: string,
		context: HookContext
	): Promise<any> {
		// Enhanced context with operation info
		const enhancedContext = {
			...context,
			operation
		};

		// Execute afterApi hooks
		return await this.executeHooks('afterApi', response, enhancedContext);
	}

	/**
	 * Create a default hook context
	 * @returns Default hook context
	 */
	protected createDefaultContext(): HookContext {
		return {
			db: this.db,
			logger: this.logger,
			entityName: this.entityConfig.entity,
			data: {},
			getService: <T>(_name: string): T => {
				throw new Error('Service not available in default context');
			},
			getEntityManager: <T>(_name?: string): any => {
				return this;
			}
		};
	}
}

/**
 * Create an entity DAO
 * Factory function to create DAOs for entities with hook and computed property support
 * 
 * @param config Entity configuration
 * @param db Database adapter
 * @param logger Logger instance
 * @param configLoader Configuration loader
 * @returns Entity DAO instance
 */
export function createEntityDao<T>(
	config: EntityConfig,
	db: DatabaseAdapter,
	logger?: Logger,
	configLoader?: any
): EntityDao<T> {
	return new EntityDao<T>(config, db, logger, configLoader);
}

/**
 * Create a hook context
 * @param db Database adapter
 * @param logger Logger instance
 * @param req HTTP request
 * @param res HTTP response
 * @param next Express next function
 * @returns Hook context
 */
export function createHookContext(
	db: DatabaseAdapter,
	logger: Logger,
	req?: any,
	res?: any,
	next?: any
): HookContext {
	return {
		db,
		logger,
		user: req?.user,
		request: req,
		response: res,
		next,
		data: {}
	};
}

/**
 * Create a controller context
 * @param db Database adapter
 * @param logger Logger instance
 * @param entityName Entity name
 * @param operation Operation name
 * @param req HTTP request
 * @param res HTTP response
 * @param next Express next function
 * @returns Controller context
 */
export function createControllerContext(
	db: DatabaseAdapter,
	logger: Logger,
	entityName: string,
	operation: string,
	req: any,
	res: any,
	next: any
): ControllerContext {
	return {
		db,
		logger,
		entityName,
		operation,
		user: req.user,
		request: req,
		response: res,
		next,
		params: req.params || {},
		query: req.query || {},
		body: req.body || {},
		data: {}
	};
}