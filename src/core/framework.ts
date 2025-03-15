/**
 * Framework
 * Main entry point for the application framework
 */

import * as path from 'path';
import express, { Express, Request, Response, NextFunction, Router } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import compression from 'compression';
import helmet from 'helmet';
import { AppContext } from './app-context';
import { ConfigLoader } from './config-loader';
import { Logger, AppConfig } from './types';
import { RequestProcessor } from '../middleware/request-processor';
import { ActionRegistry } from '../actions/action-registry';
import { AuthenticationService } from '../middleware/authentication';
import { createAdapterRegistry } from '../adapters';

/**
 * Framework options
 */
export interface FrameworkOptions {
	/**
	 * Path to application configuration file
	 */
	configPath?: string;

	/**
	 * Path to entities directory
	 */
	entitiesDir?: string;

	/**
	 * Path to schema directory
	 */
	schemaDir?: string;

	/**
	 * Logger instance
	 */
	logger?: Logger;

	/**
	 * Express application instance
	 * If not provided, a new instance will be created
	 */
	app?: Express;

	/**
	 * API base path
	 */
	apiBasePath?: string;

	/**
	 * Whether to automatically generate API routes from entity configurations
	 */
	autoGenerateApi?: boolean;

	/**
	 * Custom middleware to apply before route handlers
	 */
	middleware?: Array<(req: Request, res: Response, next: NextFunction) => void>;
}

/**
 * Framework class
 * Main entry point for the application framework
 */
export class Framework {
	/**
	 * Application context
	 */
	private context: AppContext | null = null;

	/**
	 * Configuration loader
	 */
	private configLoader: ConfigLoader;

	/**
	 * Adapter registry
	 */
	private adapterRegistry: any;

	/**
	 * Express application
	 */
	private app: Express;

	/**
	 * Application configuration
	 */
	private config: AppConfig | null = null;

	/**
	 * HTTP server instance
	 */
	private server: any = null;

	/**
	 * Logger instance
	 */
	private logger: Logger;

	/**
	 * Request processor for handling API requests
	 */
	private requestProcessor: RequestProcessor | null = null;

	/**
	 * API base path
	 */
	private apiBasePath: string;

	/**
	 * Whether to automatically generate API routes
	 */
	private autoGenerateApi: boolean;

	/**
	 * Custom middleware
	 */
	private customMiddleware: Array<(req: Request, res: Response, next: NextFunction) => void>;

	/**
	 * Constructor
	 * @param options Framework options
	 */
	constructor(options: FrameworkOptions = {}) {
		// Set up logger
		this.logger = options.logger || {
			debug: console.debug,
			info: console.info,
			warn: console.warn,
			error: console.error
		};

		// Create Express app if not provided
		this.app = options.app || express();

		// Set API options
		this.apiBasePath = options.apiBasePath || '/api';
		this.autoGenerateApi = options.autoGenerateApi !== false; // Default to true
		this.customMiddleware = options.middleware || [];

		// Create configuration loader
		this.configLoader = new ConfigLoader({
			configDir: path.dirname(options.configPath || ''),
			entitiesDir: options.entitiesDir,
			schemaDir: options.schemaDir,
			logger: this.logger
		});

		this.logger.info('Framework instance created');
	}

	/**
	 * Initialize the framework
	 * @param configPath Path to application configuration file
	 * @returns Initialized framework instance
	 */
	async initialize(configPath?: string): Promise<Framework> {
		try {
			this.logger.info('Initializing framework');

			// Load application configuration
			this.config = await this.configLoader.loadAppConfig(configPath);

			this.logger.info(`Loaded configuration for ${this.config.name} v${this.config.version}`);

			// Load entity configurations
			const entitiesDir = this.config.entitiesDir || path.join(process.cwd(), 'entities');
			const entities = await this.configLoader.loadEntities(entitiesDir);

			this.logger.info(`Loaded ${entities.size} entities`);

			// Create and initialize application context
			this.context = new AppContext(this.config, this.logger, this.app);
			await this.context.initialize(entities);

			// Create request processor
			this.requestProcessor = new RequestProcessor(this.context, this.logger);

			// Register RequestProcessor as a service
			this.context.registerService({
				name: 'requestProcessor',
				implementation: this.requestProcessor,
				singleton: true
			});

			// Register authentication service
			const authService = new AuthenticationService(this.context);
			this.context.registerService({
				name: 'auth',
				implementation: authService,
				singleton: true
			});

			// Set up Express middleware
			this.setupMiddleware();

			// Set up routes
			await this.setupRoutes();

			// Initialize adapter registry
			this.adapterRegistry = createAdapterRegistry(this.logger);
			this.context.registerService({
				name: 'adapterRegistry',
				implementation: this.adapterRegistry,
				singleton: true
			});

			// Initialize configured adapters
			if (this.config?.adapters?.config) {
				for (const [name, adapterConfig] of Object.entries(this.config.adapters.config)) {
					if (adapterConfig.enabled) {
						try {
							const adapter = this.adapterRegistry.getAdapter(name, adapterConfig.options);
							await adapter.initialize(adapterConfig.options);
							this.logger.info(`Initialized adapter: ${name}`);
						} catch (error: any) {
							this.logger.error(`Failed to initialize adapter ${name}: ${error.message}`);
						}
					}
				}
			}

			this.logger.info('Framework initialized successfully');

			return this;
		} catch (error) {
			this.logger.error(`Framework initialization failed: ${error}`);
			throw new Error(`Framework initialization failed: ${error}`);
		}
	}

