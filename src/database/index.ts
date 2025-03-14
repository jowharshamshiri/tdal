/**
 * Core database components index file
 * Exports all database core interfaces, types, and classes
 */
// Now export everything else from core
export * from "./core/types";
export * from "./core/connection-types";

export * from "./orm";

// Database context
export { DatabaseContext } from "./core/database-context";

// Database factory
export { DatabaseFactory } from "./core/database-factory";

// Query builders - use explicit import to avoid name conflicts
import { QueryBuilder as OrmQueryBuilder } from "./query/query-builder";
export type { OrmQueryBuilder };

// Export other modules
export * from "./orm";
export * from "./adapters";
export * from "./schema/schema-loader";

// Export configureDatabase, getDatabase, and closeDatabase helper functions
import { DatabaseContext } from "./core/database-context";
export const configureDatabase =
	DatabaseContext.configure.bind(DatabaseContext);
export const getDatabase = DatabaseContext.getDatabase.bind(DatabaseContext);
export const closeDatabase =
	DatabaseContext.closeDatabase.bind(DatabaseContext);

// Type functions
export function isRecord<T extends object>(
	value: unknown
): value is Record<string, T> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

// // Common types
// export interface PaginationParams {
// 	page?: number;
// 	limit?: number;
// }

// // Base record type with timestamps
// export interface BaseRecord {
// 	created_at?: string;
// 	updated_at?: string;
// }