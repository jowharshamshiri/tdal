/**
 * Base Data Access Object class for entities
 * Provides generic CRUD operations for entities
 */

import {
	DatabaseAdapter,
	QueryOptions,
	JoinOptions,
	FindOptions,
	UpdateOptions,
	DeleteOptions,
	TransactionIsolationLevel,
	AggregateOptions,
	RelationOptions
} from "../core/types";
import { DatabaseContext } from "../core/database-context";
import {
	EntityMapping,
	mapRecordToPhysical,
	mapRecordToLogical,
	getPrimaryKeyMapping,
	getColumnsByType,
	mapColumnToPhysical
} from "./entity-mapping";
import {
	Relation,
	ManyToManyRelation,
	OneToManyRelation,
	ManyToOneRelation,
	OneToOneRelation,
	isRelationType,
	findRelation
} from "./relation-types";

/**
 * Base Data Access Object class with common CRUD operations
 * @template T The model type
 * @template IdType The type of the ID field (usually number)
 */
export abstract class EntityDao<T, IdType = number> {
	/**
	 * The database adapter instance
	 */
	protected db: DatabaseAdapter;

	/**
	 * Entity mapping for the DAO
	 */
	protected abstract readonly entityMapping: EntityMapping;

	/**
	 * Constructor
	 * @param db Optional database adapter instance (uses singleton if not provided)
	 */
	constructor(db?: DatabaseAdapter) {
		this.db = db || DatabaseContext.getDatabase();
	}

	/**
	 * Get the table name for the entity
	 */
	protected get tableName(): string {
		return this.entityMapping.table;
	}

	/**
	 * Get the ID field name for the entity
	 */
	protected get idField(): string {
		return this.entityMapping.idField;
	}

	/**
	 * Get the physical ID field name for the entity
	 */
	protected get physicalIdField(): string {
		return mapColumnToPhysical(this.entityMapping, this.idField);
	}

	/**
	 * Find all entities
	 * @param options Optional query options
	 * @returns Array of entities
	 */
	async findAll(options?: QueryOptions): Promise<T[]> {
		const queryOptions = this.enhanceQueryOptions(options);
		const results = await this.db.findAll<Record<string, unknown>>(
			this.tableName,
			queryOptions
		);

		return results.map((result) => this.mapToEntity(result) as T);
	}

	/**
	 * Find entities by conditions
	 * @param conditions Field-value pairs to filter by
	 * @param options Optional query options
	 * @returns Array of entities
	 */
	async findBy(conditions: Partial<T>, options?: QueryOptions): Promise<T[]> {
		const physicalConditions = mapRecordToPhysical(
			this.entityMapping,
			conditions as unknown as Record<string, unknown>
		);

		const queryOptions = this.enhanceQueryOptions(options);

		const results = await this.db.findBy<Record<string, unknown>>(
			this.tableName,
			physicalConditions,
			queryOptions
		);

		return results.map((result) => this.mapToEntity(result) as T);
	}

	/**
	 * Find a single entity by conditions
	 * @param conditions Field-value pairs to filter by
	 * @param options Optional find options
	 * @returns The entity or undefined if not found
	 */
	async findOneBy(conditions: Partial<T>, options?: FindOptions): Promise<T | undefined> {
		const physicalConditions = mapRecordToPhysical(
			this.entityMapping,
			conditions as unknown as Record<string, unknown>
		);

		const findOptions = this.enhanceFindOptions(options);

		const result = await this.db.findOneBy<Record<string, unknown>>(
			this.tableName,
			physicalConditions,
			findOptions
		);

		if (!result) {
			return undefined;
		}

		return this.mapToEntity(result) as T;
	}

	/**
	 * Count entities matching conditions
	 * @param conditions Optional field-value pairs to filter by
	 * @returns Count of matching entities
	 */
	async count(conditions?: Partial<T>): Promise<number> {
		if (!conditions) {
			return this.db.count(this.tableName);
		}

		const physicalConditions = mapRecordToPhysical(
			this.entityMapping,
			conditions as unknown as Record<string, unknown>
		);

		return this.db.count(this.tableName, physicalConditions);
	}

