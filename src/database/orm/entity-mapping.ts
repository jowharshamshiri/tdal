/**
 * Entity mapping definitions
 * Provides the mapping between entities and database tables/columns
 */

import { Relation } from "./relation-types";

/**
 * Column mapping type
 * Maps a logical column name to its physical representation
 */
export interface ColumnMapping {
  /**
   * Logical column name (used in code)
   */
  logical: string;

  /**
   * Physical column name (in database)
   */
  physical: string;

  /**
   * Column data type
   */
  type?: string;

  /**
   * Whether this column is the primary key
   */
  primaryKey?: boolean;

  /**
   * Whether this column is auto-incrementing
   */
  autoIncrement?: boolean;

  /**
   * Whether this column allows NULL values
   */
  nullable?: boolean;

  /**
   * Default value for the column
   */
  defaultValue?: unknown;

  /**
   * Whether this column is unique
   */
  unique?: boolean;

  /**
   * Column comment/description
   */
  comment?: string;

  /**
   * Custom database-specific options
   */
  options?: Record<string, unknown>;
}

/**
 * Index definition
 */
export interface IndexMapping {
  /**
   * Index name
   */
  name: string;

  /**
   * Columns included in the index (logical names)
   */
  columns: string[];

  /**
   * Whether this is a unique index
   */
  unique?: boolean;

  /**
   * Index type (database-specific)
   */
  type?: string;
}

/**
 * Entity mapping interface
 * Maps an entity to its database representation
 */
export interface EntityMapping {
  /**
   * Entity name (logical)
   */
  entity: string;

  /**
   * Database table name (logical)
   */
  table: string;

  /**
   * Primary key field name (logical)
   */
  idField: string;

  /**
   * Optional schema name
   */
  schema?: string;

  /**
   * Column mappings
   */
  columns: ColumnMapping[];

  /**
   * Entity relationships
   */
  relations?: Relation[];

  /**
   * Table indexes
   */
  indexes?: IndexMapping[];

  /**
   * Whether soft delete is enabled
   */
  softDelete?: {
    /**
     * Column used for soft deletes
     */
    column: string;

    /**
     * Value indicating a deleted record
     */
    deletedValue: unknown;

    /**
     * Value indicating a non-deleted record
     */
    nonDeletedValue: unknown;
  };

  /**
   * Timestamp columns
   */
  timestamps?: {
    /**
     * Created at column name
     */
    createdAt?: string;

    /**
     * Updated at column name
     */
    updatedAt?: string;

    /**
     * Deleted at column name (for soft deletes)
     */
    deletedAt?: string;
  };

  /**
   * Custom database-specific options
   */
  options?: Record<string, unknown>;
}

/**
 * Column selector type
 */
export type ColumnSelector<T> = Array<keyof T>;

/**
 * Find a column mapping by logical name
 *
 * @param mapping Entity mapping
 * @param logicalName Logical column name
 * @returns Column mapping or undefined if not found
 */
export function findColumnMapping(
  mapping: EntityMapping,
  logicalName: string
): ColumnMapping | undefined {
  return mapping.columns.find((col) => col.logical === logicalName);
}

/**
 * Get the primary key column mapping
 *
 * @param mapping Entity mapping
 * @returns Primary key column mapping
 */
export function getPrimaryKeyMapping(mapping: EntityMapping): ColumnMapping {
  const pkColumn = mapping.columns.find((col) => col.primaryKey);

  if (!pkColumn) {
    // Default to idField if no column is explicitly marked as primary key
    const idColumn = mapping.columns.find(
      (col) => col.logical === mapping.idField
    );

    if (!idColumn) {
      throw new Error(
        `No primary key column found for entity ${mapping.entity}`
      );
    }

    return idColumn;
  }

  return pkColumn;
}

/**
 * Maps logical column names to physical column names
 *
 * @param mapping Entity mapping
 * @param logicalNames Array of logical column names
 * @returns Array of physical column names
 */
export function mapColumnsToPhysical(
  mapping: EntityMapping,
  logicalNames: string[]
): string[] {
  return logicalNames.map((name) => {
    const column = findColumnMapping(mapping, name);
    return column ? column.physical : name;
  });
}

/**
 * Maps logical column name to physical column name
 *
 * @param mapping Entity mapping
 * @param logicalName Logical column name
 * @returns Physical column name
 */
export function mapColumnToPhysical(
  mapping: EntityMapping,
  logicalName: string
): string {
  const column = findColumnMapping(mapping, logicalName);
  return column ? column.physical : logicalName;
}

/**
 * Convert a record with logical column names to physical column names
 *
 * @param mapping Entity mapping
 * @param record Record with logical column names
 * @returns Record with physical column names
 */
export function mapRecordToPhysical(
  mapping: EntityMapping,
  record: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [logicalName, value] of Object.entries(record)) {
    const physicalName = mapColumnToPhysical(mapping, logicalName);
    result[physicalName] = value;
  }

  return result;
}

/**
 * Convert a record with physical column names to logical column names
 *
 * @param mapping Entity mapping
 * @param record Record with physical column names
 * @returns Record with logical column names
 */
export function mapRecordToLogical(
  mapping: EntityMapping,
  record: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const physicalToLogical = new Map<string, string>();

  // Build a map of physical to logical names
  for (const column of mapping.columns) {
    physicalToLogical.set(column.physical, column.logical);
  }

  for (const [physicalName, value] of Object.entries(record)) {
    const logicalName = physicalToLogical.get(physicalName) || physicalName;
    result[logicalName] = value;
  }

  return result;
}
