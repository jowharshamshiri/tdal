/**
 * Scaffold Command
 * Creates new projects and generates entity scaffolding
 */

import * as fs from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { EntityConfig } from '../core/types';
import { scaffoldEntity, writeEntityYaml } from '../entity/yaml-generator';
import { DatabaseAdapter } from '../database/database-adapter';
import { MigrationGenerator } from '../database/migration-generator';
import { ConsoleLogger } from './logger';

/**
 * Default project structure
 */
const DEFAULT_STRUCTURE = {
	'src': {
		'entities': {},
		'models': {},
		'hooks': {},
		'migrations': {},
		'public': {
			'css': {},
			'js': {}
		}
	},
	'config': {},
	'app.yaml': '',
	'tsconfig.json': '',
	'package.json': ''
};

/**
 * Scaffold command options
 */
export interface ScaffoldOptions {
	/** Project name */
	name?: string;
	/** Output directory */
	outDir?: string;
	/** Database type */
	database?: 'sqlite' | 'postgres' | 'mysql';
	/** Whether to install dependencies */
	install?: boolean;
	/** Whether to initialize git */
	git?: boolean;
}

/**
 * Scaffold entity options
 */
export interface ScaffoldEntityOptions {
	/** Entity name */
	name: string;
	/** Output directory */
	outDir: string;
	/** Database table name */
	tableName?: string;
	/** Database type for migrations */
	dbType?: 'sqlite' | 'postgres' | 'mysql';
	/** Generate migration */
	migration?: boolean;
	/** Generate TypeScript interface */
	typescript?: boolean;
}

/**
 * Entity field definition
 */
export interface EntityField {
	/** Field name */
	name: string;
	/** Field type */
	type: string;
	/** Whether field is required */
	required: boolean;
	/** Default value */
	defaultValue?: any;
	/** Field description */
	description?: string;
}

/**
 * Scaffold command
 */
export class ScaffoldCommand {
	private logger: ConsoleLogger;
	private migrationGenerator: MigrationGenerator | null = null;

	/**
	 * Constructor
	 * @param db Optional database adapter for migrations
	 */
	constructor(private db?: DatabaseAdapter) {
		this.logger = new ConsoleLogger(true);
	}

	/**
	 * Scaffold a new project
	 * @param options Scaffold options
	 */
	async scaffoldProject(options: ScaffoldOptions = {}): Promise<void> {
		this.logger.info(chalk.blue('Scaffolding new project...'));

		// Get project name if not provided
		if (!options.name) {
			const answers = await inquirer.prompt([
				{
					type: 'input',
					name: 'name',
					message: 'Project name:',
					default: 'my-yaml-app'
				}
			]);
			options.name = answers.name;
		}

		// Get output directory if not provided
		if (!options.outDir) {
			options.outDir = options.name;
		}

		// Create project directory
		const projectDir = path.resolve(process.cwd(), options.outDir);

		// Check if directory exists
		if (fs.existsSync(projectDir)) {
			const { overwrite } = await inquirer.prompt([
				{
					type: 'confirm',
					name: 'overwrite',
					message: `Directory ${options.outDir} already exists. Continue?`,
					default: false
				}
			]);

			if (!overwrite) {
				this.logger.info(chalk.yellow('Project scaffolding cancelled.'));
				return;
			}
		} else {
			fs.mkdirSync(projectDir, { recursive: true });
		}

		// Get database type if not provided
		if (!options.database) {
			const { database } = await inquirer.prompt([
				{
					type: 'list',
					name: 'database',
					message: 'Select database type:',
					choices: [
						{ name: 'SQLite (recommended for development)', value: 'sqlite' },
						{ name: 'PostgreSQL', value: 'postgres' },
						{ name: 'MySQL', value: 'mysql' }
					],
					default: 'sqlite'
				}
			]);
			options.database = database;
		}

		// Ask for dependencies installation if not provided
		if (options.install === undefined) {
			const { install } = await inquirer.prompt([
				{
					type: 'confirm',
					name: 'install',
					message: 'Install dependencies?',
					default: true
				}
			]);
			options.install = install;
		}

		// Ask for git initialization if not provided
		if (options.git === undefined) {
			const { git } = await inquirer.prompt([
				{
					type: 'confirm',
					name: 'git',
					message: 'Initialize git repository?',
					default: true
				}
			]);
			options.git = git;
		}

		// Create project structure
		await this.createProjectStructure(projectDir, options);

		// Create configuration files
		await this.createConfigFiles(projectDir, options);

		// Create sample entity
		await this.createSampleEntity(projectDir, options);

		// Initialize git repository if requested
		if (options.git) {
			try {
				execSync('git init', { cwd: projectDir });
				fs.writeFileSync(path.join(projectDir, '.gitignore'), this.getGitignoreContent());
				this.logger.info(chalk.green('Git repository initialized.'));
			} catch (error: any) {
				this.logger.warn(`Failed to initialize git repository: ${error}`);
			}
		}

		// Install dependencies if requested
		if (options.install) {
			this.logger.info(chalk.blue('Installing dependencies...'));

			try {
				execSync('npm install', { cwd: projectDir, stdio: 'inherit' });
				this.logger.info(chalk.green('Dependencies installed.'));
			} catch (error: any) {
				this.logger.error(`Failed to install dependencies: ${error}`);
			}
		}

		this.logger.info(chalk.green(`Project ${options.name} created successfully.`));
		this.logger.info(`To start the development server, run:`);
		this.logger.info(chalk.blue(`  cd ${options.outDir}`));
		this.logger.info(chalk.blue('  npm run dev'));
	}

