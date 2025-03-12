/**
 * Core database components index file
 * Exports all database core interfaces, types, and classes
 */

// Type definitions
export * from "./types";
export * from "./connection-types";

// Database context
export { DatabaseContext } from "./database-context";

// Database factory
export { DatabaseFactory } from "./database-factory";

// Type functions
export function isRecord<T extends object>(
  value: unknown
): value is Record<string, T> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
