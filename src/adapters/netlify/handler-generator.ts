/**
 * Netlify Handler Generator
 * Generates serverless function handlers for Netlify
 */

import * as path from 'path';
import * as fs from 'fs';
import { EntityConfig, EntityAction } from '../../entity/entity-config';
import { Logger } from '../../logging';
import { HandlerGenerationOptions, GenerationResult, GeneratedFile } from '../types';
import { ActionRegistry } from '../../actions/action-registry';
import { AppContext } from '../../core/app-context';
import {
	generateHandlerTemplate,
	generateIndexTemplate,
	generateTypeDefinitionsTemplate,
	generateAuthUtilTemplate
} from './templates';

/**
 * Netlify handler generator
 * Generates handlers for Netlify Functions
 */
export class NetlifyHandlerGenerator {
	/**
	 * Logger instance
	 */
	private logger: Logger;

	/**
	 * Default options
	 */
	private defaultOptions: HandlerGenerationOptions;

	/**
	 * Constructor
	 * @param logger Logger instance
	 * @param options Default options
	 */
	constructor(logger: Logger, options?: Record<string, any>) {
		this.logger = logger;
		this.defaultOptions = {
			outputDir: './netlify/functions',
			typescript: true,
			...options
		};
	}

	/**
	 * Initialize the generator
	 * @param options Initialization options
	 */
	async initialize(options?: Record<string, any>): Promise<void> {
		// Merge options
		this.defaultOptions = {
			...this.defaultOptions,
			...options
		};

		// Create output directory if it doesn't exist
		const outputDir = this.defaultOptions.outputDir || './netlify/functions';
		if (!fs.existsSync(outputDir)) {
			fs.mkdirSync(outputDir, { recursive: true });
		}
	}

	/**
	 * Generate entity handler
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
		const mergedOptions = { ...this.defaultOptions, ...options };
		const { outputDir, typescript } = mergedOptions;

		// Skip entities not exposed via API
		if (!entity.api || !entity.api.exposed) {
			return { files: [], success: true };
		}

		const entityName = entity.entity;
		const apiBasePath = entity.api.basePath || `/${entityName.toLowerCase()}`;

		try {
			// Get entity actions
			const apiActions = actionRegistry.getApiActions(entityName);

			// Create entity directory
			const entityDirName = entityName.toLowerCase();
			const entityDirPath = path.join(outputDir!, entityDirName);

			if (!fs.existsSync(entityDirPath)) {
				fs.mkdirSync(entityDirPath, { recursive: true });
			}

			// Generate handler file
			const fileExtension = typescript ? 'ts' : 'js';
			const handlerFileName = `index.${fileExtension}`;
			const handlerFilePath = path.join(entityDirName, handlerFileName);

			// Generate handler content
			const handlerContent = generateHandlerTemplate({
				entity,
				actions: apiActions,
				typescript: !!typescript
			});

			return {
				files: [
					{
						path: handlerFilePath,
						content: handlerContent,
						entity: entityName
					}
				],
				success: true
			};
		} catch (error: any) {
			this.logger.error(`Error generating handler for ${entityName}: ${error}`);
			return {
				files: [],
				success: false,
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}

	/**
	 * Generate shared utilities and types
	 * @param options Generation options
	 * @returns Generation result
	 */
	async generateUtilities(options?: HandlerGenerationOptions): Promise<GenerationResult> {
		const mergedOptions = { ...this.defaultOptions, ...options };
		const { outputDir, typescript } = mergedOptions;

		const fileExtension = typescript ? 'ts' : 'js';
		const utilsFiles: GeneratedFile[] = [];

		try {
			// Generate index file
			const indexContent = generateIndexTemplate({ typescript: !!typescript });
			utilsFiles.push({
				path: `index.${fileExtension}`,
				content: indexContent
			});

			// Generate auth utils
			const authContent = generateAuthUtilTemplate({ typescript: !!typescript });
			utilsFiles.push({
				path: `utils/auth-middleware.${fileExtension}`,
				content: authContent
			});

			// Generate type definitions if using TypeScript
			if (typescript) {
				const typesContent = generateTypeDefinitionsTemplate();
				utilsFiles.push({
					path: 'types/index.ts',
					content: typesContent
				});
			}

			// Create directories if they don't exist
			const utilsDir = path.join(outputDir!, 'utils');
			const typesDir = path.join(outputDir!, 'types');

			if (!fs.existsSync(utilsDir)) {
				fs.mkdirSync(utilsDir, { recursive: true });
			}

			if (typescript && !fs.existsSync(typesDir)) {
				fs.mkdirSync(typesDir, { recursive: true });
			}

			return {
				files: utilsFiles,
				success: true
			};
		} catch (error: any) {
			this.logger.error(`Error generating utilities: ${error}`);
			return {
				files: [],
				success: false,
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}

	/**
	 * Write generated files to disk
	 * @param files Generated files
	 * @param baseDir Base output directory
	 * @returns Whether all files were written successfully
	 */
	async writeFiles(files: GeneratedFile[], baseDir?: string): Promise<boolean> {
		const outputDir = baseDir || this.defaultOptions.outputDir;

		if (!outputDir) {
			throw new Error('Output directory not specified');
		}

		try {
			// Ensure output directory exists
			if (!fs.existsSync(outputDir)) {
				fs.mkdirSync(outputDir, { recursive: true });
			}

			// Write each file
			for (const file of files) {
				const filePath = path.join(outputDir, file.path);

				// Ensure directory exists
				const dirPath = path.dirname(filePath);
				if (!fs.existsSync(dirPath)) {
					fs.mkdirSync(dirPath, { recursive: true });
				}

				// Write file
				fs.writeFileSync(filePath, file.content, 'utf8');
				this.logger.debug(`Generated file: ${filePath}`);
			}

			return true;
		} catch (error: any) {
			this.logger.error(`Error writing files: ${error}`);
			return false;
		}
	}
}