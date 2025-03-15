/**
 * Action Middleware
 * Express middleware for API action routes
 */

import { Request, Response, NextFunction } from 'express';
import { ActionExecutor } from './action-executor';
import { AppContext } from '../core/app-context';
import { HookContext } from '../core/types';
import { createControllerContext } from '../entity/entity-manager';
import { createHookContext } from '../hooks/hook-context';
import { EntityAction } from '../entity/entity-config';
import { TransactionIsolationLevel } from '../database';

/**
 * Middleware options
 */
export interface ActionMiddlewareOptions {
	/**
	 * Whether to execute in a transaction
	 */
	transactional?: boolean;

	/**
	 * Transaction isolation level
	 */
	isolationLevel?: TransactionIsolationLevel;

	/**
	 * Timeout in milliseconds
	 */
	timeout?: number;

	/**
	 * Additional middleware to apply
	 */
	middleware?: ((req: Request, res: Response, next: NextFunction) => void)[];

	/**
	 * Parameters validation function
	 */
	validateParams?: (params: any) => Promise<{ valid: boolean; errors?: any }>;

	/**
	 * Response transformation function
	 */
	transformResponse?: (result: any) => any;
}

/**
 * Action middleware factory
 */
export class ActionMiddleware {
	/**
	 * Action executor
	 */
	private actionExecutor: ActionExecutor;

	/**
	 * Logger
	 */
	private logger: any;

	/**
	 * Database adapter
	 */
	private db: any;

	/**
	 * Constructor
	 * @param appContext Application context
	 */
	constructor(private appContext: AppContext) {
		this.actionExecutor = appContext.getService('actionExecutor');
		this.logger = appContext.getLogger();
		this.db = appContext.getDatabase();
	}

	/**
	 * Create middleware for an action
	 * @param entityName Entity name
	 * @param actionName Action name
	 * @param options Middleware options
	 * @returns Express middleware
	 */
	middleware(
		entityName: string,
		actionName: string,
		options: ActionMiddlewareOptions = {}
	): (req: Request, res: Response, next: NextFunction) => Promise<void> {
		return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
			try {
				// Apply additional middleware if specified
				if (options.middleware && options.middleware.length > 0) {
					// Create middleware execution chain
					const executeMiddleware = (index: number): Promise<void> => {
						if (index >= (options.middleware?.length || 0)) {
							return Promise.resolve();
						}

						return new Promise<void>((resolve, reject) => {
							options.middleware![index](req, res, (err?: any) => {
								if (err) {
									reject(err);
								} else {
									executeMiddleware(index + 1).then(resolve).catch(reject);
								}
							});
						});
					};

					// Execute middleware chain
					await executeMiddleware(0);

					// If response is already sent by middleware, return
					if (res.headersSent) {
						return;
					}
				}

				// Create context
				const context = createControllerContext(
					this.db,
					this.logger,
					entityName,
					'action',
					req,
					res,
					next
				);

				// Add action info to context
				context.action = actionName;

				// Get parameters from request
				const params = {
					...req.params,
					...req.query,
					...req.body,
					files: (req as any).files,
					file: (req as any).file
				};

				// Validate parameters if validation function is provided
				if (options.validateParams) {
					const validation = await options.validateParams(params);
					if (!validation.valid) {
						res.status(400).json({
							success: false,
							error: 'Validation failed',
							details: validation.errors,
							status: 400
						});
						return;
					}
				}

				// Get entity manager
				const entityManager = this.appContext.getEntityManager(entityName);

				// Process API request
				const processedParams = await entityManager.processApiRequest(
					params,
					'action',
					context
				);

				// Execute action
				const result = await this.actionExecutor.execute(
					entityName,
					actionName,
					processedParams,
					context,
					{
						transactional: options.transactional,
						isolationLevel: options.isolationLevel,
						timeout: options.timeout
					}
				);

				if (!result.success) {
					// Handle error
					const status = result.statusCode || 500;

					res.status(status).json({
						success: false,
						error: 'ActionError',
						message: result.error || 'Action execution failed',
						status
					});

					return;
				}

				// Process API response
				let responseData = result.data;

				// Transform response if transform function is provided
				if (options.transformResponse) {
					responseData = options.transformResponse(responseData);
				} else {
					// Default processing
					responseData = await entityManager.processApiResponse(
						responseData,
						'action',
						context
					);
				}

				// Send response
				res.status(result.statusCode || 200).json({
					success: true,
					data: responseData
				});
			} catch (error: any) {
				this.logger.error(`Action middleware error: ${error.message}`);

				// Forward to error handler
				next(error);
			}
		};
	}

	/**
	 * Create routes from action definitions
	 * @param router Express router
	 * @param entityName Entity name
	 * @param actions Actions to create routes for
	 */
	createActionRoutes(
		router: any,
		entityName: string,
		actions: EntityAction[]
	): void {
		for (const action of actions) {
			// Skip actions without route or HTTP method
			if (!action.route || !action.httpMethod) {
				continue;
			}

			const method = action.httpMethod.toLowerCase();
			const path = action.route;

			// Create middleware
			const middlewares = [];

			// Add authentication middleware if roles are specified
			if (action.roles && action.roles.length > 0) {
				const authService = this.appContext.getService<{
					createRoleMiddleware?: (roles: string[]) => (req: Request, res: Response, next: NextFunction) => void
				}>('auth');

				if (authService && typeof authService.createRoleMiddleware === 'function') {
					middlewares.push(authService.createRoleMiddleware(action.roles));
				} else {
					this.logger.warn(`Auth service doesn't have createRoleMiddleware method`);
					// Add a fallback middleware that handles role checking
					middlewares.push((req: Request, res: Response, next: NextFunction) => {
						// Simple role check 
						if (action.roles && action.roles.length > 0 &&
							(!req.user || !req.user.role || !action.roles.includes(req.user.role))) {
							return res.status(403).json({ error: 'Forbidden', message: 'Insufficient permissions' });
						}
						next();
					});
				}
			}

			// Add action middleware
			middlewares.push(this.middleware(entityName, action.name, {
				transactional: action.transactional,
				timeout: 30000 // Default timeout
			}));

			// Register the route
			(router as any)[method](path, ...middlewares);

			this.logger.info(`Registered ${method.toUpperCase()} ${path} -> ${entityName}.${action.name}`);
		}
	}
}

/**
 * Create action middleware
 * @param appContext Application context
 * @returns Action middleware
 */
export function createActionMiddleware(appContext: AppContext): ActionMiddleware {
	return new ActionMiddleware(appContext);
}