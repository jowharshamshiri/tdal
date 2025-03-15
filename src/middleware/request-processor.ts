/**
 * Request Processor
 * Processes HTTP requests for the API with consistent validation, authentication, and authorization
 */

import { Request, Response, NextFunction } from 'express';
import { Logger, RequestProcessorOptions, ControllerContext, HookContext } from '../core/types';
import { createControllerContext } from '../entity/entity-manager';
import { AppContext } from '../core/app-context';
import { HookExecutor } from '../hooks';
import { EntityConfig } from '../entity';

/**
 * Request Processor class
 * Processes HTTP requests for the API
 */
export class RequestProcessor {
	/**
	 * Constructor
	 * @param context Application context
	 * @param logger Logger instance
	 */
	constructor(private context: AppContext, private logger: Logger) { }

	/**
	 * Process a request
	 * @param req Express request
	 * @param res Express response
	 * @param next Express next function
	 * @param options Request processor options
	 * @returns Promise resolving when request is processed
	 */
	async processRequest(
		req: Request,
		res: Response,
		next: NextFunction,
		options: RequestProcessorOptions = {}
	): Promise<void> {
		try {
			// Create context for the request
			const context = this.createRequestContext(req, res, next);

			// Parse body if enabled
			if (options.parseBody !== false) {
				await this.parseBody(req, context);
			}

			// Validate request if enabled
			if (options.validate) {
				await this.validateRequest(req, context);
			}

			// Authenticate request if enabled
			if (options.authenticate) {
				await this.authenticateRequest(req, context);
			}

			// Authorize request if enabled
			if (options.authorize) {
				await this.authorizeRequest(req, context);
			}

			// Apply custom middleware
			if (options.middleware && options.middleware.length > 0) {
				await this.applyMiddleware(req, res, next, options.middleware, context);
			}

			// Continue with next middleware or handler
			next();
		} catch (error: any) {
			// Handle errors
			this.handleError(error, req, res, next);
		}
	}

	/**
	 * Create middleware for the request processor
	 * @param options Request processor options
	 * @returns Express middleware
	 */
	middleware(options: RequestProcessorOptions = {}): (req: Request, res: Response, next: NextFunction) => Promise<void> {
		return (req: Request, res: Response, next: NextFunction) => {
			return this.processRequest(req, res, next, options);
		};
	}

	/**
	 * Create a request context
	 * @param req Express request
	 * @param res Express response
	 * @param next Express next function
	 * @returns Controller context
	 */
	private createRequestContext(
		req: Request,
		res: Response,
		next: NextFunction
	): ControllerContext {
		// Determine entity and operation from request
		let entityName = 'unknown';
		let operation = 'unknown';

		// Extract entity name from route path
		const routePath = req.path;
		const pathParts = routePath.split('/').filter(Boolean);

		if (pathParts.length > 0) {
			entityName = pathParts[0];

			// Determine operation from HTTP method and path
			switch (req.method) {
				case 'GET':
					operation = pathParts.length > 1 ? 'getById' : 'getAll';
					break;
				case 'POST':
					operation = 'create';
					break;
				case 'PUT':
				case 'PATCH':
					operation = 'update';
					break;
				case 'DELETE':
					operation = 'delete';
					break;
				default:
					operation = 'custom';
			}
		}

		return createControllerContext(
			this.context.getDatabase(),
			this.logger,
			entityName,
			operation,
			req,
			res,
			next
		);
	}

	/**
	 * Parse request body
	 * @param req Express request
	 * @param context Controller context
	 */
	private async parseBody(req: Request, context: ControllerContext): Promise<void> {
		// Body is already parsed by express.json() middleware
		// This method is a hook for additional processing

		// For example, convert snake_case to camelCase if needed
		// or handle file uploads, etc.

		// Fire beforeParseBody hooks if present
		await this.executeHook('beforeParseBody', req.body, context);
	}

	/**
	 * Validate request
	 * @param req Express request
	 * @param context Controller context
	 */
	private async validateRequest(req: Request, context: ControllerContext): Promise<void> {
		// Get validation service from context
		const validationService = this.context.getService<{ validate: (req: Request, options: any) => Promise<{ valid: boolean, statusCode?: number, errors?: any[] }> }>('validationService');
		if (!validationService) {
			this.logger.warn('Validation service not available');
			return;
		}

		// Determine validation options based on entity and operation
		const options = {
			entity: context.entityName,
			operation: context.operation
		};

		// Perform validation
		const result = await validationService.validate(req, options);

		if (!result.valid) {
			const error = new Error('Validation failed');
			error.name = 'ValidationError';
			(error as any).status = result.statusCode || 400;
			(error as any).errors = result.errors;
			throw error;
		}
	}

	/**
	 * Authenticate request
	 * @param req Express request
	 * @param context Controller context
	 */
	private async authenticateRequest(req: Request, context: ControllerContext): Promise<void> {
		// Get authorization header
		const authHeader = req.headers.authorization;

		if (!authHeader) {
			// No authorization header, continue without authentication
			// This allows public endpoints to work without authentication
			return;
		}

		try {
			// Try to get the auth service from the context
			const authService = this.context.getService<{ authenticate: (req: Request, options: any) => Promise<{ authenticated: boolean, user?: any, error?: string, statusCode?: number }> }>('auth');

			if (!authService) {
				this.logger.warn('Authentication service not found');
				return;
			}

			// Authentication options based on entity and operation
			const options = {
				entity: context.entityName,
				operation: context.operation
			};

			// Authenticate the request
			const result = await authService.authenticate(req, options);

			if (!result.authenticated) {
				const error = new Error(result.error || 'Authentication failed');
				error.name = 'AuthenticationError';
				(error as any).status = result.statusCode || 401;
				throw error;
			}

			// Set user in request and context
			context.user = result.user;
			(req as any).user = result.user;
		} catch (error: any) {
			if (error.name !== 'AuthenticationError') {
				this.logger.error(`Authentication error: ${error.message}`);

				const authError = new Error('Authentication failed');
				authError.name = 'AuthenticationError';
				(authError as any).status = 401;
				throw authError;
			}

			throw error;
		}
	}

