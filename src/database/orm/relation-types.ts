/**
 * Relationship type definitions
 * Defines the different types of relationships between entities
 */

/**
 * Base relationship interface
 */
export interface RelationBase {
  /**
   * Name of the relationship
   */
  name: string;

  /**
   * Type of relationship
   */
  type: RelationType;

  /**
   * Entity that owns the relationship
   */
  sourceEntity: string;

  /**
   * Target entity of the relationship
   */
  targetEntity: string;

  /**
   * Custom options for the relationship
   */
  options?: Record<string, unknown>;
}

/**
 * Type of relationship
 */
export type RelationType =
  | "oneToOne"
  | "oneToMany"
  | "manyToOne"
  | "manyToMany";

/**
 * One-to-one relationship
 */
export interface OneToOneRelation extends RelationBase {
  type: "oneToOne";

  /**
   * Source column (logical name)
   */
  sourceColumn: string;

  /**
   * Target column (logical name)
   */
  targetColumn: string;

  /**
   * Whether this is the owner page of the relationship
   */
  isOwner?: boolean;
}

/**
 * One-to-many relationship
 */
export interface OneToManyRelation extends RelationBase {
  type: "oneToMany";

  /**
   * Source column (logical name)
   */
  sourceColumn: string;

  /**
   * Target column (logical name)
   */
  targetColumn: string;

  /**
   * Inverse relationship name (in the target entity)
   */
  inverseName?: string;
}

/**
 * Many-to-one relationship
 */
export interface ManyToOneRelation extends RelationBase {
  type: "manyToOne";

  /**
   * Source column (logical name)
   */
  sourceColumn: string;

  /**
   * Target column (logical name)
   */
  targetColumn: string;

  /**
   * Inverse relationship name (in the target entity)
   */
  inverseName?: string;
}

/**
 * Many-to-many relationship
 */
export interface ManyToManyRelation extends RelationBase {
  type: "manyToMany";

  /**
   * Source column (logical name)
   */
  sourceColumn: string;

  /**
   * Target column (logical name)
   */
  targetColumn: string;

  /**
   * Junction table name
   */
  junctionTable: string;

  /**
   * Junction table source column (logical name)
   */
  junctionSourceColumn: string;

  /**
   * Junction table target column (logical name)
   */
  junctionTargetColumn: string;

  /**
   * Inverse relationship name (in the target entity)
   */
  inverseName?: string;
}

/**
 * Union type for all relationship types
 */
export type Relation =
  | OneToOneRelation
  | OneToManyRelation
  | ManyToOneRelation
  | ManyToManyRelation;

/**
 * Find a relationship by name
 *
 * @param relations Array of relationships
 * @param name Relationship name
 * @returns Relationship or undefined if not found
 */
export function findRelation(
  relations: Relation[] | undefined,
  name: string
): Relation | undefined {
  return relations?.find((rel) => rel.name === name);
}

/**
 * Check if a relationship is a specific type
 *
 * @param relation Relationship to check
 * @param type Expected relationship type
 * @returns True if the relationship is of the expected type
 */
export function isRelationType<T extends Relation>(
  relation: Relation,
  type: RelationType
): relation is T {
  return relation.type === type;
}

/**
 * Get relationships of a specific type
 *
 * @param relations Array of relationships
 * @param type Relationship type to filter by
 * @returns Array of relationships of the specified type
 */
export function getRelationsOfType<T extends Relation>(
  relations: Relation[] | undefined,
  type: RelationType
): T[] {
  return (relations || []).filter((rel) => rel.type === type) as T[];
}

/**
 * Create a one-to-one relationship
 *
 * @param config Relationship configuration
 * @returns One-to-one relationship
 */
export function oneToOne(
  config: Omit<OneToOneRelation, "type">
): OneToOneRelation {
  return {
    ...config,
    type: "oneToOne",
  };
}

/**
 * Create a one-to-many relationship
 *
 * @param config Relationship configuration
 * @returns One-to-many relationship
 */
export function oneToMany(
  config: Omit<OneToManyRelation, "type">
): OneToManyRelation {
  return {
    ...config,
    type: "oneToMany",
  };
}

/**
 * Create a many-to-one relationship
 *
 * @param config Relationship configuration
 * @returns Many-to-one relationship
 */
export function manyToOne(
  config: Omit<ManyToOneRelation, "type">
): ManyToOneRelation {
  return {
    ...config,
    type: "manyToOne",
  };
}

/**
 * Create a many-to-many relationship
 *
 * @param config Relationship configuration
 * @returns Many-to-many relationship
 */
export function manyToMany(
  config: Omit<ManyToManyRelation, "type">
): ManyToManyRelation {
  return {
    ...config,
    type: "manyToMany",
  };
}
