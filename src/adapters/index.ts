/**
 * Adapters System
 * Central registry for platform adapters
 */

import { Logger } from '../core/types';
import { AdapterFactory, PlatformAdapter } from './types';
import { createNetlifyAdapter } from './netlify';

/**
 * Adapter registry 
 * Manages available platform adapters
 */
export class AdapterRegistry {
	/**
	 * Registered adapters
	 */
	private adapters = new Map<string, AdapterFactory>();

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
		this.registerBuiltInAdapters();
	}

	/**
	 * Register built-in adapters
	 */
	private registerBuiltInAdapters(): void {
		// Register Netlify adapter
		this.register('netlify', createNetlifyAdapter);
		this.logger.debug('Registered built-in adapters');
	}

	/**
	 * Register a new adapter
	 * @param name Adapter name
	 * @param factory Adapter factory function
	 */
	register(name: string, factory: AdapterFactory): void {
		if (this.adapters.has(name)) {
			this.logger.warn(`Adapter ${name} already registered, overwriting`);
		}

		this.adapters.set(name, factory);
		this.logger.debug(`Registered adapter: ${name}`);
	}

	/**
	 * Get an adapter by name
	 * @param name Adapter name
	 * @param options Adapter options
	 * @returns Platform adapter instance
	 */
	getAdapter(name: string, options?: Record<string, any>): PlatformAdapter {
		const factory = this.adapters.get(name);

		if (!factory) {
			throw new Error(`Adapter not found: ${name}`);
		}

		return factory(this.logger, options);
	}

	/**
	 * Check if an adapter exists
	 * @param name Adapter name
	 * @returns Whether the adapter exists
	 */
	hasAdapter(name: string): boolean {
		return this.adapters.has(name);
	}

	/**
	 * Get all registered adapter names
	 * @returns Array of adapter names
	 */
	getAdapterNames(): string[] {
		return Array.from(this.adapters.keys());
	}
}

/**
 * Create adapter registry
 * @param logger Logger instance
 * @returns Adapter registry instance
 */
export function createAdapterRegistry(logger: Logger): AdapterRegistry {
	return new AdapterRegistry(logger);
}

// Export adapter types
export * from './types';

// Export platform adapters
export * from './netlify';