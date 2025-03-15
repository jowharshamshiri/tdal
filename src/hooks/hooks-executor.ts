/**
 * Hook Executor
 * Central hook execution engine
 */

import { HookContext, HookFunction, Logger } from '../core/types';
import { HookError } from './hook-context';

/**
 * Standard entity hook types and their signatures
 * This serves as documentation for the standard hooks available in the system
 */
export enum StandardHookType {
	// Entity lifecycle hooks
	BEFORE_CREATE = 'beforeCreate',
	AFTER_CREATE = 'afterCreate',
	BEFORE_UPDATE = 'beforeUpdate',
	AFTER_UPDATE = 'afterUpdate',
	BEFORE_DELETE = 'beforeDelete',
	AFTER_DELETE = 'afterDelete',

	// Query hooks
	BEFORE_GET_BY_ID = 'beforeGetById',
	AFTER_GET_BY_ID = 'afterGetById',
	BEFORE_GET_ALL = 'beforeGetAll',
	AFTER_GET_ALL = 'afterGetAll',
	BEFORE_FIND_BY = 'beforeFindBy',
	AFTER_FIND_BY = 'afterFindBy',

	// Relation hooks
	BEFORE_FIND_RELATED = 'beforeFindRelated',
	AFTER_FIND_RELATED = 'afterFindRelated',

	// Action hooks
	BEFORE_ACTION = 'beforeAction',
	AFTER_ACTION = 'afterAction',

	// API hooks
	BEFORE_API = 'beforeApi',
	AFTER_API = 'afterApi'
}

/**
 * Standard hook signatures by hook type
 * This helps with type checking when creating hooks
 */
export interface HookSignatures {
	// Entity lifecycle hooks
	[StandardHookType.BEFORE_CREATE]: (entity: any, context: HookContext) => Promise<any> | any;
	[StandardHookType.AFTER_CREATE]: (entity: any, context: HookContext) => Promise<any> | any;
	[StandardHookType.BEFORE_UPDATE]: (data: { id: any, [key: string]: any }, context: HookContext) => Promise<any> | any;
	[StandardHookType.AFTER_UPDATE]: (data: { id: any, [key: string]: any }, context: HookContext) => Promise<any> | any;
	[StandardHookType.BEFORE_DELETE]: (id: any, context: HookContext) => Promise<boolean | any> | boolean | any;
	[StandardHookType.AFTER_DELETE]: (id: any, context: HookContext) => Promise<void> | void;

	// Query hooks
	[StandardHookType.BEFORE_GET_BY_ID]: (id: any, context: HookContext) => Promise<any> | any;
	[StandardHookType.AFTER_GET_BY_ID]: (entity: any, context: HookContext) => Promise<any> | any;
	[StandardHookType.BEFORE_GET_ALL]: (params: any, context: HookContext) => Promise<any> | any;
	[StandardHookType.AFTER_GET_ALL]: (entities: any[], context: HookContext) => Promise<any[]> | any[];
	[StandardHookType.BEFORE_FIND_BY]: (conditions: any, context: HookContext) => Promise<any> | any;
	[StandardHookType.AFTER_FIND_BY]: (entities: any[], context: HookContext) => Promise<any[]> | any[];

	// Relation hooks
	[StandardHookType.BEFORE_FIND_RELATED]: (params: { id: any, relationName: string }, context: HookContext) => Promise<any> | any;
	[StandardHookType.AFTER_FIND_RELATED]: (entities: any[], context: HookContext) => Promise<any[]> | any[];

	// Action hooks
	[StandardHookType.BEFORE_ACTION]: (data: { actionName: string, params: any }, context: HookContext) => Promise<any> | any;
	[StandardHookType.AFTER_ACTION]: (data: { actionName: string, result: any }, context: HookContext) => Promise<any> | any;

	// API hooks
	[StandardHookType.BEFORE_API]: (request: any, context: HookContext) => Promise<any> | any;
	[StandardHookType.AFTER_API]: (response: any, context: HookContext) => Promise<any> | any;
}

/**
 * Entity hook implementations
 * Contains the actual implementation of hooks defined in YAML
 * Retained for backward compatibility and documentation
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
	// API-specific hooks
	beforeApi?: Array<(request: any, context: HookContext) => Promise<any>>;
	afterApi?: Array<(response: any, context: HookContext) => Promise<any>>;
}

/**
 * Hook implementation with metadata
 */
export interface HookImplementation<T = any> {
	/**
	 * Hook function
	 */
	fn: HookFunction<T>;

	/**
	 * Whether the hook is async
	 */
	isAsync: boolean;

	/**
	 * Execution priority (lower numbers run first)
	 */
	priority: number;

	/**
	 * Hook timeout in milliseconds (0 = no timeout)
	 */
	timeout?: number;

	/**
	 * Hook condition
	 */
	condition?: (data: T, context: HookContext) => boolean | Promise<boolean>;

	/**
	 * Hook name for logging
	 */
	name: string;
}

/**
 * Hook execution options
 */
export interface HookExecutionOptions {
	/**
	 * Timeout in milliseconds (0 = no timeout)
	 */
	timeout?: number;

	/**
	 * Whether to continue execution if a hook fails
	 */
	continueOnError?: boolean;

