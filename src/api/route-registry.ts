/**
 * Route Registry
 * Manages API route registration and discovery
 */

import { Router, RequestHandler } from 'express';
import { Logger } from '@/core/types';
import { AppContext } from '@/core/app-context';

/**
 * Route configuration interface
 */
export interface RouteConfig {
	/**
	 * HTTP method
	 */
	method: string;

	/**
	 * Route path
	 */
	path: string;

	/**
	 * Handler function
	 */
	handler: RequestHandler;

	/**
	 * Middleware to apply
	 */
	middleware?: Array<string | RequestHandler>;

	/**
	 * Associated entity name
	 */
	entity?: string;

	/**
	 * Operation name
	 */
	operation?: string;

	/**
	 * Required roles
	 */
	roles?: string[];

	/**
	 * Request schema for validation
	 */
	requestSchema?: Record<string, any>;

	/**
	 * Response schema
	 */
	responseSchema?: Record<string, any>;

	/**
	 * Route tags for documentation
	 */
	tags?: string[];

	/**
	 * Route description
	 */
	description?: string;
}

/**
 * Route registry metadata
 */
interface RouteMetadata {
	/**
	 * Route configuration
	 */
	config: RouteConfig;

	/**
	 * Registration timestamp
	 */
	timestamp: number;

	/**
	 * Registration source
	 */
	source: string;
}

/**
 * Route Registry class
 * Manages API route registration and discovery
 */
export class RouteRegistry {
	/**
	 * Registered routes
	 */
	private routes: Map<string, RouteMetadata> = new Map();

	/**
	 * Route cache
	 * Maps route key to Router instance
	 */
	private routeCache: Map<string, Router> = new Map();

	/**
	 * Entity routes
	 * Maps entity name to route configurations
	 */
	private entityRoutes: Map<string, RouteConfig[]> = new Map();

	/**
	 * Logger instance
	 */
	private logger: Logger;

	/**
	 * Application context
	 */
	private appContext?: AppContext;

	/**
	 * Constructor
	 * @param logger Logger instance
	 * @param appContext Optional application context
	 */
	constructor(logger: Logger, appContext?: AppContext) {
		this.logger = logger;
		this.appContext = appContext;
	}

	/**
	 * Register a route
	 * @param routeConfig Route configuration
	 * @param source Registration source (for tracking)
	 * @returns Whether the registration was successful
	 */
	registerRoute(routeConfig: RouteConfig, source: string = 'manual'): boolean {
		// Create route key
		const routeKey = this.createRouteKey(routeConfig.method, routeConfig.path);

		// Check for existing route
		if (this.routes.has(routeKey)) {
			this.logger.warn(`Route already registered: ${routeConfig.method} ${routeConfig.path}`);
			return false;
		}

		// Register route
		this.routes.set(routeKey, {
			config: routeConfig,
			timestamp: Date.now(),
			source
		});

		// Add to entity routes if entity is specified
		if (routeConfig.entity) {
			if (!this.entityRoutes.has(routeConfig.entity)) {
				this.entityRoutes.set(routeConfig.entity, []);
			}

			this.entityRoutes.get(routeConfig.entity)?.push(routeConfig);
		}

		this.logger.debug(`Registered route: ${routeConfig.method} ${routeConfig.path} (${source})`);

		// Invalidate cache
		this.invalidateCache(routeKey);

		return true;
	}

	/**
	 * Register multiple routes
	 * @param routeConfigs Route configurations
	 * @param source Registration source (for tracking)
	 * @returns Number of successfully registered routes
	 */
	registerRoutes(routeConfigs: RouteConfig[], source: string = 'bulk'): number {
		let successCount = 0;

		for (const routeConfig of routeConfigs) {
			if (this.registerRoute(routeConfig, source)) {
				successCount++;
			}
		}

		return successCount;
	}

	/**
	 * Get a route by method and path
	 * @param method HTTP method
	 * @param path Route path
	 * @returns Route configuration or undefined if not found
	 */
	getRoute(method: string, path: string): RouteConfig | undefined {
		const routeKey = this.createRouteKey(method, path);
		return this.routes.get(routeKey)?.config;
	}

	/**
	 * Get all routes for an entity
	 * @param entityName Entity name
	 * @returns Array of route configurations
	 */
	getEntityRoutes(entityName: string): RouteConfig[] {
		return this.entityRoutes.get(entityName) || [];
	}

