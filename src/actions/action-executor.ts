/**
 * Action Executor
 * Executes entity actions with transaction support
 */

import { Request, Response, NextFunction } from 'express';
import { ActionRegistry, ActionResult } from './action-registry';
import { AppContext } from '../core/app-context';
import { Logger, HookContext } from '../core/types';
import { DatabaseAdapter } from '../database';
import { createControllerContext } from '../entity/entity-manager';

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
	isolationLevel?: 'READ_UNCOMMITTED' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';

	/**
	 * Whether to throw errors (true) or return error results (false)
	 */
	throwErrors?: boolean;

	/**
	 * Extra context data
	 */
	contextData?: Record<string, any>;

	/**
	 * Timeout in milliseconds
	 */
	timeout?: number;
}

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
	 * Constructor
	 * @param appContext Application context
	 */
	constructor(private appContext: AppContext) {
		this.actionRegistry = appContext.getActionRegistry();
		this.logger = appContext.getLogger();
		this.db = appContext.getDatabase();
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
					...(options.contextData || {})
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
		} catch (error) {
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
			} catch (error) {
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
	 * Create action middleware
	 * @param entityName Entity name
	 * @param actionName Action name
	 * @param options Execution options
	 * @returns Express middleware
	 */
	middleware(
		entityName: string,
		actionName: string,
		options: ActionExecutionOptions = {}
	): (req: Request, res: Response, next: NextFunction) => Promise<void> {
		return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
			try {
				// Create context
				const context = createControllerContext(
					this.db,
					this.logger,
					entityName,
					'action',
					req,
					res,
					next
				);

				// Add action info to context
				context.action = actionName;

				// Get parameters from request
				const params = {
					...req.params,
					...req.query,
					...req.body,
					files: (req as any).files,
					file: (req as any).file
				};

				// Get entity manager
				const entityManager = this.appContext.getEntityManager(entityName);

				// Process API request
				const processedParams = await entityManager.processApiRequest(
					params,
					'action',
					context
				);

				// Execute action
				const result = await this.execute(
					entityName,
					actionName,
					processedParams,
					context,
					options
				);

				if (!result.success) {
					// Handle error
					const status = result.statusCode || 500;

					res.status(status).json({
						error: 'ActionError',
						message: result.error || 'Action execution failed',
						status
					});
					return;
				}

				// Process API response
				const processedResult = await entityManager.processApiResponse(
					result.data,
					'action',
					context
				);

				// Send response
				res.status(result.statusCode || 200).json(processedResult);
			} catch (error) {
				this.logger.error(`Action middleware error: ${error.message}`);

				// Forward to error handler
				next(error);
			}
		};
	}

	/**
	 * Get API route handler for an action
	 * @param entityName Entity name
	 * @param actionName Action name
	 * @returns Express route handler
	 */
	getApiHandler(
		entityName: string,
		actionName: string
	): (req: Request, res: Response, next: NextFunction) => Promise<void> {
		return this.middleware(entityName, actionName);
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