/**
 * API Context
 * Provides request/response context for API operations
 */

import { Request, Response, NextFunction } from 'express';
import { AppContext } from '../core/app-context';
import { ControllerContext, HookContext } from '../core/types';
import { DatabaseAdapter } from '../database/core/types';
import { EntityDao } from '../entity/entity-manager';
import { EntityConfig } from '../entity/entity-config';
import { Logger } from '../logging';

/**
 * API context options
 */
export interface ApiContextOptions {
	/**
	 * Entity name
	 */
	entityName: string;

	/**
	 * Operation name
	 */
	operation: string;

	/**
	 * Additional context data
	 */
	data?: Record<string, any>;
}

/**
 * API context
 * Stores request/response context for API operations
 */
export class ApiContext implements ControllerContext, HookContext {
	/**
	 * Entity name
	 */
	readonly entityName: string;

	/**
	 * Operation name
	 */
	readonly operation: string;

	/**
	 * Express request
	 */
	readonly request: Request;

	/**
	 * Express response
	 */
	readonly response: Response;

	/**
	 * Express next function
	 */
	readonly next: NextFunction;

	/**
	 * Route parameters
	 */
	readonly params: Record<string, string>;

	/**
	 * Query parameters
	 */
	readonly query: Record<string, any>;

	/**
	 * Request body
	 */
	readonly body: any;

	/**
	 * Context data
	 */
	readonly data: Record<string, any> = {};

	/**
	 * Authenticated user
	 */
	readonly user?: any;

	/**
	 * Database adapter
	 */
	readonly db: DatabaseAdapter;

	/**
	 * Logger instance
	 */
	readonly logger: Logger;

	/**
	 * Application context
	 */
	readonly appContext: AppContext;

	/**
	 * Action name (for action operations)
	 */
	action?: string;

	/**
	 * Entity manager
	 */
	private _entityManager?: EntityDao<any>;

	/**
	 * Constructor
	 * @param request Express request
	 * @param response Express response
	 * @param next Express next function
	 * @param appContext Application context
	 * @param options API context options
	 */
	constructor(
		request: Request,
		response: Response,
		next: NextFunction,
		appContext: AppContext,
		options: ApiContextOptions
	) {
		this.request = request;
		this.response = response;
		this.next = next;
		this.appContext = appContext;

		this.entityName = options.entityName;
		this.operation = options.operation;
		this.data = options.data || {};

		this.db = appContext.getDatabase();
		this.logger = appContext.getLogger();

		this.params = request.params || {};
		this.query = request.query || {};
		this.body = request.body || {};

		// Get user from request if authenticated
		this.user = (request as any).user;
	}

	/**
	 * Get entity manager
	 * @returns Entity manager
	 */
	getEntityManager<T = any>(): EntityDao<T> {
		if (!this._entityManager) {
			this._entityManager = this.appContext.getEntityManager(this.entityName);
		}

		return this._entityManager as EntityDao<T>;
	}

	/**
	 * Get entity configuration
	 * @returns Entity configuration
	 */
	getEntityConfig(): EntityConfig {
		return this.appContext.getEntityConfig(this.entityName);
	}

	/**
	 * Get a service from the application context
	 * @param name Service name
	 * @returns Service instance
	 */
	getService<T>(name: string): T {
		return this.appContext.getService<T>(name);
	}

	/**
	 * Get entity manager for a specific entity
	 * @param entityName Entity name
	 * @returns Entity manager for the specified entity
	 */
	getEntityManagerFor<T>(entityName: string): EntityDao<T> {
		return this.appContext.getEntityManager<T>(entityName);
	}

	/**
	 * Send JSON response
	 * @param data Response data
	 * @param status HTTP status code
	 */
	sendJson(data: any, status: number = 200): void {
		this.response.status(status).json(data);
	}

	/**
	 * Send success response
	 * @param data Response data
	 * @param message Success message
	 * @param status HTTP status code
	 */
	sendSuccess(data: any, message?: string, status: number = 200): void {
		this.response.status(status).json({
			success: true,
			data,
			message,
			status
		});
	}

