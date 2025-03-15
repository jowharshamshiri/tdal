/**
 * Form Builder
 * 
 * This file implements a form builder that generates form configurations
 * from entity definitions, with support for various field types, validation,
 * and customization options.
 */

import { EntityConfig } from '../entity';
import { FormConfig, FormFieldConfig, FormMode, ComponentType, FormSectionConfig, ActionType } from './ui-schema';

/**
 * Form field type mapping
 */
export const fieldTypeMap: Record<string, string> = {
	string: 'text',
	text: 'textarea',
	longtext: 'richtext',
	integer: 'number',
	decimal: 'number',
	float: 'number',
	double: 'number',
	boolean: 'checkbox',
	date: 'date',
	datetime: 'datetime',
	time: 'time',
	json: 'textarea',
	enum: 'select',
	uuid: 'text',
	email: 'email',
	password: 'password',
	url: 'text',
	image: 'image',
	file: 'file',
	color: 'color',
};

/**
 * Form builder options
 */
export interface FormBuilderOptions {
	/**
	 * Form mode (create, edit, view)
	 */
	mode: FormMode;

	/**
	 * Fields to include (if not specified, all fields are included)
	 */
	fields?: string[];

	/**
	 * Fields to exclude
	 */
	excludeFields?: string[];

	/**
	 * Whether to include the ID field
	 */
	includeIdField?: boolean;

	/**
	 * Whether to include timestamp fields
	 */
	includeTimestampFields?: boolean;

	/**
	 * Form layout (vertical, horizontal, inline)
	 */
	layout?: 'vertical' | 'horizontal' | 'inline';

	/**
	 * Form sections
	 */
	sections?: FormSectionConfig[];

	/**
	 * Field overrides
	 */
	fieldOverrides?: Record<string, Partial<FormFieldConfig>>;

	/**
	 * Form title
	 */
	title?: string;

	/**
	 * Form description
	 */
	description?: string;

	/**
	 * Submit button label
	 */
	submitLabel?: string;

	/**
	 * Cancel button label
	 */
	cancelLabel?: string;

	/**
	 * Path to redirect to after submission
	 */
	redirectAfterSubmit?: string;

	/**
	 * Custom validation function
	 */
	customValidation?: string;

	/**
	 * Available entity mappings (for relation fields)
	 */
	entityConfigs?: Record<string, EntityConfig>;
}

/**
 * Default form builder options
 */
const defaultOptions: Partial<FormBuilderOptions> = {
	includeIdField: false,
	includeTimestampFields: false,
	layout: 'vertical',
	submitLabel: 'Submit',
	cancelLabel: 'Cancel',
};

/**
 * Form builder class
 */
export class FormBuilder {
	/**
	 * Entity mapping
	 */
	private entity: EntityConfig;

	/**
	 * Available entity mappings
	 */
	private entityConfigs: Record<string, EntityConfig>;

	/**
	 * Constructor
	 * @param entity Entity mapping
	 * @param entityConfigs Available entity mappings
	 */
	constructor(entity: EntityConfig, entityConfigs: Record<string, EntityConfig> = {}) {
		this.entity = entity;
		this.entityConfigs = { ...entityConfigs, [entity.entity]: entity };
	}

	/**
	 * Build a form configuration
	 * @param options Form builder options
	 * @returns Form configuration
	 */
	buildForm(options: FormBuilderOptions): FormConfig {
		// Merge with default options
		const mergedOptions: FormBuilderOptions = { ...defaultOptions, ...options };

		// Determine which fields to include
		const fields = this.getFieldsToInclude(mergedOptions);

		// Generate field configurations
		const fieldConfigs = fields.map(fieldName => this.buildField(fieldName, mergedOptions));

		// Create form configuration
		const formConfig: FormConfig = {
			type: ComponentType.Form,
			entity: this.entity.entity,
			mode: mergedOptions.mode,
			fields: fieldConfigs,
			layout: mergedOptions.layout,
			sections: mergedOptions.sections,
			submitAction: {
				type: ActionType.Api,
				label: mergedOptions.submitLabel || 'Submit',
				apiEndpoint: `/api/${this.entity.table}${mergedOptions.mode === FormMode.Edit ? '/:id' : ''}`,
				method: mergedOptions.mode === FormMode.Create ? 'POST' : 'PUT',
			},
			cancelAction: {
				type: ActionType.Navigate,
				label: mergedOptions.cancelLabel || 'Cancel',
				target: `/api/${this.entity.table}`,
			},
		};

		// Add optional properties
		if (mergedOptions.title) {
			formConfig.title = mergedOptions.title;
		}

		if (mergedOptions.description) {
			formConfig.description = mergedOptions.description;
		}

		if (mergedOptions.redirectAfterSubmit) {
			formConfig.redirectAfterSubmit = mergedOptions.redirectAfterSubmit;
		}

		if (mergedOptions.customValidation) {
			formConfig.customValidation = mergedOptions.customValidation;
		}

		return formConfig;
	}