	/**
	 * Create project directory structure
	 * @param projectDir Project directory
	 * @param options Scaffold options
	 */
	private async createProjectStructure(projectDir: string, options: ScaffoldOptions): Promise<void> {
		this.logger.info('Creating project structure...');

		// Create directories
		this.createDirectoryStructure(projectDir, DEFAULT_STRUCTURE);

		this.logger.info(chalk.green('Project structure created.'));
	}

	/**
	 * Create directory structure recursively
	 * @param baseDir Base directory
	 * @param structure Directory structure
	 */
	private createDirectoryStructure(baseDir: string, structure: any): void {
		for (const [name, content] of Object.entries(structure)) {
			const itemPath = path.join(baseDir, name);

			if (typeof content === 'object') {
				// Create directory
				fs.mkdirSync(itemPath, { recursive: true });

				// Create subdirectories/files
				if (Object.keys(content).length > 0) {
					this.createDirectoryStructure(itemPath, content);
				}
			} else if (typeof content === 'string') {
				// Create file with content
				fs.writeFileSync(itemPath, content);
			}
		}
	}

	/**
	 * Create configuration files
	 * @param projectDir Project directory
	 * @param options Scaffold options
	 */
	private async createConfigFiles(projectDir: string, options: ScaffoldOptions): Promise<void> {
		this.logger.info('Creating configuration files...');

		// Create package.json
		fs.writeFileSync(
			path.join(projectDir, 'package.json'),
			this.getPackageJsonContent(options)
		);

		// Create tsconfig.json
		fs.writeFileSync(
			path.join(projectDir, 'tsconfig.json'),
			this.getTsConfigContent()
		);

		// Create app.yaml
		fs.writeFileSync(
			path.join(projectDir, 'app.yaml'),
			this.getAppYamlContent(options)
		);

		this.logger.info(chalk.green('Configuration files created.'));
	}

