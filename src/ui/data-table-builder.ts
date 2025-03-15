/**
 * Data Table Builder
 * 
 * This file implements a data table builder that generates table configurations
 * from entity definitions, with support for columns, filters, sorting, and actions.
 */

import { EntityConfig } from '../entity';
import {
	ComponentType,
	DataTableConfig,
	DataTableColumn,
	FilterConfig,
	ActionConfig,
	ActionType,
	SortConfig,
	PaginationConfig,
	ConditionalStyleConfig
} from './ui-schema';

/**
 * Data table builder options
 */
export interface DataTableBuilderOptions {
	/**
	 * Columns to include (if not specified, all columns are included)
	 */
	columns?: (string | DataTableColumn)[];

	/**
	 * Columns to exclude
	 */
	excludeColumns?: string[];

	/**
	 * Whether to include the ID column
	 */
	includeIdColumn?: boolean;

	/**
	 * Whether to include timestamp columns
	 */
	includeTimestampColumns?: boolean;

	/**
	 * Filters to include
	 */
	filters?: (string | FilterConfig)[];

	/**
	 * Table title
	 */
	title?: string;

	/**
	 * Default sort configuration
	 */
	defaultSort?: SortConfig;

	/**
	 * Pagination configuration
	 */
	pagination?: PaginationConfig | boolean;

	/**
	 * Row actions
	 */
	rowActions?: ActionConfig[];

	/**
	 * Bulk actions
	 */
	bulkActions?: ActionConfig[];

	/**
	 * Whether to make rows selectable
	 */
	selectable?: boolean;

	/**
	 * Whether to make the table exportable
	 */
	exportable?: boolean;

	/**
	 * Whether to make the table responsive
	 */
	responsive?: boolean;

	/**
	 * Column overrides
	 */
	columnOverrides?: Record<string, Partial<DataTableColumn>>;

	/**
	 * Conditional styles
	 */
	conditionalStyles?: ConditionalStyleConfig[];

	/**
	 * Custom actions
	 */
	actions?: ActionConfig[];

	/**
	 * Available entity mappings (for relation columns)
	 */
	entityConfigs?: Record<string, EntityConfig>;
}

/**
 * Default data table builder options
 */
const defaultOptions: Partial<DataTableBuilderOptions> = {
	includeIdColumn: true,
	includeTimestampColumns: false,
	selectable: true,
	exportable: true,
	responsive: true,
	pagination: {
		enabled: true,
		pageSize: 10,
		pageSizeOptions: [10, 20, 50, 100],
		position: 'bottom',
	},
};

/**
 * Column type mapping
 */
export const columnTypeMap: Record<string, DataTableColumn['format']> = {
	integer: 'number',
	decimal: 'number',
	float: 'number',
	double: 'number',
	boolean: 'boolean',
	date: 'date',
	datetime: 'date',
	time: 'date',
	currency: 'currency',
};

/**
 * Data Table Builder class
 */
export class DataTableBuilder {
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
	 * Build a data table configuration
	 * @param options Data table builder options
	 * @returns Data table configuration
	 */
	buildDataTable(options: DataTableBuilderOptions): DataTableConfig {
		// Merge with default options
		const mergedOptions: DataTableBuilderOptions = {
			...defaultOptions,
			...options
		};

		// Determine which columns to include
		const columnNames = this.getColumnsToInclude(mergedOptions);

		// Generate column configurations
		const columns = columnNames.map(columnName =>
			this.buildColumn(columnName, mergedOptions)
		);

		// Generate filter configurations
		const filters = this.buildFilters(mergedOptions);

		// Generate row actions
		const rowActions = this.buildRowActions(mergedOptions);

		// Generate pagination config
		const pagination = this.buildPaginationConfig(mergedOptions);

		// Create data table configuration
		const dataTableConfig: DataTableConfig = {
			type: ComponentType.DataTable,
			entity: this.entity.entity,
			columns,
			filters,
			pagination,
			rowActions,
			selectable: mergedOptions.selectable,
			exportable: mergedOptions.exportable,
			responsive: mergedOptions.responsive,
		};

		// Add optional properties
		if (mergedOptions.title) {
			dataTableConfig.title = mergedOptions.title;
		}

		if (mergedOptions.defaultSort) {
			dataTableConfig.defaultSort = mergedOptions.defaultSort;
		}

		if (mergedOptions.bulkActions && mergedOptions.bulkActions.length > 0) {
			dataTableConfig.bulkActions = mergedOptions.bulkActions;
		}

		if (mergedOptions.conditionalStyles && mergedOptions.conditionalStyles.length > 0) {
			dataTableConfig.conditionalStyles = mergedOptions.conditionalStyles;
		}

		if (mergedOptions.actions && mergedOptions.actions.length > 0) {
			dataTableConfig.actions = mergedOptions.actions;
		}

		return dataTableConfig;
	}

