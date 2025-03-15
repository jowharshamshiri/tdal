/**
 * Application Context
 * Provides a central dependency container and context for the application
 * Updated to use EntityRegistry as the single source of truth for entity management
 */

import * as path from 'path';
import express, { Express, Router } from 'express';
import { AppConfig, Logger, ServiceDefinition, MiddlewareConfig } from './types';
import { EntityConfig } from '../entity/entity-config';
import { EntityDao } from '../entity/entity-manager';
import { ActionRegistry } from '../actions/action-registry';
import { RouteRegistry } from '../api/route-registry';
import { ApiGenerator } from '../api/api-generator';
import { DatabaseAdapter, DatabaseContext } from '../database';
import { HookExecutor, HookImplementation } from '../hooks/hooks-executor';
import { EntityRegistry, getEntityRegistry } from '../entity/EntityRegistry';

/**
 * Application Context class
 * Central dependency container and context management
 */
export class AppContext {
	/**
	 * Service instances by name
	 */
	private services: Map<string, any> = new Map();

	/**
	 * Registered service definitions
	 */
	private serviceDefinitions: Map<string, ServiceDefinition> = new Map();

	/**
	 * Route registry for API endpoints
	 */
	private routeRegistry: RouteRegistry;

	/**
	 * Action registry for business logic actions
	 */
	private actionRegistry: ActionRegistry;

	/**
	 * Middleware configurations
	 */
	private middlewareConfigs: Map<string, MiddlewareConfig> = new Map();

	/**
	 * Global hooks by hook type
	 */
	private globalHooks: Map<string, HookExecutor<any>> = new Map();

	/**
	 * API generator
	 */
	private apiGenerator: ApiGenerator;

	/**
	 * Application configuration
	 */
	private config: AppConfig;

	/**
	 * Database adapter
	 */
	private db: DatabaseAdapter;

	/**
	 * Logger instance
	 */
	private logger: Logger;

	/**
	 * Entity registry
	 */
	private entityRegistry: EntityRegistry;

	/**
	 * Express application instance
	 */
	private app?: Express;

	/**
	 * Constructor
	 * @param config Application configuration
	 * @param logger Logger instance
	 * @param app Optional Express application instance
	 */
	constructor(config: AppConfig, logger: Logger, app?: Express) {
		this.config = config;
		this.logger = logger;
		this.app = app;

		// Initialize database context with our logger
		DatabaseContext.setLogger(logger);

		// Configure database from app config
		if (config.database) {
			// Type assertion to resolve incompatible database configuration types
			DatabaseContext.configure(config.database as any);
		}

		// Get database adapter
		this.db = DatabaseContext.getDatabase();

		// Get or initialize entity registry
		this.entityRegistry = getEntityRegistry(logger, this.db);

		// Set app context in database context for cross-referencing
		DatabaseContext.setAppContext(this);

		// Initialize registries
		this.routeRegistry = new RouteRegistry(logger, this);
		this.actionRegistry = new ActionRegistry(logger);

		// Set action registry in entity registry
		this.entityRegistry.setActionRegistry(this.actionRegistry);

		// Initialize API generator
		this.apiGenerator = new ApiGenerator(this, logger);

		this.logger.info('Application context created');
	}

	/**
	 * Initialize the application context
	 * @param entities Entity configurations
	 * @returns Initialized application context
	 */
	async initialize(entities: Map<string, EntityConfig>): Promise<AppContext> {
		try {
			this.logger.info('Initializing application context');

			// Register entities with the registry
			this.entityRegistry.registerEntityConfigs(entities);

			// Initialize core services
			this.initializeCoreServices();

			this.logger.info('Application context initialized successfully');
			return this;
		} catch (error: any) {
			this.logger.error(`Failed to initialize application context: ${error}`);
			throw error;
		}
	}