	/**
	 * Execute a function within a transaction
	 * @param callback Function to execute within transaction
	 * @param isolationLevel Optional transaction isolation level
	 * @returns Result of the callback
	 */
	async transaction<R>(
		callback: (dao: this) => Promise<R>,
		isolationLevel?: TransactionIsolationLevel
	): Promise<R> {
		return this.db.transaction(async (db) => {
			// Create a new instance of this DAO with the transaction's database connection
			const transactionDao = new (this.constructor as new (
				db: DatabaseAdapter
			) => this)(db);

			return callback(transactionDao);
		}, isolationLevel);
	}

	/**
	 * Find entity by ID
	 * @param id The entity ID
	 * @param options Optional find options
	 * @returns The entity or undefined if not found
	 */
	async findById(id: IdType, options?: FindOptions): Promise<T | undefined> {
		const findOptions = this.enhanceFindOptions(options);

		try {
			const result = await this.db.findById<Record<string, unknown>>(
				this.tableName,
				this.physicalIdField,
				id as unknown as number | string,
				findOptions
			);

			if (!result) {
				return undefined;
			}

			return this.mapToEntity(result) as T;
		} catch (error) {
			console.error(`Error finding entity by ID: ${error}`);
			return undefined;
		}
	}

	/**
	 * Delete an entity
	 * @param id The entity ID
	 * @returns Number of affected rows
	 */
	async delete(id: IdType): Promise<number> {
		try {
			// Check if soft delete is enabled
			if (this.entityMapping.softDelete) {
				const { column, deletedValue } = this.entityMapping.softDelete;

				// Apply soft delete
				return this.update(id, {
					[column]: deletedValue,
				} as unknown as Partial<T>);
			}

			return this.db.delete(
				this.tableName,
				this.physicalIdField,
				id as unknown as number | string
			);
		} catch (error) {
			console.error(`Error deleting entity: ${error}`);
			return 0;
		}
	}

	/**
	 * Delete entities by conditions
	 * @param conditions The filter conditions
	 * @param options Optional delete options
	 * @returns Number of affected rows
	 */
	async deleteBy(conditions: Partial<T>, options?: DeleteOptions): Promise<number> {
		try {
			// Check if soft delete is enabled
			if (this.entityMapping.softDelete) {
				const { column, deletedValue } = this.entityMapping.softDelete;

				// Apply soft delete with update
				return this.updateBy(conditions, {
					[column]: deletedValue,
				} as unknown as Partial<T>);
			}

			const physicalConditions = mapRecordToPhysical(
				this.entityMapping,
				conditions as unknown as Record<string, unknown>
			);

			return this.db.deleteBy(this.tableName, physicalConditions, options);
		} catch (error) {
			console.error(`Error deleting entities by conditions: ${error}`);
			return 0;
		}
	}

	/**
	 * Check if an entity exists
	 * @param id The entity ID
	 * @returns Whether the entity exists
	 */
	async exists(id: IdType): Promise<boolean> {
		try {
			const exists = await this.db.exists(this.tableName, {
				[this.physicalIdField]: id,
			});

			return exists;
		} catch (error) {
			console.error(`Error checking if entity exists: ${error}`);
			return false;
		}
	}

	/**
	 * Create a new entity
	 * @param data The entity data
	 * @returns The ID of the created entity
	 */
	async create(data: Partial<T>): Promise<IdType> {
		this.applyTimestamps(data, "create");

		// Convert booleans to database-specific format
		const convertedData = this.convertToDbValues(data);

		const physicalData = mapRecordToPhysical(
			this.entityMapping,
			convertedData
		);

		const id = await this.db.insert<Record<string, unknown>>(
			this.tableName,
			physicalData
		);

		return id as unknown as IdType;
	}

