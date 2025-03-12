/**
 * Base Data Access Object class for entities
 * Provides generic CRUD operations for entities
 */

import { DatabaseAdapter, QueryOptions, JoinOptions } from "../core/types";
import { DatabaseContext } from "../core/database-context";
import {
  EntityMapping,
  mapRecordToPhysical,
  mapRecordToLogical,
  getPrimaryKeyMapping,
} from "./entity-mapping";
import {
  Relation,
  ManyToManyRelation,
  OneToManyRelation,
  isRelationType,
  findRelation,
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
   * Find all entities
   * @param options Optional query options
   * @returns Array of entities
   */
  async findAll(options?: QueryOptions): Promise<T[]> {
    const results = await this.db.findAll<Record<string, unknown>>(
      this.tableName,
      options
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

    const results = await this.db.findBy<Record<string, unknown>>(
      this.tableName,
      physicalConditions,
      options
    );

    return results.map((result) => this.mapToEntity(result) as T);
  }

  /**
   * Find a single entity by conditions
   * @param conditions Field-value pairs to filter by
   * @returns The entity or undefined if not found
   */
  async findOneBy(conditions: Partial<T>): Promise<T | undefined> {
    const physicalConditions = mapRecordToPhysical(
      this.entityMapping,
      conditions as unknown as Record<string, unknown>
    );

    const result = await this.db.findOneBy<Record<string, unknown>>(
      this.tableName,
      physicalConditions
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
   * @returns Result of the callback
   */
  async transaction<R>(callback: (dao: this) => Promise<R>): Promise<R> {
    return this.db.transaction(async (db) => {
      // Create a new instance of this DAO with the transaction's database connection
      const transactionDao = new (this.constructor as new (
        db: DatabaseAdapter
      ) => this)(db);

      return callback(transactionDao);
    });
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
    } else {
      throw new Error(
        `Unsupported relationship type for findRelated: ${relation.type}`
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
    const joins: JoinOptions[] = [
      {
        type: "INNER",
        table: relation.junctionTable,
        alias: "j",
        on: `t.${relation.targetColumn} = j.${relation.junctionTargetColumn}`,
      },
    ];

    const conditions = {
      [`j.${relation.junctionSourceColumn}`]: id,
    };

    const results = await this.db.findWithJoin<Record<string, unknown>>(
      relation.targetEntity.toLowerCase(),
      joins,
      conditions,
      options
    );

    // Map results to entities (simple pass-through for now)
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
    const conditions = {
      [relation.targetColumn]: id,
    };

    const results = await this.db.findBy<Record<string, unknown>>(
      relation.targetEntity.toLowerCase(),
      conditions,
      options
    );

    // Map results to entities (simple pass-through for now)
    return results as unknown as R[];
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
   * Find entity by ID
   * @param id The entity ID
   * @returns The entity or undefined if not found
   */
  async findById(id: IdType): Promise<T | undefined> {
    const physicalId = this.entityMapping.idField;

    try {
      const result = await this.db.findById<Record<string, unknown>>(
        this.tableName,
        physicalId,
        id as unknown as number | string
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
        this.idField,
        id as unknown as number | string
      );
    } catch (error) {
      console.error(`Error deleting entity: ${error}`);
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
      const count = await this.db.count(this.tableName, {
        [this.idField]: id,
      });

      return count > 0;
    } catch (error) {
      console.error(`Error checking if entity exists: ${error}`);
      return false;
    }
  }

  /**
   * Convert boolean values to 0/1 for SQLite compatibility
   * @param data Data to convert
   * @returns Converted data with 0/1 instead of booleans
   */
  private convertBooleansForSqlite<T>(
    data: Partial<T>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      if (typeof value === "boolean") {
        result[key] = value ? 1 : 0;
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Convert SQLite 0/1 values back to JavaScript booleans
   * @param data Data from database
   * @returns Converted data with booleans instead of 0/1
   */
  private convertSqliteToJsBooleans<T>(data: Record<string, unknown>): T {
    const result: Record<string, unknown> = { ...data };

    for (const [key, value] of Object.entries(data)) {
      const column = this.entityMapping.columns.find(
        (col) => col.logical === key
      );
      if (column && (column.type === "boolean" || column.type === "bool")) {
        result[key] = value === 1 || value === "1" || value === true;
      }
    }

    return result as unknown as T;
  }

  /**
   * Create a new entity
   * @param data The entity data
   * @returns The ID of the created entity
   */
  async create(data: Partial<T>): Promise<IdType> {
    this.applyTimestamps(data, "create");

    const physicalData = mapRecordToPhysical(
      this.entityMapping,
      this.convertBooleansForSqlite(data)
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
   * @returns Number of affected rows
   */
  async update(id: IdType, data: Partial<T>): Promise<number> {
    this.applyTimestamps(data, "update");

    try {
      const physicalData = mapRecordToPhysical(
        this.entityMapping,
        this.convertBooleansForSqlite(data)
      );

      return this.db.update<Record<string, unknown>>(
        this.tableName,
        this.idField,
        id as unknown as number | string,
        physicalData
      );
    } catch (error) {
      console.error(`Error updating entity: ${error}`);
      return 0;
    }
  }

  /**
   * Map a database record to an entity
   * @param record Database record with physical column names
   * @returns Entity with logical column names
   */
  private mapToEntity(record: Record<string, unknown>): unknown {
    const logicalRecord = mapRecordToLogical(this.entityMapping, record);
    return this.convertSqliteToJsBooleans(logicalRecord);
  }
}
