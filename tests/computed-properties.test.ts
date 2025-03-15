// computed-properties.test.ts
import {
	ComputedPropertyImplementations,
	ComputedPropertyOptions,
	DependencyAnalysisResult,
	loadComputedPropertyImplementations,
	createComputedPropertyFunction,
	processComputedProperties,
	processComputedPropertiesForArray,
	haveDependenciesChanged,
	extractDependenciesFromImplementation,
	buildDependencyGraph,
	detectCircularDependencies,
	analyzeDependencies,
	getComputedPropertyOrder,
	createComputedPropertiesProcessor,
	createBatchComputedPropertiesProcessor
} from "../src/entity/computed-properties";
import { ComputedProperty, EntityConfig } from "../src/entity/entity-config";
import { HookContext } from "../src/core/types";

describe("ComputedProperties", () => {
	let mockLogger: any;
	let mockConfigLoader: any;
	let testEntityConfig: EntityConfig;

	beforeEach(() => {
		// Create mocks
		mockLogger = {
			debug: jest.fn(),
			info: jest.fn(),
			warn: jest.fn(),
			error: jest.fn()
		};

		mockConfigLoader = {
			loadExternalCode: jest.fn().mockImplementation((path: string) => {
				if (path.includes('fullName')) {
					return Promise.resolve((user: any) => `${user.firstName} ${user.lastName}`);
				}
				return Promise.resolve(() => "default");
			})
		};

		// Create test entity config
		testEntityConfig = {
			entity: "User",
			table: "users",
			idField: "id",
			columns: [
				{ logical: "id", physical: "user_id", primaryKey: true },
				{ logical: "firstName", physical: "first_name" },
				{ logical: "lastName", physical: "last_name" },
				{ logical: "age", physical: "age" }
			],
			computed: [
				{
					name: "fullName",
					implementation: "(user) => `${user.firstName} ${user.lastName}`"
				},
				{
					name: "nameLength",
					dependencies: ["fullName"],
					implementation: "(user) => user.fullName ? user.fullName.length : 0"
				},
				{
					name: "isAdult",
					implementation: "(user) => user.age >= 18"
				}
			]
		};
	});

	test("should load computed property implementations", async () => {
		const implementations = await loadComputedPropertyImplementations(
			testEntityConfig,
			mockLogger,
			mockConfigLoader
		);

		expect(Object.keys(implementations).length).toBe(3);
		expect(typeof implementations.fullName).toBe("function");
		expect(typeof implementations.nameLength).toBe("function");
		expect(typeof implementations.isAdult).toBe("function");

		// Test basic functionality
		const user = { firstName: "John", lastName: "Doe", age: 25 };
		expect(implementations.fullName(user)).toBe("John Doe");
		expect(implementations.nameLength(user)).toBe(8);
		expect(implementations.isAdult(user)).toBe(true);
	});

	test("should create computed property function", () => {
		const prop: ComputedProperty = {
			name: "isAdult",
			implementation: "(user) => user.age >= 18"
		};

		const fn = createComputedPropertyFunction(prop);

		expect(typeof fn).toBe("function");
		expect(fn({ age: 20 })).toBe(true);
		expect(fn({ age: 16 })).toBe(false);
	});

	test("should handle errors in computed property function", () => {
		const prop: ComputedProperty = {
			name: "errorProne",
			implementation: "(user) => user.nonExistent.property"
		};

		const fn = createComputedPropertyFunction(prop);

		// Error should be caught and returned as undefined
		expect(fn({})).toBeUndefined();
	});

	test("should process computed properties for an entity", () => {
		const implementations: ComputedPropertyImplementations = {
			fullName: (user: any) => `${user.firstName} ${user.lastName}`,
			nameLength: (user: any) => user.fullName ? user.fullName.length : 0,
			isAdult: (user: any) => user.age >= 18
		};

		const user = { firstName: "John", lastName: "Doe", age: 25 };

		const processed = processComputedProperties(user, implementations);

		expect(processed.fullName).toBe("John Doe");
		expect(processed.nameLength).toBe(8);
		expect(processed.isAdult).toBe(true);
	});

	test("should handle dependencies in computed properties", () => {
		const implementations: ComputedPropertyImplementations = {
			fullName: (user: any) => `${user.firstName} ${user.lastName}`,
			nameLength: (user: any) => user.fullName ? user.fullName.length : 0,
			formattedName: (user: any) => user.fullName ? user.fullName.toUpperCase() : ""
		};

		const user = { firstName: "John", lastName: "Doe" };

		const processed = processComputedProperties(user, implementations);

		expect(processed.fullName).toBe("John Doe");
		expect(processed.nameLength).toBe(8);
		expect(processed.formattedName).toBe("JOHN DOE");
	});

	test("should process options in computed properties", () => {
		const implementations: ComputedPropertyImplementations = {
			fullName: (user: any) => `${user.firstName} ${user.lastName}`,
			nameLength: (user: any) => user.fullName ? user.fullName.length : 0
		};

		const user = { firstName: "John", lastName: "Doe" };

		const options: ComputedPropertyOptions = {
			skipProperties: ["nameLength"]
		};

		const processed = processComputedProperties(user, implementations, options);

		expect(processed.fullName).toBe("John Doe");
		expect(processed.nameLength).toBeUndefined();
	});

	test("should process computed properties for an array", () => {
		const implementations: ComputedPropertyImplementations = {
			fullName: (user: any) => `${user.firstName} ${user.lastName}`,
			isAdult: (user: any) => user.age >= 18
		};

		const users = [
			{ firstName: "John", lastName: "Doe", age: 25 },
			{ firstName: "Jane", lastName: "Smith", age: 16 }
		];

		const processed = processComputedPropertiesForArray(users, implementations);

		expect(processed[0].fullName).toBe("John Doe");
		expect(processed[0].isAdult).toBe(true);
		expect(processed[1].fullName).toBe("Jane Smith");
		expect(processed[1].isAdult).toBe(false);
	});

	test("should check if dependencies have changed", () => {
		const oldEntity = {
			firstName: "John",
			lastName: "Doe",
			age: 25
		};

		const newEntity = {
			firstName: "John",
			lastName: "Smith", // Changed
			age: 25
		};

		// Check dependencies
		expect(haveDependenciesChanged(oldEntity, newEntity, [])).toBe(true);
		expect(haveDependenciesChanged(oldEntity, newEntity, ["firstName"])).toBe(false);
		expect(haveDependenciesChanged(oldEntity, newEntity, ["lastName"])).toBe(true);
		expect(haveDependenciesChanged(oldEntity, newEntity, ["firstName", "lastName"])).toBe(true);
	});

	test("should extract dependencies from implementation", () => {
		const implementations = {
			fullName: (user: any) => `${user.firstName} ${user.lastName}`,
			noFieldAccess: () => "static"
		};

		const deps1 = extractDependenciesFromImplementation(implementations.fullName);
		const deps2 = extractDependenciesFromImplementation(implementations.noFieldAccess);

		expect(deps1).toContain("firstName");
		expect(deps1).toContain("lastName");
		expect(deps1.length).toBe(2);

		expect(deps2.length).toBe(0);
	});

	test("should build dependency graph", () => {
		const propNames = ["fullName", "nameLength", "formattedName"];
		const getDependencies = (prop: string) => {
			if (prop === "nameLength") return ["fullName"];
			if (prop === "formattedName") return ["fullName"];
			return [];
		};

		const graph = buildDependencyGraph(propNames, getDependencies);

		expect(graph.size).toBe(3);
		expect(graph.get("fullName")).toEqual([]);
		expect(graph.get("nameLength")).toEqual(["fullName"]);
		expect(graph.get("formattedName")).toEqual(["fullName"]);
	});

	test("should detect circular dependencies", () => {
		const graph = new Map<string, string[]>();
		graph.set("a", ["b"]);
		graph.set("b", ["c"]);
		graph.set("c", ["a"]); // Circular: a -> b -> c -> a

		const circularDeps = detectCircularDependencies(graph);

		expect(circularDeps.length).toBe(1);
		expect(circularDeps[0]).toContain("a");
		expect(circularDeps[0]).toContain("b");
		expect(circularDeps[0]).toContain("c");
	});

	test("should not detect circular dependencies when none exist", () => {
		const graph = new Map<string, string[]>();
		graph.set("a", ["b"]);
		graph.set("b", ["c"]);
		graph.set("c", []); // No circular dependencies

		const circularDeps = detectCircularDependencies(graph);

		expect(circularDeps.length).toBe(0);
	});

	test("should analyze dependencies", () => {
		const propNames = ["fullName", "nameLength", "formattedName"];
		const getDependencies = (prop: string) => {
			if (prop === "nameLength") return ["fullName"];
			if (prop === "formattedName") return ["fullName"];
			return [];
		};

		const analysis = analyzeDependencies(propNames, getDependencies);

		expect(analysis.order).toContain("fullName");
		expect(analysis.order.indexOf("fullName")).toBeLessThan(analysis.order.indexOf("nameLength"));
		expect(analysis.order.indexOf("fullName")).toBeLessThan(analysis.order.indexOf("formattedName"));
		expect(analysis.graph.size).toBe(3);
		expect(analysis.circularDependencies.length).toBe(0);
	});

	test("should get computed property order", () => {
		const propNames = ["nameLength", "fullName", "formattedName"];
		const getDependencies = (prop: string) => {
			if (prop === "nameLength") return ["fullName"];
			if (prop === "formattedName") return ["fullName"];
			return [];
		};

		const order = getComputedPropertyOrder(propNames, getDependencies);

		expect(order.indexOf("fullName")).toBeLessThan(order.indexOf("nameLength"));
		expect(order.indexOf("fullName")).toBeLessThan(order.indexOf("formattedName"));
	});

	test("should create computed properties processor", () => {
		const implementations = {
			fullName: (user: any) => `${user.firstName} ${user.lastName}`,
			isAdult: (user: any) => user.age >= 18
		};

		const processor = createComputedPropertiesProcessor(testEntityConfig, implementations);

		expect(typeof processor).toBe("function");

		const user = { firstName: "John", lastName: "Doe", age: 25 };
		const processed = processor(user);

		expect(processed.fullName).toBe("John Doe");
		expect(processed.isAdult).toBe(true);
	});

	test("should create batch computed properties processor", () => {
		const implementations = {
			fullName: (user: any) => `${user.firstName} ${user.lastName}`,
			isAdult: (user: any) => user.age >= 18
		};

		const batchProcessor = createBatchComputedPropertiesProcessor(testEntityConfig, implementations);

		expect(typeof batchProcessor).toBe("function");

		const users = [
			{ firstName: "John", lastName: "Doe", age: 25 },
			{ firstName: "Jane", lastName: "Smith", age: 16 }
		];

		const processed = batchProcessor(users);

		expect(processed.length).toBe(2);
		expect(processed[0].fullName).toBe("John Doe");
		expect(processed[0].isAdult).toBe(true);
		expect(processed[1].fullName).toBe("Jane Smith");
		expect(processed[1].isAdult).toBe(false);
	});

	test("should handle errors in computed property calculation", () => {
		const mockContext: HookContext = {
			db: undefined,
			logger: mockLogger
		};

		const implementations: ComputedPropertyImplementations = {
			error: () => { throw new Error("Test error"); }
		};

		const entity = { firstName: "John", lastName: "Doe" };
		const processed = processComputedProperties(entity, implementations, { context: mockContext });

		expect(processed.error).toBeUndefined();
		expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining("Error calculating computed property"));
	});

	test("should respect computation order with complex dependencies", () => {
		const implementations: ComputedPropertyImplementations = {
			fullName: (user: any) => `${user.firstName} ${user.lastName}`,
			nameLength: (user: any) => user.fullName ? user.fullName.length : 0,
			nameInfo: (user: any) => `${user.fullName} has ${user.nameLength} characters`
		};

		const entity = { firstName: "John", lastName: "Doe" };
		const processed = processComputedProperties(entity, implementations);

		expect(processed.fullName).toBe("John Doe");
		expect(processed.nameLength).toBe(8);
		expect(processed.nameInfo).toBe("John Doe has 8 characters");
	});
});