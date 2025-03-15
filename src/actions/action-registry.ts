/**
 * Action Registry
 * Manages entity actions and their execution
 */

import { Logger } from '../core/types';
import { EntityConfig, EntityAction } from '../entity/entity-config';
import { HookContext } from '../core/types';
import { DatabaseAdapter, TransactionIsolationLevel } from '../database';
import { executeHookWithTimeout, HookImplementation, createHook } from '../hooks/hooks-executor';
import { HookError } from '../hooks/hook-context';
import * as path from 'path';

/**
 * Action implementation
 */
export interface ActionImplementation {
	/**
	 * Action function
	 */
	fn: (params: any, context: HookContext) => Promise<any>;

	/**
	 * Action metadata
	 */
	metadata: EntityAction;

	/**
	 * Entity name
	 */
	entityName: string;
}

/**
 * Action execution result
 */
export interface ActionResult<T = any> {
	/**
	 * Whether the action was successful
	 */
	success: boolean;

	/**
	 * Result data if successful
	 */
	data?: T;

	/**
	 * Error message if unsuccessful
	 */
	error?: string;

	/**
	 * HTTP status code (for API responses)
	 */
	statusCode?: number;

	/**
	 * Additional result metadata
	 */
	metadata?: Record<string, any>;
}

/**
 * Action execution options
 */
export interface ActionExecutionOptions {
	/**
	 * Whether to execute in a transaction
	 */
	transactional?: boolean;

	/**
	 * Transaction isolation level
	 */
	isolationLevel?: TransactionIsolationLevel;

	/**
	 * Whether to throw errors (true) or return error results (false)
	 */
	throwErrors?: boolean;

	/**
	 * Timeout in milliseconds
	 */
	timeout?: number;
}

/**
 * Action registry
 * Manages entity actions
 */
export class ActionRegistry {
	/**
	 * Registered actions by name
	 */
	private actions: Map<string, ActionImplementation> = new Map();

	/**
	 * Action implementations by entity
	 */
	private entityActions: Map<string, Map<string, ActionImplementation>> = new Map();

	/**
	 * Action hooks by entity and action name
	 */
	private actionHooks: Map<string, Map<string, {
		before: HookImplementation[],
		after: HookImplementation[]
	}>> = new Map();

	/**
	 * Logger instance
	 */
	private logger: Logger;

	/**
	 * Configuration loader
	 */
	private configLoader: any;

	/**
	 * Constructor
	 * @param logger Logger instance
	 * @param configLoader Configuration loader for external code
	 */
	constructor(logger: Logger, configLoader?: any) {
		this.logger = logger;
		this.configLoader = configLoader;
	}

