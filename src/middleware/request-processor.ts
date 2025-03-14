/**
 * Request Processor
 * Processes HTTP requests for the API
 */

import { Request, Response, NextFunction } from 'express';
import { Logger, RequestProcessorOptions, ControllerContext } from '../core/types';
import { createControllerContext } from '../entity/entity-manager';

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
	constructor(private context: any, private logger: Logger) { }

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
		} catch (error) {
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
	}

	/**
	 * Validate request
	 * @param req Express request
	 * @param context Controller context
	 */
	private async validateRequest(req: Request, context: ControllerContext): Promise<void> {
		// Get entity configuration
		const entityName = context.entityName;
		const operation = context.operation;

		try {
			// Get entity configuration
			const entityConfig = this.context.getEntityConfig(entityName);

			// Check if entity exists
			if (!entityConfig) {
				throw new Error(`Entity not found: ${entityName}`);
			}

			// Check if entity has validation rules
			if (!entityConfig.validation || !entityConfig.validation.rules) {
				// No validation rules defined
				return;
			}

			// Get validation rules for the request
			let dataToValidate: Record<string, unknown> = {};

			switch (operation) {
				case 'create':
				case 'update':
					dataToValidate = req.body || {};
					break;
				case 'getById':
				case 'delete':
					dataToValidate = { id: req.params.id };
					break;
				case 'getAll':
					dataToValidate = req.query || {};
					break;
				default:
					// For custom operations, validate based on method
					if (req.method === 'GET') {
						dataToValidate = req.query || {};
					} else {
						dataToValidate = req.body || {};
					}
			}

			// Validate data against rules
			const validationErrors: string[] = [];
			const rules = entityConfig.validation.rules;

			// Apply validation rules
			for (const [field, fieldRules] of Object.entries(rules)) {
				// Skip fields not present in the data (unless required)
				if (!(field in dataToValidate) && !fieldRules.some(rule => rule.type === 'required')) {
					continue;
				}

				const value = dataToValidate[field];

				// Apply each rule for the field
				for (const rule of fieldRules) {
					// Skip rules not applicable to API
					if (rule.applyToApi === false) {
						continue;
					}

					let isValid = true;

					switch (rule.type) {
						case 'required':
							isValid = value !== undefined && value !== null && value !== '';
							break;
						case 'minLength':
							isValid = typeof value === 'string' && value.length >= (rule.value as number);
							break;
						case 'maxLength':
							isValid = typeof value === 'string' && value.length <= (rule.value as number);
							break;
						case 'min':
							isValid = typeof value === 'number' && value >= (rule.value as number);
							break;
						case 'max':
							isValid = typeof value === 'number' && value <= (rule.value as number);
							break;
						case 'pattern':
							isValid = typeof value === 'string' && new RegExp(rule.value as string).test(value);
							break;
						case 'email':
							isValid = typeof value === 'string' && /^[^@]+@[^@]+\.[^@]+$/.test(value);
							break;
						case 'custom':
							// Custom rules would be implemented by the application
							this.logger.warn(`Custom validation not implemented for ${entityName}.${field}`);
							isValid = true;
							break;
					}

					if (!isValid) {
						validationErrors.push(rule.message);
					}
				}
			}

			// If there are validation errors, throw an error
			if (validationErrors.length > 0) {
				const error = new Error(validationErrors.join(', '));
				error.name = 'ValidationError';
				(error as any).status = 400;
				(error as any).errors = validationErrors;
				throw error;
			}
		} catch (error) {
			// Rethrow validation errors
			if (error.name === 'ValidationError') {
				throw error;
			}

			// Log and wrap other errors
			this.logger.error(`Error validating request for ${entityName}: ${error.message}`);

			const validationError = new Error(`Request validation failed: ${error.message}`);
			validationError.name = 'ValidationError';
			(validationError as any).status = 400;
			throw validationError;
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
			const authService = this.context.getService('authService');

			if (!authService) {
				this.logger.warn('Authentication service not found');
				return;
			}

			// Extract token from authorization header
			const token = authHeader.startsWith('Bearer ') ?
				authHeader.substring(7) : authHeader;

			// Verify token
			const user = await authService.verifyToken(token);

			// Set user in request
			context.user = user;

			// Set user in request object for middleware compatibility
			(req as any).user = user;
		} catch (error) {
			this.logger.error(`Authentication error: ${error.message}`);

			const authError = new Error('Authentication failed');
			authError.name = 'AuthenticationError';
			(authError as any).status = 401;
			throw authError;
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
			// Get entity configuration
			const entityConfig = this.context.getEntityConfig(entityName);

			// Check if entity exists
			if (!entityConfig) {
				throw new Error(`Entity not found: ${entityName}`);
			}

			// Check if entity has API configuration
			if (!entityConfig.api) {
				throw new Error(`Entity is not exposed via API: ${entityName}`);
			}

			// Check if operation is allowed
			if (entityConfig.api.operations && entityConfig.api.operations[operation] === false) {
				throw new Error(`Operation not allowed: ${operation}`);
			}

			// Check if user has permission for the operation
			const permissions = entityConfig.api.permissions;

			if (permissions && permissions[operation]) {
				const requiredRoles = permissions[operation];

				// Check if user has one of the required roles
				const hasPermission = requiredRoles.includes(user.role);

				if (!hasPermission) {
					throw new Error(`Insufficient permissions for ${entityName}.${operation}`);
				}
			}

			// Check record-level access control if applicable
			if (operation === 'getById' || operation === 'update' || operation === 'delete') {
				const recordAccess = entityConfig.api.recordAccess;

				if (recordAccess && recordAccess.condition) {
					// In a real implementation, you would evaluate the condition
					// against the record being accessed
					this.logger.warn(`Record-level access control not implemented for ${entityName}`);
				}
			}
		} catch (error) {
			this.logger.error(`Authorization error: ${error.message}`);

			const authError = new Error('Authorization failed');
			authError.name = 'AuthorizationError';
			(authError as any).status = 403;
			throw authError;
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
					middlewareConfig.handler(req, res, (err?: any) => {
						if (err) {
							reject(err);
						} else {
							resolve();
						}
					}, middlewareConfig.options || {}, context);
				});
			} catch (error) {
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
			error: errorType,
			message,
			status: statusCode,
			...(error.errors && { errors: error.errors })
		});
	}
}