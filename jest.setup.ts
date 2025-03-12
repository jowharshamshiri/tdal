import {
  setupJestTestEnvironment,
  teardownJestTestEnvironment,
} from "./tests/utils/init-test-db";

// Setup global test environment before all tests
beforeAll(async () => {
  await setupJestTestEnvironment();
});

// Clean up after all tests
afterAll(() => {
  teardownJestTestEnvironment();
});
