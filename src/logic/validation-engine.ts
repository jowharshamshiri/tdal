/**
 * Validation Engine
 * Processes validation rules defined in entity configurations
 */

import { EntityConfig, ValidationRule } from '../entity/entity-config';
import { HookContext } from '../core/types';
import { Logger } from '@/logging';

/**
 * Validation error interface
 */
export interface ValidationError {
	/** Field name */
	field: string;
	/** Error message */
	message: string;
	/** Rule type that failed */
	type: string;
	/** Rule value */
	value?: any;
}

/**
 * Validation context for custom rules
 */
export interface ValidationContext {
	/** Entity data being validated */
	entity: Record<string, any>;
	/** Entity configuration */
	entityConfig: EntityConfig;
	/** Is this a create operation? */
	isCreate: boolean;
	/** Value from the rule - needed for rules like minLength, maxLength, etc. */
	value?: any;
	/** Hook context */
	hookContext?: HookContext;
	/** Logger instance */
	logger?: Logger;
}

/**
 * Custom validation function type
 */
export type ValidationFunction = (
	value: any,
	context: ValidationContext
) => boolean | string | Promise<boolean | string>;

/**
 * Rule implementation interface
 */
interface RuleImplementation {
	/** Rule implementation function */
	validate: ValidationFunction;
	/** Whether the rule is asynchronous */
	isAsync: boolean;
}

/**
 * Validation engine
 * Validates entity data against defined rules
 */
export class ValidationEngine {
	/** Built-in rule implementations */
	private builtInRules: Map<string, RuleImplementation> = new Map();
	/** Custom rule implementations */
	private customRules: Map<string, RuleImplementation> = new Map();
	/** Logger instance */
	private logger: Logger;
	/** Configuration loader */
	private configLoader: any;

	/**
	 * Constructor
	 * @param logger Logger instance
	 * @param configLoader Configuration loader for external code
	 */
	constructor(logger: Logger, configLoader: any) {
		this.logger = logger;
		this.configLoader = configLoader;
		this.registerBuiltInRules();
	}

	/**
	 * Register built-in validation rules
	 */
	private registerBuiltInRules(): void {
		// Required field
		this.builtInRules.set('required', {
			validate: (value) => {
				if (value === undefined || value === null) return false;
				if (typeof value === 'string') return value.trim() !== '';
				return true;
			},
			isAsync: false
		});

		// Minimum length
		this.builtInRules.set('minLength', {
			validate: (value, context) => {
				if (value === undefined || value === null) return true;
				const minLength = context.value as number;
				return typeof value === 'string' && value.length >= minLength;
			},
			isAsync: false
		});

		// Maximum length
		this.builtInRules.set('maxLength', {
			validate: (value, context) => {
				if (value === undefined || value === null) return true;
				const maxLength = context.value as number;
				return typeof value === 'string' && value.length <= maxLength;
			},
			isAsync: false
		});

		// Minimum value
		this.builtInRules.set('min', {
			validate: (value, context) => {
				if (value === undefined || value === null) return true;
				const min = context.value as number;
				return typeof value === 'number' && value >= min;
			},
			isAsync: false
		});

		// Maximum value
		this.builtInRules.set('max', {
			validate: (value, context) => {
				if (value === undefined || value === null) return true;
				const max = context.value as number;
				return typeof value === 'number' && value <= max;
			},
			isAsync: false
		});

		// Pattern (regex)
		this.builtInRules.set('pattern', {
			validate: (value, context) => {
				if (value === undefined || value === null) return true;
				const pattern = context.value as string;
				const regex = new RegExp(pattern);
				return typeof value === 'string' && regex.test(value);
			},
			isAsync: false
		});

		// Email
		this.builtInRules.set('email', {
			validate: (value) => {
				if (value === undefined || value === null) return true;
				const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
				return typeof value === 'string' && emailRegex.test(value);
			},
			isAsync: false
		});

		// Boolean true
		this.builtInRules.set('isTrue', {
			validate: (value) => {
				return value === true;
			},
			isAsync: false
		});

		// Boolean false
		this.builtInRules.set('isFalse', {
			validate: (value) => {
				return value === false;
			},
			isAsync: false
		});

		// Numeric
		this.builtInRules.set('numeric', {
			validate: (value) => {
				if (value === undefined || value === null) return true;
				return !isNaN(parseFloat(value)) && isFinite(value);
			},
			isAsync: false
		});

		// Integer
		this.builtInRules.set('integer', {
			validate: (value) => {
				if (value === undefined || value === null) return true;
				return Number.isInteger(Number(value));
			},
			isAsync: false
		});

		// One of (enumeration)
		this.builtInRules.set('oneOf', {
			validate: (value, context) => {
				if (value === undefined || value === null) return true;
				const allowedValues = context.value as any[];
				return allowedValues.includes(value);
			},
			isAsync: false
		});

		// Date format
		this.builtInRules.set('date', {
			validate: (value) => {
				if (value === undefined || value === null) return true;
				const date = new Date(value);
				return !isNaN(date.getTime());
			},
			isAsync: false
		});

		// URL format
		this.builtInRules.set('url', {
			validate: (value) => {
				if (value === undefined || value === null) return true;
				try {
					new URL(value);
					return true;
				} catch {
					return false;
				}
			},
			isAsync: false
		});
	}