	/**
	 * Determine which columns to include in the table
	 * @param options Data table builder options
	 * @returns Array of column names to include
	 */
	private getColumnsToInclude(options: DataTableBuilderOptions): string[] {
		// Start with all column logical names
		let columns = this.entity.columns.map(col => col.logical);

		// Exclude ID column if specified
		if (options.includeIdColumn === false) {
			columns = columns.filter(column => column !== this.entity.idField);
		}

		// Exclude timestamp columns if specified
		if (options.includeTimestampColumns === false && this.entity.timestamps) {
			const timestampColumns = [
				this.entity.timestamps.createdAt,
				this.entity.timestamps.updatedAt,
				this.entity.timestamps.deletedAt,
			].filter(Boolean) as string[];

			columns = columns.filter(column => !timestampColumns.includes(column));
		}

		// If specific columns are provided, use only those
		if (options.columns && options.columns.length > 0) {
			// Extract column names from the columns array
			const columnNames = options.columns.map(col =>
				typeof col === 'string' ? col : col.field
			);
			columns = columns.filter(column => columnNames.includes(column));
		}

		// Exclude specified columns
		if (options.excludeColumns && options.excludeColumns.length > 0) {
			columns = columns.filter(column => !options.excludeColumns!.includes(column));
		}

		return columns;
	}

	/**
	 * Build column configuration
	 * @param columnName Column name
	 * @param options Data table builder options
	 * @returns Column configuration
	 */
	private buildColumn(columnName: string, options: DataTableBuilderOptions): DataTableColumn {
		// Check if column override exists
		if (options.columnOverrides && options.columnOverrides[columnName]) {
			if (typeof options.columnOverrides[columnName] === 'object' &&
				'field' in options.columnOverrides[columnName]) {
				return options.columnOverrides[columnName] as DataTableColumn;
			}
		}

		// Find the column definition in the entity mapping
		const column = this.entity.columns.find(col => col.logical === columnName);
		if (!column) {
			throw new Error(`Column not found for "${columnName}" in entity "${this.entity.entity}"`);
		}

		// Create base column configuration
		const columnConfig: DataTableColumn = {
			field: columnName,
			header: this.formatColumnHeader(columnName),
			sortable: true,
			filterable: true,
		};

		// Set format based on column type
		if (column.type) {
			const format = columnTypeMap[column.type.toLowerCase()];
			if (format) {
				columnConfig.format = format;
			}
		}

		// Handle special formatting
		if (column.type === 'currency' || columnName.toLowerCase().includes('price') ||
			columnName.toLowerCase().includes('cost') || columnName.toLowerCase().includes('amount')) {
			columnConfig.format = 'currency';
			columnConfig.formatOptions = { currency: 'USD' };
		}

		// Handle boolean columns
		if (column.type === 'boolean') {
			columnConfig.format = 'boolean';
			columnConfig.align = 'center';
		}

		// Handle date columns
		if (column.type === 'date' || column.type === 'datetime' || column.type === 'time') {
			columnConfig.format = 'date';
			columnConfig.formatOptions = {
				type: column.type === 'time' ? 'time' : (column.type === 'datetime' ? 'datetime' : 'date'),
			};
		}

		// Set width for specific column types
		if (column.type === 'boolean') {
			columnConfig.width = '80px';
		} else if (column.type === 'date' || column.type === 'datetime') {
			columnConfig.width = '150px';
		} else if (column.logical === this.entity.idField) {
			columnConfig.width = '80px';
		}

		// Apply column overrides if any
		if (options.columnOverrides && options.columnOverrides[columnName]) {
			Object.assign(columnConfig, options.columnOverrides[columnName]);
		}

		// Handle relations
		this.handleRelationColumn(columnName, columnConfig);

		return columnConfig;
	}

