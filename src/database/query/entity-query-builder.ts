/**
 * Entity-aware query builder interface
 * Enhances the basic query builder with entity mapping awareness
 */

import { ConditionOperator } from "../core/types";
import { QueryBuilder } from "./query-builder";
import { EntityMapping } from "../orm/entity-mapping";
import { Relation } from "../orm/relation-types";

/**
 * Entity-aware query builder
 * Provides methods that work with logical column names from entity mappings
 */
export interface EntityQueryBuilder extends QueryBuilder {
  /**
   * Get the entity mapping this query builder is using
   * @returns Entity mapping
   */
  getEntityMapping(): EntityMapping;

  /**
   * Select specific logical columns from the entity
   * @param logicalColumnNames Logical column names
   * @returns Query builder instance for chaining
   */
  selectColumns(logicalColumnNames: string[]): EntityQueryBuilder;

  /**
   * Select a single logical column from the entity
   * @param logicalColumnName Logical column name
   * @returns Query builder instance for chaining
   */
  selectColumn(logicalColumnName: string): EntityQueryBuilder;

  /**
   * Add a WHERE condition using a logical column name
   * @param logicalColumnName Logical column name
   * @param operator Condition operator
   * @param value Value to compare against
   * @returns Query builder instance for chaining
   */
  whereColumn(
    logicalColumnName: string,
    operator: ConditionOperator,
    value: unknown
  ): EntityQueryBuilder;

  /**
   * Add an AND WHERE condition using a logical column name
   * @param logicalColumnName Logical column name
   * @param operator Condition operator
   * @param value Value to compare against
   * @returns Query builder instance for chaining
   */
  andWhereColumn(
    logicalColumnName: string,
    operator: ConditionOperator,
    value: unknown
  ): EntityQueryBuilder;

  /**
   * Add an OR WHERE condition using a logical column name
   * @param logicalColumnName Logical column name
   * @param operator Condition operator
   * @param value Value to compare against
   * @returns Query builder instance for chaining
   */
  orWhereColumn(
    logicalColumnName: string,
    operator: ConditionOperator,
    value: unknown
  ): EntityQueryBuilder;

  /**
   * Add an ORDER BY clause using a logical column name
   * @param logicalColumnName Logical column name
   * @param direction Sort direction
   * @returns Query builder instance for chaining
   */
  orderByColumn(
    logicalColumnName: string,
    direction?: "ASC" | "DESC"
  ): EntityQueryBuilder;

  /**
   * Add a GROUP BY clause using logical column names
   * @param logicalColumnNames Logical column names
   * @returns Query builder instance for chaining
   */
  groupByColumns(logicalColumnNames: string[]): EntityQueryBuilder;

  /**
   * Join with a related entity based on a relationship
   * @param relationName Relationship name defined in the entity mapping
   * @param alias Optional alias for the joined table
   * @returns Query builder instance for chaining
   */
  joinRelated(relationName: string, alias?: string): EntityQueryBuilder;

  /**
   * Left join with a related entity based on a relationship
   * @param relationName Relationship name defined in the entity mapping
   * @param alias Optional alias for the joined table
   * @returns Query builder instance for chaining
   */
  leftJoinRelated(relationName: string, alias?: string): EntityQueryBuilder;

  /**
   * Add a date-based condition using a logical column name
   * Uses database-agnostic date expressions
   * @param logicalColumnName Logical column name for the date field
   * @param operator Condition operator
   * @param value Date value to compare against
   * @returns Query builder instance for chaining
   */
  whereDateColumn(
    logicalColumnName: string,
    operator: ConditionOperator,
    value: Date | string
  ): EntityQueryBuilder;

  /**
   * Add a condition comparing a date column to the current date
   * @param logicalColumnName Logical column name for the date field
   * @param operator Condition operator
   * @returns Query builder instance for chaining
   */
  whereCurrentDate(
    logicalColumnName: string,
    operator: ConditionOperator
  ): EntityQueryBuilder;

  /**
   * Add a full-text search condition for a text column
   * @param logicalColumnName Logical column name for the text field
   * @param searchText Text to search for
   * @returns Query builder instance for chaining
   */
  whereFullText(
    logicalColumnName: string,
    searchText: string
  ): EntityQueryBuilder;

  /**
   * Add a LIKE condition with automatic wildcards
   * @param logicalColumnName Logical column name
   * @param searchText Text to search for
   * @param position Where to add wildcards (start, end, both, or none)
   * @returns Query builder instance for chaining
   */
  whereLike(
    logicalColumnName: string,
    searchText: string,
    position?: "start" | "end" | "both" | "none"
  ): EntityQueryBuilder;

  /**
   * Add a nested condition with subquery
   * @param callback Function that builds the subquery
   * @returns Query builder instance for chaining
   */
  whereSubquery(
    callback: (subQuery: EntityQueryBuilder) => EntityQueryBuilder
  ): EntityQueryBuilder;

  /**
   * Select a calculated expression and assign it an alias
   * @param expression SQL expression
   * @param alias Column alias
   * @param params Optional parameters for the expression
   * @returns Query builder instance for chaining
   */
  selectExpression(
    expression: string,
    alias: string,
    ...params: unknown[]
  ): EntityQueryBuilder;

  /**
   * Execute the query and map the results to entity instances
   * @returns Promise resolving to an array of entity instances
   */
  executeAndMap<T>(): Promise<T[]>;

  /**
   * Get one result and map it to an entity instance
   * @returns Promise resolving to an entity instance or undefined
   */
  getOneAndMap<T>(): Promise<T | undefined>;
}