	/**
	 * Register an action
	 * @param entityName Entity name
	 * @param action Action configuration
	 * @returns Whether registration was successful
	 */
	async registerAction(entityName: string, action: EntityAction): Promise<boolean> {
		try {
			// Generate action key
			const actionKey = `${entityName}.${action.name}`;

			// Check if action already exists
			if (this.actions.has(actionKey)) {
				this.logger.warn(`Action ${actionKey} already registered, skipping`);
				return false;
			}

			// Create action implementation
			this.logger.debug(`Registering action ${actionKey}`);

			// Check for implementation
			if (!action.implementation) {
				this.logger.error(`Action ${actionKey} has no implementation`);
				return false;
			}

			// Create implementation function
			let implementationFn: (params: any, context: HookContext) => Promise<any>;

			if (typeof action.implementation === 'function') {
				// Direct function reference
				implementationFn = action.implementation as (params: any, context: HookContext) => Promise<any>;
			} else if (typeof action.implementation === 'string') {
				if (action.implementation.startsWith('./') || action.implementation.startsWith('../') || path.isAbsolute(action.implementation)) {
					// External file path - load it now
					if (this.configLoader) {
						const module = await this.configLoader.loadExternalCode(action.implementation);
						implementationFn = module.default || module;
					} else {
						// Create a function that will load the module at execution time
						implementationFn = async (params: any, context: HookContext) => {
							try {
								const resolvedPath = path.resolve(process.cwd(), action.implementation as string);
								const module = await import(resolvedPath);
								const fn = module.default || module;

								if (typeof fn !== 'function') {
									throw new Error(`Action implementation is not a function`);
								}

								return await fn(params, context);
							} catch (error: any) {
								this.logger.error(`Error executing action ${actionKey}: ${error.message}`);
								throw error;
							}
						};
					}
				} else {
					// Inline code string
					implementationFn = new Function(
						'params',
						'context',
						`return (async (params, context) => { ${action.implementation} })(params, context);`
					) as any;
				}
			} else {
				this.logger.error(`Invalid implementation for action ${actionKey}`);
				return false;
			}

			// Create action implementation
			const implementation: ActionImplementation = {
				fn: implementationFn,
				metadata: action,
				entityName
			};

			// Register in main actions map
			this.actions.set(actionKey, implementation);

			// Register in entity actions map
			if (!this.entityActions.has(entityName)) {
				this.entityActions.set(entityName, new Map());
			}

			this.entityActions.get(entityName)!.set(action.name, implementation);

			// Initialize action hooks map
			if (!this.actionHooks.has(entityName)) {
				this.actionHooks.set(entityName, new Map());
			}

			if (!this.actionHooks.get(entityName)!.has(action.name)) {
				this.actionHooks.get(entityName)!.set(action.name, {
					before: [],
					after: []
				});
			}

			this.logger.info(`Registered action ${actionKey}`);
			return true;
		} catch (error: any) {
			this.logger.error(`Error registering action ${entityName}.${action.name}: ${error.message}`);
			return false;
		}
	}

	/**
	 * Register multiple actions for an entity
	 * @param entityName Entity name
	 * @param entityConfig Entity configuration
	 * @returns Number of successfully registered actions
	 */
	async registerEntityActions(entityName: string, entityConfig: EntityConfig): Promise<number> {
		let successCount = 0;

		if (!entityConfig.actions || entityConfig.actions.length === 0) {
			return 0;
		}

		for (const action of entityConfig.actions) {
			if (await this.registerAction(entityName, action)) {
				successCount++;
			}
		}

		return successCount;
	}

	/**
	 * Register a hook for an action
	 * @param entityName Entity name
	 * @param actionName Action name
	 * @param hook Hook implementation
	 * @param phase Hook phase ('before' or 'after')
	 */
	registerActionHook(
		entityName: string,
		actionName: string,
		hook: HookImplementation,
		phase: 'before' | 'after' = 'after'
	): void {
		if (!this.actionHooks.has(entityName)) {
			this.actionHooks.set(entityName, new Map());
		}

		if (!this.actionHooks.get(entityName)!.has(actionName)) {
			this.actionHooks.get(entityName)!.set(actionName, {
				before: [],
				after: []
			});
		}

		this.actionHooks.get(entityName)!.get(actionName)![phase].push(hook);
		this.logger.debug(`Registered ${phase} hook ${hook.name} for action ${entityName}.${actionName}`);
	}

	/**
	 * Get an action by name
	 * @param entityName Entity name
	 * @param actionName Action name
	 * @returns Action implementation or undefined if not found
	 */
	getAction(entityName: string, actionName: string): ActionImplementation | undefined {
		const actionKey = `${entityName}.${actionName}`;
		return this.actions.get(actionKey);
	}

	/**
	 * Get all actions for an entity
	 * @param entityName Entity name
	 * @returns Map of action name to implementation
	 */
	getEntityActions(entityName: string): Map<string, ActionImplementation> {
		return this.entityActions.get(entityName) || new Map();
	}

	/**
	 * Get all registered actions
	 * @returns Map of action key to implementation
	 */
	getAllActions(): Map<string, ActionImplementation> {
		return new Map(this.actions);
	}

