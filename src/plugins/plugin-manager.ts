/**
 * Plugin Manager
 * Handles discovery, loading, and lifecycle management of plugins
 */

import * as fs from 'fs';
import * as path from 'path';
import { AppContext } from '../core/types';
import { PluginConfig, PluginManifest } from './plugin-schema';
import { ExtensionRegistry, ExtensionPoint } from './extension-points';
import { Logger } from '@/logging';

/**
 * Plugin instance interface
 */
export interface Plugin {
	/**
	 * Plugin name
	 */
	name: string;

	/**
	 * Plugin version
	 */
	version: string;

	/**
	 * Plugin description
	 */
	description?: string;

	/**
	 * Plugin initialization function
	 * @param context Application context
	 * @param config Plugin configuration
	 * @returns Promise that resolves when initialization is complete
	 */
	initialize(context: AppContext, config: any): Promise<void>;

	/**
	 * Plugin cleanup function (optional)
	 * Called when the application is shutting down
	 */
	cleanup?(): Promise<void>;

	/**
	 * Plugin configuration validation (optional)
	 * @param config Plugin configuration
	 * @returns True if configuration is valid
	 */
	validateConfig?(config: any): boolean;
}

/**
 * Plugin dependency information
 */
interface PluginDependency {
	/**
	 * Plugin name
	 */
	name: string;

	/**
	 * Minimum version
	 */
	version?: string;
}

/**
 * Plugin loader interface
 */
interface PluginLoader {
	/**
	 * Load plugins from a directory or package
	 * @param source Plugin source (directory or package name)
	 * @param context Application context
	 * @returns Loaded plugins
	 */
	loadPlugins(source: string, context: AppContext): Promise<Plugin[]>;
}

/**
 * Plugin load result
 */
interface PluginLoadResult {
	/**
	 * Plugin instance
	 */
	plugin: Plugin;

	/**
	 * Plugin configuration
	 */
	config: any;

	/**
	 * Plugin dependencies
	 */
	dependencies: PluginDependency[];

	/**
	 * Plugin extension registrations
	 */
	extensions: any[];
}

/**
 * Plugin manager class
 * Manages plugin discovery, loading, and lifecycle
 */
export class PluginManager {
	/**
	 * Loaded plugins
	 */
	private plugins: Map<string, PluginLoadResult> = new Map();

	/**
	 * Extension registry
	 */
	private extensionRegistry: ExtensionRegistry;

	/**
	 * Logger instance
	 */
	private logger: Logger;

	/**
	 * Application context
	 */
	private appContext: AppContext;

	/**
	 * Plugin loaders
	 */
	private loaders: Map<string, PluginLoader> = new Map();

	/**
	 * Constructor
	 * @param context Application context
	 * @param logger Logger instance
	 */
	constructor(context: AppContext, logger: Logger) {
		this.appContext = context;
		this.logger = logger;
		this.extensionRegistry = new ExtensionRegistry(logger);

		// Register built-in loaders
		this.registerLoader('npm', new NpmPluginLoader(logger));
		this.registerLoader('directory', new DirectoryPluginLoader(logger));
	}

	/**
	 * Initialize the plugin manager
	 * @param pluginConfigs Plugin configurations
	 */
	async initialize(pluginConfigs: PluginConfig[]): Promise<void> {
		this.logger.info('Initializing plugin manager');

		try {
			// Load all plugins
			for (const config of pluginConfigs) {
				await this.loadPlugin(config);
			}

			// Initialize plugins in dependency order
			await this.initializePlugins();

			this.logger.info(`Plugin manager initialized with ${this.plugins.size} plugins`);
		} catch (error: any) {
			this.logger.error(`Failed to initialize plugin manager: ${error}`);
			throw new Error(`Failed to initialize plugin manager: ${error}`);
		}
	}

	/**
	 * Register a plugin loader
	 * @param type Loader type
	 * @param loader Plugin loader
	 */
	registerLoader(type: string, loader: PluginLoader): void {
		this.loaders.set(type, loader);
	}