/**
 * Entity-aware query builder factory
 * Creates entity-aware query builders for different entity types
 */
export interface EntityQueryBuilderFactory {
  /**
   * Create an entity query builder for the specified entity
   * @param entityMapping Entity mapping
   * @returns Entity query builder
   */
  createEntityQueryBuilder(entityMapping: EntityMapping): EntityQueryBuilder;

  /**
   * Create an entity query builder for a one-to-many relationship
   * @param sourceMapping Source entity mapping
   * @param relation Relationship definition
   * @param sourceId Source entity ID
   * @returns Entity query builder for the target entity
   */
  createOneToManyQueryBuilder(
    sourceMapping: EntityMapping,
    relation: Relation,
    sourceId: number | string
  ): EntityQueryBuilder;

  /**
   * Create an entity query builder for a many-to-many relationship
   * @param sourceMapping Source entity mapping
   * @param relation Relationship definition
   * @param sourceId Source entity ID
   * @returns Entity query builder for the target entity
   */
  createManyToManyQueryBuilder(
    sourceMapping: EntityMapping,
    relation: Relation,
    sourceId: number | string
  ): EntityQueryBuilder;
}

/**
 * Define an abstract base class for entity query builders
 */
export abstract class EntityQueryBuilderBase implements EntityQueryBuilder {
  /**
   * Get the entity mapping
   */
  abstract getEntityMapping(): EntityMapping;

  /**
   * Map a logical column name to a physical column name
   * @param logicalColumnName Logical column name
   * @returns Physical column name
   */
  protected abstract mapColumnName(logicalColumnName: string): string;

  /**
   * Get a relationship from the entity mapping
   * @param relationName Relationship name
   * @returns Relation object
   */
  protected abstract getRelation(relationName: string): Relation;

  // Implement the required methods from QueryBuilder and EntityQueryBuilder
  abstract select(
    fields: string | string[],
    ...params: unknown[]
  ): QueryBuilder;
  abstract selectRaw(expression: string, ...params: unknown[]): QueryBuilder;
  abstract from(table: string, alias?: string): QueryBuilder;
  abstract where(
    condition: string | unknown,
    ...params: unknown[]
  ): QueryBuilder;
  abstract andWhere(
    condition: string | unknown,
    ...params: unknown[]
  ): QueryBuilder;
  abstract orWhere(
    condition: string | unknown,
    ...params: unknown[]
  ): QueryBuilder;
  abstract join(
    type: string,
    table: string,
    alias: string,
    condition: string,
    ...params: unknown[]
  ): QueryBuilder;
  abstract innerJoin(
    table: string,
    alias: string,
    condition: string,
    ...params: unknown[]
  ): QueryBuilder;
  abstract leftJoin(
    table: string,
    alias: string,
    condition: string,
    ...params: unknown[]
  ): QueryBuilder;
  abstract rightJoin(
    table: string,
    alias: string,
    condition: string,
    ...params: unknown[]
  ): QueryBuilder;
  abstract orderBy(field: string, direction?: string | undefined): QueryBuilder;
  abstract groupBy(fields: string | string[]): QueryBuilder;
  abstract having(condition: string, ...params: unknown[]): QueryBuilder;
  abstract limit(limit: number): QueryBuilder;
  abstract offset(offset: number): QueryBuilder;
  abstract getQuery(): string;
  abstract getParameters(): unknown[];
  abstract toSql(): string;
  abstract execute<T>(): Promise<T[]>;
  abstract getOne<T>(): Promise<T | undefined>;
  abstract getCount(): Promise<number>;

  // Implement entity-aware methods
  abstract selectColumns(logicalColumnNames: string[]): EntityQueryBuilder;
  abstract selectColumn(logicalColumnName: string): EntityQueryBuilder;
  abstract whereColumn(
    logicalColumnName: string,
    operator: ConditionOperator,
    value: unknown
  ): EntityQueryBuilder;
  abstract andWhereColumn(
    logicalColumnName: string,
    operator: ConditionOperator,
    value: unknown
  ): EntityQueryBuilder;
  abstract orWhereColumn(
    logicalColumnName: string,
    operator: ConditionOperator,
    value: unknown
  ): EntityQueryBuilder;
  abstract orderByColumn(
    logicalColumnName: string,
    direction?: "ASC" | "DESC"
  ): EntityQueryBuilder;
  abstract groupByColumns(logicalColumnNames: string[]): EntityQueryBuilder;
  abstract joinRelated(
    relationName: string,
    alias?: string
  ): EntityQueryBuilder;
  abstract leftJoinRelated(
    relationName: string,
    alias?: string
  ): EntityQueryBuilder;
  abstract whereDateColumn(
    logicalColumnName: string,
    operator: ConditionOperator,
    value: Date | string
  ): EntityQueryBuilder;
  abstract whereCurrentDate(
    logicalColumnName: string,
    operator: ConditionOperator
  ): EntityQueryBuilder;
  abstract whereFullText(
    logicalColumnName: string,
    searchText: string
  ): EntityQueryBuilder;
  abstract whereLike(
    logicalColumnName: string,
    searchText: string,
    position?: "start" | "end" | "both" | "none"
  ): EntityQueryBuilder;
  abstract whereSubquery(
    callback: (subQuery: EntityQueryBuilder) => EntityQueryBuilder
  ): EntityQueryBuilder;
  abstract selectExpression(
    expression: string,
    alias: string,
    ...params: unknown[]
  ): EntityQueryBuilder;
  abstract executeAndMap<T>(): Promise<T[]>;
  abstract getOneAndMap<T>(): Promise<T | undefined>;
}
