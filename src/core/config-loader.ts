/**
 * Configuration Loader
 * Loads and validates YAML configuration files
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { glob } from 'glob';
import Ajv, { Ajv as AjvType } from 'ajv';
import { Options } from 'ajv';
import { Logger, AppConfig } from './types';
import { EntityConfig } from '../entity/entity-config';
import { entityJsonSchema } from '../entity/entity-schema';

/**
 * Configuration loader options
 */
export interface ConfigLoaderOptions {
	/**
	 * Path to config directory
	 */
	configDir?: string;

	/**
	 * Path to entities directory
	 */
	entitiesDir?: string;

	/**
	 * Path to schema directory
	 */
	schemaDir?: string;

	/**
	 * Whether to validate configurations against schemas
	 */
	validateSchemas?: boolean;

	/**
	 * Logger instance
	 */
	logger?: Logger;
}

/**
 * Configuration loader class
 * Handles loading and validating YAML configuration files
 */
export class ConfigLoader {
	/**
	 * Entity configurations by name
	 */
	private entities: Map<string, EntityConfig> = new Map();

	/**
	 * Application configuration
	 */
	private appConfig: AppConfig | null = null;

	/**
	 * Configuration loader options
	 */
	private options: ConfigLoaderOptions;

	/**
	 * Schema validator
	 */
	private validator: AjvType;

	/**
	 * Logger instance
	 */
	private logger: Logger;

	/**
	 * Constructor
	 * @param options Configuration loader options
	 */
	constructor(options: ConfigLoaderOptions = {}) {
		this.options = {
			configDir: path.join(process.cwd(), 'config'),
			entitiesDir: path.join(process.cwd(), 'entities'),
			validateSchemas: true,
			...options
		};

		this.logger = this.options.logger || {
			debug: console.debug,
			info: console.info,
			warn: console.warn,
			error: console.error
		};

		this.validator = new Ajv({
			allErrors: true
			// Remove the 'strict' property that doesn't exist in newer Ajv versions
		});

		// Register entity schema
		this.validator.addSchema(entityJsonSchema, 'entity');

		this.logger.debug('Configuration loader created');
	}

	/**
	 * Load application configuration
	 * @param configPath Path to application configuration file
	 * @returns Application configuration
	 */
	async loadAppConfig(configPath?: string): Promise<AppConfig> {
		const appConfigPath = configPath || path.join(this.options.configDir!, 'app.yaml');

		try {
			this.logger.info(`Loading application configuration from ${appConfigPath}`);

			// Check if file exists
			if (!fs.existsSync(appConfigPath)) {
				throw new Error(`Application configuration file not found: ${appConfigPath}`);
			}

			// Read and parse YAML
			const content = fs.readFileSync(appConfigPath, 'utf8');
			const config = yaml.load(content) as AppConfig;

			// Validate configuration if enabled
			if (this.options.validateSchemas) {
				this.validateConfig('app', config);
			}

			// Apply defaults
			config.port = config.port || 3000;
			config.host = config.host || 'localhost';
			config.entitiesDir = config.entitiesDir || this.options.entitiesDir;

			this.appConfig = config;
			this.logger.info('Application configuration loaded successfully');

			// Load inline entity definitions if present
			if ((config as any).entities) {
				try {
					await this.loadInlineEntities((config as any).entities);
				} catch (error: any) {
					this.logger.error(`Failed to load inline entity configurations: ${error}`);
				}
			}

			return config;
		} catch (error: any) {
			this.logger.error(`Failed to load application configuration: ${error}`);
			throw new Error(`Failed to load application configuration: ${error}`);
		}
	}

