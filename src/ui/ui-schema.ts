/**
 * UI YAML Schema Definition
 * 
 * This file defines the TypeScript interfaces corresponding to the UI YAML configuration
 * schema. It includes types for pages, layouts, components, and their properties.
 */

import { EntityConfig } from "../entity";

/**
 * Available UI component types
 */
export enum ComponentType {
	DataTable = "DataTable",
	Form = "Form",
	Card = "Card",
	Tabs = "Tabs",
	List = "List",
	Chart = "Chart",
	Dashboard = "Dashboard",
	StatCard = "StatCard",
	Button = "Button",
	ButtonGroup = "ButtonGroup",
	Modal = "Modal",
	Alert = "Alert",
	Container = "Container",
	Panel = "Panel",
	Text = "Text",
	Html = "Html",
	Custom = "Custom",
}

/**
 * Component action type
 */
export enum ActionType {
	Navigate = "navigate",
	Api = "api",
	Modal = "modal",
	Execute = "execute",
	Download = "download",
	Link = "link",
	Custom = "custom",
}

/**
 * Layout type
 */
export enum LayoutType {
	Default = "default",
	Admin = "admin",
	Auth = "auth",
	Landing = "landing",
	Dashboard = "dashboard",
	Blank = "blank",
	Custom = "custom",
}

/**
 * Form mode
 */
export enum FormMode {
	Create = "create",
	Edit = "edit",
	View = "view",
}

/**
 * Base component properties
 */
export interface BaseComponentProps {
	id?: string;
	className?: string;
	style?: Record<string, string>;
	hidden?: string | boolean;
	permissions?: string[];
	conditionalRender?: string;
}

/**
 * Action configuration
 */
export interface ActionConfig {
	type: ActionType;
	label: string;
	icon?: string;
	target?: string;
	url?: string;
	action?: string;
	apiEndpoint?: string;
	method?: "GET" | "POST" | "PUT" | "DELETE";
	payload?: string | Record<string, unknown>;
	confirmMessage?: string;
	permissions?: string[];
	condition?: string;
}

/**
 * Component configuration interface - base for all components
 */
export interface ComponentConfig extends BaseComponentProps {
	type: ComponentType;
	title?: string;
	description?: string;
	actions?: ActionConfig[];
}

/**
 * Data table component configuration
 */
export interface DataTableConfig extends ComponentConfig {
	type: ComponentType.DataTable;
	entity: string;
	columns: Array<string | DataTableColumn>;
	filters?: Array<string | FilterConfig>;
	pagination?: PaginationConfig;
	defaultSort?: SortConfig;
	rowActions?: ActionConfig[];
	bulkActions?: ActionConfig[];
	conditionalStyles?: ConditionalStyleConfig[];
	selectable?: boolean;
	exportable?: boolean;
	responsive?: boolean;
}

/**
 * Data table column configuration
 */
export interface DataTableColumn {
	field: string;
	header?: string;
	sortable?: boolean;
	filterable?: boolean;
	hidden?: boolean;
	width?: string;
	align?: "left" | "center" | "right";
	format?: "date" | "currency" | "number" | "boolean" | "custom";
	formatOptions?: Record<string, unknown>;
	template?: string;
	renderComponent?: ComponentConfig;
}

/**
 * Form component configuration
 */
export interface FormConfig extends ComponentConfig {
	type: ComponentType.Form;
	entity: string;
	mode: FormMode;
	fields: Array<string | FormFieldConfig>;
	layout?: "vertical" | "horizontal" | "inline";
	sections?: FormSectionConfig[];
	submitAction?: ActionConfig;
	cancelAction?: ActionConfig;
	redirectAfterSubmit?: string;
	validation?: "onSubmit" | "onChange" | "onBlur";
	customValidation?: string;
	readOnly?: boolean | string;
}

/**
 * Form field configuration
 */
export interface FormFieldConfig {
	name: string;
	label?: string;
	type?: "text" | "number" | "email" | "password" | "date" | "time" | "datetime" |
	"select" | "multiselect" | "checkbox" | "radio" | "textarea" | "richtext" |
	"file" | "image" | "color" | "hidden" | "custom";
	placeholder?: string;
	helperText?: string;
	defaultValue?: unknown;
	required?: boolean;
	disabled?: boolean | string;
	hidden?: boolean | string;
	min?: number;
	max?: number;
	step?: number;
	options?: Array<{ label: string; value: unknown; }> | string;
	optionsEntity?: string;
	optionsLabelField?: string;
	optionsValueField?: string;
	conditionalLogic?: ConditionalLogicConfig;
	permissions?: string[];
	validation?: string;
	width?: string | number;
	section?: string;
	render?: ComponentConfig;
}