	/**
	 * Determine which fields to include in the form
	 * @param options Form builder options
	 * @returns Array of field names to include
	 */
	private getFieldsToInclude(options: FormBuilderOptions): string[] {
		// Start with all column logical names
		let fields = this.entity.columns.map(col => col.logical);

		// Exclude ID field if not explicitly included
		if (!options.includeIdField) {
			fields = fields.filter(field => field !== this.entity.idField);
		}

		// Exclude timestamp fields if not explicitly included
		if (!options.includeTimestampFields && this.entity.timestamps) {
			const timestampFields = [
				this.entity.timestamps.createdAt,
				this.entity.timestamps.updatedAt,
				this.entity.timestamps.deletedAt,
			].filter(Boolean) as string[];

			fields = fields.filter(field => !timestampFields.includes(field));
		}

		// If specific fields are provided, use only those
		if (options.fields && options.fields.length > 0) {
			fields = fields.filter(field => options.fields!.includes(field));
		}

		// Exclude specified fields
		if (options.excludeFields && options.excludeFields.length > 0) {
			fields = fields.filter(field => !options.excludeFields!.includes(field));
		}

		return fields;
	}

	/**
	 * Build a field configuration
	 * @param fieldName Field name
	 * @param options Form builder options
	 * @returns Field configuration
	 */
	private buildField(fieldName: string, options: FormBuilderOptions): FormFieldConfig {
		// Find the column definition
		const column = this.entity.columns.find(col => col.logical === fieldName);
		if (!column) {
			throw new Error(`Column not found for field "${fieldName}" in entity "${this.entity.entity}"`);
		}

		// Get base field type
		const fieldType = this.getFieldType(column.type);

		// Create base field configuration
		const fieldConfig: FormFieldConfig = {
			name: fieldName,
			label: this.formatLabel(fieldName),
			type: fieldType,
			required: !column.nullable,
		};

		// Set additional properties based on column type
		if (column.type === 'integer' || column.type === 'decimal' || column.type === 'float' || column.type === 'double') {
			fieldConfig.type = 'number';
			if (column.type === 'decimal' || column.type === 'float' || column.type === 'double') {
				fieldConfig.step = 0.01;
			}
		}

		// Handle relations
		this.handleRelationField(fieldName, fieldConfig);

		// Handle enums
		if (column.type === 'enum' && column.options) {
			fieldConfig.type = 'select';
			fieldConfig.options = Array.isArray(column.options)
				? column.options.map(opt => ({ label: this.formatLabel(opt), value: opt }))
				: column.options;
		}

		// Apply field overrides
		if (options.fieldOverrides && options.fieldOverrides[fieldName]) {
			Object.assign(fieldConfig, options.fieldOverrides[fieldName]);
		}

		// Handle readonly mode
		if (options.mode === FormMode.View) {
			fieldConfig.disabled = true;
		}

		return fieldConfig;
	}

	/**
	 * Get the field type for a column type
	 * @param columnType Column type
	 * @returns Field type
	 */
	private getFieldType(columnType?: string): string {
		if (!columnType) return 'text';
		return fieldTypeMap[columnType.toLowerCase()] || 'text';
	}

	/**
	 * Format a field name into a label
	 * @param fieldName Field name
	 * @returns Formatted label
	 */
	private formatLabel(fieldName: string): string {
		return fieldName
			// Split on camelCase
			.replace(/([A-Z])/g, ' $1')
			// Split on snake_case
			.replace(/_/g, ' ')
			// Capitalize first letter
			.replace(/^./, str => str.toUpperCase())
			// Trim whitespace
			.trim();
	}

