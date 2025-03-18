/**
 * Generate Command
 * CLI commands for code generation
 */

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';
// Fix: Add types for inquirer
import inquirer from 'inquirer';
import { Logger } from '../logging';
import { ConfigLoader } from '../core/config-loader';
// Fix: Import correctly from the generator module
import { scaffoldEntity, generateEntityFromTypeScript } from '../generator/entity-generator';
// Fix: Create or import migration generator correctly
import { MigrationGenerator } from '../database/migration/migration-generator';
import { DatabaseAdapter } from '../database/core/types';
// Fix: Import correctly from entity-schema
import { generateEntityInterface } from '../entity/interface-generator';
import { Framework } from '../core/framework';
import { EntityConfig, ColumnMapping, ComputedProperty, EntityHook, EntityAction } from '../entity/entity-config';
import { PluginManager } from '../plugins/plugin-manager';
import { createApiGenerator } from '../api/api-generator';
import { createAdapterRegistry } from '../adapters';

/**
 * Register generate commands
 * @param program Commander program
 * @param logger Logger instance
 */
export function registerGenerateCommands(program: Command, logger: Logger) {
	const generate = program
		.command('generate')
		.description('Generate code, entities, models, migrations, and more');

	// Generate entity
	generate
		.command('entity <name>')
		.description('Generate a new entity YAML file')
		.option('-t, --table <tableName>', 'Database table name')
		.option('-d, --dir <directory>', 'Output directory', './entities')
		.option('-i, --interactive', 'Interactive mode', false)
		.option('-f, --fields <fields>', 'Comma-separated list of fields to add (name:type format)')
		.option('-c, --computed', 'Add computed properties', false)
		.option('-a, --api', 'Expose via API', true)
		.option('-ts, --timestamps', 'Add timestamps', true)
		.option('-sd, --soft-delete', 'Enable soft delete', false)
		.option('-hooks, --with-hooks', 'Add basic hooks', false)
		.action(async (name, options) => {
			try {
				await generateEntityCommand(name, options, logger);
			} catch (error: any) {
				logger.error(`Error generating entity: ${error.message}`);
			}
		});

	// Generate model from entity
	generate
		.command('model')
		.description('Generate TypeScript interfaces from entity YAML files')
		.option('-d, --dir <directory>', 'Entities directory', './entities')
		.option('-o, --output <directory>', 'Output directory', './src/models')
		.option('-i, --index', 'Generate index file', true)
		.action(async (options) => {
			try {
				await generateModelCommand(options, logger);
			} catch (error: any) {
				logger.error(`Error generating models: ${error.message}`);
			}
		});

	// Generate entity from interface
	generate
		.command('entity-from-interface <file>')
		.description('Generate entity YAML from TypeScript interface')
		.option('-t, --table <tableName>', 'Database table name')
		.option('-i, --id <idField>', 'ID field name', 'id')
		.option('-o, --output <directory>', 'Output directory', './entities')
		.option('-a, --api', 'Expose via API', true)
		.action(async (file, options) => {
			try {
				await generateEntityFromInterfaceCommand(file, options, logger);
			} catch (error: any) {
				logger.error(`Error generating entity from interface: ${error.message}`);
			}
		});

	// Generate migration
	generate
		.command('migration')
		.description('Generate database migration')
		.option('-n, --name <name>', 'Migration name', 'migration')
		.option('-e, --entity <entity>', 'Entity name to include in migration')
		.option('-d, --dir <directory>', 'Entities directory', './entities')
		.option('-o, --output <directory>', 'Output directory', './migrations')
		.option('-t, --type <type>', 'Database type', 'sqlite')
		.action(async (options) => {
			try {
				await generateMigrationCommand(options, logger);
			} catch (error: any) {
				logger.error(`Error generating migration: ${error.message}`);
			}
		});

	// Generate API documentation
	generate
		.command('docs')
		.description('Generate API documentation')
		.option('-d, --dir <directory>', 'Entities directory', './entities')
		.option('-o, --output <directory>', 'Output directory', './docs/api')
		.option('-f, --format <format>', 'Documentation format', 'openapi')
		.action(async (options) => {
			try {
				await generateDocsCommand(options, logger);
			} catch (error: any) {
				logger.error(`Error generating API documentation: ${error.message}`);
			}
		});

	// Generate API with adapter
	generate
		.command('api')
		.description('Generate API code using an adapter')
		.option('-a, --adapter <adapter>', 'Adapter to use', 'netlify')
		.option('-e, --entity <entity>', 'Entity to generate API for (optional)')
		.option('-d, --dir <directory>', 'Entities directory', './entities')
		.option('-o, --output <directory>', 'Output directory', './api')
		.option('-ts, --typescript', 'Generate TypeScript code', true)
		.action(async (options) => {
			try {
				await generateApiCommand(options, logger);
			} catch (error: any) {
				logger.error(`Error generating API code: ${error.message}`);
			}
		});

	return generate;
}

/**
 * Entity generation command implementation
 * @param name Entity name
 * @param options Command options
 * @param logger Logger instance
 */
