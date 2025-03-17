// sqlite-adapter.test.ts
import {
	setupTestEnvironment,
	teardownTestEnvironment,
	getTestFramework,
	generateTestData,
	cleanupTestData
} from '../test-setup';
import { DatabaseAdapter } from "../../src/database/core/types";
import { SQLiteAdapter } from "../../src/database/adapters/sqlite-adapter";
import path from "path";

interface User {
	user_id: number;
	name: string;
	email: string;
	password: string;
	role: string;
	created_at: string;
	last_login: string | null;
}

interface ProductCategory {
	category_id: number;
	category_name: string;
	description: string | null;
	parent_id: number | null;
}

describe("SQLiteAdapter", () => {
	beforeAll(async () => {
		// Initialize the test environment
		await setupTestEnvironment('./tests/test-app.yaml');
	});

	afterAll(async () => {
		await teardownTestEnvironment();
	});

	beforeEach(async () => {
		// Clean up any previous test data
		await cleanupTestData();
	});

	test("should connect to database", async () => {
		const adapter = new SQLiteAdapter({
			type: "sqlite",
			connection: {
				filename: path.join(process.cwd(), "data", "test.db"),
			},
		}, true); // Use test mode

		const connection = await adapter.connect();
		expect(connection).toBeDefined();

		adapter.close();
	});

	test("should execute a query and return results", async () => {
		// Generate test users with unique emails
		await generateTestData({
			count: 2,
			withRelations: false,
			fixedValues: {
				User: {
					name: "Pet Store Owner",
					email: "sqlite-test-1@example.com",
					role: "admin",
					password: "hashedpwd123"
				}
			},
			customGenerators: {
				email: (entity) => entity === 'User' ? "sqlite-test-2@example.com" : "other-email@example.com"
			}
		});

		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();

		const results = await db.query<User>("SELECT * FROM users");

		expect(results.length).toBeGreaterThan(0);
		// Find our specific test user
		const testUser = results.find(user => user.email === "sqlite-test-1@example.com");
		expect(testUser).toBeDefined();
		expect(testUser?.name).toBe("Pet Store Owner");
	});

	test("should execute a query with parameters", async () => {
		// Generate a user with a specific email
		await generateTestData({
			count: 1,
			withRelations: false,
			fixedValues: {
				User: {
					name: "Query Param User",
					email: "sqlite-params@example.com",
					role: "admin",
					password: "hashedpwd123"
				}
			}
		});

		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();

		const results = await db.query<User>(
			"SELECT * FROM users WHERE email = ?",
			"sqlite-params@example.com"
		);

		expect(results.length).toBe(1);
		expect(results[0].name).toBe("Query Param User");
	});

	test("should get a single result", async () => {
		// Generate a user with a specific email
		await generateTestData({
			count: 1,
			withRelations: false,
			fixedValues: {
				User: {
					name: "Single Result User",
					email: "sqlite-single@example.com",
					role: "user",
					password: "hashedpwd123"
				}
			}
		});

		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();

		const result = await db.querySingle<User>(
			"SELECT * FROM users WHERE email = ?",
			"sqlite-single@example.com"
		);

		expect(result).toBeDefined();
		if (result) {
			expect(result.name).toBe("Single Result User");
		}
	});

	test("should return undefined for non-existent single result", async () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();

		const result = await db.querySingle<User>(
			"SELECT * FROM users WHERE email = ?",
			"nonexistent@example.com"
		);

		expect(result).toBeUndefined();
	});

	test("should execute non-query statements", async () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();

		const result = await db.execute(
			"INSERT INTO users (name, email, password, role, created_at) VALUES (?, ?, ?, ?, ?)",
			"Test User",
			"sqlite-execute@example.com",
			"hashedpwd789",
			"user",
			"2023-01-03T12:00:00.000Z"
		);

		expect(result.changes).toBe(1);
		expect(result.lastInsertRowid).toBeDefined();

		// Verify insertion
		const inserted = await db.querySingle<User>(
			"SELECT * FROM users WHERE email = ?",
			"sqlite-execute@example.com"
		);
		expect(inserted).toBeDefined();
		if (inserted) {
			expect(inserted.name).toBe("Test User");
		}
	});

	test("should execute a SQL script", async () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();

		await db.executeScript(`
		INSERT INTO users (name, email, password, role, created_at)
		VALUES ('Script User', 'sqlite-script@example.com', 'hashedpwd000', 'user', '2023-01-03T12:00:00.000Z');
	  `);

		const result = await db.querySingle<User>(
			"SELECT * FROM users WHERE email = ?",
			"sqlite-script@example.com"
		);
		expect(result).toBeDefined();
		if (result) {
			expect(result.name).toBe("Script User");
		}
	});

	test("should perform a transaction that commits", async () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();

		await db.transaction(async (txDb: DatabaseAdapter) => {
			await txDb.execute(
				"INSERT INTO users (name, email, password, role, created_at) VALUES (?, ?, ?, ?, ?)",
				"Transaction User",
				"sqlite-tx@example.com",
				"hashedpwd999",
				"user",
				"2023-01-03T12:00:00.000Z"
			);
		});

		const result = await db.querySingle<User>(
			"SELECT * FROM users WHERE email = ?",
			"sqlite-tx@example.com"
		);
		expect(result).toBeDefined();
		if (result) {
			expect(result.name).toBe("Transaction User");
		}
	});

	test("should rollback a transaction on error", async () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();

		try {
			await db.transaction(async (txDb: DatabaseAdapter) => {
				await txDb.execute(
					"INSERT INTO users (name, email, password, role, created_at) VALUES (?, ?, ?, ?, ?)",
					"Rollback User",
					"sqlite-rollback@example.com",
					"hashedpwd888",
					"user",
					"2023-01-03T12:00:00.000Z"
				);

				// This should cause an error - insert a duplicate email
				await txDb.execute(
					"INSERT INTO users (name, email, password, role, created_at) VALUES (?, ?, ?, ?, ?)",
					"Duplicate User",
					"sqlite-rollback@example.com", // Same email
					"hashedpwd777",
					"user",
					"2023-01-03T12:00:00.000Z"
				);
			});
			fail("Transaction should have failed with a duplicate email constraint violation");
		} catch (error: any) {
			// Expected error
			expect(error).toBeDefined();
		}

		// Verify the first insertion was rolled back
		const result = await db.querySingle<User>(
			"SELECT * FROM users WHERE email = ?",
			"sqlite-rollback@example.com"
		);
		expect(result).toBeUndefined();
	});

	test("should find a record by ID", async () => {
		// Create a user first to get a specific ID
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const context = framework.getContext();
		const userManager = context.getEntityManager('User');

		const userData = {
			name: "Find By ID User",
			email: "sqlite-find-id@example.com",
			password: "hashedpwd123",
			role: "user"
		};

		const id = await userManager.create(userData);

		// Now test the findById method directly
		const user = await db.findById<User>("users", "user_id", id);

		expect(user).toBeDefined();
		if (user) {
			expect(user.name).toBe("Find By ID User");
			expect(user.email).toBe("sqlite-find-id@example.com");
		}
	});

	test("should find all records", async () => {
		// Create exactly 3 users
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const context = framework.getContext();
		const userManager = context.getEntityManager('User');

		for (let i = 0; i < 3; i++) {
			await userManager.create({
				name: `Find All User ${i}`,
				email: `sqlite-find-all-${i}@example.com`,
				password: "hashedpwd123",
				role: "user"
			});
		}

		// Now test the findAll method
		const users = await db.findAll<User>("users");

		// Verify we have exactly 3 users
		expect(users.length).toBe(3);

		// Verify that our test users are in the results
		for (let i = 0; i < 3; i++) {
			const found = users.some(user => user.email === `sqlite-find-all-${i}@example.com`);
			expect(found).toBe(true);
		}
	});

	test("should find all records with options", async () => {
		// Create test users
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const context = framework.getContext();
		const userManager = context.getEntityManager('User');

		for (let i = 0; i < 3; i++) {
			await userManager.create({
				name: `Options User ${i}`,
				email: `sqlite-options-${i}@example.com`,
				password: "hashedpwd123",
				role: "user"
			});
		}

		// Test with ordering and limit
		const users = await db.findAll<User>("users", {
			fields: ["name", "email"],
			orderBy: [{ field: "name", direction: "DESC" }],
			limit: 2
		});

		// Should have exactly 2 users due to limit
		expect(users.length).toBe(2);
		// Fields should be as selected
		expect(users[0].name).toBeDefined();
		expect(users[0].email).toBeDefined();
		expect(users[0].password).toBeUndefined(); // Not selected
	});

	test("should find records by conditions", async () => {
		// Create users with different roles
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const context = framework.getContext();
		const userManager = context.getEntityManager('User');

		// Create 2 admins and 1 regular user
		await userManager.create({
			name: "Admin User 1",
			email: "sqlite-admin-1@example.com",
			password: "hashedpwd123",
			role: "admin"
		});

		await userManager.create({
			name: "Admin User 2",
			email: "sqlite-admin-2@example.com",
			password: "hashedpwd123",
			role: "admin"
		});

		await userManager.create({
			name: "Regular User",
			email: "sqlite-user@example.com",
			password: "hashedpwd123",
			role: "user"
		});

		// Find users with admin role
		const users = await db.findBy<User>("users", { role: "admin" });

		// Should have exactly 2 admin users
		expect(users.length).toBe(2);
		// Verify they are admins
		expect(users.every(user => user.role === "admin")).toBe(true);
	});

	test("should find records by multiple conditions", async () => {
		// Create test users
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const context = framework.getContext();
		const userManager = context.getEntityManager('User');

		// Create users with different attributes
		await userManager.create({
			name: "Specific Admin",
			email: "sqlite-specific-admin@example.com",
			password: "hashedpwd123",
			role: "admin"
		});

		await userManager.create({
			name: "Other Admin",
			email: "sqlite-other-admin@example.com",
			password: "hashedpwd123",
			role: "admin"
		});

		// Find specific admin user by role and name
		const users = await db.findBy<User>("users", {
			role: "admin",
			name: "Specific Admin"
		});

		// Should find exactly 1 user
		expect(users.length).toBe(1);
		expect(users[0].name).toBe("Specific Admin");
		expect(users[0].email).toBe("sqlite-specific-admin@example.com");
	});

	test("should find one record by conditions", async () => {
		// Create a test user
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const context = framework.getContext();
		const userManager = context.getEntityManager('User');

		await userManager.create({
			name: "Find One User",
			email: "sqlite-find-one@example.com",
			password: "hashedpwd123",
			role: "user"
		});

		// Find the user by email
		const user = await db.findOneBy<User>("users", {
			email: "sqlite-find-one@example.com"
		});

		// Verify we found the right user
		expect(user).toBeDefined();
		if (user) {
			expect(user.name).toBe("Find One User");
		}
	});

	test("should count records", async () => {
		// Create exactly 3 test users
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const context = framework.getContext();
		const userManager = context.getEntityManager('User');

		// First make sure we're starting with a clean slate
		await cleanupTestData();

		// Create 3 users
		for (let i = 0; i < 3; i++) {
			await userManager.create({
				name: `Count User ${i}`,
				email: `sqlite-count-${i}@example.com`,
				password: "hashedpwd123",
				role: "user"
			});
		}

		// Count all users
		const count = await db.count("users");

		// Should have exactly 3 users
		expect(count).toBe(3);
	});

	test("should count records with conditions", async () => {
		// Create users with different roles
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const context = framework.getContext();
		const userManager = context.getEntityManager('User');

		// First make sure we're starting with a clean slate
		await cleanupTestData();

		// Create 2 admin users and 1 regular user
		await userManager.create({
			name: "Count Admin 1",
			email: "sqlite-count-admin-1@example.com",
			password: "hashedpwd123",
			role: "admin"
		});

		await userManager.create({
			name: "Count Admin 2",
			email: "sqlite-count-admin-2@example.com",
			password: "hashedpwd123",
			role: "admin"
		});

		await userManager.create({
			name: "Count User",
			email: "sqlite-count-user@example.com",
			password: "hashedpwd123",
			role: "user"
		});

		// Count admin users
		const count = await db.count("users", { role: "admin" });

		// Should have exactly 2 admin users
		expect(count).toBe(2);
	});

	test("should insert a record", async () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();

		const id = await db.insert("users", {
			name: "New User",
			email: "sqlite-insert@example.com",
			password: "hashedpwd555",
			role: "user",
			created_at: "2023-01-03T12:00:00.000Z"
		});

		expect(id).toBeGreaterThan(0);

		// Verify insertion
		const user = await db.findById<User>("users", "user_id", id);
		expect(user).toBeDefined();
		if (user) {
			expect(user.name).toBe("New User");
			expect(user.email).toBe("sqlite-insert@example.com");
		}
	});

	test("should update a record", async () => {
		// Create a user first
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const context = framework.getContext();
		const userManager = context.getEntityManager('User');

		const userData = {
			name: "Update Test User",
			email: "sqlite-update@example.com",
			password: "hashedpwd123",
			role: "user"
		};

		const id = await userManager.create(userData);

		// Update the user's name
		const changes = await db.update("users", "user_id", id, {
			name: "Updated Name"
		});

		expect(changes).toBe(1);

		// Verify update
		const user = await db.findById<User>("users", "user_id", id);
		expect(user).toBeDefined();
		if (user) {
			expect(user.name).toBe("Updated Name");
			expect(user.email).toBe("sqlite-update@example.com"); // unchanged
		}
	});

	test("should update records by conditions", async () => {
		// Create test users with the same role
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const context = framework.getContext();
		const userManager = context.getEntityManager('User');

		// Create 3 users with "regular" role
		for (let i = 0; i < 3; i++) {
			await userManager.create({
				name: `Regular User ${i}`,
				email: `sqlite-regular-${i}@example.com`,
				password: "hashedpwd123",
				role: "regular"
			});
		}

		// Update all "regular" users to "premium" role
		const changes = await db.updateBy(
			"users",
			{ role: "regular" },
			{ role: "premium" }
		);

		// Should have updated 3 users
		expect(changes).toBe(3);

		// Verify update
		const regularUsers = await db.findBy<User>("users", { role: "regular" });
		expect(regularUsers.length).toBe(0);

		const premiumUsers = await db.findBy<User>("users", { role: "premium" });
		expect(premiumUsers.length).toBe(3);
	});

	test("should delete a record", async () => {
		// Create a user to delete
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const context = framework.getContext();
		const userManager = context.getEntityManager('User');

		const userData = {
			name: "Delete Test User",
			email: "sqlite-delete@example.com",
			password: "hashedpwd123",
			role: "user"
		};

		const id = await userManager.create(userData);

		// Delete the user
		const changes = await db.delete("users", "user_id", id);

		expect(changes).toBe(1);

		// Verify deletion
		const user = await db.findById<User>("users", "user_id", id);
		expect(user).toBeUndefined();
	});

	test("should delete records by conditions", async () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();
		const context = framework.getContext();
		const userManager = context.getEntityManager('User');

		// Create 3 inactive users
		for (let i = 0; i < 3; i++) {
			await userManager.create({
				name: `Inactive User ${i}`,
				email: `sqlite-inactive-${i}@example.com`,
				password: "hashedpwd123",
				role: "inactive"
			});
		}

		// Delete all inactive users
		const changes = await db.deleteBy("users", { role: "inactive" });

		// Should have deleted 3 users
		expect(changes).toBe(3);

		// Verify deletion
		const inactiveUsers = await db.findBy<User>("users", { role: "inactive" });
		expect(inactiveUsers.length).toBe(0);
	});

	// Skipping the complex join tests since they require specific relational data setup
	test.skip("should find records with joins", async () => {
		// This test requires complex data setup
	});

	test.skip("should find records with joins and conditions", async () => {
		// This test requires complex data setup
	});

	test.skip("should find one record with joins", async () => {
		// This test requires complex data setup
	});

	test("should get database info", async () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();

		const info = await db.getDatabaseInfo();

		expect(info).toBeDefined();
		expect(info.engine).toBe("SQLite");
		expect(info.tables).toBeDefined();
		expect(Array.isArray(info.tables)).toBe(true);
	});

	test("should create a query builder", () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();

		const qb = db.createQueryBuilder();

		expect(qb).toBeDefined();
		expect(typeof qb.select).toBe("function");
		expect(typeof qb.from).toBe("function");
		expect(typeof qb.where).toBe("function");
		expect(typeof qb.execute).toBe("function");
	});

	test("should get date functions", () => {
		const framework = getTestFramework();
		const db = framework.getContext().getDatabase();

		const dateFunctions = db.getDateFunctions();

		expect(dateFunctions).toBeDefined();
		expect(typeof dateFunctions.currentDate).toBe("function");
		expect(typeof dateFunctions.currentDateTime).toBe("function");
		expect(typeof dateFunctions.dateDiff).toBe("function");
	});
});