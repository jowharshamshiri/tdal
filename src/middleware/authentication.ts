/**
 * Authentication Service
 * Handles JWT validation and user authentication
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppContext } from '../core/app-context';
import { Logger, AuthenticationOptions, AuthenticationResult } from '../core/types';
import { EntityConfig } from '../entity/entity-config';
import { createApiError } from '../core/types';

/**
 * Authentication service
 */
export class AuthenticationService {
	/**
	 * JWT secret key
	 */
	private secret: string;

	/**
	 * Logger instance
	 */
	private logger: Logger;

	/**
	 * Application context
	 */
	private appContext: AppContext;

	/**
	 * Constructor
	 * @param appContext Application context
	 */
	constructor(appContext: AppContext) {
		this.appContext = appContext;

		// Get authentication configuration from app context
		const config = appContext.getConfig();
		this.secret = config.auth?.secret || process.env.JWT_SECRET || 'default-secret-change-this';
		this.logger = appContext.getLogger();

		this.logger.info('Authentication service initialized');
	}

	/**
	 * Verify JWT token
	 * @param token JWT token
	 * @returns Decoded token payload
	 */
	async verifyToken(token: string): Promise<any> {
		try {
			return jwt.verify(token, this.secret);
		} catch (error) {
			this.logger.error(`Token verification failed: ${error.message}`);
			throw createApiError(`Invalid token: ${error.message}`, 401, 'AuthenticationError');
		}
	}

	/**
	 * Generate JWT token
	 * @param payload Token payload
	 * @param expiresIn Token expiration time
	 * @returns JWT token
	 */
	generateToken(payload: any, expiresIn: string = '24h'): string {
		return jwt.sign(payload, this.secret, { expiresIn });
	}

	/**
	 * Check if user has a specific role
	 * @param user User object
	 * @param role Role to check
	 * @returns Whether the user has the role
	 */
	hasRole(user: any, role: string): boolean {
		if (!user || !user.role) {
			return false;
		}

		// Direct role match
		if (user.role === role) {
			return true;
		}

		// Handle role hierarchy
		const config = this.appContext.getConfig();
		const roles = config.auth?.roles || [];

		// Find user's role in the hierarchy
		const userRole = roles.find(r => r.name === user.role);
		if (!userRole) {
			return false;
		}

		// Admin role has access to everything
		if (user.role === 'admin') {
			return true;
		}

		// Check role inheritance
		if (userRole.inherits) {
			const inheritedRoles = Array.isArray(userRole.inherits)
				? userRole.inherits
				: [userRole.inherits];

			for (const inheritedRole of inheritedRoles) {
				if (inheritedRole === role) {
					return true;
				}

				// Recursively check inherited roles
				const hasInheritedRole = this.hasRole({ role: inheritedRole }, role);
				if (hasInheritedRole) {
					return true;
				}
			}
		}

		return false;
	}

	/**
	 * Check if user has permission for an entity operation
	 * @param user User object
	 * @param entity Entity configuration
	 * @param operation Operation to check
	 * @returns Whether the user has permission
	 */
	hasPermission(user: any, entity: EntityConfig, operation: string): boolean {
		if (!user || !entity || !operation) {
			return false;
		}

		// Check if operation exists in entity API configuration
		if (!entity.api || entity.api.operations?.[operation] === false) {
			return false;
		}

		// Check role-based permissions
		const permissions = entity.api.permissions;

		if (permissions && permissions[operation]) {
			const requiredRoles = permissions[operation];

			// Check if user has one of the required roles
			for (const role of requiredRoles) {
				if (this.hasRole(user, role)) {
					return true;
				}
			}

			return false;
		}

		// If no permissions are specified, default to requiring admin role
		return this.hasRole(user, 'admin');
	}

