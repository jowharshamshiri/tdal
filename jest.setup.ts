import {
	setupTestEnvironment,
	teardownTestEnvironment,
} from "./tests/test-setup";

// Setup global test environment before all tests
beforeAll(async () => {
	try {
		console.log('Setting up test environment...');
		await setupTestEnvironment('./tests/test-app.yaml');
		console.log('Test environment setup complete.');
	} catch (error) {
		console.error('Failed to set up test environment:', error);
		throw error;
	}
});

// Clean up after all tests
afterAll(async () => {
	try {
		console.log('Tearing down test environment...');
		await teardownTestEnvironment();
		console.log('Test environment teardown complete.');
	} catch (error) {
		console.error('Failed to tear down test environment:', error);
	}
});