async function generateEntityCommand(name: string, options: any, logger: Logger): Promise<void> {
	// Convert name to PascalCase
	name = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();

	// Generate table name if not provided
	const tableName = options.table || name.toLowerCase() + 's';

	// Ensure output directory exists
	const outputDir = path.resolve(process.cwd(), options.dir);
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	if (options.interactive) {
		await generateEntityInteractive(name, tableName, outputDir, logger);
	} else {
		// Parse fields if provided
		let customFields: Array<{ name: string; type: string; required?: boolean; description?: string }> = [];

		if (options.fields) {
			customFields = options.fields.split(',').map((field: string) => {
				const [name, type = 'string', required = 'false', description = ''] = field.split(':');
				return {
					name,
					type,
					required: required.toLowerCase() === 'true',
					description: description || undefined
				};
			});
		}

		const entity = scaffoldEntity(name, tableName, outputDir);

		// Add basic columns
		const columns: ColumnMapping[] = [
			{
				logical: 'id',
				physical: 'id',
				primaryKey: true,
				autoIncrement: true,
				type: 'integer',
				api: {
					readable: true,
					writable: false
				}
			}
		];

		// Add custom fields
		for (const field of customFields) {
			columns.push({
				logical: field.name,
				physical: field.name.toLowerCase(),
				type: field.type,
				nullable: !field.required,
				comment: field.description,
				api: {
					readable: true,
					writable: true
				}
			});
		}

		// Add timestamp columns if requested
		if (options.timestamps) {
			columns.push({
				logical: 'createdAt',
				physical: 'created_at',
				type: 'datetime',
				nullable: false,
				api: {
					readable: true,
					writable: false
				}
			});

			columns.push({
				logical: 'updatedAt',
				physical: 'updated_at',
				type: 'datetime',
				nullable: true,
				api: {
					readable: true,
					writable: false
				}
			});

			// Add soft delete if requested
			if (options.softDelete) {
				columns.push({
					logical: 'deletedAt',
					physical: 'deleted_at',
					type: 'datetime',
					nullable: true,
					api: {
						readable: false,
						writable: false
					}
				});
			}
		}

		// Add computed properties if requested
		const computed: ComputedProperty[] = [];
		if (options.computed) {
			computed.push({
				name: 'displayName',
				dependencies: ['name'],
				implementation: `
			(entity) => {
			  return entity.name ? entity.name.toUpperCase() : '';
			}
		  `,
				description: 'Uppercased name for display',
				exposeInApi: true
			});
		}

		// Add hooks if requested
		const hooks: Record<string, EntityHook[]> = {};
		if (options.withHooks) {
			hooks.beforeCreate = [
				{
					name: 'setDefaults',
					implementation: `
			  async (entity, context) => {
				// Set default values here
				return entity;
			  }
			`,
					priority: 10
				}
			];

			hooks.afterCreate = [
				{
					name: 'logCreation',
					implementation: `
			  async (entity, context) => {
				context.logger?.info(\`Created ${name} with ID \${entity.id}\`);
				return entity;
			  }
			`,
					priority: 10
				}
			];
		}

		// Create entity config
		const entityConfig: EntityConfig = {
			entity: name,
			table: tableName,
			idField: 'id',
			columns,
			api: options.api ? {
				exposed: true,
				operations: {
					getAll: true,
					getById: true,
					create: true,
					update: true,
					delete: true
				},
				permissions: {
					getAll: ['public'],
					getById: ['public'],
					create: ['user', 'admin'],
					update: ['user', 'admin'],
					delete: ['admin']
				}
			} : undefined,
			timestamps: options.timestamps ? {
				createdAt: 'createdAt',
				updatedAt: 'updatedAt',
				...(options.softDelete ? { deletedAt: 'deletedAt' } : {})
			} : undefined,
			softDelete: options.softDelete ? {
				column: 'deletedAt',
				deletedValue: 'CURRENT_TIMESTAMP',
				nonDeletedValue: null
			} : undefined,
			...(computed.length > 0 ? { computed } : {}),
			...(Object.keys(hooks).length > 0 ? { hooks } : {})
		};

		// Write entity YAML
		const yamlPath = path.join(outputDir, `${name.toLowerCase()}.yaml`);
		fs.writeFileSync(yamlPath, JSON.stringify(entityConfig, null, 2), 'utf8');

		logger.info(`Generated entity: ${chalk.green(name)} in ${chalk.cyan(yamlPath)}`);

		// Ask if user wants to generate a model too
		const { generateModel } = await inquirer.prompt([
			{
				type: 'confirm',
				name: 'generateModel',
				message: 'Generate TypeScript interface for this entity?',
				default: true
			}
		]);

		if (generateModel) {
			const modelDir = path.resolve(process.cwd(), './src/models');
			if (!fs.existsSync(modelDir)) {
				fs.mkdirSync(modelDir, { recursive: true });
			}

			const interfaceContent = generateEntityInterface(entityConfig);
			const modelPath = path.join(modelDir, `${name.toLowerCase()}.ts`);

			fs.writeFileSync(modelPath, interfaceContent, 'utf8');
			logger.info(`Generated model: ${chalk.green(modelPath)}`);
		}
	}
}

/**
 * Generate entity interactively
 * @param name Entity name
 * @param tableName Table name
 * @param outputDir Output directory
 * @param logger Logger instance
 */
