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
	 * Whether this is the owner side of the relationship
	 */
	isOwner?: boolean;

	/**
	 * Whether to cascade delete operations to related entity
	 */
	cascadeDelete?: boolean;

	/**
	 * Inverse relationship name (in the target entity)
	 */
	inverseName?: string;

	/**
	 * Foreign key constraint name (for database schema generation)
	 */
	foreignKeyConstraint?: string;
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
	 * Whether to cascade delete operations to related entities
	 */
	cascadeDelete?: boolean;

	/**
	 * Inverse relationship name (in the target entity)
	 */
	inverseName?: string;

	/**
	 * Foreign key constraint name (for database schema generation)
	 */
	foreignKeyConstraint?: string;
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

	/**
	 * Foreign key constraint name (for database schema generation)
	 */
	foreignKeyConstraint?: string;

	/**
	 * Whether this column can be null
	 */
	nullable?: boolean;
}

/**
* Many-to-many relationship
*/
export interface ManyToManyRelation extends RelationBase {
	type: "manyToMany";

	/**
	 * Source column (logical name)
	 * Can be a string for single column or string[] for composite keys
	 */
	sourceColumn: string | string[];

	/**
	 * Target column (logical name)
	 * Can be a string for single column or string[] for composite keys
	 */
	targetColumn: string | string[];

	/**
	 * Junction table name
	 */
	junctionTable: string;

	/**
	 * Junction table source column (logical name)
	 * Can be a string for single column or string[] for composite keys
	 */
	junctionSourceColumn: string | string[];

	/**
	 * Junction table target column (logical name)
	 * Can be a string for single column or string[] for composite keys
	 */
	junctionTargetColumn: string | string[];

	/**
	 * Whether this relation uses an implicit junction table
	 * If true, the junction table is managed automatically and not exposed as an entity
	 */
	implicitJunction?: boolean;

	/**
	 * Inverse relationship name (in the target entity)
	 */
	inverseName?: string;

	/**
	 * Additional columns on the junction table
	 */
	junctionExtraColumns?: Array<{
		name: string;
		type: string;
		nullable?: boolean;
		defaultValue?: unknown;
	}>;

	/**
	 * Foreign key constraint names (for database schema generation)
	 */
	foreignKeyConstraints?: {
		source?: string;
		target?: string;
	};
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
 * Relationship configuration for loading related entities
 */
export interface RelationLoadConfig {
	/**
	 * Relation name to load
	 */
	relation: string;

	/**
	 * Optional alias for the loaded relation
	 */
	alias?: string;

	/**
	 * Whether to load all nested relations
	 */
	loadNested?: boolean;

	/**
	 * Specific nested relations to load
	 */
	nestedRelations?: RelationLoadConfig[];

	/**
	 * Optional filter conditions for the relation
	 */
	conditions?: Record<string, unknown>;

	/**
	 * Optional order criteria for the relation
	 */
	orderBy?: Array<{
		field: string;
		direction?: "ASC" | "DESC";
	}>;

	/**
	 * Optional limit for related entities
	 */
	limit?: number;

	/**
	 * Optional offset for related entities
	 */
	offset?: number;
}

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
 * Find relationships with specific target entity
 * 
 * @param relations Array of relationships
 * @param targetEntity Target entity name
 * @returns Array of relationships targeting the specified entity
 */
export function findRelationsToEntity(
	relations: Relation[] | undefined,
	targetEntity: string
): Relation[] {
	return (relations || []).filter((rel) => rel.targetEntity === targetEntity);
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
		// Default to implicit junction unless explicitly set to false
		implicitJunction: config.implicitJunction !== false
	};
}

/**
 * Create bidirectional relationship mappings between two entities
 * 
 * @param ownerConfig Owner side relationship configuration
 * @param inverseConfig Inverse side relationship configuration (optional for one-to-many/many-to-one)
 * @returns Array of relationship objects for both entities
 */
export function createBidirectionalRelation(
	ownerConfig: Omit<OneToOneRelation | ManyToOneRelation, "type">,
	inverseConfig?: Omit<OneToOneRelation | OneToManyRelation, "type">
): Relation[] {
	const relations: Relation[] = [];

	// Handle one-to-one relationship
	if (
		(ownerConfig as Partial<OneToOneRelation>).isOwner ||
		!(inverseConfig && 'targetColumn' in inverseConfig)
	) {
		const oneToOneOwner = oneToOne({
			...ownerConfig,
			isOwner: true
		});
		relations.push(oneToOneOwner);

		if (inverseConfig) {
			const oneToOneInverse = oneToOne({
				...inverseConfig,
				isOwner: false,
				inverseName: ownerConfig.name
			});
			relations.push(oneToOneInverse);
		}
	}
	// Handle many-to-one/one-to-many relationship
	else {
		const manyToOneRel = manyToOne({
			...ownerConfig,
			inverseName: inverseConfig?.name
		});
		relations.push(manyToOneRel);

		if (inverseConfig) {
			const oneToManyRel = oneToMany({
				...inverseConfig,
				inverseName: ownerConfig.name
			});
			relations.push(oneToManyRel);
		}
	}

	return relations;
}

/**
 * Generate a bidirectional many-to-many relationship between two entities
 * 
 * @param sourceConfig Source entity relationship configuration
 * @param targetConfig Target entity relationship configuration
 * @returns Array of many-to-many relationships for both entities
 */
export function createBidirectionalManyToMany(
	sourceConfig: Omit<ManyToManyRelation, "type">,
	targetConfig: Omit<ManyToManyRelation, "type">
): ManyToManyRelation[] {
	const sourceManyToMany = manyToMany({
		...sourceConfig,
		inverseName: targetConfig.name
	});

	const targetManyToMany = manyToMany({
		...targetConfig,
		inverseName: sourceConfig.name,
		// Swap the junction column references for the target side
		junctionSourceColumn: sourceConfig.junctionTargetColumn,
		junctionTargetColumn: sourceConfig.junctionSourceColumn
	});

	return [sourceManyToMany, targetManyToMany];
}