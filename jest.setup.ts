import {
  setupJestTestEnvironment,
  teardownJestTestEnvironment,
} from "./tests/test-setup";

// Setup global test environment before all tests
beforeAll(async () => {
  await setupJestTestEnvironment();
});

// Clean up after all tests
afterAll(() => {
  teardownJestTestEnvironment();
});