async function generateEntityInteractive(
	name: string,
	tableName: string,
	outputDir: string,
	logger: Logger
): Promise<void> {
	try {
		// Confirm basic entity info
		const entityInfo = await inquirer.prompt([
			{
				type: 'input',
				name: 'name',
				message: 'Entity name:',
				default: name
			},
			{
				type: 'input',
				name: 'table',
				message: 'Table name:',
				default: tableName
			},
			{
				type: 'input',
				name: 'idField',
				message: 'ID field name:',
				default: 'id'
			},
			{
				type: 'confirm',
				name: 'timestamps',
				message: 'Add timestamps (createdAt, updatedAt)?',
				default: true
			},
			{
				type: 'confirm',
				name: 'softDelete',
				message: 'Enable soft delete?',
				default: false
			},
			{
				type: 'confirm',
				name: 'exposeApi',
				message: 'Expose entity via REST API?',
				default: true
			},
			{
				type: 'confirm',
				name: 'addComputed',
				message: 'Add computed properties?',
				default: false
			},
			{
				type: 'confirm',
				name: 'addHooks',
				message: 'Add lifecycle hooks?',
				default: false
			},
			{
				type: 'confirm',
				name: 'addActions',
				message: 'Add custom actions?',
				default: false
			}
		]);

		// Initialize entity structure
		const columns: ColumnMapping[] = [];
		const computed: ComputedProperty[] = [];
		const hooks: Record<string, EntityHook[]> = {};
		const actions: EntityAction[] = [];

		// Add ID field
		columns.push({
			logical: entityInfo.idField,
			physical: entityInfo.idField,
			primaryKey: true,
			autoIncrement: true,
			type: 'integer',
			api: {
				readable: true,
				writable: false
			}
		});

		// Get fields
		logger.info('Add fields to the entity (leave field name empty to finish):');
		await promptForFields(columns);

		// Add timestamp fields if requested
		if (entityInfo.timestamps) {
			columns.push({
				logical: 'createdAt',
				physical: 'created_at',
				type: 'datetime',
				nullable: false,
				api: {
					readable: true,
					writable: false
				}
			});

			columns.push({
				logical: 'updatedAt',
				physical: 'updated_at',
				type: 'datetime',
				nullable: true,
				api: {
					readable: true,
					writable: false
				}
			});
		}

		// Add soft delete field if requested
		if (entityInfo.softDelete) {
			columns.push({
				logical: 'deletedAt',
				physical: 'deleted_at',
				type: 'datetime',
				nullable: true,
				api: {
					readable: false,
					writable: false
				}
			});
		}

		// Add computed properties if requested
		if (entityInfo.addComputed) {
			logger.info('Add computed properties (leave name empty to finish):');
			await promptForComputedProperties(computed, columns);
		}

		// Add hooks if requested
		if (entityInfo.addHooks) {
			logger.info('Add lifecycle hooks:');
			await promptForHooks(hooks);
		}

		// Add actions if requested
		if (entityInfo.addActions) {
			logger.info('Add custom actions (leave name empty to finish):');
			await promptForActions(actions);
		}

		// Create entity config
		const entity: EntityConfig = {
			entity: entityInfo.name,
			table: entityInfo.table,
			idField: entityInfo.idField,
			columns,
			...(entityInfo.exposeApi ? {
				api: {
					exposed: true,
					operations: {
						getAll: true,
						getById: true,
						create: true,
						update: true,
						delete: true
					},
					permissions: {
						getAll: ['public'],
						getById: ['public'],
						create: ['user', 'admin'],
						update: ['user', 'admin'],
						delete: ['admin']
					}
				}
			} : {}),
			...(entityInfo.timestamps ? {
				timestamps: {
					createdAt: 'createdAt',
					updatedAt: 'updatedAt',
					...(entityInfo.softDelete ? { deletedAt: 'deletedAt' } : {})
				}
			} : {}),
			...(entityInfo.softDelete ? {
				softDelete: {
					column: 'deletedAt',
					deletedValue: 'CURRENT_TIMESTAMP',
					nonDeletedValue: null
				}
			} : {}),
			...(computed.length > 0 ? { computed } : {}),
			...(Object.keys(hooks).length > 0 ? { hooks } : {}),
			...(actions.length > 0 ? { actions } : {})
		};

		// Write entity YAML
		const yamlPath = path.join(outputDir, `${entityInfo.name.toLowerCase()}.yaml`);
		fs.writeFileSync(yamlPath, JSON.stringify(entity, null, 2), 'utf8');

		logger.info(`Generated entity: ${chalk.green(yamlPath)}`);

		// Generate model file if requested
		const generateModel = await inquirer.prompt([
			{
				type: 'confirm',
				name: 'generate',
				message: 'Generate TypeScript interface for this entity?',
				default: true
			}
		]);

		if (generateModel.generate) {
			const modelDir = path.resolve(process.cwd(), './src/models');

			if (!fs.existsSync(modelDir)) {
				fs.mkdirSync(modelDir, { recursive: true });
			}

			const interfaceContent = generateEntityInterface(entity);
			const modelPath = path.join(modelDir, `${entityInfo.name.toLowerCase()}.ts`);

			fs.writeFileSync(modelPath, interfaceContent, 'utf8');
			logger.info(`Generated model: ${chalk.green(modelPath)}`);
		}

		return entity;
	} catch (error: any) {
		logger.error(`Error in interactive entity generation: ${error.message}`);
		throw error;
	}
}

/**
 * Prompt for entity fields
 * @param columns Array to collect column mappings
 */
