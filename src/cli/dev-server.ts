/**
 * Development Server
 * Provides a development server with hot reloading
 */

import * as path from 'path';
import * as fs from 'fs';
import express, { Express, Request, Response, NextFunction } from 'express';
import chalk from 'chalk';
import chokidar from 'chokidar';
import cors from 'cors';
// Fix: Add types for morgan
import morgan from 'morgan';
import bodyParser from 'body-parser';
import compression from 'compression';
import { Command } from 'commander';
import { Logger } from '../core/types';
import { Framework } from '../core/framework';
import { ConfigLoader } from '../core/config-loader';
import { DatabaseAdapter } from '../database/core/types';
import { DatabaseContext } from '../database';
import { EntityConfig } from '../entity/entity-config';
// Fix: Create utils.ts or import correctly
import { getAvailablePort } from '../utils/network-utils';
// Fix: Add types for open
import open from 'open';
import { ConsoleLogger } from '../core/logger';

/**
 * Development server options
 */
export interface DevServerOptions {
	/** Config file path */
	configPath: string;

	/** Port number */
	port?: number;

	/** Whether to use in-memory database */
	inMemory?: boolean;

	/** Whether to enable debug mode */
	debug?: boolean;

	/** Whether to open browser */
	open?: boolean;

	/** Whether to watch for file changes */
	watch?: boolean;

	/** Whether to enable API */
	api?: boolean;

	/** Whether to enable authentication */
	auth?: boolean;

	/** Custom middleware to apply */
	middleware?: string[];
}

/**
 * Development server class
 * Manages a local development server with hot reloading
 */
export class DevServer {
	/** Server options */
	private options: DevServerOptions;

	/** Logger instance */
	private logger: Logger;

	/** Config loader for handling YAML files */
	private configLoader: ConfigLoader;

	/** Framework instance */
	private framework: Framework | null = null;

	/**
	 * File watcher for hot reloading
	 */
	private watcher: chokidar.FSWatcher | null = null;

	/** Directories to watch for changes */
	private watchDirs: string[] = [];

	/** Current app configuration */
	private config: any = null;

	/** Whether a server reload is in progress */
	private isReloading: boolean = false;

	/** Express application */
	private app: Express | null = null;

	/** HTTP server instance */
	private server: any = null;

	/** Database adapter */
	private dbAdapter: DatabaseAdapter | null = null;

	/** Entity configurations by name */
	private entities: Map<string, EntityConfig> = new Map();

	/**
	 * Constructor
	 * @param options Server options
	 */
	constructor(options: DevServerOptions) {
		this.options = options;
		this.logger = options.debug
			? new ConsoleLogger({ level: 'debug' })
			: new ConsoleLogger({ level: 'info' });
		this.configLoader = new ConfigLoader({ logger: this.logger });
	}

	/**
	 * Start the development server
	 */
	async start(): Promise<void> {
		this.logger.info(chalk.blue('Starting development server...'));

		try {
			// Load initial configuration
			this.config = await this.configLoader.loadAppConfig(this.options.configPath);

			// Override port if specified in options
			if (this.options.port) {
				this.config.port = this.options.port;
			} else if (!this.config.port) {
				// Find an available port if not specified
				this.config.port = await getAvailablePort(3000);
			}

			// Set up directories to watch
			this.setupWatchDirs();

			// Initialize database
			await this.initializeDatabase();

			// Create and initialize framework
			await this.initializeFramework();

			// Start watching for changes if enabled
			if (this.options.watch !== false) {
				this.startWatcher();
			}

			// Start the server
			await this.startServer();

			// Open browser if requested
			if (this.options.open) {
				this.openBrowser(`http://localhost:${this.config.port}`);
			}
		} catch (error: any) {
			this.logger.error(`Failed to start server: ${error.message}`);
			if (error.stack) {
				this.logger.debug(error.stack);
			}
			throw error;
		}
	}