	/**
	 * Initialize core services
	 */
	private initializeCoreServices(): void {
		// Register logger service
		this.registerService({
			name: 'logger',
			implementation: this.logger,
			singleton: true
		});

		// Register database service
		this.registerService({
			name: 'db',
			implementation: this.db,
			singleton: true
		});

		// Register configuration service
		this.registerService({
			name: 'config',
			implementation: this.config,
			singleton: true
		});

		// Register entity registry service
		this.registerService({
			name: 'entityRegistry',
			implementation: this.entityRegistry,
			singleton: true
		});

		// Register entity manager factory service
		this.registerService({
			name: 'entityManagerFactory',
			implementation: {
				getEntityManager: (entityName: string) => this.getEntityManager(entityName)
			},
			singleton: true
		});

		// Register action registry service
		this.registerService({
			name: 'actionRegistry',
			implementation: this.actionRegistry,
			singleton: true
		});

		// Register route registry service
		this.registerService({
			name: 'routeRegistry',
			implementation: this.routeRegistry,
			singleton: true
		});
	}

	/**
	 * Initialize API routes for entities
	 * @param apiBasePath Base path for API routes
	 * @returns Array of registered route paths
	 */
	async initializeApiRoutes(apiBasePath: string = '/api'): Promise<string[]> {
		if (!this.app) {
			throw new Error('Express app is required to initialize API routes');
		}

		this.logger.info(`Initializing API routes with base path: ${apiBasePath}`);

		const registeredRoutes: string[] = [];

		// Create a main router for all API routes
		const apiRouter = Router();

		// Get all entity configurations from the registry
		const entityConfigs = this.entityRegistry.getAllEntityConfigs();

		// Generate and register routes for each entity
		for (const [entityName, config] of entityConfigs.entries()) {
			if (config.api && config.api.exposed) {
				try {
					const entityManager = this.getEntityManager(entityName);
					const entityRouter = await this.apiGenerator.generateEntityApi(
						config,
						entityManager,
						this.actionRegistry
					);

					// Get the entity-specific base path (default to /entity-name)
					const entityBasePath = config.api.basePath || `/${entityName.toLowerCase()}`;

					// Register the entity router
					apiRouter.use(entityBasePath, entityRouter);

					// Register core routes
					if (config.api.operations?.getAll !== false) {
						registeredRoutes.push(`GET ${apiBasePath}${entityBasePath}`);
					}
					if (config.api.operations?.getById !== false) {
						registeredRoutes.push(`GET ${apiBasePath}${entityBasePath}/:id`);
					}
					if (config.api.operations?.create !== false) {
						registeredRoutes.push(`POST ${apiBasePath}${entityBasePath}`);
					}
					if (config.api.operations?.update !== false) {
						registeredRoutes.push(`PUT ${apiBasePath}${entityBasePath}/:id`);
					}
					if (config.api.operations?.delete !== false) {
						registeredRoutes.push(`DELETE ${apiBasePath}${entityBasePath}/:id`);
					}

					// Register action routes
					if (config.actions) {
						for (const action of config.actions) {
							if (action.route && action.httpMethod) {
								registeredRoutes.push(
									`${action.httpMethod} ${apiBasePath}${entityBasePath}${action.route}`
								);
							}
						}
					}

					this.logger.debug(`Registered API routes for entity ${entityName}`);
				} catch (error: any) {
					this.logger.error(`Failed to register API routes for entity ${entityName}: ${error}`);
				}
			}
		}

		// Mount the API router on the main app
		this.app.use(apiBasePath, apiRouter);

		this.logger.info(`Registered ${registeredRoutes.length} API routes`);
		return registeredRoutes;
	}

	/**
	 * Register a service
	 * @param definition Service definition
	 */
	registerService(definition: ServiceDefinition): void {
		const { name } = definition;

		if (this.serviceDefinitions.has(name)) {
			this.logger.warn(`Service ${name} already registered, overwriting`);
		}

		this.serviceDefinitions.set(name, definition);

		// If singleton and implementation is provided, initialize immediately
		if (definition.singleton && definition.implementation) {
			this.services.set(name, definition.implementation);
			this.logger.debug(`Registered singleton service: ${name}`);
		} else {
			this.logger.debug(`Registered service definition: ${name}`);
		}
	}