	/**
	 * Register a custom validation rule
	 * @param type Rule type
	 * @param implementation Rule implementation
	 * @param isAsync Whether the rule is asynchronous
	 */
	registerCustomRule(
		type: string,
		implementation: ValidationFunction,
		isAsync: boolean = false
	): void {
		this.customRules.set(type, { validate: implementation, isAsync });
		this.logger.debug(`Registered custom validation rule: ${type}`);
	}

	/**
	 * Load custom rule implementations from entity configuration
	 * @param entityConfig Entity configuration
	 */
	async loadCustomRules(entityConfig: EntityConfig): Promise<void> {
		if (!entityConfig.validation?.rules) return;

		for (const [field, rules] of Object.entries(entityConfig.validation.rules)) {
			for (const rule of rules) {
				if (rule.type === 'custom' && rule.implementation) {
					try {
						let implementation: ValidationFunction;

						// If implementation is a file path, load it
						if (typeof rule.implementation === 'string' && rule.implementation.startsWith('./')) {
							const module = await this.configLoader.loadExternalCode(rule.implementation);
							implementation = module.default || module;
						} else if (typeof rule.implementation === 'function') {
							// Direct function reference
							implementation = rule.implementation;
						} else {
							// Inline implementation
							implementation = new Function(
								'value',
								'context',
								`return (${rule.implementation})(value, context);`
							) as ValidationFunction;
						}

						// Register the custom rule
						const ruleType = `${field}:custom`;
						this.registerCustomRule(ruleType, implementation, true);
					} catch (error: any) {
						this.logger.error(`Failed to load custom validation rule for ${field}: ${error}`);
					}
				}
			}
		}
	}

	/**
	 * Validate entity data against defined rules
	 * @param data Entity data to validate
	 * @param entityConfig Entity configuration
	 * @param isCreate Whether this is a create operation
	 * @param context Optional hook context
	 * @returns Validation errors or null if valid
	 */
	async validate(
		data: Record<string, any>,
		entityConfig: EntityConfig,
		isCreate: boolean = true,
		context?: HookContext
	): Promise<ValidationError[] | null> {
		// Skip validation if no rules defined
		if (!entityConfig.validation?.rules) return null;

		const errors: ValidationError[] = [];
		const validationContext: ValidationContext = {
			entity: data,
			entityConfig,
			isCreate,
			hookContext: context,
			logger: this.logger
		};

		// Process each field's rules
		for (const [field, rules] of Object.entries(entityConfig.validation.rules)) {
			const value = data[field];

			// Skip validation for undefined values on update unless required rule exists
			if (!isCreate && value === undefined && !rules.some(rule => rule.type === 'required')) {
				continue;
			}

			// Process each rule for the field
			for (const rule of rules) {
				const isValid = await this.validateRule(field, value, rule, validationContext);

				if (!isValid) {
					errors.push({
						field,
						message: rule.message,
						type: rule.type,
						value: rule.value
					});

					// Stop validating this field on first error
					break;
				}
			}
		}

		return errors.length > 0 ? errors : null;
	}

	/**
	 * Validate a single rule
	 * @param field Field name
	 * @param value Field value
	 * @param rule Validation rule
	 * @param context Validation context
	 * @returns Whether the value is valid
	 */
	private async validateRule(
		field: string,
		value: any,
		rule: ValidationRule,
		context: ValidationContext
	): Promise<boolean> {
		try {
			// Check for built-in rule
			const builtInRule = this.builtInRules.get(rule.type);
			if (builtInRule) {
				const ruleContext = { ...context, value: rule.value };
				const result = await builtInRule.validate(value, ruleContext);

				if (builtInRule.isAsync) {
					// return await result as Promise<boolean>;
					return typeof result === 'string'
						? Promise.resolve(false)
						: Promise.resolve(result);
				}

				return result as boolean;
			}

			// Check for custom rule
			const customRuleType = `${field}:custom`;
			const customRule = this.customRules.get(customRuleType);
			if (customRule) {
				const ruleContext = { ...context, value: rule.value };
				const result = customRule.validate(value, ruleContext);

				if (customRule.isAsync) {
					const asyncResult = await result;
					return typeof asyncResult === 'string' ? false : asyncResult;
				}

				return typeof result === 'string' ? false : result as boolean;
			}

			this.logger.warn(`Unknown validation rule type: ${rule.type} for field ${field}`);
			return true;
		} catch (error: any) {
			this.logger.error(`Error validating ${field} with rule ${rule.type}: ${error}`);
			return false;
		}
	}

	/**
	 * Format validation errors for response
	 * @param errors Validation errors
	 * @returns Formatted error object
	 */
	formatErrors(errors: ValidationError[]): Record<string, string> {
		const formatted: Record<string, string> = {};

		for (const error of errors) {
			formatted[error.field] = error.message;
		}

		return formatted;
	}

	/**
	 * Create detailed error information for API responses
	 * @param errors Validation errors
	 * @returns Array of detailed error objects
	 */
	createDetailedErrors(errors: ValidationError[]): Array<Record<string, any>> {
		return errors.map(error => ({
			field: error.field,
			message: error.message,
			type: error.type,
			constraint: error.value
		}));
	}
}

/**
 * Create a validation engine
 * @param logger Logger instance
 * @param configLoader Configuration loader
 * @returns Validation engine instance
 */
export function createValidationEngine(
	logger: Logger,
	configLoader: any
): ValidationEngine {
	return new ValidationEngine(logger, configLoader);
}