	/**
	 * Create a sample entity
	 * @param projectDir Project directory
	 * @param options Scaffold options
	 */
	private async createSampleEntity(projectDir: string, options: ScaffoldOptions): Promise<void> {
		this.logger.info('Creating sample entity...');

		// Create sample entity
		const entitiesDir = path.join(projectDir, 'src/entities');

		// Scaffold a User entity
		const userEntity: EntityConfig = {
			entity: 'User',
			table: 'users',
			idField: 'id',
			columns: [
				{
					logical: 'id',
					physical: 'id',
					primaryKey: true,
					autoIncrement: true,
					type: 'integer'
				},
				{
					logical: 'name',
					physical: 'name',
					type: 'string',
					nullable: false
				},
				{
					logical: 'email',
					physical: 'email',
					type: 'string',
					nullable: false,
					unique: true
				},
				{
					logical: 'password',
					physical: 'password',
					type: 'string',
					nullable: false
				},
				{
					logical: 'role',
					physical: 'role',
					type: 'string',
					nullable: false,
					comment: 'User role (admin, user)'
				},
				{
					logical: 'createdAt',
					physical: 'created_at',
					type: 'datetime',
					nullable: false
				},
				{
					logical: 'updatedAt',
					physical: 'updated_at',
					type: 'datetime',
					nullable: true
				}
			],
			api: {
				exposed: true,
				basePath: '/api/users',
				operations: {
					getAll: true,
					getById: true,
					create: true,
					update: true,
					delete: true
				},
				permissions: {
					getAll: ['admin'],
					getById: ['admin', 'user'],
					create: ['admin'],
					update: ['admin'],
					delete: ['admin']
				}
			},
			timestamps: {
				createdAt: 'createdAt',
				updatedAt: 'updatedAt'
			},
			hooks: {
				beforeCreate: [
					{
						name: 'hashPassword',
						implementation: `
async (entity, context) => {
  // In a real app, you would hash the password
  console.log('Hashing password for', entity.name);
  return entity;
}
            `,
					}
				]
			},
			validation: {
				rules: {
					name: [
						{ type: 'required', message: 'Name is required' },
						{ type: 'minLength', value: 2, message: 'Name must be at least 2 characters' }
					],
					email: [
						{ type: 'required', message: 'Email is required' },
						{ type: 'email', message: 'Invalid email format' }
					],
					password: [
						{ type: 'required', message: 'Password is required' },
						{ type: 'minLength', value: 8, message: 'Password must be at least 8 characters' }
					]
				}
			}
		};

		// Write entity YAML
		writeEntityYaml(userEntity, entitiesDir);

		// Create TypeScript interface
		const modelsDir = path.join(projectDir, 'src/models');
		const tsContent = `/**
 * User entity interface
 * Generated from YAML schema
 */
export interface User {
  id?: number;
  name: string;
  email: string;
  password: string;
  role: string;
  createdAt: Date;
  updatedAt?: Date;
}
`;
		fs.writeFileSync(path.join(modelsDir, 'user.ts'), tsContent);

		// Create index.ts in models directory
		fs.writeFileSync(
			path.join(modelsDir, 'index.ts'),
			`/**
 * Model exports
 */
export * from './user';
`
		);

		// Create migrations if database adapter is available
		if (this.db && options.database) {
			const migrationsDir = path.join(projectDir, 'src/migrations');

			this.migrationGenerator = new MigrationGenerator(
				options.database,
				migrationsDir,
				this.logger
			);

			this.migrationGenerator.generateCreateTableMigration(userEntity);
		}

		this.logger.info(chalk.green('Sample entity created.'));
	}

