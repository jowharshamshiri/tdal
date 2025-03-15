/**
 * Generate Command
 * CLI commands for code generation
 */

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { Logger } from '../core/types';
import { ConfigLoader } from '../core/config-loader';
import { scaffoldEntity, generateEntityFromTypeScript } from '../entity/yaml-generator';
import { MigrationGenerator } from '../database/migration-generator';
import { AdapterFactory } from '../database/adapter-factory';
import { generateEntityInterface } from '../entity/entity-schema';
import { Framework } from '../core/framework';

/**
 * Register generate commands
 * @param program Commander program
 * @param logger Logger instance
 */
export function registerGenerateCommands(program: Command, logger: Logger) {
	const generate = program
		.command('generate')
		.description('Generate code from YAML or generate YAML from code');

	// Generate entity
	generate
		.command('entity <name>')
		.description('Generate a new entity YAML file')
		.option('-t, --table <tableName>', 'Database table name')
		.option('-d, --dir <directory>', 'Output directory', './entities')
		.option('-i, --interactive', 'Interactive mode', false)
		.option('-f, --fields <fields>', 'Comma-separated list of fields to add (name:type format)')
		.action(async (name, options) => {
			try {
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
					let customFields: Array<{ name: string; type: string }> = [];

					if (options.fields) {
						customFields = options.fields.split(',').map((field: string) => {
							const [name, type = 'string'] = field.split(':');
							return { name, type };
						});
					}

					const entity = scaffoldEntity(name, tableName, outputDir);

					// Add custom fields
					if (customFields.length > 0) {
						for (const field of customFields) {
							entity.columns.push({
								logical: field.name,
								physical: field.name,
								type: field.type,
								nullable: true
							});
						}

						// Write updated entity
						const yamlPath = path.join(outputDir, `${name.toLowerCase()}.yaml`);
						fs.writeFileSync(yamlPath, JSON.stringify(entity, null, 2), 'utf8');
					}

					logger.info(`Generated entity: ${chalk.green(name)} in ${chalk.cyan(outputDir)}`);
				}
			} catch (error: any) {
				logger.error(`Error generating entity: ${error}`);
			}
		});

	// Generate model from entity
	generate
		.command('model')
		.description('Generate TypeScript interfaces from entity YAML files')
		.option('-d, --dir <directory>', 'Entities directory', './entities')
		.option('-o, --output <directory>', 'Output directory', './src/models')
		.action(async (options) => {
			try {
				// Load entities
				const configLoader = new ConfigLoader(logger);
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

				// Generate index file
				const indexContent = `${indexImports.join('\n')}\n\nexport {\n  ${indexExports.join(',\n  ')}\n};\n`;
				fs.writeFileSync(path.join(outputDir, 'index.ts'), indexContent, 'utf8');

				logger.info(`Generated models index file`);
			} catch (error: any) {
				logger.error(`Error generating models: ${error}`);
			}
		});

	// Generate entity from interface
	generate
		.command('entity-from-interface <file>')
		.description('Generate entity YAML from TypeScript interface')
		.option('-t, --table <tableName>', 'Database table name')
		.option('-i, --id <idField>', 'ID field name', 'id')
		.option('-o, --output <directory>', 'Output directory', './entities')
		.action(async (file, options) => {
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
				logger.error(`Error generating entity from interface: ${error}`);
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
					const configLoader = new ConfigLoader(logger);
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
				logger.error(`Error generating migration: ${error}`);
			}
		});
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
) {
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
				message: 'Add timestamps (created_at, updated_at)?',
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
			}
		]);

		// Get fields
		const fields = [];

		// Always add ID field
		fields.push({
			logical: entityInfo.idField,
			physical: entityInfo.idField,
			primaryKey: true,
			autoIncrement: true,
			type: 'integer'
		});

		let addingFields = true;

		logger.info('Add fields to the entity (leave field name empty to finish):');

		while (addingFields) {
			const field = await inquirer.prompt([
				{
					type: 'input',
					name: 'name',
					message: 'Field name (empty to finish):'
				}
			]);

			if (!field.name) {
				addingFields = false;
				continue;
			}

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
				}
			]);

			fields.push({
				logical: field.name,
				physical: field.name,
				type: fieldDetails.type,
				nullable: fieldDetails.nullable,
				unique: fieldDetails.unique
			});
		}

		// Add timestamp fields if requested
		if (entityInfo.timestamps) {
			fields.push({
				logical: 'created_at',
				physical: 'created_at',
				type: 'datetime',
				nullable: false
			});

			fields.push({
				logical: 'updated_at',
				physical: 'updated_at',
				type: 'datetime',
				nullable: true
			});
		}

		// Add soft delete field if requested
		if (entityInfo.softDelete) {
			fields.push({
				logical: 'deleted_at',
				physical: 'deleted_at',
				type: 'datetime',
				nullable: true
			});
		}

		// Create entity config
		const entity = {
			entity: entityInfo.name,
			table: entityInfo.table,
			idField: entityInfo.idField,
			columns: fields,
			timestamps: entityInfo.timestamps ? {
				createdAt: 'created_at',
				updatedAt: 'updated_at',
				...(entityInfo.softDelete ? { deletedAt: 'deleted_at' } : {})
			} : undefined,
			softDelete: entityInfo.softDelete ? {
				column: 'deleted_at',
				deletedValue: 'CURRENT_TIMESTAMP',
				nonDeletedValue: null
			} : undefined,
			api: entityInfo.exposeApi ? {
				exposed: true,
				operations: {
					getAll: true,
					getById: true,
					create: true,
					update: true,
					delete: true
				}
			} : undefined
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
		logger.error(`Error in interactive entity generation: ${error}`);
		throw error;
	}
}