	/**
	 * Register middleware configuration
	 * @param name Middleware name
	 * @param config Middleware configuration
	 */
	registerMiddleware(name: string, config: MiddlewareConfig): void {
		if (this.middlewareConfigs.has(name)) {
			this.logger.warn(`Middleware ${name} already registered, overwriting`);
		}

		this.middlewareConfigs.set(name, config);
		this.logger.debug(`Registered middleware configuration: ${name}`);
	}

	/**
	 * Get middleware configuration
	 * @param name Middleware name
	 * @returns Middleware configuration or undefined if not found
	 */
	getMiddlewareConfig(name: string): MiddlewareConfig | undefined {
		return this.middlewareConfigs.get(name);
	}

	/**
	 * Get all middleware configurations
	 * @returns Map of middleware configurations
	 */
	getAllMiddlewareConfigs(): Map<string, MiddlewareConfig> {
		return new Map(this.middlewareConfigs);
	}

	/**
	 * Get a service by name
	 * If the service is not yet initialized, it will be created
	 * 
	 * @param name Service name
	 * @returns Service instance
	 */
	getService<T>(name: string): T {
		// Check if service is already initialized
		if (this.services.has(name)) {
			return this.services.get(name) as T;
		}

		// Get service definition
		const definition = this.serviceDefinitions.get(name);
		if (!definition) {
			throw new Error(`Service not found: ${name}`);
		}

		// Check if dependencies are satisfied
		if (definition.dependencies && definition.dependencies.length > 0) {
			for (const dependency of definition.dependencies) {
				if (!this.serviceDefinitions.has(dependency)) {
					throw new Error(`Service ${name} depends on ${dependency}, which is not registered`);
				}
			}
		}

		// Create service instance
		let instance: any;

		if (typeof definition.implementation === 'function') {
			// If implementation is a constructor function
			const dependencies = (definition.dependencies || []).map(dep => this.getService(dep));
			instance = new definition.implementation(...dependencies);
		} else {
			// If implementation is an object
			instance = definition.implementation;
		}

		// Store service instance if singleton
		if (definition.singleton) {
			this.services.set(name, instance);
		}

		return instance as T;
	}

	/**
	 * Check if a service exists
	 * @param name Service name
	 * @returns Whether the service exists
	 */
	hasService(name: string): boolean {
		return this.serviceDefinitions.has(name);
	}

	/**
	 * Register an entity
	 * Delegates to EntityRegistry
	 * @param name Entity name
	 * @param config Entity configuration
	 * @returns True if successful, false otherwise
	 */
	registerEntity(name: string, config: EntityConfig): boolean {
		return this.entityRegistry.registerEntityConfig(name, config);
	}

	/**
	 * Unregister an entity
	 * Delegates to EntityRegistry
	 * @param name Entity name
	 * @returns True if successful, false otherwise
	 */
	unregisterEntity(name: string): boolean {
		return this.entityRegistry.unregisterEntityConfig(name);
	}

	/**
	 * Get an entity manager by entity name
	 * Delegates to EntityRegistry
	 * @param entityName Entity name
	 * @returns Entity manager
	 */
	getEntityManager<T>(entityName: string): EntityDao<T> {
		return this.entityRegistry.getEntityManager<T>(entityName);
	}

	/**
	 * Get all entity managers
	 * Delegates to EntityRegistry
	 * @returns Map of entity name to entity manager
	 */
	getAllEntityManagers(): Map<string, EntityDao<any>> {
		return this.entityRegistry.getAllEntityManagers();
	}

	/**
	 * Get entity configuration
	 * Delegates to EntityRegistry
	 * @param entityName Entity name
	 * @returns Entity configuration
	 */
	getEntityConfig(entityName: string): EntityConfig {
		const config = this.entityRegistry.getEntityConfig(entityName);
		if (!config) {
			throw new Error(`Entity configuration not found for entity: ${entityName}`);
		}
		return config;
	}

