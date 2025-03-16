// app-context.test.ts
import { AppContext } from "../../src/core/app-context";
import { DatabaseAdapter } from "../../src/database/core/types";
import { EntityConfig } from "../../src/entity/entity-config";
import { EntityDao } from "../../src/entity/entity-manager";
import { DatabaseContext } from "../../src/database/core/database-context";
import { ActionRegistry } from "../../src/actions/action-registry";
import { RouteRegistry } from "../../src/api/route-registry";

// Mock the database context
jest.mock('../../src/database/core/database-context', () => ({
	DatabaseContext: {
		setLogger: jest.fn(),
		configure: jest.fn(),
		getDatabase: jest.fn(),
		setAppContext: jest.fn(),
		closeDatabase: jest.fn(),
		hasInstance: jest.fn().mockReturnValue(true)
	}
}));

// Mock entity registry
jest.mock('../../src/entity/EntityRegistry', () => ({
	getEntityRegistry: jest.fn().mockImplementation(() => ({
		registerEntityConfigs: jest.fn(),
		getEntityConfig: jest.fn(),
		getAllEntityConfigs: jest.fn().mockReturnValue(new Map()),
		getEntityManager: jest.fn(),
		getAllEntityManagers: jest.fn().mockReturnValue(new Map()),
		setActionRegistry: jest.fn()
	}))
}));

// Mock action registry
jest.mock('../../src/actions/action-registry', () => ({
	ActionRegistry: jest.fn().mockImplementation(() => ({
		registerAction: jest.fn(),
		getAction: jest.fn(),
		getAllActions: jest.fn()
	}))
}));

// Mock route registry
jest.mock('../../src/api/route-registry', () => ({
	RouteRegistry: jest.fn().mockImplementation(() => ({
		registerRoute: jest.fn(),
		getRoutes: jest.fn()
	}))
}));

// Mock ApiGenerator
jest.mock('../../src/api/api-generator', () => ({
	ApiGenerator: jest.fn().mockImplementation(() => ({
		generateEntityApi: jest.fn(),
		generateApiWithAdapter: jest.fn()
	}))
}));