	/**
	 * Generate API for a specific entity using an adapter
	 * @param entityName Entity name
	 * @param adapterName Adapter name or default adapter if not specified
	 * @param options Adapter options
	 * @returns Generation result
	 */
	async generateEntityApiWithAdapter(
		entityName: string,
		adapterName?: string,
		options?: Record<string, any>
	): Promise<any> {
		if (!this.context) {
			throw new Error('Application context not initialized');
		}

		// Get adapter name from config if not specified
		const adapter = adapterName || this.config?.adapters?.default;
		if (!adapter) {
			throw new Error('No adapter specified and no default adapter configured');
		}

		// Get adapter options from config if not specified
		const adapterConfig = this.config?.adapters?.config?.[adapter];
		const adapterOptions = options || adapterConfig?.options || {};

		// Get API generator
		const apiGenerator = this.context.getApiGenerator();

		// Generate API
		return await apiGenerator.generateEntityApiWithAdapter(
			adapter,
			entityName,
			adapterOptions
		);
	}

	/**
	 * Get the adapter registry
	 * @returns Adapter registry
	 */
	getAdapterRegistry(): any {
		return this.adapterRegistry;
	}

	/**
	 * Generate API using an adapter
	 * @param adapterName Adapter name or default adapter if not specified
	 * @param options Adapter options
	 * @returns Generation result
	 */
	async generateApiWithAdapter(adapterName?: string, options?: Record<string, any>): Promise<any> {
		if (!this.context) {
			throw new Error('Application context not initialized');
		}

		// Get adapter name from config if not specified
		const adapter = adapterName || this.config?.adapters?.default;
		if (!adapter) {
			throw new Error('No adapter specified and no default adapter configured');
		}

		// Get adapter options from config if not specified
		const adapterConfig = this.config?.adapters?.config?.[adapter];
		const adapterOptions = options || adapterConfig?.options || {};

		// Get API generator
		const apiGenerator = this.context.getApiGenerator();

		// Generate API
		return await apiGenerator.generateApiWithAdapter(
			adapter,
			this.context.getAllEntityConfigs(),
			adapterOptions
		);
	}

	/**
	 * Set up Express middleware
	 */
	private setupMiddleware(): void {
		// Skip if no Express app
		if (!this.app) {
			return;
		}

		this.logger.debug('Setting up Express middleware');

		// Basic middleware
		this.app.use(cors());
		this.app.use(bodyParser.json());
		this.app.use(bodyParser.urlencoded({ extended: true }));
		this.app.use(compression());

		// Security middleware in production
		if (this.config && this.config.production) {
			this.app.use(helmet());
		}

		// Request logging
		this.app.use((req: Request, res: Response, next: NextFunction) => {
			this.logger.debug(`${req.method} ${req.path}`);
			next();
		});

		// Apply custom middleware
		for (const middleware of this.customMiddleware) {
			this.app.use(middleware);
		}

		// Apply global middleware from configuration if available
		if (this.config && this.config.middleware && this.config.middleware.global) {
			for (const middlewareName of this.config.middleware.global) {
				const middlewareConfig = this.context?.getMiddlewareConfig(middlewareName);
				if (middlewareConfig && middlewareConfig.handler) {
					try {
						// Load middleware handler
						let handler: any;

						if (typeof middlewareConfig.handler === 'string') {
							// Load from file path
							const handlerModule = require(path.resolve(process.cwd(), middlewareConfig.handler));
							handler = handlerModule.default || handlerModule;
						} else {
							// Use provided handler function
							handler = middlewareConfig.handler;
						}

						// Apply middleware
						if (typeof handler === 'function') {
							this.app.use(handler(middlewareConfig.options || {}, this.context!));
							this.logger.debug(`Applied global middleware: ${middlewareName}`);
						} else {
							this.logger.warn(`Invalid middleware handler for ${middlewareName}`);
						}
					} catch (error) {
						this.logger.error(`Error applying middleware ${middlewareName}: ${error}`);
					}
				}
			}
		}
	}

