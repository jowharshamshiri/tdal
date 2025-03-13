/**
 * Application Context
 * Provides a central dependency container and context for the application
 */

import express, { Express } from 'express';
import { DatabaseAdapter } from '../database/database-adapter';
import { AdapterFactory } from '../database/adapter-factory';
import { EntityDao } from '../database/entity-dao';
import { AppConfig, EntityConfig, Logger, AppContext } from './types';

/**
 * Application Context class
 * Manages application state, dependencies and lifecycle
 */
export class ApplicationContext implements AppContext {
	/** Express application */
	app: Express;

	/** Application configuration */
	config: AppConfig;

	/** Database adapter */
	db: DatabaseAdapter;

	/** Entity managers */
	entities: Record<string, EntityDao<any>> = {};

	/** Logger */
	logger: Logger;

	/** Service container */
	services: Record<string, any> = {};

	/**
	 * Create a new application context
	 * @param config Application configuration
	 * @param logger Logger instance
	 */
	constructor(config: AppConfig, logger: Logger) {
		this.config = config;
		this.logger = logger;
		this.app = express();

		// Create database adapter
		this.db = this.createDatabaseAdapter();
	}

	/**
	 * Initialize the application context
	 * @param entityConfigs Map of entity configurations
	 */
	async initialize(entityConfigs: Map<string, EntityConfig>): Promise<void> {
		// Connect to database
		await this.connectToDatabase();

		// Initialize entity managers
		await this.initializeEntityManagers(entityConfigs);

		// Initialize core services
		this.initializeCoreServices();

		this.logger.info('Application context initialized successfully');
	}

	/**
	 * Create a database adapter based on configuration
	 */
	private createDatabaseAdapter(): DatabaseAdapter {
		try {
			return AdapterFactory.createAdapter(this.config.database);
		} catch (error) {
			this.logger.error(`Failed to create database adapter: ${error}`);
			throw new Error(`Failed to create database adapter: ${error}`);
		}
	}

	/**
	 * Connect to the database
	 */
	private async connectToDatabase(): Promise<void> {
		try {
			await this.db.connect();
			this.logger.info('Connected to database successfully');
		} catch (error) {
			this.logger.error(`Failed to connect to database: ${error}`);
			throw new Error(`Failed to connect to database: ${error}`);
		}
	}

	/**
	 * Initialize entity managers
	 * @param entityConfigs Map of entity configurations
	 */
	private async initializeEntityManagers(entityConfigs: Map<string, EntityConfig>): Promise<void> {
		for (const [entityName, config] of entityConfigs.entries()) {
			try {
				// Dynamic import of entity dao generator
				const { createEntityDao } = await import('../entity/entity-manager');

				// Create entity DAO
				const entityDao = createEntityDao(config, this.db, this.logger);

				// Store in entities map
				this.entities[entityName] = entityDao;

				this.logger.info(`Initialized entity manager for ${entityName}`);
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
		// Add core services to the container
		this.registerService('logger', this.logger);
		this.registerService('db', this.db);

		// If auth is configured, initialize auth service
		if (this.config.auth) {
			try {
				const { AuthService } = require('../auth/auth-service');
				const authService = new AuthService(this.config.auth, this, this.logger);
				this.registerService('auth', authService);
				this.logger.info('Authentication service initialized');
			} catch (error) {
				this.logger.warn(`Failed to initialize auth service: ${error}`);
			}
		}
	}

	/**
	 * Register a service in the container
	 * @param name Service name
	 * @param service Service instance
	 */
	registerService(name: string, service: any): void {
		if (this.services[name]) {
			this.logger.warn(`Service ${name} is being overwritten`);
		}
		this.services[name] = service;
	}

	/**
	 * Get a service from the container
	 * @param name Service name
	 * @returns Service instance
	 */
	getService<T>(name: string): T {
		const service = this.services[name];
		if (!service) {
			throw new Error(`Service ${name} not found`);
		}
		return service as T;
	}

	/**
	 * Check if a service exists
	 * @param name Service name
	 * @returns True if the service exists
	 */
	hasService(name: string): boolean {
		return this.services[name] !== undefined;
	}

	/**
	 * Get entity DAO
	 * @param entityName Entity name
	 * @returns Entity DAO
	 */
	getEntityDao<T>(entityName: string): EntityDao<T> {
		const dao = this.entities[entityName];
		if (!dao) {
			throw new Error(`Entity DAO for ${entityName} not found`);
		}
		return dao as EntityDao<T>;
	}

	/**
	 * Clean up resources
	 */
	async cleanup(): Promise<void> {
		try {
			// Close database connection
			await this.db.close();
			this.logger.info('Database connection closed');

			// Clean up any other resources
			for (const serviceName in this.services) {
				const service = this.services[serviceName];
				if (typeof service.cleanup === 'function') {
					await service.cleanup();
					this.logger.info(`Service ${serviceName} cleaned up`);
				}
			}
		} catch (error) {
			this.logger.error(`Error during cleanup: ${error}`);
		}
	}
}

/**
 * Create a service provider function
 * This allows for lazy initialization of services
 * 
 * @param factory Factory function to create the service
 * @returns Service provider function
 */
export function createServiceProvider<T>(factory: (context: AppContext) => T): (context: AppContext) => T {
	let instance: T | null = null;

	return (context: AppContext): T => {
		if (instance === null) {
			instance = factory(context);
		}
		return instance;
	};
}