	/**
	 * Load entity configurations from inline definitions
	 * @param inlineEntities Object containing entity configurations by name
	 * @returns Map of entity name to entity configuration
	 */
	async loadInlineEntities(inlineEntities: Record<string, any>): Promise<Map<string, EntityConfig>> {
		this.logger.info('Loading inline entity configurations');

		try {
			const entries = Object.entries(inlineEntities);
			this.logger.info(`Found ${entries.length} inline entity configurations`);

			for (const [name, config] of entries) {
				try {
					// Validate the entity configuration
					if (this.options.validateSchemas) {
						this.validateConfig('entity', config);
					}

					// Ensure required fields are present
					if (!config.entity) {
						config.entity = name;
					}
					if (!config.table) {
						throw new Error(`Table name not specified for entity ${name}`);
					}
					if (!config.idField) {
						throw new Error(`ID field not specified for entity ${name}`);
					}
					if (!config.columns || !Array.isArray(config.columns) || config.columns.length === 0) {
						throw new Error(`No columns defined for entity ${name}`);
					}

					// Add to entities map
					this.entities.set(name, config as EntityConfig);
					this.logger.debug(`Loaded inline entity configuration for ${name}`);
				} catch (error: any) {
					this.logger.error(`Failed to load inline entity ${name}: ${error}`);
				}
			}

			return this.entities;
		} catch (error: any) {
			this.logger.error(`Failed to load inline entity configurations: ${error}`);
			throw error;
		}
	}

	/**
	 * Load all entity configurations from directory
	 * @param entitiesDir Path to entities directory
	 * @returns Map of entity name to entity configuration
	 */
	async loadEntities(entitiesDir?: string): Promise<Map<string, EntityConfig>> {
		const dirPath = entitiesDir || this.options.entitiesDir;

		if (!dirPath) {
			throw new Error('Entities directory not specified');
		}

		try {
			this.logger.info(`Loading entity configurations from ${dirPath}`);

			// Check if directory exists
			if (!fs.existsSync(dirPath)) {
				throw new Error(`Entities directory not found: ${dirPath}`);
			}

			// Find all YAML files in the directory
			const entityFiles = await glob('**/*.{yaml,yml}', { cwd: dirPath });

			if (entityFiles.length === 0) {
				this.logger.warn(`No entity configuration files found in ${dirPath}`);
				// Return the existing entities map which may contain inline entities
				return this.entities;
			}

			this.logger.info(`Found ${entityFiles.length} entity configuration files`);

			// Load each entity file
			for (const file of entityFiles) {
				const filePath = path.join(dirPath, file);
				await this.loadEntityFile(filePath);
			}

			// Process entity relationships
			this.resolveEntityRelationships();

			this.logger.info(`Loaded ${this.entities.size} entity configurations in total`);

			return this.entities;
		} catch (error: any) {
			this.logger.error(`Failed to load entity configurations: ${error}`);
			throw new Error(`Failed to load entity configurations: ${error}`);
		}
	}

	/**
	 * Load a single entity configuration file
	 * @param filePath Path to entity configuration file
	 */
	async loadEntityFile(filePath: string): Promise<void> {
		try {
			this.logger.debug(`Loading entity from ${filePath}`);

			// Read and parse YAML
			const content = fs.readFileSync(filePath, 'utf8');
			const config = yaml.load(content) as EntityConfig;

			// Validate configuration against schema if enabled
			if (this.options.validateSchemas) {
				this.validateConfig('entity', config);
			}

			// Validate required fields
			if (!config.entity) {
				throw new Error(`Entity name not specified in ${filePath}`);
			}

			if (!config.table) {
				throw new Error(`Table name not specified for entity ${config.entity} in ${filePath}`);
			}

			if (!config.idField) {
				throw new Error(`ID field not specified for entity ${config.entity} in ${filePath}`);
			}

			if (!config.columns || !Array.isArray(config.columns) || config.columns.length === 0) {
				throw new Error(`No columns defined for entity ${config.entity} in ${filePath}`);
			}

			// Add to entities map
			this.entities.set(config.entity, config);
			this.logger.debug(`Loaded entity configuration for ${config.entity}`);
		} catch (error: any) {
			this.logger.error(`Failed to load entity file ${filePath}: ${error}`);
			throw new Error(`Failed to load entity file ${filePath}: ${error}`);
		}
	}

