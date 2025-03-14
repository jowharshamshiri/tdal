/**
 * Route Registry
 * Manages API route registration and discovery
 */

import { Router } from 'express';
import { Logger, RouteConfig } from '../core/types';

/**
 * Route Registry class
 * Manages API route registration and discovery
 */
export class RouteRegistry {
	/**
	 * Registered routes
	 */
	private routes: Map<string, RouteConfig> = new Map();

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
	 * Constructor
	 * @param logger Logger instance
	 */
	constructor(private logger: Logger) { }

	/**
	 * Register a route
	 * @param routeConfig Route configuration
	 * @returns Whether the registration was successful
	 */
	registerRoute(routeConfig: RouteConfig): boolean {
		// Create route key
		const routeKey = this.createRouteKey(routeConfig.method, routeConfig.path);

		// Check for existing route
		if (this.routes.has(routeKey)) {
			this.logger.warn(`Route already registered: ${routeConfig.method} ${routeConfig.path}`);
			return false;
		}

		// Register route
		this.routes.set(routeKey, routeConfig);

		// Add to entity routes if entity is specified
		if (routeConfig.entity) {
			if (!this.entityRoutes.has(routeConfig.entity)) {
				this.entityRoutes.set(routeConfig.entity, []);
			}

			this.entityRoutes.get(routeConfig.entity)?.push(routeConfig);
		}

		this.logger.debug(`Registered route: ${routeConfig.method} ${routeConfig.path}`);

		// Invalidate cache
		this.invalidateCache(routeKey);

		return true;
	}

	/**
	 * Register multiple routes
	 * @param routeConfigs Route configurations
	 * @returns Number of successfully registered routes
	 */
	registerRoutes(routeConfigs: RouteConfig[]): number {
		let successCount = 0;

		for (const routeConfig of routeConfigs) {
			if (this.registerRoute(routeConfig)) {
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
		return this.routes.get(routeKey);
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
		return Array.from(this.routes.values());
	}

	/**
	 * Create a router with all registered routes
	 * @param basePath Base path for all routes
	 * @returns Express router
	 */
	createRouter(basePath = ''): Router {
		const router = Router();

		// Register all routes
		for (const routeConfig of this.routes.values()) {
			this.addRouteToRouter(router, routeConfig, basePath);
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
		const router = Router();
		const entityRoutes = this.entityRoutes.get(entityName) || [];

		// Register entity routes
		for (const routeConfig of entityRoutes) {
			this.addRouteToRouter(router, routeConfig, basePath);
		}

		return router;
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

		// Add route with middleware
		(router as any)[normalizedMethod](
			fullPath,
			...middleware.map(m => this.resolveMiddleware(m)),
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

		// In a real implementation, you would load the middleware
		// from a registry or container
		this.logger.warn(`Middleware resolution not implemented: ${middleware}`);

		// Return a pass-through middleware
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
}