	/**
	 * Update an entity
	 * @param id The entity ID
	 * @param data The data to update
	 * @param options Optional update options
	 * @returns Number of affected rows
	 */
	async update(
		id: IdType,
		data: Partial<T>,
		options?: UpdateOptions
	): Promise<number> {
		this.applyTimestamps(data, "update");

		try {
			// Convert booleans to database-specific format
			const convertedData = this.convertToDbValues(data);

			const physicalData = mapRecordToPhysical(
				this.entityMapping,
				convertedData
			);

			return this.db.update<Record<string, unknown>>(
				this.tableName,
				this.physicalIdField,
				id as unknown as number | string,
				physicalData,
				options
			);
		} catch (error) {
			console.error(`Error updating entity: ${error}`);
			return 0;
		}
	}

	/**
	 * Update entities by conditions
	 * @param conditions The filter conditions
	 * @param data The data to update
	 * @param options Optional update options
	 * @returns Number of affected rows
	 */
	async updateBy(
		conditions: Partial<T>,
		data: Partial<T>,
		options?: UpdateOptions
	): Promise<number> {
		this.applyTimestamps(data, "update");

		try {
			// Convert booleans to database-specific format
			const convertedData = this.convertToDbValues(data);

			const physicalData = mapRecordToPhysical(
				this.entityMapping,
				convertedData
			);

			const physicalConditions = mapRecordToPhysical(
				this.entityMapping,
				conditions as unknown as Record<string, unknown>
			);

			return this.db.updateBy<Record<string, unknown>>(
				this.tableName,
				physicalConditions,
				physicalData,
				options
			);
		} catch (error) {
			console.error(`Error updating entities by conditions: ${error}`);
			return 0;
		}
	}

	/**
	 * Insert or update an entity based on ID
	 * @param data The entity data
	 * @returns The ID of the entity
	 */
	async save(data: Partial<T>): Promise<IdType> {
		// If the ID field exists and has a value, update; otherwise, create
		const idValue = (data as any)[this.idField];

		if (idValue !== undefined && idValue !== null) {
			await this.update(idValue as IdType, data);
			return idValue as IdType;
		} else {
			return this.create(data);
		}
	}

	/**
	 * Perform a bulk insert of multiple entities
	 * @param dataArray Array of entity data
	 * @returns Number of inserted entities
	 */
	async bulkCreate(dataArray: Partial<T>[]): Promise<number> {
		if (dataArray.length === 0) return 0;

		// Apply timestamps to all items
		dataArray.forEach(data => {
			this.applyTimestamps(data, "create");
		});

		// Convert booleans and map to physical columns
		const physicalDataArray = dataArray.map(data => {
			const convertedData = this.convertToDbValues(data);
			return mapRecordToPhysical(
				this.entityMapping,
				convertedData
			);
		});

		return this.db.bulkInsert(this.tableName, physicalDataArray);
	}

	/**
	 * Calculate an aggregate value with optional grouping
	 * @param options Aggregate options
	 * @returns Aggregate results
	 */
	async aggregate<R = Record<string, unknown>>(
		options: AggregateOptions
	): Promise<R[]> {
		// Map logical field names to physical column names
		if (options.groupBy) {
			options.groupBy = options.groupBy.map(field =>
				mapColumnToPhysical(this.entityMapping, field)
			);
		}

		if (options.aggregates) {
			options.aggregates = options.aggregates.map(agg => ({
				...agg,
				field: mapColumnToPhysical(this.entityMapping, agg.field)
			}));
		}

		if (options.conditions) {
			options.conditions = mapRecordToPhysical(
				this.entityMapping,
				options.conditions
			);
		}

		if (options.orderBy) {
			options.orderBy = options.orderBy.map(order => ({
				...order,
				field: mapColumnToPhysical(this.entityMapping, order.field)
			}));
		}

		return this.db.aggregate<R>(this.tableName, options);
	}