async function promptForFields(columns: ColumnMapping[]): Promise<void> {
	const addField = async () => {
		const { name } = await inquirer.prompt([
			{
				type: 'input',
				name: 'name',
				message: 'Field name (empty to finish):',
				validate: (input: string) => {
					if (!input) return true; // Empty is valid to finish
					if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(input)) {
						return 'Field name must start with a letter and contain only letters, numbers, and underscores';
					}
					if (columns.some(c => c.logical === input)) {
						return 'Field name already exists';
					}
					return true;
				}
			}
		]);

		if (!name) return;

		const fieldDetails = await inquirer.prompt([
			{
				type: 'list',
				name: 'type',
				message: 'Field type:',
				choices: [
					'string',
					'integer',
					'number',
					'boolean',
					'date',
					'datetime',
					'text',
					'json'
				],
				default: 'string'
			},
			{
				type: 'confirm',
				name: 'nullable',
				message: 'Is nullable?',
				default: true
			},
			{
				type: 'confirm',
				name: 'unique',
				message: 'Is unique?',
				default: false
			},
			{
				type: 'input',
				name: 'description',
				message: 'Description (optional):',
			},
			{
				type: 'confirm',
				name: 'apiReadable',
				message: 'Is readable via API?',
				default: true
			},
			{
				type: 'confirm',
				name: 'apiWritable',
				message: 'Is writable via API?',
				default: true
			}
		]);

		columns.push({
			logical: name,
			physical: camelToSnake(name),
			type: fieldDetails.type,
			nullable: fieldDetails.nullable,
			unique: fieldDetails.unique,
			...(fieldDetails.description ? { comment: fieldDetails.description } : {}),
			api: {
				readable: fieldDetails.apiReadable,
				writable: fieldDetails.apiWritable
			}
		});

		await addField();
	};

	await addField();
}

/**
 * Convert camelCase to snake_case
 * @param str String to convert
 * @returns Converted string
 */
function camelToSnake(str: string): string {
	return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Prompt for computed properties
 * @param computed Array to collect computed properties
 * @param columns Available columns to use as dependencies
 */
async function promptForComputedProperties(
	computed: ComputedProperty[],
	columns: ColumnMapping[]
): Promise<void> {
	const addComputed = async () => {
		const { name } = await inquirer.prompt([
			{
				type: 'input',
				name: 'name',
				message: 'Computed property name (empty to finish):',
				validate: (input) => {
					if (!input) return true; // Empty is valid to finish
					if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(input)) {
						return 'Property name must start with a letter and contain only letters, numbers, and underscores';
					}
					if (computed.some(c => c.name === input) || columns.some(c => c.logical === input)) {
						return 'Property name already exists';
					}
					return true;
				}
			}
		]);

		if (!name) return;

		const availableFields = columns.map(c => c.logical);

		const propertyDetails = await inquirer.prompt([
			{
				type: 'checkbox',
				name: 'dependencies',
				message: 'Dependencies (fields this property depends on):',
				choices: availableFields
			},
			{
				type: 'input',
				name: 'description',
				message: 'Description:',
				default: `Computed ${name} property`
			},
			{
				type: 'confirm',
				name: 'exposeInApi',
				message: 'Expose in API?',
				default: true
			},
			{
				type: 'editor',
				name: 'implementation',
				message: 'Implementation function:',
				default: `(entity) => {
	// Compute ${name} based on entity properties
	return entity.${availableFields[0] || 'id'};
  }`
			}
		]);

		computed.push({
			name,
			dependencies: propertyDetails.dependencies,
			implementation: propertyDetails.implementation,
			description: propertyDetails.description,
			exposeInApi: propertyDetails.exposeInApi
		});

		await addComputed();
	};

	await addComputed();
}

/**
 * Prompt for entity hooks
 * @param hooks Object to collect hooks by type
 */
async function promptForHooks(hooks: Record<string, EntityHook[]>): Promise<void> {
	const hookTypes = [
		'beforeCreate',
		'afterCreate',
		'beforeUpdate',
		'afterUpdate',
		'beforeDelete',
		'afterDelete',
		'beforeGetById',
		'afterGetById',
		'beforeGetAll',
		'afterGetAll',
		'beforeApi',
		'afterApi'
	];

	for (const hookType of hookTypes) {
		const { addHook } = await inquirer.prompt([
			{
				type: 'confirm',
				name: 'addHook',
				message: `Add ${hookType} hook?`,
				default: hookType === 'beforeCreate' || hookType === 'afterCreate'
			}
		]);

		if (addHook) {
			const { name } = await inquirer.prompt([
				{
					type: 'input',
					name: 'name',
					message: `Hook name for ${hookType}:`,
					default: hookType.replace(/^(before|after)/, '').toLowerCase() + 'Handler'
				}
			]);

			const { implementation } = await inquirer.prompt([
				{
					type: 'editor',
					name: 'implementation',
					message: `Implementation for ${hookType}:`,
					default: `async (entity, context) => {
	// ${hookType} hook implementation
	// You can modify the entity here or perform other operations
	
	// Log the operation
	context.logger?.debug("${hookType} hook executed");
	
	// Return the entity (possibly modified)
	return entity;
  }`
				}
			]);

			if (!hooks[hookType]) {
				hooks[hookType] = [];
			}

			hooks[hookType].push({
				name,
				implementation,
				priority: 10
			});
		}
	}
}

/**
 * Prompt for entity actions
 * @param actions Array to collect actions
 */
