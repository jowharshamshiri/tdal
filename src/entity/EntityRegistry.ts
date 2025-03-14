import { EntityConfig } from './entity-config';
import { Logger } from './types';

/**
 * Entity Registry for tracking generated entities and repositories
 */

export class EntityRegistry {
	private static instance: EntityRegistry;
	private entities = new Map<string, any>();
	private repositories = new Map<string, any>();
	private mappings = new Map<string, EntityConfig>();
	private logger?: Logger;

	private constructor() { }

	/**
	 * Get singleton instance of the registry
	 */
	public static getInstance(): EntityRegistry {
		if (!EntityRegistry.instance) {
			EntityRegistry.instance = new EntityRegistry();
		}
		return EntityRegistry.instance;
	}

	/**
	 * Set logger instance
	 */
	public setLogger(logger: Logger): void {
		this.logger = logger;
	}

	/**
	 * Register an entity class with its mapping
	 */
	public registerEntity(name: string, entityClass: any, mapping: EntityConfig): void {
		this.entities.set(name, entityClass);
		this.mappings.set(name, mapping);

		if (this.logger) {
			this.logger.debug(`Registered entity: ${name}`);
		}
	}

	/**
	 * Register a repository class for an entity
	 */
	public registerRepository(name: string, repositoryClass: any): void {
		this.repositories.set(name, repositoryClass);

		if (this.logger) {
			this.logger.debug(`Registered repository: ${name}`);
		}
	}

	/**
	 * Get an entity class by name
	 */
	public getEntity(name: string): any {
		return this.entities.get(name);
	}

	/**
	 * Get a repository instance by name
	 */
	public getRepository(name: string): any {
		return this.repositories.get(name);
	}

	/**
	 * Get entity configuration by name
	 */
	public getMapping(name: string): EntityConfig | undefined {
		return this.mappings.get(name);
	}

	/**
	 * Get all registered entities
	 */
	public getAllEntities(): Map<string, any> {
		return this.entities;
	}

	/**
	 * Get all registered repositories
	 */
	public getAllRepositories(): Map<string, any> {
		return this.repositories;
	}

	/**
	 * Get all registered entity mappings
	 */
	public getAllMappings(): Map<string, EntityConfig> {
		return this.mappings;
	}
}
