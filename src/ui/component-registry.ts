/**
 * Component Registry
 * 
 * This file implements a registry for UI components, allowing for the registration
 * of built-in and custom components that can be used in YAML UI configurations.
 */

import { ComponentConfig, ComponentType } from './ui-schema';

/**
 * Component factory interface
 */
export interface ComponentFactory<T extends ComponentConfig = ComponentConfig> {
	/**
	 * Create a component instance from configuration
	 * @param config Component configuration
	 * @param context Component rendering context
	 */
	create: (config: T, context: ComponentContext) => any;
}

/**
 * Component context interface
 */
export interface ComponentContext {
	/**
	 * Current user information
	 */
	user?: {
		id: string | number;
		roles: string[];
		permissions: string[];
	};

	/**
	 * Current route parameters
	 */
	routeParams: Record<string, string>;

	/**
	 * Current query parameters
	 */
	queryParams: Record<string, string>;

	/**
	 * Entity data accessor
	 */
	entityManager: any;

	/**
	 * API client
	 */
	apiClient: any;

	/**
	 * Event emitter
	 */
	events: {
		emit: (eventName: string, data: any) => void;
		on: (eventName: string, handler: (data: any) => void) => void;
	};

	/**
	 * Navigation helper
	 */
	navigation: {
		navigate: (path: string, options?: { replace?: boolean }) => void;
		goBack: () => void;
	};

	/**
	 * UI state management
	 */
	uiState: {
		get: (key: string) => any;
		set: (key: string, value: any) => void;
	};

	/**
	 * Access component registry (for rendering child components)
	 */
	componentRegistry: ComponentRegistry;

	/**
	 * Execute an action
	 */
	executeAction: (actionName: string, data?: any) => Promise<any>;
}

/**
 * Component registry implementation
 */
export class ComponentRegistry {
	/**
	 * Map of component factories by type
	 */
	private factories: Map<string, ComponentFactory<any>> = new Map();

	/**
	 * Map of custom component factories by name
	 */
	private customFactories: Map<string, ComponentFactory<any>> = new Map();

	/**
	 * Constructor
	 */
	constructor() {
		// Register built-in components
		this.registerDefaults();
	}

	/**
	 * Register a component factory
	 * @param type Component type
	 * @param factory Component factory
	 */
	register<T extends ComponentConfig>(type: ComponentType, factory: ComponentFactory<T>): void {
		this.factories.set(type, factory);
	}

	/**
	 * Register a custom component factory
	 * @param name Custom component name
	 * @param factory Component factory
	 */
	registerCustom<T extends ComponentConfig>(name: string, factory: ComponentFactory<T>): void {
		this.customFactories.set(name, factory);
	}

	/**
	 * Get a component factory
	 * @param type Component type
	 * @returns Component factory
	 */
	getFactory<T extends ComponentConfig>(type: ComponentType | string): ComponentFactory<T> | undefined {
		// Check standard components
		if (Object.values(ComponentType).includes(type as ComponentType)) {
			return this.factories.get(type) as ComponentFactory<T>;
		}

		// Check custom components
		return this.customFactories.get(type) as ComponentFactory<T>;
	}

	/**
	 * Create a component instance from configuration
	 * @param config Component configuration
	 * @param context Component rendering context
	 * @returns Component instance
	 */
	createComponent(config: ComponentConfig, context: ComponentContext): any {
		// Handle conditional rendering
		if (config.conditionalRender && !this.evaluateCondition(config.conditionalRender, context)) {
			return null;
		}

		// Handle permission check
		if (config.permissions && !this.checkPermissions(config.permissions, context)) {
			return null;
		}

		// Get the appropriate factory
		const factory = this.getFactory(config.type);
		if (!factory) {
			console.warn(`No factory registered for component type: ${config.type}`);
			return null;
		}

		// Create the component
		return factory.create(config, context);
	}

	/**
	 * Check if the current user has the required permissions
	 * @param permissions Required permissions
	 * @param context Component context
	 * @returns Whether the user has the required permissions
	 */
	private checkPermissions(permissions: string[], context: ComponentContext): boolean {
		if (!permissions || permissions.length === 0) {
			return true;
		}

		if (!context.user) {
			return false;
		}

		// Check if the user has any of the required roles or permissions
		return permissions.some(
			permission =>
				context.user?.roles.includes(permission) ||
				context.user?.permissions.includes(permission)
		);
	}

	/**
	 * Evaluate a conditional expression
	 * @param condition Condition expression
	 * @param context Component context
	 * @returns Result of the condition
	 */
	private evaluateCondition(condition: string, context: ComponentContext): boolean {
		try {
			// Create a sandboxed evaluation function
			const evalContext = {
				user: context.user,
				routeParams: context.routeParams,
				queryParams: context.queryParams,
				uiState: context.uiState.get,
			};

			// Build a function that has access to the context variables
			const evaluator = new Function(...Object.keys(evalContext), `return ${condition};`);

			// Call the function with the context values
			return Boolean(evaluator(...Object.values(evalContext)));
		} catch (error) {
			console.error(`Error evaluating condition "${condition}":`, error);
			return false;
		}
	}

	/**
	 * Register default component factories
	 */
	private registerDefaults(): void {
		// Register placeholder factories for built-in components
		// These would be replaced with actual implementations in a real application

		// DataTable
		this.register(ComponentType.DataTable, {
			create: (config, context) => {
				return { type: 'DataTable', config, context };
			}
		});

		// Form
		this.register(ComponentType.Form, {
			create: (config, context) => {
				return { type: 'Form', config, context };
			}
		});

		// Card
		this.register(ComponentType.Card, {
			create: (config, context) => {
				return { type: 'Card', config, context };
			}
		});

		// Tabs
		this.register(ComponentType.Tabs, {
			create: (config, context) => {
				return { type: 'Tabs', config, context };
			}
		});

		// Container
		this.register(ComponentType.Container, {
			create: (config, context) => {
				return { type: 'Container', config, context };
			}
		});

		// Text
		this.register(ComponentType.Text, {
			create: (config, context) => {
				return { type: 'Text', config, context };
			}
		});

		// Button
		this.register(ComponentType.Button, {
			create: (config, context) => {
				return { type: 'Button', config, context };
			}
		});

		// Chart
		this.register(ComponentType.Chart, {
			create: (config, context) => {
				return { type: 'Chart', config, context };
			}
		});
	}
}

/**
 * Singleton instance of the component registry
 */
export const componentRegistry = new ComponentRegistry();

/**
 * Create a component context
 * @param options Context options
 * @returns Component context
 */
export function createComponentContext(options: Partial<ComponentContext> = {}): ComponentContext {
	return {
		user: options.user || undefined,
		routeParams: options.routeParams || {},
		queryParams: options.queryParams || {},
		entityManager: options.entityManager || {},
		apiClient: options.apiClient || {},
		events: options.events || {
			emit: () => { },
			on: () => { },
		},
		navigation: options.navigation || {
			navigate: () => { },
			goBack: () => { },
		},
		uiState: options.uiState || {
			get: () => { },
			set: () => { },
		},
		componentRegistry: options.componentRegistry || componentRegistry,
		executeAction: options.executeAction || (async () => { }),
	};
}

/**
 * Register a plugin with multiple components
 * @param plugin Plugin with component factories
 */
export function registerPlugin(plugin: {
	name: string;
	components: Record<string, ComponentFactory>;
}): void {
	for (const [name, factory] of Object.entries(plugin.components)) {
		componentRegistry.registerCustom(name, factory);
	}
}