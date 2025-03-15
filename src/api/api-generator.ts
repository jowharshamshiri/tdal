/**
 * API Generator
 * Generates REST API endpoints from entity definitions
 */

import { Router, Request, Response, NextFunction } from 'express';
import { EntityConfig } from '@/entity/entity-config';
import { EntityDao } from '@/entity/entity-manager';
import { ActionRegistry } from '@/actions/action-registry';
import { Logger, ControllerContext, HookContext } from '@/core/types';
import { createControllerContext } from '@/entity/entity-manager';
import { AppContext } from '@/core/app-context';

/**
 * API Route Configuration
 */
export interface ApiRouteConfig {
	/**
	 * HTTP method
	 */
	method: string;

	/**
	 * Route path
	 */
	path: string;

	/**
	 * Entity name
	 */
	entity: string;

	/**
	 * Operation name
	 */
	operation: string;

	/**
	 * Handler function
	 */
	handler: any;

	/**
	 * Middleware to apply
	 */
	middleware?: any[];

	/**
	 * Required roles
	 */
	roles?: string[];

	/**
	 * Description of the route
	 */
	description?: string;
}

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
	 * Route configurations
	 * All generated routes
	 */
	private routes: ApiRouteConfig[] = [];

	/**
	 * Constructor
	 * @param context Application context
	 * @param logger Logger instance
	 */
	constructor(private context: AppContext, private logger: Logger) { }

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
		const controllerFactory = await this.getEntityController(entityConfig, entityManager);

		// Cache controller
		this.controllers.set(entityConfig.entity, controllerFactory);

		// Register CRUD routes
		this.registerStandardRoutes(router, entityConfig, controllerFactory);

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
 * Generate API using a platform adapter
 * @param adapterName Adapter name
 * @param entities Entity configurations to generate APIs for
 * @param adapterOptions Adapter-specific options
 * @returns Generation results
 */
	async generateApiWithAdapter(
		adapterName: string,
		entities: Map<string, EntityConfig>,
		adapterOptions?: Record<string, any>
	): Promise<any> {
		this.logger.info(`Generating API using ${adapterName} adapter`);

		try {
			// Get adapter registry
			const adapterRegistry = this.context.getService('adapterRegistry');
			if (!adapterRegistry) {
				throw new Error('Adapter registry not found');
			}

			// Get adapter
			const adapter = adapterRegistry.getAdapter(adapterName, adapterOptions);
			if (!adapter) {
				throw new Error(`Adapter ${adapterName} not found`);
			}

			// Initialize adapter
			await adapter.initialize(adapterOptions);

			// Generate handlers
			const result = await adapter.generateHandlers(
				entities,
				this.context.getActionRegistry(),
				this.context
			);

			this.logger.info(`Generated ${result.files?.length || 0} files using ${adapterName} adapter`);

			return result;
		} catch (error: any) {
			this.logger.error(`Error generating API with adapter ${adapterName}: ${error}`);
			throw error;
		}
	}

	/**
 * Generate API for a specific entity using a platform adapter
 * @param adapterName Adapter name
 * @param entityName Entity name
 * @param adapterOptions Adapter-specific options
 * @returns Generation results
 */
	async generateEntityApiWithAdapter(
		adapterName: string,
		entityName: string,
		adapterOptions?: Record<string, any>
	): Promise<any> {
		this.logger.info(`Generating API for ${entityName} using ${adapterName} adapter`);

		try {
			// Get adapter registry
			const adapterRegistry = this.context.getService('adapterRegistry');
			if (!adapterRegistry) {
				throw new Error('Adapter registry not found');
			}

			// Get adapter
			const adapter = adapterRegistry.getAdapter(adapterName, adapterOptions);
			if (!adapter) {
				throw new Error(`Adapter ${adapterName} not found`);
			}

			// Initialize adapter
			await adapter.initialize(adapterOptions);

			// Get entity configuration
			const entityConfig = this.context.getEntityConfig(entityName);
			if (!entityConfig) {
				throw new Error(`Entity ${entityName} not found`);
			}

			// Generate handler
			const result = await adapter.generateEntityHandler(
				entityConfig,
				this.context.getActionRegistry(),
				this.context
			);

			this.logger.info(`Generated ${result.files?.length || 0} files for ${entityName} using ${adapterName} adapter`);

			return result;
		} catch (error: any) {
			this.logger.error(`Error generating API for ${entityName} with adapter ${adapterName}: ${error}`);
			throw error;
		}
	}

	/**
	 * Get all generated routes
	 * @returns Array of route configurations
	 */
	getRoutes(): ApiRouteConfig[] {
		return [...this.routes];
	}

	/**
	 * Get entity controller
	 * @param entityConfig Entity configuration
	 * @param entityManager Entity manager
	 * @returns Controller factory
	 */
	private async getEntityController(
		entityConfig: EntityConfig,
		entityManager: EntityDao<any>
	): Promise<any> {
		// Check if controller already exists
		if (this.controllers.has(entityConfig.entity)) {
			return this.controllers.get(entityConfig.entity);
		}

		// Import controller factory
		try {
			const { createEntityController } = await import('@/api/controller-factory');

			return createEntityController(
				entityConfig,
				entityManager,
				this.context,
				this.logger
			);
		} catch (error: any) {
			this.logger.error(`Failed to create controller for ${entityConfig.entity}: ${error}`);
			throw new Error(`Failed to create controller for ${entityConfig.entity}: ${error}`);
		}
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
		const basePath = entityConfig.api?.basePath || '';

		// GET /:entity - Get all entities
		if (operations.getAll !== false) {
			this.logger.debug(`Registering GET route for ${entityName}`);
			const route = this.createRequestHandler(controller.getAll, entityName, 'getAll');
			router.get('/', route);

			this.routes.push({
				method: 'GET',
				path: `${basePath}/`,
				entity: entityName,
				operation: 'getAll',
				handler: route,
				roles: entityConfig.api?.permissions?.getAll,
				description: `Get all ${entityName} records`
			});
		}

		// GET /:entity/:id - Get entity by ID
		if (operations.getById !== false) {
			this.logger.debug(`Registering GET route for ${entityName}/:id`);
			const route = this.createRequestHandler(controller.getById, entityName, 'getById');
			router.get('/:id', route);

			this.routes.push({
				method: 'GET',
				path: `${basePath}/:id`,
				entity: entityName,
				operation: 'getById',
				handler: route,
				roles: entityConfig.api?.permissions?.getById,
				description: `Get ${entityName} by ID`
			});
		}

		// POST /:entity - Create entity
		if (operations.create !== false) {
			this.logger.debug(`Registering POST route for ${entityName}`);
			const route = this.createRequestHandler(controller.create, entityName, 'create');
			router.post('/', route);

			this.routes.push({
				method: 'POST',
				path: `${basePath}/`,
				entity: entityName,
				operation: 'create',
				handler: route,
				roles: entityConfig.api?.permissions?.create,
				description: `Create new ${entityName}`
			});
		}

		// PUT /:entity/:id - Update entity
		if (operations.update !== false) {
			this.logger.debug(`Registering PUT route for ${entityName}/:id`);
			const route = this.createRequestHandler(controller.update, entityName, 'update');
			router.put('/:id', route);

			this.routes.push({
				method: 'PUT',
				path: `${basePath}/:id`,
				entity: entityName,
				operation: 'update',
				handler: route,
				roles: entityConfig.api?.permissions?.update,
				description: `Update ${entityName} by ID`
			});
		}

		// DELETE /:entity/:id - Delete entity
		if (operations.delete !== false) {
			this.logger.debug(`Registering DELETE route for ${entityName}/:id`);
			const route = this.createRequestHandler(controller.delete, entityName, 'delete');
			router.delete('/:id', route);

			this.routes.push({
				method: 'DELETE',
				path: `${basePath}/:id`,
				entity: entityName,
				operation: 'delete',
				handler: route,
				roles: entityConfig.api?.permissions?.delete,
				description: `Delete ${entityName} by ID`
			});
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
		const basePath = entityConfig.api?.basePath || '';

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
					continue;
			}

			// Add to routes list
			this.routes.push({
				method: action.httpMethod.toUpperCase(),
				path: `${basePath}${routePath}`,
				entity: entityName,
				operation: action.name,
				handler,
				roles: action.roles,
				description: action.description || `${action.name} action for ${entityName}`
			});
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
				} catch (error: any) {
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

		// Apply operation-specific middleware if defined
		['getAll', 'getById', 'create', 'update', 'delete'].forEach(operation => {
			if (middleware[operation]) {
				middleware[operation].forEach(handler => applyMiddleware(operation, handler));
			}
		});
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
			} catch (error: any) {
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
				const context: HookContext = createControllerContext(
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
					...req.body,
					files: (req as any).files,
					file: (req as any).file
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
				if (!res.headersSent) {
					const statusCode = result.statusCode || 200;
					res.status(statusCode).json({
						success: true,
						data: processedResult
					});
				}
			} catch (error: any) {
				this.logger.error(`Error in action ${entityName}.${actionName}: ${error}`);

				if (!res.headersSent) {
					const statusCode = (error as any).statusCode || 500;
					const errorType = (error as any).name || 'InternalServerError';
					const message = error.message || 'An unexpected error occurred';

					res.status(statusCode).json({
						success: false,
						error: errorType,
						message,
						status: statusCode
					});
				} else {
					next(error);
				}
			}
		};
	}

	/**
	 * Generate OpenAPI documentation for entity APIs
	 * @param entities Entity configurations to document
	 * @returns OpenAPI schema object
	 */
	generateOpenApiDocs(entities: Map<string, EntityConfig>): Record<string, any> {
		const paths: Record<string, any> = {};
		const schemas: Record<string, any> = {};

		// Process each entity
		for (const [entityName, config] of entities.entries()) {
			// Skip entities not exposed via API
			if (!config.api || !config.api.exposed) {
				continue;
			}

			// Create schema for entity
			schemas[entityName] = this.createOpenApiSchema(config);

			// Create paths for entity operations
			const basePath = config.api.basePath || `/${entityName.toLowerCase()}`;
			const operations = config.api.operations || {};

			// Standard CRUD routes
			if (operations.getAll !== false) {
				paths[basePath] = {
					...paths[basePath],
					get: this.createOpenApiOperation('getAll', entityName, config)
				};
			}

			if (operations.getById !== false) {
				paths[`${basePath}/{id}`] = {
					...paths[`${basePath}/{id}`],
					get: this.createOpenApiOperation('getById', entityName, config)
				};
			}

			if (operations.create !== false) {
				paths[basePath] = {
					...paths[basePath],
					post: this.createOpenApiOperation('create', entityName, config)
				};
			}

			if (operations.update !== false) {
				paths[`${basePath}/{id}`] = {
					...paths[`${basePath}/{id}`],
					put: this.createOpenApiOperation('update', entityName, config)
				};
			}

			if (operations.delete !== false) {
				paths[`${basePath}/{id}`] = {
					...paths[`${basePath}/{id}`],
					delete: this.createOpenApiOperation('delete', entityName, config)
				};
			}

			// Custom action routes
			if (config.actions && config.actions.length > 0) {
				for (const action of config.actions) {
					if (!action.route || !action.httpMethod) continue;

					const routePath = action.route.startsWith('/') ? action.route : `/${action.route}`;
					const method = action.httpMethod.toLowerCase();

					paths[`${basePath}${routePath}`] = {
						...paths[`${basePath}${routePath}`],
						[method]: this.createOpenApiActionOperation(action, entityName, config)
					};
				}
			}
		}

		// Build OpenAPI document
		return {
			openapi: '3.0.0',
			info: {
				title: 'API Documentation',
				version: '1.0.0',
				description: 'Automatically generated API documentation'
			},
			paths,
			components: {
				schemas,
				securitySchemes: {
					bearerAuth: {
						type: 'http',
						scheme: 'bearer',
						bearerFormat: 'JWT'
					}
				}
			}
		};
	}

	/**
	 * Create OpenAPI schema for entity
	 * @param config Entity configuration
	 * @returns OpenAPI schema object
	 */
	private createOpenApiSchema(config: EntityConfig): Record<string, any> {
		const properties: Record<string, any> = {};
		const required: string[] = [];

		// Process columns
		for (const column of config.columns) {
			if (!column.nullable && !column.autoIncrement) {
				required.push(column.logical);
			}

			// Map column type to OpenAPI type
			let type: string;
			let format: string | undefined;

			switch (column.type?.toLowerCase()) {
				case 'integer':
				case 'int':
				case 'bigint':
				case 'smallint':
				case 'tinyint':
					type = 'integer';
					if (column.type === 'bigint') format = 'int64';
					break;

				case 'float':
				case 'real':
				case 'double':
				case 'decimal':
				case 'numeric':
					type = 'number';
					format = 'float';
					break;

				case 'boolean':
				case 'bool':
					type = 'boolean';
					break;

				case 'date':
					type = 'string';
					format = 'date';
					break;

				case 'datetime':
				case 'timestamp':
					type = 'string';
					format = 'date-time';
					break;

				case 'json':
				case 'object':
					type = 'object';
					break;

				default:
					type = 'string';
			}

			// Create property definition
			properties[column.logical] = {
				type,
				...(format && { format }),
				...(column.comment && { description: column.comment })
			};
		}

		return {
			type: 'object',
			properties,
			required: required.length > 0 ? required : undefined
		};
	}

	/**
	 * Create OpenAPI operation object for standard operations
	 * @param operation Operation name
	 * @param entityName Entity name
	 * @param config Entity configuration
	 * @returns OpenAPI operation object
	 */
	private createOpenApiOperation(
		operation: string,
		entityName: string,
		config: EntityConfig
	): Record<string, any> {
		const entityNameLower = entityName.toLowerCase();

		switch (operation) {
			case 'getAll':
				return {
					summary: `Get all ${entityNameLower} records`,
					tags: [entityName],
					parameters: [
						{
							name: 'limit',
							in: 'query',
							description: 'Maximum number of records to return',
							schema: { type: 'integer' }
						},
						{
							name: 'offset',
							in: 'query',
							description: 'Number of records to skip',
							schema: { type: 'integer' }
						},
						{
							name: 'sort',
							in: 'query',
							description: 'Field to sort by',
							schema: { type: 'string' }
						},
						{
							name: 'order',
							in: 'query',
							description: 'Sort order (asc or desc)',
							schema: { type: 'string', enum: ['asc', 'desc'] }
						}
					],
					responses: {
						'200': {
							description: `List of ${entityNameLower} records`,
							content: {
								'application/json': {
									schema: {
										type: 'array',
										items: { $ref: `#/components/schemas/${entityName}` }
									}
								}
							}
						}
					},
					security: [{ bearerAuth: [] }]
				};

			case 'getById':
				return {
					summary: `Get ${entityNameLower} by ID`,
					tags: [entityName],
					parameters: [
						{
							name: 'id',
							in: 'path',
							required: true,
							description: 'Record ID',
							schema: { type: 'integer' }
						}
					],
					responses: {
						'200': {
							description: `${entityNameLower} record`,
							content: {
								'application/json': {
									schema: { $ref: `#/components/schemas/${entityName}` }
								}
							}
						},
						'404': {
							description: 'Record not found'
						}
					},
					security: [{ bearerAuth: [] }]
				};

			case 'create':
				return {
					summary: `Create ${entityNameLower}`,
					tags: [entityName],
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: { $ref: `#/components/schemas/${entityName}` }
							}
						}
					},
					responses: {
						'201': {
							description: `Created ${entityNameLower}`,
							content: {
								'application/json': {
									schema: { $ref: `#/components/schemas/${entityName}` }
								}
							}
						},
						'400': {
							description: 'Validation error'
						}
					},
					security: [{ bearerAuth: [] }]
				};

			case 'update':
				return {
					summary: `Update ${entityNameLower}`,
					tags: [entityName],
					parameters: [
						{
							name: 'id',
							in: 'path',
							required: true,
							description: 'Record ID',
							schema: { type: 'integer' }
						}
					],
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: { $ref: `#/components/schemas/${entityName}` }
							}
						}
					},
					responses: {
						'200': {
							description: `Updated ${entityNameLower}`,
							content: {
								'application/json': {
									schema: { $ref: `#/components/schemas/${entityName}` }
								}
							}
						},
						'404': {
							description: 'Record not found'
						}
					},
					security: [{ bearerAuth: [] }]
				};

			case 'delete':
				return {
					summary: `Delete ${entityNameLower}`,
					tags: [entityName],
					parameters: [
						{
							name: 'id',
							in: 'path',
							required: true,
							description: 'Record ID',
							schema: { type: 'integer' }
						}
					],
					responses: {
						'200': {
							description: 'Successfully deleted'
						},
						'404': {
							description: 'Record not found'
						}
					},
					security: [{ bearerAuth: [] }]
				};

			default:
				return {};
		}
	}

	/**
	 * Create OpenAPI operation object for custom action
	 * @param action Action configuration
	 * @param entityName Entity name
	 * @param config Entity configuration
	 * @returns OpenAPI operation object
	 */
	private createOpenApiActionOperation(
		action: any,
		entityName: string,
		config: EntityConfig
	): Record<string, any> {
		const parameters: any[] = [];

		// Add parameters from route path
		const pathParams = (action.route.match(/:[a-zA-Z0-9_]+/g) || [])
			.map(param => param.substring(1));

		for (const param of pathParams) {
			parameters.push({
				name: param,
				in: 'path',
				required: true,
				schema: { type: 'string' }
			});
		}

		// Add query parameters for GET requests
		if (action.httpMethod.toLowerCase() === 'get') {
			// Add declared parameters if available
			if (action.parameters) {
				for (const param of action.parameters) {
					if (pathParams.includes(param.name)) continue;

					parameters.push({
						name: param.name,
						in: 'query',
						required: !!param.required,
						description: param.description,
						schema: { type: param.type.toLowerCase() }
					});
				}
			}
		}

		// Create operation object
		return {
			summary: action.description || `${action.name} action`,
			tags: [entityName],
			parameters,
			...(action.httpMethod.toLowerCase() !== 'get' && {
				requestBody: {
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: action.parameters?.reduce((acc, param) => {
									if (!pathParams.includes(param.name)) {
										acc[param.name] = {
											type: param.type.toLowerCase(),
											description: param.description
										};
									}
									return acc;
								}, {})
							}
						}
					}
				}
			}),
			responses: {
				'200': {
					description: `Result of ${action.name} action`
				},
				'400': {
					description: 'Bad request'
				},
				'401': {
					description: 'Unauthorized'
				},
				'403': {
					description: 'Forbidden'
				}
			},
			security: [{ bearerAuth: [] }]
		};
	}
}

/**
 * Create API generator
 * @param context Application context
 * @param logger Logger instance
 * @returns API generator instance
 */
export function createApiGenerator(
	context: AppContext,
	logger: Logger
): ApiGenerator {
	return new ApiGenerator(context, logger);
}