/**
 * Entity Registry
 * Central repository for all entity definitions, configurations, and managers
 * Single source of truth for entity management
 */

import { EntityConfig } from './entity-config';
import { EntityDao } from './entity-manager';
import { Logger } from '../logging';
import { DatabaseAdapter } from '../database/core/types';
import { DatabaseContext } from '../database';
import { ActionRegistry } from '../actions/action-registry';

/**
 * Entity Registry
 * Central gateway for accessing all entity-related information and operations
 */
export class EntityRegistry {
	private static instance: EntityRegistry;

	/**
	 * Entity configurations by name
	 */
	private entityConfigs = new Map<string, EntityConfig>();

	/**
	 * Entity managers/DAOs by name
	 */
	private entityManagers = new Map<string, EntityDao<any>>();

	/**
	 * Logger instance
	 */
	private logger: Logger;

	/**
	 * Database adapter
	 */
	private db: DatabaseAdapter;

	/**
	 * Action registry
	 */
	private actionRegistry?: ActionRegistry;

	/**
	 * Configuration loader for external code
	 */
	private configLoader?: any;

	/**
	 * Private constructor (singleton pattern)
	 * @param logger Logger instance
	 * @param db Database adapter
	 */
	private constructor(logger: Logger, db: DatabaseAdapter) {
		this.logger = logger;
		this.db = db;
		this.logger.debug('Entity Registry initialized');
	}

	/**
	 * Get the singleton instance of EntityRegistry
	 * @param logger Logger instance (required on first call)
	 * @param db Database adapter (required on first call)
	 * @returns EntityRegistry instance
	 */
	public static getInstance(logger?: Logger, db?: DatabaseAdapter): EntityRegistry {
		if (!EntityRegistry.instance) {
			if (!logger || !db) {
				throw new Error('Logger and database adapter are required to initialize EntityRegistry');
			}
			EntityRegistry.instance = new EntityRegistry(logger, db);
		}
		return EntityRegistry.instance;
	}

	/**
	 * Set the action registry
	 * @param actionRegistry Action registry
	 */
	public setActionRegistry(actionRegistry: ActionRegistry): void {
		this.actionRegistry = actionRegistry;
	}

	/**
	 * Set configuration loader for external code
	 * @param configLoader Configuration loader
	 */
	public setConfigLoader(configLoader: any): void {
		this.configLoader = configLoader;
	}

	/**
	 * Register an entity configuration
	 * @param name Entity name
	 * @param config Entity configuration
	 * @returns Whether the registration was successful
	 */
	public registerEntityConfig(name: string, config: EntityConfig): boolean {
		try {
			// Check if entity already exists
			if (this.entityConfigs.has(name)) {
				this.logger.warn(`Entity ${name} already registered, overwriting`);
			}

			// Store entity configuration
			this.entityConfigs.set(name, config);

			// Register many-to-many junction tables if needed
			if (config.relations) {
				for (const relation of config.relations) {
					if (relation.type === "manyToMany" && relation.implicitJunction) {
						this.registerJunctionTable(relation);
					}
				}
			}

			// Register actions if action registry is available
			if (this.actionRegistry && config.actions) {
				for (const action of config.actions) {
					try {
						this.actionRegistry.registerAction(name, action);
						this.logger.debug(`Registered action ${action.name} for entity ${name}`);
					} catch (error: any) {
						this.logger.error(`Failed to register action ${action.name} for entity ${name}: ${error.message}`);
					}
				}
			}

			this.logger.debug(`Registered entity configuration: ${name}`);
			return true;
		} catch (error: any) {
			this.logger.error(`Failed to register entity ${name}: ${error.message}`);
			return false;
		}
	}

	/**
	 * Register a junction table as an entity configuration
	 * @param relation Many-to-many relation with junction table
	 */
	private registerJunctionTable(relation: any): void {
		const junctionTableName = relation.junctionTable;

		// Skip if already registered
		if (this.entityConfigs.has(junctionTableName)) {
			return;
		}

		// Create a simple entity config for the junction table
		const junctionConfig: EntityConfig = {
			entity: junctionTableName,
			table: junctionTableName,
			idField: [relation.junctionSourceColumn, relation.junctionTargetColumn],
			columns: [
				{
					logical: relation.junctionSourceColumn,
					physical: relation.junctionSourceColumn,
					primaryKey: true
				},
				{
					logical: relation.junctionTargetColumn,
					physical: relation.junctionTargetColumn,
					primaryKey: true
				}
			]
		};

		// Add extra columns if defined in the relationship
		if (relation.junctionExtraColumns) {
			for (const column of relation.junctionExtraColumns) {
				junctionConfig.columns.push({
					logical: column.name,
					physical: column.name,
					type: column.type,
					nullable: column.nullable !== false
				});
			}
		}

		// Register the junction table config
		this.logger.debug(`Registering junction table ${junctionTableName} for ${relation.sourceEntity}-${relation.targetEntity} relation`);
		this.registerEntityConfig(junctionTableName, junctionConfig);
	}