	/**
	 * Set up directories to watch for changes
	 */
	private setupWatchDirs(): void {
		const configDir = path.dirname(this.options.configPath);

		// Always watch config file
		this.watchDirs.push(this.options.configPath);

		// Add entities directory to watch list
		const entitiesDir = path.resolve(
			configDir,
			this.config.entitiesDir || 'entities'
		);
		this.watchDirs.push(path.join(entitiesDir, '**/*.{yaml,yml}'));

		// Add hooks directory if it exists
		const hooksDir = path.resolve(configDir, 'hooks');
		if (fs.existsSync(hooksDir)) {
			this.watchDirs.push(path.join(hooksDir, '**/*.{js,ts}'));
		}

		// Add actions directory if it exists
		const actionsDir = path.resolve(configDir, 'actions');
		if (fs.existsSync(actionsDir)) {
			this.watchDirs.push(path.join(actionsDir, '**/*.{js,ts}'));
		}

		this.logger.debug(`Watching directories: ${this.watchDirs.join(', ')}`);
	}
	/**
   * Initialize the database
   */
	private async initializeDatabase(): Promise<void> {
		try {
			this.logger.info('Initializing database...');

			if (this.options.inMemory) {
				// Configure in-memory database
				this.logger.info(chalk.yellow('Using in-memory database'));

				this.config.database = {
					type: 'sqlite',
					connection: {
						filename: ':memory:'
					},
					synchronize: true
				};
			}

			// Initialize the database context
			DatabaseContext.setLogger(this.logger);
			DatabaseContext.configure(this.config.database);

			// Get the database adapter
			this.dbAdapter = DatabaseContext.getDatabase();

			this.logger.info(chalk.green('Database initialized'));
		} catch (error: any) {
			this.logger.error(`Database initialization failed: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Initialize the framework
	 */
	private async initializeFramework(): Promise<void> {
		try {
			this.logger.info('Initializing framework...');

			// Create Express app
			this.app = express();

			// Create framework instance with options
			this.framework = new Framework({
				logger: this.logger,
				app: this.app,
				apiBasePath: this.config.apiBasePath || '/api',
				autoGenerateApi: this.options.api !== false
			});

			// Initialize the framework with config
			await this.framework.initialize(this.options.configPath);

			// Store entity configurations for later use
			this.entities = this.framework.getContext().getAllEntityConfigs();

			this.logger.info(chalk.green('Framework initialized'));
		} catch (error: any) {
			this.logger.error(`Framework initialization failed: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Start the server
	 */
	private async startServer(): Promise<void> {
		if (!this.framework) {
			throw new Error('Framework not initialized');
		}

		try {
			this.logger.info(`Starting server on port ${this.config.port}...`);

			// Start the server
			this.server = await this.framework.start();

			const serverUrl = `http://localhost:${this.config.port}`;
			const apiUrl = `${serverUrl}${this.config.apiBasePath || '/api'}`;

			this.logger.info(chalk.green(`Server is running on ${chalk.cyan(serverUrl)}`));
			this.logger.info(chalk.green(`API is available at ${chalk.cyan(apiUrl)}`));

			// Print available entities and their endpoints
			if (this.options.api !== false && this.entities.size > 0) {
				this.logger.info('\nAvailable API endpoints:');
				for (const [entityName, entityConfig] of this.entities.entries()) {
					if (entityConfig.api?.exposed) {
						const basePath = entityConfig.api.basePath || `/${entityName.toLowerCase()}`;
						const entityApiUrl = `${apiUrl}${basePath}`;
						this.logger.info(`- ${chalk.cyan(entityName)}: ${chalk.cyan(entityApiUrl)}`);
					}
				}
				this.logger.info('');
			}
		} catch (error: any) {
			this.logger.error(`Failed to start server: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Start file watcher for hot reloading
	 */
	private startWatcher(): void {
		this.logger.info(chalk.blue('Starting file watcher for hot reloading...'));

		// Watch for changes in config and entity files
		this.watcher = chokidar.watch(this.watchDirs, {
			ignored: /(^|[\/\\])\../, // Ignore dotfiles
			persistent: true,
			ignoreInitial: true, // Don't trigger events on initial scan
			awaitWriteFinish: {
				stabilityThreshold: 300,
				pollInterval: 100
			}
		});
		// Handle file changes
		this.watcher.on('change', async (filePath: string) => {
			try {
				if (this.isReloading) {
					return;
				}

				this.isReloading = true;
				const relativePath = path.relative(process.cwd(), filePath);
				this.logger.info(chalk.yellow(`File changed: ${relativePath}`));

				// Determine what changed
				if (filePath === this.options.configPath) {
					this.logger.info('App configuration changed, restarting server...');
					await this.restartServer();
				} else if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
					this.logger.info('Entity configuration changed, reloading...');
					await this.reloadEntities();
				} else if (filePath.endsWith('.js') || filePath.endsWith('.ts')) {
					this.logger.info('Code file changed, restarting server...');
					await this.restartServer();
				}

				this.isReloading = false;
			} catch (error: any) {
				this.isReloading = false;
				this.logger.error(`Error during hot reload: ${error.message}`);
			}
		});

		// Handle new files
		this.watcher.on('add', async (filePath: string) => {
			try {
				if (this.isReloading) {
					return;
				}

				this.isReloading = true;
				const relativePath = path.relative(process.cwd(), filePath);
				this.logger.info(chalk.yellow(`New file added: ${relativePath}`));

				// Reload entities for new entity files
				if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
					this.logger.info('New entity configuration detected, reloading...');
					await this.reloadEntities();
				}

				this.isReloading = false;
			} catch (error: any) {
				this.isReloading = false;
				this.logger.error(`Error during hot reload: ${error.message}`);
			}
		});

		// Handle deleted files
		this.watcher.on('unlink', async (filePath: string) => {
			try {
				if (this.isReloading) {
					return;
				}

				this.isReloading = true;
				const relativePath = path.relative(process.cwd(), filePath);
				this.logger.info(chalk.yellow(`File deleted: ${relativePath}`));

				// Reload entities for deleted entity files
				if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
					this.logger.info('Entity configuration deleted, reloading...');
					await this.reloadEntities();
				}

				this.isReloading = false;
			} catch (error: any) {
				this.isReloading = false;
				this.logger.error(`Error during hot reload: ${error.message}`);
			}
		});

		this.logger.info(chalk.green('File watcher started'));
	}

	/**
	 * Restart the entire server
	 */
	private async restartServer(): Promise<void> {
		if (!this.framework) {
			return;
		}

		try {
			this.logger.info(chalk.yellow('Stopping server...'));

			// Stop the framework
			await this.framework.stop();

			this.logger.info(chalk.yellow('Reloading configuration...'));

			// Reload configuration
			this.config = await this.configLoader.loadAppConfig(this.options.configPath);

			// Override port if specified in options
			if (this.options.port) {
				this.config.port = this.options.port;
			}

			// Re-initialize the framework
			await this.initializeFramework();

			this.logger.info(chalk.yellow('Restarting server...'));

			// Start the server
			await this.startServer();

			this.logger.info(chalk.green('Server restarted successfully'));
		} catch (error: any) {
			this.logger.error(`Failed to restart server: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Reload entity configurations
	 */
	private async reloadEntities(): Promise<void> {
		if (!this.framework) {
			return;
		}

		try {
			this.logger.info(chalk.yellow('Reloading entity configurations...'));

			// Get the app context from the framework
			const context = this.framework.getContext();
			const entitiesDir = path.resolve(
				path.dirname(this.options.configPath),
				this.config.entitiesDir || 'entities'
			);

			// Load updated entities
			const entities = await this.configLoader.loadEntities(entitiesDir);

			// TODO: Ideally we would only reload the changed entities without restarting
			// the server, but this would require changes to the framework's entity handling.
			// For now, we'll restart the server to ensure all references are updated.
			await this.restartServer();

			this.logger.info(chalk.green('Entity configurations reloaded'));
		} catch (error: any) {
			this.logger.error(`Failed to reload entities: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Open the browser
	 * @param url URL to open
	 */
	private openBrowser(url: string): void {
		try {
			open(url);
			this.logger.info(`Opened browser at ${url}`);
		} catch (error: any) {
			this.logger.error(`Failed to open browser: ${error.message}`);
		}
	}

	/**
	 * Stop the development server
	 */
	async stop(): Promise<void> {
		this.logger.info(chalk.blue('Stopping development server...'));

		// Stop file watcher
		if (this.watcher) {
			await this.watcher.close();
		}

		// Stop framework
		if (this.framework) {
			await this.framework.stop();
		}

		this.logger.info(chalk.green('Development server stopped'));
	}

}
/**
 * Create and start a development server
 * @param options Server options
 * @returns Development server instance
 */
export async function startDevServer(options: DevServerOptions): Promise<DevServer> {
	const server = new DevServer(options);
	await server.start();
	return server;
}

/**
 * Register dev server command with Commander
 * @param program Commander program
 * @param logger Logger instance
 */
export function registerDevServerCommand(program: Command, logger: Logger): void {
	program
		.command('dev')
		.description('Start development server')
		.option('-c, --config <path>', 'Path to config file', './app.yaml')
		.option('-p, --port <port>', 'Port to listen on')
		.option('-m, --in-memory', 'Use in-memory database', false)
		.option('-d, --debug', 'Enable debug logging', false)
		.option('-o, --open', 'Open browser after starting', false)
		.option('-w, --watch', 'Watch for file changes', true)
		.option('-a, --api', 'Enable API generation', true)
		.option('--no-auth', 'Disable authentication', false)
		.action(async (options) => {
			try {
				// Convert port to number if provided
				if (options.port) {
					options.port = parseInt(options.port, 10);
					if (isNaN(options.port)) {
						logger.error('Invalid port number');
						process.exit(1);
					}
				}

				// Start the development server
				await startDevServer({
					configPath: options.config,
					port: options.port,
					inMemory: options.inMemory,
					debug: options.debug,
					open: options.open,
					watch: options.watch,
					api: options.api,
					auth: options.auth
				});

				// Handle process termination
				setupTerminationHandlers();
			} catch (error: any) {
				logger.error(`Failed to start development server: ${error.message}`);
				process.exit(1);
			}
		});
}

/**
 * Set up handlers for process termination signals
 */
function setupTerminationHandlers(): void {
	// Handle process termination signals
	const terminationSignals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];

	terminationSignals.forEach(signal => {
		process.once(signal, () => {
			console.log(chalk.yellow(`\nReceived ${signal}, shutting down...`));
			process.exit(0);
		});
	});

	// Handle unhandled rejections
	process.on('unhandledRejection', (reason, promise) => {
		console.error(chalk.red('Unhandled Rejection at:', promise, 'reason:', reason));
	});

	// Handle uncaught exceptions
	process.on('uncaughtException', (error) => {
		console.error(chalk.red('Uncaught Exception:'));
		console.error(error);
		process.exit(1);
	});
}

/**
 * Utility module with helper functions
 */
export const utils = {
	/**
	 * Find an available port starting from the given port
	 * @param startPort Port to start checking from
	 * @returns Available port number
	 */
	getAvailablePort: getAvailablePort
};

/**
 * Find an available port starting from the given port
 * @param startPort Port to start checking from
 * @returns Available port number
 */
async function getAvailablePort(startPort: number): Promise<number> {
	// This is a simplified implementation
	// In a real implementation, you would check if the port is in use
	// and increment until finding an available one
	return startPort;
}

/**
 * Console logger implementation
 */
export class ConsoleDevLogger implements Logger {
	private debugEnabled: boolean;
	private silent: boolean;

	constructor(options: { level?: 'debug' | 'info' | 'warn' | 'error'; silent?: boolean } = {}) {
		this.debugEnabled = options.level === 'debug';
		this.silent = options.silent || false;
	}

	debug(message: string, ...args: any[]): void {
		if (this.debugEnabled && !this.silent) {
			console.debug(chalk.gray(`[DEBUG] ${message}`), ...args);
		}
	}

	info(message: string, ...args: any[]): void {
		if (!this.silent) {
			console.info(chalk.blue(`[INFO] ${message}`), ...args);
		}
	}

	warn(message: string, ...args: any[]): void {
		if (!this.silent) {
			console.warn(chalk.yellow(`[WARN] ${message}`), ...args);
		}
	}

	error(message: string, ...args: any[]): void {
		if (!this.silent) {
			console.error(chalk.red(`[ERROR] ${message}`), ...args);
		}
	}
}

/**
 * Create default middleware stack for development server
 * @param app Express application
 * @param options Middleware options
 */
export function setupDefaultMiddleware(app: Express, options: {
	enableLogging?: boolean;
	enableCors?: boolean;
	enableCompression?: boolean;
	enableBodyParser?: boolean;
} = {}): void {
	// Default all options to true
	const {
		enableLogging = true,
		enableCors = true,
		enableCompression = true,
		enableBodyParser = true
	} = options;

	// Request logging
	if (enableLogging) {
		app.use(morgan('dev'));
	}

	// CORS middleware
	if (enableCors) {
		app.use(cors());
	}

	// Compression middleware
	if (enableCompression) {
		app.use(compression());
	}

	// Body parser middleware
	if (enableBodyParser) {
		app.use(bodyParser.json());
		app.use(bodyParser.urlencoded({ extended: true }));
	}

	// Basic error handler
	app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
		console.error(chalk.red('Server error:'), err);
		res.status(500).json({
			error: 'Internal Server Error',
			message: err.message
		});
	});
}

// Export default if running stand-alone
if (require.main === module) {
	// Create program
	const program = new Command();
	const logger = new ConsoleDevLogger();

	// Register dev server command
	registerDevServerCommand(program, logger);

	// Parse args
	program.parse(process.argv);
}