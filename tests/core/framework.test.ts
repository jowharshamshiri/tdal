// framework.test.ts
import { Framework } from "../../src/core/framework";
import { ConfigLoader } from "../../src/core/config-loader";
import { AppContext } from "../../src/core/app-context";
import { Request, Response, NextFunction } from "express";
import { setupTestEnvironment, teardownTestEnvironment, getTestFramework, generateTestData } from '../test-setup';

// Mock dependencies
jest.mock('../../src/core/config-loader');
jest.mock('../../src/core/app-context');
jest.mock('express', () => {
	const mockRouter = {
		get: jest.fn(),
		post: jest.fn(),
		put: jest.fn(),
		delete: jest.fn(),
		use: jest.fn()
	};

	const mockExpress = jest.fn(() => ({
		use: jest.fn(),
		listen: jest.fn((port, host, callback) => {
			callback();
			return {
				close: jest.fn((callback) => callback())
			};
		}),
		get: jest.fn(),
		post: jest.fn(),
		put: jest.fn(),
		delete: jest.fn()
	}));

	(mockExpress as any).Router = jest.fn(() => mockRouter);

	return mockExpress;
});

// Mock middleware modules
jest.mock('cors', () => jest.fn(() => (req: Request, res: Response, next: NextFunction) => next()));
jest.mock('body-parser', () => ({
	json: jest.fn(() => (req: Request, res: Response, next: NextFunction) => next()),
	urlencoded: jest.fn(() => (req: Request, res: Response, next: NextFunction) => next())
}));
jest.mock('compression', () => jest.fn(() => (req: Request, res: Response, next: NextFunction) => next()));
jest.mock('helmet', () => jest.fn(() => (req: Request, res: Response, next: NextFunction) => next()));

// Mock the adapter registry
jest.mock('../../src/adapters', () => ({
	createAdapterRegistry: jest.fn(() => ({
		getAdapter: jest.fn(() => ({
			initialize: jest.fn().mockResolvedValue(undefined)
		}))
	}))
}));

// Define the interface for our test entity
interface TestEntity {
	id?: number;
	name: string;
	active: boolean;
}

