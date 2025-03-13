/**
 * Development Server
 * Provides a development server with hot reloading
 */

import * as path from 'path';
import * as fs from 'fs';
import express from 'express';
import chalk from 'chalk';
import chokidar from 'chokidar';
import cors from 'cors';
import morgan from 'morgan';
import bodyParser from 'body-parser';
import { Framework } from '../core/framework';
import { ConsoleLogger } from './logger';
import { AdapterFactory, createInMemoryConfig } from '../database/adapter-factory';
import { ConfigLoader } from '../core/config-loader';

/**
 * Development server options
 */
export interface DevServerOptions {
	/** Config file path */
	configPath: string;
	/** Port number */
	port?: number;
	/** Whether to use in-memory database */
	inMemory?: boolean;
	/** Whether to enable debug mode */
	debug?: boolean;
	/** Whether to open browser */
	open?: boolean;
}

/**
 * Development server class
 */
export class DevServer {
	private options: DevServerOptions;
	private logger: ConsoleLogger;
	private configLoader: ConfigLoader;
	private framework: Framework | null = null;
	private watcher: chokidar.FSWatcher | null = null;
	private entitiesDir: string = '';
	private isReloading: boolean = false;

	/**
	 * Constructor
	 * @param options Server options
	 */
	constructor(options: DevServerOptions) {
		this.options = options;
		this.logger = new ConsoleLogger(options.debug);
		this.configLoader = new ConfigLoader(this.logger);
	}

	/**
	 * Start the development server
	 */
	async start(): Promise<void> {
		this.logger.info(chalk.blue('Starting development server...'));

		try {
			// Load initial configuration
			const config = await this.configLoader.loadAppConfig(this.options.configPath);

			// Set entities directory
			this.entitiesDir = path.resolve(path.dirname(this.options.configPath), config.entitiesDir);
			this.logger.info(`Entities directory: ${this.entitiesDir}`);

			// Override port if specified in options
			if (this.options.port) {
				config.port = this.options.port;
			}

			// Use in-memory database if requested
			if (this.options.inMemory) {
				config.database = createInMemoryConfig();
				this.logger.info(chalk.yellow('Using in-memory database'));
			}

			// Register database adapters
			await AdapterFactory.loadAdapters(this.logger);

			// Create framework
			this.framework = new Framework(this.logger);
			await this.framework.initialize(this.options.configPath);

			// Start watching for changes
			this.startWatcher();

			// Start server
			await this.framework.start();

			this.logger.info(chalk.green(`Server is running on http://localhost:${config.port}`));

			// Open browser if requested
			if (this.options.open) {
				this.openBrowser(`http://localhost:${config.port}`);
			}
		} catch (error) {
			this.logger.error(`Failed to start server: ${error}`);
			process.exit(1);
		}
	}

	/**
	 * Start file watcher for hot reloading
	 */
	private startWatcher(): void {
		const configDir = path.dirname(this.options.configPath);

		// Watch for changes in YAML files
		this.watcher = chokidar.watch([
			this.options.configPath,
			path.join(this.entitiesDir, '**/*.yaml'),
			path.join(this.entitiesDir, '**/*.yml')
		], {
			ignored: /(^|[\/\\])\../, // Ignore dotfiles
			persistent: true
		});

		// Handle file changes
		this.watcher.on('change', async (filePath) => {
			try {
				if (this.isReloading) return;
				this.isReloading = true;

				const relativePath = path.relative(process.cwd(), filePath);
				this.logger.info(chalk.yellow(`File changed: ${relativePath}`));

				// Determine what changed
				if (filePath === this.options.configPath) {
					this.logger.info('App configuration changed, restarting server...');
					await this.restartServer();
				} else {
					this.logger.info('Entity configuration changed, reloading...');
					await this.reloadEntities();
				}

				this.isReloading = false;
			} catch (error) {
				this.isReloading = false;
				this.logger.error(`Error during hot reload: ${error}`);
			}
		});

		this.logger.info(chalk.blue('Watching for file changes...'));
	}

	/**
	 * Restart the entire server
	 */
	private async restartServer(): Promise<void> {
		if (!this.framework) return;

		try {
			this.logger.info(chalk.yellow('Stopping server...'));
			await this.framework.stop();

			this.logger.info(chalk.yellow('Restarting server...'));
			this.framework = new Framework(this.logger);
			await this.framework.initialize(this.options.configPath);
			await this.framework.start();

			this.logger.info(chalk.green('Server restarted successfully'));
		} catch (error) {
			this.logger.error(`Failed to restart server: ${error}`);
		}
	}

	/**
	 * Reload entity configurations
	 */
	private async reloadEntities(): Promise<void> {
		if (!this.framework) return;

		try {
			this.logger.info(chalk.yellow('Reloading entity configurations...'));

			// Reload entities (this is a simplification, actual implementation
			// would need to access framework internals to reload only entities)
			await this.restartServer();

			this.logger.info(chalk.green('Entity configurations reloaded'));
		} catch (error) {
			this.logger.error(`Failed to reload entities: ${error}`);
		}
	}

	/**
	 * Open the browser
	 * @param url URL to open
	 */
	private openBrowser(url: string): void {
		const { platform } = process;
		const open = require('open');

		try {
			open(url);
		} catch (error) {
			this.logger.error(`Failed to open browser: ${error}`);
		}
	}

	/**
	 * Stop the development server
	 */
	async stop(): Promise<void> {
		this.logger.info(chalk.blue('Stopping development server...'));

		// Stop file watcher
		if (this.watcher) {
			await this.watcher.close();
		}

		// Stop framework
		if (this.framework) {
			await this.framework.stop();
		}

		this.logger.info(chalk.green('Development server stopped'));
	}
}

/**
 * Create and start a development server
 * @param options Server options
 * @returns Development server instance
 */
export async function startDevServer(options: DevServerOptions): Promise<DevServer> {
	const server = new DevServer(options);
	await server.start();
	return server;
}

// Handle process termination
process.on('SIGINT', async () => {
	console.log(chalk.yellow('\nReceived SIGINT, shutting down...'));
	process.exit(0);
});

process.on('SIGTERM', async () => {
	console.log(chalk.yellow('\nReceived SIGTERM, shutting down...'));
	process.exit(0);
});

// Add the ConsoleLogger class (referenced above)
export class ConsoleLogger {
	private debugEnabled: boolean;

	constructor(debugEnabled: boolean = false) {
		this.debugEnabled = debugEnabled;
	}

	debug(message: string, ...args: any[]): void {
		if (this.debugEnabled) {
			console.debug(chalk.gray(`[DEBUG] ${message}`), ...args);
		}
	}

	info(message: string, ...args: any[]): void {
		console.info(chalk.blue(`[INFO] ${message}`), ...args);
	}

	warn(message: string, ...args: any[]): void {
		console.warn(chalk.yellow(`[WARN] ${message}`), ...args);
	}

	error(message: string, ...args: any[]): void {
		console.error(chalk.red(`[ERROR] ${message}`), ...args);
	}
}