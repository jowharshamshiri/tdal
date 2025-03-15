/**
 * Controller Factory
 * Creates controllers for entity API operations
 */

import { Request, Response, NextFunction } from 'express';
import { EntityConfig } from '../entity/entity-config';
import { EntityDao } from '../entity/entity-manager';
import { Logger, ControllerContext, ApiError } from '../core/types';

/**
 * Entity controller interface
 * Defines standard CRUD operations for entity controllers
 */
export interface EntityController {
	/**
	 * Get all entities
	 */
	getAll(context: ControllerContext): Promise<void>;

	/**
	 * Get entity by ID
	 */
	getById(context: ControllerContext): Promise<void>;

	/**
	 * Create entity
	 */
	create(context: ControllerContext): Promise<void>;

	/**
	 * Update entity
	 */
	update(context: ControllerContext): Promise<void>;

	/**
	 * Delete entity
	 */
	delete(context: ControllerContext): Promise<void>;
}

/**
 * Create a controller for an entity
 * @param entityConfig Entity configuration
 * @param entityManager Entity manager
 * @param appContext Application context
 * @param logger Logger instance
 * @returns Entity controller
 */
export function createEntityController(
	entityConfig: EntityConfig,
	entityManager: EntityDao<any>,
	appContext: any,
	logger: Logger
): EntityController {
	/**
	 * Get all entities
	 * @param context Controller context
	 */
	async function getAll(context: ControllerContext): Promise<void> {
		try {
			const { request, response } = context;

			// Process query parameters
			const queryParams = {
				...request.query
			};

			// Process API request through entity hooks
			const processedParams = await entityManager.processApiRequest(
				queryParams,
				'getAll',
				context
			);

			// Extract pagination parameters
			const limit = parseInt(processedParams.limit as string) || undefined;
			const offset = parseInt(processedParams.offset as string) || undefined;
			const orderBy = processedParams.orderBy ?
				String(processedParams.orderBy).split(',') : undefined;

			// Prepare query options
			const options = {
				limit,
				offset,
				orderBy: orderBy?.map(field => ({
					field,
					direction: String(processedParams.orderDir || 'ASC').toUpperCase() as 'ASC' | 'DESC'
				})),
				fields: getRequestedFields(entityConfig, processedParams.fields, context.user?.role)
			};

			// Find all entities
			const entities = await entityManager.findAll(options, context);

			// Process API response through entity hooks
			const processedResponse = await entityManager.processApiResponse(
				entities,
				'getAll',
				context
			);

			// Send response
			response.json(processedResponse);
		} catch (error: any) {
			handleError(error, context);
		}
	}

	/**
	 * Get entity by ID
	 * @param context Controller context
	 */
	async function getById(context: ControllerContext): Promise<void> {
		try {
			const { request, response, params } = context;

			// Get ID from path parameters
			const id = params.id;
			if (!id) {
				throw createApiError('ID is required', 400);
			}

			// Process request parameters
			const queryParams = {
				...request.query
			};

			// Process API request through entity hooks
			const processedParams = await entityManager.processApiRequest(
				queryParams,
				'getById',
				context
			);

			// Prepare find options
			const options = {
				fields: getRequestedFields(entityConfig, processedParams.fields, context.user?.role),
				relations: processedParams.relations ?
					String(processedParams.relations).split(',') : undefined
			};

			// Find entity by ID
			const entity = await entityManager.findById(id, options, context);

			// Check if entity exists
			if (!entity) {
				throw createApiError(`${entityConfig.entity} not found with ID: ${id}`, 404);
			}

			// Process API response through entity hooks
			const processedResponse = await entityManager.processApiResponse(
				entity,
				'getById',
				context
			);

			// Send response
			response.json(processedResponse);
		} catch (error: any) {
			handleError(error, context);
		}
	}

	/**
	 * Create entity
	 * @param context Controller context
	 */
	async function create(context: ControllerContext): Promise<void> {
		try {
			const { request, response } = context;

			// Get request body
			const data = request.body;

			// Validate API writeable fields
			const filteredData = filterWritableFields(entityConfig, data, context.user?.role);

			// Process API request through entity hooks
			const processedData = await entityManager.processApiRequest(
				filteredData,
				'create',
				context
			);

			// Create entity
			const id = await entityManager.create(processedData, context);

			// Get created entity
			const entity = await entityManager.findById(id, {}, context);

			// Process API response through entity hooks
			const processedResponse = await entityManager.processApiResponse(
				entity,
				'create',
				context
			);

			// Send created response
			response.status(201).json(processedResponse);
		} catch (error: any) {
			handleError(error, context);
		}
	}

	/**
	 * Update entity
	 * @param context Controller context
	 */
	async function update(context: ControllerContext): Promise<void> {
		try {
			const { request, response, params } = context;

			// Get ID from path parameters
			const id = params.id;
			if (!id) {
				throw createApiError('ID is required', 400);
			}

			// Get request body
			const data = request.body;

			// Validate API writeable fields
			const filteredData = filterWritableFields(entityConfig, data, context.user?.role);

			// Process API request through entity hooks
			const processedData = await entityManager.processApiRequest(
				filteredData,
				'update',
				context
			);

			// Check if entity exists
			const exists = await entityManager.exists(id);
			if (!exists) {
				throw createApiError(`${entityConfig.entity} not found with ID: ${id}`, 404);
			}

			// Update entity
			await entityManager.update(id, processedData, context);

			// Get updated entity
			const entity = await entityManager.findById(id, {}, context);

			// Process API response through entity hooks
			const processedResponse = await entityManager.processApiResponse(
				entity,
				'update',
				context
			);

			// Send response
			response.json(processedResponse);
		} catch (error: any) {
			handleError(error, context);
		}
	}

	/**
	 * Delete entity
	 * @param context Controller context
	 */
	async function delete_(context: ControllerContext): Promise<void> {
		try {
			const { response, params } = context;

			// Get ID from path parameters
			const id = params.id;
			if (!id) {
				throw createApiError('ID is required', 400);
			}

			// Process API request through entity hooks
			await entityManager.processApiRequest(
				{ id },
				'delete',
				context
			);

			// Check if entity exists
			const exists = await entityManager.exists(id);
			if (!exists) {
				throw createApiError(`${entityConfig.entity} not found with ID: ${id}`, 404);
			}

			// Delete entity
			await entityManager.delete(id, context);

			// Process API response through entity hooks
			const processedResponse = await entityManager.processApiResponse(
				{ id, deleted: true },
				'delete',
				context
			);

			// Send response
			response.json(processedResponse);
		} catch (error: any) {
			handleError(error, context);
		}
	}

	/**
	 * Get requested fields
	 * @param entityConfig Entity configuration
	 * @param fieldsParam Fields parameter
	 * @param role User role
	 * @returns Array of field names
	 */
	function getRequestedFields(
		entityConfig: EntityConfig,
		fieldsParam?: string | string[],
		role?: string
	): string[] | undefined {
		// If no fields specified, return readable fields
		if (!fieldsParam) {
			return entityManager.getApiReadableFields(role);
		}

		// Parse fields parameter
		const requestedFields = Array.isArray(fieldsParam) ?
			fieldsParam : String(fieldsParam).split(',');

		// Get readable fields
		const readableFields = entityManager.getApiReadableFields(role);

		// Filter requested fields by readable fields
		return requestedFields.filter(field => readableFields.includes(field));
	}

	/**
	 * Filter writable fields
	 * @param entityConfig Entity configuration
	 * @param data Request data
	 * @param role User role
	 * @returns Filtered data
	 */
	function filterWritableFields(
		entityConfig: EntityConfig,
		data: Record<string, unknown>,
		role?: string
	): Record<string, unknown> {
		// Get writable fields
		const writableFields = entityManager.getApiWritableFields(role);

		// Filter data by writable fields
		const filteredData: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(data)) {
			if (writableFields.includes(key)) {
				filteredData[key] = value;
			}
		}

		return filteredData;
	}

	/**
	 * Handle error
	 * @param error Error object
	 * @param context Controller context
	 */
	function handleError(error: any, context: ControllerContext): void {
		const { response } = context;

		logger.error(`API error in ${entityConfig.entity}: ${error.message}`);

		// Get error details
		const statusCode = error.status || error.statusCode || 500;
		const errorType = error.name || error.error || 'InternalServerError';
		const message = error.message || 'An unexpected error occurred';

		// Send error response
		response.status(statusCode).json({
			error: errorType,
			message,
			status: statusCode
		});
	}

	/**
	 * Create API error
	 * @param message Error message
	 * @param status HTTP status code
	 * @param errorType Error type
	 * @returns API error
	 */
	function createApiError(
		message: string,
		status = 400,
		errorType = 'BadRequest'
	): ApiError {
		return {
			name: errorType,
			message,
			status,
			toString() {
				return this.message;
			}
		};
	}

	return {
		getAll,
		getById,
		create,
		update,
		delete: delete_
	};
}