	/**
	 * Get all registered routes
	 * @returns Array of route configurations
	 */
	getAllRoutes(): RouteConfig[] {
		return Array.from(this.routes.values()).map(metadata => metadata.config);
	}

	/**
	 * Create a router with all registered routes
	 * @param basePath Base path for all routes
	 * @returns Express router
	 */
	createRouter(basePath = ''): Router {
		const router = Router();

		// Register all routes
		for (const { config } of this.routes.values()) {
			this.addRouteToRouter(router, config, basePath);
		}

		return router;
	}

	/**
	 * Create a router for an entity
	 * @param entityName Entity name
	 * @param basePath Base path for entity routes
	 * @returns Express router
	 */
	createEntityRouter(entityName: string, basePath = ''): Router {
		const entityRoutes = this.entityRoutes.get(entityName) || [];

		// Check cache first
		const cacheKey = `entity:${entityName}:${basePath}`;
		if (this.routeCache.has(cacheKey)) {
			return this.routeCache.get(cacheKey)!;
		}

		// Create new router
		const router = Router();

		// Register entity routes
		for (const routeConfig of entityRoutes) {
			this.addRouteToRouter(router, routeConfig, basePath);
		}

		// Cache the router
		this.routeCache.set(cacheKey, router);

		return router;
	}

	/**
	 * Create a router for routes matching a tag
	 * @param tag Route tag
	 * @param basePath Base path for routes
	 * @returns Express router
	 */
	createTagRouter(tag: string, basePath = ''): Router {
		const router = Router();

		// Find routes with this tag
		const taggedRoutes = Array.from(this.routes.values())
			.filter(metadata => metadata.config.tags?.includes(tag))
			.map(metadata => metadata.config);

		// Register tagged routes
		for (const routeConfig of taggedRoutes) {
			this.addRouteToRouter(router, routeConfig, basePath);
		}

		return router;
	}

	/**
	 * Remove a route
	 * @param method HTTP method
	 * @param path Route path
	 * @returns Whether the route was removed
	 */
	removeRoute(method: string, path: string): boolean {
		const routeKey = this.createRouteKey(method, path);

		if (!this.routes.has(routeKey)) {
			return false;
		}

		// Get route configuration
		const { config } = this.routes.get(routeKey)!;

		// Remove from entity routes if applicable
		if (config.entity && this.entityRoutes.has(config.entity)) {
			const entityRoutes = this.entityRoutes.get(config.entity)!;
			const index = entityRoutes.findIndex(
				route => route.method === config.method && route.path === config.path
			);

			if (index !== -1) {
				entityRoutes.splice(index, 1);
			}

			// If no more routes for this entity, remove the entry
			if (entityRoutes.length === 0) {
				this.entityRoutes.delete(config.entity);
			}
		}

		// Remove from routes map
		this.routes.delete(routeKey);

		// Invalidate caches
		this.invalidateCache(routeKey);
		if (config.entity) {
			this.invalidateEntityCache(config.entity);
		}

		this.logger.debug(`Removed route: ${config.method} ${config.path}`);

		return true;
	}

	/**
	 * Remove all routes for an entity
	 * @param entityName Entity name
	 * @returns Number of routes removed
	 */
	removeEntityRoutes(entityName: string): number {
		if (!this.entityRoutes.has(entityName)) {
			return 0;
		}

		const entityRoutes = this.entityRoutes.get(entityName)!;
		let count = 0;

		// Remove each route
		for (const route of entityRoutes) {
			const routeKey = this.createRouteKey(route.method, route.path);
			this.routes.delete(routeKey);
			count++;
		}

		// Remove entity routes entry
		this.entityRoutes.delete(entityName);

		// Invalidate caches
		this.invalidateEntityCache(entityName);

		this.logger.debug(`Removed ${count} routes for entity ${entityName}`);

		return count;
	}