	/**
	 * Create authentication middleware
	 * @param options Authentication options
	 * @returns Express middleware
	 */
	middleware(options: AuthenticationOptions = {}): (req: Request, res: Response, next: NextFunction) => Promise<void> {
		const { required = true, roles = [], entity, operation } = options;
		const secret = options.secret || this.secret;

		return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
			try {
				// Extract token from Authorization header
				const authHeader = req.headers.authorization;
				if (!authHeader) {
					if (required) {
						return this.handleAuthError(res, 'Authentication required', 401);
					} else {
						return next();
					}
				}

				// Parse token
				const token = authHeader.startsWith('Bearer ')
					? authHeader.substring(7)
					: authHeader;

				if (!token) {
					if (required) {
						return this.handleAuthError(res, 'Invalid token format', 401);
					} else {
						return next();
					}
				}

				// Custom authentication check if provided
				if (options.customAuth) {
					const isValid = await options.customAuth(req, res, token);
					if (!isValid) {
						return this.handleAuthError(res, 'Authentication failed', 401);
					}
				}

				// Verify token
				let payload;
				try {
					payload = jwt.verify(token, secret);
				} catch (error) {
					if (required) {
						return this.handleAuthError(res, `Invalid token: ${error.message}`, 401);
					} else {
						return next();
					}
				}

				// Attach user to request
				(req as any).user = payload;

				// Check role if specified
				if (roles.length > 0) {
					const hasRequiredRole = roles.some(role => this.hasRole(payload, role));
					if (!hasRequiredRole) {
						return this.handleAuthError(res, 'Insufficient permissions', 403);
					}
				}

				// Check entity permissions if specified
				if (entity && operation) {
					try {
						const entityConfig = this.appContext.getEntityConfig(entity);
						const hasPermission = this.hasPermission(payload, entityConfig, operation);

						if (!hasPermission) {
							return this.handleAuthError(res, `Insufficient permissions for ${entity}.${operation}`, 403);
						}
					} catch (error) {
						this.logger.error(`Error checking entity permissions: ${error.message}`);
						return this.handleAuthError(res, 'Error checking permissions', 500);
					}
				}

				// Authentication successful
				next();
			} catch (error) {
				this.logger.error(`Authentication error: ${error.message}`);
				return this.handleAuthError(res, 'Authentication error', 500);
			}
		};
	}

	/**
	 * Handle authentication error
	 * @param res Express response
	 * @param message Error message
	 * @param statusCode HTTP status code
	 */
	private handleAuthError(res: Response, message: string, statusCode: number): void {
		res.status(statusCode).json({
			error: statusCode === 401 ? 'AuthenticationError' : 'AuthorizationError',
			message,
			status: statusCode
		});
	}

	/**
	 * Authenticate a request (programmatic usage)
	 * @param req Express request
	 * @param options Authentication options
	 * @returns Authentication result
	 */
	async authenticate(req: Request, options: AuthenticationOptions = {}): Promise<AuthenticationResult> {
		try {
			// Extract token from Authorization header
			const authHeader = req.headers.authorization;
			if (!authHeader) {
				return {
					authenticated: false,
					error: 'Authentication required',
					statusCode: 401
				};
			}

			// Parse token
			const token = authHeader.startsWith('Bearer ')
				? authHeader.substring(7)
				: authHeader;

			if (!token) {
				return {
					authenticated: false,
					error: 'Invalid token format',
					statusCode: 401
				};
			}

			// Custom authentication check if provided
			if (options.customAuth) {
				const isValid = await options.customAuth(req, {} as Response, token);
				if (!isValid) {
					return {
						authenticated: false,
						error: 'Authentication failed',
						statusCode: 401
					};
				}
			}

			// Verify token
			const secret = options.secret || this.secret;
			let payload;
			try {
				payload = jwt.verify(token, secret);
			} catch (error) {
				return {
					authenticated: false,
					error: `Invalid token: ${error.message}`,
					statusCode: 401
				};
			}

			// Check role if specified
			const { roles = [] } = options;
			if (roles.length > 0) {
				const hasRequiredRole = roles.some(role => this.hasRole(payload, role));
				if (!hasRequiredRole) {
					return {
						authenticated: false,
						error: 'Insufficient permissions',
						statusCode: 403
					};
				}
			}

			// Check entity permissions if specified
			const { entity, operation } = options;
			if (entity && operation) {
				try {
					const entityConfig = this.appContext.getEntityConfig(entity);
					const hasPermission = this.hasPermission(payload, entityConfig, operation);

					if (!hasPermission) {
						return {
							authenticated: false,
							error: `Insufficient permissions for ${entity}.${operation}`,
							statusCode: 403
						};
					}
				} catch (error) {
					this.logger.error(`Error checking entity permissions: ${error.message}`);
					return {
						authenticated: false,
						error: 'Error checking permissions',
						statusCode: 500
					};
				}
			}

			// Authentication successful
			return {
				authenticated: true,
				user: payload
			};
		} catch (error) {
			this.logger.error(`Authentication error: ${error.message}`);
			return {
				authenticated: false,
				error: 'Authentication error',
				statusCode: 500
			};
		}
	}

	/**
	 * Create role middleware
	 * @param roles Roles to check
	 * @returns Express middleware
	 */
	createRoleMiddleware(roles: string[]): (req: Request, res: Response, next: NextFunction) => Promise<void> {
		return this.middleware({ required: true, roles });
	}

	/**
	 * Create entity permission middleware
	 * @param entity Entity name
	 * @param operation Operation name
	 * @returns Express middleware
	 */
	createPermissionMiddleware(entity: string, operation: string): (req: Request, res: Response, next: NextFunction) => Promise<void> {
		return this.middleware({ required: true, entity, operation });
	}
}

/**
 * Create authentication middleware
 * @param appContext Application context
 * @param options Authentication options
 * @returns Express middleware
 */
export function createAuthenticationMiddleware(
	appContext: AppContext,
	options: AuthenticationOptions = {}
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
	const authService = new AuthenticationService(appContext);
	return authService.middleware(options);
}