async function promptForActions(actions: EntityAction[]): Promise<void> {
	const addAction = async () => {
		const { name } = await inquirer.prompt([
			{
				type: 'input',
				name: 'name',
				message: 'Action name (empty to finish):',
				validate: (input) => {
					if (!input) return true; // Empty is valid to finish
					if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(input)) {
						return 'Action name must start with a letter and contain only letters, numbers, and underscores';
					}
					if (actions.some(a => a.name === input)) {
						return 'Action name already exists';
					}
					return true;
				}
			}
		]);

		if (!name) return;

		const actionDetails = await inquirer.prompt([
			{
				type: 'input',
				name: 'description',
				message: 'Description:',
				default: `${name} action`
			},
			{
				type: 'confirm',
				name: 'exposeApi',
				message: 'Expose via API?',
				default: true
			},
			{
				type: 'list',
				name: 'httpMethod',
				message: 'HTTP method:',
				choices: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
				default: 'POST',
				when: (answers) => answers.exposeApi
			},
			{
				type: 'input',
				name: 'route',
				message: 'API route (relative to entity base path):',
				default: `/${name}`,
				when: (answers) => answers.exposeApi
			},
			{
				type: 'checkbox',
				name: 'roles',
				message: 'Allowed roles:',
				choices: ['admin', 'user', 'public'],
				default: ['admin'],
				when: (answers) => answers.exposeApi
			},
			{
				type: 'confirm',
				name: 'transactional',
				message: 'Run in transaction?',
				default: true
			},
			{
				type: 'editor',
				name: 'implementation',
				message: 'Implementation function:',
				default: `async (params, context) => {
	// Action implementation for ${name}
	const { db, user, logger } = context;
	
	logger?.info("Executing ${name} action");
	
	// Access entity manager if needed
	const entityManager = context.getEntityManager();
	
	// Sample implementation - replace with actual logic
	return {
	  success: true,
	  message: "${name} executed successfully",
	  timestamp: new Date().toISOString()
	};
  }`
			}
		]);

		const action: EntityAction = {
			name,
			description: actionDetails.description,
			implementation: actionDetails.implementation,
			transactional: actionDetails.transactional,
		};

		if (actionDetails.exposeApi) {
			action.httpMethod = actionDetails.httpMethod;
			action.route = actionDetails.route;
			action.roles = actionDetails.roles;
		}

		actions.push(action);
		await addAction();
	};

	await addAction();
}

/**
 * Generate model command implementation
 * @param options Command options
 * @param logger Logger instance
 */
async function generateModelCommand(options: any, logger: Logger): Promise<void> {
	try {
		// Load entities
		// Load entities
		const configLoader = new ConfigLoader({
			logger,
			entitiesDir: path.join(process.cwd(), 'entities')
		});
		const entitiesDir = path.resolve(process.cwd(), options.dir);

		if (!fs.existsSync(entitiesDir)) {
			logger.error(`Entities directory not found: ${entitiesDir}`);
			return;
		}

		// Ensure output directory exists
		const outputDir = path.resolve(process.cwd(), options.output);
		if (!fs.existsSync(outputDir)) {
			fs.mkdirSync(outputDir, { recursive: true });
		}

		// Load entities via config loader
		const entities = await configLoader.loadEntities(entitiesDir);

		// Generate and write interfaces
		const indexImports: string[] = [];
		const indexExports: string[] = [];

		for (const [entityName, entity] of entities.entries()) {
			const interfaceContent = generateEntityInterface(entity);
			const fileName = `${entityName.toLowerCase()}.ts`;
			const filePath = path.join(outputDir, fileName);

			fs.writeFileSync(filePath, interfaceContent, 'utf8');

			// Collect for index file
			indexImports.push(`import { ${entityName} } from './${entityName.toLowerCase()}';`);
			indexExports.push(entityName);

			logger.info(`Generated model: ${chalk.green(fileName)}`);
		}

		// Generate index file if requested
		if (options.index) {
			const indexContent = `/**
   * Generated entity models
   * This file is auto-generated - do not edit directly
   */
  
  ${indexImports.join('\n')}
  
  export {
	${indexExports.join(',\n  ')}
  };
  `;
			fs.writeFileSync(path.join(outputDir, 'index.ts'), indexContent, 'utf8');
			logger.info(`Generated models index file`);
		}
	} catch (error: any) {
		logger.error(`Error generating models: ${error.message}`);
		throw error;
	}
}

/**
 * Generate entity from interface command implementation
 * @param file Interface file path
 * @param options Command options
 * @param logger Logger instance
 */
async function generateEntityFromInterfaceCommand(file: string, options: any, logger: Logger): Promise<void> {
	try {
		const filePath = path.resolve(process.cwd(), file);

		if (!fs.existsSync(filePath)) {
			logger.error(`File not found: ${filePath}`);
			return;
		}

		// Read TypeScript file
		const tsSource = fs.readFileSync(filePath, 'utf8');

		// Extract interface name from filename if not in table option
		const fileName = path.basename(filePath, path.extname(filePath));
		const tableName = options.table || fileName.toLowerCase() + 's';

		// Generate entity from interface
		const entity = generateEntityFromTypeScript(tsSource, tableName, options.id);

		// If API exposure is requested, add API configuration
		if (options.api) {
			entity.api = {
				exposed: true,
				operations: {
					getAll: true,
					getById: true,
					create: true,
					update: true,
					delete: true
				},
				permissions: {
					getAll: ['public'],
					getById: ['public'],
					create: ['user', 'admin'],
					update: ['user', 'admin'],
					delete: ['admin']
				}
			};
		}

		// Ensure output directory exists
		const outputDir = path.resolve(process.cwd(), options.output);
		if (!fs.existsSync(outputDir)) {
			fs.mkdirSync(outputDir, { recursive: true });
		}

		// Write entity YAML
		const yamlPath = path.join(outputDir, `${entity.entity.toLowerCase()}.yaml`);
		const yamlContent = JSON.stringify(entity, null, 2);
		fs.writeFileSync(yamlPath, yamlContent, 'utf8');

		logger.info(`Generated entity YAML: ${chalk.green(yamlPath)}`);
	} catch (error: any) {
		logger.error(`Error generating entity from interface: ${error.message}`);
		throw error;
	}
}

