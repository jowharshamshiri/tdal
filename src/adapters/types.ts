/**
 * Adapter Types
 * Type definitions for platform adapters
 */

import { EntityConfig } from '../entity/entity-config';
import { ActionRegistry } from '../actions/action-registry';
import { AppContext } from '../core/app-context';
import { Logger } from '../core/types';

/**
 * Platform adapter interface
 * Defines the core functionality that all platform adapters must implement
 */
export interface PlatformAdapter {
	/**
	 * Adapter name
	 */
	name: string;

	/**
	 * Adapter description
	 */
	description: string;

	/**
	 * Generate API handlers for all entities
	 */
	generateHandlers(
		entities: Map<string, EntityConfig>,
		actionRegistry: ActionRegistry,
		appContext: AppContext
	): Promise<GenerationResult>;

	/**
	 * Generate API handler for a specific entity
	 */
	generateEntityHandler(
		entity: EntityConfig,
		actionRegistry: ActionRegistry,
		appContext: AppContext
	): Promise<GenerationResult>;

	/**
	 * Initialize the adapter
	 */
	initialize(options?: Record<string, any>): Promise<void>;
}

/**
 * Handler generation options
 */
export interface HandlerGenerationOptions {
	/**
	 * Output directory for generated files
	 */
	outputDir?: string;

	/**
	 * Whether to generate TypeScript (.ts) or JavaScript (.js) files
	 */
	typescript?: boolean;

	/**
	 * Entity name to generate handlers for (if not specified, generate for all entities)
	 */
	entityName?: string;

	/**
	 * Custom template directory
	 */
	templateDir?: string;

	/**
	 * Additional options specific to each adapter
	 */
	[key: string]: any;
}

/**
 * Handler generation result
 */
export interface GenerationResult {
	/**
	 * Generated files with their content
	 */
	files: GeneratedFile[];

	/**
	 * Status of the generation
	 */
	success: boolean;

	/**
	 * Error message if generation failed
	 */
	error?: string;
}

/**
 * Generated file information
 */
export interface GeneratedFile {
	/**
	 * File path (relative to output directory)
	 */
	path: string;

	/**
	 * File content
	 */
	content: string;

	/**
	 * Entity associated with this file (if applicable)
	 */
	entity?: string;
}

/**
 * Authentication adapter interface
 */
export interface AuthAdapter {
	/**
	 * Adapt authentication to the platform
	 */
	adaptAuthentication(
		authConfig: any,
		options?: Record<string, any>
	): string;

	/**
	 * Generate verification code
	 */
	generateVerification(
		options?: Record<string, any>
	): string;
}

/**
 * Context adapter interface
 */
export interface ContextAdapter {
	/**
	 * Adapt request context to platform
	 */
	adaptRequestContext(
		options?: Record<string, any>
	): string;

	/**
	 * Adapt response context to platform
	 */
	adaptResponseContext(
		options?: Record<string, any>
	): string;
}

/**
 * Adapter factory function type
 */
export type AdapterFactory = (
	logger: Logger,
	options?: Record<string, any>
) => PlatformAdapter;