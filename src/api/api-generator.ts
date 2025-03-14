/**
 * API Generator
 * Generates REST API endpoints from entity definitions
 */

import { Router, Request, Response, NextFunction } from 'express';
import { EntityConfig } from '../entity/entity-config';
import { EntityDao } from '../entity/entity-manager';
import { ActionRegistry } from '../actions/action-registry';
import { Logger, ControllerContext } from '../core/types';
import { createControllerContext } from '../entity/entity-manager';

/**
 * API Generator class
 * Generates REST API endpoints from entity definitions
 */
export class ApiGenerator {
	/**
	 * Entity controllers cache
	 * Maps entity names to their controllers
	 */
	private controllers: Map<string, any> = new Map();

	/**
	 * Constructor
	 * @param context Application context
	 * @param logger Logger instance
	 */
	constructor(private context: any, private logger: Logger) { }

	/**
	 * Generate API routes for an entity
	 * @param entityConfig Entity configuration
	 * @param entityManager Entity manager instance
	 * @param actionRegistry Action registry
	 * @param router Optional Express router to attach routes to
	 * @returns Router with entity routes
	 */
	async generateEntityApi(
		entityConfig: EntityConfig,
		entityManager: EntityDao<any>,
		actionRegistry: ActionRegistry,
		router = Router()
	): Promise<Router> {
		// Check if entity is exposed via API
		if (!entityConfig.api || !entityConfig.api.exposed) {
			this.logger.warn(`Entity ${entityConfig.entity} is not exposed via API`);
			return router;
		}

		this.logger.info(`Generating API routes for entity ${entityConfig.entity}`);

		// Get controller for entity
		const controllerFactory = await import('./controller-factory');
		const controller = controllerFactory.createEntityController(
			entityConfig,
			entityManager,
			this.context,
			this.logger
		);

		// Cache controller
		this.controllers.set(entityConfig.entity, controller);

		// Register CRUD routes
		this.registerStandardRoutes(router, entityConfig, controller);

		// Register action routes
		if (entityConfig.actions && entityConfig.actions.length > 0) {
			this.registerActionRoutes(router, entityConfig, entityManager, actionRegistry);
		}

		// Apply entity-specific middleware if configured
		if (entityConfig.middleware) {
			this.applyEntityMiddleware(router, entityConfig);
		}

		return router;
	}

	/**
	 * Register standard CRUD routes
	 * @param router Express router
	 * @param entityConfig Entity configuration
	 * @param controller Entity controller
	 */
	private registerStandardRoutes(
		router: Router,
		entityConfig: EntityConfig,
		controller: any
	): void {
		const operations = entityConfig.api?.operations || {};
		const entityName = entityConfig.entity;

		// GET /:entity - Get all entities
		if (operations.getAll !== false) {
			this.logger.debug(`Registering GET route for ${entityName}`);
			router.get('/', this.createRequestHandler(controller.getAll, entityName, 'getAll'));
		}

		// GET /:entity/:id - Get entity by ID
		if (operations.getById !== false) {
			this.logger.debug(`Registering GET route for ${entityName}/:id`);
			router.get('/:id', this.createRequestHandler(controller.getById, entityName, 'getById'));
		}

		// POST /:entity - Create entity
		if (operations.create !== false) {
			this.logger.debug(`Registering POST route for ${entityName}`);
			router.post('/', this.createRequestHandler(controller.create, entityName, 'create'));
		}

		// PUT /:entity/:id - Update entity
		if (operations.update !== false) {
			this.logger.debug(`Registering PUT route for ${entityName}/:id`);
			router.put('/:id', this.createRequestHandler(controller.update, entityName, 'update'));
		}

		// DELETE /:entity/:id - Delete entity
		if (operations.delete !== false) {
			this.logger.debug(`Registering DELETE route for ${entityName}/:id`);
			router.delete('/:id', this.createRequestHandler(controller.delete, entityName, 'delete'));
		}
	}