	/**
	 * Build filter configurations
	 * @param options Data table builder options
	 * @returns Filter configurations
	 */
	private buildFilters(options: DataTableBuilderOptions): FilterConfig[] {
		if (!options.filters || options.filters.length === 0) {
			// By default, add filters for key columns
			const defaultFilters: FilterConfig[] = [];

			// Check for common filterable fields
			const filterableCandidates = ['name', 'title', 'status', 'category', 'type', 'active'];

			for (const candidate of filterableCandidates) {
				const column = this.entity.columns.find(col => col.logical === candidate ||
					col.logical.endsWith(`_${candidate}`));
				if (column) {
					defaultFilters.push(this.buildFilter(column.logical));
				}
			}

			return defaultFilters;
		}

		// If specific filters are provided
		return options.filters.map(filter => {
			if (typeof filter === 'string') {
				return this.buildFilter(filter);
			}
			return filter;
		});
	}

	/**
	 * Build filter configuration for a column
	 * @param columnName Column name
	 * @returns Filter configuration
	 */
	private buildFilter(columnName: string): FilterConfig {
		// Find the column definition
		const column = this.entity.columns.find(col => col.logical === columnName);
		if (!column) {
			throw new Error(`Column not found for filter "${columnName}" in entity "${this.entity.entity}"`);
		}

		// Create base filter configuration
		const filterConfig: FilterConfig = {
			field: columnName,
			label: this.formatColumnHeader(columnName),
			placeholder: `Filter by ${this.formatColumnHeader(columnName).toLowerCase()}`,
		};

		// Set filter type based on column type
		if (column.type) {
			switch (column.type.toLowerCase()) {
				case 'boolean':
					filterConfig.type = 'boolean';
					break;
				case 'integer':
				case 'decimal':
				case 'float':
				case 'double':
					filterConfig.type = 'number';
					break;
				case 'date':
					filterConfig.type = 'date';
					break;
				case 'datetime':
					filterConfig.type = 'daterange';
					break;
				case 'enum':
					filterConfig.type = 'select';
					if (column.options) {
						filterConfig.options = Array.isArray(column.options)
							? column.options.map(opt => ({ label: this.formatColumnHeader(opt), value: opt }))
							: column.options;
					}
					break;
				default:
					filterConfig.type = 'text';
			}
		}

		// Handle relations for filters
		this.handleRelationFilter(columnName, filterConfig);

		return filterConfig;
	}

	/**
	 * Build default row actions
	 * @param options Data table builder options
	 * @returns Row action configurations
	 */
	private buildRowActions(options: DataTableBuilderOptions): ActionConfig[] {
		// If specific row actions are provided, use those
		if (options.rowActions && options.rowActions.length > 0) {
			return options.rowActions;
		}

		// Otherwise, create default CRUD actions
		return [
			{
				type: ActionType.Navigate,
				label: 'View',
				icon: 'eye',
				target: `/admin/${this.entity.table}/:id`,
			},
			{
				type: ActionType.Navigate,
				label: 'Edit',
				icon: 'edit',
				target: `/admin/${this.entity.table}/:id/edit`,
			},
			{
				type: ActionType.Api,
				label: 'Delete',
				icon: 'trash',
				confirmMessage: `Are you sure you want to delete this ${this.entity.entity.toLowerCase()}?`,
				apiEndpoint: `/api/${this.entity.table}/:id`,
				method: 'DELETE',
			},
		];
	}

	/**
	 * Build pagination configuration
	 * @param options Data table builder options
	 * @returns Pagination configuration
	 */
	private buildPaginationConfig(options: DataTableBuilderOptions): PaginationConfig | undefined {
		if (options.pagination === false) {
			return undefined;
		}

		if (options.pagination === true) {
			return defaultOptions.pagination as PaginationConfig;
		}

		return options.pagination as PaginationConfig;
	}

