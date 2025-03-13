/**
 * Main Framework Entry Point
 * Bootstraps the entire application from YAML configuration
 */

import * as path from 'path';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import compression from 'compression';
import helmet from 'helmet';
import { ApplicationContext } from './app-context';
import { ConfigLoader } from './config-loader';
import { AppConfig, EntityConfig, Logger } from './types';

/**
 * Simple console logger implementation
 */
class ConsoleLogger implements Logger {
	debug(message: string, ...args: any[]): void {
		console.debug(`[DEBUG] ${message}`, ...args);
	}

	info(message: string, ...args: any[]): void {
		console.info(`[INFO] ${message}`, ...args);
	}

	warn(message: string, ...args: any[]): void {
		console.warn(`[WARN] ${message}`, ...args);
	}

	error(message: string, ...args: any[]): void {
		console.error(`[ERROR] ${message}`, ...args);
	}
}

/**
 * Framework class
 * Main entry point for the YAML-driven web application framework
 */
export class Framework {
	private logger: Logger;
	private configLoader: ConfigLoader;
	private context: ApplicationContext | null = null;
	private config: AppConfig | null = null;
	private entities: Map<string, EntityConfig> = new Map();

	/**
	 * Constructor
	 * @param logger Optional custom logger 
	 */
	constructor(logger?: Logger) {
		this.logger = logger || new ConsoleLogger();
		this.configLoader = new ConfigLoader(this.logger);
	}

	/**
	 * Initialize the framework
	 * @param configPath Path to app.yaml config file
	 */
	async initialize(configPath: string): Promise<ApplicationContext> {
		try {
			this.logger.info('Initializing framework...');

			// Load application configuration
			this.config = await this.configLoader.loadAppConfig(configPath);
			this.logger.info(`Loaded configuration for app: ${this.config.name} v${this.config.version}`);

			// Load entity configurations
			const entitiesDir = path.resolve(path.dirname(configPath), this.config.entitiesDir);
			this.entities = await this.configLoader.loadEntities(entitiesDir);
			this.logger.info(`Loaded ${this.entities.size} entities`);

			// Create application context
			this.context = new ApplicationContext(this.config, this.logger);

			// Initialize application context
			await this.context.initialize(this.entities);

			// Configure Express application
			this.configureExpressApp();

			// Register routes and controllers
			await this.registerRoutes();

			this.logger.info('Framework initialization complete');

			return this.context;
		} catch (error) {
			this.logger.error(`Framework initialization failed: ${error}`);
			throw new Error(`Framework initialization failed: ${error}`);
		}
	}

	/**
	 * Configure the Express application
	 */
	private configureExpressApp(): void {
		if (!this.context) throw new Error('Context not initialized');

		const { app, config } = this.context;

		// Add basic middleware
		app.use(cors());
		app.use(bodyParser.json());
		app.use(bodyParser.urlencoded({ extended: true }));
		app.use(compression());

		// Add security middleware in production
		if (config.production) {
			app.use(helmet());
		}

		// Add request logging
		app.use((req, res, next) => {
			this.logger.debug(`${req.method} ${req.path}`);
			next();
		});

		// Add error handling
		app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
			this.logger.error(`Error processing request: ${err.message}`);
			res.status(err.status || 500).json({
				error: 'Internal Server Error',
				message: config.production ? 'An error occurred' : err.message
			});
		});
	}

	/**
	 * Register all routes and controllers
	 */
	private async registerRoutes(): Promise<void> {
		if (!this.context) throw new Error('Context not initialized');

		try {
			// Dynamically import API generator
			const { ApiGenerator } = await import('../api/api-generator');

			// Create API generator
			const apiGenerator = new ApiGenerator(this.context, this.logger);

			// Generate APIs for all entities with api.exposed = true
			for (const [entityName, entityConfig] of this.entities.entries()) {
				if (entityConfig.api?.exposed) {
					await apiGenerator.generateApi(entityConfig);
					this.logger.info(`Generated API for entity: ${entityName}`);
				}
			}

			// Add generic routes
			this.addGenericRoutes();

		} catch (error) {
			this.logger.error(`Failed to register routes: ${error}`);
			throw new Error(`Failed to register routes: ${error}`);
		}
	}

	/**
	 * Add generic framework routes
	 */
	private addGenericRoutes(): void {
		if (!this.context) throw new Error('Context not initialized');

		const { app, config } = this.context;

		// Health check endpoint
		app.get('/health', (req, res) => {
			res.json({ status: 'ok', version: config.version });
		});

		// Root endpoint with app info
		app.get('/', (req, res) => {
			res.json({
				name: config.name,
				version: config.version,
				apiBasePath: config.apiBasePath
			});
		});
	}

	/**
	 * Start the server
	 * @returns HTTP server instance
	 */
	async start(): Promise<any> {
		if (!this.context || !this.config) {
			throw new Error('Framework not initialized. Call initialize() first.');
		}

		return new Promise((resolve) => {
			const server = this.context!.app.listen(this.config!.port, () => {
				this.logger.info(`Server started on port ${this.config!.port}`);
				resolve(server);
			});
		});
	}

	/**
	 * Stop the server and clean up
	 */
	async stop(): Promise<void> {
		if (this.context) {
			await this.context.cleanup();
			this.logger.info('Framework stopped');
		}
	}

	/**
	 * Get the application context
	 * @returns Application context
	 */
	getContext(): ApplicationContext {
		if (!this.context) {
			throw new Error('Framework not initialized. Call initialize() first.');
		}
		return this.context;
	}
}

/**
 * Create and initialize the framework
 * @param configPath Path to app.yaml config file
 * @param logger Optional custom logger
 * @returns Initialized framework instance
 */
export async function createApp(configPath: string, logger?: Logger): Promise<Framework> {
	const framework = new Framework(logger);
	await framework.initialize(configPath);
	return framework;
}