	/**
	 * Find related entities through a relationship
	 * @param id ID of the source entity
	 * @param relationName Name of the relationship
	 * @param options Query options
	 * @returns Array of related entities
	 */
	async findRelated<R>(
		id: IdType,
		relationName: string,
		options?: QueryOptions
	): Promise<R[]> {
		if (!this.entityMapping.relations) {
			throw new Error(
				`No relationships defined for entity ${this.entityMapping.entity}`
			);
		}

		const relation = findRelation(this.entityMapping.relations, relationName);

		if (!relation) {
			throw new Error(
				`Relationship ${relationName} not found on entity ${this.entityMapping.entity}`
			);
		}

		// Handle different relationship types
		if (isRelationType<ManyToManyRelation>(relation, "manyToMany")) {
			return this.findManyToManyRelated<R>(id, relation, options);
		} else if (isRelationType<OneToManyRelation>(relation, "oneToMany")) {
			return this.findOneToManyRelated<R>(id, relation, options);
		} else if (isRelationType<ManyToOneRelation>(relation, "manyToOne")) {
			return this.findManyToOneRelated<R>(id, relation, options);
		} else if (isRelationType<OneToOneRelation>(relation, "oneToOne")) {
			return this.findOneToOneRelated<R>(id, relation, options);
		} else {
			throw new Error(
				`Unsupported relationship type for findRelated: ${relationName}`
			);
		}
	}

	/**
	 * Add a related entity through a many-to-many relationship
	 * @param id ID of the source entity
	 * @param relationName Name of the relationship
	 * @param targetId ID of the target entity
	 * @returns Success indicator
	 */
	async addRelation(
		id: IdType,
		relationName: string,
		targetId: number | string
	): Promise<boolean> {
		if (!this.entityMapping.relations) {
			throw new Error(
				`No relationships defined for entity ${this.entityMapping.entity}`
			);
		}

		const relation = findRelation(this.entityMapping.relations, relationName);

		if (!relation) {
			throw new Error(
				`Relationship ${relationName} not found on entity ${this.entityMapping.entity}`
			);
		}

		// Only many-to-many relationships support adding relations directly
		if (!isRelationType<ManyToManyRelation>(relation, "manyToMany")) {
			throw new Error(
				`Relationship ${relationName} is not a many-to-many relationship`
			);
		}

		try {
			// Check if the relation already exists
			const exists = await this.db.exists(relation.junctionTable, {
				[relation.junctionSourceColumn]: id,
				[relation.junctionTargetColumn]: targetId,
			});

			if (exists) {
				return true; // Relation already exists
			}

			await this.db.insert<Record<string, unknown>>(relation.junctionTable, {
				[relation.junctionSourceColumn]: id,
				[relation.junctionTargetColumn]: targetId,
			});

			return true;
		} catch (error) {
			console.error(`Error adding relation ${relationName}:`, error);
			return false;
		}
	}

	/**
	 * Remove a related entity through a many-to-many relationship
	 * @param id ID of the source entity
	 * @param relationName Name of the relationship
	 * @param targetId ID of the target entity
	 * @returns Success indicator
	 */
	async removeRelation(
		id: IdType,
		relationName: string,
		targetId: number | string
	): Promise<boolean> {
		if (!this.entityMapping.relations) {
			throw new Error(
				`No relationships defined for entity ${this.entityMapping.entity}`
			);
		}

		const relation = findRelation(this.entityMapping.relations, relationName);

		if (!relation) {
			throw new Error(
				`Relationship ${relationName} not found on entity ${this.entityMapping.entity}`
			);
		}

		// Only many-to-many relationships support removing relations directly
		if (!isRelationType<ManyToManyRelation>(relation, "manyToMany")) {
			throw new Error(
				`Relationship ${relationName} is not a many-to-many relationship`
			);
		}

		try {
			const result = await this.db.deleteBy(relation.junctionTable, {
				[relation.junctionSourceColumn]: id,
				[relation.junctionTargetColumn]: targetId,
			});

			return result > 0;
		} catch (error) {
			console.error(`Error removing relation ${relationName}:`, error);
			return false;
		}
	}

	/**
	 * Create a query builder for this entity
	 * @returns Query builder instance
	 */
	protected createQueryBuilder() {
		const qb = this.db.createQueryBuilder();
		qb.from(this.tableName);

		// Add soft delete condition if enabled
		if (this.entityMapping.softDelete) {
			const { column, nonDeletedValue } = this.entityMapping.softDelete;
			qb.where(`${column} = ?`, nonDeletedValue);
		}

		return qb;
	}

