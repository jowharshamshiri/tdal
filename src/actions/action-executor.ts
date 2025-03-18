/**
 * Action Executor
 * Executes entity actions with transaction support
 */

import { ActionRegistry, ActionResult, ActionExecutionOptions } from './action-registry';
import { AppContext } from '../core/app-context';
import { HookContext } from '../core/types';
import { DatabaseAdapter } from '../database';
import { createHookContext, HookError } from '../hooks/hook-context';
import { EntityConfig } from '../entity';
import { Logger } from '../logging';

/**
 * Action executor
 * Executes entity actions
 */
export class ActionExecutor {
	/**
	 * Action registry
	 */
	private actionRegistry: ActionRegistry;

	/**
	 * Logger instance
	 */
	private logger: Logger;

	/**
	 * Database adapter
	 */
	private db: DatabaseAdapter;

	/**
	 * Configuration loader
	 */
	private configLoader: any;

	/**
	 * Constructor
	 * @param appContext Application context
	 */
	constructor(private appContext: AppContext) {
		this.actionRegistry = appContext.getActionRegistry();
		this.logger = appContext.getLogger();
		this.db = appContext.getDatabase();
		this.configLoader = appContext.getService('configLoader');
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
	async execute<T = any>(
		entityName: string,
		actionName: string,
		params: any,
		context: HookContext,
		options: ActionExecutionOptions = {}
	): Promise<ActionResult<T>> {
		// Set execution timeout if specified
		let timeoutId: NodeJS.Timeout | undefined;
		let timeoutPromise: Promise<ActionResult<T>> | undefined;

		if (options.timeout && options.timeout > 0) {
			timeoutPromise = new Promise<ActionResult<T>>(resolve => {
				timeoutId = setTimeout(() => {
					resolve({
						success: false,
						error: `Action execution timed out after ${options.timeout}ms`,
						statusCode: 504
					});
				}, options.timeout);
			});
		}

		try {
			// Prepare context
			const executionContext: HookContext = {
				...context,
				data: {
					...(context.data || {}),
				}
			};

			// Create execution promise
			const executionPromise = this.executeAction<T>(
				entityName,
				actionName,
				params,
				executionContext,
				options
			);

			// Race execution against timeout if set
			const result = timeoutPromise
				? await Promise.race([executionPromise, timeoutPromise])
				: await executionPromise;

			// Clear timeout if set
			if (timeoutId) {
				clearTimeout(timeoutId);
			}

			return result;
		} catch (error: any) {
			// Clear timeout if set
			if (timeoutId) {
				clearTimeout(timeoutId);
			}

			this.logger.error(`Unhandled error in action ${entityName}.${actionName}: ${error.message}`);

			if (options.throwErrors) {
				throw error;
			}

			return {
				success: false,
				error: `Action execution failed: ${error.message}`,
				statusCode: 500
			};
		}
	}

	/**
	 * Internal action execution
	 * @param entityName Entity name
	 * @param actionName Action name
	 * @param params Action parameters
	 * @param context Hook context
	 * @param options Execution options
	 * @returns Action result
	 */
	private async executeAction<T = any>(
		entityName: string,
		actionName: string,
		params: any,
		context: HookContext,
		options: ActionExecutionOptions
	): Promise<ActionResult<T>> {
		const { transactional = false, isolationLevel } = options;

		// Check if the action exists
		if (!this.actionRegistry.hasAction(entityName, actionName)) {
			return {
				success: false,
				error: `Action ${actionName} not found for entity ${entityName}`,
				statusCode: 404
			};
		}

		// Get action implementation
		const action = this.actionRegistry.getAction(entityName, actionName);

		// Check if action-level transaction setting overrides options
		const isTransactional = action?.metadata.transactional !== undefined
			? action.metadata.transactional
			: transactional;

		if (isTransactional) {
			try {
				// Execute with transaction
				const result = await this.db.transaction(async (txDb: DatabaseAdapter) => {
					// Update context with transaction database
					const txContext = { ...context, db: txDb };

					// Execute action
					return await this.actionRegistry.executeAction<T>(
						entityName,
						actionName,
						params,
						txContext
					);
				}, isolationLevel);

				return result;
			} catch (error: any) {
				this.logger.error(`Transaction error in action ${entityName}.${actionName}: ${error.message}`);

				return {
					success: false,
					error: `Transaction failed: ${error.message}`,
					statusCode: 500
				};
			}
		} else {
			// Execute without transaction
			return await this.actionRegistry.executeAction<T>(
				entityName,
				actionName,
				params,
				context
			);
		}
	}

	/**
	 * Load action implementations for an entity
	 * @param entity Entity configuration
	 */
	async registerActions(entity: EntityConfig): Promise<void> {
		if (!entity.actions || entity.actions.length === 0) {
			return;
		}

		for (const action of entity.actions) {
			try {
				await this.actionRegistry.registerAction(entity.entity, action);
			} catch (error: any) {
				this.logger.error(`Failed to register action '${action.name}' for entity ${entity.entity}:`, error);
			}
		}
	}

	/**
	 * Create a result with success status
	 * @param data Result data
	 * @param statusCode HTTP status code (default: 200)
	 * @returns Action result
	 */
	createSuccessResult<T>(data: T, statusCode: number = 200): ActionResult<T> {
		return {
			success: true,
			data,
			statusCode
		};
	}

	/**
	 * Create a result with error status
	 * @param message Error message
	 * @param statusCode HTTP status code (default: 400)
	 * @returns Action result
	 */
	createErrorResult(message: string, statusCode: number = 400): ActionResult<void> {
		return {
			success: false,
			error: message,
			statusCode
		};
	}
}

/**
 * Create action executor
 * @param appContext Application context
 * @returns Action executor
 */
export function createActionExecutor(appContext: AppContext): ActionExecutor {
	return new ActionExecutor(appContext);
}