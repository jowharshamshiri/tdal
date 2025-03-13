/**
 * YAML Configuration Loader
 * Loads, validates and processes YAML configuration files
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { glob } from 'glob';
import Ajv from 'ajv';
import { AppConfig, EntityConfig, Logger } from './types';

/**
 * Configuration loader class
 */
export class ConfigLoader {
	private schemas: Map<string, object> = new Map();
	private config: AppConfig;
	private entities: Map<string, EntityConfig> = new Map();
	private logger: Logger;

	/**
	 * Constructor
	 * @param logger Logger instance
	 */
	constructor(logger: Logger) {
		this.logger = logger;
	}

	/**
	 * Load application configuration from YAML file
	 * @param configPath Path to config YAML
	 * @returns Application configuration
	 */
	async loadAppConfig(configPath: string): Promise<AppConfig> {
		try {
			const configContent = fs.readFileSync(configPath, 'utf8');
			const config = yaml.load(configContent) as AppConfig;

			// Apply defaults
			config.port = config.port || 3000;
			config.apiBasePath = config.apiBasePath || '/api';
			config.production = config.production || false;

			// Validate config
			await this.validateConfig('app', config);

			this.config = config;
			return config;
		} catch (error) {
			this.logger.error(`Failed to load app config: ${error}`);
			throw new Error(`Failed to load application configuration: ${error}`);
		}
	}

	/**
	 * Load entity configurations from directory
	 * @param entitiesDir Entities directory
	 * @returns Map of entity configurations
	 */
	async loadEntities(entitiesDir: string): Promise<Map<string, EntityConfig>> {
		try {
			const entityFiles = await glob('**/*.yaml', { cwd: entitiesDir });

			for (const file of entityFiles) {
				const filePath = path.join(entitiesDir, file);
				await this.loadEntityFile(filePath);
			}

			// Process entity relationships
			this.resolveEntityRelationships();

			return this.entities;
		} catch (error) {
			this.logger.error(`Failed to load entities: ${error}`);
			throw new Error(`Failed to load entity configurations: ${error}`);
		}
	}

	/**
	 * Load a single entity file
	 * @param filePath Path to entity YAML file
	 */
	private async loadEntityFile(filePath: string): Promise<void> {
		try {
			const entityContent = fs.readFileSync(filePath, 'utf8');
			const entity = yaml.load(entityContent) as EntityConfig;

			// Validate entity config
			await this.validateConfig('entity', entity);

			// Process any inline code
			this.processEntityImplementations(entity);

			// Add to entities map
			this.entities.set(entity.entity, entity);
			this.logger.info(`Loaded entity: ${entity.entity}`);
		} catch (error) {
			this.logger.error(`Failed to load entity file ${filePath}: ${error}`);
			throw new Error(`Failed to load entity file ${filePath}: ${error}`);
		}
	}

	/**
	 * Process any code implementations in the entity
	 * @param entity Entity configuration
	 */
	private processEntityImplementations(entity: EntityConfig): void {
		// Process hook implementations
		if (entity.hooks) {
			for (const hookType in entity.hooks) {
				const hooks = (entity.hooks as any)[hookType] as Array<any>;
				if (hooks) {
					for (const hook of hooks) {
						if (hook.implementation && !hook.implementation.startsWith('./')) {
							// This is an inline implementation - we'll keep it as is
							// For external files, we'll load them when needed
						}
					}
				}
			}
		}

		// Process action implementations
		if (entity.actions) {
			for (const action of entity.actions) {
				if (action.implementation && !action.implementation.startsWith('./')) {
					// This is an inline implementation
				}
			}
		}

		// Process computed properties
		if (entity.computed) {
			for (const prop of entity.computed) {
				if (prop.implementation && !prop.implementation.startsWith('./')) {
					// This is an inline implementation
				}
			}
		}
	}

