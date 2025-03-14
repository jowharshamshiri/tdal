/**
 * Application Context
 * Provides a central dependency container and context for the application
 */

import { DatabaseContext, EntityDao, DatabaseAdapter } from '../database';
import * as path from 'path';
import { AppConfig, Logger, ServiceDefinition } from './types';

/**
 * Application Context class
 * Central dependency container and context management
 */
export class AppContext {
	/**
	 * Entity managers by entity name
	 */
	private entityManagers: Map<string, EntityDao<any>> = new Map();

	/**
	 * Service instances by name
	 */
	private services: Map<string, any> = new Map();

	/**
	 * Entity configurations by name
	 */
	private entityConfigs: Map<string, EntityConfig> = new Map();

	/**
	 * Registered service definitions
	 */
	private serviceDefinitions: Map<string, ServiceDefinition> = new Map();

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
	 * Constructor
	 * @param config Application configuration
	 * @param logger Logger instance
	 */
	constructor(config: AppConfig, logger: Logger) {
		this.config = config;
		this.logger = logger;

		// Initialize database context with our logger
		DatabaseContext.setLogger(logger);

		// Configure database from app config
		if (config.database) {
			DatabaseContext.configure(config.database);
		}

		// Get database adapter
		this.db = DatabaseContext.getDatabase();

		// Set app context in database context for cross-referencing
		DatabaseContext.setAppContext(this);

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

			// Store entity configurations
			this.entityConfigs = new Map(entities);

			// Initialize entity managers
			await this.initializeEntityManagers();

			// Initialize core services
			this.initializeCoreServices();

			this.logger.info('Application context initialized successfully');
			return this;
		} catch (error) {
			this.logger.error(`Failed to initialize application context: ${error}`);
			throw error;
		}
	}

	/**
	 * Initialize entity managers for all entities
	 */
	private async initializeEntityManagers(): Promise<void> {
		this.logger.info(`Initializing entity managers for ${this.entityConfigs.size} entities`);

		for (const [entityName, config] of this.entityConfigs.entries()) {
			try {
				// Create entity manager/DAO
				const entityManager = new EntityDao(config, this.db);

				// Store entity manager
				this.entityManagers.set(entityName, entityManager);

				this.logger.debug(`Initialized entity manager for ${entityName}`);
			} catch (error) {
				this.logger.error(`Failed to initialize entity manager for ${entityName}: ${error}`);
				throw new Error(`Failed to initialize entity manager for ${entityName}: ${error}`);
			}
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

		// Register entity manager factory service
		this.registerService({
			name: 'entityManagerFactory',
			implementation: {
				getEntityManager: (entityName: string) => this.getEntityManager(entityName)
			},
			singleton: true
		});
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
	 * Get an entity manager by entity name
	 * @param entityName Entity name
	 * @returns Entity manager
	 */
	getEntityManager<T>(entityName: string): EntityDao<T> {
		const manager = this.entityManagers.get(entityName);
		if (!manager) {
			throw new Error(`Entity manager not found for entity: ${entityName}`);
		}
		return manager as EntityDao<T>;
	}

	/**
	 * Get all entity managers
	 * @returns Map of entity name to entity manager
	 */
	getAllEntityManagers(): Map<string, EntityDao<any>> {
		return new Map(this.entityManagers);
	}

	/**
	 * Get entity configuration
	 * @param entityName Entity name
	 * @returns Entity configuration
	 */
	getEntityConfig(entityName: string): EntityConfig {
		const config = this.entityConfigs.get(entityName);
		if (!config) {
			throw new Error(`Entity configuration not found for entity: ${entityName}`);
		}
		return config;
	}

	/**
	 * Get all entity configurations
	 * @returns Map of entity name to entity configuration
	 */
	getAllEntityConfigs(): Map<string, EntityConfig> {
		return new Map(this.entityConfigs);
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
				} catch (error) {
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