/**
 * Form section configuration
 */
export interface FormSectionConfig {
	id: string;
	title: string;
	description?: string;
	collapsed?: boolean;
	conditionalDisplay?: string;
	permissions?: string[];
}

/**
 * Conditional logic configuration
 */
export interface ConditionalLogicConfig {
	condition: string;
	show?: boolean;
	hide?: boolean;
	enable?: boolean;
	disable?: boolean;
	require?: boolean;
}

/**
 * Conditional style configuration
 */
export interface ConditionalStyleConfig {
	condition: string;
	className?: string;
	style?: Record<string, string>;
}

/**
 * Filter configuration
 */
export interface FilterConfig {
	field: string;
	label?: string;
	type?: "text" | "number" | "select" | "multiselect" | "date" | "daterange" | "boolean";
	placeholder?: string;
	options?: Array<{ label: string; value: unknown; }> | string;
	defaultValue?: unknown;
	optionsEntity?: string;
	optionsLabelField?: string;
	optionsValueField?: string;
}

/**
 * Pagination configuration
 */
export interface PaginationConfig {
	enabled?: boolean;
	pageSize?: number;
	pageSizeOptions?: number[];
	position?: "top" | "bottom" | "both";
}

/**
 * Sort configuration
 */
export interface SortConfig {
	field: string;
	direction: "asc" | "desc";
}

/**
 * Card component configuration
 */
export interface CardConfig extends ComponentConfig {
	type: ComponentType.Card;
	header?: ComponentConfig;
	body?: ComponentConfig[];
	footer?: ComponentConfig;
	entity?: string;
	actions?: ActionConfig[];
	bordered?: boolean;
	hoverable?: boolean;
	loading?: boolean | string;
}

/**
 * Chart component configuration
 */
export interface ChartConfig extends ComponentConfig {
	type: ComponentType.Chart;
	chartType: "bar" | "line" | "pie" | "area" | "radar" | "scatter";
	dataSource: "entity" | "api" | "custom";
	entity?: string;
	apiEndpoint?: string;
	data?: string | Record<string, unknown>[];
	xField?: string;
	yField?: string | string[];
	colorField?: string;
	seriesField?: string;
	filters?: FilterConfig[];
	height?: string | number;
	width?: string | number;
	legend?: boolean | "top" | "bottom" | "left" | "right";
	tooltip?: boolean;
	axis?: boolean;
	grid?: boolean;
	animation?: boolean;
}

/**
 * Tab interface
 */
export interface TabConfig {
	key: string;
	title: string;
	icon?: string;
	permissions?: string[];
	disabled?: boolean;
	components: ComponentConfig[];
}

/**
 * Tabs component configuration
 */
export interface TabsConfig extends ComponentConfig {
	type: ComponentType.Tabs;
	tabs: TabConfig[];
	defaultActiveKey?: string;
	tabPosition?: "top" | "right" | "bottom" | "left";
}

/**
 * Menu item interface
 */
export interface MenuItem {
	key: string;
	title: string;
	path?: string;
	icon?: string;
	children?: MenuItem[];
	permissions?: string[];
	hidden?: boolean | string;
	divider?: boolean;
	externalLink?: boolean;
	badge?: {
		text: string;
		status?: "success" | "processing" | "error" | "default" | "warning";
	};
}

/**
 * Layout configuration
 */
export interface LayoutConfig {
	type: LayoutType;
	title?: string;
	logo?: string;
	menu?: MenuItem[];
	header?: ComponentConfig[];
	footer?: ComponentConfig[];
	sidebarWidth?: string | number;
	collapsible?: boolean;
	defaultCollapsed?: boolean;
	fixedHeader?: boolean;
	fixedSidebar?: boolean;
	breadcrumbs?: boolean;
	theme?: "light" | "dark";
	customStyles?: Record<string, string>;
}

/**
 * Page configuration
 */
export interface PageConfig {
	name: string;
	path: string;
	title: string;
	description?: string;
	layout: string;
	permissions?: string[];
	components: ComponentConfig[];
	meta?: {
		title?: string;
		description?: string;
		keywords?: string;
		ogImage?: string;
		[key: string]: string | undefined;
	};
	routeParams?: Record<string, unknown>;
	queryParams?: Record<string, unknown>;
}