	/**
	 * Handle relation fields
	 * @param fieldName Field name
	 * @param fieldConfig Field configuration
	 */
	private handleRelationField(fieldName: string, fieldConfig: FormFieldConfig): void {
		// Skip if no relations are defined
		if (!this.entity.relations) return;

		// Check if this field is used in any relations
		const relation = this.entity.relations.find(
			rel => rel.sourceColumn === fieldName ||
				(rel.type === 'manyToMany' && rel.sourceColumn === fieldName)
		);

		if (!relation) return;

		// Handle different relation types
		switch (relation.type) {
			case 'manyToOne': {
				fieldConfig.type = 'select';
				fieldConfig.optionsEntity = relation.targetEntity;

				// Find the target entity mapping
				const targetMapping = this.entityConfigs[relation.targetEntity];
				if (targetMapping) {
					// Use the primary display field if available, otherwise use the ID field
					const displayField = this.getDisplayField(targetMapping);
					fieldConfig.optionsLabelField = displayField;
					fieldConfig.optionsValueField = relation.targetColumn;
				}
				break;
			}
			case 'manyToMany': {
				fieldConfig.type = 'multiselect';
				fieldConfig.optionsEntity = relation.targetEntity;

				// Find the target entity mapping
				const targetMapping = this.entityConfigs[relation.targetEntity];
				if (targetMapping) {
					const displayField = this.getDisplayField(targetMapping);
					fieldConfig.optionsLabelField = displayField;
					fieldConfig.optionsValueField = relation.targetColumn;
				}
				break;
			}
			// Other relation types might need special handling
		}
	}

	/**
	 * Try to determine the best display field for an entity
	 * @param mapping Entity mapping
	 * @returns Display field name
	 */
	private getDisplayField(mapping: EntityConfig): string {
		// Common display field names
		const displayFieldCandidates = ['name', 'title', 'label', 'description'];

		// Try to find a suitable display field
		for (const candidate of displayFieldCandidates) {
			if (mapping.columns.some(col => col.logical === candidate)) {
				return candidate;
			}
		}

		// Fall back to the ID field
		return mapping.idField;
	}
}

/**
 * Generate a form configuration from an entity mapping
 * @param entity Entity mapping
 * @param options Form builder options
 * @param entityConfigs Available entity mappings
 * @returns Form configuration
 */
export function generateForm(
	entity: EntityConfig,
	options: FormBuilderOptions,
	entityConfigs: Record<string, EntityConfig> = {}
): FormConfig {
	const builder = new FormBuilder(entity, entityConfigs);
	return builder.buildForm(options);
}

/**
 * Generate a create form configuration from an entity mapping
 * @param entity Entity mapping
 * @param options Form builder options
 * @param entityConfigs Available entity mappings
 * @returns Create form configuration
 */
export function generateCreateForm(
	entity: EntityConfig,
	options: Partial<FormBuilderOptions> = {},
	entityConfigs: Record<string, EntityConfig> = {}
): FormConfig {
	return generateForm(entity, {
		mode: FormMode.Create,
		title: `Create ${entity.entity}`,
		submitLabel: 'Create',
		...options,
	}, entityConfigs);
}

/**
 * Generate an edit form configuration from an entity mapping
 * @param entity Entity mapping
 * @param options Form builder options
 * @param entityConfigs Available entity mappings
 * @returns Edit form configuration
 */
export function generateEditForm(
	entity: EntityConfig,
	options: Partial<FormBuilderOptions> = {},
	entityConfigs: Record<string, EntityConfig> = {}
): FormConfig {
	return generateForm(entity, {
		mode: FormMode.Edit,
		title: `Edit ${entity.entity}`,
		submitLabel: 'Save',
		includeIdField: true,
		...options,
	}, entityConfigs);
}

/**
 * Generate a view form configuration from an entity mapping
 * @param entity Entity mapping
 * @param options Form builder options
 * @param entityConfigs Available entity mappings
 * @returns View form configuration
 */
export function generateViewForm(
	entity: EntityConfig,
	options: Partial<FormBuilderOptions> = {},
	entityConfigs: Record<string, EntityConfig> = {}
): FormConfig {
	return generateForm(entity, {
		mode: FormMode.View,
		title: `View ${entity.entity}`,
		includeIdField: true,
		includeTimestampFields: true,
		...options,
	}, entityConfigs);
}