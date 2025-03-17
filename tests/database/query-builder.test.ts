// query-builder.test.ts
import {
	setupTestEnvironment,
	teardownTestEnvironment,
	getTestFramework,
	generateTestData,
	cleanupTestData
} from '../test-setup';
import { DatabaseAdapter } from "../../src/database/core/types";
import { SQLiteQueryBuilder } from "../../src/database/query/sqlite-query-builder";
import { QueryBuilder } from "../../src/database/query/query-builder";
import { faker } from '@faker-js/faker';

interface UserRecord {
	name: string;
	email: string;
	role: string;
	password?: string;
	uppercase_name?: string;
}

describe("SQLiteQueryBuilder", () => {
	beforeAll(async () => {
		// Initialize test framework with test-app.yaml configuration
		await setupTestEnvironment('./tests/test-app.yaml');
	});

	afterAll(async () => {
		await teardownTestEnvironment();
	});

	beforeEach(async () => {
		// Clean up any previous test data
		await cleanupTestData();
	});

	test("should build a simple SELECT query", () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const qb = new SQLiteQueryBuilder(db);

		qb.select(["*"]).from("users");

		expect(qb.getQuery()).toBe("SELECT * FROM users");
		expect(qb.getParameters()).toEqual([]);
	});

	test("should build a SELECT query with specific fields", () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const qb = new SQLiteQueryBuilder(db);

		qb.select(["name", "email"]).from("users");

		expect(qb.getQuery()).toBe("SELECT name, email FROM users");
		expect(qb.getParameters()).toEqual([]);
	});

	test("should build a SELECT query with table alias", () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const qb = new SQLiteQueryBuilder(db);

		qb.select(["u.name", "u.email"]).from("users", "u");

		expect(qb.getQuery()).toBe("SELECT u.name, u.email FROM users u");
		expect(qb.getParameters()).toEqual([]);
	});

	test("should build a SELECT query with WHERE clause", () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const qb = new SQLiteQueryBuilder(db);

		qb.select(["*"]).from("users").where("role = ?", "admin");

		expect(qb.getQuery()).toBe("SELECT * FROM users WHERE (role = ?)");
		expect(qb.getParameters()).toEqual(["admin"]);
	});

	test("should build a SELECT query with multiple WHERE conditions", () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const qb = new SQLiteQueryBuilder(db);

		qb.select(["*"])
			.from("users")
			.where("role = ?", "admin")
			.andWhere("name LIKE ?", "%Admin%");

		expect(qb.getQuery()).toBe(
			"SELECT * FROM users WHERE (role = ?) AND (name LIKE ?)"
		);
		expect(qb.getParameters()).toEqual(["admin", "%Admin%"]);
	});

	test("should build a SELECT query with OR WHERE conditions", () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const qb = new SQLiteQueryBuilder(db);

		qb.select(["*"])
			.from("users")
			.where("role = ?", "admin")
			.orWhere("role = ?", "premium_user");

		expect(qb.getQuery()).toBe(
			"SELECT * FROM users WHERE (role = ?) OR (role = ?)"
		);
		expect(qb.getParameters()).toEqual(["admin", "premium_user"]);
	});

	test("should build a SELECT query with condition object", () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const qb = new SQLiteQueryBuilder(db);

		qb.select(["*"])
			.from("users")
			.where({ field: "role", operator: "=", value: "admin" });

		expect(qb.getQuery()).toBe("SELECT * FROM users WHERE (role = ?)");
		expect(qb.getParameters()).toEqual(["admin"]);
	});

	test("should build a SELECT query with IN operator", () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const qb = new SQLiteQueryBuilder(db);

		qb.select(["*"])
			.from("users")
			.where({
				field: "role",
				operator: "IN",
				value: ["admin", "premium_user"],
			});

		expect(qb.getQuery()).toBe("SELECT * FROM users WHERE (role IN (?, ?))");
		expect(qb.getParameters()).toEqual(["admin", "premium_user"]);
	});

	test("should build a SELECT query with IS NULL operator", () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const qb = new SQLiteQueryBuilder(db);

		qb.select(["*"])
			.from("users")
			.where({ field: "last_login", operator: "IS NULL", value: null });

		expect(qb.getQuery()).toBe(
			"SELECT * FROM users WHERE (last_login IS NULL)"
		);
		expect(qb.getParameters()).toEqual([]);
	});

	test("should build a SELECT query with BETWEEN operator", () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const qb = new SQLiteQueryBuilder(db);

		qb.select(["*"])
			.from("users")
			.where({
				field: "created_at",
				operator: "BETWEEN",
				value: ["2023-01-01", "2023-01-31"],
			});

		expect(qb.getQuery()).toBe(
			"SELECT * FROM users WHERE (created_at BETWEEN ? AND ?)"
		);
		expect(qb.getParameters()).toEqual(["2023-01-01", "2023-01-31"]);
	});

	test("should build a SELECT query with INNER JOIN", () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const qb = new SQLiteQueryBuilder(db);

		qb.select(["u.*", "c.amount"])
			.from("users", "u")
			.innerJoin("user_credits", "c", "u.user_id = c.user_id");

		expect(qb.getQuery()).toBe(
			"SELECT u.*, c.amount FROM users u INNER JOIN user_credits c ON u.user_id = c.user_id"
		);
		expect(qb.getParameters()).toEqual([]);
	});

	test("should build a SELECT query with LEFT JOIN", () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const qb = new SQLiteQueryBuilder(db);

		qb.select(["u.*", "c.amount"])
			.from("users", "u")
			.leftJoin("user_credits", "c", "u.user_id = c.user_id");

		expect(qb.getQuery()).toBe(
			"SELECT u.*, c.amount FROM users u LEFT JOIN user_credits c ON u.user_id = c.user_id"
		);
		expect(qb.getParameters()).toEqual([]);
	});

	test("should build a SELECT query with multiple JOINs", () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const qb = new SQLiteQueryBuilder(db);

		qb.select(["u.*", "c.amount", "a.resource_type"])
			.from("users", "u")
			.leftJoin("user_credits", "c", "u.user_id = c.user_id")
			.leftJoin("user_resource_access", "a", "u.user_id = a.user_id");

		expect(qb.getQuery()).toBe(
			"SELECT u.*, c.amount, a.resource_type FROM users u " +
			"LEFT JOIN user_credits c ON u.user_id = c.user_id " +
			"LEFT JOIN user_resource_access a ON u.user_id = a.user_id"
		);
		expect(qb.getParameters()).toEqual([]);
	});

	test("should build a SELECT query with ORDER BY", () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const qb = new SQLiteQueryBuilder(db);

		qb.select(["*"]).from("users").orderBy("name");

		expect(qb.getQuery()).toBe("SELECT * FROM users ORDER BY name ASC");
		expect(qb.getParameters()).toEqual([]);
	});

	test("should build a SELECT query with ORDER BY DESC", () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const qb = new SQLiteQueryBuilder(db);

		qb.select(["*"]).from("users").orderBy("name", "DESC");

		expect(qb.getQuery()).toBe("SELECT * FROM users ORDER BY name DESC");
		expect(qb.getParameters()).toEqual([]);
	});

	test("should build a SELECT query with multiple ORDER BY clauses", () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const qb = new SQLiteQueryBuilder(db);

		qb.select(["*"]).from("users").orderBy("role").orderBy("name", "DESC");

		expect(qb.getQuery()).toBe(
			"SELECT * FROM users ORDER BY role ASC, name DESC"
		);
		expect(qb.getParameters()).toEqual([]);
	});

	test("should build a SELECT query with GROUP BY", () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const qb = new SQLiteQueryBuilder(db);

		qb.select(["role", "COUNT(*) as count"]).from("users").groupBy("role");

		expect(qb.getQuery()).toBe(
			"SELECT role, COUNT(*) as count FROM users GROUP BY role"
		);
		expect(qb.getParameters()).toEqual([]);
	});

	test("should build a SELECT query with multiple GROUP BY fields", () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const qb = new SQLiteQueryBuilder(db);

		qb.select(["role", "created_at", "COUNT(*) as count"])
			.from("users")
			.groupBy(["role", "created_at"]);

		expect(qb.getQuery()).toBe(
			"SELECT role, created_at, COUNT(*) as count FROM users GROUP BY role, created_at"
		);
		expect(qb.getParameters()).toEqual([]);
	});

	test("should build a SELECT query with HAVING", () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const qb = new SQLiteQueryBuilder(db);

		qb.select(["role", "COUNT(*) as count"])
			.from("users")
			.groupBy("role")
			.having("COUNT(*) > ?", 1);

		expect(qb.getQuery()).toBe(
			"SELECT role, COUNT(*) as count FROM users GROUP BY role HAVING COUNT(*) > ?"
		);
		expect(qb.getParameters()).toEqual([1]);
	});

	test("should build a SELECT query with LIMIT", () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const qb = new SQLiteQueryBuilder(db);

		qb.select(["*"]).from("users").limit(10);

		expect(qb.getQuery()).toBe("SELECT * FROM users LIMIT 10");
		expect(qb.getParameters()).toEqual([]);
	});

	test("should build a SELECT query with LIMIT and OFFSET", () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const qb = new SQLiteQueryBuilder(db);

		qb.select(["*"]).from("users").limit(10).offset(20);

		expect(qb.getQuery()).toBe("SELECT * FROM users LIMIT 10 OFFSET 20");
		expect(qb.getParameters()).toEqual([]);
	});

	test("should build a complex SELECT query", () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const qb = new SQLiteQueryBuilder(db);

		qb.select([
			"u.name",
			"COUNT(c.credit_id) as credit_count",
			"SUM(c.amount) as total_credits",
		])
			.from("users", "u")
			.leftJoin("user_credits", "c", "u.user_id = c.user_id")
			.where("u.role = ?", "user")
			.groupBy("u.user_id")
			.having("COUNT(c.credit_id) > ?", 0)
			.orderBy("total_credits", "DESC")
			.limit(5);

		expect(qb.getQuery()).toBe(
			"SELECT u.name, COUNT(c.credit_id) as credit_count, SUM(c.amount) as total_credits " +
			"FROM users u LEFT JOIN user_credits c ON u.user_id = c.user_id " +
			"WHERE (u.role = ?) GROUP BY u.user_id " +
			"HAVING COUNT(c.credit_id) > ? ORDER BY total_credits DESC LIMIT 5"
		);
		expect(qb.getParameters()).toEqual(["user", 0]);
	});

	test("should execute a query and return results", async () => {
		// Generate test data first with a unique email
		await generateTestData({
			count: 2,
			withRelations: false,
			fixedValues: {
				User: {
					name: "Pet Store Owner",
					email: "query-test-1@example.com",
					role: "admin"
				}
			}
		});

		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const qb = new SQLiteQueryBuilder(db);

		const results = await qb.select(["*"]).from("users").execute<UserRecord>();

		// We should have at least the test data we created
		expect(results.length).toBeGreaterThan(0);
		// Find our test user
		const testUser = results.find(user => user.email === "query-test-1@example.com");
		expect(testUser).toBeDefined();
		expect(testUser?.name).toBe("Pet Store Owner");
	});

	test("should execute a query with parameters", async () => {
		// Generate test data first with admin role
		await generateTestData({
			count: 2,
			withRelations: false,
			fixedValues: {
				User: {
					name: "Admin User",
					email: "query-test-2@example.com",
					role: "admin"
				}
			}
		});

		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const qb = new SQLiteQueryBuilder(db);

		const results = await qb
			.select(["*"])
			.from("users")
			.where("role = ?", "admin")
			.execute<UserRecord>();

		// We expect at least our admin user
		expect(results.length).toBeGreaterThan(0);
		const adminUser = results.find(user => user.email === "query-test-2@example.com");
		expect(adminUser).toBeDefined();
		expect(adminUser?.role).toBe("admin");
	});

	test("should get a single result", async () => {
		// Generate test data with a specific email
		await generateTestData({
			count: 1,
			withRelations: false,
			fixedValues: {
				User: {
					name: "Single Result User",
					email: "query-test-3@example.com",
					role: "user"
				}
			}
		});

		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const qb = new SQLiteQueryBuilder(db);

		const result = await qb
			.select(["*"])
			.from("users")
			.where("email = ?", "query-test-3@example.com")
			.getOne<UserRecord>();

		expect(result).toBeDefined();
		expect(result?.name).toBe("Single Result User");
	});

	test("should return undefined for non-existent single result", async () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const qb = new SQLiteQueryBuilder(db);

		const result = await qb
			.select(["*"])
			.from("users")
			.where("email = ?", "nonexistent@example.com")
			.getOne<UserRecord>();

		expect(result).toBeUndefined();
	});

	test("should get count", async () => {
		// Generate exactly 3 users with unique emails
		await generateTestData({
			count: 3,
			withRelations: false,
			fixedValues: {
				User: {
					role: "user"
				}
			},
			customGenerators: {
				name: (entity) => entity === 'User' ? `Count Test User ${Math.random()}` : faker.person.fullName(),
				email: (entity) => entity === 'User' ? `count-test-${Math.random()}@example.com` : faker.internet.email()
			}
		});

		const framework = getTestFramework();
		const context = framework.getContext();
		const db = context.getDatabase();

		// First check how many users we actually have
		const userManager = context.getEntityManager('User');
		const allUsers = await userManager.findBy({});

		// Create a query builder to count records
		const qb = new SQLiteQueryBuilder(db);
		const count = await qb.select(["*"]).from("users").getCount();

		// We should have exactly the same number we found with the entity manager
		expect(count).toBe(allUsers.length);
	});

	test("should get count with conditions", async () => {
		// First clean up any existing users
		const framework = getTestFramework();
		const context = framework.getContext();
		const db = context.getDatabase();
		const userManager = context.getEntityManager('User');

		// Create exactly 3 admin users directly
		for (let i = 0; i < 3; i++) {
			await userManager.create({
				name: `Admin Count Test ${i}`,
				email: `admin-count-${i}@example.com`,
				role: "admin",
				password: "admin123"
			});
		}

		// Create a query builder to count admin records
		const qb = new SQLiteQueryBuilder(db);
		const count = await qb
			.select(["*"])
			.from("users")
			.where("role = ?", "admin")
			.getCount();

		// We should have exactly 3 admin users
		expect(count).toBe(3);
	});

	test("should handle edge cases with empty IN condition", async () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const qb = new SQLiteQueryBuilder(db);

		const results = await qb
			.select(["*"])
			.from("users")
			.where({ field: "user_id", operator: "IN", value: [] })
			.execute<UserRecord>();

		expect(results).toHaveLength(0); // Should return no results for empty IN condition
	});

	// Skip tests that rely on complex relationships until we create that test data
	test.skip("should handle complex joins with multiple conditions", async () => {
		// This test requires complex test data setup
	});

	test("should handle raw SQL expressions", async () => {
		// Generate test data for the query
		await generateTestData({
			count: 1,
			withRelations: false,
			fixedValues: {
				User: {
					name: "raw sql test",
					email: "raw-sql@example.com",
					role: "user"
				}
			}
		});

		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const qb = new SQLiteQueryBuilder(db);

		qb.select(["*"]).from("users").selectRaw("UPPER(name) as uppercase_name");

		const results = await qb.execute<UserRecord>();

		expect(results.length).toBeGreaterThan(0);
		const testUser = results.find(user => user.email === "raw-sql@example.com");
		expect(testUser).toBeDefined();
		expect(testUser?.uppercase_name).toBe("RAW SQL TEST");
	});
});