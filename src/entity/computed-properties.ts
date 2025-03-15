/**
 * Computed Properties
 * Handles computed property definitions and processing
 */

import { Logger } from "@/core/types";
import { ComputedProperty, EntityConfig } from "@/entity/entity-config";
import { HookContext } from "@/hooks/hook-context";

/**
 * Compute property implementations
 * Maps property names to their implementation functions
 */
export interface ComputedPropertyImplementations {
	[propertyName: string]: (entity: any, context?: HookContext) => any;
}

/**
 * Computed property processing options
 */
export interface ComputedPropertyOptions {
	/**
	 * Whether to cache computed values
	 */
	cache?: boolean;

	/**
	 * Hook context for computations
	 */
	context?: HookContext;

	/**
	 * Whether to skip specific properties
	 */
	skipProperties?: string[];
}

/**
 * Result of a computed property dependency analysis
 */
export interface DependencyAnalysisResult {
	/**
	 * Ordered list of properties to compute
	 */
	order: string[];

	/**
	 * Dependency graph mapping properties to their dependencies
	 */
	graph: Map<string, string[]>;

	/**
	 * Properties with circular dependencies
	 */
	circularDependencies: string[][];
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
			let implementation: (entity: any, context?: HookContext) => any;

			if (typeof prop.implementation === 'string') {
				if (prop.implementation.startsWith('./') || prop.implementation.startsWith('../')) {
					// External file
					const modulePath = prop.implementation;
					const module = await configLoader.loadExternalCode(modulePath);
					implementation = module.default || module;
				} else {
					// Inline implementation
					implementation = createComputedPropertyFunction(prop);
				}
			} else if (typeof prop.implementation === 'function') {
				// Direct function reference
				implementation = prop.implementation;
			} else {
				throw new Error(`Invalid implementation for computed property ${prop.name}`);
			}