	/**
	 * Scaffold a new entity
	 * @param options Entity scaffold options
	 */
	async scaffoldEntity(options: ScaffoldEntityOptions): Promise<void> {
		this.logger.info(chalk.blue(`Scaffolding entity ${options.name}...`));

		if (!fs.existsSync(options.outDir)) {
			fs.mkdirSync(options.outDir, { recursive: true });
		}

		// Get entity fields
		const fields = await this.promptForEntityFields();

		// Create entity from fields
		const tableName = options.tableName || options.name.toLowerCase();

		const columns = [
			{
				logical: 'id',
				physical: 'id',
				primaryKey: true,
				autoIncrement: true,
				type: 'integer'
			}
		];

		// Add fields to columns
		for (const field of fields) {
			columns.push({
				logical: field.name,
				physical: this.camelToSnake(field.name),
				type: field.type,
				nullable: !field.required,
				comment: field.description
			});
		}

		// Add timestamp columns
		columns.push({
			logical: 'createdAt',
			physical: 'created_at',
			type: 'datetime',
			nullable: false
		});

		columns.push({
			logical: 'updatedAt',
			physical: 'updated_at',
			type: 'datetime',
			nullable: true
		});

		// Create entity config
		const entity: EntityConfig = {
			entity: options.name,
			table: tableName,
			idField: 'id',
			columns,
			api: {
				exposed: true,
				basePath: `/api/${tableName}`,
				operations: {
					getAll: true,
					getById: true,
					create: true,
					update: true,
					delete: true
				}
			},
			timestamps: {
				createdAt: 'createdAt',
				updatedAt: 'updatedAt'
			}
		};

		// Write entity YAML
		writeEntityYaml(entity, options.outDir);

		// Generate TypeScript interface if requested
		if (options.typescript) {
			const modelsDir = path.dirname(options.outDir) + '/models';
			if (!fs.existsSync(modelsDir)) {
				fs.mkdirSync(modelsDir, { recursive: true });
			}

			let tsContent = `/**
 * ${options.name} entity interface
 * Generated from YAML schema
 */
export interface ${options.name} {
  id?: number;
`;

			// Add fields to interface
			for (const field of fields) {
				const optional = field.required ? '' : '?';
				const tsType = this.mapTypeToTsType(field.type);

				if (field.description) {
					tsContent += `  /** ${field.description} */\n`;
				}

				tsContent += `  ${field.name}${optional}: ${tsType};\n`;
			}

			// Add timestamps
			tsContent += `  createdAt: Date;\n`;
			tsContent += `  updatedAt?: Date;\n`;
			tsContent += `}\n`;

			fs.writeFileSync(`${modelsDir}/${options.name.toLowerCase()}.ts`, tsContent);
		}

		// Generate migration if requested
		if (options.migration && options.dbType) {
			const migrationsDir = path.dirname(options.outDir) + '/migrations';
			if (!fs.existsSync(migrationsDir)) {
				fs.mkdirSync(migrationsDir, { recursive: true });
			}

			const migrationGenerator = new MigrationGenerator(
				options.dbType,
				migrationsDir,
				this.logger
			);

			migrationGenerator.generateCreateTableMigration(entity);
		}

		this.logger.info(chalk.green(`Entity ${options.name} created successfully.`));
	}

	/**
	 * Prompt for entity fields
	 * @returns Array of entity fields
	 */
	private async promptForEntityFields(): Promise<EntityField[]> {
		const fields: EntityField[] = [];

		const addFields = async () => {
			const { addField } = await inquirer.prompt([
				{
					type: 'confirm',
					name: 'addField',
					message: 'Add a field?',
					default: true
				}
			]);

			if (!addField) return;

			const { name } = await inquirer.prompt([
				{
					type: 'input',
					name: 'name',
					message: 'Field name:',
					validate: (input) => {
						if (!input) return 'Field name is required';
						if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(input)) {
							return 'Field name must start with a letter and contain only letters, numbers, and underscores';
						}
						if (fields.some(f => f.name === input)) {
							return 'Field name already exists';
						}
						return true;
					}
				}
			]);

			const { type } = await inquirer.prompt([
				{
					type: 'list',
					name: 'type',
					message: 'Field type:',
					choices: [
						{ name: 'String', value: 'string' },
						{ name: 'Integer', value: 'integer' },
						{ name: 'Number', value: 'number' },
						{ name: 'Boolean', value: 'boolean' },
						{ name: 'Date', value: 'date' },
						{ name: 'DateTime', value: 'datetime' },
						{ name: 'Text', value: 'text' },
						{ name: 'JSON', value: 'json' }
					],
					default: 'string'
				}
			]);

			const { required } = await inquirer.prompt([
				{
					type: 'confirm',
					name: 'required',
					message: 'Is this field required?',
					default: false
				}
			]);

			const { description } = await inquirer.prompt([
				{
					type: 'input',
					name: 'description',
					message: 'Field description (optional):',
					default: ''
				}
			]);

			fields.push({
				name,
				type,
				required,
				description: description || undefined
			});

			await addFields();
		};