	/**
	 * Load a plugin
	 * @param config Plugin configuration
	 */
	async loadPlugin(config: PluginConfig): Promise<void> {
		try {
			const { name, enabled, config: pluginConfig, options } = config;
			const source = options?.path || name; // Use path from options or fallback to name
			const type = options?.npm ? 'npm' : 'directory'; // Determine type from options

			// Skip if already loaded
			if (this.plugins.has(name)) {
				this.logger.warn(`Plugin ${name} is already loaded`);
				return;
			}

			// Get the loader for this plugin type
			const loader = this.loaders.get(type);
			if (!loader) {
				throw new Error(`No loader found for plugin type ${type}`);
			}

			// Load the plugin
			const loadedPlugins = await loader.loadPlugins(source, this.appContext);

			if (loadedPlugins.length === 0) {
				throw new Error(`No plugins found in ${source}`);
			}

			// Find the plugin by name if multiple were loaded
			const plugin = loadedPlugins.find(p => p.name === name) || loadedPlugins[0];

			// Validate the plugin configuration if the plugin provides a validation function
			if (plugin.validateConfig && !plugin.validateConfig(pluginConfig)) {
				throw new Error(`Invalid configuration for plugin ${name}`);
			}

			// Get plugin metadata
			const manifest = this.getPluginManifest(plugin);

			// Process plugin dependencies
			const dependencies = this.processPluginDependencies(manifest);

			// Check for missing dependencies
			const missingDeps = dependencies.filter(dep => !this.plugins.has(dep.name));
			if (missingDeps.length > 0) {
				this.logger.warn(`Plugin ${name} has missing dependencies: ${missingDeps.map(d => d.name).join(', ')}`);
			}

			// Record the plugin
			this.plugins.set(name, {
				plugin,
				config: pluginConfig,
				dependencies,
				extensions: []
			});

			this.logger.info(`Loaded plugin ${name} v${plugin.version}`);
		} catch (error: any) {
			this.logger.error(`Failed to load plugin ${config.name}: ${error}`);
			throw new Error(`Failed to load plugin ${config.name}: ${error}`);
		}
	}

	/**
	 * Initialize all loaded plugins in dependency order
	 */
	private async initializePlugins(): Promise<void> {
		// Get dependency graph
		const graph = this.buildDependencyGraph();

		// Get initialization order (topological sort)
		const order = this.getInitializationOrder(graph);

		// Initialize plugins in order
		for (const pluginName of order) {
			const pluginResult = this.plugins.get(pluginName);
			if (!pluginResult) continue;

			try {
				// Initialize the plugin
				await pluginResult.plugin.initialize(this.appContext, pluginResult.config);
				this.logger.info(`Initialized plugin ${pluginName}`);
			} catch (error: any) {
				this.logger.error(`Failed to initialize plugin ${pluginName}: ${error}`);
				throw new Error(`Failed to initialize plugin ${pluginName}: ${error}`);
			}
		}
	}

	/**
	 * Register an extension for a plugin
	 * @param pluginName Plugin name
	 * @param point Extension point
	 * @param extension Extension implementation
	 */
	registerExtension(pluginName: string, point: ExtensionPoint, extension: any): void {
		if (!this.plugins.has(pluginName)) {
			throw new Error(`Plugin ${pluginName} is not loaded`);
		}

		// Register the extension
		this.extensionRegistry.registerExtension(pluginName, point, extension);

		// Add to the plugin's extensions
		const pluginResult = this.plugins.get(pluginName)!;
		pluginResult.extensions.push({ point, extension });

		this.logger.debug(`Plugin ${pluginName} registered extension for ${point}`);
	}

	/**
	 * Get all extensions for an extension point
	 * @param point Extension point
	 * @returns Extensions for the point
	 */
	getExtensions(point: ExtensionPoint): any[] {
		return this.extensionRegistry.getExtensions(point);
	}

