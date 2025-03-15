/**
 * Permission Validator
 * Validates user permissions for entity operations
 */

import { AppContext } from '../core/app-context';
import { EntityConfig } from '../entity/entity-config';
import { Logger } from '../core/types';
import { resolveRoleInheritance } from './auth-config';
import { HookContext } from '../hooks/hook-context';

/**
 * Custom permission condition
 */
export interface PermissionCondition {
	/**
	 * Entity name
	 */
	entity: string;

	/**
	 * Operation name
	 */
	operation: string;

	/**
	 * Condition function
	 */
	condition: (user: any, entityConfig: EntityConfig, context?: HookContext) => boolean | Promise<boolean>;
}

/**
 * Permission validation result
 */
export interface PermissionResult {
	/**
	 * Whether the user has permission
	 */
	allowed: boolean;

	/**
	 * Error message if not allowed
	 */
	message?: string;

	/**
	 * Reason for the decision
	 */
	reason?: string;
}

/**
 * Permission validator class
 * Validates user permissions for entity operations
 */
export class PermissionValidator {
	/**
	 * Custom permission conditions
	 */
	private customConditions: Map<string, PermissionCondition[]> = new Map();

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
		this.logger = appContext.getLogger();
	}

	/**
	 * Validate permissions for an entity operation
	 * @param user User object with role property
	 * @param entityConfig Entity configuration
	 * @param operation Operation name
	 * @param context Optional hook context
	 * @returns Whether the user has permission
	 */
	async validate(
		user: any,
		entityConfig: EntityConfig,
		operation: string,
		context?: HookContext
	): Promise<boolean> {
		// Public operations don't require authentication
		if (this.isPublicOperation(entityConfig, operation)) {
			return true;
		}

		// No user means no permissions
		if (!user) {
			return false;
		}

		// Extract user role
		const userRole = user.role;
		if (!userRole) {
			return false;
		}

		// Admin role has access to everything
		if (userRole === 'admin') {
			return true;
		}

		// Check entity API permissions
		if (entityConfig.api && entityConfig.api.permissions) {
			const operationPermissions = entityConfig.api.permissions[operation];

			if (operationPermissions && operationPermissions.length > 0) {
				// Get all roles including inherited ones
				const roles = this.appContext.getConfig().auth?.roles || [];
				const allRoles = resolveRoleInheritance(userRole, roles);

				// Check if user has any of the required roles
				const hasRole = operationPermissions.some(role => allRoles.includes(role));

				if (hasRole) {
					// Check custom conditions
					return await this.checkCustomConditions(user, entityConfig, operation, context);
				}

				return false;
			}
		}

		// Default to denying access if no permissions are specified
		return false;
	}

	/**
	 * Get detailed permission result
	 * @param user User object with role property
	 * @param entityConfig Entity configuration
	 * @param operation Operation name
	 * @param context Optional hook context
	 * @returns Permission result with details
	 */
	async getPermissionResult(
		user: any,
		entityConfig: EntityConfig,
		operation: string,
		context?: HookContext
	): Promise<PermissionResult> {
		// Public operations don't require authentication
		if (this.isPublicOperation(entityConfig, operation)) {
			return {
				allowed: true,
				reason: 'Public operation'
			};
		}

		// No user means no permissions
		if (!user) {
			return {
				allowed: false,
				message: 'Authentication required',
				reason: 'Not authenticated'
			};
		}

		// Extract user role
		const userRole = user.role;
		if (!userRole) {
			return {
				allowed: false,
				message: 'User role not defined',
				reason: 'Missing role'
			};
		}

		// Admin role has access to everything
		if (userRole === 'admin') {
			return {
				allowed: true,
				reason: 'Admin role'
			};
		}

		// Check entity API permissions
		if (entityConfig.api && entityConfig.api.permissions) {
			const operationPermissions = entityConfig.api.permissions[operation];

			if (operationPermissions && operationPermissions.length > 0) {
				// Get all roles including inherited ones
				const roles = this.appContext.getConfig().auth?.roles || [];
				const allRoles = resolveRoleInheritance(userRole, roles);

				// Check if user has any of the required roles
				const hasRole = operationPermissions.some(role => allRoles.includes(role));

				if (hasRole) {
					// Check custom conditions
					const passesConditions = await this.checkCustomConditions(user, entityConfig, operation, context);
					if (passesConditions) {
						return {
							allowed: true,
							reason: `Role ${userRole} has permission for ${operation}`
						};
					} else {
						return {
							allowed: false,
							message: 'Permission denied by custom condition',
							reason: 'Failed custom condition'
						};
					}
				}

				return {
					allowed: false,
					message: `User role ${userRole} does not have permission for ${operation}`,
					reason: 'Insufficient role permissions'
				};
			}
		}

		// Default to denying access if no permissions are specified
		return {
			allowed: false,
			message: 'No permissions defined for this operation',
			reason: 'No permission configuration'
		};
	}

	/**
	 * Check if an operation is public (no authentication required)
	 * @param entityConfig Entity configuration
	 * @param operation Operation name
	 * @returns Whether the operation is public
	 */
	private isPublicOperation(entityConfig: EntityConfig, operation: string): boolean {
		// Operations that are specifically marked as requiring no authentication
		const publicOperations = ['getAll', 'getById'];

		// Check if the entity specifically designates this operation as public
		if (entityConfig.api && entityConfig.api.permissions) {
			const operationPermissions = entityConfig.api.permissions[operation];

			if (Array.isArray(operationPermissions) && operationPermissions.includes('public')) {
				return true;
			}
		}

		// For read operations, check if they're public by default
		if (publicOperations.includes(operation) && entityConfig.api?.operations?.[operation] !== false) {
			// If no permissions are specified for these operations, they're public by default
			const hasPermissions = entityConfig.api?.permissions?.[operation];
			if (!hasPermissions) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Check custom permission conditions
	 * @param user User object
	 * @param entityConfig Entity configuration
	 * @param operation Operation name
	 * @param context Optional hook context
	 * @returns Whether all custom conditions pass
	 */
	private async checkCustomConditions(
		user: any,
		entityConfig: EntityConfig,
		operation: string,
		context?: HookContext
	): Promise<boolean> {
		const entityName = entityConfig.entity;
		const key = `${entityName}:${operation}`;

		// Check custom conditions for this entity and operation
		const conditions = this.customConditions.get(key) || [];

		for (const condition of conditions) {
			try {
				const result = await Promise.resolve(condition.condition(user, entityConfig, context));
				if (!result) {
					this.logger.debug(`Custom permission condition failed for ${entityName}.${operation}`);
					return false;
				}
			} catch (error) {
				this.logger.error(`Error in custom permission condition for ${entityName}.${operation}: ${error.message}`);
				return false;
			}
		}

		return true;
	}

	/**
	 * Register a custom permission condition
	 * @param condition Permission condition
	 */
	registerCondition(condition: PermissionCondition): void {
		const key = `${condition.entity}:${condition.operation}`;

		if (!this.customConditions.has(key)) {
			this.customConditions.set(key, []);
		}

		this.customConditions.get(key)!.push(condition);
		this.logger.debug(`Registered custom permission condition for ${condition.entity}.${condition.operation}`);
	}

	/**
	 * Check if a user has a specific role
	 * @param user User object with role property
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

		// Admin role has access to everything
		if (user.role === 'admin') {
			return true;
		}

		// Check role inheritance
		const roles = this.appContext.getConfig().auth?.roles || [];
		const allRoles = resolveRoleInheritance(user.role, roles);

		return allRoles.includes(role);
	}

	/**
	 * Check if a user has any of the specified roles
	 * @param user User object with role property
	 * @param roles Roles to check
	 * @returns Whether the user has any of the roles
	 */
	hasAnyRole(user: any, roles: string[]): boolean {
		return roles.some(role => this.hasRole(user, role));
	}

	/**
	 * Check record-level access
	 * @param user User object
	 * @param entityConfig Entity configuration
	 * @param record Record data
	 * @param operation Operation name
	 * @returns Whether the user has access to the record
	 */
	checkRecordAccess(
		user: any,
		entityConfig: EntityConfig,
		record: any,
		operation: string
	): boolean {
		// No user means no access
		if (!user) {
			return false;
		}

		// Admin role has access to all records
		if (user.role === 'admin') {
			return true;
		}

		// Check for record-level access control configuration
		if (entityConfig.api?.recordAccess) {
			// If there's a condition string, evaluate it
			const condition = entityConfig.api.recordAccess.condition;

			if (condition) {
				try {
					// Create a function that evaluates the condition
					const conditionFn = new Function('user', 'record', `return ${condition};`);
					return conditionFn(user, record);
				} catch (error) {
					this.logger.error(`Error evaluating record access condition for ${entityConfig.entity}: ${error.message}`);
					return false;
				}
			}

			// Check for owner-based access control
			if (entityConfig.api.recordAccess.ownerField) {
				const ownerField = entityConfig.api.recordAccess.ownerField;

				// If the record has an owner field and it matches the user ID
				if (record[ownerField] !== undefined) {
					const recordOwnerId = record[ownerField];
					const userId = user.id || user.user_id;

					return recordOwnerId == userId; // Use == for type coercion
				}
			}
		}

		// Default to allowing access if no record-level access control is configured
		return true;
	}
}

/**
 * Create a permission validator
 * @param appContext Application context
 * @returns Permission validator instance
 */
export function createPermissionValidator(appContext: AppContext): PermissionValidator {
	return new PermissionValidator(appContext);
}