/**
 * Generate migration command implementation
 * @param options Command options
 * @param logger Logger instance
 */
async function generateMigrationCommand(options: any, logger: Logger): Promise<void> {
	try {
		// Create migration generator
		const migrationGenerator = new MigrationGenerator(
			options.type as 'sqlite' | 'mysql' | 'postgres',
			path.resolve(process.cwd(), options.output),
			logger
		);

		// Ensure output directory exists
		const outputDir = path.resolve(process.cwd(), options.output);
		if (!fs.existsSync(outputDir)) {
			fs.mkdirSync(outputDir, { recursive: true });
		}

		if (options.entity) {
			// Generate migration for specific entity
			const configLoader = new ConfigLoader({ logger });
			const entitiesDir = path.resolve(process.cwd(), options.dir);
			const entities = await configLoader.loadEntities(entitiesDir);

			const entity = entities.get(options.entity);
			if (!entity) {
				logger.error(`Entity not found: ${options.entity}`);
				return;
			}

			const fileName = migrationGenerator.generateCreateTableMigration(
				entity,
				`create_${entity.table}_table`
			);

			logger.info(`Generated migration: ${chalk.green(fileName)}`);
		} else {
			// Generate empty migration
			const fileName = migrationGenerator.generateRawSqlMigration(
				'-- Add your SQL here',
				options.name
			);

			logger.info(`Generated empty migration: ${chalk.green(fileName)}`);
		}
	} catch (error: any) {
		logger.error(`Error generating migration: ${error.message}`);
		throw error;
	}
}

/**
 * Generate API documentation command implementation
 * @param options Command options
 * @param logger Logger instance
 */
async function generateDocsCommand(options: any, logger: Logger): Promise<void> {
	try {
		logger.info(chalk.blue('Generating API documentation...'));

		// Load entities
		const configLoader = new ConfigLoader({ logger });
		const entitiesDir = path.resolve(process.cwd(), options.dir);

		if (!fs.existsSync(entitiesDir)) {
			logger.error(`Entities directory not found: ${entitiesDir}`);
			return;
		}

		// Ensure output directory exists
		const outputDir = path.resolve(process.cwd(), options.output);
		if (!fs.existsSync(outputDir)) {
			fs.mkdirSync(outputDir, { recursive: true });
		}

		// Load entities via config loader
		const entities = await configLoader.loadEntities(entitiesDir);

		// Create a temporary app context to generate API docs
		const appContext = await createTemporaryAppContext(logger, entities);

		if (!appContext) {
			logger.error('Failed to create application context');
			return;
		}

		// Generate OpenAPI documentation
		const apiGenerator = createApiGenerator(appContext, logger);
		const openApiDocs = apiGenerator.generateOpenApiDocs(entities);

		// Write OpenAPI documentation
		const openApiPath = path.join(outputDir, 'openapi.json');
		fs.writeFileSync(openApiPath, JSON.stringify(openApiDocs, null, 2), 'utf8');

		logger.info(`Generated OpenAPI documentation: ${chalk.green(openApiPath)}`);

		// Generate Markdown documentation for all entities
		for (const [entityName, entity] of entities.entries()) {
			if (!entity.api?.exposed) continue;

			// Generate Markdown documentation
			const markdown = generateEntityMarkdownDocs(entity);
			const markdownPath = path.join(outputDir, `${entityName.toLowerCase()}.md`);
			fs.writeFileSync(markdownPath, markdown, 'utf8');

			logger.info(`Generated Markdown documentation for ${entityName}: ${chalk.green(markdownPath)}`);
		}

		// Generate index markdown
		const indexMarkdown = generateDocsIndex(entities);
		fs.writeFileSync(path.join(outputDir, 'index.md'), indexMarkdown, 'utf8');

		logger.info(`Generated documentation index: ${chalk.green(path.join(outputDir, 'index.md'))}`);

		logger.info(chalk.green('API documentation generation completed'));
	} catch (error: any) {
		logger.error(`Error generating API documentation: ${error.message}`);
		throw error;
	}
}

/**
 * Generate entity markdown documentation
 * @param entity Entity configuration
 * @returns Markdown documentation
 */
