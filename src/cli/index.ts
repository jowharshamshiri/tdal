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
import { registerGenerateCommands } from './generate-command';
import { registerDevServerCommand } from './dev-server';
import { registerScaffoldCommands } from './scaffold-command';
import { PluginManager } from '../plugins/plugin-manager';
import packageJson from '../../package.json';

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

	// Register core commands
	registerGenerateCommands(program, logger);
	registerDevServerCommand(program, logger);
	registerScaffoldCommands(program, logger);

	// Register plugin commands
	await registerPluginCommands(program, logger);

	// Register global options
	program
		.option('-c, --config <path>', 'Path to config file', './app.yaml')
		.option('-d, --debug', 'Enable debug logging', false)
		.option('-s, --silent', 'Disable logging', false);

	// Handle unknown commands
	program.on('command:*', () => {
		console.error(
			chalk.red(`Invalid command: ${program.args.join(' ')}\nSee --help for a list of available commands.`)
		);
		process.exit(1);
	});

	// Parse arguments
	program.parse(process.argv);
}

/**
 * Register plugin commands
 * @param program Command program
 * @param logger Logger instance
 */
async function registerPluginCommands(program: Command, logger: ConsoleLogger) {
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
							} catch (error) {
								logger.error(`Error executing command: ${error}`);
								process.exit(1);
							}
						});
					}
				}
			}
		}
	} catch (error) {
		logger.error(`Error loading plugin commands: ${error}`);
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

// Run CLI
initCLI().catch(handleInitError);

/**
 * Export for testing purposes
 */
export { program };