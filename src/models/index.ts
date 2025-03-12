/**
 * Models index file
 * Exports all application domain models
 */

// User models
export * from "./user";

// ProductCategory models
export * from "./group";

// Product models
export * from "./product";

// Credit models
export * from "./credit";

// Shopping session models
export * from "./shopping-session";

// Common types
export interface PaginationParams {
  page?: number;
  limit?: number;
}

// Base record type with timestamps
export interface BaseRecord {
  created_at?: string;
  updated_at?: string;
}

// Resource types that can be accessed with credits
export type ResourceType = "category" | "product";