	/**
	 * Register multiple entity configurations
	 * @param entities Map of entity names to configurations
	 * @returns Number of successfully registered entities
	 */
	public registerEntityConfigs(entities: Map<string, EntityConfig>): number {
		let successCount = 0;

		for (const [name, config] of entities.entries()) {
			if (this.registerEntityConfig(name, config)) {
				successCount++;
			}
		}

		this.logger.info(`Registered ${successCount} of ${entities.size} entity configurations`);
		return successCount;
	}

	/**
 * Unregister an entity configuration
 * @param name Entity name
 * @returns Whether the entity was successfully unregistered
 */
	public unregisterEntityConfig(name: string): boolean {
		// Check if entity exists
		if (!this.entityConfigs.has(name)) {
			this.logger.warn(`Entity ${name} not found, cannot unregister`);
			return false;
		}

		// Delete entity manager if it exists
		if (this.entityManagers.has(name)) {
			this.entityManagers.delete(name);
		}

		// Delete entity configuration
		this.entityConfigs.delete(name);

		this.logger.debug(`Unregistered entity: ${name}`);
		return true;
	}

	/**
	 * Get entity configuration by name
	 * @param name Entity name
	 * @returns Entity configuration or undefined if not found
	 */
	public getEntityConfig(name: string): EntityConfig | undefined {
		return this.entityConfigs.get(name);
	}

	/**
	 * Get all entity configurations
	 * @returns Map of entity names to configurations
	 */
	public getAllEntityConfigs(): Map<string, EntityConfig> {
		return new Map(this.entityConfigs);
	}

	/**
	 * Check if an entity exists
	 * @param name Entity name
	 * @returns Whether the entity exists
	 */
	public hasEntity(name: string): boolean {
		return this.entityConfigs.has(name);
	}

	/**
	 * Get entity manager by name
	 * Creates the manager if it doesn't exist
	 * @param name Entity name
	 * @returns Entity manager/DAO
	 */
	public getEntityManager<T = any>(name: string): EntityDao<T> {
		// Check if entity exists
		if (!this.entityConfigs.has(name)) {
			throw new Error(`Entity configuration not found: ${name}`);
		}

		// Return existing manager if available
		if (this.entityManagers.has(name)) {
			return this.entityManagers.get(name) as EntityDao<T>;
		}

		// Create new manager
		try {
			const config = this.entityConfigs.get(name)!;
			const manager = new EntityDao<T>(config, this.db, this.logger, this.configLoader);

			// Store manager
			this.entityManagers.set(name, manager);

			// Initialize manager if config loader is available
			if (this.configLoader) {
				manager.initialize(this.configLoader).catch(error => {
					this.logger.error(`Failed to initialize entity manager for ${name}: ${error.message}`);
				});
			}

			return manager;
		} catch (error: any) {
			this.logger.error(`Failed to create entity manager for ${name}: ${error.message}`);
			throw new Error(`Failed to create entity manager for ${name}: ${error.message}`);
		}
	}

	/**
	 * Get all entity managers
	 * @returns Map of entity names to managers
	 */
	public getAllEntityManagers(): Map<string, EntityDao<any>> {
		// Ensure managers exist for all entities
		for (const name of this.entityConfigs.keys()) {
			if (!this.entityManagers.has(name)) {
				try {
					this.getEntityManager(name);
				} catch (error) {
					// Log but continue
					this.logger.error(`Failed to create entity manager for ${name}`);
				}
			}
		}

		return new Map(this.entityManagers);
	}

	/**
	 * Reset the registry
	 * Useful for testing or reinitialization
	 */
	public reset(): void {
		this.entityConfigs.clear();
		this.entityManagers.clear();
		this.logger.debug("Entity Registry reset");
	}
}

/**
 * Get the EntityRegistry instance
 * Helper function to make imports cleaner
 * @param logger Logger instance (required on first call)
 * @param db Database adapter (required on first call)
 * @returns EntityRegistry instance
 */
export function getEntityRegistry(logger?: Logger, db?: DatabaseAdapter): EntityRegistry {
	if (!db && DatabaseContext.hasInstance()) {
		db = DatabaseContext.getDatabase();
	}

	return EntityRegistry.getInstance(logger, db);
}