	/**
	 * Send error response
	 * @param message Error message
	 * @param status HTTP status code
	 * @param errorType Error type
	 * @param details Additional error details
	 */
	sendError(
		message: string,
		status: number = 400,
		errorType: string = 'BadRequest',
		details?: Record<string, any>
	): void {
		const error = {
			success: false,
			error: errorType,
			message,
			status,
			...(details && { details })
		};

		this.response.status(status).json(error);
	}

	/**
	 * Check if the request has a specific role
	 * @param role Role to check
	 * @returns Whether the user has the role
	 */
	hasRole(role: string): boolean {
		if (!this.user || !this.user.role) {
			return false;
		}

		// Try to get authentication service for role checking
		try {
			const authService = this.appContext.getService<{ hasRole: (user: any, role: string) => boolean }>('auth');
			if (authService && typeof authService.hasRole === 'function') {
				return authService.hasRole(this.user, role);
			}
		} catch (error: any) {
			this.logger.debug('Authentication service not available for role check');
		}

		// Simple role check fallback
		if (this.user.role === role) {
			return true;
		}

		// Admin role has access to everything
		if (this.user.role === 'admin') {
			return true;
		}

		return false;
	}

	/**
	 * Check if the request has permission for an operation
	 * @param operation Operation to check
	 * @returns Whether the user has permission
	 */
	hasPermission(operation?: string): boolean {
		if (!this.user) {
			return false;
		}

		const op = operation || this.operation;
		const entityConfig = this.getEntityConfig();

		// Check if operation exists in entity API configuration
		if (!entityConfig.api || entityConfig.api.operations?.[op] === false) {
			return false;
		}

		// Try to use permission validator service if available
		try {
			const permissionValidator = this.appContext.getService<{ validate: (user: any, entityConfig: EntityConfig, operation: string) => boolean }>('permissionValidator');
			if (permissionValidator && typeof permissionValidator.validate === 'function') {
				return permissionValidator.validate(this.user, entityConfig, op);
			}
		} catch (error: any) {
			this.logger.debug('Permission validator service not available');
		}

		// Fallback to basic permission check
		const permissions = entityConfig.api.permissions?.[op];
		if (!permissions || permissions.length === 0) {
			// If no permissions are specified, default to requiring admin role
			return this.hasRole('admin');
		}

		// Check if user has any of the required roles
		for (const role of permissions) {
			if (this.hasRole(role)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Get request IP address
	 * @returns IP address
	 */
	getIpAddress(): string {
		return this.request.ip ||
			(this.request.headers['x-forwarded-for'] as string) ||
			'unknown';
	}

	/**
	 * Get request user agent
	 * @returns User agent string
	 */
	getUserAgent(): string {
		return this.request.headers['user-agent'] || 'unknown';
	}

	/**
	 * Set context data
	 * @param key Data key
	 * @param value Data value
	 */
	setData<T>(key: string, value: T): void {
		this.data[key] = value;
	}

	/**
	 * Get context data
	 * @param key Data key
	 * @param defaultValue Default value if not found
	 * @returns Data value
	 */
	getData<T>(key: string, defaultValue?: T): T | undefined {
		return (this.data[key] as T) ?? defaultValue;
	}

	/**
	 * Create a child context for a different entity
	 * @param entityName Entity name
	 * @param operation Operation name
	 * @param additionalData Additional context data
	 * @returns Child API context
	 */
	createChildContext(
		entityName: string,
		operation: string,
		additionalData: Record<string, any> = {}
	): ApiContext {
		return new ApiContext(
			this.request,
			this.response,
			this.next,
			this.appContext,
			{
				entityName,
				operation,
				data: { ...this.data, ...additionalData }
			}
		);
	}
}

/**
 * Create API context
 * @param req Express request
 * @param res Express response
 * @param next Express next function
 * @param appContext Application context
 * @param options API context options
 * @returns API context
 */
export function createApiContext(
	req: Request,
	res: Response,
	next: NextFunction,
	appContext: AppContext,
	options: ApiContextOptions
): ApiContext {
	return new ApiContext(req, res, next, appContext, options);
}