describe('Framework Tests', () => {
	// Unit Tests
	describe("Unit Tests", () => {
		let framework: Framework;
		let mockLogger: any;
		let mockConfigLoader: any;
		let mockAppContext: any;

		beforeEach(() => {
			// Reset mocks
			jest.clearAllMocks();

			// Setup mocks
			mockLogger = {
				debug: jest.fn(),
				info: jest.fn(),
				warn: jest.fn(),
				error: jest.fn()
			};

			mockConfigLoader = {
				loadAppConfig: jest.fn().mockResolvedValue({
					name: "Test App",
					version: "1.0.0",
					port: 3000,
					host: "localhost",
					adapters: {
						default: "test",
						config: {
							test: {
								enabled: true,
								type: "test",
								options: {}
							}
						}
					}
				}),
				loadEntities: jest.fn().mockResolvedValue(new Map())
			};

			// Setup AppContext mock
			mockAppContext = {
				initialize: jest.fn().mockResolvedValue({}),
				initializeApiRoutes: jest.fn().mockResolvedValue([]),
				registerService: jest.fn(),
				getLogger: jest.fn().mockReturnValue(mockLogger),
				shutdown: jest.fn().mockResolvedValue(undefined)
			};

			// Setup constructor mocks
			(ConfigLoader as jest.Mock).mockImplementation(() => mockConfigLoader);
			(AppContext as jest.Mock).mockImplementation(() => mockAppContext);

			// Create Framework instance
			framework = new Framework({
				logger: mockLogger
			});
		});

		test("should create a Framework instance", () => {
			expect(framework).toBeDefined();
		});

		test("should initialize the framework", async () => {
			await framework.initialize();

			expect(mockConfigLoader.loadAppConfig).toHaveBeenCalled();
			expect(mockConfigLoader.loadEntities).toHaveBeenCalled();
			expect(mockAppContext.initialize).toHaveBeenCalled();
			expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("Initializing framework"));
		});

		test("should set up middleware during initialization", async () => {
			await framework.initialize();

			// Check middleware setup
			const app = framework.getApp();
			expect(app.use).toHaveBeenCalled();
		});

		test("should start the server", async () => {
			await framework.initialize();

			const server = await framework.start();

			expect(server).toBeDefined();
			expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("Server started"));
		});

		test("should stop the server", async () => {
			await framework.initialize();
			const server = await framework.start();

			await framework.stop();

			expect(mockAppContext.shutdown).toHaveBeenCalled();
			expect(mockLogger.info).toHaveBeenCalledWith("Stopping server");
			expect(mockLogger.info).toHaveBeenCalledWith("Server stopped");
		});

		test("should get the application context", async () => {
			await framework.initialize();

			const context = framework.getContext();

			expect(context).toBe(mockAppContext);
		});

		test("should throw if getting context before initialization", () => {
			expect(() => framework.getContext()).toThrow();
		});

		test("should get the Express app", async () => {
			await framework.initialize();

			const app = framework.getApp();

			expect(app).toBeDefined();
			expect(app.use).toBeDefined();
		});

		test("should get the configuration loader", () => {
			const configLoader = framework.getConfigLoader();

			expect(configLoader).toBe(mockConfigLoader);
		});

		test("should get the application configuration", async () => {
			await framework.initialize();

			const config = framework.getConfig();

			expect(config).toBeDefined();
			expect(config.name).toBe("Test App");
		});

		test("should throw if getting config before initialization", () => {
			expect(() => framework.getConfig()).toThrow();
		});

		test("should generate API with adapter", async () => {
			await framework.initialize();

			await framework.generateApiWithAdapter();

			// Check that the API generator was called
			const apiGenerator = mockAppContext.getApiGenerator;
			expect(apiGenerator).toBeDefined();
		});

		test("should apply custom middleware", async () => {
			const customMiddleware = jest.fn((req: Request, res: Response, next: NextFunction) => next());

			const framework = new Framework({
				logger: mockLogger,
				middleware: [customMiddleware]
			});

			await framework.initialize();

			const app = framework.getApp();
			expect(app.use).toHaveBeenCalled();
		});

		test("should support HTTP method overrides", async () => {
			await framework.initialize();

			// Create a mock router
			const mockRouter = {
				get: jest.fn(),
				post: jest.fn(),
				put: jest.fn(),
				delete: jest.fn()
			};

			// Mock the API generator to call methods on the router
			mockAppContext.getApiGenerator = jest.fn().mockReturnValue({
				generateEntityApi: jest.fn().mockImplementation((entityConfig, entityManager, actionRegistry, router) => {
					router.get('/', jest.fn());
					router.post('/', jest.fn());
					router.put('/:id', jest.fn());
					router.delete('/:id', jest.fn());
					return router;
				})
			});

			const router = await framework.createEntityApiRoutes('User', mockRouter as any);

			expect(router.get).toHaveBeenCalled();
			expect(router.post).toHaveBeenCalled();
			expect(router.put).toHaveBeenCalled();
			expect(router.delete).toHaveBeenCalled();
		});
	});

	// Integration Tests
	describe("Integration Tests", () => {
		beforeEach(async () => {
			// Generate test data with relationships
			await setupTestEnvironment('./tests/test-app.yaml');
			await generateTestData({
				count: 5,  // 5 records per entity
				withRelations: true,
				// Customize specific fields if needed
				customGenerators: {
					email: () => `test-${Date.now()}@example.com`
				},
				// Set fixed values for specific entities/fields
				fixedValues: {
					User: {
						role: 'admin'
					}
				}
			});
		});

		afterEach(async () => {
			await teardownTestEnvironment();
		});

		test('should initialize framework with configuration', () => {
			const framework = getTestFramework();
			const config = framework.getConfig();

			expect(config).toBeDefined();
			expect(config.name).toEqual('Test API Framework');
			expect(config.version).toEqual('1.0.0');
		});

		test('should register and access a test entity', async () => {
			// Get the entity DAO
			const framework = getTestFramework();
			const context = framework.getContext();
			const entityDao = context.getEntityManager<TestEntity>('TestEntity');

			expect(entityDao).toBeDefined();

			// Create a test record
			const id = await entityDao.create({
				name: 'Test Record',
				active: true
			});

			expect(id).toBeDefined();

			// Retrieve the record
			const record = await entityDao.findById(id);

			expect(record).toBeDefined();
			expect(record?.name).toEqual('Test Record');
			expect(record?.active).toBe(true);
		});

		test('should find entities by query parameters', async () => {
			const framework = getTestFramework();
			const context = framework.getContext();
			const entityDao = context.getEntityManager<TestEntity>('TestEntity');

			// Create multiple records
			await entityDao.create({
				name: 'Active Record',
				active: true
			});

			await entityDao.create({
				name: 'Inactive Record',
				active: false
			});

			// Query for active records
			const activeRecords = await entityDao.findBy({ active: true });
			expect(activeRecords.length).toBeGreaterThan(0);
			expect(activeRecords[0].active).toBe(true);

			// Query for inactive records
			const inactiveRecords = await entityDao.findBy({ active: false });
			expect(inactiveRecords.length).toBeGreaterThan(0);
			expect(inactiveRecords[0].active).toBe(false);
		});

		test('should count by criteria', async () => {
			const framework = getTestFramework();
			const context = framework.getContext();
			const entityDao = context.getEntityManager<TestEntity>('TestEntity');

			// Create records
			await entityDao.create({
				name: 'Record 1',
				active: true
			});

			await entityDao.create({
				name: 'Record 2',
				active: true
			});

			await entityDao.create({
				name: 'Record 3',
				active: false
			});

			// Count active records
			const activeCount = await entityDao.count({ active: true });
			expect(activeCount).toBeGreaterThanOrEqual(2);

			// Count inactive records
			const inactiveCount = await entityDao.count({ active: false });
			expect(inactiveCount).toBeGreaterThanOrEqual(1);

			// Total count
			const totalCount = await entityDao.count({});
			expect(totalCount).toBeGreaterThanOrEqual(3);
		});
	});
});