	/**
	 * Resolve relationships between entities
	 * Validates that referenced entities exist
	 */
	private resolveEntityRelationships(): void {
		this.logger.debug('Resolving entity relationships');

		for (const [entityName, config] of this.entities.entries()) {
			// Skip if no relations
			if (!config.relations || config.relations.length === 0) {
				continue;
			}

			for (const relation of config.relations) {
				// Check if target entity exists
				if (!this.entities.has(relation.targetEntity)) {
					this.logger.warn(`Entity ${entityName} references non-existent entity ${relation.targetEntity} in relation ${relation.name}`);
				}

				// Check for bidirectional relationships
				if (relation.inverseName) {
					const targetEntity = this.entities.get(relation.targetEntity);
					if (targetEntity && targetEntity.relations) {
						const inverseRelation = targetEntity.relations.find(r => r.name === relation.inverseName);
						if (!inverseRelation) {
							this.logger.warn(`Inverse relation ${relation.inverseName} not found in entity ${relation.targetEntity}`);
						} else {
							// Verify inverse relation points back to source entity
							if (inverseRelation.targetEntity !== entityName) {
								this.logger.warn(`Inverse relation ${relation.inverseName} in entity ${relation.targetEntity} does not point back to ${entityName}`);
							}
						}
					}
				}
			}
		}
	}

	/**
	 * Validate a configuration against a JSON schema
	 * @param type Schema type ('entity' or 'app')
	 * @param config Configuration to validate
	 */
	private validateConfig(type: string, config: any): void {
		const validate = this.validator.getSchema(type);

		if (!validate) {
			this.logger.warn(`No schema found for ${type}, skipping validation`);
			return;
		}

		const valid = validate(config);

		if (!valid && validate.errors) {
			const errors = validate.errors.map(err =>
				`${err.dataPath} ${err.message}`
			).join(', ');

			throw new Error(`Invalid ${type} configuration: ${errors}`);
		}
	}

	/**
	 * Load external code (JavaScript or TypeScript)
	 * @param filePath Path to code file
	 * @returns Exported function or object
	 */
	async loadExternalCode(filePath: string): Promise<any> {
		try {
			// Resolve path
			const resolvedPath = path.isAbsolute(filePath)
				? filePath
				: path.join(process.cwd(), filePath);

			this.logger.debug(`Loading external code from ${resolvedPath}`);

			// Check if file exists
			if (!fs.existsSync(resolvedPath)) {
				throw new Error(`External code file not found: ${resolvedPath}`);
			}

			// Check file extension to determine module type
			if (resolvedPath.endsWith('.mjs') || await this.isEsmModule(resolvedPath)) {
				// ESM module
				const module = await import(`file://${resolvedPath}`);
				return module.default || module;
			} else {
				// CommonJS module
				const module = require(resolvedPath);
				return module.default || module;
			}
		} catch (error: any) {
			this.logger.error(`Failed to load external code from ${filePath}: ${error}`);
			throw new Error(`Failed to load external code from ${filePath}: ${error}`);
		}
	}

	/**
	 * Check if a JavaScript file is an ESM module
	 * @param filePath Path to JavaScript file
	 * @returns Whether the file is an ESM module
	 */
	private async isEsmModule(filePath: string): Promise<boolean> {
		try {
			// Check file extension
			if (filePath.endsWith('.mjs')) {
				return true;
			}

			// Check package.json for type: module
			const pkgPath = path.join(path.dirname(filePath), 'package.json');
			if (fs.existsSync(pkgPath)) {
				const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
				if (pkg.type === 'module') {
					return true;
				}
			}

			// Check for import/export statements
			const content = fs.readFileSync(filePath, 'utf8');
			return /\bimport\s+|export\s+/.test(content);
		} catch (error: any) {
			return false;
		}
	}

	/**
	 * Get loaded entity configurations
	 * @returns Map of entity name to entity configuration
	 */
	getEntities(): Map<string, EntityConfig> {
		return this.entities;
	}

	/**
	 * Get application configuration
	 * @returns Application configuration
	 */
	getAppConfig(): AppConfig | null {
		return this.appConfig;
	}

	/**
	 * Get an entity configuration by name
	 * @param entityName Entity name
	 * @returns Entity configuration
	 */
	getEntity(entityName: string): EntityConfig | undefined {
		return this.entities.get(entityName);
	}
}

/**
 * Create a config loader instance
 * @param options Configuration loader options
 * @returns Config loader instance
 */
export function createConfigLoader(options: ConfigLoaderOptions = {}): ConfigLoader {
	return new ConfigLoader(options);
}