/**
 * Netlify Adapter
 * Generates serverless function handlers for Netlify
 */

import { Logger } from '../../core/types';
import { PlatformAdapter, HandlerGenerationOptions, GenerationResult } from '../types';
import { EntityConfig } from '../../entity/entity-config';
import { ActionRegistry } from '../../actions/action-registry';
import { AppContext } from '../../core/app-context';
import { NetlifyHandlerGenerator } from './handler-generator';
import { NetlifyAuthAdapter } from './auth-adapter';
import { NetlifyContextAdapter } from './context-adapter';

/**
 * Netlify adapter implementation
 */
export class NetlifyAdapter implements PlatformAdapter {
	/**
	 * Adapter name
	 */
	readonly name = 'netlify';

	/**
	 * Adapter description
	 */
	readonly description = 'Generates serverless function handlers for Netlify';

	/**
	 * Logger instance
	 */
	private logger: Logger;

	/**
	 * Handler generator
	 */
	private handlerGenerator: NetlifyHandlerGenerator;

	/**
	 * Authentication adapter
	 */
	private authAdapter: NetlifyAuthAdapter;

	/**
	 * Context adapter
	 */
	private contextAdapter: NetlifyContextAdapter;

	/**
	 * Constructor
	 * @param logger Logger instance
	 * @param options Adapter options
	 */
	constructor(logger: Logger, options?: Record<string, any>) {
		this.logger = logger;
		this.handlerGenerator = new NetlifyHandlerGenerator(logger, options);
		this.authAdapter = new NetlifyAuthAdapter(logger);
		this.contextAdapter = new NetlifyContextAdapter(logger);
	}

	/**
	 * Initialize the adapter
	 * @param options Initialization options
	 */
	async initialize(options?: Record<string, any>): Promise<void> {
		this.logger.info('Initializing Netlify adapter');
		// Initialize components as needed
		await this.handlerGenerator.initialize(options);
	}

	/**
	 * Generate API handlers for all entities
	 * @param entities Map of entity configurations
	 * @param actionRegistry Action registry
	 * @param appContext Application context
	 * @param options Generation options
	 * @returns Generation result
	 */
	async generateHandlers(
		entities: Map<string, EntityConfig>,
		actionRegistry: ActionRegistry,
		appContext: AppContext,
		options?: HandlerGenerationOptions
	): Promise<GenerationResult> {
		try {
			this.logger.info(`Generating Netlify handlers for ${entities.size} entities`);

			const result: GenerationResult = {
				files: [],
				success: true
			};

			// Generate handlers for each entity
			for (const [entityName, entityConfig] of entities.entries()) {
				// Skip entities that aren't exposed via API
				if (!entityConfig.api || !entityConfig.api.exposed) {
					continue;
				}

				const entityResult = await this.generateEntityHandler(
					entityConfig,
					actionRegistry,
					appContext,
					options
				);

				if (!entityResult.success) {
					this.logger.error(`Failed to generate handler for entity ${entityName}: ${entityResult.error}`);
					continue;
				}

				result.files.push(...entityResult.files);
			}

			// Generate shared utilities and types
			const utilsResult = await this.handlerGenerator.generateUtilities(options);
			result.files.push(...utilsResult.files);

			this.logger.info(`Generated ${result.files.length} files for Netlify`);
			return result;
		} catch (error: any) {
			this.logger.error(`Error generating Netlify handlers: ${error}`);
			return {
				files: [],
				success: false,
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}

	/**
	 * Generate API handler for a specific entity
	 * @param entity Entity configuration
	 * @param actionRegistry Action registry
	 * @param appContext Application context
	 * @param options Generation options
	 * @returns Generation result
	 */
	async generateEntityHandler(
		entity: EntityConfig,
		actionRegistry: ActionRegistry,
		appContext: AppContext,
		options?: HandlerGenerationOptions
	): Promise<GenerationResult> {
		try {
			this.logger.debug(`Generating Netlify handler for entity ${entity.entity}`);

			return await this.handlerGenerator.generateEntityHandler(
				entity,
				actionRegistry,
				appContext,
				options
			);
		} catch (error: any) {
			this.logger.error(`Error generating Netlify handler for entity ${entity.entity}: ${error}`);
			return {
				files: [],
				success: false,
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}

	/**
	 * Get auth adapter
	 * @returns Authentication adapter
	 */
	getAuthAdapter(): NetlifyAuthAdapter {
		return this.authAdapter;
	}

	/**
	 * Get context adapter
	 * @returns Context adapter
	 */
	getContextAdapter(): NetlifyContextAdapter {
		return this.contextAdapter;
	}
}

/**
 * Create Netlify adapter
 * @param logger Logger instance
 * @param options Adapter options
 * @returns Netlify adapter instance
 */
export function createNetlifyAdapter(
	logger: Logger,
	options?: Record<string, any>
): PlatformAdapter {
	return new NetlifyAdapter(logger, options);
}

// Export Netlify-specific components
export * from './handler-generator';
export * from './auth-adapter';
export * from './context-adapter';
export * from './templates';