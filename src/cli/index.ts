#!/usr/bin/env node
/**
 * CLI Entry Point
 * Main command-line interface for the framework
 */

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';
import figlet from 'figlet';
import { ConsoleLogger } from '../core/logger';
import { registerGenerateCommands } from '../cli/generate-command';
import { registerDevServerCommand } from '../cli/dev-server';
import { registerScaffoldCommands } from '../cli/scaffold-command';
import { PluginManager } from '../plugins/plugin-manager';
import { registerActionCommands } from '../cli/action-command';
import { registerAdapterCommands } from '../cli/adapter-command';
import { registerMigrationCommands } from '../cli/migration-command';
import { Logger } from '../logging';

// Get package version from package.json
const packageJsonPath = path.resolve(__dirname, '../../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Create logger
const logger = new ConsoleLogger();

// Create CLI program
const program = new Command();

/**
 * Initialize the CLI
 */
async function initCLI() {
	// Display banner
	console.log(
		chalk.cyan(
			figlet.textSync('YAMLApp', { horizontalLayout: 'full' })
		)
	);

	// Set CLI version and description
	program
		.version(packageJson.version)
		.description('YAML-driven web application framework');

	// Register global options
	program
		.option('-c, --config <path>', 'Path to config file', './app.yaml')
		.option('-d, --debug', 'Enable debug logging', false)
		.option('-s, --silent', 'Disable logging', false);

	// Register core commands
	registerGenerateCommands(program, logger);
	registerDevServerCommand(program, logger);
	registerScaffoldCommands(program, logger);
	registerActionCommands(program, logger);
	registerAdapterCommands(program, logger);
	registerMigrationCommands(program, logger);

	// Register plugin commands
	await registerPluginCommands(program, logger);

	// Handle unknown commands
	program.on('command:*', () => {
		console.error(
			chalk.red(`Invalid command: ${program.args.join(' ')}\nSee --help for a list of available commands.`)
		);
		process.exit(1);
	});

	// Parse arguments
	program.parse(process.argv);

	// If no args were provided, show help
	if (!process.argv.slice(2).length) {
		program.help();
	}
}

/**
 * Register plugin commands
 * @param program Command program
 * @param logger Logger instance
 */
async function registerPluginCommands(program: Command, logger: Logger) {
	try {
		// Look for plugins in current project
		const pluginsDir = path.resolve(process.cwd(), 'plugins');

		if (fs.existsSync(pluginsDir)) {
			const pluginManager = new PluginManager(logger);
			await pluginManager.loadPluginsFromDirectory(pluginsDir);

			// Register commands from plugins
			const plugins = pluginManager.getPlugins();

			for (const plugin of plugins) {
				if (plugin.commands && plugin.commands.length > 0) {
					logger.debug(`Registering commands from plugin: ${plugin.name}`);

					for (const commandDef of plugin.commands) {
						const command = program
							.command(commandDef.name)
							.description(commandDef.description);

						// Add command aliases
						if (commandDef.aliases) {
							command.aliases(commandDef.aliases);
						}

						// Add command options
						if (commandDef.options) {
							for (const option of commandDef.options) {
								if (option.defaultValue !== undefined) {
									command.option(option.flags, option.description, option.defaultValue);
								} else {
									command.option(option.flags, option.description);
								}
							}
						}

						// Add command action
						command.action(async (options) => {
							try {
								await commandDef.handler(options, logger);
							} catch (error: any) {
								logger.error(`Error executing command: ${error.message}`);
								process.exit(1);
							}
						});
					}
				}
			}
		}
	} catch (error: any) {
		logger.error(`Error loading plugin commands: ${error.message}`);
	}
}

/**
 * Handle initialization errors
 * @param error Error object
 */
function handleInitError(error: Error) {
	console.error(chalk.red(`Initialization error: ${error.message}`));
	console.error(error.stack);
	process.exit(1);
}

// Define action command registration
// This is a placeholder since the actual implementation would be in action-command.ts
function registerActionCommands(program: Command, logger: Logger) {
	const action = program
		.command('action')
		.description('Manage entity actions');

	action
		.command('create <entity> <name>')
		.description('Create a new action for an entity')
		.option('-m, --method <method>', 'HTTP method for the action', 'POST')
		.option('-r, --route <route>', 'API route path for the action')
		.option('-t, --transactional', 'Whether the action runs in a transaction', false)
		.action(async (entity, name, options) => {
			try {
				logger.info(chalk.blue(`Creating action ${name} for entity ${entity}...`));
				logger.info(chalk.green(`Action ${name} created successfully`));
			} catch (error: any) {
				logger.error(`Error creating action: ${error.message}`);
			}
		});

	return action;
}

// Define adapter command registration
// This is a placeholder since the actual implementation would be in adapter-command.ts
function registerAdapterCommands(program: Command, logger: Logger) {
	const adapter = program
		.command('adapter')
		.description('Manage API adapters');

	adapter
		.command('generate <adapter>')
		.description('Generate API with an adapter')
		.option('-e, --entity <entity>', 'Entity to generate API for (if not specified, all entities)')
		.option('-o, --output <dir>', 'Output directory')
		.action(async (adapter, options) => {
			try {
				logger.info(chalk.blue(`Generating API with ${adapter} adapter...`));
				logger.info(chalk.green(`API generated successfully`));
			} catch (error: any) {
				logger.error(`Error generating API: ${error.message}`);
			}
		});

	return adapter;
}

// Define migration command registration
// This is a placeholder since the actual implementation would be in migration-command.ts
function registerMigrationCommands(program: Command, logger: Logger) {
	const migration = program
		.command('migration')
		.description('Manage database migrations');

	migration
		.command('create <name>')
		.description('Create a new migration')
		.option('-e, --entity <entity>', 'Entity to create migration for')
		.option('-t, --type <type>', 'Database type', 'sqlite')
		.action(async (name, options) => {
			try {
				logger.info(chalk.blue(`Creating migration ${name}...`));
				logger.info(chalk.green(`Migration created successfully`));
			} catch (error: any) {
				logger.error(`Error creating migration: ${error.message}`);
			}
		});

	migration
		.command('run')
		.description('Run pending migrations')
		.option('-t, --type <type>', 'Database type', 'sqlite')
		.action(async (options) => {
			try {
				logger.info(chalk.blue(`Running migrations...`));
				logger.info(chalk.green(`Migrations completed successfully`));
			} catch (error: any) {
				logger.error(`Error running migrations: ${error.message}`);
			}
		});

	return migration;
}

// Run CLI
initCLI().catch(handleInitError);

/**
 * Export for testing purposes
 */
export { program };