	/**
	 * Format a column name into a header
	 * @param columnName Column name
	 * @returns Formatted header
	 */
	private formatColumnHeader(columnName: string): string {
		return columnName
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
	 * Handle relation columns
	 * @param columnName Column name
	 * @param columnConfig Column configuration
	 */
	private handleRelationColumn(columnName: string, columnConfig: DataTableColumn): void {
		// Skip if no relations are defined
		if (!this.entity.relations) return;

		// Check if this column is used in any relations
		const relation = this.entity.relations.find(
			rel => rel.sourceColumn === columnName ||
				(rel.type === 'manyToMany' && rel.sourceColumn === columnName)
		);

		if (!relation) return;

		// Handle different relation types
		switch (relation.type) {
			case 'manyToOne': {
				// Find the target entity mapping
				const targetMapping = this.entityConfigs[relation.targetEntity];
				if (targetMapping) {
					// Use a template to display the related entity's display field
					const displayField = this.getDisplayField(targetMapping);
					columnConfig.template = `{{ row.${relation.targetEntity.toLowerCase()}.${displayField} }}`;
				}
				break;
			}
			case 'manyToMany': {
				// For many-to-many, we might want to display a comma-separated list or a badge count
				columnConfig.template = `{{ row.${relation.name}.length }} items`;
				break;
			}
			// Handle other relation types as needed
		}
	}

	/**
	 * Handle relation filters
	 * @param columnName Column name
	 * @param filterConfig Filter configuration
	 */
	private handleRelationFilter(columnName: string, filterConfig: FilterConfig): void {
		// Skip if no relations are defined
		if (!this.entity.relations) return;

		// Check if this column is used in any relations
		const relation = this.entity.relations.find(
			rel => rel.sourceColumn === columnName
		);

		if (!relation) return;

		// Handle different relation types
		switch (relation.type) {
			case 'manyToOne': {
				filterConfig.type = 'select';
				filterConfig.optionsEntity = relation.targetEntity;

				// Find the target entity mapping
				const targetMapping = this.entityConfigs[relation.targetEntity];
				if (targetMapping) {
					const displayField = this.getDisplayField(targetMapping);
					filterConfig.optionsLabelField = displayField;
					filterConfig.optionsValueField = relation.targetColumn;
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
 * Generate a data table configuration from an entity mapping
 * @param entity Entity mapping
 * @param options Data table builder options
 * @param entityConfigs Available entity mappings
 * @returns Data table configuration
 */
export function generateDataTable(
	entity: EntityConfig,
	options: DataTableBuilderOptions = {},
	entityConfigs: Record<string, EntityConfig> = {}
): DataTableConfig {
	const builder = new DataTableBuilder(entity, entityConfigs);
	return builder.buildDataTable(options);
}

/**
 * Generate a list data table configuration from an entity mapping
 * @param entity Entity mapping
 * @param options Data table builder options
 * @param entityConfigs Available entity mappings
 * @returns List table configuration
 */
export function generateListTable(
	entity: EntityConfig,
	options: Partial<DataTableBuilderOptions> = {},
	entityConfigs: Record<string, EntityConfig> = {}
): DataTableConfig {
	return generateDataTable(entity, {
		title: `${entity.entity} List`,
		includeTimestampColumns: false,
		exportable: true,
		actions: [
			{
				type: ActionType.Navigate,
				label: `Create ${entity.entity}`,
				icon: 'plus',
				target: `/admin/${entity.table}/create`,
			},
		],
		...options,
	}, entityConfigs);
}

/**
 * Generate a compact table configuration from an entity mapping
 * @param entity Entity mapping
 * @param options Data table builder options
 * @param entityConfigs Available entity mappings
 * @returns Compact table configuration
 */
export function generateCompactTable(
	entity: EntityConfig,
	options: Partial<DataTableBuilderOptions> = {},
	entityConfigs: Record<string, EntityConfig> = {}
): DataTableConfig {
	// Identify the most important columns (typically the first 3-4 non-ID columns)
	const importantColumns = entity.columns
		.filter(col => col.logical !== entity.idField)
		.slice(0, 4)
		.map(col => col.logical);

	return generateDataTable(entity, {
		title: `${entity.entity}`,
		columns: [entity.idField, ...importantColumns],
		pagination: {
			enabled: true,
			pageSize: 5,
			position: 'bottom',
		},
		selectable: false,
		exportable: false,
		...options,
	}, entityConfigs);
}

/**
 * Generate a read-only table configuration from an entity mapping
 * @param entity Entity mapping
 * @param options Data table builder options
 * @param entityConfigs Available entity mappings
 * @returns Read-only table configuration
 */
export function generateReadOnlyTable(
	entity: EntityConfig,
	options: Partial<DataTableBuilderOptions> = {},
	entityConfigs: Record<string, EntityConfig> = {}
): DataTableConfig {
	return generateDataTable(entity, {
		title: `${entity.entity} Data`,
		rowActions: [
			{
				type: ActionType.Navigate,
				label: 'View',
				icon: 'eye',
				target: `/admin/${entity.table}/:id`,
			},
		],
		...options,
	}, entityConfigs);
}