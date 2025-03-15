// entity-registry.test.ts
import { EntityRegistry, getEntityRegistry } from "../src/entity/EntityRegistry";
import { EntityConfig } from "../src/entity/entity-config";
import { DatabaseAdapter } from "../src/database/core/types";
import { ActionRegistry } from "../src/actions/action-registry";
import { DatabaseContext } from "../src/database/core/database-context";

// Mock the database context
jest.mock('../src/database/core/database-context', () => ({
	DatabaseContext: {
		hasInstance: jest.fn().mockReturnValue(true),
		getDatabase: jest.fn()
	}
}));

// Mock the EntityDao
jest.mock('../src/entity/entity-manager', () => ({
	EntityDao: jest.fn().mockImplementation(() => ({
		initialize: jest.fn().mockResolvedValue(undefined),
		findById: jest.fn().mockResolvedValue({}),
		findAll: jest.fn().mockResolvedValue([])
	}))
}));

describe("EntityRegistry", () => {
	let entityRegistry: EntityRegistry;
	let mockLogger: any;
	let mockDb: any;
	let mockActionRegistry: any;
	let testEntityConfig: EntityConfig;

	beforeEach(() => {
		// Reset the singleton instance
		jest.resetModules();

		// Create mocks
		mockLogger = {
			debug: jest.fn(),
			info: jest.fn(),
			warn: jest.fn(),
			error: jest.fn()
		};

		mockDb = {
			connect: jest.fn().mockResolvedValue({}),
			close: jest.fn(),
			query: jest.fn().mockResolvedValue([]),
			execute: jest.fn().mockResolvedValue({ lastInsertRowid: 1 })
		};

		mockActionRegistry = {
			registerAction: jest.fn(),
			getAction: jest.fn(),
			getAllActions: jest.fn()
		};

		// Mock DatabaseContext.getDatabase to return our mock db
		(DatabaseContext.getDatabase as jest.Mock).mockReturnValue(mockDb);

		// Create a test entity config
		testEntityConfig = {
			entity: "User",
			table: "users",
			idField: "id",
			columns: [
				{ logical: "id", physical: "user_id", primaryKey: true },
				{ logical: "name", physical: "user_name" }
			],
			actions: [
				{
					name: "testAction",
					implementation: "// Test implementation",
					httpMethod: "GET",
					route: "/test"
				}
			]
		};

		// Create EntityRegistry instance
		entityRegistry = getEntityRegistry(mockLogger, mockDb);

		// Set action registry
		entityRegistry.setActionRegistry(mockActionRegistry as unknown as ActionRegistry);
	});

	test("should create a singleton instance", () => {
		const instance1 = getEntityRegistry(mockLogger, mockDb);
		const instance2 = getEntityRegistry();

		expect(instance1).toBe(instance2);
	});

	test("should require logger and db on first call", () => {
		// Reset the singleton
		// @ts-ignore - accessing private static property for testing
		EntityRegistry.instance = undefined;

		expect(() => getEntityRegistry()).toThrow();
	});

	test("should register entity configuration", () => {
		const result = entityRegistry.registerEntityConfig("User", testEntityConfig);

		expect(result).toBe(true);
		expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining("Registered entity configuration"));

		// Should register actions
		expect(mockActionRegistry.registerAction).toHaveBeenCalled();
	});

	test("should register multiple entity configurations", () => {
		const configs = new Map<string, EntityConfig>();
		configs.set("User", testEntityConfig);
		configs.set("Post", {
			entity: "Post",
			table: "posts",
			idField: "id",
			columns: [{ logical: "id", physical: "id", primaryKey: true }]
		});

		const count = entityRegistry.registerEntityConfigs(configs);

		expect(count).toBe(2);
		expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("Registered 2 of 2"));
	});

	test("should unregister entity configuration", () => {
		// Register first
		entityRegistry.registerEntityConfig("User", testEntityConfig);

		// Then unregister
		const result = entityRegistry.unregisterEntityConfig("User");

		expect(result).toBe(true);
		expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining("Unregistered entity"));
	});

	test("should return false when unregistering non-existent entity", () => {
		const result = entityRegistry.unregisterEntityConfig("NonExistent");

		expect(result).toBe(false);
		expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("not found"));
	});

	test("should get entity configuration", () => {
		// Register first
		entityRegistry.registerEntityConfig("User", testEntityConfig);

		const config = entityRegistry.getEntityConfig("User");

		expect(config).toBe(testEntityConfig);
	});

	test("should return undefined for non-existent entity configuration", () => {
		const config = entityRegistry.getEntityConfig("NonExistent");

		expect(config).toBeUndefined();
	});

	test("should get all entity configurations", () => {
		// Register entities
		entityRegistry.registerEntityConfig("User", testEntityConfig);
		entityRegistry.registerEntityConfig("Post", {
			entity: "Post",
			table: "posts",
			idField: "id",
			columns: [{ logical: "id", physical: "id", primaryKey: true }]
		});

		const configs = entityRegistry.getAllEntityConfigs();

		expect(configs.size).toBe(2);
		expect(configs.has("User")).toBe(true);
		expect(configs.has("Post")).toBe(true);
	});

	test("should check if entity exists", () => {
		// Register first
		entityRegistry.registerEntityConfig("User", testEntityConfig);

		expect(entityRegistry.hasEntity("User")).toBe(true);
		expect(entityRegistry.hasEntity("NonExistent")).toBe(false);
	});

	test("should get entity manager", () => {
		// Register first
		entityRegistry.registerEntityConfig("User", testEntityConfig);

		const manager = entityRegistry.getEntityManager("User");

		expect(manager).toBeDefined();
	});

	test("should throw error when getting manager for non-existent entity", () => {
		expect(() => entityRegistry.getEntityManager("NonExistent")).toThrow();
	});

	test("should get all entity managers", () => {
		// Register entities
		entityRegistry.registerEntityConfig("User", testEntityConfig);
		entityRegistry.registerEntityConfig("Post", {
			entity: "Post",
			table: "posts",
			idField: "id",
			columns: [{ logical: "id", physical: "id", primaryKey: true }]
		});

		const managers = entityRegistry.getAllEntityManagers();

		expect(managers.size).toBe(2);
		expect(managers.has("User")).toBe(true);
		expect(managers.has("Post")).toBe(true);
	});

	test("should reset the registry", () => {
		// Register first
		entityRegistry.registerEntityConfig("User", testEntityConfig);

		entityRegistry.reset();

		expect(entityRegistry.hasEntity("User")).toBe(false);
		expect(mockLogger.debug).toHaveBeenCalledWith("Entity Registry reset");
	});

	test("should log errors when registering invalid entity", () => {
		// Mock action registry to throw error
		mockActionRegistry.registerAction.mockImplementation(() => {
			throw new Error("Test error");
		});

		entityRegistry.registerEntityConfig("User", testEntityConfig);

		expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining("Failed to register action"));
	});

	test("should handle cache for entity managers", () => {
		// Register entity
		entityRegistry.registerEntityConfig("User", testEntityConfig);

		// Get the manager twice
		const manager1 = entityRegistry.getEntityManager("User");
		const manager2 = entityRegistry.getEntityManager("User");

		// Should be the same instance
		expect(manager1).toBe(manager2);
	});

	test("should set config loader", () => {
		const mockConfigLoader = {};

		entityRegistry.setConfigLoader(mockConfigLoader);

		// No direct way to test this, but we can check that it doesn't throw
		expect(() => entityRegistry.setConfigLoader(mockConfigLoader)).not.toThrow();
	});
});