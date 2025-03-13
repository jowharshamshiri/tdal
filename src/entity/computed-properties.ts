/**
 * Computed Properties
 * Handles computed property definitions and processing
 */

import { ComputedProperty, EntityConfig, Logger } from '../core/types';

/**
 * Compute property implementations
 * Maps property names to their implementation functions
 */
export interface ComputedPropertyImplementations {
	[propertyName: string]: (entity: any) => any;
}

/**
 * Load computed property implementations from entity config
 * @param entity Entity configuration
 * @param logger Logger instance
 * @param configLoader Configuration loader for external code
 * @returns Map of property implementations
 */
export async function loadComputedPropertyImplementations(
	entity: EntityConfig,
	logger: Logger,
	configLoader: any
): Promise<ComputedPropertyImplementations> {
	if (!entity.computed || entity.computed.length === 0) {
		return {};
	}

	const implementations: ComputedPropertyImplementations = {};

	for (const prop of entity.computed) {
		try {
			let implementation: (entity: any) => any;

			if (prop.implementation.startsWith('./')) {
				// External file
				const module = await configLoader.loadExternalCode(prop.implementation);
				implementation = module.default || module;
			} else {
				// Inline implementation
				implementation = createComputedPropertyFunction(prop);
			}

			implementations[prop.name] = implementation;
			logger.debug(`Loaded computed property ${prop.name} for ${entity.entity}`);
		} catch (error) {
			logger.error(`Failed to load computed property ${prop.name} for ${entity.entity}: ${error}`);
		}
	}

	return implementations;
}

/**
 * Create a function from computed property definition
 * @param prop Computed property definition
 * @returns Implementation function
 */
function createComputedPropertyFunction(prop: ComputedProperty): (entity: any) => any {
	// Create a function from the implementation string
	return new Function(
		'entity',
		`return (${prop.implementation})(entity);`
	) as (entity: any) => any;
}

/**
 * Process computed properties for an entity
 * Adds computed property values to the entity object
 * 
 * @param entity Entity object
 * @param implementations Computed property implementations
 * @returns Entity with computed properties
 */
export function processComputedProperties<T>(
	entity: T,
	implementations: ComputedPropertyImplementations
): T {
	if (!entity || Object.keys(implementations).length === 0) {
		return entity;
	}

	// Create a new object to avoid modifying the original
	const result = { ...entity };

	// Calculate each computed property
	for (const [propName, implementation] of Object.entries(implementations)) {
		try {
			result[propName as keyof T] = implementation(entity) as T[keyof T];
		} catch (error) {
			console.error(`Error calculating computed property ${propName}:`, error);
		}
	}

	return result;
}

/**
 * Process computed properties for an array of entities
 * @param entities Array of entity objects
 * @param implementations Computed property implementations
 * @returns Entities with computed properties
 */
export function processComputedPropertiesForArray<T>(
	entities: T[],
	implementations: ComputedPropertyImplementations
): T[] {
	if (!entities || entities.length === 0 || Object.keys(implementations).length === 0) {
		return entities;
	}

	return entities.map(entity => processComputedProperties(entity, implementations));
}

/**
 * Check if property dependencies have changed
 * Used to determine if a computed property needs to be recalculated
 * 
 * @param oldEntity Previous entity state
 * @param newEntity Current entity state
 * @param dependencies Property dependencies
 * @returns Whether dependencies have changed
 */
export function haveDependenciesChanged(
	oldEntity: any,
	newEntity: any,
	dependencies?: string[]
): boolean {
	if (!dependencies || dependencies.length === 0) {
		// If no dependencies specified, assume changed
		return true;
	}

	// Check if any dependency has changed
	return dependencies.some(dep =>
		oldEntity[dep] !== newEntity[dep]
	);
}

/**
 * Build dependency graph for computed properties
 * Used to determine the order in which properties should be calculated
 * 
 * @param entity Entity configuration
 * @returns Map of properties to their dependencies
 */
export function buildDependencyGraph(entity: EntityConfig): Map<string, string[]> {
	if (!entity.computed || entity.computed.length === 0) {
		return new Map();
	}

	const graph = new Map<string, string[]>();

	for (const prop of entity.computed) {
		graph.set(prop.name, prop.dependencies || []);
	}

	return graph;
}

/**
 * Sort computed properties by dependencies
 * Ensures properties are calculated in the correct order
 * 
 * @param entity Entity configuration
 * @returns Sorted property names
 */
export function getComputedPropertyOrder(entity: EntityConfig): string[] {
	if (!entity.computed || entity.computed.length === 0) {
		return [];
	}

	const graph = buildDependencyGraph(entity);
	const result: string[] = [];
	const visited = new Set<string>();
	const visiting = new Set<string>();

	// Topological sort with cycle detection
	function visit(prop: string): void {
		if (visited.has(prop)) return;
		if (visiting.has(prop)) {
			throw new Error(`Cyclic dependency detected in computed properties: ${prop}`);
		}

		visiting.add(prop);

		const dependencies = graph.get(prop) || [];
		for (const dep of dependencies) {
			// Only consider dependencies that are computed properties
			if (graph.has(dep)) {
				visit(dep);
			}
		}

		visiting.delete(prop);
		visited.add(prop);
		result.push(prop);
	}

	// Visit all properties
	for (const prop of graph.keys()) {
		if (!visited.has(prop)) {
			visit(prop);
		}
	}

	return result;
}

/**
 * Create an optimized function to apply all computed properties
 * @param entity Entity configuration
 * @param implementations Computed property implementations
 * @returns Function to process all computed properties
 */
export function createComputedPropertiesProcessor(
	entity: EntityConfig,
	implementations: ComputedPropertyImplementations
): (entity: any) => any {
	if (!entity.computed || entity.computed.length === 0) {
		return (entity) => entity;
	}

	// Get the correct order to process properties
	const propertyOrder = getComputedPropertyOrder(entity);

	// Create a function that applies properties in the right order
	return (entityObj: any) => {
		const result = { ...entityObj };

		for (const propName of propertyOrder) {
			const implementation = implementations[propName];
			if (implementation) {
				try {
					result[propName] = implementation(result);
				} catch (error) {
					console.error(`Error calculating computed property ${propName}:`, error);
				}
			}
		}

		return result;
	};
}