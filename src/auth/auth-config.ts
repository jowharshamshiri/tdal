/**
 * Authentication Configuration
 * Defines configuration for authentication providers and strategies
 */

import { AuthConfig, Role } from '../core/types';
import { Logger } from '../core/types';

/**
 * Default authentication configuration
 */
export const defaultAuthConfig: AuthConfig = {
	provider: 'jwt',
	secret: process.env.JWT_SECRET || 'change-this-in-production',
	tokenExpiry: '24h',
	refreshTokenExpiry: '7d',
	userEntity: 'User',
	usernameField: 'email',
	passwordField: 'password',
	roles: [
		{
			name: 'admin',
			description: 'Administrator with full access'
		},
		{
			name: 'user',
			description: 'Standard user'
		}
	]
};

/**
 * Configure authentication options
 * @param config Authentication configuration
 * @param logger Logger instance
 * @returns Configured authentication options
 */
export function configureAuth(config: Partial<AuthConfig>, logger: Logger): AuthConfig {
	// Merge provided config with defaults
	const mergedConfig: AuthConfig = {
		...defaultAuthConfig,
		...config,
		roles: [...(defaultAuthConfig.roles || [])]
	};

	// Add or override roles
	if (config.roles) {
		for (const role of config.roles) {
			const existingIndex = mergedConfig.roles?.findIndex(r => r.name === role.name) ?? -1;
			if (existingIndex >= 0 && mergedConfig.roles) {
				mergedConfig.roles[existingIndex] = role;
			} else {
				mergedConfig.roles?.push(role);
			}
		}
	}

	logger.info(`Configured authentication with provider: ${mergedConfig.provider}`);

	return mergedConfig;
}

/**
 * Resolve role inheritance
 * @param roleName Role name
 * @param roles Array of role definitions
 * @param visited Set of already visited roles (to prevent circular references)
 * @returns Array of role names including the role and all inherited roles
 */
export function resolveRoleInheritance(
	roleName: string,
	roles: Role[],
	visited: Set<string> = new Set()
): string[] {
	// Prevent circular dependencies
	if (visited.has(roleName)) {
		return [];
	}

	// Mark as visited
	visited.add(roleName);

	// Find the role
	const role = roles.find(r => r.name === roleName);
	if (!role) {
		return [roleName];
	}

	// Start with the role itself
	const result = [roleName];

	// Add inherited roles
	if (role.inherits) {
		const inheritedRoles = Array.isArray(role.inherits)
			? role.inherits
			: [role.inherits];

		for (const inherited of inheritedRoles) {
			result.push(...resolveRoleInheritance(inherited, roles, visited));
		}
	}

	return result;
}

/**
 * Check if a role has a specific permission
 * @param roleName Role name to check
 * @param permission Permission to check for
 * @param roles Array of role definitions
 * @returns Whether the role has the permission
 */
export function roleHasPermission(
	roleName: string,
	permission: string,
	roles: Role[]
): boolean {
	// Get all roles including inherited ones
	const allRoles = resolveRoleInheritance(roleName, roles);

	// Check each role for the permission
	for (const name of allRoles) {
		const role = roles.find(r => r.name === name);
		if (role?.permissions?.includes(permission)) {
			return true;
		}
	}

	// Special case: 'admin' role has all permissions
	return allRoles.includes('admin');
}