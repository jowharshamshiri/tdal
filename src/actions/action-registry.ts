/**
 * Action Registry
 * Manages entity actions and their execution
 */

import { Logger } from '../core/types';
import { EntityConfig, EntityAction } from '../entity/entity-config';
import { HookContext } from '../core/types';
import { DatabaseAdapter } from '../database';
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
	 * Register an action
	 * @param entityName Entity name
	 * @param action Action configuration
	 * @returns Whether registration was successful
	 */
	registerAction(entityName: string, action: EntityAction): boolean {
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
				implementationFn = action.implementation;
			} else if (typeof action.implementation === 'string') {
				if (action.implementation.startsWith('./') || action.implementation.startsWith('../') || path.isAbsolute(action.implementation)) {
					// External file path - will be loaded when the action is executed
					implementationFn = async (params: any, context: HookContext) => {
						try {
							const resolvedPath = path.resolve(process.cwd(), action.implementation as string);
							const module = await import(resolvedPath);
							const fn = module.default || module;

							if (typeof fn !== 'function') {
								throw new Error(`Action implementation is not a function`);
							}

							return await fn(params, context);
						} catch (error) {
							this.logger.error(`Error executing action ${actionKey}: ${error.message}`);
							throw error;
						}
					};
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

			this.logger.info(`Registered action ${actionKey}`);
			return true;
		} catch (error) {
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
	registerEntityActions(entityName: string, entityConfig: EntityConfig): number {
		let successCount = 0;

		if (!entityConfig.actions || entityConfig.actions.length === 0) {
			return 0;
		}

		for (const action of entityConfig.actions) {
			if (this.registerAction(entityName, action)) {
				successCount++;
			}
		}

		return successCount;
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
	 * @returns Action result
	 */
	async executeAction<T = any>(
		entityName: string,
		actionName: string,
		params: any,
		context: HookContext
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

			// Check if the action is transactional
			const isTransactional = action.metadata.transactional === true;

			// Execute action
			let result: any;

			if (isTransactional) {
				// Execute with transaction
				const db = context.db || context.appContext?.getDatabase();

				if (!db) {
					this.logger.error(`No database available for transactional action ${entityName}.${actionName}`);
					return {
						success: false,
						error: 'Database not available for transactional action',
						statusCode: 500
					};
				}

				result = await db.transaction(async (txDb: DatabaseAdapter) => {
					// Create transaction context
					const txContext = { ...context, db: txDb };

					// Execute action
					return await action.fn(params, txContext);
				});
			} else {
				// Execute without transaction
				result = await action.fn(params, context);
			}

			// Return success result
			return {
				success: true,
				data: result,
				statusCode: 200
			};
		} catch (error) {
			this.logger.error(`Error executing action ${entityName}.${actionName}: ${error.message}`);

			// Return error result
			return {
				success: false,
				error: `Action execution failed: ${error.message}`,
				statusCode: 500
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
}