	/**
	 * Register custom action routes
	 * @param router Express router
	 * @param entityConfig Entity configuration
	 * @param entityManager Entity manager
	 * @param actionRegistry Action registry
	 */
	private registerActionRoutes(
		router: Router,
		entityConfig: EntityConfig,
		entityManager: EntityDao<any>,
		actionRegistry: ActionRegistry
	): void {
		const entityName = entityConfig.entity;

		// Register each action with a route
		for (const action of entityConfig.actions || []) {
			// Skip actions without a route or HTTP method
			if (!action.route || !action.httpMethod) {
				continue;
			}

			const method = action.httpMethod.toLowerCase();
			const routePath = action.route.startsWith('/') ? action.route : `/${action.route}`;

			this.logger.debug(`Registering ${action.httpMethod} route ${routePath} for action ${action.name}`);

			// Create request handler for the action
			const handler = this.createActionHandler(entityName, action.name, entityManager, actionRegistry);

			// Register the route with the appropriate HTTP method
			switch (method) {
				case 'get':
					router.get(routePath, handler);
					break;
				case 'post':
					router.post(routePath, handler);
					break;
				case 'put':
					router.put(routePath, handler);
					break;
				case 'patch':
					router.patch(routePath, handler);
					break;
				case 'delete':
					router.delete(routePath, handler);
					break;
				default:
					this.logger.warn(`Unsupported HTTP method ${method} for action ${action.name}`);
			}
		}
	}

	/**
	 * Apply entity-specific middleware
	 * @param router Express router
	 * @param entityConfig Entity configuration
	 */
	private applyEntityMiddleware(router: Router, entityConfig: EntityConfig): void {
		const middleware = entityConfig.middleware;

		if (!middleware) return;

		// Apply middleware for specific operations
		const applyMiddleware = (operation: string, handler: string | Function) => {
			const middlewareName = typeof handler === 'string' ? handler : 'custom';
			this.logger.debug(`Applying middleware ${middlewareName} for ${entityConfig.entity}.${operation}`);

			// Load middleware handler
			let middlewareHandler: Function;

			if (typeof handler === 'string') {
				try {
					// Get middleware from context
					const middlewareConfig = this.context.getMiddlewareConfig(handler);

					if (!middlewareConfig || !middlewareConfig.handler) {
						this.logger.warn(`Middleware ${handler} not found`);
						return;
					}

					middlewareHandler = middlewareConfig.handler;
				} catch (error) {
					this.logger.error(`Error loading middleware ${handler}: ${error}`);
					return;
				}
			} else {
				middlewareHandler = handler;
			}

			// Apply middleware to router
			router.use(middlewareHandler);
		};

		// Apply all middleware
		if (middleware.all) {
			middleware.all.forEach(handler => applyMiddleware('all', handler));
		}

		// Other operation-specific middleware could be added here
	}

	/**
	 * Create a request handler for a controller method
	 * @param controllerMethod Controller method
	 * @param entityName Entity name
	 * @param operation Operation name
	 * @returns Express request handler
	 */
	private createRequestHandler(
		controllerMethod: Function,
		entityName: string,
		operation: string
	): (req: Request, res: Response, next: NextFunction) => Promise<void> {
		return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
			try {
				// Create controller context
				const context = createControllerContext(
					this.context.getDatabase(),
					this.logger,
					entityName,
					operation,
					req,
					res,
					next
				);

				// Execute controller method
				await controllerMethod.call(null, context);
			} catch (error) {
				this.logger.error(`Error in ${entityName}.${operation}: ${error}`);
				next(error);
			}
		};
	}

	/**
	 * Create a request handler for an entity action
	 * @param entityName Entity name
	 * @param actionName Action name
	 * @param entityManager Entity manager
	 * @param actionRegistry Action registry
	 * @returns Express request handler
	 */
	private createActionHandler(
		entityName: string,
		actionName: string,
		entityManager: EntityDao<any>,
		actionRegistry: ActionRegistry
	): (req: Request, res: Response, next: NextFunction) => Promise<void> {
		return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
			try {
				// Create controller context
				const context = createControllerContext(
					this.context.getDatabase(),
					this.logger,
					entityName,
					'action',
					req,
					res,
					next
				);

				// Add action name to context
				context.action = actionName;

				// Get parameters from request
				const params = {
					...req.params,
					...req.query,
					...req.body
				};

				// Process API request
				const processedParams = await entityManager.processApiRequest(
					params,
					'action',
					context
				);

				// Execute action
				const result = await actionRegistry.executeAction(
					entityName,
					actionName,
					processedParams,
					context
				);

				// Process API response
				const processedResult = await entityManager.processApiResponse(
					result,
					'action',
					context
				);

				// Send response
				res.json(processedResult);
			} catch (error) {
				this.logger.error(`Error in action ${entityName}.${actionName}: ${error}`);
				next(error);
			}
		};
	}
}