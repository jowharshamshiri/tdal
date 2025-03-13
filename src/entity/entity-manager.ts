/**
 * Entity Manager
 * Provides entity lifecycle management and DAO factory
 */

import * as path from 'path';
import { EntityConfig, Logger, HookContext } from '../core/types';
import { DatabaseAdapter } from '../database/database-adapter';
import { EntityDao } from '../database/entity-dao';
import { processComputedProperties } from './computed-properties';
import { AppContext } from '../core/app-context';

/**
 * Entity hook implementations
 * Contains the actual implementation of hooks defined in YAML
 */
export interface EntityHookImplementations {
	beforeCreate?: Array<(entity: any, context: HookContext) => Promise<any>>;
	afterCreate?: Array<(entity: any, context: HookContext) => Promise<any>>;
	beforeUpdate?: Array<(id: any, entity: any, context: HookContext) => Promise<any>>;
	afterUpdate?: Array<(id: any, entity: any, context: HookContext) => Promise<any>>;
	beforeDelete?: Array<(id: any, context: HookContext) => Promise<boolean>>;
	afterDelete?: Array<(id: any, context: HookContext) => Promise<void>>;
	beforeGetById?: Array<(id: any, context: HookContext) => Promise<any>>;
	afterGetById?: Array<(entity: any, context: HookContext) => Promise<any>>;
	beforeGetAll?: Array<(params: any, context: HookContext) => Promise<any>>;
	afterGetAll?: Array<(entities: any[], context: HookContext) => Promise<any[]>>;
}

/**
 * Entity hook handler
 * Used to execute hooks defined in YAML
 */
export class EntityHookHandler {
	private implementations: EntityHookImplementations = {};
	private loadedHooks: Set<string> = new Set();
	private logger: Logger;
	private config: EntityConfig;
	private configLoader: any;

	/**
	 * Constructor
	 * @param config Entity configuration
	 * @param logger Logger instance
	 * @param configLoader Configuration loader for loading external code
	 */
	constructor(config: EntityConfig, logger: Logger, configLoader: any) {
		this.config = config;
		this.logger = logger;
		this.configLoader = configLoader;
	}

	/**
	 * Initialize all hooks
	 */
	async initialize(): Promise<void> {
		if (!this.config.hooks) {
			return;
		}

		// Initialize all hook types
		for (const hookType of Object.keys(this.config.hooks || {})) {
			const hooks = (this.config.hooks as any)[hookType];
			if (!hooks || !Array.isArray(hooks)) continue;

			if (!this.implementations[hookType as keyof EntityHookImplementations]) {
				this.implementations[hookType as keyof EntityHookImplementations] = [];
			}

			for (const hook of hooks) {
				try {
					await this.loadHook(hookType, hook);
				} catch (error) {
					this.logger.error(`Failed to load hook ${hook.name} for ${this.config.entity}: ${error}`);
				}
			}
		}
	}

	/**
	 * Load a specific hook
	 * @param hookType Hook type (beforeCreate, afterUpdate, etc.)
	 * @param hook Hook definition
	 */
	private async loadHook(hookType: string, hook: any): Promise<void> {
		const hookKey = `${hookType}:${hook.name}`;

		// Skip if already loaded
		if (this.loadedHooks.has(hookKey)) {
			return;
		}

		try {
			let implementation: Function;

			// If implementation is a file path, load it
			if (hook.implementation && hook.implementation.startsWith('./')) {
				const hookModule = await this.configLoader.loadExternalCode(hook.implementation);
				implementation = hookModule.default || hookModule;
			} else {
				// Otherwise, it's an inline implementation
				// Convert the string to a function
				implementation = new Function('entity', 'context', `return (async (entity, context) => {
          ${hook.implementation}
        })(entity, context);`);
			}

			// Store condition as function if provided
			let condition: Function | undefined;
			if (hook.condition) {
				condition = new Function('entity', 'context', `return ${hook.condition};`);
			}

			// Create the hook function wrapper
			const hookFn = async (entity: any, context: HookContext) => {
				// Skip if condition is not met
				if (condition && !(await condition(entity, context))) {
					return entity;
				}

				// Execute the hook
				return await implementation(entity, context);
			};

			// Add to implementations
			const implArray = this.implementations[hookType as keyof EntityHookImplementations] as Array<any>;
			if (implArray) {
				implArray.push(hookFn);
			}

			this.loadedHooks.add(hookKey);
			this.logger.debug(`Loaded hook ${hookKey} for ${this.config.entity}`);
		} catch (error) {
			this.logger.error(`Failed to load hook ${hookKey} for ${this.config.entity}: ${error}`);
			throw error;
		}
	}

	/**
	 * Execute a hook
	 * @param hookType Hook type (beforeCreate, afterUpdate, etc.)
	 * @param params Hook parameters
	 * @param context Hook context
	 * @returns Hook result
	 */
	async executeHook(
		hookType: keyof EntityHookImplementations,
		params: any,
		context: HookContext
	): Promise<any> {
		const hooks = this.implementations[hookType];
		if (!hooks || !hooks.length) {
			return params; // No hooks to execute, return params unchanged
		}

		try {
			let result = params;

			// Execute all hooks of this type in sequence
			for (const hook of hooks) {
				result = await hook(result, context);
			}

			return result;
		} catch (error) {
			this.logger.error(`Error executing ${hookType} hook for ${this.config.entity}: ${error}`);
			throw error;
		}
	}
}

/**
 * Create an entity DAO
 * Factory function to create DAOs for entities
 * 
 * @param config Entity configuration
 * @param db Database adapter
 * @param logger Logger instance
 * @returns Entity DAO instance
 */
export function createEntityDao<T>(
	config: EntityConfig,
	db: DatabaseAdapter,
	logger: Logger
): EntityDao<T> {
	// Create base DAO
	const dao = new EntityDao<T>(config, db);

	// Return the DAO
	return dao;
}

/**
 * Create a hook context
 * @param appContext Application context
 * @param req HTTP request
 * @param res HTTP response
 * @param next Express next function
 * @returns Hook context
 */
export function createHookContext(
	appContext: AppContext,
	req?: any,
	res?: any,
	next?: any
): HookContext {
	return {
		entityDao: null as any, // Will be set by the caller
		user: req?.user,
		req,
		res,
		next,
		db: appContext.db,
		logger: appContext.logger,
		services: appContext.services
	};
}