describe("AppContext", () => {
	let appContext: AppContext;
	let mockLogger: any;
	let mockConfig: any;
	let mockDb: any;
	let mockRouter: any;
	let mockEntities: Map<string, EntityConfig>;

	beforeEach(() => {
		// Set up mocks
		mockLogger = {
			debug: jest.fn(),
			info: jest.fn(),
			warn: jest.fn(),
			error: jest.fn()
		};

		mockConfig = {
			name: "Test App",
			version: "1.0.0",
			port: 3000,
			host: "localhost"
		};

		mockDb = {
			connect: jest.fn().mockResolvedValue({}),
			close: jest.fn(),
			query: jest.fn().mockResolvedValue([]),
			execute: jest.fn().mockResolvedValue({ lastInsertRowid: 1 })
		};

		mockRouter = {
			use: jest.fn(),
			get: jest.fn(),
			post: jest.fn(),
			put: jest.fn(),
			delete: jest.fn()
		};

		mockEntities = new Map<string, EntityConfig>();
		mockEntities.set('User', {
			entity: 'User',
			table: 'users',
			idField: 'id',
			columns: [
				{ logical: 'id', physical: 'id', primaryKey: true }
			]
		});

		// Mock DatabaseContext.getDatabase to return our mock db
		(DatabaseContext.getDatabase as jest.Mock).mockReturnValue(mockDb);

		// Create app context
		appContext = new AppContext(mockConfig, mockLogger);
	});

	test("should initialize with config and logger", () => {
		expect(appContext).toBeDefined();
		expect(appContext.getConfig()).toBe(mockConfig);
		expect(appContext.getLogger()).toBe(mockLogger);
		expect(DatabaseContext.setLogger).toHaveBeenCalledWith(mockLogger);
	});

	test("should initialize the application context", async () => {
		await appContext.initialize(mockEntities);

		expect(mockLogger.info).toHaveBeenCalledWith("Initializing application context");
		expect(mockLogger.info).toHaveBeenCalledWith("Application context initialized successfully");
	});

	test("should register and retrieve a service", () => {
		const testService = { test: "value" };
		appContext.registerService({
			name: "testService",
			implementation: testService,
			singleton: true
		});

		expect(appContext.hasService("testService")).toBe(true);
		expect(appContext.getService("testService")).toBe(testService);
	});

	test("should throw when getting non-existent service", () => {
		expect(() => appContext.getService("nonExistentService")).toThrow();
	});

	test("should register and retrieve middleware", () => {
		const middleware = {
			name: "testMiddleware",
			handler: () => (req: any, res: any, next: any) => next(),
			options: { test: true }
		};

		appContext.registerMiddleware("testMiddleware", middleware);

		const retrievedMiddleware = appContext.getMiddlewareConfig("testMiddleware");
		expect(retrievedMiddleware).toBe(middleware);
	});

	test("should create lazy service with factory", async () => {
		// Define a factory function
		const factory = (ctx: AppContext) => ({
			getValue: () => "factoryValue",
			context: ctx
		});

		// Register the factory as a service
		appContext.registerService({
			name: "factoryService",
			implementation: factory(appContext),
			singleton: true
		});

		// Get the service
		const service = appContext.getService("factoryService") as { getValue: () => string, context: any };

		expect(service.getValue()).toBe("factoryValue");
		expect(service.context).toBe(appContext);
	});

	test("should initialize API routes", async () => {
		// Mock the app
		const mockApp = {
			use: jest.fn()
		};

		// @ts-ignore - Set the app directly
		appContext.app = mockApp;

		// Mock entity configs with API exposed
		const entities = new Map<string, EntityConfig>();
		entities.set('User', {
			entity: 'User',
			table: 'users',
			idField: 'id',
			columns: [{ logical: 'id', physical: 'id', primaryKey: true }],
			api: {
				exposed: true,
				operations: {
					getAll: true,
					getById: true,
					create: true,
					update: true,
					delete: true
				}
			}
		});

		// Mock EntityRegistry.getAllEntityConfigs to return our mock entities
		const mockEntityRegistry = require('../src/entity/EntityRegistry').getEntityRegistry();
		mockEntityRegistry.getAllEntityConfigs.mockReturnValue(entities);

		// Mock ApiGenerator.generateEntityApi
		const mockApiGenerator = require('../src/api/api-generator').ApiGenerator.mock.instances[0];
		mockApiGenerator.generateEntityApi.mockResolvedValue({});

		const routes = await appContext.initializeApiRoutes('/api');

		expect(mockApp.use).toHaveBeenCalled();
		expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("Initializing API routes"));
	});

	test("should register global hooks", () => {
		const hook = {
			name: "testHook",
			fn: jest.fn(),
			isAsync: true,
			priority: 1
		};

		appContext.registerGlobalHook("beforeCreate", hook);

		const hooks = appContext.getGlobalHooks("beforeCreate");
		expect(hooks).toBeDefined();
	});

	test("should shut down the application", async () => {
		// Register a service with a shutdown method
		const serviceWithShutdown = {
			shutdown: jest.fn().mockResolvedValue(undefined)
		};

		appContext.registerService({
			name: "shutdownService",
			implementation: serviceWithShutdown,
			singleton: true
		});

		await appContext.shutdown();

		expect(serviceWithShutdown.shutdown).toHaveBeenCalled();
		expect(DatabaseContext.closeDatabase).toHaveBeenCalled();
		expect(mockLogger.info).toHaveBeenCalledWith("Shutting down application");
		expect(mockLogger.info).toHaveBeenCalledWith("Application shutdown complete");
	});

	test("should get and set Express app", () => {
		const mockApp = {};

		expect(appContext.getApp()).toBeUndefined();

		appContext.setExpressApp(mockApp as any);

		expect(appContext.getApp()).toBe(mockApp);
	});

	test("should return the database adapter", () => {
		const db = appContext.getDatabase();

		expect(db).toBe(mockDb);
		expect(DatabaseContext.getDatabase).toHaveBeenCalled();
	});
});