function generateEntityMarkdownDocs(entity: EntityConfig): string {
	const { entity: entityName, table, api } = entity;

	let markdown = `# ${entityName} API\n\n`;
	markdown += `This document describes the API endpoints for the \`${entityName}\` entity.\n\n`;

	markdown += `## Base Information\n\n`;
	markdown += `- **Entity Name**: ${entityName}\n`;
	markdown += `- **Table Name**: ${table}\n`;
	markdown += `- **API Base Path**: ${api?.basePath || `/${entityName.toLowerCase()}`}\n\n`;

	// Fields
	markdown += `## Fields\n\n`;
	markdown += `| Field | Type | Nullable | Description | API Readable | API Writable |\n`;
	markdown += `|-------|------|----------|-------------|--------------|-------------|\n`;

	for (const column of entity.columns) {
		const description = column.comment || '';
		const readable = column.api?.readable !== false ? '✓' : '✗';
		const writable = column.api?.writable !== false ? '✓' : '✗';

		markdown += `| ${column.logical} | ${column.type || 'string'} | ${column.nullable ? '✓' : '✗'} | ${description} | ${readable} | ${writable} |\n`;
	}

	markdown += `\n`;

	// Standard API endpoints
	if (api?.exposed) {
		markdown += `## API Endpoints\n\n`;

		const operations = api.operations || { getAll: true, getById: true, create: true, update: true, delete: true };
		const basePath = api.basePath || `/${entityName.toLowerCase()}`;

		if (operations.getAll !== false) {
			const roles = (api.permissions?.getAll || ['public']).join(', ');
			markdown += `### Get All ${entityName}s\n\n`;
			markdown += `- **URL**: \`GET ${basePath}\`\n`;
			markdown += `- **Required Roles**: ${roles}\n`;
			markdown += `- **Description**: Retrieves a list of all ${entityName} records\n\n`;

			markdown += `#### Query Parameters\n\n`;
			markdown += `| Parameter | Type | Description |\n`;
			markdown += `|-----------|------|-------------|\n`;
			markdown += `| limit | number | Maximum number of results to return |\n`;
			markdown += `| offset | number | Number of records to skip |\n`;
			markdown += `| sort | string | Field to sort by |\n`;
			markdown += `| order | string | Sort direction (asc or desc) |\n\n`;
		}

		if (operations.getById !== false) {
			const roles = (api.permissions?.getById || ['public']).join(', ');
			markdown += `### Get ${entityName} by ID\n\n`;
			markdown += `- **URL**: \`GET ${basePath}/:id\`\n`;
			markdown += `- **Required Roles**: ${roles}\n`;
			markdown += `- **Description**: Retrieves a specific ${entityName} record by ID\n\n`;

			markdown += `#### Path Parameters\n\n`;
			markdown += `| Parameter | Type | Description |\n`;
			markdown += `|-----------|------|-------------|\n`;
			markdown += `| id | number | The ID of the ${entityName} to retrieve |\n\n`;
		}

		if (operations.create !== false) {
			const roles = (api.permissions?.create || ['user', 'admin']).join(', ');
			markdown += `### Create ${entityName}\n\n`;
			markdown += `- **URL**: \`POST ${basePath}\`\n`;
			markdown += `- **Required Roles**: ${roles}\n`;
			markdown += `- **Description**: Creates a new ${entityName} record\n\n`;

			markdown += `#### Request Body\n\n`;
			markdown += "```json\n{\n";

			// Add writable fields
			entity.columns.forEach(column => {
				if (column.api?.writable !== false && !column.primaryKey && !column.autoIncrement) {
					markdown += `  "${column.logical}": "${getTypeExample(column.type || 'string')}",\n`;
				}
			});

			markdown += "}\n```\n\n";
		}

		if (operations.update !== false) {
			const roles = (api.permissions?.update || ['user', 'admin']).join(', ');
			markdown += `### Update ${entityName}\n\n`;
			markdown += `- **URL**: \`PUT ${basePath}/:id\`\n`;
			markdown += `- **Required Roles**: ${roles}\n`;
			markdown += `- **Description**: Updates an existing ${entityName} record\n\n`;

			markdown += `#### Path Parameters\n\n`;
			markdown += `| Parameter | Type | Description |\n`;
			markdown += `|-----------|------|-------------|\n`;
			markdown += `| id | number | The ID of the ${entityName} to update |\n\n`;

			markdown += `#### Request Body\n\n`;
			markdown += "```json\n{\n";

			// Add writable fields
			entity.columns.forEach(column => {
				if (column.api?.writable !== false && !column.primaryKey && !column.autoIncrement) {
					markdown += `  "${column.logical}": "${getTypeExample(column.type || 'string')}",\n`;
				}
			});

			markdown += "}\n```\n\n";
		}

		if (operations.delete !== false) {
			const roles = (api.permissions?.delete || ['admin']).join(', ');
			markdown += `### Delete ${entityName}\n\n`;
			markdown += `- **URL**: \`DELETE ${basePath}/:id\`\n`;
			markdown += `- **Required Roles**: ${roles}\n`;
			markdown += `- **Description**: Deletes a ${entityName} record\n\n`;

			markdown += `#### Path Parameters\n\n`;
			markdown += `| Parameter | Type | Description |\n`;
			markdown += `|-----------|------|-------------|\n`;
			markdown += `| id | number | The ID of the ${entityName} to delete |\n\n`;
		}
	}

	// Custom actions
	if (entity.actions && entity.actions.length > 0) {
		markdown += `## Custom Actions\n\n`;

		for (const action of entity.actions) {
			if (action.httpMethod && action.route) {
				const roles = (action.roles || ['admin']).join(', ');
				const method = action.httpMethod.toUpperCase();
				const route = action.route.startsWith('/') ? action.route : `/${action.route}`;
				const basePath = api?.basePath || `/${entityName.toLowerCase()}`;

				markdown += `### ${action.name}\n\n`;
				markdown += `- **URL**: \`${method} ${basePath}${route}\`\n`;
				markdown += `- **Required Roles**: ${roles}\n`;
				markdown += `- **Description**: ${action.description || action.name}\n`;
				markdown += `- **Transactional**: ${action.transactional ? 'Yes' : 'No'}\n\n`;
			}
		}
	}

	return markdown;
}

/**
 * Get example value for type
 * @param type Column type
 * @returns Example value as string
 */
