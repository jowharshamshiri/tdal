// test-setup.ts
import { Framework } from "../src/core/framework";
import { DatabaseContext } from "../src/database/core/database-context";
import * as path from "path";
import * as fs from "fs";

/**
 * Test framework instance
 */
let testFramework: Framework | null = null;

/**
 * Initialize the test environment
 * @param configPath Path to the configuration file
 * @returns Initialized framework instance
 */
export async function setupTestEnvironment(configPath: string = './tests/test.yaml'): Promise<Framework> {
	// Check if test framework already exists
	if (testFramework) {
		return testFramework;
	}

	try {
		// Resolve the absolute path to the config file
		const absoluteConfigPath = path.resolve(process.cwd(), configPath);

		// Verify the config file exists
		if (!fs.existsSync(absoluteConfigPath)) {
			throw new Error(`Config file not found at: ${absoluteConfigPath}`);
		}

		// Create test data directory structure
		const dataDir = path.join(process.cwd(), 'data');
		if (!fs.existsSync(dataDir)) {
			fs.mkdirSync(dataDir, { recursive: true });
		}

		// Create a test logger
		const testLogger = {
			debug: (message: string, ...args: any[]) => console.debug(`[DEBUG] ${message}`, ...args),
			info: (message: string, ...args: any[]) => console.info(`[INFO] ${message}`, ...args),
			warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
			error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args)
		};

		// Reset database context before initializing (to avoid stale connections)
		if (DatabaseContext.hasInstance && DatabaseContext.hasInstance()) {
			DatabaseContext.closeDatabase();
		}

		// Initialize framework with the config file
		testFramework = new Framework({
			configPath: absoluteConfigPath,
			logger: testLogger,
			autoGenerateApi: false // Don't auto-generate API to speed up tests
		});

		// Initialize the framework - this will load the entities from the config file
		// and synchronize the database schema
		await testFramework.initialize(absoluteConfigPath);

		testLogger.info('Test environment initialized successfully');
		return testFramework;
	} catch (error) {
		console.error('Failed to initialize test environment:', error);
		throw error;
	}
}

/**
 * Get the test framework instance
 * @returns Test framework instance
 * @throws Error if the test environment hasn't been initialized
 */
export function getTestFramework(): Framework {
	if (!testFramework) {
		throw new Error('Test environment not initialized. Call setupTestEnvironment first.');
	}
	return testFramework;
}

/**
 * Clean up the test environment
 */
export async function teardownTestEnvironment(): Promise<void> {
	if (!testFramework) {
		return;
	}

	try {
		// Stop the framework
		await testFramework.stop();

		// Close database connections
		if (DatabaseContext.hasInstance && DatabaseContext.hasInstance()) {
			DatabaseContext.closeDatabase();
		}

		// Clear the reference
		testFramework = null;

		console.info('[INFO] Test environment successfully cleaned up');
	} catch (error) {
		console.error('Error during test environment cleanup:', error);
		throw error;
	}
}

/**
 * Helper function to register a custom test entity if needed
 * This would only be used for specific test cases that need entities
 * not defined in the app.yaml config
 */
export function registerTestEntity(entityConfig: any): boolean {
	try {
		const context = getTestFramework().getContext();
		return context.registerEntity(entityConfig.entity, entityConfig);
	} catch (error) {
		console.error('Failed to register test entity:', error);
		return false;
	}
}