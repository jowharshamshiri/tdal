/**
 * Hook Context
 * Provides execution context for entity hooks and actions
 */

import { Request, Response, NextFunction } from 'express';
import { AppContext } from '../core/app-context';
import { HookContext, Logger } from '../core/types';
import { DatabaseAdapter } from '../database';
import { EntityDao } from '@/entity';

/**
 * Hook error class
 * For errors that occur during hook execution
 */
export class HookError extends Error {
	/**
	 * HTTP status code
	 */
	statusCode: number;

	/**
	 * Additional error details
	 */
	details?: Record<string, any>;

	/**
	 * Constructor
	 * @param message Error message
	 * @param statusCode HTTP status code (if applicable)
	 * @param details Additional error details
	 */
	constructor(message: string, statusCode: number = 500, details?: Record<string, any>) {
		super(message);
		this.name = 'HookError';
		this.statusCode = statusCode;
		this.details = details;
	}
}

/**
 * Create a hook context
 * @param appContext Application context
 * @param db Database adapter
 * @param logger Logger instance
 * @param entityName Entity name
 * @param operation Operation name
 * @param req Express request object
 * @param res Express response object
 * @param next Express next function
 * @param additionalData Additional context data
 * @returns Hook context
 */
export function createHookContext(
	appContext: AppContext,
	db: DatabaseAdapter,
	logger: Logger,
	entityName: string,
	operation: string,
	req?: Request,
	res?: Response,
	next?: NextFunction,
	additionalData: Record<string, any> = {}
): HookContext {
	return {
		appContext,
		db,
		logger,
		entityName,
		operation,
		user: (req as any)?.user,
		request: req,
		response: res,
		next,
		data: { ...additionalData },
		// Add service accessor method
		getService: <T>(name: string): T => {
			return appContext.getService<T>(name);
		},
		getEntityManager: <T>(name?: string): EntityDao<T, string | number> => {
			return appContext.getEntityManager<T>(name || entityName);
		}
	};
}

/**
 * Create a controller context (specialization of hook context for HTTP controllers)
 * @param db Database adapter
 * @param logger Logger instance
 * @param entityName Entity name
 * @param operation Operation name
 * @param req Express request object
 * @param res Express response object
 * @param next Express next function
 * @returns Controller context
 */
export function createControllerContext(
	db: DatabaseAdapter,
	logger: Logger,
	entityName: string,
	operation: string,
	req: Request,
	res: Response,
	next: NextFunction
): HookContext {
	const appContext = (db as any).appContext || (req as any).appContext;

	const context = createHookContext(
		appContext,
		db,
		logger,
		entityName,
		operation,
		req,
		res,
		next
	);

	// Add controller-specific properties
	return {
		...context,
		params: req.params || {},
		query: req.query || {},
		body: req.body || {},

		// Helper method to send a JSON response
		sendJson: (data: any, status: number = 200) => {
			res.status(status).json(data);
		},

		// Helper method to send an error response
		sendError: (message: string, status: number = 400, errorType: string = 'BadRequest', details?: Record<string, any>) => {
			res.status(status).json({
				error: errorType,
				message,
				status,
				...(details && { details })
			});
		}
	};
}

/**
 * Create an empty hook context (for testing or non-HTTP contexts)
 * @param db Database adapter
 * @param logger Logger instance
 * @returns Empty hook context
 */
export function createEmptyHookContext(
	db: DatabaseAdapter,
	logger: Logger
): HookContext {
	return {
		db,
		logger,
		data: {},
		getService: <T>(_name: string): T => {
			throw new Error('Service not available in empty context');
		},
		getEntityManager: <T>(name?: string): any => {
			throw new Error('Entity manager not available in empty context');
		}
	};
}