	/**
	 * Update a route
	 * @param method HTTP method
	 * @param path Route path
	 * @param updates Updates to apply to route configuration
	 * @returns Whether the route was updated
	 */
	updateRoute(
		method: string,
		path: string,
		updates: Partial<RouteConfig>
	): boolean {
		const routeKey = this.createRouteKey(method, path);

		if (!this.routes.has(routeKey)) {
			return false;
		}

		// Get current configuration
		const metadata = this.routes.get(routeKey)!;
		const oldConfig = metadata.config;

		// Create updated configuration
		const newConfig: RouteConfig = {
			...oldConfig,
			...updates
		};

		// Update metadata
		metadata.config = newConfig;
		metadata.timestamp = Date.now();

		// If entity changed, update entity routes
		if (updates.entity && updates.entity !== oldConfig.entity) {
			// Remove from old entity routes
			if (oldConfig.entity && this.entityRoutes.has(oldConfig.entity)) {
				const oldEntityRoutes = this.entityRoutes.get(oldConfig.entity)!;
				const index = oldEntityRoutes.findIndex(
					route => route.method === oldConfig.method && route.path === oldConfig.path
				);

				if (index !== -1) {
					oldEntityRoutes.splice(index, 1);
				}

				// If no more routes for this entity, remove the entry
				if (oldEntityRoutes.length === 0) {
					this.entityRoutes.delete(oldConfig.entity);
				}
			}

			// Add to new entity routes
			if (!this.entityRoutes.has(updates.entity)) {
				this.entityRoutes.set(updates.entity, []);
			}

			this.entityRoutes.get(updates.entity)!.push(newConfig);
		}

		// Invalidate caches
		this.invalidateCache(routeKey);
		if (oldConfig.entity) {
			this.invalidateEntityCache(oldConfig.entity);
		}
		if (updates.entity && updates.entity !== oldConfig.entity) {
			this.invalidateEntityCache(updates.entity);
		}

		this.logger.debug(`Updated route: ${method} ${path}`);

		return true;
	}

	/**
	 * Find routes by pattern
	 * @param pattern Search pattern
	 * @returns Matching route configurations
	 */
	findRoutes(pattern: {
		method?: string;
		path?: string | RegExp;
		entity?: string;
		operation?: string;
		tags?: string[];
	}): RouteConfig[] {
		return Array.from(this.routes.values())
			.filter(metadata => {
				const config = metadata.config;

				// Match method if specified
				if (pattern.method && config.method.toUpperCase() !== pattern.method.toUpperCase()) {
					return false;
				}

				// Match path if specified
				if (pattern.path) {
					if (typeof pattern.path === 'string') {
						// Exact match
						if (config.path !== pattern.path) {
							return false;
						}
					} else {
						// Regex match
						if (!pattern.path.test(config.path)) {
							return false;
						}
					}
				}

				// Match entity if specified
				if (pattern.entity && config.entity !== pattern.entity) {
					return false;
				}

				// Match operation if specified
				if (pattern.operation && config.operation !== pattern.operation) {
					return false;
				}

				// Match tags if specified
				if (pattern.tags && pattern.tags.length > 0) {
					if (!config.tags || !pattern.tags.every(tag => config.tags!.includes(tag))) {
						return false;
					}
				}

				return true;
			})
			.map(metadata => metadata.config);
	}

	/**
	 * Add a route to a router
	 * @param router Express router
	 * @param routeConfig Route configuration
	 * @param basePath Base path for the route
	 */
	private addRouteToRouter(
		router: Router,
		routeConfig: RouteConfig,
		basePath = ''
	): void {
		const { method, path, handler, middleware = [] } = routeConfig;

		// Normalize method
		const normalizedMethod = method.toLowerCase();

		// Combine base path with route path
		const fullPath = this.combinePaths(basePath, path);

		// Resolve middleware handlers
		const middlewareHandlers = middleware.map(m => this.resolveMiddleware(m));

		// Add route with middleware
		(router as any)[normalizedMethod](
			fullPath,
			...middlewareHandlers,
			handler
		);

		this.logger.debug(`Added route to router: ${method} ${fullPath}`);
	}

	/**
	 * Resolve middleware by name or function
	 * @param middleware Middleware name or function
	 * @returns Middleware function
	 */
	private resolveMiddleware(middleware: string | Function): Function {
		if (typeof middleware === 'function') {
			return middleware;
		}

		// Try to get middleware from app context
		if (this.appContext) {
			try {
				const middlewareConfig = this.appContext.getMiddlewareConfig(middleware);

				if (middlewareConfig && middlewareConfig.handler) {
					if (typeof middlewareConfig.handler === 'function') {
						return middlewareConfig.handler;
					}
				}
			} catch (error: any) {
				this.logger.warn(`Error resolving middleware ${middleware}: ${error.message}`);
			}
		}

		// Return a pass-through middleware
		this.logger.warn(`Middleware not found: ${middleware}, using pass-through`);
		return (req: any, res: any, next: any) => next();
	}

