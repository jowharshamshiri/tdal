/**
 * Extension Points
 * Defines the extension points where plugins can hook into the framework
 */

import { Logger } from '../core/types';

/**
 * Extension point identifiers
 * These identify the places where plugins can extend the framework
 */
export enum ExtensionPoint {
	// Entity processing
	ENTITY_LOAD = 'entity:load',                 // Called when entity definition is loaded
	ENTITY_VALIDATE = 'entity:validate',         // Called to validate entity definition
	ENTITY_PROCESS = 'entity:process',           // Called to process entity definition

	// API generation
	API_GENERATE = 'api:generate',               // Called when generating API for an entity
	API_ROUTE = 'api:route',                     // Called when registering API routes
	API_MIDDLEWARE = 'api:middleware',           // Called to provide middleware for API routes
	API_TRANSFORM_REQUEST = 'api:transformRequest', // Called to transform API requests
	API_TRANSFORM_RESPONSE = 'api:transformResponse', // Called to transform API responses

	// Authentication
	AUTH_PROVIDER = 'auth:provider',             // Called to register authentication providers
	AUTH_MIDDLEWARE = 'auth:middleware',         // Called to provide authentication middleware
	AUTH_USER_LOAD = 'auth:userLoad',            // Called when loading a user

	// Database operations
	DB_BEFORE_QUERY = 'db:beforeQuery',          // Called before executing a database query
	DB_AFTER_QUERY = 'db:afterQuery',            // Called after executing a database query
	DB_MODIFY_QUERY = 'db:modifyQuery',          // Called to modify a database query
	DB_ADAPTER = 'db:adapter',                   // Called to register database adapters

	// UI generation
	UI_COMPONENT = 'ui:component',               // Called to register UI components
	UI_TEMPLATE = 'ui:template',                 // Called to register UI templates
	UI_TRANSFORM = 'ui:transform',               // Called to transform UI definitions

	// Application lifecycle
	APP_INITIALIZE = 'app:initialize',           // Called when the application is initializing
	APP_START = 'app:start',                     // Called when the application is starting
	APP_SHUTDOWN = 'app:shutdown',               // Called when the application is shutting down

	// Framework components
	VALIDATOR = 'validator',                     // Called to register custom validators
	FORMATTER = 'formatter',                     // Called to register custom formatters
	SERVICE = 'service',                         // Called to register services

	// Miscellaneous
	COMMAND = 'command',                         // Called to register CLI commands
	HOOK = 'hook',                              // Called to register custom hooks

	// Custom (plugin-defined)
	CUSTOM = 'custom',                           // For plugin-defined extension points
}

/**
 * Extension registry
 * Manages registered extensions
 */
export class ExtensionRegistry {
	/**
	 * Extensions by point
	 */
	private extensions: Map<ExtensionPoint, Array<{ plugin: string; extension: any }>> = new Map();

	/**
	 * Custom extension points
	 */
	private customPoints: Map<string, Array<{ plugin: string; extension: any }>> = new Map();

	/**
	 * Logger instance
	 */
	private logger: Logger;

	/**
	 * Constructor
	 * @param logger Logger instance
	 */
	constructor(logger: Logger) {
		this.logger = logger;
	}

	/**
	 * Register an extension
	 * @param plugin Plugin name
	 * @param point Extension point
	 * @param extension Extension implementation
	 */
	registerExtension(plugin: string, point: ExtensionPoint | string, extension: any): void {
		if (typeof point === 'string' && !Object.values(ExtensionPoint).includes(point as ExtensionPoint)) {
			// Custom extension point
			const customPoint = point;
			if (!this.customPoints.has(customPoint)) {
				this.customPoints.set(customPoint, []);
			}

			this.customPoints.get(customPoint)!.push({ plugin, extension });
			this.logger.debug(`Plugin ${plugin} registered extension for custom point ${customPoint}`);
			return;
		}

		const extensionPoint = point as ExtensionPoint;

		if (!this.extensions.has(extensionPoint)) {
			this.extensions.set(extensionPoint, []);
		}

		this.extensions.get(extensionPoint)!.push({ plugin, extension });
		this.logger.debug(`Plugin ${plugin} registered extension for ${extensionPoint}`);
	}

	/**
	 * Get all extensions for an extension point
	 * @param point Extension point
	 * @returns Extensions for the point
	 */
	getExtensions(point: ExtensionPoint | string): any[] {
		if (typeof point === 'string' && !Object.values(ExtensionPoint).includes(point as ExtensionPoint)) {
			// Custom extension point
			return (this.customPoints.get(point) || []).map(ext => ext.extension);
		}

		const extensionPoint = point as ExtensionPoint;
		return (this.extensions.get(extensionPoint) || []).map(ext => ext.extension);
	}

	/**
	 * Get all extensions with plugin information
	 * @param point Extension point
	 * @returns Extensions with plugin information
	 */
	getExtensionsWithPlugins(point: ExtensionPoint | string): Array<{ plugin: string; extension: any }> {
		if (typeof point === 'string' && !Object.values(ExtensionPoint).includes(point as ExtensionPoint)) {
			// Custom extension point
			return this.customPoints.get(point) || [];
		}

		const extensionPoint = point as ExtensionPoint;
		return this.extensions.get(extensionPoint) || [];
	}

