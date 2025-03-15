/**
 * Scaffold Command
 * Creates new projects and generates entity scaffolding
 */

import * as fs from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { Command } from 'commander';
import { Logger } from '@/core/types';
import { EntityConfig, ColumnMapping, EntityAction, EntityHook, ComputedProperty } from '@/entity/entity-config';
import { scaffoldEntity, writeEntityYaml } from '@/entity/yaml-generator';
import { DatabaseAdapter } from '@/database/core/types';
import { MigrationGenerator } from '@/database/migration-generator';
import { generateEntityInterface } from '@/entity/entity-schema';
import { createInMemoryConfig } from '@/database/adapter-factory';

/**
 * Default project structure
 */
const DEFAULT_STRUCTURE = {
	'src': {
		'entities': {},
		'models': {},
		'hooks': {},
		'actions': {},
		'migrations': {},
		'adapters': {},
		'plugins': {},
		'public': {
			'css': {},
			'js': {}
		}
	},
	'config': {},
	'tests': {
		'unit': {},
		'integration': {}
	},
	'app.yaml': '',
	'tsconfig.json': '',
	'package.json': '',
	'README.md': ''
};

/**
 * Register scaffold commands
 * @param program Commander program
 * @param logger Logger instance
 */
export function registerScaffoldCommands(program: Command, logger: Logger) {
	const scaffold = program
		.command('scaffold')
		.description('Scaffold new projects or entities');

	// Scaffold new project
	scaffold
		.command('project [name]')
		.description('Scaffold a new project')
		.option('-o, --out-dir <directory>', 'Output directory (defaults to project name)')
		.option('-d, --database <type>', 'Database type (sqlite, postgres, mysql)', 'sqlite')
		.option('-i, --install', 'Install dependencies after scaffolding', false)
		.option('-g, --git', 'Initialize git repository', true)
		.option('-a, --adapters <adapters>', 'Include adapters (comma-separated)', 'netlify')
		.option('-p, --plugins <plugins>', 'Include plugins (comma-separated)', '')
		.action(async (name, options) => {
			try {
				const scaffoldCmd = new ScaffoldCommand(logger);
				await scaffoldCmd.scaffoldProject({
					name,
					outDir: options.outDir,
					database: options.database,
					install: options.install,
					git: options.git,
					adapters: options.adapters ? options.adapters.split(',') : [],
					plugins: options.plugins ? options.plugins.split(',') : []
				});
			} catch (error: any) {
				logger.error(`Error scaffolding project: ${error.message}`);
			}
		});

	// Scaffold entity
	scaffold
		.command('entity <name>')
		.description('Scaffold a new entity')
		.option('-t, --table <tableName>', 'Database table name')
		.option('-o, --out-dir <directory>', 'Output directory', 'src/entities')
		.option('-d, --db-type <type>', 'Database type for migrations', 'sqlite')
		.option('-m, --migration', 'Generate migration', false)
		.option('-ts, --typescript', 'Generate TypeScript interface', true)
		.option('-i, --interactive', 'Use interactive mode', true)
		.action(async (name, options) => {
			try {
				const scaffoldCmd = new ScaffoldCommand(logger);
				await scaffoldCmd.scaffoldEntity({
					name,
					outDir: options.outDir,
					tableName: options.table,
					dbType: options.dbType,
					migration: options.migration,
					typescript: options.typescript,
					interactive: options.interactive
				});
			} catch (error: any) {
				logger.error(`Error scaffolding entity: ${error.message}`);
			}
		});

	return scaffold;
}

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
	/** Adapters to include */
	adapters?: string[];
	/** Plugins to include */
	plugins?: string[];
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
	/** Use interactive mode */
	interactive?: boolean;
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
	/** API access configuration */
	api?: {
		readable?: boolean;
		writable?: boolean;
	};
}

/**
 * Scaffold command
 */
export class ScaffoldCommand {
	private logger: Logger;
	private migrationGenerator: MigrationGenerator | null = null;

	/**
	 * Constructor
	 * @param logger Logger instance
	 * @param db Optional database adapter for migrations
	 */
	constructor(logger: Logger, private db?: DatabaseAdapter) {
		this.logger = logger;
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

		// Get adapters if not provided
		if (!options.adapters || options.adapters.length === 0) {
			const { adapters } = await inquirer.prompt([
				{
					type: 'checkbox',
					name: 'adapters',
					message: 'Select adapters to include:',
					choices: [
						{ name: 'Netlify Functions', value: 'netlify', checked: true },
						{ name: 'AWS Lambda', value: 'aws' },
						{ name: 'Azure Functions', value: 'azure' }
					]
				}
			]);
			options.adapters = adapters;
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
				this.logger.warn(`Failed to initialize git repository: ${error.message}`);
			}
		}

