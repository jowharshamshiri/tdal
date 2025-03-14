/**
 * Framework
 * Main entry point for the application framework
 */

import * as path from 'path';
import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import compression from 'compression';
import helmet from 'helmet';
import { AppContext } from './app-context';
import { ConfigLoader } from './config-loader';
import { Logger, AppConfig } from './core/types';
import { DatabaseContext } from './database-context';

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

		// Create configuration loader
		this.configLoader = new ConfigLoader({
			schemaDir: options.schemaDir,
			entitiesDir: options.entitiesDir,
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
			this.context = new AppContext(this.config, this.logger);
			await this.context.initialize(entities);

			// Set up Express middleware
			this.setupMiddleware();

			// Set up routes
			await this.setupRoutes();

			this.logger.info('Framework initialized successfully');

			return this;
		} catch (error) {
			this.logger.error(`Framework initialization failed: ${error}`);
			throw new Error(`Framework initialization failed: ${error}`);
		}
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
		const apiBasePath = this.config?.apiBasePath || '/api';

		// Add health check endpoint
		this.app.get('/health', (req: Request, res: Response) => {
			res.json({
				status: 'ok',
				name: this.config?.name,
				version: this.config?.version
			});
		});

		// Generate API routes for entities
		if (this.context) {
			const entities = this.context.getAllEntityConfigs();

			// Create API generator dynamically
			try {
				// Import API generator - could be moved to a separate module in a real implementation
				const ApiGenerator = await this.loadApiGenerator();

				if (ApiGenerator) {
					const generator = new ApiGenerator(this.context, this.app, apiBasePath, this.logger);

					// Generate API routes for each entity with exposed API
					for (const [entityName, entityConfig] of entities.entries()) {
						if (entityConfig.api && entityConfig.api.exposed) {
							await generator.generateEntityApi(entityConfig);
							this.logger.info(`Generated API for entity: ${entityName}`);
						}
					}
				}
			} catch (error) {
				this.logger.error(`Failed to generate API routes: ${error}`);
			}
		}
	}

	/**
	 * Load API generator dynamically
	 * This is a placeholder for a real implementation that would load the ApiGenerator class
	 */
	private async loadApiGenerator(): Promise<any> {
		// In a real implementation, this would dynamically import the ApiGenerator class
		// For now, we'll return a simple placeholder
		return class ApiGenerator {
			constructor(
				private context: AppContext,
				private app: Express,
				private basePath: string,
				private logger: Logger
			) { }

			async generateEntityApi(entityConfig: any): Promise<void> {
				const entityName = entityConfig.entity;
				const entityBasePath = entityConfig.api?.basePath || this.basePath + '/' + entityName.toLowerCase();

				// Get entity manager
				const entityManager = this.context.getEntityManager(entityName);

				// Add basic CRUD routes
				const router = express.Router();

				// GET /api/entity - Get all
				if (entityConfig.api?.operations?.getAll !== false) {
					router.get('/', async (req, res) => {
						try {
							const entities = await entityManager.findAll();
							res.json(entities);
						} catch (error) {
							this.logger.error(`Error in GET ${entityBasePath}: ${error}`);
							res.status(500).json({ error: 'Internal server error' });
						}
					});
				}

				// GET /api/entity/:id - Get by ID
				if (entityConfig.api?.operations?.getById !== false) {
					router.get('/:id', async (req, res) => {
						try {
							const entity = await entityManager.findById(req.params.id);

							if (!entity) {
								return res.status(404).json({ error: 'Not found' });
							}

							res.json(entity);
						} catch (error) {
							this.logger.error(`Error in GET ${entityBasePath}/${req.params.id}: ${error}`);
							res.status(500).json({ error: 'Internal server error' });
						}
					});
				}

				// POST /api/entity - Create
				if (entityConfig.api?.operations?.create !== false) {
					router.post('/', async (req, res) => {
						try {
							const id = await entityManager.create(req.body);
							const entity = await entityManager.findById(id);

							res.status(201).json(entity);
						} catch (error) {
							this.logger.error(`Error in POST ${entityBasePath}: ${error}`);
							res.status(500).json({ error: 'Internal server error' });
						}
					});
				}

				// PUT /api/entity/:id - Update
				if (entityConfig.api?.operations?.update !== false) {
					router.put('/:id', async (req, res) => {
						try {
							const id = req.params.id;
							await entityManager.update(id, req.body);

							const entity = await entityManager.findById(id);

							if (!entity) {
								return res.status(404).json({ error: 'Not found' });
							}

							res.json(entity);
						} catch (error) {
							this.logger.error(`Error in PUT ${entityBasePath}/${req.params.id}: ${error}`);
							res.status(500).json({ error: 'Internal server error' });
						}
					});
				}

				// DELETE /api/entity/:id - Delete
				if (entityConfig.api?.operations?.delete !== false) {
					router.delete('/:id', async (req, res) => {
						try {
							const id = req.params.id;
							const result = await entityManager.delete(id);

							if (result === 0) {
								return res.status(404).json({ error: 'Not found' });
							}

							res.status(204).end();
						} catch (error) {
							this.logger.error(`Error in DELETE ${entityBasePath}/${req.params.id}: ${error}`);
							res.status(500).json({ error: 'Internal server error' });
						}
					});
				}

				// Register routes
				this.app.use(entityBasePath, router);

				this.logger.debug(`Registered API routes for ${entityName} at ${entityBasePath}`);
			}
		};
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