			implementations[prop.name] = implementation;
			logger.debug(`Loaded computed property ${prop.name} for ${entity.entity}`);
		} catch (error: any) {
			logger.error(`Failed to load computed property ${prop.name} for ${entity.entity}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	return implementations;
}

/**
 * Create a function from computed property definition
 * @param prop Computed property definition
 * @returns Implementation function
 */
export function createComputedPropertyFunction(prop: ComputedProperty): (entity: any, context?: HookContext) => any {
	try {
		// Create a function from the implementation string
		return new Function(
			'entity',
			'context',
			`
      try {
        return (${prop.implementation})(entity, context);
      } catch (error: any) {
        console.error('Error in computed property ${prop.name}:', error);
        return undefined;
      }
      `
		) as (entity: any, context?: HookContext) => any;
	} catch (error: any) {
		throw new Error(`Failed to create function for computed property ${prop.name}: ${error instanceof Error ? error.message : String(error)}`);
	}
}

/**
 * Process computed properties for an entity
 * Adds computed property values to the entity object
 * 
 * @param entity Entity object
 * @param implementations Computed property implementations
 * @param options Processing options
 * @returns Entity with computed properties
 */
export function processComputedProperties<T extends {}>(
	entity: T,
	implementations: ComputedPropertyImplementations,
	options: ComputedPropertyOptions = {}
): T {
	if (!entity || Object.keys(implementations).length === 0) {
		return entity;
	}

	// Create a new object to avoid modifying the original
	const result = { ...entity };
	const { skipProperties = [], context } = options;

	// Get property order to handle dependencies correctly
	const propertyOrder = getComputedPropertyOrder(
		Object.keys(implementations).filter(prop => !skipProperties.includes(prop)),
		prop => extractDependenciesFromImplementation(implementations[prop])
	);

	// Calculate each computed property in the correct order
	for (const propName of propertyOrder) {
		try {
			result[propName as keyof T] = implementations[propName](result, context) as T[keyof T];
		} catch (error: any) {
			if (context?.logger) {
				context.logger.error(`Error calculating computed property ${propName}: ${error instanceof Error ? error.message : String(error)}`);
			} else {
				console.error(`Error calculating computed property ${propName}:`, error);
			}
		}
	}

	return result;
}

/**
 * Process computed properties for an array of entities
 * @param entities Array of entity objects
 * @param implementations Computed property implementations
 * @param options Processing options
 * @returns Entities with computed properties
 */
export function processComputedPropertiesForArray<T extends {}>(
	entities: T[],
	implementations: ComputedPropertyImplementations,
	options: ComputedPropertyOptions = {}
): T[] {
	if (!entities || entities.length === 0 || Object.keys(implementations).length === 0) {
		return entities;
	}

	return entities.map(entity => processComputedProperties(entity, implementations, options));
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
	return dependencies.some(dep => {
		const oldValue = oldEntity?.[dep];
		const newValue = newEntity?.[dep];

		// Handle primitive values
		if (typeof oldValue !== 'object' || typeof newValue !== 'object') {
			return oldValue !== newValue;
		}

		// Handle arrays
		if (Array.isArray(oldValue) && Array.isArray(newValue)) {
			return JSON.stringify(oldValue) !== JSON.stringify(newValue);
		}

		// Handle objects
		if (oldValue && newValue) {
			return JSON.stringify(oldValue) !== JSON.stringify(newValue);
		}

		// Handle null/undefined
		return oldValue !== newValue;
	});
}

/**
 * Extract dependencies from a computed property implementation
 * @param implementation Implementation function
 * @returns Array of property dependencies
 */
export function extractDependenciesFromImplementation(
	implementation: (entity: any, context?: HookContext) => any
): string[] {
	if (!implementation) return [];

	// Get the function source code
	const fnStr = implementation.toString();

	// Extract property accesses like entity.propertyName
	const matches = fnStr.match(/entity\.([a-zA-Z0-9_$]+)/g) || [];

	// Remove the "entity." prefix and deduplicate
	const properties = [...new Set(matches.map(m => m.replace('entity.', '')))];

	return properties;
}

/**
 * Build dependency graph for computed properties
 * Used to determine the order in which properties should be calculated
 * 
 * @param propertyNames Names of computed properties
 * @param getDependenciesFn Function to get dependencies for a property
 * @returns Map of properties to their dependencies
 */
export function buildDependencyGraph(
	propertyNames: string[],
	getDependenciesFn: (prop: string) => string[]
): Map<string, string[]> {
	const graph = new Map<string, string[]>();

	for (const prop of propertyNames) {
		graph.set(prop, getDependenciesFn(prop));
	}

	return graph;
}

/**
 * Detect circular dependencies in the dependency graph
 * @param graph Dependency graph
 * @returns Array of circular dependency paths
 */
export function detectCircularDependencies(
	graph: Map<string, string[]>
): string[][] {
	const circularPaths: string[][] = [];
	const visiting = new Set<string>();
	const visited = new Set<string>();

	// Helper function for depth-first search
	const dfs = (node: string, path: string[] = []): void => {
		// Skip if already fully visited
		if (visited.has(node)) return;

		// Circular dependency found
		if (visiting.has(node)) {
			// Find the start of the cycle
			const cycleStart = path.indexOf(node);
			if (cycleStart !== -1) {
				const cycle = path.slice(cycleStart).concat(node);
				circularPaths.push(cycle);
			}
			return;
		}

		// Mark as visiting
		visiting.add(node);
		path.push(node);

		// Visit dependencies
		const dependencies = graph.get(node) || [];
		for (const dependency of dependencies) {
			if (graph.has(dependency)) {
				dfs(dependency, [...path]);
			}
		}

		// Mark as visited and remove from visiting
		visiting.delete(node);
		visited.add(node);
	};

	// Visit all nodes
	for (const node of graph.keys()) {
		if (!visited.has(node)) {
			dfs(node);
		}
	}

	return circularPaths;
}

/**
 * Analyze dependencies for computed properties
 * @param propertyNames Names of computed properties
 * @param getDependenciesFn Function to get dependencies for a property
 * @returns Dependency analysis result
 */
export function analyzeDependencies(
	propertyNames: string[],
	getDependenciesFn: (prop: string) => string[]
): DependencyAnalysisResult {
	const graph = buildDependencyGraph(propertyNames, getDependenciesFn);
	const circularDependencies = detectCircularDependencies(graph);

	// Get sorted order
	const order = getComputedPropertyOrder(propertyNames, getDependenciesFn);

	return {
		order,
		graph,
		circularDependencies
	};
}

/**
 * Sort computed properties by dependencies using topological sort
 * Ensures properties are calculated in the correct order
 * 
 * @param propertyNames Names of computed properties
 * @param getDependenciesFn Function to get dependencies for a property
 * @returns Sorted property names
 */
export function getComputedPropertyOrder(
	propertyNames: string[],
	getDependenciesFn: (prop: string) => string[]
): string[] {
	if (propertyNames.length === 0) {
		return [];
	}

	const graph = buildDependencyGraph(propertyNames, getDependenciesFn);
	const result: string[] = [];
	const visited = new Set<string>();
	const visiting = new Set<string>();

	// Filter to only include properties that exist in the graph
	const validProperties = propertyNames.filter(prop => graph.has(prop));

	// Topological sort with cycle detection
	function visit(prop: string): void {
		if (visited.has(prop)) return;
		if (visiting.has(prop)) {
			// Handle circular dependency by continuing
			return;
		}

		visiting.add(prop);

		const dependencies = graph.get(prop) || [];
		for (const dep of dependencies) {
			// Only consider dependencies that are computed properties in our graph
			if (graph.has(dep)) {
				visit(dep);
			}
		}

		visiting.delete(prop);
		visited.add(prop);
		result.push(prop);
	}

	// Visit all properties
	for (const prop of validProperties) {
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
): (entity: any, options?: ComputedPropertyOptions) => any {
	if (!entity.computed || entity.computed.length === 0) {
		return (entity) => entity;
	}

	// Get property dependencies from the entity config
	const propToDependencyMap = new Map<string, string[]>();

	// Initialize with explicit dependencies from config
	for (const prop of entity.computed) {
		propToDependencyMap.set(prop.name, prop.dependencies || []);
	}

	// Enhance with extracted dependencies from implementations
	for (const [propName, impl] of Object.entries(implementations)) {
		const extractedDeps = extractDependenciesFromImplementation(impl);
		const existingDeps = propToDependencyMap.get(propName) || [];
		propToDependencyMap.set(propName, [...new Set([...existingDeps, ...extractedDeps])]);
	}

	// Get the correct order to process properties
	const propertyOrder = getComputedPropertyOrder(
		Object.keys(implementations),
		prop => propToDependencyMap.get(prop) || []
	);

	// Create a function that applies properties in the right order
	return (entityObj: any, options: ComputedPropertyOptions = {}) => {
		if (!entityObj) return entityObj;

		const result = { ...entityObj };
		const { skipProperties = [], context } = options;

		for (const propName of propertyOrder) {
			// Skip specified properties
			if (skipProperties.includes(propName)) continue;

			const implementation = implementations[propName];
			if (implementation) {
				try {
					result[propName] = implementation(result, context);
				} catch (error: any) {
					if (context?.logger) {
						context.logger.error(`Error calculating computed property ${propName}: ${error instanceof Error ? error.message : String(error)}`);
					} else {
						console.error(`Error calculating computed property ${propName}:`, error);
					}
				}
			}
		}

		return result;
	};
}

/**
 * Create an optimized batch processor for computed properties
 * @param entity Entity configuration
 * @param implementations Computed property implementations
 * @returns Function to process computed properties for an array of entities
 */
export function createBatchComputedPropertiesProcessor(
	entity: EntityConfig,
	implementations: ComputedPropertyImplementations
): (entities: any[], options?: ComputedPropertyOptions) => any[] {
	const singleProcessor = createComputedPropertiesProcessor(entity, implementations);

	return (entities: any[], options: ComputedPropertyOptions = {}) => {
		if (!entities || entities.length === 0) return entities;
		return entities.map(entity => singleProcessor(entity, options));
	};
}