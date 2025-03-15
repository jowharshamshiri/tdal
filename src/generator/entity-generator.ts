/**
 * Entity Generator
 * Generates entity/repository classes and handles runtime entity creation
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { EntityConfig, ColumnMapping } from '../entity/entity-config';
import { Logger } from '../core/types';
import { DatabaseAdapter } from '../database/core/types';
import { loadEntities } from './yaml-generator';
import { mapDbTypeToTypeScript } from '../entity/entity-schema';
import { EntityRegistry } from '../entity/EntityRegistry';

/**
 * Main class for entity generation and registration
 */
export class EntityGenerator {
	private entityDirectory: string;
	private registry: EntityRegistry;
	private logger: Logger;
	private db?: DatabaseAdapter;

	/**
	 * Constructor
	 * @param options Entity generator options
	 */
	constructor(
		options: {
			entityDirectory?: string;
			logger?: Logger;
			db?: DatabaseAdapter;
		} = {}
	) {
		this.entityDirectory = options.entityDirectory || path.join(process.cwd(), 'entities');
		this.logger = options.logger || console;
		this.db = options.db;
		this.registry = EntityRegistry.getInstance();

		// Set logger in registry
		this.registry.setLogger(this.logger);
	}

	/**
	 * Load entity metadata from YAML files
	 * @returns Array of entity configurations
	 */
	public loadEntityMetadata(): EntityConfig[] {
		try {
			const entities = loadEntities(this.entityDirectory);
			return Array.from(entities.values());
		} catch (error: any) {
			this.logger.error(`Failed to load entity metadata: ${error}`);
			return [];
		}
	}

	/**
	 * Load and register all entities from YAML files
	 * @returns Map of entity name to entity configuration
	 */
	public loadAndRegisterEntities(): Map<string, EntityConfig> {
		try {
			const entitiesMap = loadEntities(this.entityDirectory);

			for (const [name, config] of entitiesMap.entries()) {
				// Validate config (basic validation)
				this.validateEntityConfig(config);

				// Register the entity configuration
				this.registry.registerEntity(name, null, config);
			}

			this.logger.info(`Loaded and registered ${entitiesMap.size} entities`);
			return entitiesMap;
		} catch (error: any) {
			this.logger.error(`Failed to load and register entities: ${error}`);
			throw error;
		}
	}

	/**
	 * Create repository instances for all entities
	 * @param db Database adapter
	 * @returns Object mapping entity names to repository instances
	 */
	public async createRepositoryInstances(db?: DatabaseAdapter): Promise<Record<string, any>> {
		const dbInstance = db || this.db;
		if (!dbInstance) {
			throw new Error('Database adapter is required to create repository instances');
		}

		const repositories: Record<string, any> = {};
		const mappings = this.registry.getAllMappings();

		for (const [entityName, config] of mappings.entries()) {
			try {
				// Dynamically import the EntityDao class
				const { EntityDao } = await import('../entity/entity-manager');

				// Create repository instance
				repositories[entityName] = new EntityDao(config, dbInstance, this.logger);

				// Register in registry
				this.registry.registerRepository(entityName, repositories[entityName]);

				this.logger.debug(`Created repository for ${entityName}`);
			} catch (error: any) {
				this.logger.error(`Failed to create repository for ${entityName}: ${error}`);
			}
		}

		this.logger.info(`Created ${Object.keys(repositories).length} repository instances`);
		return repositories;
	}

	/**
	 * Basic validation of entity configuration
	 * @param config Entity configuration
	 * @throws Error if validation fails
	 */
	private validateEntityConfig(config: EntityConfig): void {
		if (!config.entity) {
			throw new Error('Entity name is required');
		}
		if (!config.table) {
			throw new Error(`Table name is required for entity ${config.entity}`);
		}
		if (!config.idField) {
			throw new Error(`ID field is required for entity ${config.entity}`);
		}
		if (!config.columns || !Array.isArray(config.columns) || config.columns.length === 0) {
			throw new Error(`Columns are required for entity ${config.entity}`);
		}

		// Ensure we have a primary key
		const hasPrimaryKey = config.columns.some(col => col.primaryKey);
		if (!hasPrimaryKey) {
			throw new Error(`At least one column must be marked as primary key in entity ${config.entity}`);
		}
	}

	/**
	 * Get repository for an entity
	 * @param entityName Entity name
	 * @param db Optional database adapter
	 * @returns Repository instance
	 */
	public async getRepository(entityName: string, db?: DatabaseAdapter): Promise<any> {
		// Check if repository exists in registry
		const repo = this.registry.getRepository(entityName);
		if (repo) {
			return repo;
		}

		// If not in registry, create it
		const dbInstance = db || this.db;
		if (!dbInstance) {
			throw new Error('Database adapter is required to create repository');
		}

		const config = this.registry.getMapping(entityName);
		if (!config) {
			throw new Error(`Entity configuration for ${entityName} not found`);
		}

		try {
			// Import EntityDao class
			const { EntityDao } = await import('../entity/entity-manager');

			// Create repository
			const repository = new EntityDao(config, dbInstance, this.logger);

			// Register in registry
			this.registry.registerRepository(entityName, repository);

			return repository;
		} catch (error: any) {
			this.logger.error(`Failed to get repository for ${entityName}: ${error}`);
			throw error;
		}
	}
}

/**
 * Get repository for an entity
 * @param entityName Entity name
 * @param db Database adapter
 * @returns Repository instance
 */
export async function getRepository(entityName: string, db: DatabaseAdapter): Promise<any> {
	const registry = EntityRegistry.getInstance();

	// Check if repository exists in registry
	const repo = registry.getRepository(entityName);
	if (repo) {
		return repo;
	}

	// Get entity mapping
	const mapping = registry.getMapping(entityName);
	if (!mapping) {
		throw new Error(`Entity mapping for ${entityName} not found`);
	}

	// Import EntityDao class
	const { EntityDao } = await import('../entity/entity-manager');

	// Create repository
	const repository = new EntityDao(mapping, db);

	// Register in registry
	registry.registerRepository(entityName, repository);

	return repository;
}

/**
 * Create entity generator instance
 * @param options Options for entity generator
 * @returns Entity generator instance
 */
export function createEntityGenerator(
	options: {
		entityDirectory?: string;
		logger?: Logger;
		db?: DatabaseAdapter;
	} = {}
): EntityGenerator {
	return new EntityGenerator(options);
}