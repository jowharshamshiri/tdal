/**
 * Action Executor
 * Executes custom entity actions defined in YAML
 */

import { Request, Response, NextFunction } from 'express';
import { HookContext, Logger } from '../core/types';
import { AppContext } from '../core/app-context';
import { createHookContext, HookError, executeHookWithTimeout } from './hook-context';
import { validateEntity } from './validation-engine';
import { EntityAction, EntityConfig } from '@/entity';

/**
 * Action implementation function type
 */
export type ActionImplementation = (
	req: Request,
	context: HookContext
) => Promise<any>;

/**
 * Action result interface
 */
export interface ActionResult {
	success: boolean;
	data?: any;
	error?: string;
	statusCode?: number;
}

/**
 * Action executor class
 * Manages and executes entity actions
 */
export class ActionExecutor {
	private readonly logger: Logger;
	private readonly configLoader: any;
	private readonly implementations: Map<string, Map<string, ActionImplementation>> = new Map();

	/**
	 * Constructor
	 * @param logger Logger instance
	 * @param configLoader Configuration loader for loading external code
	 */
	constructor(logger: Logger, configLoader: any) {
		this.logger = logger;
		this.configLoader = configLoader;
	}

	/**
	 * Register entity actions
	 * @param entity Entity configuration
	 */
	async registerActions(entity: EntityConfig): Promise<void> {
		if (!entity.actions || entity.actions.length === 0) {
			return;
		}

		if (!this.implementations.has(entity.entity)) {
			this.implementations.set(entity.entity, new Map());
		}

		const entityImplementations = this.implementations.get(entity.entity)!;

		for (const action of entity.actions) {
			try {
				const implementation = await this.loadActionImplementation(action);
				entityImplementations.set(action.name, implementation);

				this.logger.debug(`Registered action '${action.name}' for entity ${entity.entity}`);
			} catch (error) {
				this.logger.error(`Failed to register action '${action.name}' for entity ${entity.entity}:`, error);
			}
		}
	}

	/**
	 * Load action implementation
	 * @param action Action definition
	 * @returns Action implementation function
	 */
	private async loadActionImplementation(action: EntityAction): Promise<ActionImplementation> {
		// If implementation is a file path, load it
		if (action.implementation.startsWith('./')) {
			const moduleExports = await this.configLoader.loadExternalCode(action.implementation);
			return moduleExports.default || moduleExports;
		}

		// Otherwise, it's an inline implementation
		// Convert the string to a function
		return new Function('req', 'context', `
      return (async (req, context) => {
        ${action.implementation}
      })(req, context);
    `) as ActionImplementation;
	}

	/**
	 * Create a middleware function for executing the action
	 * @param entityName Entity name
	 * @param actionName Action name
	 * @param appContext Application context
	 * @returns Express middleware
	 */
	createActionMiddleware(
		entityName: string,
		actionName: string,
		appContext: AppContext
	): (req: Request, res: Response, next: NextFunction) => Promise<void> {
		return async (req: Request, res: Response, next: NextFunction) => {
			try {
				// Check if the action exists
				if (
					!this.implementations.has(entityName) ||
					!this.implementations.get(entityName)!.has(actionName)
				) {
					throw new HookError(`Action '${actionName}' not found for entity ${entityName}`, 404);
				}

				// Get entity DAO
				const entityDao = appContext.getEntityDao(entityName);

				// Create context
				const context = createHookContext(appContext, entityDao, req, res, next);

				// Get the action implementation
				const implementation = this.implementations.get(entityName)!.get(actionName)!;

				// Execute the action
				const result = await this.executeAction(implementation, req, context);

				// Send response
				res.status(result.statusCode || 200).json(result.data || { success: result.success });
			} catch (error) {
				next(error);
			}
		};
	}

	/**
	 * Execute an action
	 * @param implementation Action implementation
	 * @param req Express request
	 * @param context Hook context
	 * @returns Action result
	 */
	async executeAction(
		implementation: ActionImplementation,
		req: Request,
		context: HookContext
	): Promise<ActionResult> {
		try {
			// Execute the action with timeout
			const result = await executeHookWithTimeout(
				implementation,
				[req, context],
				10000 // 10 second timeout
			);

			return {
				success: true,
				data: result,
				statusCode: 200
			};
		} catch (error) {
			this.logger.error('Error executing action:', error);

			if (error instanceof HookError) {
				return {
					success: false,
					error: error.message,
					statusCode: error.statusCode
				};
			}

			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
				statusCode: 500
			};
		}
	}

	/**
	 * Get all available actions for an entity
	 * @param entityName Entity name
	 * @returns Array of action names
	 */
	getEntityActions(entityName: string): string[] {
		if (!this.implementations.has(entityName)) {
			return [];
		}

		return Array.from(this.implementations.get(entityName)!.keys());
	}

	/**
	 * Create action routes for an entity
	 * @param entityConfig Entity configuration
	 * @param appContext Application context
	 * @param router Express router
	 */
	createActionRoutes(
		entityConfig: EntityConfig,
		appContext: AppContext,
		router: any
	): void {
		if (!entityConfig.actions || entityConfig.actions.length === 0) {
			return;
		}

		for (const action of entityConfig.actions) {
			const path = action.path;
			const method = action.method.toLowerCase();

			// Create middleware for handling the action
			const actionMiddleware = this.createActionMiddleware(
				entityConfig.entity,
				action.name,
				appContext
			);

			// Add auth middleware if specified
			const middlewares = [];

			if (action.auth && action.auth.length > 0) {
				// Get auth service
				const authService = appContext.getService('auth');

				if (authService && authService.createRoleMiddleware) {
					// Add role-based access control
					middlewares.push(authService.createRoleMiddleware(action.auth));
				}
			}

			// Add validation middleware if needed
			// This would validate the request body against a schema

			// Add the action middleware
			middlewares.push(actionMiddleware);

			// Register the route
			router[method](path, ...middlewares);

			this.logger.info(`Registered ${method.toUpperCase()} ${path} -> ${entityConfig.entity}.${action.name}`);
		}
	}
}

/**
 * Create an action result
 * Helper function to create standardized action results
 * 
 * @param data Response data
 * @param statusCode HTTP status code
 * @returns Action result
 */
export function createActionResult(data: any, statusCode: number = 200): ActionResult {
	return {
		success: statusCode >= 200 && statusCode < 300,
		data,
		statusCode
	};
}

/**
 * Create an error action result
 * Helper function to create standardized error results
 * 
 * @param message Error message
 * @param statusCode HTTP status code
 * @returns Action result
 */
export function createErrorResult(message: string, statusCode: number = 400): ActionResult {
	return {
		success: false,
		error: message,
		statusCode
	};
}

/**
 * Validate action input
 * Helper function to validate action input data
 * 
 * @param data Input data
 * @param rules Validation rules
 * @returns Validation result
 */
export async function validateActionInput(
	data: any,
	rules: Record<string, any>,
	context: HookContext
): Promise<{ valid: boolean; errors?: Record<string, string> }> {
	try {
		const entity = {
			...data
		};

		const validationResult = await validateEntity(entity, { rules }, context.logger);

		return {
			valid: validationResult.valid,
			errors: validationResult.errors
		};
	} catch (error) {
		context.logger.error('Error validating action input:', error);

		return {
			valid: false,
			errors: {
				_error: error instanceof Error ? error.message : String(error)
			}
		};
	}
}