	/**
	 * Create a route key from method and path
	 * @param method HTTP method
	 * @param path Route path
	 * @returns Route key
	 */
	private createRouteKey(method: string, path: string): string {
		return `${method.toUpperCase()}:${path}`;
	}

	/**
	 * Invalidate cache for a route key
	 * @param routeKey Route key
	 */
	private invalidateCache(routeKey: string): void {
		this.routeCache.delete(routeKey);
	}

	/**
	 * Invalidate cache for an entity
	 * @param entityName Entity name
	 */
	private invalidateEntityCache(entityName: string): void {
		// Remove any cached entity routers
		for (const key of Array.from(this.routeCache.keys())) {
			if (key.startsWith(`entity:${entityName}:`)) {
				this.routeCache.delete(key);
			}
		}
	}

	/**
	 * Combine base path with route path
	 * @param basePath Base path
	 * @param routePath Route path
	 * @returns Combined path
	 */
	private combinePaths(basePath: string, routePath: string): string {
		// Remove trailing slash from base path
		if (basePath.endsWith('/')) {
			basePath = basePath.slice(0, -1);
		}

		// Ensure route path starts with slash
		if (!routePath.startsWith('/')) {
			routePath = `/${routePath}`;
		}

		return `${basePath}${routePath}`;
	}

	/**
	 * Generate API documentation
	 * @returns OpenAPI compatible documentation object
	 */
	generateApiDocs(): Record<string, any> {
		const paths: Record<string, any> = {};
		const tags: Record<string, any>[] = [];
		const schemas: Record<string, any> = {};

		// Collect entity names as tags
		const entitySet = new Set<string>();
		for (const [entityName, routes] of this.entityRoutes.entries()) {
			entitySet.add(entityName);
		}

		// Generate tags
		entitySet.forEach(entityName => {
			tags.push({
				name: entityName,
				description: `Operations for ${entityName}`
			});
		});

		// Process all routes
		for (const { config } of this.routes.values()) {
			const pathKey = config.path;

			// Ensure path exists in documentation
			if (!paths[pathKey]) {
				paths[pathKey] = {};
			}

			// Add method documentation
			const method = config.method.toLowerCase();
			paths[pathKey][method] = {
				tags: config.tags || (config.entity ? [config.entity] : []),
				summary: config.description || `${config.method} ${config.path}`,
				...(config.requestSchema && {
					requestBody: {
						content: {
							'application/json': {
								schema: config.requestSchema
							}
						}
					}
				}),
				responses: {
					'200': {
						description: 'Successful operation',
						...(config.responseSchema && {
							content: {
								'application/json': {
									schema: config.responseSchema
								}
							}
						})
					},
					'400': {
						description: 'Bad request'
					},
					'401': {
						description: 'Unauthorized'
					},
					'403': {
						description: 'Forbidden'
					},
					'404': {
						description: 'Not found'
					},
					'500': {
						description: 'Server error'
					}
				},
				security: config.roles && config.roles.length > 0
					? [{ bearerAuth: [] }]
					: []
			};

			// Add schema if available
			if (config.responseSchema && config.entity) {
				schemas[config.entity] = config.responseSchema;
			}
		}

		// Build OpenAPI documentation
		return {
			openapi: '3.0.0',
			info: {
				title: 'API Documentation',
				version: '1.0.0',
				description: 'API documentation generated from route registry'
			},
			tags,
			paths,
			components: {
				schemas,
				securitySchemes: {
					bearerAuth: {
						type: 'http',
						scheme: 'bearer',
						bearerFormat: 'JWT'
					}
				}
			}
		};
	}
}

/**
 * Create a route registry
 * @param logger Logger instance
 * @param appContext Optional application context
 * @returns Route registry instance
 */
export function createRouteRegistry(
	logger: Logger,
	appContext?: AppContext
): RouteRegistry {
	return new RouteRegistry(logger, appContext);
}