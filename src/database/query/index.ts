/**
 * Query components index file
 * Exports all query builder interfaces and implementations
 */

// Base query builder interfaces
export * from "./query-builder";

// Entity-aware query builder interfaces
export * from "./entity-query-builder";

// Database-specific implementations
export { SQLiteQueryBuilder } from "./sqlite-query-builder";

// Helper functions for query building
// Note: Create this file if it doesn't exist
export const queryHelpers = {
  /**
   * Create a placeholder string for prepared statements
   * @param count Number of placeholders
   * @returns Comma-separated placeholder string
   */
  createPlaceholders: (count: number): string => {
    return Array(count).fill("?").join(", ");
  },

  /**
   * Escape a column name for use in SQL queries
   * @param column Column name
   * @returns Escaped column name
   */
  escapeColumn: (column: string): string => {
    return `"${column.replace(/"/g, '""')}"`;
  },

  /**
   * Create a LIKE pattern with wildcards
   * @param value Value to search for
   * @param position Where to add wildcards (start, end, both, or none)
   * @returns LIKE pattern
   */
  createLikePattern: (
    value: string,
    position: "start" | "end" | "both" | "none" = "both"
  ): string => {
    switch (position) {
      case "start":
        return `%${value}`;
      case "end":
        return `${value}%`;
      case "both":
        return `%${value}%`;
      case "none":
        return value;
    }
  },
};
