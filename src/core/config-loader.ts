/**
 * Configuration Loader
 * Loads and validates YAML configuration files
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { glob } from 'glob';
import Ajv from 'ajv';
import { Logger, AppConfig } from './core/types';
import { EntityMapping, EntityMapping } from '../database';

/**
 * Configuration loader options
 */
export interface ConfigLoaderOptions {
	/**
	 * Path to schema directory
	 */
	schemaDir?: string;

	/**
	 * Path to config directory
	 */
	configDir?: string;

	/**
	 * Path to entities directory
	 */
	entitiesDir?: string;

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
	 * JSON schemas by name
	 */
	private schemas: Map<string, object> = new Map();

	/**
	 * Entity configurations by name
	 */
	private entities: Map<string, EntityMapping> = new Map();

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
	private validator: Ajv;

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
			schemaDir: path.join(process.cwd(), 'schemas'),
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
			allErrors: true,
			strict: false
		});

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

			// Validate configuration against schema if enabled
			if (this.options.validateSchemas) {
				await this.validateConfig('app', config);
			}

			// Apply defaults
			config.port = config.port || 3000;
			config.host = config.host || 'localhost';
			config.entitiesDir = config.entitiesDir || this.options.entitiesDir;

			this.appConfig = config;
			this.logger.info('Application configuration loaded successfully');

			return config;
		} catch (error) {
			this.logger.error(`Failed to load application configuration: ${error}`);
			throw new Error(`Failed to load application configuration: ${error}`);
		}
	}

	/**
	 * Load all entity configurations from directory
	 * @param entitiesDir Path to entities directory
	 * @returns Map of entity name to entity configuration
	 */
	async loadEntities(entitiesDir?: string): Promise<Map<string, EntityMapping>> {
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
				return new Map();
			}

			this.logger.info(`Found ${entityFiles.length} entity configuration files`);

			// Load each entity file
			for (const file of entityFiles) {
				const filePath = path.join(dirPath, file);
				await this.loadEntityFile(filePath);
			}

			// Process entity relationships
			this.resolveEntityRelationships();

			this.logger.info(`Loaded ${this.entities.size} entity configurations`);

			return this.entities;
		} catch (error) {
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
			const config = yaml.load(content) as EntityMapping;

			// Validate configuration against schema if enabled
			if (this.options.validateSchemas) {
				await this.validateConfig('entity', config);
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
		} catch (error) {
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
	 * Load code implementations for hooks, computed properties, etc.
	 * @param entity Entity configuration
	 */
	async loadImplementations(entity: EntityMapping): Promise<void> {
		this.logger.debug(`Loading implementations for entity ${entity.entity}`);

		// Load hook implementations
		if (entity.hooks) {
			for (const hookType of Object.keys(entity.hooks)) {
				const hooks = (entity.hooks as any)[hookType] as any[];
				if (hooks && Array.isArray(hooks)) {
					for (const hook of hooks) {
						if (hook.implementation && hook.implementation.startsWith('./')) {
							try {
								hook.implementationFn = await this.loadExternalCode(hook.implementation);
							} catch (error) {
								this.logger.error(`Failed to load hook implementation for ${entity.entity}.${hookType}.${hook.name}: ${error}`);
							}
						}
					}
				}
			}
		}

		// Load computed property implementations
		if (entity.computed) {
			for (const prop of entity.computed) {
				if (prop.implementation && prop.implementation.startsWith('./')) {
					try {
						prop.implementationFn = await this.loadExternalCode(prop.implementation);
					} catch (error) {
						this.logger.error(`Failed to load computed property implementation for ${entity.entity}.${prop.name}: ${error}`);
					}
				}
			}
		}

		// Load validation rule implementations
		if (entity.validation && entity.validation.rules) {
			for (const [field, rules] of Object.entries(entity.validation.rules)) {
				for (const rule of rules) {
					if (rule.type === 'custom' && rule.implementation && rule.implementation.startsWith('./')) {
						try {
							rule.implementationFn = await this.loadExternalCode(rule.implementation);
						} catch (error) {
							this.logger.error(`Failed to load validation rule implementation for ${entity.entity}.${field}: ${error}`);
						}
					}
				}
			}
		}

		// Load workflow transition implementations
		if (entity.workflows) {
			for (const workflow of entity.workflows) {
				for (const transition of workflow.transitions) {
					if (transition.implementation && transition.implementation.startsWith('./')) {
						try {
							transition.implementationFn = await this.loadExternalCode(transition.implementation);
						} catch (error) {
							this.logger.error(`Failed to load workflow transition implementation for ${entity.entity}.${workflow.name}.${transition.action}: ${error}`);
						}
					}

					// Load hook implementations
					if (transition.hooks) {
						for (const [hookName, hookPath] of Object.entries(transition.hooks)) {
							if (hookPath && typeof hookPath === 'string' && hookPath.startsWith('./')) {
								try {
									(transition.hooks as any)[`${hookName}Fn`] = await this.loadExternalCode(hookPath);
								} catch (error) {
									this.logger.error(`Failed to load workflow transition hook implementation for ${entity.entity}.${workflow.name}.${transition.action}.${hookName}: ${error}`);
								}
							}
						}
					}
				}
			}
		}
	}

	/**
	 * Load a JSON schema
	 * @param schemaName Schema name
	 * @returns JSON schema object
	 */
	private async loadSchema(schemaName: string): Promise<object> {
		// Check if schema is already loaded
		if (this.schemas.has(schemaName)) {
			return this.schemas.get(schemaName)!;
		}

		const schemaPath = path.join(this.options.schemaDir!, `${schemaName}.json`);

		try {
			this.logger.debug(`Loading schema from ${schemaPath}`);

			// Check if schema file exists
			if (!fs.existsSync(schemaPath)) {
				throw new Error(`Schema file not found: ${schemaPath}`);
			}

			// Read and parse JSON
			const content = fs.readFileSync(schemaPath, 'utf8');
			const schema = JSON.parse(content);

			// Store schema
			this.schemas.set(schemaName, schema);

			return schema;
		} catch (error) {
			this.logger.error(`Failed to load schema ${schemaName}: ${error}`);
			throw new Error(`Failed to load schema ${schemaName}: ${error}`);
		}
	}

	/**
	 * Validate a configuration against a schema
	 * @param schemaName Schema name
	 * @param config Configuration to validate
	 */
	private async validateConfig(schemaName: string, config: any): Promise<void> {
		try {
			// Get schema
			const schema = await this.loadSchema(schemaName);

			// Compile validator function
			const validate = this.validator.compile(schema);

			// Validate
			const valid = validate(config);

			if (!valid) {
				const errors = validate.errors?.map(err =>
					`${err.instancePath} ${err.message}`
				).join(', ');

				throw new Error(`Invalid ${schemaName} configuration: ${errors}`);
			}
		} catch (error) {
			// If schema doesn't exist, log warning but continue
			if ((error as Error).message.includes('Schema file not found')) {
				this.logger.warn(`Schema validation skipped: ${error}`);
				return;
			}

			throw error;
		}
	}

	/**
	 * Load external code file
	 * @param filePath Path to code file
	 * @returns Exported function or object
	 */
	private async loadExternalCode(filePath: string): Promise<any> {
		try {
			// Resolve path
			const resolvedPath = path.isAbsolute(filePath)
				? filePath
				: path.join(process.cwd(), filePath);

			this.logger.debug(`Loading external code from ${resolvedPath}`);

			// Check file extension to determine module type
			if (resolvedPath.endsWith('.mjs') || await this.isEsmModule(resolvedPath)) {
				// ESM module
				const module = await import(`file://${resolvedPath}`);
				return module.default || module;
			} else {
				// CommonJS module
				return require(resolvedPath);
			}
		} catch (error) {
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

			// Check for import/export statements
			const content = fs.readFileSync(filePath, 'utf8');

			// Simple heuristic: check for import/export statements
			return /\bimport\s+|export\s+/.test(content);
		} catch (error) {
			return false;
		}
	}

	/**
	 * Get loaded entity configurations
	 * @returns Map of entity name to entity configuration
	 */
	getEntities(): Map<string, EntityMapping> {
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
	 * Generate YAML for an entity
	 * @param entity Entity configuration
	 * @returns YAML string
	 */
	generateEntityYaml(entity: EntityMapping): string {
		return yaml.dump(entity, {
			indent: 2,
			lineWidth: 120,
			sortKeys: false
		});
	}

	/**
	 * Write entity configuration to YAML file
	 * @param entity Entity configuration
	 * @param outputDir Output directory
	 * @returns Path to the written file
	 */
	writeEntityYaml(entity: EntityMapping, outputDir?: string): string {
		const dir = outputDir || this.options.entitiesDir;

		if (!dir) {
			throw new Error('Output directory not specified');
		}

		// Create directory if it doesn't exist
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		const filePath = path.join(dir, `${entity.entity.toLowerCase()}.yaml`);
		const yaml = this.generateEntityYaml(entity);

		fs.writeFileSync(filePath, yaml, 'utf8');

		this.logger.debug(`Wrote entity configuration to ${filePath}`);

		return filePath;
	}
}