	/**
	 * Execute an action
	 * @param entityName Entity name
	 * @param actionName Action name
	 * @param params Action parameters
	 * @param context Hook context
	 * @param options Execution options
	 * @returns Action result
	 */
	async executeAction<T = any>(
		entityName: string,
		actionName: string,
		params: any,
		context: HookContext,
		options: ActionExecutionOptions = {}
	): Promise<ActionResult<T>> {
		try {
			// Get action implementation
			const action = this.getAction(entityName, actionName);

			if (!action) {
				this.logger.error(`Action ${entityName}.${actionName} not found`);
				return {
					success: false,
					error: `Action ${actionName} not found for entity ${entityName}`,
					statusCode: 404
				};
			}

			// Default timeout to 30 seconds if not specified
			const timeout = options.timeout || 30000;

			// Get hooks for the action
			const hooks = this.actionHooks.get(entityName)?.get(actionName);

			// Execute before hooks if present
			let processedParams = params;
			if (hooks && hooks.before.length > 0) {
				for (const hook of hooks.before) {
					try {
						const result = await executeHookWithTimeout(
							hook.fn,
							[{ params: processedParams, action: actionName }, context],
							hook.timeout || timeout
						);

						if (result && result.params) {
							processedParams = result.params;
						}
					} catch (error: any) {
						this.logger.error(`Error executing before hook for action ${entityName}.${actionName}: ${error.message}`);

						if (options.throwErrors) {
							throw error;
						}

						return {
							success: false,
							error: `Action pre-processing failed: ${error.message}`,
							statusCode: 500
						};
					}
				}
			}

			// Execute the action with timeout
			let result: any;

			try {
				result = await executeHookWithTimeout(
					action.fn,
					[processedParams, context],
					timeout
				);
			} catch (error: any) {
				this.logger.error(`Error executing action ${entityName}.${actionName}: ${error.message}`);

				if (options.throwErrors) {
					throw error;
				}

				return {
					success: false,
					error: `Action execution failed: ${error.message}`,
					statusCode: error instanceof HookError ? error.statusCode : 500
				};
			}

			// Execute after hooks if present
			let processedResult = result;
			if (hooks && hooks.after.length > 0) {
				for (const hook of hooks.after) {
					try {
						const hookResult = await executeHookWithTimeout(
							hook.fn,
							[{ result: processedResult, action: actionName }, context],
							hook.timeout || timeout
						);

						if (hookResult && hookResult.result !== undefined) {
							processedResult = hookResult.result;
						}
					} catch (error: any) {
						this.logger.error(`Error executing after hook for action ${entityName}.${actionName}: ${error.message}`);

						if (options.throwErrors) {
							throw error;
						}

						// Continue with the original result even if after hooks fail
					}
				}
			}

			// Return success result
			return {
				success: true,
				data: processedResult,
				statusCode: 200
			};
		} catch (error: any) {
			this.logger.error(`Error executing action ${entityName}.${actionName}: ${error.message}`);

			// Return error result
			if (options.throwErrors) {
				throw error;
			}

			return {
				success: false,
				error: `Action execution failed: ${error.message}`,
				statusCode: error instanceof HookError ? error.statusCode : 500
			};
		}
	}

	/**
	 * Check if an action exists
	 * @param entityName Entity name
	 * @param actionName Action name
	 * @returns Whether the action exists
	 */
	hasAction(entityName: string, actionName: string): boolean {
		const actionKey = `${entityName}.${actionName}`;
		return this.actions.has(actionKey);
	}

	/**
	 * Get all API actions for an entity
	 * @param entityName Entity name
	 * @returns Array of API action configurations
	 */
	getApiActions(entityName: string): EntityAction[] {
		const entityActionMap = this.entityActions.get(entityName);

		if (!entityActionMap) {
			return [];
		}

		return Array.from(entityActionMap.values())
			.map(action => action.metadata)
			.filter(action => action.httpMethod && action.route);
	}

	/**
	 * Create an action hook
	 * @param name Hook name
	 * @param fn Hook function
	 * @param options Hook options
	 * @returns Hook implementation
	 */
	createActionHook(
		name: string,
		fn: (data: any, context: HookContext) => Promise<any> | any,
		options: {
			priority?: number;
			timeout?: number;
			condition?: (data: any, context: HookContext) => boolean | Promise<boolean>;
		} = {}
	): HookImplementation {
		return createHook(name, fn, options);
	}
}