	/**
	 * Get a plugin by name
	 * @param name Plugin name
	 * @returns Plugin instance
	 */
	getPlugin(name: string): Plugin | undefined {
		const result = this.plugins.get(name);
		return result?.plugin;
	}

	/**
	 * Check if a plugin is loaded
	 * @param name Plugin name
	 * @returns Whether the plugin is loaded
	 */
	hasPlugin(name: string): boolean {
		return this.plugins.has(name);
	}

	/**
	 * Get names of all loaded plugins
	 * @returns Plugin names
	 */
	getPluginNames(): string[] {
		return Array.from(this.plugins.keys());
	}

	/**
	 * Clean up all plugins
	 */
	async cleanup(): Promise<void> {
		// Get reverse initialization order
		const graph = this.buildDependencyGraph();
		const order = this.getInitializationOrder(graph).reverse();

		// Cleanup plugins in reverse order
		for (const pluginName of order) {
			const pluginResult = this.plugins.get(pluginName);
			if (!pluginResult) continue;

			if (pluginResult.plugin.cleanup) {
				try {
					await pluginResult.plugin.cleanup();
					this.logger.info(`Cleaned up plugin ${pluginName}`);
				} catch (error: any) {
					this.logger.error(`Failed to clean up plugin ${pluginName}: ${error}`);
				}
			}
		}

		// Clear all plugins
		this.plugins.clear();

		// Clear extension registry
		this.extensionRegistry.clear();

		this.logger.info('Plugin manager cleaned up');
	}

	/**
	 * Get plugin manifest
	 * @param plugin Plugin instance
	 * @returns Plugin manifest
	 */
	private getPluginManifest(plugin: Plugin): PluginManifest {
		// Basic manifest from plugin instance
		return {
			name: plugin.name,
			version: plugin.version,
			description: plugin.description || '',
			dependencies: []
		};
	}

	/**
	 * Process plugin dependencies
	 * @param manifest Plugin manifest
	 * @returns Plugin dependencies
	 */
	private processPluginDependencies(manifest: PluginManifest): PluginDependency[] {
		return manifest.dependencies || [];
	}

	/**
	 * Build dependency graph for plugins
	 * @returns Dependency graph
	 */
	private buildDependencyGraph(): Map<string, string[]> {
		const graph = new Map<string, string[]>();

		// Build the graph
		for (const [name, pluginResult] of this.plugins.entries()) {
			graph.set(name, pluginResult.dependencies.map(dep => dep.name));
		}

		return graph;
	}

	/**
	 * Get initialization order using topological sort
	 * @param graph Dependency graph
	 * @returns Initialization order
	 */
	private getInitializationOrder(graph: Map<string, string[]>): string[] {
		const result: string[] = [];
		const visited = new Set<string>();
		const visiting = new Set<string>();

		// Helper function for topological sort
		const visit = (node: string): void => {
			if (visited.has(node)) return;
			if (visiting.has(node)) {
				throw new Error(`Circular dependency detected in plugins: ${node}`);
			}

			visiting.add(node);

			// Visit dependencies
			const dependencies = graph.get(node) || [];
			for (const dep of dependencies) {
				if (graph.has(dep)) {
					visit(dep);
				}
			}

			visiting.delete(node);
			visited.add(node);
			result.push(node);
		};

		// Visit all nodes
		for (const node of graph.keys()) {
			if (!visited.has(node)) {
				visit(node);
			}
		}

		return result;
	}
}

/**
 * NPM plugin loader
 * Loads plugins from npm packages
 */
class NpmPluginLoader implements PluginLoader {
	/**
	 * Logger instance
	 */
	private logger: Logger;

	/**
	 * Constructor
	 * @param logger Logger instance
	 */
	constructor(logger: Logger) {
		this.logger = logger;
	}