	/**
	 * Find related entities through a many-to-many relationship
	 * @param id ID of the source entity
	 * @param relation Many-to-many relationship
	 * @param options Query options
	 * @returns Array of related entities
	 */
	private async findManyToManyRelated<R>(
		id: IdType,
		relation: ManyToManyRelation,
		options?: QueryOptions
	): Promise<R[]> {
		const targetTable = relation.targetEntity.toLowerCase();

		const joins: JoinOptions[] = [
			{
				type: "INNER",
				table: relation.junctionTable,
				alias: "j",
				on: `${targetTable}.${relation.targetColumn} = j.${relation.junctionTargetColumn}`,
			},
		];

		const conditions = {
			[`j.${relation.junctionSourceColumn}`]: id,
		};

		const results = await this.db.findWithJoin<Record<string, unknown>>(
			targetTable,
			joins,
			conditions,
			options
		);

		// Return results as is - they should be properly mapped by the target entity's repository
		return results as unknown as R[];
	}

	/**
	 * Find related entities through a one-to-many relationship
	 * @param id ID of the source entity
	 * @param relation One-to-many relationship
	 * @param options Query options
	 * @returns Array of related entities
	 */
	private async findOneToManyRelated<R>(
		id: IdType,
		relation: OneToManyRelation,
		options?: QueryOptions
	): Promise<R[]> {
		const targetTable = relation.targetEntity.toLowerCase();

		const conditions = {
			[relation.targetColumn]: id,
		};

		const results = await this.db.findBy<Record<string, unknown>>(
			targetTable,
			conditions,
			options
		);

		// Return results as is - they should be properly mapped by the target entity's repository
		return results as unknown as R[];
	}

	/**
	 * Find related entity through a many-to-one relationship
	 * @param id ID of the source entity
	 * @param relation Many-to-one relationship
	 * @param options Query options
	 * @returns Related entity or undefined if not found
	 */
	private async findManyToOneRelated<R>(
		id: IdType,
		relation: ManyToOneRelation,
		options?: QueryOptions
	): Promise<R[]> {
		// First get the source entity to find the foreign key value
		const sourceEntity = await this.findById(id);
		if (!sourceEntity) {
			return [];
		}

		const foreignKeyValue = (sourceEntity as any)[relation.sourceColumn];
		if (foreignKeyValue === undefined || foreignKeyValue === null) {
			return [];
		}

		const targetTable = relation.targetEntity.toLowerCase();

		const conditions = {
			[relation.targetColumn]: foreignKeyValue,
		};

		const results = await this.db.findBy<Record<string, unknown>>(
			targetTable,
			conditions,
			options
		);

		// Return results as is - they should be properly mapped by the target entity's repository
		return results as unknown as R[];
	}

	/**
	 * Find related entity through a one-to-one relationship
	 * @param id ID of the source entity
	 * @param relation One-to-one relationship
	 * @param options Query options
	 * @returns Related entity or undefined if not found
	 */
	private async findOneToOneRelated<R>(
		id: IdType,
		relation: OneToOneRelation,
		options?: QueryOptions
	): Promise<R[]> {
		if (relation.isOwner) {
			// If this entity is the owner, it has the foreign key
			const sourceEntity = await this.findById(id);
			if (!sourceEntity) {
				return [];
			}

			const foreignKeyValue = (sourceEntity as any)[relation.sourceColumn];
			if (foreignKeyValue === undefined || foreignKeyValue === null) {
				return [];
			}

			const targetTable = relation.targetEntity.toLowerCase();

			const conditions = {
				[relation.targetColumn]: foreignKeyValue,
			};

			const results = await this.db.findBy<Record<string, unknown>>(
				targetTable,
				conditions,
				options
			);

			return results as unknown as R[];
		} else {
			// If this entity is not the owner, the related entity has the foreign key
			const targetTable = relation.targetEntity.toLowerCase();

			const conditions = {
				[relation.targetColumn]: id,
			};

			const results = await this.db.findBy<Record<string, unknown>>(
				targetTable,
				conditions,
				options
			);

			return results as unknown as R[];
		}
	}