function getTypeExample(type: string): string {
	switch (type.toLowerCase()) {
		case 'string':
		case 'varchar':
		case 'char':
			return 'example';
		case 'integer':
		case 'int':
		case 'bigint':
		case 'smallint':
			return '42';
		case 'number':
		case 'float':
		case 'double':
		case 'decimal':
			return '42.5';
		case 'boolean':
		case 'bool':
			return 'true';
		case 'date':
			return '2023-01-01';
		case 'datetime':
		case 'timestamp':
			return '2023-01-01T12:00:00Z';
		case 'text':
			return 'Example text content';
		case 'json':
			return '{"key": "value"}';
		default:
			return 'example';
	}
}

/**
 * Generate documentation index
 * @param entities Entity map
 * @returns Markdown index document
 */
function generateDocsIndex(entities: Map<string, EntityConfig>): string {
	let markdown = `# API Documentation\n\n`;
	markdown += `This is the API documentation for the application.\n\n`;

	markdown += `## Entities\n\n`;

	for (const [entityName, entity] of entities.entries()) {
		if (entity.api?.exposed) {
			markdown += `- [${entityName}](./${entityName.toLowerCase()}.md)\n`;
		}
	}

	markdown += `\n## OpenAPI Specification\n\n`;
	markdown += `The full OpenAPI specification is available in [openapi.json](./openapi.json).\n`;

	return markdown;
}

/**
 * Create a temporary app context for documentation generation
 * @param logger Logger instance
 * @param entities Entity map
 * @returns App context or undefined if failed
 */
async function createTemporaryAppContext(logger: Logger, entities: Map<string, EntityConfig>): Promise<any> {
	try {
		// Create a minimal config
		const config = {
			name: 'Documentation',
			version: '1.0.0',
			port: 3000,
			apiBasePath: '/api',
			production: false
		};

		// Use the framework to create a context without starting the server
		const framework = new Framework({
			logger,
			autoGenerateApi: false
		});

		// Initialize the framework with config
		await framework.initialize();

		// Get the context and register entities
		const context = framework.getContext();

		// Register all entities with the context
		for (const [name, entity] of entities.entries()) {
			context.registerEntity(name, entity);
		}

		return context;
	} catch (error: any) {
		logger.error(`Error creating temporary app context: ${error.message}`);
		return undefined;
	}
}

/**
 * Generate API code using an adapter
 * @param options Command options
 * @param logger Logger instance
 */
async function generateApiCommand(options: any, logger: Logger): Promise<void> {
	try {
		logger.info(chalk.blue(`Generating API code using ${options.adapter} adapter...`));

		// Create adapter registry
		const adapterRegistry = createAdapterRegistry(logger);

		// Check if adapter exists
		if (!adapterRegistry.hasAdapter(options.adapter)) {
			logger.error(`Adapter not found: ${options.adapter}`);
			return;
		}

		// Get the adapter
		const adapter = adapterRegistry.getAdapter(options.adapter, {
			outputDir: path.resolve(process.cwd(), options.output),
			typescript: options.typescript
		});

		// Initialize adapter
		await adapter.initialize();

		// Load entities
		const configLoader = new ConfigLoader({ logger });
		const entitiesDir = path.resolve(process.cwd(), options.dir);
		const entities = await configLoader.loadEntities(entitiesDir);

		if (entities.size === 0) {
			logger.error(`No entities found in ${entitiesDir}`);
			return;
		}

		// Create temporary app context
		const context = await createTemporaryAppContext(logger, entities);

		if (!context) {
			logger.error('Failed to create application context');
			return;
		}

		// Create action registry
		const actionRegistry = new ActionRegistry(logger);

		// If specific entity is requested
		if (options.entity) {
			const entity = entities.get(options.entity);

			if (!entity) {
				logger.error(`Entity not found: ${options.entity}`);
				return;
			}

			// Generate handler for entity
			const result = await adapter.generateEntityHandler(
				entity,
				actionRegistry,
				context
			);

			if (result.success) {
				logger.info(`Generated ${result.files.length} files for entity ${options.entity}`);

				// Write files to disk
				const outputDir = path.resolve(process.cwd(), options.output);
				await writeGeneratedFiles(result.files, outputDir, logger);

				logger.info(chalk.green(`API code for entity ${options.entity} generated successfully in ${outputDir}`));
			} else {
				logger.error(`Failed to generate API code: ${result.error}`);
			}
		} else {
			// Generate handlers for all entities
			const result = await adapter.generateHandlers(
				entities,
				actionRegistry,
				context
			);

			if (result.success) {
				logger.info(`Generated ${result.files.length} files for all entities`);

				// Write files to disk
				const outputDir = path.resolve(process.cwd(), options.output);
				await writeGeneratedFiles(result.files, outputDir, logger);

				logger.info(chalk.green(`API code generated successfully in ${outputDir}`));
			} else {
				logger.error(`Failed to generate API code: ${result.error}`);
			}
		}
	} catch (error: any) {
		logger.error(`Error generating API code: ${error.message}`);
		throw error;
	}
}

/**
 * Write generated files to disk
 * @param files Generated files 
 * @param outputDir Output directory
 * @param logger Logger instance
 */
async function writeGeneratedFiles(
	files: Array<{ path: string; content: string; entity?: string }>,
	outputDir: string,
	logger: Logger
): Promise<void> {
	// Ensure output directory exists
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	// Write each file
	for (const file of files) {
		const filePath = path.join(outputDir, file.path);
		const fileDir = path.dirname(filePath);

		// Ensure directory exists
		if (!fs.existsSync(fileDir)) {
			fs.mkdirSync(fileDir, { recursive: true });
		}

		// Write file
		fs.writeFileSync(filePath, file.content, 'utf8');
		logger.debug(`Generated file: ${chalk.cyan(filePath)}`);
	}
}