		// Install dependencies if requested
		if (options.install) {
			this.logger.info(chalk.blue('Installing dependencies...'));

			try {
				execSync('npm install', { cwd: projectDir, stdio: 'inherit' });
				this.logger.info(chalk.green('Dependencies installed.'));
			} catch (error: any) {
				this.logger.error(`Failed to install dependencies: ${error.message}`);
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

		// Create base structure
		this.createDirectoryStructure(projectDir, DEFAULT_STRUCTURE);

		// Create adapter-specific directories if needed
		if (options.adapters && options.adapters.length > 0) {
			for (const adapter of options.adapters) {
				if (adapter === 'netlify') {
					const netlifyDir = path.join(projectDir, 'netlify', 'functions');
					fs.mkdirSync(netlifyDir, { recursive: true });
				} else if (adapter === 'aws') {
					const awsDir = path.join(projectDir, 'aws', 'lambda');
					fs.mkdirSync(awsDir, { recursive: true });
				} else if (adapter === 'azure') {
					const azureDir = path.join(projectDir, 'azure', 'functions');
					fs.mkdirSync(azureDir, { recursive: true });
				}
			}
		}

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

		// Create README.md
		fs.writeFileSync(
			path.join(projectDir, 'README.md'),
			this.getReadmeContent(options)
		);

		// Create adapter configuration files if needed
		if (options.adapters && options.adapters.length > 0) {
			if (options.adapters.includes('netlify')) {
				fs.writeFileSync(
					path.join(projectDir, 'netlify.toml'),
					this.getNetlifyTomlContent()
				);
			}

			if (options.adapters.includes('aws')) {
				fs.writeFileSync(
					path.join(projectDir, 'serverless.yml'),
					this.getServerlessYamlContent(options)
				);
			}
		}

		this.logger.info(chalk.green('Configuration files created.'));
	}

	/**
	 * Get package.json content
	 * @param options Scaffold options
	 * @returns package.json content
	 */
	private getPackageJsonContent(options: ScaffoldOptions): string {
		// Determine dependencies based on database type and adapters
		const dependencies: Record<string, string> = {
			'express': '^4.18.2',
			'cors': '^2.8.5',
			'yamlapp': '^1.0.0',
			'js-yaml': '^4.1.0',
			'jsonwebtoken': '^9.0.0',
			'ajv': '^8.12.0',
			'bcrypt': '^5.1.0',
			'compression': '^1.7.4',
			'helmet': '^7.0.0'
		};

		// Add database dependencies
		if (options.database === 'sqlite') {
			dependencies['better-sqlite3'] = '^8.3.0';
		} else if (options.database === 'postgres') {
			dependencies['pg'] = '^8.11.0';
		} else if (options.database === 'mysql') {
			dependencies['mysql2'] = '^3.3.0';
		}

		// Add adapter dependencies
		if (options.adapters?.includes('netlify')) {
			dependencies['@netlify/functions'] = '^1.6.0';
		}

		if (options.adapters?.includes('aws')) {
			dependencies['aws-lambda'] = '^1.0.7';
			dependencies['serverless'] = '^3.30.1';
		}

		const devDependencies: Record<string, string> = {
			'typescript': '^5.0.4',
			'ts-node': '^10.9.1',
			'ts-node-dev': '^2.0.0',
			'@types/express': '^4.17.17',
			'@types/cors': '^2.8.13',
			'@types/node': '^18.15.11',
			'@types/jsonwebtoken': '^9.0.1',
			'jest': '^29.5.0',
			'@types/jest': '^29.5.0',
			'supertest': '^6.3.3',
			'@types/supertest': '^2.0.12'
		};

		// Add database-specific dev dependencies
		if (options.database === 'sqlite') {
			devDependencies['@types/better-sqlite3'] = '^7.6.4';
		} else if (options.database === 'postgres') {
			devDependencies['@types/pg'] = '^8.6.6';
		} else if (options.database === 'mysql') {
			devDependencies['@types/mysql'] = '^2.15.21';
		}

		// Add adapter-specific dev dependencies
		if (options.adapters?.includes('netlify')) {
			devDependencies['@types/netlify-lambda'] = '^1.4.0';
		}

		if (options.adapters?.includes('aws')) {
			devDependencies['@types/aws-lambda'] = '^8.10.115';
		}

		return JSON.stringify(
			{
				name: options.name,
				version: '0.1.0',
				description: `${options.name} - A YAML-driven web application`,
				main: 'dist/index.js',
				scripts: {
					'build': 'tsc',
					'start': 'node dist/index.js',
					'dev': 'ts-node-dev --respawn src/index.ts',
					'test': 'jest',
					'generate': 'npx yamlapp generate',
					'scaffold': 'npx yamlapp scaffold',
					'migration:generate': 'npx yamlapp migration create',
					'migration:run': 'npx yamlapp migration run'
				},
				dependencies,
				devDependencies
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
					resolveJsonModule: true,
					baseUrl: '.',
					paths: {
						'@/*': ['src/*']
					}
				},
				include: ['src/**/*'],
				exclude: ['node_modules', 'dist', '**/*.test.ts']
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

		// Create list of adapters
		const adaptersConfig = options.adapters && options.adapters.length > 0
			? `
	# Adapters configuration
	adapters:
	  default: ${options.adapters[0]}
	  config:
	${options.adapters.map(adapter => `    ${adapter}:
		  type: ${adapter}
		  enabled: true
		  outputDir: ${adapter === 'netlify' ? './netlify/functions' : `./${adapter}/functions`}
		  options:
			typescript: true`).join('\n')}`
			: '';

		return `# Application configuration
	name: ${options.name}
	version: '0.1.0'
	port: 3000
	apiBasePath: '/api'
	
	# Database configuration
	database:
	  type: '${options.database || 'sqlite'}'${dbConfig}
	  synchronize: true
	
	# Entities configuration
	entitiesDir: 'src/entities'
	
	# Auth configuration
	auth:
	  provider: 'jwt'
	  secret: \${JWT_SECRET}
	  tokenExpiry: '24h'
	  refreshTokenExpiry: '7d'
	  userEntity: 'User'
	  roles:
		- name: 'admin'
		  description: 'Administrator with full access'
		- name: 'user'
		  description: 'Standard user'
		  
	# CORS configuration
	cors:
	  origin: '*'
	  methods: 'GET,POST,PUT,DELETE,PATCH,OPTIONS'
	  
	# Logging configuration
	logging:
	  level: 'info'
	  console: true
	  file: './logs/app.log'${adaptersConfig}
	
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
				return `
	  connection:
		filename: './.data/app.db'`;
			case 'postgres':
				return `
	  connection:
		host: 'localhost'
		port: 5432
		database: '${dbType}_db'
		username: 'postgres'
		password: 'postgres'`;
			case 'mysql':
				return `
	  connection:
		host: 'localhost'
		port: 3306
		database: '${dbType}_db'
		username: 'root'
		password: 'root'`;
			default:
				return `
	  connection:
		filename: './.data/app.db'`;
		}
	}

	/**
	 * Get README.md content
	 * @param options Scaffold options
	 * @returns README.md content
	 */
	private getReadmeContent(options: ScaffoldOptions): string {
		return `# ${options.name}
	
	YAML-driven web application.
	
	## Quick Start
	
	\`\`\`
	npm install
	npm run dev
	\`\`\`
	
	## Project Structure
	
	- \`src/entities/\`: Entity definitions (YAML)
	- \`src/models/\`: TypeScript interfaces for entities
	- \`src/hooks/\`: Entity lifecycle hooks
	- \`src/actions/\`: Custom entity actions
	- \`src/migrations/\`: Database migrations
	- \`src/public/\`: Static assets
	
	## Available Commands
	
	- \`npm run dev\`: Start development server
	- \`npm run build\`: Build the application
	- \`npm run start\`: Start the production server
	- \`npm run test\`: Run tests
	- \`npm run generate\`: Generate code from YAML
	- \`npm run scaffold\`: Scaffold new components
	- \`npm run migration:generate\`: Generate database migrations
	- \`npm run migration:run\`: Run database migrations
	
	## Database
	
	This project uses ${options.database || 'SQLite'} for data storage.
	
	## API Documentation
	
	API documentation is automatically generated from your entity definitions.
	
	## License
	
	MIT
	`;
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
	.netlify/
	
	# Logs
	logs/
	*.log
	npm-debug.log*
	yarn-debug.log*
	yarn-error.log*
	
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
	
	# OS-specific files
	.DS_Store
	Thumbs.db
	`;
	}

	/**
	 * Get netlify.toml content
	 * @returns netlify.toml content
	 */
	private getNetlifyTomlContent(): string {
		return `[build]
	  command = "npm run build"
	  publish = "public"
	  functions = "netlify/functions"
	
	[dev]
	  command = "npm run dev"
	  port = 8888
	  targetPort = 3000
	  publish = "public"
	  autoLaunch = true
	  framework = "#custom"
	
	[[redirects]]
	  from = "/api/*"
	  to = "/.netlify/functions/:splat"
	  status = 200
	`;
	}

	/**
	 * Get serverless.yml content
	 * @param options Scaffold options
	 * @returns serverless.yml content
	 */
	private getServerlessYamlContent(options: ScaffoldOptions): string {
		return `service: ${options.name}
	
	provider:
	  name: aws
	  runtime: nodejs18.x
	  stage: \${opt:stage, 'dev'}
	  region: \${opt:region, 'us-east-1'}
	  environment:
		NODE_ENV: \${opt:stage, 'dev'}
		JWT_SECRET: \${env:JWT_SECRET, 'change-this-in-production'}
	
	functions:
	  api:
		handler: dist/serverless.handler
		events:
		  - http:
			  path: /api/{proxy+}
			  method: any
			  cors: true
	
	plugins:
	  - serverless-offline
	`;
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
					type: 'integer',
					api: {
						readable: true,
						writable: false
					}
				},
				{
					logical: 'name',
					physical: 'name',
					type: 'string',
					nullable: false,
					api: {
						readable: true,
						writable: true
					}
				},
				{
					logical: 'email',
					physical: 'email',
					type: 'string',
					nullable: false,
					unique: true,
					api: {
						readable: true,
						writable: true
					}
				},
				{
					logical: 'password',
					physical: 'password',
					type: 'string',
					nullable: false,
					api: {
						readable: false,
						writable: true
					}
				},
				{
					logical: 'role',
					physical: 'role',
					type: 'string',
					nullable: false,
					comment: 'User role (admin, user)',
					api: {
						readable: true,
						writable: false
					}
				},
				{
					logical: 'createdAt',
					physical: 'created_at',
					type: 'datetime',
					nullable: false,
					api: {
						readable: true,
						writable: false
					}
				},
				{
					logical: 'updatedAt',
					physical: 'updated_at',
					type: 'datetime',
					nullable: true,
					api: {
						readable: true,
						writable: false
					}
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
					update: ['admin', 'user'],
					delete: ['admin']
				}
			},
			timestamps: {
				createdAt: 'createdAt',
				updatedAt: 'updatedAt'
			},
			computed: [
				{
					name: 'fullName',
					dependencies: ['name'],
					implementation: `
	(entity) => {
	  return entity.name || '';
	}
			  `,
					description: 'User full name',
					exposeInApi: true
				}
			],
			hooks: {
				beforeCreate: [
					{
						name: 'hashPassword',
						implementation: `
	async (entity, context) => {
	  if (entity.password) {
		// In a real app, you would hash the password with bcrypt
		// const bcrypt = require('bcrypt');
		// entity.password = await bcrypt.hash(entity.password, 10);
		console.log('Hashing password for', entity.name);
	  }
	  return entity;
	}
				`,
						priority: 10
					}
				],
				afterCreate: [
					{
						name: 'logUserCreation',
						implementation: `
	async (entity, context) => {
	  context.logger?.info(\`Created user: \${entity.email}\`);
	  return entity;
	}
				`,
						priority: 10
					}
				]
			},
			actions: [
				{
					name: 'login',
					description: 'User login',
					implementation: `
	async (params, context) => {
	  const { email, password } = params;
	  
	  // In a real app, you would validate credentials here
	  // const user = await context.getEntityManager().findOneBy({ email });
	  // if (!user) { throw new Error('User not found'); }
	  
	  // const bcrypt = require('bcrypt');
	  // const valid = await bcrypt.compare(password, user.password);
	  // if (!valid) { throw new Error('Invalid password'); }
	  
	  return {
		success: true,
		message: 'Login successful'
	  };
	}
			  `,
					httpMethod: 'POST',
					route: '/login',
					roles: ['public']
				},
				{
					name: 'resetPassword',
					description: 'Reset user password',
					implementation: `
	async (params, context) => {
	  const { email } = params;
	  
	  // In a real app, you would generate a reset token and send an email
	  
	  return {
		success: true,
		message: 'Password reset email sent'
	  };
	}
			  `,
					httpMethod: 'POST',
					route: '/reset-password',
					roles: ['public']
				}
			],
			validation: {
				rules: {
					name: [
						{ type: 'required', message: 'Name is required' },
						{ type: 'minLength', value: 2, message: 'Name must be at least 2 characters' }
					],
					email: [
						{ type: 'required', message: 'Email is required' },
						{ type: 'email', message: 'Invalid email format' },
						{ type: 'custom', message: 'Email must be unique', implementation: 'isEmailUnique' }
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
	  /**
	   * User ID
	   */
	  id?: number;
	  
	  /**
	   * User's name
	   */
	  name: string;
	  
	  /**
	   * User's email address
	   */
	  email: string;
	  
	  /**
	   * User's password (hashed)
	   */
	  password: string;
	  
	  /**
	   * User role (admin, user)
	   */
	  role: string;
	  
	  /**
	   * User's full name (computed)
	   */
	  fullName?: string;
	  
	  /**
	   * Creation timestamp
	   */
	  createdAt: Date;
	  
	  /**
	   * Last update timestamp
	   */
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

		// Create sample hook for password hashing
		const hooksDir = path.join(projectDir, 'src/hooks');
		fs.writeFileSync(
			path.join(hooksDir, 'user-hooks.ts'),
			`/**
	 * User entity hooks
	 */
	import bcrypt from 'bcrypt';
	import { HookContext } from '@/core/types';
	
	/**
	 * Hash password before user creation
	 */
	export async function hashPasswordHook(entity: any, context: HookContext): Promise<any> {
	  if (entity.password) {
		// Hash password using bcrypt
		entity.password = await bcrypt.hash(entity.password, 10);
	  }
	  return entity;
	}
	
	/**
	 * Log user creation
	 */
	export async function logUserCreationHook(entity: any, context: HookContext): Promise<any> {
	  context.logger?.info(\`Created user \${entity.email} with ID \${entity.id}\`);
	  return entity;
	}
	
	/**
	 * Validate unique email
	 */
	export async function isEmailUnique(value: string, entity: any, context: HookContext): Promise<boolean> {
	  const userManager = context.getEntityManager();
	  const existingUser = await userManager.findOneBy({ email: value });
	  
	  // If we're updating, exclude the current user
	  if (entity.id && existingUser && existingUser.id === entity.id) {
		return true;
	  }
	  
	  return !existingUser;
	}
	`
		);

		// Create sample action for user login
		const actionsDir = path.join(projectDir, 'src/actions');
		fs.writeFileSync(
			path.join(actionsDir, 'user-actions.ts'),
			`/**
	 * User entity actions
	 */
	import bcrypt from 'bcrypt';
	import { HookContext } from '@/core/types';
	
	/**
	 * User login action
	 */
	export async function login(params: any, context: HookContext): Promise<any> {
	  const { email, password } = params;
	  
	  // Get user by email
	  const userManager = context.getEntityManager();
	  const user = await userManager.findOneBy({ email });
	  
	  if (!user) {
		throw new Error('Invalid email or password');
	  }
	  
	  // Compare password
	  const valid = await bcrypt.compare(password, user.password);
	  if (!valid) {
		throw new Error('Invalid email or password');
	  }
	  
	  // Get auth service
	  const authService = context.getService('auth');
	  
	  // Generate JWT token
	  const token = authService.generateToken({
		user_id: user.id,
		email: user.email,
		role: user.role
	  });
	  
	  return {
		success: true,
		token,
		user: {
		  id: user.id,
		  name: user.name,
		  email: user.email,
		  role: user.role
		}
	  };
	}
	
	/**
	 * Reset password action
	 */
	export async function resetPassword(params: any, context: HookContext): Promise<any> {
	  const { email } = params;
	  
	  // Get user by email
	  const userManager = context.getEntityManager();
	  const user = await userManager.findOneBy({ email });
	  
	  if (!user) {
		// Don't reveal if user exists or not
		return {
		  success: true,
		  message: 'If your email is registered, you will receive a password reset link'
		};
	  }
	  
	  // In a real app, generate reset token and send email
	  // For now, just log it
	  context.logger?.info(\`Password reset requested for \${email}\`);
	  
	  return {
		success: true,
		message: 'If your email is registered, you will receive a password reset link'
	  };
	}
	`
		);

		// Create migrations if database adapter is available
		const migrationsDir = path.join(projectDir, 'src/migrations');

		if (options.database) {
			this.migrationGenerator = new MigrationGenerator(
				options.database,
				migrationsDir,
				this.logger
			);

			this.migrationGenerator.generateCreateTableMigration(
				userEntity,
				'create_users_table'
			);
		}

		this.logger.info(chalk.green('Sample entity created.'));

		// Add sample API for specified adapters
		if (options.adapters && options.adapters.length > 0) {
			for (const adapter of options.adapters) {
				if (adapter === 'netlify') {
					const netlifyFunctionsDir = path.join(projectDir, 'netlify', 'functions');

					// Create User endpoint for Netlify
					fs.writeFileSync(
						path.join(netlifyFunctionsDir, 'users.js'),
						this.getNetlifyFunctionTemplate('users')
					);

					// Create auth endpoint for Netlify
					fs.writeFileSync(
						path.join(netlifyFunctionsDir, 'auth.js'),
						this.getNetlifyAuthFunctionTemplate()
					);

					this.logger.info(chalk.green('Created Netlify function handlers.'));
				}
			}
		}
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

		if (options.interactive) {
			// Interactive entity generation
			await this.scaffoldEntityInteractive(options);
		} else {
			// Non-interactive entity generation
			await this.scaffoldEntitySimple(options);
		}
	}

	/**
	 * Scaffold entity in interactive mode
	 * @param options Entity scaffold options
	 */
	private async scaffoldEntityInteractive(options: ScaffoldEntityOptions): Promise<void> {
		const name = options.name.charAt(0).toUpperCase() + options.name.slice(1).toLowerCase();
		const tableName = options.tableName || name.toLowerCase() + 's';

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
			this.logger.info('Add fields to the entity (leave field name empty to finish):');
			await this.promptForFields(columns);

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
				this.logger.info('Add computed properties (leave name empty to finish):');
				await this.promptForComputedProperties(computed, columns);
			}

			// Add hooks if requested
			if (entityInfo.addHooks) {
				this.logger.info('Add lifecycle hooks:');
				await this.promptForHooks(hooks);
			}

			// Add actions if requested
			if (entityInfo.addActions) {
				this.logger.info('Add custom actions (leave name empty to finish):');
				await this.promptForActions(actions);
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
			const yamlPath = path.join(options.outDir, `${entityInfo.name.toLowerCase()}.yaml`);
			fs.writeFileSync(yamlPath, JSON.stringify(entity, null, 2), 'utf8');

			this.logger.info(`Generated entity: ${chalk.green(yamlPath)}`);

			// Generate TypeScript interface if requested
			if (options.typescript) {
				const modelDir = path.resolve(process.cwd(), './src/models');
				if (!fs.existsSync(modelDir)) {
					fs.mkdirSync(modelDir, { recursive: true });
				}

				const interfaceContent = generateEntityInterface(entity);
				const modelPath = path.join(modelDir, `${entityInfo.name.toLowerCase()}.ts`);

				fs.writeFileSync(modelPath, interfaceContent, 'utf8');
				this.logger.info(`Generated model: ${chalk.green(modelPath)}`);
			}

			// Generate migration if requested
			if (options.migration && options.dbType) {
				const migrationsDir = path.resolve(process.cwd(), './src/migrations');
				if (!fs.existsSync(migrationsDir)) {
					fs.mkdirSync(migrationsDir, { recursive: true });
				}

				this.migrationGenerator = new MigrationGenerator(
					options.dbType,
					migrationsDir,
					this.logger
				);

				const migrationFilename = this.migrationGenerator.generateCreateTableMigration(
					entity,
					`create_${entity.table}_table`
				);

				this.logger.info(`Generated migration: ${chalk.green(migrationFilename)}`);
			}
		} catch (error: any) {
			this.logger.error(`Error in interactive entity generation: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Scaffold entity in simple mode
	 * @param options Entity scaffold options
	 */
	private async scaffoldEntitySimple(options: ScaffoldEntityOptions): Promise<void> {
		const name = options.name.charAt(0).toUpperCase() + options.name.slice(1).toLowerCase();
		const tableName = options.tableName || name.toLowerCase() + 's';

		// Create basic entity structure
		const entity: EntityConfig = {
			entity: name,
			table: tableName,
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
					logical: 'description',
					physical: 'description',
					type: 'text',
					nullable: true
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
			},
			timestamps: {
				createdAt: 'createdAt',
				updatedAt: 'updatedAt'
			}
		};

		// Write entity YAML
		const yamlPath = path.join(options.outDir, `${name.toLowerCase()}.yaml`);
		fs.writeFileSync(yamlPath, JSON.stringify(entity, null, 2), 'utf8');

		this.logger.info(`Generated entity: ${chalk.green(yamlPath)}`);

		// Generate TypeScript interface if requested
		if (options.typescript) {
			const modelDir = path.resolve(process.cwd(), './src/models');
			if (!fs.existsSync(modelDir)) {
				fs.mkdirSync(modelDir, { recursive: true });
			}

			const interfaceContent = generateEntityInterface(entity);
			const modelPath = path.join(modelDir, `${name.toLowerCase()}.ts`);

			fs.writeFileSync(modelPath, interfaceContent, 'utf8');
			this.logger.info(`Generated model: ${chalk.green(modelPath)}`);
		}

		// Generate migration if requested
		if (options.migration && options.dbType) {
			const migrationsDir = path.resolve(process.cwd(), './src/migrations');
			if (!fs.existsSync(migrationsDir)) {
				fs.mkdirSync(migrationsDir, { recursive: true });
			}

			this.migrationGenerator = new MigrationGenerator(
				options.dbType,
				migrationsDir,
				this.logger
			);

			const migrationFilename = this.migrationGenerator.generateCreateTableMigration(
				entity,
				`create_${entity.table}_table`
			);

			this.logger.info(`Generated migration: ${chalk.green(migrationFilename)}`);
		}
	}

	/**
	 * Prompt for entity fields
	 * @param columns Array to collect column mappings
	 */
	private async promptForFields(columns: ColumnMapping[]): Promise<void> {
		const addField = async () => {
			const { name } = await inquirer.prompt([
				{
					type: 'input',
					name: 'name',
					message: 'Field name (empty to finish):',
					validate: (input) => {
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
					message: 'Description (optional):'
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
				physical: this.camelToSnake(name),
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
	private camelToSnake(str: string): string {
		return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
	}

	/**
	 * Prompt for computed properties
	 * @param computed Array to collect computed properties
	 * @param columns Available columns to use as dependencies
	 */
	private async promptForComputedProperties(
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
	private async promptForHooks(hooks: Record<string, EntityHook[]>): Promise<void> {
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
	private async promptForActions(actions: EntityAction[]): Promise<void> {
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
	 * Get Netlify function template for an entity
	 * @param entityName Entity name
	 * @returns Netlify function code
	 */
	private getNetlifyFunctionTemplate(entityName: string): string {
		return `// Netlify function handler for ${entityName}
	const { verifyToken } = require('../utils/auth-middleware');
	const { CORS_HEADERS } = require('../types');
	
	exports.handler = async (event, context) => {
	  // Handle OPTIONS request for CORS
	  if (event.httpMethod === "OPTIONS") {
		return {
		  statusCode: 200,
		  headers: CORS_HEADERS,
		  body: ""
		};
	  }
	
	  // Authenticate request (skip for GET requests which might be public)
	  let user = null;
	  if (event.httpMethod !== "GET") {
		const authResult = await verifyToken(event);
		if (authResult.isError) {
		  return authResult;
		}
		user = authResult.user;
		event = authResult;
	  }
	
	  try {
		// Parse path to extract ID if present
		const path = event.path.split('/');
		const id = path[path.length - 1] !== "${entityName}" ? path[path.length - 1] : null;
		
		// Handle different HTTP methods
		switch(event.httpMethod) {
		  case "GET":
			return id ? getById(id, event) : getAll(event);
		  case "POST":
			return create(event, user);
		  case "PUT":
			return update(id, event, user);
		  case "DELETE":
			return remove(id, event, user);
		  default:
			return {
			  statusCode: 405,
			  headers: CORS_HEADERS,
			  body: JSON.stringify({ message: "Method not allowed" })
			};
		}
	  } catch (error) {
		return {
		  statusCode: 500,
		  headers: CORS_HEADERS,
		  body: JSON.stringify({
			message: "Server error",
			error: error.message
		  })
		};
	  }
	};
	
	// Get all records
	async function getAll(event) {
	  // Implementation
	  return {
		statusCode: 200,
		headers: CORS_HEADERS,
		body: JSON.stringify({
		  data: [
			{ id: 1, name: "Example 1" },
			{ id: 2, name: "Example 2" }
		  ]
		})
	  };
	}
	
	// Get record by ID
	async function getById(id, event) {
	  // Implementation
	  return {
		statusCode: 200,
		headers: CORS_HEADERS,
		body: JSON.stringify({
		  data: { id: parseInt(id), name: "Example " + id }
		})
	  };
	}
	
	// Create record
	async function create(event, user) {
	  const data = JSON.parse(event.body);
	  
	  // Implementation
	  return {
		statusCode: 201,
		headers: CORS_HEADERS,
		body: JSON.stringify({
		  message: "Created successfully",
		  data: { id: 3, ...data }
		})
	  };
	}
	
	// Update record
	async function update(id, event, user) {
	  const data = JSON.parse(event.body);
	  
	  // Implementation
	  return {
		statusCode: 200,
		headers: CORS_HEADERS,
		body: JSON.stringify({
		  message: "Updated successfully",
		  data: { id: parseInt(id), ...data }
		})
	  };
	}
	
	// Delete record
	async function remove(id, event, user) {
	  // Implementation
	  return {
		statusCode: 200,
		headers: CORS_HEADERS,
		body: JSON.stringify({
		  message: "Deleted successfully",
		  id: parseInt(id)
		})
	  };
	}
	`;
	}

	/**
	 * Get Netlify auth function template
	 * @returns Netlify auth function code
	 */
	private getNetlifyAuthFunctionTemplate(): string {
		return `// Netlify function handler for authentication
	const jwt = require('jsonwebtoken');
	const { CORS_HEADERS } = require('../types');
	
	// JWT secret from environment variables or configuration
	const JWT_SECRET = process.env.JWT_SECRET || "change-this-in-production";
	
	exports.handler = async (event, context) => {
	  // Handle OPTIONS request for CORS
	  if (event.httpMethod === "OPTIONS") {
		return {
		  statusCode: 200,
		  headers: CORS_HEADERS,
		  body: ""
		};
	  }
	
	  try {
		// Only accept POST requests
		if (event.httpMethod !== "POST") {
		  return {
			statusCode: 405,
			headers: CORS_HEADERS,
			body: JSON.stringify({ message: "Method not allowed" })
		  };
		}
	
		const data = JSON.parse(event.body);
		const { action } = data;
	
		// Handle different auth actions
		switch(action) {
		  case "login":
			return handleLogin(data);
		  case "register":
			return handleRegister(data);
		  case "reset-password":
			return handleResetPassword(data);
		  default:
			return {
			  statusCode: 400,
			  headers: CORS_HEADERS,
			  body: JSON.stringify({ message: "Invalid action" })
			};
		}
	  } catch (error) {
		return {
		  statusCode: 500,
		  headers: CORS_HEADERS,
		  body: JSON.stringify({
			message: "Server error",
			error: error.message
		  })
		};
	  }
	};
	
	// Handle login
	async function handleLogin(data) {
	  const { email, password } = data;
	  
	  // In a real app, validate credentials against database
	  // For example purposes, just check hardcoded values
	  if (email === "admin@example.com" && password === "password") {
		// Generate JWT token
		const token = jwt.sign(
		  { 
			user_id: 1,
			email: email,
			role: "admin",
			name: "Administrator"
		  }, 
		  JWT_SECRET, 
		  { expiresIn: '24h' }
		);
		
		return {
		  statusCode: 200,
		  headers: CORS_HEADERS,
		  body: JSON.stringify({
			token,
			user: {
			  id: 1,
			  email: email,
			  role: "admin",
			  name: "Administrator"
			}
		  })
		};
	  }
	  
	  return {
		statusCode: 401,
		headers: CORS_HEADERS,
		body: JSON.stringify({ message: "Invalid email or password" })
	  };
	}
	
	// Handle registration
	async function handleRegister(data) {
	  const { name, email, password } = data;
	  
	  // In a real app, validate and save to database
	  
	  return {
		statusCode: 201,
		headers: CORS_HEADERS,
		body: JSON.stringify({
		  message: "Registration successful",
		  user: {
			id: 2,
			email,
			name,
			role: "user"
		  }
		})
	  };
	}
	
	// Handle password reset
	async function handleResetPassword(data) {
	  const { email } = data;
	  
	  // In a real app, generate reset token and send email
	  
	  return {
		statusCode: 200,
		headers: CORS_HEADERS,
		body: JSON.stringify({
		  message: "If your email is registered, you will receive a password reset link"
		})
	  };
	}
	`;
	}
}