	/**
	 * Convert entity values to database-specific values
	 * @param data Entity data
	 * @returns Converted data with database-specific types
	 */
	private convertToDbValues(data: Partial<T>): Record<string, unknown> {
		const result: Record<string, unknown> = {};

		// Find boolean columns
		const booleanColumns = getColumnsByType(this.entityMapping, ["boolean", "bool"]);
		const booleanColumnNames = booleanColumns.map(col => col.logical);

		for (const [key, value] of Object.entries(data)) {
			if (booleanColumnNames.includes(key) && typeof value === "boolean") {
				// Convert boolean to 0/1 for SQLite compatibility
				result[key] = value ? 1 : 0;
			} else {
				result[key] = value;
			}
		}

		return result;
	}

	/**
	 * Convert database values to entity values
	 * @param data Database data
	 * @returns Converted data with entity-specific types
	 */
	private convertToEntityValues(data: Record<string, unknown>): Record<string, unknown> {
		const result: Record<string, unknown> = { ...data };

		// Find boolean columns
		const booleanColumns = getColumnsByType(this.entityMapping, ["boolean", "bool"]);
		const booleanColumnNames = booleanColumns.map(col => col.logical);

		for (const col of booleanColumnNames) {
			if (col in result) {
				const value = result[col];
				result[col] = value === 1 || value === "1" || value === true;
			}
		}

		return result;
	}

	/**
	 * Apply timestamps to an entity
	 * @param data Entity data
	 * @param operation Operation type (create or update)
	 */
	private applyTimestamps(
		data: Partial<T>,
		operation: "create" | "update"
	): void {
		if (!this.entityMapping.timestamps) {
			return;
		}

		const now = new Date().toISOString();

		// First check if the columns exist in the mapping before applying
		if (operation === "create" && this.entityMapping.timestamps.createdAt) {
			const createdAtColumn = this.entityMapping.columns.find(
				(col) => col.logical === this.entityMapping.timestamps?.createdAt
			);

			if (createdAtColumn) {
				(data as Record<string, unknown>)[
					this.entityMapping.timestamps.createdAt
				] = now;
			}
		}

		if (this.entityMapping.timestamps.updatedAt) {
			const updatedAtColumn = this.entityMapping.columns.find(
				(col) => col.logical === this.entityMapping.timestamps?.updatedAt
			);

			if (updatedAtColumn) {
				(data as Record<string, unknown>)[
					this.entityMapping.timestamps.updatedAt
				] = now;
			}
		}
	}

	/**
	 * Map a database record to an entity
	 * @param record Database record with physical column names
	 * @returns Entity with logical column names
	 */
	protected mapToEntity(record: Record<string, unknown>): unknown {
		const logicalRecord = mapRecordToLogical(this.entityMapping, record);
		return this.convertToEntityValues(logicalRecord);
	}

	/**
	 * Enhance query options with entity-specific mappings
	 * @param options Original query options
	 * @returns Enhanced query options
	 */
	private enhanceQueryOptions(options?: QueryOptions): QueryOptions {
		if (!options) return {};

		const enhancedOptions: QueryOptions = { ...options };

		// Map relation names to join options if relations are provided
		if (options.relations && options.relations.length > 0 && this.entityMapping.relations) {
			enhancedOptions.joins = enhancedOptions.joins || [];

			for (const r of options.relations) {
				const relation = findRelation(this.entityMapping.relations, r.name);
				if (relation) {
					const joinOptions = this.relationToJoinOptions(relation);
					if (joinOptions) {
						enhancedOptions.joins.push(joinOptions);
					}
				}
			}
		}

		return enhancedOptions;
	}