	/**
	 * Hook execution context
	 */
	context?: HookContext;
}

/**
 * Execute a hook with timeout
 * @param hookFn Hook function
 * @param args Hook function arguments
 * @param timeoutMs Timeout in milliseconds
 * @returns Promise that resolves with the hook result or rejects with an error
 */
export async function executeHookWithTimeout<T>(
	hookFn: (...args: any[]) => Promise<T> | T,
	args: any[],
	timeoutMs: number = 5000
): Promise<T> {
	// If timeout is 0 or not provided, execute hook without timeout
	if (!timeoutMs) {
		return hookFn(...args);
	}

	return new Promise<T>((resolve, reject) => {
		// Create timeout timer
		const timeoutId = setTimeout(() => {
			reject(new HookError(`Hook execution timed out after ${timeoutMs}ms`));
		}, timeoutMs);

		try {
			// Execute hook
			Promise.resolve(hookFn(...args))
				.then(result => {
					clearTimeout(timeoutId);
					resolve(result);
				})
				.catch(error => {
					clearTimeout(timeoutId);
					reject(error);
				});
		} catch (error: any) {
			clearTimeout(timeoutId);
			reject(error);
		}
	});
}

/**
 * Hook executor class for running multiple hooks in sequence
 */
export class HookExecutor<T = any> {
	/**
	 * Hooks to execute
	 */
	private hooks: HookImplementation<T>[] = [];

	/**
	 * Logger
	 */
	private logger?: Logger;

	/**
	 * Constructor
	 * @param logger Optional logger instance
	 */
	constructor(logger?: Logger) {
		this.logger = logger;
	}

	/**
	 * Add a hook to the executor
	 * @param hook Hook implementation
	 * @returns This instance for chaining
	 */
	add(hook: HookImplementation<T>): this {
		this.hooks.push(hook);
		return this;
	}

	/**
	 * Add multiple hooks to the executor
	 * @param hooks Hook implementations
	 * @returns This instance for chaining
	 */
	addAll(hooks: HookImplementation<T>[]): this {
		this.hooks.push(...hooks);
		return this;
	}

	/**
	 * Remove a hook from the executor
	 * @param name Hook name
	 * @returns This instance for chaining
	 */
	remove(name: string): this {
		this.hooks = this.hooks.filter(h => h.name !== name);
		return this;
	}

	/**
	 * Execute all hooks in sequence
	 * @param data Data to pass to hooks
	 * @param options Hook execution options
	 * @returns Result after all hooks have executed
	 */
	async execute(data: T, options: HookExecutionOptions = {}): Promise<T> {
		// Sort hooks by priority
		const sortedHooks = [...this.hooks].sort((a, b) => a.priority - b.priority);

		// Create initial result
		let result = data;
		const context = options.context || {} as HookContext;

		// Execute hooks in sequence
		for (const hook of sortedHooks) {
			try {
				// Check condition if present
				if (hook.condition) {
					const conditionResult = await Promise.resolve(hook.condition(result, context));
					if (!conditionResult) {
						// Skip this hook
						this.logger?.debug(`Skipping hook ${hook.name} due to condition`);
						continue;
					}
				}

				// Log hook execution
				this.logger?.debug(`Executing hook: ${hook.name}`);

				// Execute hook with timeout
				const hookTimeout = hook.timeout || options.timeout || 0;
				const hookResult = await executeHookWithTimeout(
					hook.fn,
					[result, context],
					hookTimeout
				);

				// Update result if hook returned a value
				if (hookResult !== undefined) {
					result = hookResult;
				}
			} catch (error: any) {
				// Log error
				this.logger?.error(`Error executing hook ${hook.name}: ${error.message}`);

				// Handle error based on options
				if (options.continueOnError) {
					// Continue to next hook
					continue;
				} else {
					// Rethrow error
					throw new HookError(
						`Hook execution failed: ${error.message}`,
						(error as any).statusCode || 500
					);
				}
			}
		}

		return result;
	}

	/**
	 * Check if the executor has any hooks
	 * @returns Whether the executor has any hooks
	 */
	hasHooks(): boolean {
		return this.hooks.length > 0;
	}

	/**
	 * Get the number of hooks in the executor
	 * @returns Number of hooks
	 */
	count(): number {
		return this.hooks.length;
	}

	/**
	 * Clear all hooks from the executor
	 * @returns This instance for chaining
	 */
	clear(): this {
		this.hooks = [];
		return this;
	}
}

/**
 * Create a hook implementation
 * @param name Hook name
 * @param fn Hook function
 * @param options Hook options
 * @returns Hook implementation
 */
export function createHook<T>(
	name: string,
	fn: HookFunction<T>,
	options: {
		isAsync?: boolean;
		priority?: number;
		timeout?: number;
		condition?: (data: T, context: HookContext) => boolean | Promise<boolean>;
	} = {}
): HookImplementation<T> {
	return {
		name,
		fn,
		isAsync: options.isAsync ?? true,
		priority: options.priority ?? 10,
		timeout: options.timeout,
		condition: options.condition
	};
}

/**
 * Create a hook executor
 * @param logger Logger instance
 * @returns Hook executor
 */
export function createHookExecutor<T>(logger?: Logger): HookExecutor<T> {
	return new HookExecutor<T>(logger);
}