	/**
	 * Load plugins from an npm package
	 * @param packageName Package name
	 * @param context Application context
	 * @returns Loaded plugins
	 */
	async loadPlugins(packageName: string, context: AppContext): Promise<Plugin[]> {
		try {
			// Try to require the package
			const pluginModule = require(packageName);

			// If the module exports a plugin directly
			if (this.isPluginModule(pluginModule)) {
				return [pluginModule];
			}

			// If the module exports multiple plugins
			if (pluginModule.plugins && Array.isArray(pluginModule.plugins)) {
				return pluginModule.plugins.filter(this.isPluginModule);
			}

			// If the module exports a factory function
			if (typeof pluginModule.createPlugin === 'function') {
				const plugin = pluginModule.createPlugin(context);
				if (this.isPluginModule(plugin)) {
					return [plugin];
				}
			}

			this.logger.warn(`Package ${packageName} does not export valid plugins`);
			return [];
		} catch (error: any) {
			this.logger.error(`Failed to load plugins from package ${packageName}: ${error}`);
			throw new Error(`Failed to load plugins from package ${packageName}: ${error}`);
		}
	}

	/**
	 * Check if a module is a valid plugin
	 * @param module Module to check
	 * @returns Whether the module is a valid plugin
	 */
	private isPluginModule(module: any): boolean {
		return (
			module &&
			typeof module === 'object' &&
			typeof module.name === 'string' &&
			typeof module.version === 'string' &&
			typeof module.initialize === 'function'
		);
	}
}

/**
 * Directory plugin loader
 * Loads plugins from a directory
 */
class DirectoryPluginLoader implements PluginLoader {
	/**
	 * Logger instance
	 */
	private logger: Logger;

	/**
	 * Constructor
	 * @param logger Logger instance
	 */
	constructor(logger: Logger) {
		this.logger = logger;
	}

	/**
	 * Load plugins from a directory
	 * @param directory Directory path
	 * @param context Application context
	 * @returns Loaded plugins
	 */
	async loadPlugins(directory: string, context: AppContext): Promise<Plugin[]> {
		try {
			// Ensure directory exists
			if (!fs.existsSync(directory)) {
				throw new Error(`Directory ${directory} does not exist`);
			}

			// Get all .js files in the directory
			const files = fs.readdirSync(directory)
				.filter(file => file.endsWith('.js') || file.endsWith('.cjs'));

			const plugins: Plugin[] = [];

			// Load each file
			for (const file of files) {
				const filePath = path.join(directory, file);

				try {
					// Try to require the file
					const pluginModule = require(filePath);

					// If the module exports a plugin directly
					if (this.isPluginModule(pluginModule)) {
						plugins.push(pluginModule);
						continue;
					}

					// If the module exports multiple plugins
					if (pluginModule.plugins && Array.isArray(pluginModule.plugins)) {
						plugins.push(...pluginModule.plugins.filter(this.isPluginModule));
						continue;
					}

					// If the module exports a factory function
					if (typeof pluginModule.createPlugin === 'function') {
						const plugin = pluginModule.createPlugin(context);
						if (this.isPluginModule(plugin)) {
							plugins.push(plugin);
							continue;
						}
					}

					this.logger.warn(`File ${file} does not export valid plugins`);
				} catch (error: any) {
					this.logger.error(`Failed to load plugin from file ${file}: ${error}`);
				}
			}

			return plugins;
		} catch (error: any) {
			this.logger.error(`Failed to load plugins from directory ${directory}: ${error}`);
			throw new Error(`Failed to load plugins from directory ${directory}: ${error}`);
		}
	}

	/**
	 * Check if a module is a valid plugin
	 * @param module Module to check
	 * @returns Whether the module is a valid plugin
	 */
	private isPluginModule(module: any): boolean {
		return (
			module &&
			typeof module === 'object' &&
			typeof module.name === 'string' &&
			typeof module.version === 'string' &&
			typeof module.initialize === 'function'
		);
	}
}