	/**
	 * Check if an extension point has any extensions
	 * @param point Extension point
	 * @returns Whether the point has extensions
	 */
	hasExtensions(point: ExtensionPoint | string): boolean {
		if (typeof point === 'string' && !Object.values(ExtensionPoint).includes(point as ExtensionPoint)) {
			// Custom extension point
			return this.customPoints.has(point) && this.customPoints.get(point)!.length > 0;
		}

		const extensionPoint = point as ExtensionPoint;
		return this.extensions.has(extensionPoint) && this.extensions.get(extensionPoint)!.length > 0;
	}

	/**
	 * Register a custom extension point
	 * @param name Extension point name
	 * @param description Extension point description
	 */
	registerCustomExtensionPoint(name: string, description?: string): void {
		if (!this.customPoints.has(name)) {
			this.customPoints.set(name, []);
			this.logger.debug(`Registered custom extension point ${name}`);
		}
	}

	/**
	 * Get all registered extension points
	 * @returns Extension points
	 */
	getExtensionPoints(): Array<ExtensionPoint | string> {
		const builtInPoints = Array.from(this.extensions.keys());
		const customPoints = Array.from(this.customPoints.keys());
		return [...builtInPoints, ...customPoints];
	}

	/**
	 * Clear all extensions
	 */
	clear(): void {
		this.extensions.clear();
		this.customPoints.clear();
	}
}

/**
 * Extension context
 * Provided to extensions when they're executed
 */
export interface ExtensionContext {
	/**
	 * Extension point
	 */
	point: ExtensionPoint | string;

	/**
	 * Plugin name
	 */
	plugin: string;

	/**
	 * Logger instance
	 */
	logger: Logger;

	/**
	 * Extension parameters
	 */
	params: any;
}

/**
 * Entity processing extension
 * Used to process entity definitions
 */
export interface EntityProcessingExtension {
	/**
	 * Process an entity definition
	 * @param entity Entity definition
	 * @param context Extension context
	 * @returns Processed entity definition
	 */
	process(entity: any, context: ExtensionContext): Promise<any>;
}

/**
 * API generation extension
 * Used to customize API generation
 */
export interface ApiGenerationExtension {
	/**
	 * Generate API for an entity
	 * @param entity Entity definition
	 * @param context Extension context
	 * @returns Generated API routes
	 */
	generate(entity: any, context: ExtensionContext): Promise<any[]>;
}

/**
 * API middleware extension
 * Used to provide middleware for API routes
 */
export interface ApiMiddlewareExtension {
	/**
	 * Get middleware for an API route
	 * @param route Route information
	 * @param context Extension context
	 * @returns Middleware functions
	 */
	getMiddleware(route: any, context: ExtensionContext): Promise<any[]>;
}

/**
 * Authentication provider extension
 * Used to provide authentication mechanisms
 */
export interface AuthProviderExtension {
	/**
	 * Get the authentication provider
	 * @param context Extension context
	 * @returns Authentication provider
	 */
	getProvider(context: ExtensionContext): Promise<any>;
}

/**
 * Database adapter extension
 * Used to provide database adapters
 */
export interface DatabaseAdapterExtension {
	/**
	 * Get the database adapter
	 * @param config Database configuration
	 * @param context Extension context
	 * @returns Database adapter
	 */
	getAdapter(config: any, context: ExtensionContext): Promise<any>;
}

/**
 * UI component extension
 * Used to provide UI components
 */
export interface UiComponentExtension {
	/**
	 * Get UI components
	 * @param context Extension context
	 * @returns UI components
	 */
	getComponents(context: ExtensionContext): Promise<Record<string, any>>;
}

/**
 * Validator extension
 * Used to provide custom validators
 */
export interface ValidatorExtension {
	/**
	 * Get validators
	 * @param context Extension context
	 * @returns Validators
	 */
	getValidators(context: ExtensionContext): Promise<Record<string, any>>;
}

/**
 * Formatter extension
 * Used to provide custom formatters
 */
export interface FormatterExtension {
	/**
	 * Get formatters
	 * @param context Extension context
	 * @returns Formatters
	 */
	getFormatters(context: ExtensionContext): Promise<Record<string, any>>;
}

/**
 * Service extension
 * Used to provide services
 */
export interface ServiceExtension {
	/**
	 * Get services
	 * @param context Extension context
	 * @returns Services
	 */
	getServices(context: ExtensionContext): Promise<Record<string, any>>;
}

/**
 * Command extension
 * Used to provide CLI commands
 */
export interface CommandExtension {
	/**
	 * Get commands
	 * @param context Extension context
	 * @returns Commands
	 */
	getCommands(context: ExtensionContext): Promise<Record<string, any>>;
}

/**
 * Execute extensions for an extension point
 * @param registry Extension registry
 * @param point Extension point
 * @param params Extension parameters
 * @param logger Logger instance
 * @returns Extension results
 */
export async function executeExtensions(
	registry: ExtensionRegistry,
	point: ExtensionPoint | string,
	params: any,
	logger: Logger
): Promise<any[]> {
	const extensions = registry.getExtensionsWithPlugins(point);

	if (extensions.length === 0) {
		return [];
	}

	const results: any[] = [];

	for (const { plugin, extension } of extensions) {
		try {
			// Create extension context
			const context: ExtensionContext = {
				point,
				plugin,
				logger,
				params
			};

			// Execute the extension
			if (typeof extension === 'function') {
				const result = await extension(params, context);
				results.push(result);
			} else if (extension && typeof extension.execute === 'function') {
				const result = await extension.execute(params, context);
				results.push(result);
			} else {
				logger.warn(`Invalid extension from plugin ${plugin} for point ${point}`);
			}
		} catch (error: any) {
			logger.error(`Error executing extension from plugin ${plugin} for point ${point}: ${error}`);
		}
	}

	return results;
}