	/**
	 * Enhance find options with entity-specific mappings
	 * @param options Original find options
	 * @returns Enhanced find options
	 */
	private enhanceFindOptions(options?: FindOptions): FindOptions {
		if (!options) return {};

		const enhancedOptions: FindOptions = { ...options };

		// Map relation names to relation options if relations are provided
		if (options.relations && options.relations.length > 0 && this.entityMapping.relations) {
			enhancedOptions.relations = [];

			for (const r of options.relations) {
				const relation = findRelation(this.entityMapping.relations, r.name);
				if (relation) {
					// Create RelationOptions from the Relation definition
					const relationType = relation.type === "manyToMany" || relation.type === "oneToMany" ? "left" : "inner";

					const relationOptions: RelationOptions = {
						name: relation.name,
						type: relationType,
						mapping: {
							table: relation.targetEntity.toLowerCase(),
							idField: '', // We don't need this here
							entity: relation.targetEntity,
							columns: [] // We don't need this here
						},
						sourceField: '',
						targetField: ''
					};

					// Set the appropriate fields based on relation type
					if (isRelationType<ManyToManyRelation>(relation, "manyToMany")) {
						// For many-to-many, we need a junction table
						relationOptions.joinCondition =
							`${this.tableName}.${relation.sourceColumn} = ${relation.junctionTable}.${relation.junctionSourceColumn}` +
							` AND ${relation.junctionTable}.${relation.junctionTargetColumn} = ${relationOptions.mapping.table}.${relation.targetColumn}`;
					} else if (isRelationType<OneToManyRelation>(relation, "oneToMany")) {
						relationOptions.sourceField = relation.sourceColumn;
						relationOptions.targetField = relation.targetColumn;
					} else if (isRelationType<ManyToOneRelation>(relation, "manyToOne")) {
						relationOptions.sourceField = relation.sourceColumn;
						relationOptions.targetField = relation.targetColumn;
					} else if (isRelationType<OneToOneRelation>(relation, "oneToOne")) {
						relationOptions.sourceField = relation.sourceColumn;
						relationOptions.targetField = relation.targetColumn;
					}

					enhancedOptions.relations.push(relationOptions);
				}
			}
		}

		return enhancedOptions;
	}

	/**
	 * Convert a relation to join options
	 * @param relation The relation definition
	 * @returns Join options
	 */
	private relationToJoinOptions(relation: Relation): JoinOptions | null {
		const targetTable = relation.targetEntity.toLowerCase();
		const alias = targetTable.charAt(0);

		if (isRelationType<ManyToManyRelation>(relation, "manyToMany")) {
			// For many-to-many, we need to create two joins
			const junctionAlias = "j_" + relation.name;

			return {
				type: "INNER",
				table: relation.junctionTable,
				alias: junctionAlias,
				on: `${this.tableName}.${relation.sourceColumn} = ${junctionAlias}.${relation.junctionSourceColumn}`,
				nestedJoin: {
					type: "INNER",
					table: targetTable,
					alias,
					on: `${junctionAlias}.${relation.junctionTargetColumn} = ${alias}.${relation.targetColumn}`
				}
			};
		} else if (isRelationType<OneToManyRelation>(relation, "oneToMany")) {
			return {
				type: "LEFT",
				table: targetTable,
				alias,
				on: `${this.tableName}.${relation.sourceColumn} = ${alias}.${relation.targetColumn}`
			};
		} else if (isRelationType<ManyToOneRelation>(relation, "manyToOne")) {
			return {
				type: "LEFT",
				table: targetTable,
				alias,
				on: `${this.tableName}.${relation.sourceColumn} = ${alias}.${relation.targetColumn}`
			};
		} else if (isRelationType<OneToOneRelation>(relation, "oneToOne")) {
			if (relation.isOwner) {
				return {
					type: "LEFT",
					table: targetTable,
					alias,
					on: `${this.tableName}.${relation.sourceColumn} = ${alias}.${relation.targetColumn}`
				};
			} else {
				return {
					type: "LEFT",
					table: targetTable,
					alias,
					on: `${this.tableName}.${relation.sourceColumn} = ${alias}.${relation.targetColumn}`
				};
			}
		}

		return null;
	}
}