	/**
	 * Get all entity configurations
	 * Delegates to EntityRegistry
	 * @returns Map of entity name to entity configuration
	 */
	getAllEntityConfigs(): Map<string, EntityConfig> {
		return this.entityRegistry.getAllEntityConfigs();
	}

	/**
	 * Get the application configuration
	 * @returns Application configuration
	 */
	getConfig(): AppConfig {
		return this.config;
	}

	/**
	 * Get the database adapter
	 * @returns Database adapter
	 */
	getDatabase(): DatabaseAdapter {
		return this.db;
	}

	/**
	 * Get the logger
	 * @returns Logger instance
	 */
	getLogger(): Logger {
		return this.logger;
	}

	/**
	 * Get the API generator
	 * @returns API generator instance
	 */
	getApiGenerator(): ApiGenerator {
		return this.apiGenerator;
	}

	/**
	 * Get the action registry
	 * @returns Action registry instance
	 */
	getActionRegistry(): ActionRegistry {
		return this.actionRegistry;
	}

	/**
	 * Get the route registry
	 * @returns Route registry instance
	 */
	getRouteRegistry(): RouteRegistry {
		return this.routeRegistry;
	}

	/**
	 * Register a global hook
	 * @param hookType Hook type
	 * @param hook Hook implementation
	 */
	registerGlobalHook<T = any>(hookType: string, hook: HookImplementation<T>): void {
		// Get or create hook executor for this hook type
		let executor = this.globalHooks.get(hookType);
		if (!executor) {
			executor = new HookExecutor<T>(this.logger);
			this.globalHooks.set(hookType, executor);
		}

		// Add hook to executor
		executor.add(hook);
		this.logger.debug(`Registered global hook ${hook.name} for hook type ${hookType}`);
	}

	/**
	 * Get global hooks for a specific hook type
	 * @param hookType Hook type
	 * @returns Hook executor or undefined if no hooks registered for this type
	 */
	getGlobalHooks<T = any>(hookType: string): HookExecutor<T> | undefined {
		return this.globalHooks.get(hookType) as HookExecutor<T> | undefined;
	}

	/**
	 * Apply global hooks to an entity
	 * @param entityName Entity name
	 */
	applyGlobalHooksToEntity(entityName: string): void {
		const entityManager = this.getEntityManager(entityName);

		// For each hook type with global hooks
		for (const [hookType, executor] of this.globalHooks.entries()) {
			if (executor.hasHooks()) {
				// Apply hooks to entity manager
				(entityManager as any).addExternalHooks(hookType, executor);
				this.logger.debug(`Applied global hooks for type ${hookType} to entity ${entityName}`);
			}
		}
	}

	/**
	 * Get the Express application
	 * @returns Express application instance
	 */
	getApp(): Express | undefined {
		return this.app;
	}

	/**
	 * Set the Express application
	 * @param app Express application instance
	 */
	setExpressApp(app: Express): void {
		this.app = app;
	}

	/**
	 * Clean up resources
	 */
	async shutdown(): Promise<void> {
		this.logger.info('Shutting down application');

		// Clean up services
		for (const [name, service] of this.services.entries()) {
			if (service && typeof service.shutdown === 'function') {
				try {
					await service.shutdown();
					this.logger.debug(`Shutdown service: ${name}`);
				} catch (error: any) {
					this.logger.error(`Error shutting down service ${name}: ${error}`);
				}
			}
		}

		// Close database connection
		this.logger.info('Closing database connection');
		DatabaseContext.closeDatabase();

		this.logger.info('Application shutdown complete');
	}
}

/**
 * Create a service factory function
 * This allows lazy initialization of services
 * 
 * @param factory Factory function to create the service
 * @returns Service factory function
 */
export function createServiceFactory<T>(
	factory: (context: AppContext) => T
): (context: AppContext) => T {
	let instance: T | null = null;

	return (context: AppContext): T => {
		if (instance === null) {
			instance = factory(context);
		}
		return instance;
	};
}