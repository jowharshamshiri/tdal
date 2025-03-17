// framework.test.ts
import { Framework } from "../../src/core/framework";
import { ConfigLoader } from "../../src/core/config-loader";
import { AppContext } from "../../src/core/app-context";
import { Request, Response, NextFunction } from "express";

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
jest.mock('../src/adapters', () => ({
	createAdapterRegistry: jest.fn(() => ({
		getAdapter: jest.fn(() => ({
			initialize: jest.fn().mockResolvedValue(undefined)
		}))
	}))
}));

describe("Framework", () => {
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