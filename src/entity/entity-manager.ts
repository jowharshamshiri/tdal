/**
 * Entity Manager
 * Provides entity lifecycle management, DAO factory, and API operations
 */

import { EntityHook, EntityConfig, EntityAction, getColumnsByType, mapColumnToPhysical, mapRecordToLogical, mapRecordToPhysical, getApiReadableColumns, getApiWritableColumns, findAction } from './entity-config';
import { DatabaseAdapter } from '../database/core/types';
import { processComputedProperties, loadComputedPropertyImplementations } from './computed-properties';
import { HookContext, Logger, ControllerContext, ActionFunction } from '@/core/types';
import { AggregateOptions, DatabaseContext, DeleteOptions, FindOptions, findRelation, isRelationType, JoinOptions, ManyToManyRelation, ManyToOneRelation, OneToManyRelation, OneToOneRelation, QueryOptions, Relation, RelationOptions, TransactionIsolationLevel, UpdateOptions } from '@/database';

/**
 * Entity hook implementations
 * Contains the actual implementation of hooks defined in YAML
 */
export interface EntityHookImplementations {
	beforeCreate?: Array<(entity: any, context: HookContext) => Promise<any>>;
	afterCreate?: Array<(entity: any, context: HookContext) => Promise<any>>;
	beforeUpdate?: Array<(id: any, entity: any, context: HookContext) => Promise<any>>;
	afterUpdate?: Array<(id: any, entity: any, context: HookContext) => Promise<any>>;
	beforeDelete?: Array<(id: any, context: HookContext) => Promise<boolean>>;
	afterDelete?: Array<(id: any, context: HookContext) => Promise<void>>;
	beforeGetById?: Array<(id: any, context: HookContext) => Promise<any>>;
	afterGetById?: Array<(entity: any, context: HookContext) => Promise<any>>;
	beforeGetAll?: Array<(params: any, context: HookContext) => Promise<any>>;
	afterGetAll?: Array<(entities: any[], context: HookContext) => Promise<any[]>>;
	// API-specific hooks
	beforeApi?: Array<(request: any, context: ControllerContext) => Promise<any>>;
	afterApi?: Array<(response: any, context: ControllerContext) => Promise<any>>;
}

/**
 * Action implementation registry
 * Maps action names to their implementations
 */
export interface ActionImplementations {
	[actionName: string]: ActionFunction;
}

/**
 * Entity hook handler
 * Used to execute hooks defined in YAML
 */
export class EntityHookHandler {
	private implementations: EntityHookImplementations = {};
	private loadedHooks: Set<string> = new Set();
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
	 * Initialize all hooks
	 */
	async initialize(): Promise<void> {
		if (!this.config.hooks) {
			return;
		}

		// Initialize all hook types
		for (const hookType of Object.keys(this.config.hooks || {})) {
			const hooks = (this.config.hooks as any)[hookType];
			if (!hooks || !Array.isArray(hooks)) continue;

			if (!this.implementations[hookType as keyof EntityHookImplementations]) {
				this.implementations[hookType as keyof EntityHookImplementations] = [];
			}

			for (const hook of hooks) {
				try {
					await this.loadHook(hookType, hook);
				} catch (error) {
					this.logger.error(`Failed to load hook ${hook.name} for ${this.config.entity}: ${error}`);
				}
			}
		}
	}

	/**
	 * Load a specific hook
	 * @param hookType Hook type (beforeCreate, afterUpdate, etc.)
	 * @param hook Hook definition
	 */
	private async loadHook(hookType: string, hook: any): Promise<void> {
		const hookKey = `${hookType}:${hook.name}`;

		// Skip if already loaded
		if (this.loadedHooks.has(hookKey)) {
			return;
		}

		try {
			let implementation: Function;

			// If implementation is a file path, load it
			if (hook.implementation && hook.implementation.startsWith('./')) {
				const hookModule = await this.configLoader.loadExternalCode(hook.implementation);
				implementation = hookModule.default || hookModule;
			} else {
				// Otherwise, it's an inline implementation
				// Convert the string to a function
				implementation = new Function('entity', 'context', `return (async (entity, context) => {
          ${hook.implementation}
        })(entity, context);`);
			}

			// Store condition as function if provided
			let condition: Function | undefined;
			if (hook.condition) {
				condition = new Function('entity', 'context', `return ${hook.condition};`);
			}

			// Create the hook function wrapper
			const hookFn = async (entity: any, context: HookContext) => {
				// Skip if condition is not met
				if (condition && !(await condition(entity, context))) {
					return entity;
				}

				// Execute the hook
				return await implementation(entity, context);
			};

			// Add to implementations
			const implArray = this.implementations[hookType as keyof EntityHookImplementations] as Array<any>;
			if (implArray) {
				implArray.push(hookFn);
			}

			this.loadedHooks.add(hookKey);
			this.logger.debug(`Loaded hook ${hookKey} for ${this.config.entity}`);
		} catch (error) {
			this.logger.error(`Failed to load hook ${hookKey} for ${this.config.entity}: ${error}`);
			throw error;
		}
	}

