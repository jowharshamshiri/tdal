/**
 * Hook Context
 * Provides execution context for entity hooks and actions
 */

import { Request, Response, NextFunction } from 'express';
import { EntityDao } from '../entity';
import { AppContext } from '../core/app-context';
import { HookContext, Logger } from '../core/types';

/**
 * Create a hook context for execution
 * @param appContext Application context
 * @param entityDao Entity DAO instance
 * @param req Express request object
 * @param res Express response object
 * @param next Express next function
 * @param extraData Extra data to include in context
 * @returns Hook context
 */
export function createHookContext(
	appContext: AppContext,
	entityDao: EntityDao<any>,
	req?: Request,
	res?: Response,
	next?: NextFunction,
	extraData: Record<string, any> = {}
): HookContext {
	return {
		entityDao,
		user: req?.user,
		req,
		res,
		next,
		db: appContext.db,
		logger: appContext.logger,
		services: appContext.services,
		...extraData
	};
}

/**
 * Hook error class
 * For errors that occur during hook execution
 */
export class HookError extends Error {
	statusCode: number;

	/**
	 * Constructor
	 * @param message Error message
	 * @param statusCode HTTP status code (if applicable)
	 */
	constructor(message: string, statusCode: number = 500) {
		super(message);
		this.name = 'HookError';
		this.statusCode = statusCode;
	}
}

/**
 * Log hook execution
 * @param logger Logger instance
 * @param hookType Hook type
 * @param entityName Entity name
 * @param hookName Hook name
 * @param data Data (optional)
 */
export function logHookExecution(
	logger: Logger,
	hookType: string,
	entityName: string,
	hookName: string,
	data?: any
): void {
	logger.debug(`Executing ${hookType} hook '${hookName}' for ${entityName}`, data);
}

/**
 * Wrap a hook function to add error handling and logging
 * @param hookFn Hook function
 * @param hookType Hook type
 * @param entityName Entity name
 * @param hookName Hook name
 * @returns Wrapped hook function
 */
export function wrapHookFunction<T extends (...args: any[]) => Promise<any>>(
	hookFn: T,
	hookType: string,
	entityName: string,
	hookName: string,
	logger: Logger
): T {
	return (async (...args: any[]) => {
		try {
			logHookExecution(logger, hookType, entityName, hookName, args[0]);

			// Execute the hook function
			const result = await hookFn(...args);

			logger.debug(`Completed ${hookType} hook '${hookName}' for ${entityName}`);

			return result;
		} catch (error) {
			logger.error(`Error in ${hookType} hook '${hookName}' for ${entityName}:`, error);

			// Rethrow as a HookError
			if (error instanceof Error) {
				throw new HookError(`Error in ${hookType} hook '${hookName}': ${error.message}`);
			} else {
				throw new HookError(`Error in ${hookType} hook '${hookName}': ${error}`);
			}
		}
	}) as T;
}

/**
 * Throttle hook execution
 * Used to prevent excessive hook executions
 * 
 * @param hookFn Hook function
 * @param limit Maximum executions per interval
 * @param interval Interval in milliseconds
 * @returns Throttled hook function
 */
export function throttleHook<T extends (...args: any[]) => Promise<any>>(
	hookFn: T,
	limit: number = 10,
	interval: number = 1000
): T {
	const executions: number[] = [];

	return (async (...args: any[]) => {
		const now = Date.now();

		// Remove old executions
		while (executions.length > 0 && executions[0] < now - interval) {
			executions.shift();
		}

		// Check if limit reached
		if (executions.length >= limit) {
			throw new HookError('Hook execution rate limit exceeded');
		}

		// Add current execution time
		executions.push(now);

		// Execute the hook function
		return hookFn(...args);
	}) as T;
}

/**
 * Create a hook timeout promise
 * @param timeoutMs Timeout in milliseconds
 * @returns Promise that rejects after timeout
 */
export function createHookTimeout(timeoutMs: number): Promise<never> {
	return new Promise((_, reject) => {
		setTimeout(() => {
			reject(new HookError(`Hook execution timed out after ${timeoutMs}ms`));
		}, timeoutMs);
	});
}

/**
 * Execute a hook with timeout
 * @param hookFn Hook function
 * @param args Hook arguments
 * @param timeoutMs Timeout in milliseconds
 * @returns Hook result
 */
export async function executeHookWithTimeout<T>(
	hookFn: (...args: any[]) => Promise<T>,
	args: any[],
	timeoutMs: number = 5000
): Promise<T> {
	return Promise.race([
		hookFn(...args),
		createHookTimeout(timeoutMs)
	]);
}

/**
 * Conditional hook execution
 * Executes a hook only if the condition is met
 * 
 * @param hookFn Hook function
 * @param condition Condition function
 * @returns Conditional hook function
 */
export function conditionalHook<T extends (...args: any[]) => Promise<any>>(
	hookFn: T,
	condition: (context: HookContext, ...args: any[]) => boolean | Promise<boolean>
): T {
	return (async (entity: any, context: HookContext, ...args: any[]) => {
		// Check condition
		const conditionResult = await condition(context, entity, ...args);

		// Skip if condition not met
		if (!conditionResult) {
			return entity;
		}

		// Execute the hook function
		return hookFn(entity, context, ...args);
	}) as T;
}