/**
 * Field Access Control
 * Manages field-level access control for entities
 */

import { EntityConfig, ColumnMapping } from '@/entity/entity-config';
import { HookContext, Logger } from '@/core/types';
import { resolveRoleInheritance } from './auth-config';

/**
 * Field access control handler
 */
export class FieldAccessControl {
	private logger: Logger;

	/**
	 * Constructor
	 * @param logger Logger instance
	 */
	constructor(logger: Logger) {
		this.logger = logger;
	}

	/**
	 * Filter entity data for read access
	 * Removes fields the user doesn't have access to read
	 * 
	 * @param entity Entity configuration
	 * @param data Entity data
	 * @param context Hook context with user information
	 * @returns Filtered entity data
	 */
	filterReadAccess<T>(entity: EntityConfig, data: T, context: HookContext): Partial<T> {
		if (!data) return data;
		if (!context.user) return data; // Public access returns all fields

		const userRole = context.user.role;
		if (!userRole) return data;

		// Admin role has access to everything
		if (userRole === 'admin') return data;

		// Get readable fields for the user's role
		const readableFields = this.getReadableFields(entity, userRole);

		// Clone the data
		const result: Partial<T> = {};

		// Include only readable fields
		for (const field of readableFields) {
			if (typeof data === 'object' && data !== null && field in data) {
				result[field as keyof T] = data[field as keyof T];
			}
		}

		return result;
	}

	/**
	 * Filter entity data for write access
	 * Removes fields the user doesn't have access to write
	 * 
	 * @param entity Entity configuration
	 * @param data Entity data
	 * @param context Hook context with user information
	 * @returns Filtered entity data for writing
	 */
	filterWriteAccess<T>(entity: EntityConfig, data: T, context: HookContext): Partial<T> {
		if (!data) return data;
		if (!context.user) return {}; // No write access for unauthenticated users

		const userRole = context.user.role;
		if (!userRole) return {};

		// Admin role has access to everything
		if (userRole === 'admin') return data;

		// Get writable fields for the user's role
		const writableFields = this.getWritableFields(entity, userRole);

		// Clone the data
		const result: Partial<T> = {};

		// Include only writable fields
		for (const field of writableFields) {
			if (typeof data === 'object' && data !== null && field in data) {
				result[field as keyof T] = data[field as keyof T];
			}
		}

		return result;
	}

	/**
	 * Get readable fields for a role
	 * @param entity Entity configuration
	 * @param role User role
	 * @returns Array of field names that are readable by the role
	 */
	getReadableFields(entity: EntityConfig, role: string): string[] {
		// Get all roles including inherited ones
		const roles = (entity.api as any)?.roles || [];
		const allRoles = resolveRoleInheritance(role, roles);

		// Start with all fields
		const fields = entity.columns.map(col => col.logical);
		const result: string[] = [];

		// Check each field for read access
		for (const column of entity.columns) {
			// Skip fields explicitly marked as not readable
			if (column.api?.readable === false) {
				continue;
			}

			// Fields with role-based access
			if (column.api?.roles?.read && column.api.roles.read.length > 0) {
				// Check if any of the user's roles have access
				const hasAccess = column.api.roles.read.some(r => allRoles.includes(r));
				if (hasAccess) {
					result.push(column.logical);
				}
				continue;
			}

			// Check entity-level field permissions
			const fieldPermissions = entity.api?.fields?.[column.logical];
			if (fieldPermissions && fieldPermissions.read && fieldPermissions.read.length > 0) {
				// Check if any of the user's roles have access
				const hasAccess = fieldPermissions.read.some(r => allRoles.includes(r));
				if (hasAccess) {
					result.push(column.logical);
				}
				continue;
			}

			// Default to allowing read access
			result.push(column.logical);
		}

		return result;
	}

	/**
	 * Get writable fields for a role
	 * @param entity Entity configuration
	 * @param role User role
	 * @returns Array of field names that are writable by the role
	 */
	getWritableFields(entity: EntityConfig, role: string): string[] {
		// Get all roles including inherited ones
		const roles = (entity.api as any)?.roles || [];
		const allRoles = resolveRoleInheritance(role, roles);

		// Start with all fields
		const fields = entity.columns.map(col => col.logical);
		const result: string[] = [];

		// Check each field for write access
		for (const column of entity.columns) {
			// Skip auto-generated fields
			if (column.autoIncrement) {
				continue;
			}

			// Skip fields explicitly marked as not writable
			if (column.api?.writable === false) {
				continue;
			}

			// Fields with role-based access
			if (column.api?.roles?.write && column.api.roles.write.length > 0) {
				// Check if any of the user's roles have access
				const hasAccess = column.api.roles.write.some(r => allRoles.includes(r));
				if (hasAccess) {
					result.push(column.logical);
				}
				continue;
			}

			// Check entity-level field permissions
			const fieldPermissions = entity.api?.fields?.[column.logical];
			if (fieldPermissions && fieldPermissions.write && fieldPermissions.write.length > 0) {
				// Check if any of the user's roles have access
				const hasAccess = fieldPermissions.write.some(r => allRoles.includes(r));
				if (hasAccess) {
					result.push(column.logical);
				}
				continue;
			}

			// Default to allowing write access
			result.push(column.logical);
		}

		return result;
	}

	/**
	 * Check if a user has read access to a specific field
	 * @param entity Entity configuration
	 * @param fieldName Field name
	 * @param role User role
	 * @returns Whether the user has read access to the field
	 */
	hasReadAccess(entity: EntityConfig, fieldName: string, role: string): boolean {
		return this.getReadableFields(entity, role).includes(fieldName);
	}

	/**
	 * Check if a user has write access to a specific field
	 * @param entity Entity configuration
	 * @param fieldName Field name
	 * @param role User role
	 * @returns Whether the user has write access to the field
	 */
	hasWriteAccess(entity: EntityConfig, fieldName: string, role: string): boolean {
		return this.getWritableFields(entity, role).includes(fieldName);
	}
}

/**
 * Create a field access control handler
 * @param logger Logger instance
 * @returns Field access control handler
 */
export function createFieldAccessControl(logger: Logger): FieldAccessControl {
	return new FieldAccessControl(logger);
}