	/**
	 * Authorize request
	 * @param req Express request
	 * @param context Controller context
	 */
	private async authorizeRequest(req: Request, context: ControllerContext): Promise<void> {
		const { entityName, operation, user } = context;

		// Skip authorization for public endpoints
		if (!user) {
			return;
		}

		try {
			// Get permission validator from context
			const permissionValidator = this.context.getService<{ validate: (user: any, entityConfig: EntityConfig, operation: string) => boolean }>('permissionValidator');

			if (!permissionValidator) {
				this.logger.warn('Permission validator not found');
				return;
			}

			// Get entity configuration
			const entityConfig = this.context.getEntityConfig(entityName);

			// Validate permission
			const hasPermission = permissionValidator.validate(user, entityConfig, operation);

			if (!hasPermission) {
				const error = new Error(`Insufficient permissions for ${entityName}.${operation}`);
				error.name = 'AuthorizationError';
				(error as any).status = 403;
				throw error;
			}

			// Check for record-level access control if applicable
			if ((operation === 'getById' || operation === 'update' || operation === 'delete')
				&& entityConfig.api?.recordAccess) {

				// Execute beforeAuthorize hook to allow custom record-level checks
				await this.executeHook('beforeAuthorize', {
					user,
					entityName,
					operation,
					recordId: req.params.id
				}, context);
			}
		} catch (error: any) {
			if (error.name !== 'AuthorizationError') {
				this.logger.error(`Authorization error: ${error.message}`);

				const authError = new Error('Authorization failed');
				authError.name = 'AuthorizationError';
				(authError as any).status = 403;
				throw authError;
			}

			throw error;
		}
	}

	/**
	 * Apply middleware
	 * @param req Express request
	 * @param res Express response
	 * @param next Express next function
	 * @param middleware Middleware to apply
	 * @param context Controller context
	 */
	private async applyMiddleware(
		req: Request,
		res: Response,
		next: NextFunction,
		middleware: string[],
		context: ControllerContext
	): Promise<void> {
		// Apply middleware in sequence
		for (const middlewareName of middleware) {
			try {
				// Get middleware configuration
				const middlewareConfig = this.context.getMiddlewareConfig(middlewareName);

				if (!middlewareConfig || !middlewareConfig.handler) {
					this.logger.warn(`Middleware not found: ${middlewareName}`);
					continue;
				}

				// Apply middleware
				await new Promise<void>((resolve, reject) => {
					if (typeof middlewareConfig.handler === 'function') {
						middlewareConfig.handler(req, res, (err?: any) => {
							if (err) {
								reject(err);
							} else {
								resolve();
							}
						}, middlewareConfig.options || {}, context);
					} else {
						this.logger.warn(`Invalid middleware handler for ${middlewareName}`);
						resolve();
					}
				});

				// If response is already sent, stop middleware chain
				if (res.headersSent) {
					break;
				}
			} catch (error: any) {
				this.logger.error(`Middleware error in ${middlewareName}: ${error.message}`);
				throw error;
			}
		}
	}

	/**
	 * Handle error
	 * @param error Error object
	 * @param req Express request
	 * @param res Express response
	 * @param next Express next function
	 */
	private handleError(
		error: any,
		req: Request,
		res: Response,
		next: NextFunction
	): void {
		// Log error
		this.logger.error(`Request processor error: ${error.message}`);

		// Get error details
		const statusCode = error.status || error.statusCode || 500;
		const errorType = error.name || error.error || 'InternalServerError';
		const message = error.message || 'An unexpected error occurred';

		// If response has already been sent, just pass to next
		if (res.headersSent) {
			return next(error);
		}

		// Send error response
		res.status(statusCode).json({
			success: false,
			error: errorType,
			message,
			status: statusCode,
			...(error.errors && { errors: error.errors })
		});
	}

	/**
	 * Execute a hook
	 * @param hookType Hook type
	 * @param data Hook data
	 * @param context Hook context
	 * @returns Hook result
	 */
	private async executeHook(hookType: string, data: any, context: HookContext): Promise<any> {
		// Get hook executor service if available
		try {
			const hookExecutor = this.context.getService<{ execute: (hookType: string, data: any, context: HookContext) => Promise<HookExecutor> }>('hookExecutor');
			if (hookExecutor) {
				return await hookExecutor.execute(hookType, data, context);
			}
		} catch (error: any) {
			this.logger.debug(`Hook executor not available: ${error.message}`);
		}

		// If no hook executor is available, just return the data
		return data;
	}
}

/**
 * Create request processor
 * @param context Application context
 * @param logger Logger instance
 * @returns Request processor instance
 */
export function createRequestProcessor(
	context: AppContext,
	logger: Logger
): RequestProcessor {
	return new RequestProcessor(context, logger);
}