	/**
	 * Execute a hook
	 * @param hookType Hook type (beforeCreate, afterUpdate, etc.)
	 * @param params Hook parameters
	 * @param context Hook context
	 * @returns Hook result
	 */
	async executeHook(
		hookType: keyof EntityHookImplementations,
		params: any,
		context: HookContext
	): Promise<any> {
		const hooks = this.implementations[hookType];
		if (!hooks || !hooks.length) {
			return params; // No hooks to execute, return params unchanged
		}

		try {
			let result = params;

			// Execute all hooks of this type in sequence
			for (const hook of hooks) {
				result = await hook(result, context);
			}

			return result;
		} catch (error) {
			this.logger.error(`Error executing ${hookType} hook for ${this.config.entity}: ${error}`);
			throw error;
		}
	}
}

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
			} catch (error) {
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
			if (action.implementation && action.implementation.startsWith('./')) {
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
		} catch (error) {
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
		} catch (error) {
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
 * Computed property implementations
 * Maps property names to their implementation functions
 */
export interface ComputedPropertyImplementations {
	[propertyName: string]: (entity: any) => any;
}

/**
 * Enhanced Data Access Object class with common CRUD operations,
 * hooks, computed property support, and API operations
 * @template T The model type
 * @template IdType The type of the ID field (usually number)
 */
export class EntityDao<T, IdType = number> {
	/**
	 * The database adapter instance
	 */
	protected db: DatabaseAdapter;

	/**
	 * Entity mapping for the DAO
	 */
	protected readonly entityMapping: EntityConfig;

	/**
	 * Hook handler for entity lifecycle events
	 */
	private hookHandler?: EntityHookHandler;

	/**
	 * Action handler for entity actions
	 */
	private actionHandler?: EntityActionHandler;

	/**
	 * Computed properties processor function
	 */
	private computedPropertiesProcessor: (entity: any) => any;

	/**
	 * Logger instance
	 */
	private logger?: Logger;

	/**
	 * Constructor
	 * @param entityMapping Entity mapping configuration
	 * @param db Optional database adapter instance (uses singleton if not provided)
	 * @param logger Optional logger instance
	 * @param configLoader Optional configuration loader for hooks and computed properties
	 */
	constructor(
		entityMapping: EntityConfig,
		db?: DatabaseAdapter,
		logger?: Logger,
		configLoader?: any
	) {
		this.entityMapping = entityMapping;
		this.db = db || DatabaseContext.getDatabase();
		this.logger = logger;

		// Default no-op computed properties processor
		this.computedPropertiesProcessor = (entity) => entity;

		// Initialize hooks, actions, and computed properties if logger and configLoader are provided
		if (logger && configLoader) {
			this.hookHandler = new EntityHookHandler(entityMapping, logger, configLoader);
			this.actionHandler = new EntityActionHandler(entityMapping, logger, configLoader);
			this.initialize(configLoader);
		}
	}

	/**
	 * Initialize hooks, actions, and computed properties
	 * @param configLoader Configuration loader
	 */
	private async initialize(configLoader: any): Promise<void> {
		// Initialize hook handler
		if (this.hookHandler) {
			await this.hookHandler.initialize();
		}

		// Initialize action handler
		if (this.actionHandler) {
			await this.actionHandler.initialize();
		}

		// Initialize computed properties
		if (this.entityMapping.computed && this.entityMapping.computed.length > 0 && this.logger) {
			const implementations = await this.loadComputedPropertyImplementations(configLoader);
			this.computedPropertiesProcessor = (entity: any) => this.processComputedProperties(entity, implementations);
		}
	}

	/**
	 * Load computed property implementations
	 * @param configLoader Configuration loader
	 * @returns Map of computed property implementations
	 */
	private async loadComputedPropertyImplementations(configLoader: any): Promise<ComputedPropertyImplementations> {
		if (!this.entityMapping.computed || !this.logger) {
			return {};
		}

		const implementations: ComputedPropertyImplementations = {};

		for (const prop of this.entityMapping.computed) {
			try {
				let implementation: (entity: any) => any;

				if (prop.implementation.startsWith('./')) {
					// External file
					const module = await configLoader.loadExternalCode(prop.implementation);
					implementation = module.default || module;
				} else {
					// Inline implementation
					implementation = this.createComputedPropertyFunction(prop);
				}

				implementations[prop.name] = implementation;
				this.logger.debug(`Loaded computed property ${prop.name} for ${this.entityMapping.entity}`);
			} catch (error) {
				if (this.logger) {
					this.logger.error(`Failed to load computed property ${prop.name} for ${this.entityMapping.entity}: ${error}`);
				}
			}
		}

		return implementations;
	}

	/**
	 * Create a function from computed property definition
	 * @param prop Computed property definition
	 * @returns Implementation function
	 */
	private createComputedPropertyFunction(prop: any): (entity: any) => any {
		// Create a function from the implementation string
		return new Function(
			'entity',
			`return (${prop.implementation})(entity);`
		) as (entity: any) => any;
	}

	/**
	 * Process computed properties for an entity
	 * @param entity Entity object
	 * @param implementations Computed property implementations
	 * @returns Entity with computed properties
	 */
	private processComputedProperties<T>(
		entity: T,
		implementations: ComputedPropertyImplementations
	): T {
		if (!entity || Object.keys(implementations).length === 0) {
			return entity;
		}

		// Create a new object to avoid modifying the original
		const result = { ...entity };

		// Get property order to handle dependencies correctly
		const propertyOrder = this.getComputedPropertyOrder(
			Object.keys(implementations),
			prop => implementations[prop].toString().match(/entity\.(\w+)/g)?.map(m => m.replace('entity.', '')) || []
		);

		// Calculate each computed property in the correct order
		for (const propName of propertyOrder) {
			try {
				result[propName as keyof T] = implementations[propName](entity) as T[keyof T];
			} catch (error) {
				if (this.logger) {
					this.logger.error(`Error calculating computed property ${propName}: ${error}`);
				}
			}
		}

		return result;
	}

	/**
	 * Sort computed properties by dependencies using topological sort
	 * Ensures properties are calculated in the correct order
	 * 
	 * @param propertyNames Names of computed properties
	 * @param getDependenciesFn Function to get dependencies for a property
	 * @returns Sorted property names
	 */
	private getComputedPropertyOrder(
		propertyNames: string[],
		getDependenciesFn: (prop: string) => string[]
	): string[] {
		if (propertyNames.length === 0) {
			return [];
		}

		const result: string[] = [];
		const visited = new Set<string>();
		const visiting = new Set<string>();

		// Build dependency graph
		const graph = new Map<string, string[]>();
		for (const prop of propertyNames) {
			graph.set(prop, getDependenciesFn(prop));
		}

		// Topological sort with cycle detection
		function visit(prop: string): void {
			if (visited.has(prop)) return;
			if (visiting.has(prop)) {
				throw new Error(`Cyclic dependency detected in computed properties: ${prop}`);
			}

			visiting.add(prop);

			const dependencies = graph.get(prop) || [];
			for (const dep of dependencies) {
				// Only consider dependencies that are computed properties
				if (graph.has(dep)) {
					visit(dep);
				}
			}

			visiting.delete(prop);
			visited.add(prop);
			result.push(prop);
		}

		// Visit all properties
		for (const prop of graph.keys()) {
			if (!visited.has(prop)) {
				visit(prop);
			}
		}

		return result;
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
		return this.entityMapping;
	}

	/**
	 * Get the table name for the entity
	 */
	protected get tableName(): string {
		return this.entityMapping.table;
	}

	/**
	 * Get the ID field name for the entity
	 */
	protected get idField(): string {
		return this.entityMapping.idField;
	}

	/**
	 * Get the physical ID field name for the entity
	 */
	protected get physicalIdField(): string {
		return mapColumnToPhysical(this.entityMapping, this.idField);
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
		let processedOptions = options;
		if (this.hookHandler) {
			processedOptions = await this.hookHandler.executeHook('beforeGetAll', options, ctx);
		}

		const queryOptions = this.enhanceQueryOptions(processedOptions);
		const results = await this.db.findAll<Record<string, unknown>>(
			this.tableName,
			queryOptions
		);

		// Map results and apply computed properties
		const mappedResults = results.map((result) => this.mapToEntity(result) as T);
		const withComputed = mappedResults.map(entity => this.computedPropertiesProcessor(entity));

		// Execute after hooks
		if (this.hookHandler) {
			return await this.hookHandler.executeHook('afterGetAll', withComputed, ctx);
		}

		return withComputed;
	}

	/**
	 * Find a single entity by conditions
	 * @param conditions Field-value pairs to filter by
	 * @param options Optional find options
	 * @returns The entity or undefined if not found
	 */
	async findOneBy(conditions: Partial<T>, options?: FindOptions): Promise<T | undefined> {
		const physicalConditions = mapRecordToPhysical(
			this.entityMapping,
			conditions as unknown as Record<string, unknown>
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
		const mappedResult = this.mapToEntity(result) as T;
		return this.computedPropertiesProcessor(mappedResult);
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
			this.entityMapping,
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
			) => this)(this.entityMapping, db, this.logger);

			return callback(transactionDao);
		}, isolationLevel);
	}

	/**
	 * Find entity by ID
	 * @param id The entity ID
	 * @param options Optional find options
	 * @param context Optional hook context
	 * @returns The entity or undefined if not found
	 */
	async findById(id: IdType, options?: FindOptions, context?: HookContext): Promise<T | undefined> {
		const ctx = context || this.createDefaultContext();

		// Execute before hooks
		let processedId = id;
		if (this.hookHandler) {
			processedId = await this.hookHandler.executeHook('beforeGetById', id, ctx);
		}

		const findOptions = this.enhanceFindOptions(options);

		try {
			const result = await this.db.findById<Record<string, unknown>>(
				this.tableName,
				this.physicalIdField,
				processedId as unknown as number | string,
				findOptions
			);

			if (!result) {
				return undefined;
			}

			// Map result and apply computed properties
			const mappedResult = this.mapToEntity(result) as T;
			const withComputed = this.computedPropertiesProcessor(mappedResult);

			// Execute after hooks
			if (this.hookHandler) {
				return await this.hookHandler.executeHook('afterGetById', withComputed, ctx);
			}

			return withComputed;
		} catch (error) {
			if (this.logger) {
				this.logger.error(`Error finding entity by ID: ${error}`);
			}
			return undefined;
		}
	}

	/**
	 * Delete an entity
	 * @param id The entity ID
	 * @param context Optional hook context
	 * @returns Number of affected rows
	 */
	async delete(id: IdType, context?: HookContext): Promise<number> {
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
			if (this.entityMapping.softDelete) {
				const { column, deletedValue } = this.entityMapping.softDelete;

				// Apply soft delete
				return this.update(id, {
					[column]: deletedValue,
				} as unknown as Partial<T>, ctx);
			}

			const result = await this.db.delete(
				this.tableName,
				this.physicalIdField,
				id as unknown as number | string
			);

			// Execute after hooks
			if (this.hookHandler) {
				await this.hookHandler.executeHook('afterDelete', id, ctx);
			}

			return result;
		} catch (error) {
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
			if (this.entityMapping.softDelete) {
				const { column, deletedValue } = this.entityMapping.softDelete;

				// Apply soft delete with update
				return this.updateBy(conditions, {
					[column]: deletedValue,
				} as unknown as Partial<T>);
			}

			const physicalConditions = mapRecordToPhysical(
				this.entityMapping,
				conditions as unknown as Record<string, unknown>
			);

			return this.db.deleteBy(this.tableName, physicalConditions, options);
		} catch (error) {
			if (this.logger) {
				this.logger.error(`Error deleting entities by conditions: ${error}`);
			}
			return 0;
		}
	}

	/**
	 * Check if an entity exists
	 * @param id The entity ID
	 * @returns Whether the entity exists
	 */
	async exists(id: IdType): Promise<boolean> {
		try {
			const exists = await this.db.exists(this.tableName, {
				[this.physicalIdField]: id,
			});

			return exists;
		} catch (error) {
			if (this.logger) {
				this.logger.error(`Error checking if entity exists: ${error}`);
			}
			return false;
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
			this.entityMapping,
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
	 * Update an entity
	 * @param id The entity ID
	 * @param data The data to update
	 * @param context Optional hook context
	 * @returns Number of affected rows
	 */
	async update(
		id: IdType,
		data: Partial<T>,
		context?: HookContext
	): Promise<number> {
		const ctx = context || this.createDefaultContext();

		// Execute before hooks
		let processedData = { ...data };
		if (this.hookHandler) {
			processedData = await this.hookHandler.executeHook('beforeUpdate', { id, ...data }, ctx);
		}

		this.applyTimestamps(processedData, "update");

		try {
			// Convert booleans to database-specific format
			const convertedData = this.convertToDbValues(processedData);

			const physicalData = mapRecordToPhysical(
				this.entityMapping,
				convertedData
			);

			const result = await this.db.update<Record<string, unknown>>(
				this.tableName,
				this.physicalIdField,
				id as unknown as number | string,
				physicalData
			);

			// Execute after hooks
			if (this.hookHandler) {
				await this.hookHandler.executeHook('afterUpdate', { id, ...processedData }, ctx);
			}

			return result;
		} catch (error) {
			if (this.logger) {
				this.logger.error(`Error updating entity: ${error}`);
			}
			return 0;
		}
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
				this.entityMapping,
				convertedData
			);

			const physicalConditions = mapRecordToPhysical(
				this.entityMapping,
				conditions as unknown as Record<string, unknown>
			);

			return this.db.updateBy<Record<string, unknown>>(
				this.tableName,
				physicalConditions,
				physicalData,
				options
			);
		} catch (error) {
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

		if (idValue !== undefined && idValue !== null) {
			await this.update(idValue as IdType, data, context);
			return idValue as IdType;
		} else {
			return this.create(data, context);
		}
	}

	/**
	 * Perform a bulk insert of multiple entities
	 * @param dataArray Array of entity data
	 * @returns Number of inserted entities
	 */
	async bulkCreate(dataArray: Partial<T>[]): Promise<number> {
		if (dataArray.length === 0) return 0;

		// Apply timestamps to all items
		dataArray.forEach(data => {
			this.applyTimestamps(data, "create");
		});

		// Convert booleans and map to physical columns
		const physicalDataArray = dataArray.map(data => {
			const convertedData = this.convertToDbValues(data);
			return mapRecordToPhysical(
				this.entityMapping,
				convertedData
			);
		});

		return this.db.bulkInsert(this.tableName, physicalDataArray);
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
				mapColumnToPhysical(this.entityMapping, field)
			);
		}

		if (options.aggregates) {
			options.aggregates = options.aggregates.map(agg => ({
				...agg,
				field: mapColumnToPhysical(this.entityMapping, agg.field)
			}));
		}

		if (options.conditions) {
			options.conditions = mapRecordToPhysical(
				this.entityMapping,
				options.conditions
			);
		}

		if (options.orderBy) {
			options.orderBy = options.orderBy.map(order => ({
				...order,
				field: mapColumnToPhysical(this.entityMapping, order.field)
			}));
		}

		return this.db.aggregate<R>(this.tableName, options);
	}

	/**
	 * Find related entities through a relationship
	 * @param id ID of the source entity
	 * @param relationName Name of the relationship
	 * @param options Query options
	 * @returns Array of related entities
	 */
	async findRelated<R>(
		id: IdType,
		relationName: string,
		options?: QueryOptions
	): Promise<R[]> {
		if (!this.entityMapping.relations) {
			throw new Error(
				`No relationships defined for entity ${this.entityMapping.entity}`
			);
		}

		const relation = findRelation(this.entityMapping.relations, relationName);

		if (!relation) {
			throw new Error(
				`Relationship ${relationName} not found on entity ${this.entityMapping.entity}`
			);
		}

		// Handle different relationship types
		if (isRelationType<ManyToManyRelation>(relation, "manyToMany")) {
			return this.findManyToManyRelated<R>(id, relation, options);
		} else if (isRelationType<OneToManyRelation>(relation, "oneToMany")) {
			return this.findOneToManyRelated<R>(id, relation, options);
		} else if (isRelationType<ManyToOneRelation>(relation, "manyToOne")) {
			return this.findManyToOneRelated<R>(id, relation, options);
		} else if (isRelationType<OneToOneRelation>(relation, "oneToOne")) {
			return this.findOneToOneRelated<R>(id, relation, options);
		} else {
			throw new Error(
				`Unsupported relationship type for findRelated: ${relationName}`
			);
		}
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
		if (!this.entityMapping.relations) {
			throw new Error(
				`No relationships defined for entity ${this.entityMapping.entity}`
			);
		}

		const relation = findRelation(this.entityMapping.relations, relationName);

		if (!relation) {
			throw new Error(
				`Relationship ${relationName} not found on entity ${this.entityMapping.entity}`
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
		} catch (error) {
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
		if (!this.entityMapping.relations) {
			throw new Error(
				`No relationships defined for entity ${this.entityMapping.entity}`
			);
		}

		const relation = findRelation(this.entityMapping.relations, relationName);

		if (!relation) {
			throw new Error(
				`Relationship ${relationName} not found on entity ${this.entityMapping.entity}`
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
		} catch (error) {
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
	 * @returns Array of entities
	 */
	async findBy(conditions: Partial<T>, options?: QueryOptions): Promise<T[]> {
		// Convert boolean conditions to 0/1 for SQLite
		const convertedConditions: Record<string, unknown> = {};

		// Find boolean columns
		const booleanColumns = getColumnsByType(this.entityMapping, ["boolean", "bool"]);
		const booleanColumnNames = booleanColumns.map(col => col.logical);

		for (const [key, value] of Object.entries(conditions)) {
			if (booleanColumnNames.includes(key) && typeof value === "boolean") {
				convertedConditions[key] = value ? 1 : 0;
			} else {
				convertedConditions[key] = value;
			}
		}

		const physicalConditions = mapRecordToPhysical(
			this.entityMapping,
			convertedConditions as Record<string, unknown>
		);

		const queryOptions = this.enhanceQueryOptions(options);

		const results = await this.db.findBy<Record<string, unknown>>(
			this.tableName,
			physicalConditions,
			queryOptions
		);

		// Map results and apply computed properties
		const mappedResults = results.map((result) => this.mapToEntity(result) as T);
		return mappedResults.map(entity => this.computedPropertiesProcessor(entity));
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
			return results.map(result => this.mapToEntity(result)) as R[];
		} catch (error) {
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
			return this.mapToEntity(result) as R;
		} catch (error) {
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

		if (!this.actionHandler) {
			throw new Error(`Action handler not initialized for entity ${this.entityMapping.entity}`);
		}

		// Find the action definition
		const actionConfig = findAction(this.entityMapping, actionName);
		if (!actionConfig) {
			throw new Error(`Action ${actionName} not found for entity ${this.entityMapping.entity}`);
		}

		// Execute the action
		return this.actionHandler.executeAction(actionName, params, ctx);
	}

	/**
	 * Get API configuration for this entity
	 * @returns API configuration or undefined if not exposed
	 */
	getApiConfig() {
		return this.entityMapping.api;
	}

	/**
	 * Process an API request through the entity's API hooks
	 * @param request The API request
	 * @param operation The API operation (getAll, getById, create, update, delete, action)
	 * @param context Controller context
	 * @returns Processed request
	 */
	async processApiRequest(request: any, operation: string, context: ControllerContext): Promise<any> {
		if (!this.hookHandler) {
			return request;
		}

		// Enhanced context with operation info
		const enhancedContext = {
			...context,
			operation
		};

		// Execute beforeApi hooks
		return await this.hookHandler.executeHook('beforeApi', request, enhancedContext);
	}

	/**
	 * Process an API response through the entity's API hooks
	 * @param response The API response
	 * @param operation The API operation (getAll, getById, create, update, delete, action)
	 * @param context Controller context
	 * @returns Processed response
	 */
	async processApiResponse(response: any, operation: string, context: ControllerContext): Promise<any> {
		if (!this.hookHandler) {
			return response;
		}

		// Enhanced context with operation info
		const enhancedContext = {
			...context,
			operation
		};

		// Execute afterApi hooks
		return await this.hookHandler.executeHook('afterApi', response, enhancedContext);
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
		return getApiReadableColumns(this.entityMapping, role);
	}

	/**
	 * Get API-writable fields for this entity
	 * @param role Optional role for filtering fields by access control
	 * @returns List of API-writable fields
	 */
	getApiWritableFields(role?: string): string[] {
		return getApiWritableColumns(this.entityMapping, role);
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
	 * Create a default hook context
	 * @returns Default hook context
	 */
	protected createDefaultContext(): HookContext {
		return {
			db: this.db,
			logger: this.logger,
			entityName: this.entityMapping.entity,
			data: {}
		};
	}

	/**
	 * Find related entities through a many-to-many relationship
	 * @param id ID of the source entity
	 * @param relation Many-to-many relationship
	 * @param options Query options
	 * @returns Array of related entities
	 */
	private async findManyToManyRelated<R>(
		id: IdType,
		relation: ManyToManyRelation,
		options?: QueryOptions
	): Promise<R[]> {
		const targetTable = relation.targetEntity.toLowerCase();

		const joins: JoinOptions[] = [
			{
				type: "INNER",
				table: relation.junctionTable,
				alias: "j",
				on: `${targetTable}.${relation.targetColumn} = j.${relation.junctionTargetColumn}`,
			},
		];

		const conditions = {
			[`j.${relation.junctionSourceColumn}`]: id,
		};

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
		const targetTable = relation.targetEntity.toLowerCase();

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

		const targetTable = relation.targetEntity.toLowerCase();

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

			const targetTable = relation.targetEntity.toLowerCase();

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
			const targetTable = relation.targetEntity.toLowerCase();

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
		if (!this.entityMapping.timestamps) {
			return;
		}

		const now = new Date().toISOString();

		// First check if the columns exist in the mapping before applying
		if (operation === "create" && this.entityMapping.timestamps.createdAt) {
			const createdAtColumn = this.entityMapping.columns.find(
				(col) => col.logical === this.entityMapping.timestamps?.createdAt
			);

			if (createdAtColumn) {
				(data as Record<string, unknown>)[
					this.entityMapping.timestamps.createdAt
				] = now;
			}
		}

		if (this.entityMapping.timestamps.updatedAt) {
			const updatedAtColumn = this.entityMapping.columns.find(
				(col) => col.logical === this.entityMapping.timestamps?.updatedAt
			);

			if (updatedAtColumn) {
				(data as Record<string, unknown>)[
					this.entityMapping.timestamps.updatedAt
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
		if (options.relations && options.relations.length > 0 && this.entityMapping.relations) {
			enhancedOptions.joins = enhancedOptions.joins || [];

			for (const r of options.relations) {
				const relation = findRelation(this.entityMapping.relations, r.name);
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
		if (options.relations && options.relations.length > 0 && this.entityMapping.relations) {
			enhancedOptions.relations = [];

			for (const r of options.relations) {
				const relation = findRelation(this.entityMapping.relations, r.name);
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
		const targetTable = relation.targetEntity.toLowerCase();
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
	private convertToDbValues(data: Partial<T>): Record<string, unknown> {
		const result: Record<string, unknown> = {};

		// Find boolean columns
		const booleanColumns = getColumnsByType(this.entityMapping, ["boolean", "bool"]);
		const booleanColumnNames = booleanColumns.map(col => col.logical);

		// Find date columns
		const dateColumns = getColumnsByType(this.entityMapping, ["date", "datetime", "timestamp"]);
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
	 * Enhanced mapToEntity with better type conversion
	 * @param record Database record with physical column names
	 * @returns Entity with logical column names and correct types
	 */
	protected mapToEntity(record: Record<string, unknown>): unknown {
		const logicalRecord = mapRecordToLogical(this.entityMapping, record);
		return this.convertToEntityValues(logicalRecord);
	}

	/**
	 * Convert database values to entity values
	 * @param data Database data
	 * @returns Converted data with entity-specific types
	 */
	private convertToEntityValues(data: Record<string, unknown>): Record<string, unknown> {
		const result: Record<string, unknown> = { ...data };

		// Find boolean columns
		const booleanColumns = getColumnsByType(this.entityMapping, ["boolean", "bool"]);
		const booleanColumnNames = booleanColumns.map(col => col.logical);

		// Find date columns
		const dateColumns = getColumnsByType(this.entityMapping, ["date", "datetime", "timestamp"]);
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