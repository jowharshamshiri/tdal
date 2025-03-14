/**
 * Validation Middleware
 * Validates request data against schemas
 */

import { Request, Response, NextFunction } from 'express';
import Ajv, { ValidateFunction, ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import { AppContext } from '../core/app-context';
import { Logger } from '../core/types';
import { EntityConfig } from '../entity/entity-config';

/**
 * Validation options
 */
export interface ValidationOptions {
	/**
	 * JSON schema to validate against
	 */
	schema?: Record<string, any>;

	/**
	 * Entity to validate against
	 */
	entity?: string;

	/**
	 * Operation to determine validation rules
	 */
	operation?: 'create' | 'update' | 'getAll' | 'getById' | 'delete' | 'custom';

	/**
	 * Whether to validate query parameters
	 */
	validateQuery?: boolean;

	/**
	 * Whether to validate request body
	 */
	validateBody?: boolean;

	/**
	 * Whether to validate path parameters
	 */
	validateParams?: boolean;

	/**
	 * Whether to skip validation if schema validation fails
	 */
	skipOnFail?: boolean;

	/**
	 * Custom validation function
	 */
	customValidation?: (req: Request) => Promise<{ valid: boolean; errors?: any[] }>;
}

/**
 * Validation error format
 */
export interface ValidationError {
	/**
	 * Error message
	 */
	message: string;

	/**
	 * Path to the error location
	 */
	path?: string;

	/**
	 * Error keyword
	 */
	keyword?: string;

	/**
	 * Error params
	 */
	params?: Record<string, any>;
}

/**
 * Validation service
 */
export class ValidationService {
	/**
	 * JSON schema validator
	 */
	private ajv: Ajv;

	/**
	 * Logger instance
	 */
	private logger: Logger;

	/**
	 * Schema compilation cache
	 */
	private schemaCache: Map<string, ValidateFunction> = new Map();

	/**
	 * Constructor
	 * @param appContext Application context
	 */
	constructor(private appContext: AppContext) {
		this.logger = appContext.getLogger();
		this.ajv = new Ajv({
			allErrors: true,
			coerceTypes: true,
			removeAdditional: 'all',
			useDefaults: true,
			strict: false
		});

		// Add string formats like email, date, etc.
		addFormats(this.ajv);

		// Add custom formats if needed
		this.registerCustomFormats();
	}

	/**
	 * Register custom validation formats
	 */
	private registerCustomFormats(): void {
		// Add UUID format
		this.ajv.addFormat('uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

		// Add phone number format
		this.ajv.addFormat('phone', /^\+?[1-9]\d{1,14}$/);

		// Add URL with path format
		this.ajv.addFormat('url-path', /^(?:(?:https?|ftp):\/\/)?[\w/\-?=%.]+\.[\w/\-?=%.]+/);
	}

	/**
	 * Get validation schema for entity operation
	 * @param entity Entity configuration
	 * @param operation Operation type
	 * @returns JSON schema
	 */
	private getEntityOperationSchema(entity: EntityConfig, operation: string): Record<string, any> {
		// Build schema based on entity configuration and operation
		const schema: Record<string, any> = {
			type: 'object',
			properties: {},
			additionalProperties: false
		};

		// Add properties based on entity columns
		for (const column of entity.columns) {
			// Skip computed columns and auto-increment IDs for operations like create
			if (column.autoIncrement && operation === 'create') {
				continue;
			}

			// Only include API writable fields for create/update operations
			const isWritable = this.isFieldWritable(entity, column.logical);
			if ((operation === 'create' || operation === 'update') && !isWritable) {
				continue;
			}

			// Map column type to JSON schema type
			const propSchema = this.columnToJsonSchema(column);
			schema.properties[column.logical] = propSchema;

			// Mark required fields for create operation
			if (operation === 'create' && !column.nullable && !column.autoIncrement) {
				schema.required = schema.required || [];
				schema.required.push(column.logical);
			}
		}

		// Special handling for getById and delete operations
		if (operation === 'getById' || operation === 'delete') {
			schema.properties = {
				id: { type: 'integer' }
			};
			schema.required = ['id'];
		}

		// Special handling for getAll operation (query parameters)
		if (operation === 'getAll') {
			schema.properties = {
				limit: { type: 'integer', minimum: 1 },
				offset: { type: 'integer', minimum: 0 },
				sort: { type: 'string' },
				order: { type: 'string', enum: ['asc', 'desc', 'ASC', 'DESC'] }
			};
		}

		return schema;
	}

	/**
	 * Check if a field is writable through the API
	 * @param entity Entity configuration
	 * @param fieldName Field name
	 * @returns Whether the field is writable
	 */
	private isFieldWritable(entity: EntityConfig, fieldName: string): boolean {
		if (!entity.api) {
			return true; // Default to writable if no API config
		}

		// Check field-level API configuration
		const fieldConfig = entity.columns.find(c => c.logical === fieldName);
		if (fieldConfig?.api?.writable === false) {
			return false;
		}

		// Check entity-level field permissions
		const fieldPermissions = entity.api.fields?.[fieldName];
		if (fieldPermissions && fieldPermissions.write && fieldPermissions.write.length > 0) {
			// Only allow if role is specified in write permissions
			// For complete implementation, would need to check against current user role
			return true;
		}

		return true;
	}

	/**
	 * Convert entity column to JSON schema property
	 * @param column Column configuration
	 * @returns JSON schema property
	 */
	private columnToJsonSchema(column: any): Record<string, any> {
		const schema: Record<string, any> = {};

		// Map database type to JSON schema type
		switch (column.type?.toLowerCase()) {
			case 'integer':
			case 'int':
			case 'smallint':
			case 'bigint':
			case 'tinyint':
				schema.type = 'integer';
				break;

			case 'float':
			case 'real':
			case 'double':
			case 'decimal':
			case 'numeric':
				schema.type = 'number';
				break;

			case 'boolean':
			case 'bool':
				schema.type = 'boolean';
				break;

			case 'date':
				schema.type = 'string';
				schema.format = 'date';
				break;

			case 'datetime':
			case 'timestamp':
				schema.type = 'string';
				schema.format = 'date-time';
				break;

			case 'json':
			case 'object':
				schema.type = 'object';
				break;

			default:
				schema.type = 'string';
		}

		// Add nullable support
		if (column.nullable) {
			schema.type = Array.isArray(schema.type)
				? [...schema.type, 'null']
				: [schema.type, 'null'];
		}

		// Add validation from the entity if available
		if (column.validation) {
			this.applyValidationRulesToSchema(schema, column.validation);
		}

		return schema;
	}

	/**
	 * Apply validation rules to JSON schema
	 * @param schema JSON schema property
	 * @param validationRules Validation rules
	 */
	private applyValidationRulesToSchema(schema: Record<string, any>, validationRules: any[]): void {
		if (!Array.isArray(validationRules)) {
			return;
		}

		for (const rule of validationRules) {
			switch (rule.type) {
				case 'required':
					// Handled at schema level
					break;

				case 'minLength':
					schema.minLength = rule.value;
					break;

				case 'maxLength':
					schema.maxLength = rule.value;
					break;

				case 'min':
					schema.minimum = rule.value;
					break;

				case 'max':
					schema.maximum = rule.value;
					break;

				case 'pattern':
					schema.pattern = rule.value;
					break;

				case 'email':
					schema.format = 'email';
					break;

				case 'enum':
					if (Array.isArray(rule.value)) {
						schema.enum = rule.value;
					}
					break;
			}
		}
	}

	/**
	 * Get or compile schema validator
	 * @param schema JSON schema
	 * @returns Validation function
	 */
	private getValidator(schema: Record<string, any>): ValidateFunction {
		// Generate a cache key from the schema
		const cacheKey = JSON.stringify(schema);

		// Check if validator exists in cache
		let validator = this.schemaCache.get(cacheKey);

		if (!validator) {
			// Compile schema
			validator = this.ajv.compile(schema);

			// Cache validator
			this.schemaCache.set(cacheKey, validator);
		}

		return validator;
	}

	/**
	 * Format validation errors
	 * @param ajvErrors AJV error objects
	 * @returns Formatted validation errors
	 */
	private formatErrors(ajvErrors: ErrorObject[] = []): ValidationError[] {
		return ajvErrors.map(error => {
			const path = error.instancePath.replace(/^\//, '') || error.params.missingProperty;

			let message = error.message || 'Validation error';

			// Customize message based on error keyword
			switch (error.keyword) {
				case 'required':
					message = `${error.params.missingProperty} is required`;
					break;

				case 'type':
					message = `${path} should be a ${error.params.type}`;
					break;

				case 'format':
					message = `${path} should match format "${error.params.format}"`;
					break;

				case 'enum':
					message = `${path} should be one of: ${error.params.allowedValues.join(', ')}`;
					break;

				case 'minLength':
					message = `${path} should be at least ${error.params.limit} characters`;
					break;

				case 'maxLength':
					message = `${path} should be at most ${error.params.limit} characters`;
					break;

				case 'minimum':
					message = `${path} should be >= ${error.params.limit}`;
					break;

				case 'maximum':
					message = `${path} should be <= ${error.params.limit}`;
					break;

				case 'pattern':
					message = `${path} should match pattern "${error.params.pattern}"`;
					break;
			}

			return {
				message,
				path,
				keyword: error.keyword,
				params: error.params
			};
		});
	}

	/**
	 * Validate request data
	 * @param req Express request
	 * @param schema JSON schema
	 * @param part Request part to validate
	 * @returns Validation result
	 */
	private validateRequestPart(
		req: Request,
		schema: Record<string, any>,
		part: 'body' | 'query' | 'params'
	): { valid: boolean; errors?: ValidationError[] } {
		const data = req[part];

		// Skip if no data
		if (!data) {
			return { valid: true };
		}

		// Get validator
		const validator = this.getValidator(schema);

		// Validate data
		const valid = validator(data);

		if (!valid) {
			const errors = this.formatErrors(validator.errors);
			return { valid: false, errors };
		}

		return { valid: true };
	}

	/**
	 * Validate request against entity schema
	 * @param req Express request
	 * @param entity Entity configuration
	 * @param operation Operation type
	 * @returns Validation result
	 */
	async validateEntity(
		req: Request,
		entity: EntityConfig,
		operation: string
	): Promise<{ valid: boolean; errors?: ValidationError[] }> {
		const schema = this.getEntityOperationSchema(entity, operation);

		let part: 'body' | 'query' | 'params';

		// Determine which part of the request to validate
		switch (operation) {
			case 'create':
			case 'update':
				part = 'body';
				break;

			case 'getAll':
				part = 'query';
				break;

			case 'getById':
			case 'delete':
				part = 'params';
				break;

			default:
				part = 'body';
		}

		return this.validateRequestPart(req, schema, part);
	}

	/**
	 * Create validation middleware
	 * @param options Validation options
	 * @returns Express middleware
	 */
	middleware(options: ValidationOptions = {}): (req: Request, res: Response, next: NextFunction) => Promise<void> {
		const {
			validateBody = true,
			validateQuery = true,
			validateParams = true,
			skipOnFail = false
		} = options;

		return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
			try {
				let valid = true;
				let errors: ValidationError[] = [];

				// Option 1: Custom validation function
				if (options.customValidation) {
					const result = await options.customValidation(req);
					valid = result.valid;
					errors = result.errors || [];
				}
				// Option 2: Schema validation
				else if (options.schema) {
					if (validateBody && req.body) {
						const bodyResult = this.validateRequestPart(req, options.schema, 'body');
						if (!bodyResult.valid) {
							valid = false;
							errors = [...errors, ...(bodyResult.errors || [])];
						}
					}

					if (validateQuery && req.query) {
						const queryResult = this.validateRequestPart(req, options.schema, 'query');
						if (!queryResult.valid) {
							valid = false;
							errors = [...errors, ...(queryResult.errors || [])];
						}
					}

					if (validateParams && req.params) {
						const paramsResult = this.validateRequestPart(req, options.schema, 'params');
						if (!paramsResult.valid) {
							valid = false;
							errors = [...errors, ...(paramsResult.errors || [])];
						}
					}
				}
				// Option 3: Entity validation
				else if (options.entity && options.operation) {
					try {
						const entityConfig = this.appContext.getEntityConfig(options.entity);
						const entityResult = await this.validateEntity(req, entityConfig, options.operation);

						if (!entityResult.valid) {
							valid = false;
							errors = [...errors, ...(entityResult.errors || [])];
						}
					} catch (error) {
						this.logger.error(`Error loading entity for validation: ${error.message}`);
						throw new Error(`Validation error: Entity ${options.entity} not found`);
					}
				}

				// Handle validation result
				if (!valid) {
					if (skipOnFail) {
						// Attach errors to request but continue
						(req as any).validationErrors = errors;
						return next();
					} else {
						// Send validation error response
						return res.status(400).json({
							error: 'ValidationError',
							message: 'Validation failed',
							errors,
							status: 400
						});
					}
				}

				// Validation successful
				next();
			} catch (error) {
				this.logger.error(`Validation error: ${error.message}`);
				res.status(500).json({
					error: 'ValidationError',
					message: `Validation error: ${error.message}`,
					status: 500
				});
			}
		};
	}

	/**
	 * Validate request (programmatic usage)
	 * @param req Express request
	 * @param options Validation options
	 * @returns Validation result
	 */
	async validate(
		req: Request,
		options: ValidationOptions = {}
	): Promise<{ valid: boolean; errors?: ValidationError[] }> {
		try {
			// Option 1: Custom validation function
			if (options.customValidation) {
				return await options.customValidation(req);
			}

			// Option 2: Schema validation
			if (options.schema) {
				const results: Array<{ valid: boolean; errors?: ValidationError[] }> = [];

				if (options.validateBody !== false && req.body) {
					results.push(this.validateRequestPart(req, options.schema, 'body'));
				}

				if (options.validateQuery !== false && req.query) {
					results.push(this.validateRequestPart(req, options.schema, 'query'));
				}

				if (options.validateParams !== false && req.params) {
					results.push(this.validateRequestPart(req, options.schema, 'params'));
				}

				// Combine results
				const valid = results.every(r => r.valid);
				const errors = results.flatMap(r => r.errors || []);

				return { valid, errors: errors.length > 0 ? errors : undefined };
			}

			// Option 3: Entity validation
			if (options.entity && options.operation) {
				try {
					const entityConfig = this.appContext.getEntityConfig(options.entity);
					return await this.validateEntity(req, entityConfig, options.operation);
				} catch (error) {
					this.logger.error(`Error loading entity for validation: ${error.message}`);
					return {
						valid: false,
						errors: [{ message: `Entity ${options.entity} not found` }]
					};
				}
			}

			// No validation method specified
			return { valid: true };
		} catch (error) {
			this.logger.error(`Validation error: ${error.message}`);
			return {
				valid: false,
				errors: [{ message: `Validation error: ${error.message}` }]
			};
		}
	}
}

/**
 * Create validation middleware
 * @param appContext Application context
 * @param options Validation options
 * @returns Express middleware
 */
export function createValidationMiddleware(
	appContext: AppContext,
	options: ValidationOptions = {}
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
	const validationService = new ValidationService(appContext);
	return validationService.middleware(options);
}