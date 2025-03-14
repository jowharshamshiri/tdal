/**
 * ORM components index file
 * Exports all ORM interfaces, types, and classes
 */

// Relationship types
export * from "./relation-types";

// Date functions
export * from "./date-functions";

/**
 * Create a type-safe entity mapping
 * @param mapping Entity mapping configuration
 * @returns Typed entity mapping
 */
export function createEntityMapping<T>(mapping: Record<string, unknown>): T {
	return mapping as T;
}