	/**
	 * Resolve relationships between entities
	 */
	private resolveEntityRelationships(): void {
		// First pass: validate that all referenced entities exist
		for (const [entityName, entity] of this.entities.entries()) {
			if (entity.relations) {
				for (const relation of entity.relations) {
					if (!this.entities.has(relation.targetEntity)) {
						this.logger.warn(`Entity ${entityName} references non-existent entity ${relation.targetEntity} in relation ${relation.name}`);
					}
				}
			}
		}

		// Second pass: set up bidirectional relationships if needed
		for (const [entityName, entity] of this.entities.entries()) {
			if (entity.relations) {
				for (const relation of entity.relations) {
					// If this relation has an inverseName, ensure the target entity has a matching relation
					if (relation.inverseName) {
						const targetEntity = this.entities.get(relation.targetEntity);
						if (targetEntity && targetEntity.relations) {
							const inverseRelation = targetEntity.relations.find(r => r.name === relation.inverseName);
							if (!inverseRelation) {
								this.logger.warn(`Inverse relation ${relation.inverseName} not found in entity ${relation.targetEntity}`);
							}
						}
					}
				}
			}
		}
	}

	/**
	 * Load a JSON schema from file
	 * @param schemaName Schema name
	 * @returns JSON schema object
	 */
	private async loadSchema(schemaName: string): Promise<object> {
		if (this.schemas.has(schemaName)) {
			return this.schemas.get(schemaName)!;
		}

		const schemaPath = path.join(__dirname, '../../schemas', `${schemaName}-schema.json`);
		try {
			const schemaContent = fs.readFileSync(schemaPath, 'utf8');
			const schema = JSON.parse(schemaContent);
			this.schemas.set(schemaName, schema);
			return schema;
		} catch (error) {
			this.logger.error(`Failed to load schema ${schemaName}: ${error}`);
			throw new Error(`Failed to load schema ${schemaName}: ${error}`);
		}
	}

	/**
	 * Validate configuration against schema
	 * @param schemaName Schema name
	 * @param config Configuration to validate
	 */
	private async validateConfig(schemaName: string, config: any): Promise<void> {
		try {
			const schema = await this.loadSchema(schemaName);
			const ajv = new Ajv({ allErrors: true });
			const validate = ajv.compile(schema);
			const valid = validate(config);

			if (!valid) {
				const errors = validate.errors?.map(e => `${e.instancePath} ${e.message}`).join(', ');
				throw new Error(`Invalid ${schemaName} configuration: ${errors}`);
			}
		} catch (error) {
			// If schema doesn't exist yet, log a warning but continue
			if ((error as Error).message.includes('Failed to load schema')) {
				this.logger.warn(`Schema validation skipped: ${error}`);
				return;
			}
			throw error;
		}
	}

	/**
	 * Load an external code file
	 * @param filePath Path to code file
	 * @returns Function or object exported from the file
	 */
	async loadExternalCode(filePath: string): Promise<any> {
		try {
			// For TypeScript files, we assume they're transpiled
			const fullPath = path.isAbsolute(filePath)
				? filePath
				: path.join(process.cwd(), filePath);

			// Determine if we need to load ESM or CommonJS
			if (fullPath.endsWith('.mjs') || (fullPath.endsWith('.js') && await this.isEsmModule(fullPath))) {
				// ESM module
				const module = await import(`file://${fullPath}`);
				return module.default || module;
			} else {
				// CommonJS module
				return require(fullPath);
			}
		} catch (error) {
			this.logger.error(`Failed to load external code ${filePath}: ${error}`);
			throw new Error(`Failed to load external code ${filePath}: ${error}`);
		}
	}

	/**
	 * Check if a JavaScript file is an ESM module
	 * @param filePath Path to JS file
	 * @returns True if the file is an ESM module
	 */
	private async isEsmModule(filePath: string): Promise<boolean> {
		try {
			const content = fs.readFileSync(filePath, 'utf8');
			// Simple heuristic: check for import/export statements
			return /\bimport\s+|export\s+/.test(content);
		} catch {
			return false;
		}
	}
}