	/**
	 * Set up Express routes
	 */
	private async setupRoutes(): Promise<void> {
		// Skip if no Express app or context
		if (!this.app || !this.context) {
			return;
		}

		this.logger.debug('Setting up routes');

		// Add API base path
		const apiBasePath = this.config?.apiBasePath || this.apiBasePath;

		// Add health check endpoint
		this.app.get('/health', (req: Request, res: Response) => {
			res.json({
				status: 'ok',
				name: this.config?.name,
				version: this.config?.version
			});
		});

		// Generate API routes for entities
		if (this.context && this.autoGenerateApi) {
			try {
				// Initialize API routes
				const registeredRoutes = await this.context.initializeApiRoutes(apiBasePath);

				this.logger.info(`Generated ${registeredRoutes.length} API routes`);

				// Log all registered routes in debug mode
				if (this.logger.debug && registeredRoutes.length > 0) {
					this.logger.debug('Registered API routes:');
					for (const route of registeredRoutes) {
						this.logger.debug(`  ${route}`);
					}
				}
			} catch (error) {
				this.logger.error(`Failed to generate API routes: ${error}`);
			}
		}

		// Add generic error handler
		this.app.use((err: any, req: Request, res: Response, next: NextFunction) => {
			this.logger.error(`API Error: ${err.message || err}`);
			res.status(err.status || 500).json({
				error: err.name || 'InternalServerError',
				message: err.message || 'An unexpected error occurred',
				status: err.status || 500
			});
		});
	}

	/**
	 * Start the server
	 * @param port Port to listen on (overrides config)
	 * @param host Host to listen on (overrides config)
	 * @returns Server instance
	 */
	async start(port?: number, host?: string): Promise<any> {
		if (!this.app) {
			throw new Error('Cannot start server: Express app not initialized');
		}

		if (!this.config) {
			throw new Error('Cannot start server: Configuration not loaded');
		}

		const serverPort = port || this.config.port || 3000;
		const serverHost = host || this.config.host || 'localhost';

		return new Promise((resolve, reject) => {
			try {
				this.server = this.app.listen(serverPort, serverHost, () => {
					this.logger.info(`Server started at http://${serverHost}:${serverPort}`);

					// If API routes were generated, log the API base URL
					if (this.autoGenerateApi) {
						const apiBasePath = this.config?.apiBasePath || this.apiBasePath;
						this.logger.info(`API available at http://${serverHost}:${serverPort}${apiBasePath}`);
					}

					resolve(this.server);
				});
			} catch (error) {
				this.logger.error(`Failed to start server: ${error}`);
				reject(error);
			}
		});
	}

	/**
	 * Stop the server
	 */
	async stop(): Promise<void> {
		this.logger.info('Stopping server');

		// Close HTTP server
		if (this.server) {
			await new Promise<void>((resolve, reject) => {
				this.server.close((err?: Error) => {
					if (err) {
						this.logger.error(`Error closing server: ${err}`);
						reject(err);
					} else {
						resolve();
					}
				});
			});
		}

		// Shut down application context
		if (this.context) {
			await this.context.shutdown();
		}

		this.logger.info('Server stopped');
	}

	/**
	 * Get the application context
	 * @returns Application context
	 */
	getContext(): AppContext {
		if (!this.context) {
			throw new Error('Application context not initialized');
		}

		return this.context;
	}

	/**
	 * Get the Express application
	 * @returns Express application
	 */
	getApp(): Express {
		return this.app;
	}

	/**
	 * Get the configuration loader
	 * @returns Configuration loader
	 */
	getConfigLoader(): ConfigLoader {
		return this.configLoader;
	}

	/**
	 * Get the application configuration
	 * @returns Application configuration
	 */
	getConfig(): AppConfig {
		if (!this.config) {
			throw new Error('Application configuration not loaded');
		}

		return this.config;
	}

	/**
	 * Get the route registry
	 * @returns Route registry
	 */
	getRouteRegistry(): any {
		if (!this.context) {
			throw new Error('Application context not initialized');
		}

		return this.context.getRouteRegistry();
	}

	/**
	 * Get the action registry
	 * @returns Action registry
	 */
	getActionRegistry(): ActionRegistry {
		if (!this.context) {
			throw new Error('Application context not initialized');
		}

		return this.context.getActionRegistry();
	}

	/**
	 * Get the request processor
	 * @returns Request processor
	 */
	getRequestProcessor(): RequestProcessor {
		if (!this.requestProcessor) {
			throw new Error('Request processor not initialized');
		}

		return this.requestProcessor;
	}

	/**
	 * Create API routes for an entity
	 * @param entityName Entity name
	 * @param router Express router to attach routes to
	 * @returns Router with attached routes
	 */
	async createEntityApiRoutes(entityName: string, router: Router = Router()): Promise<Router> {
		if (!this.context) {
			throw new Error('Application context not initialized');
		}

		const entityConfig = this.context.getEntityConfig(entityName);
		const entityManager = this.context.getEntityManager(entityName);
		const actionRegistry = this.context.getActionRegistry();
		const apiGenerator = this.context.getApiGenerator();

		if (!entityConfig.api || !entityConfig.api.exposed) {
			throw new Error(`Entity ${entityName} is not exposed via API`);
		}

		return await apiGenerator.generateEntityApi(entityConfig, entityManager, actionRegistry, router);
	}
}

/**
 * Create and initialize a framework instance
 * @param options Framework options
 * @returns Initialized framework instance
 */
export async function createFramework(options: FrameworkOptions = {}): Promise<Framework> {
	const framework = new Framework(options);
	await framework.initialize(options.configPath);
	return framework;
}