		await addFields();
		return fields;
	}

	/**
	 * Convert camelCase to snake_case
	 * @param str String to convert
	 * @returns Converted string
	 */
	private camelToSnake(str: string): string {
		return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
	}

	/**
	 * Map database type to TypeScript type
	 * @param dbType Database type
	 * @returns TypeScript type
	 */
	private mapTypeToTsType(dbType: string): string {
		switch (dbType) {
			case 'string':
			case 'text':
				return 'string';
			case 'integer':
				return 'number';
			case 'number':
				return 'number';
			case 'boolean':
				return 'boolean';
			case 'date':
			case 'datetime':
				return 'Date';
			case 'json':
				return 'Record<string, any>';
			default:
				return 'any';
		}
	}

	/**
	 * Get package.json content
	 * @param options Scaffold options
	 * @returns package.json content
	 */
	private getPackageJsonContent(options: ScaffoldOptions): string {
		return JSON.stringify(
			{
				name: options.name,
				version: '0.1.0',
				description: 'A YAML-driven web application',
				main: 'dist/index.js',
				scripts: {
					'build': 'tsc',
					'start': 'node dist/index.js',
					'dev': 'ts-node-dev --respawn src/index.ts',
					'generate': 'ts-node src/cli/generate.ts',
					'migrate': 'ts-node src/cli/migrate.ts',
					'scaffold': 'ts-node src/cli/scaffold.ts'
				},
				dependencies: {
					'better-sqlite3': '^8.3.0',
					'cors': '^2.8.5',
					'express': '^4.18.2',
					'jsonwebtoken': '^9.0.0',
					'yaml': '^2.2.1',
					'ajv': '^8.12.0',
					'bcrypt': '^5.1.0'
				},
				devDependencies: {
					'@types/better-sqlite3': '^7.6.4',
					'@types/cors': '^2.8.13',
					'@types/express': '^4.17.17',
					'@types/jsonwebtoken': '^9.0.1',
					'@types/node': '^18.15.11',
					'ts-node': '^10.9.1',
					'ts-node-dev': '^2.0.0',
					'typescript': '^5.0.4'
				}
			},
			null,
			2
		);
	}

	/**
	 * Get tsconfig.json content
	 * @returns tsconfig.json content
	 */
	private getTsConfigContent(): string {
		return JSON.stringify(
			{
				compilerOptions: {
					target: 'ES2020',
					module: 'CommonJS',
					lib: ['ES2020'],
					declaration: true,
					outDir: './dist',
					rootDir: './src',
					strict: true,
					esModuleInterop: true,
					skipLibCheck: true,
					forceConsistentCasingInFileNames: true,
					resolveJsonModule: true
				},
				include: ['src/**/*'],
				exclude: ['node_modules', 'dist']
			},
			null,
			2
		);
	}

	/**
	 * Get app.yaml content
	 * @param options Scaffold options
	 * @returns app.yaml content
	 */
	private getAppYamlContent(options: ScaffoldOptions): string {
		const dbConfig = this.getDatabaseConfig(options.database || 'sqlite');

		return `# Application configuration
name: ${options.name}
version: '0.1.0'
port: 3000
apiBasePath: '/api'

# Database configuration
database:
  type: '${options.database || 'sqlite'}'
  connection:
    ${dbConfig}
  synchronize: true

# Entities configuration
entitiesDir: 'src/entities'

# Production flag
production: false
`;
	}

	/**
	 * Get database configuration for app.yaml
	 * @param dbType Database type
	 * @returns Database configuration YAML
	 */
	private getDatabaseConfig(dbType: string): string {
		switch (dbType) {
			case 'sqlite':
				return `filename: './.data/app.db'`;
			case 'postgres':
				return `host: 'localhost'
    port: 5432
    database: '${dbType}_db'
    user: 'postgres'
    password: 'postgres'`;
			case 'mysql':
				return `host: 'localhost'
    port: 3306
    database: '${dbType}_db'
    user: 'root'
    password: 'root'`;
			default:
				return `filename: './.data/app.db'`;
		}
	}

	/**
	 * Get .gitignore content
	 * @returns .gitignore content
	 */
	private getGitignoreContent(): string {
		return `# Dependency directories
node_modules/

# Build outputs
dist/
build/

# Logs
logs/
*.log
npm-debug.log*

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Database files
*.db
*.sqlite
.data/

# Editor directories and files
.idea/
.vscode/
*.swp
*.swo
`;
	}
}

/**
 * Create a new scaffold command
 * @param db Optional database adapter for migrations
 * @returns Scaffold command instance
 */
export function createScaffoldCommand(db?: DatabaseAdapter): ScaffoldCommand {
	return new ScaffoldCommand(db);
}