/**
 * UI Application configuration
 */
export interface UIConfig {
	title: string;
	description?: string;
	theme?: {
		primaryColor?: string;
		secondaryColor?: string;
		successColor?: string;
		warningColor?: string;
		errorColor?: string;
		textColor?: string;
		backgroundColor?: string;
		fontFamily?: string;
		fontSize?: string;
		borderRadius?: string;
		[key: string]: string | undefined;
	};
	layouts: Record<string, LayoutConfig>;
	pages: PageConfig[];
	globalComponents?: ComponentConfig[];
	defaultLayout?: string;
	routes?: {
		homePage?: string;
		loginPage?: string;
		notFoundPage?: string;
		unauthorizedPage?: string;
	};
}

/**
 * Complete UI YAML schema
 */
export interface UISchema {
	ui: UIConfig;
}

/**
 * Validates a UI schema
 * @param schema The UI schema to validate
 * @returns An array of validation errors, or an empty array if valid
 */
export function validateUISchema(schema: UISchema): string[] {
	const errors: string[] = [];

	// Basic validation
	if (!schema.ui) {
		errors.push("UI configuration is required");
		return errors;
	}

	if (!schema.ui.title) {
		errors.push("UI title is required");
	}

	if (!schema.ui.layouts || Object.keys(schema.ui.layouts).length === 0) {
		errors.push("At least one layout is required");
	}

	if (!schema.ui.pages || schema.ui.pages.length === 0) {
		errors.push("At least one page is required");
	}

	// Validate layouts
	Object.entries(schema.ui.layouts).forEach(([name, layout]) => {
		if (!layout.type) {
			errors.push(`Layout "${name}" is missing a type`);
		}
	});

	// Validate pages
	schema.ui.pages.forEach((page, index) => {
		if (!page.name) {
			errors.push(`Page at index ${index} is missing a name`);
		}

		if (!page.path) {
			errors.push(`Page "${page.name || index}" is missing a path`);
		}

		if (!page.layout) {
			errors.push(`Page "${page.name || index}" is missing a layout`);
		} else if (!schema.ui.layouts[page.layout]) {
			errors.push(`Page "${page.name || index}" references unknown layout "${page.layout}"`);
		}

		if (!page.components || page.components.length === 0) {
			errors.push(`Page "${page.name || index}" has no components`);
		}
	});

	return errors;
}

/**
 * Get component schema based on type
 * @param type Component type
 * @returns Component schema interface
 */
export function getComponentSchema(type: ComponentType): any {
	switch (type) {
		case ComponentType.DataTable:
			return DataTableConfig;
		case ComponentType.Form:
			return FormConfig;
		case ComponentType.Card:
			return CardConfig;
		case ComponentType.Tabs:
			return TabsConfig;
		case ComponentType.Chart:
			return ChartConfig;
		default:
			return ComponentConfig;
	}
}

/**
 * Check if a component configuration is valid
 * @param component Component configuration
 * @param entities Available entity mappings
 * @returns Array of validation errors
 */
export function validateComponent(
	component: ComponentConfig,
	entities: Record<string, EntityConfig>
): string[] {
	const errors: string[] = [];

	if (!component.type) {
		errors.push("Component is missing a type");
		return errors;
	}

	// Validate entity-based components
	if ('entity' in component) {
		const entityComponent = component as any;
		if (!entityComponent.entity) {
			errors.push(`${component.type} component is missing an entity reference`);
		} else if (!entities[entityComponent.entity]) {
			errors.push(`${component.type} component references unknown entity "${entityComponent.entity}"`);
		}
	}

	// Type-specific validation
	switch (component.type) {
		case ComponentType.DataTable: {
			const dataTable = component as DataTableConfig;
			if (!dataTable.columns || dataTable.columns.length === 0) {
				errors.push("DataTable must define at least one column");
			}
			break;
		}
		case ComponentType.Form: {
			const form = component as FormConfig;
			if (!form.fields || form.fields.length === 0) {
				errors.push("Form must define at least one field");
			}
			if (!form.mode) {
				errors.push("Form must specify a mode (create, edit, or view)");
			}
			break;
		}
		case ComponentType.Tabs: {
			const tabs = component as TabsConfig;
			if (!tabs.tabs || tabs.tabs.length === 0) {
				errors.push("Tabs component must define at least one tab");
			}
			break;
		}
	}

	return errors;
}