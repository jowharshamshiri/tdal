// entity-dao.test.ts
import {
	setupTestEnvironment,
	teardownTestEnvironment,
	getTestFramework,
	generateTestData,
	cleanupTestData
} from '../test-setup';
import { EntityDao } from '../../src/entity';
import { faker } from '@faker-js/faker';

// Define interface for User entity based on test-app.yaml
interface User {
	user_id?: number;
	name: string;
	email: string;
	password?: string;
	role: string;
	created_at?: string;
	updated_at?: string;
	last_login?: string;
}

// Helper function to generate a unique email
function uniqueEmail(prefix: string = ''): string {
	const timestamp = Date.now();
	const random = Math.floor(Math.random() * 10000);
	return `${prefix}${timestamp}-${random}@example.com`;
}

describe("Entity Manager Operations", () => {
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

	afterEach(async () => {
		// Clean up any test data created during the test
		await cleanupTestData();
	});

	test("should find entity by ID", async () => {
		// Generate test data first with a unique email
		const uniqueOwnerEmail = uniqueEmail('owner');
		await generateTestData({
			count: 1,
			withRelations: false,
			fixedValues: {
				User: {
					name: 'Pet Store Owner',
					email: uniqueOwnerEmail,
					role: 'admin',
					password: 'hashedpwd123'
				}
			}
		});

		// Get the framework and entity manager
		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');

		// First find a user to get their ID
		const users = await userManager.findBy({ email: uniqueOwnerEmail });
		expect(users.length).toBeGreaterThan(0);
		const userId = users[0].user_id;

		const user = await userManager.findById(userId!);

		expect(user).toBeDefined();
		expect(user?.name).toBe("Pet Store Owner");
		expect(user?.email).toBe(uniqueOwnerEmail);
	});

	test("should return undefined when entity not found by ID", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');

		const user = await userManager.findById(999999);

		expect(user).toBeUndefined();
	});

	test("should find all entities", async () => {
		// Generate test data first with unique emails
		const uniqueOwnerEmail = uniqueEmail('owner2');
		const uniqueDoggyEmail = uniqueEmail('doggy2');

		await generateTestData({
			count: 2,
			withRelations: false,
			fixedValues: {
				User: {
					name: 'Pet Store Owner',
					email: uniqueOwnerEmail,
					role: 'admin',
					password: 'hashedpwd123'
				}
			},
			customGenerators: {
				email: (entity) => entity === 'User' ? uniqueDoggyEmail : faker.internet.email()
			}
		});

		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');

		const users = await userManager.findBy({});

		// We should have at least our fixed user plus any faker-generated ones
		expect(users.length).toBeGreaterThan(0);
		// Find our fixed test user
		const testUser = users.find(u => u.email === uniqueOwnerEmail);
		expect(testUser).toBeDefined();
		expect(testUser?.name).toBe("Pet Store Owner");
	});

	test("should find entities with query options", async () => {
		// Generate test data first with unique email
		const uniqueOwnerEmail = uniqueEmail('owner3');
		await generateTestData({
			count: 2,
			withRelations: false,
			fixedValues: {
				User: {
					name: 'Pet Store Owner',
					email: uniqueOwnerEmail,
					role: 'admin',
					password: 'hashedpwd123'
				}
			}
		});

		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');

		// Get a user to ensure we have data
		const allUsers = await userManager.findBy({});
		expect(allUsers.length).toBeGreaterThan(0);

		// Test with ordering and limit
		const users = await userManager.findBy(
			{}, // empty filter
			{
				fields: ["name", "email"],
				orderBy: [{ field: "name", direction: "DESC" }],
				limit: 1
			}
		);

		expect(users).toHaveLength(1);
		// Since we order by name DESC, the results depend on the data
		// Just check we got valid results with the expected fields
		expect(users[0].name).toBeDefined();
		expect(users[0].email).toBeDefined();
		expect(users[0].password).toBeUndefined(); // Not selected
	});

	test("should find entities by conditions", async () => {
		// Generate test data first with unique email
		const uniqueOwnerEmail = uniqueEmail('owner4');
		await generateTestData({
			count: 2,
			withRelations: false,
			fixedValues: {
				User: {
					name: 'Pet Store Owner',
					email: uniqueOwnerEmail,
					role: 'admin',
					password: 'hashedpwd123'
				}
			}
		});

		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');

		const users = await userManager.findBy({ role: "admin" });

		expect(users.length).toBeGreaterThan(0);
		// Find our test admin user
		const adminUser = users.find(u => u.email === uniqueOwnerEmail);
		expect(adminUser).toBeDefined();
		expect(adminUser?.name).toBe("Pet Store Owner");
	});

	test("should find one entity by specific conditions", async () => {
		// Generate test data with a specific email
		const uniqueDoggyEmail = uniqueEmail('doggy');
		await generateTestData({
			count: 1,
			withRelations: false,
			fixedValues: {
				User: {
					name: 'Dog Lover',
					email: uniqueDoggyEmail,
					role: 'user',
					password: 'woof123'
				}
			}
		});

		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');

		const users = await userManager.findBy({ email: uniqueDoggyEmail });

		// Should find exactly one user with this email
		expect(users.length).toBe(1);
		expect(users[0].email).toBe(uniqueDoggyEmail);
	});

	test("should count entities", async () => {
		// Generate test data first
		await generateTestData({
			count: 2,
			withRelations: false,
			customGenerators: {
				email: () => uniqueEmail('count')
			}
		});

		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');

		const count = await userManager.count({});

		// Should have at least our generated users
		expect(count).toBeGreaterThan(0);
	});

	test("should count entities with conditions", async () => {
		// Generate test data first with unique email
		const uniqueAdminEmail = uniqueEmail('admin');
		await generateTestData({
			count: 1,
			withRelations: false,
			fixedValues: {
				User: {
					name: 'Admin User',
					email: uniqueAdminEmail,
					role: 'admin',
					password: 'admin123'
				}
			}
		});

		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');

		const count = await userManager.count({ role: "admin" });

		// Should have at least our fixed admin user
		expect(count).toBeGreaterThan(0);
	});

	test("should create an entity", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');

		const newUser: Partial<User> = {
			name: "New User",
			email: uniqueEmail('new-user-test'),
			password: "hashedpwd555",
			role: "user",
		};

		const id = await userManager.create(newUser);

		expect(id).toBeGreaterThan(0);

		// Verify creation
		const user = await userManager.findById(id);
		expect(user).toBeDefined();
		expect(user?.name).toBe("New User");
	});

	test("should update an entity", async () => {
		// Create a user first with unique email
		const uniqueUpdateEmail = uniqueEmail('update-test');
		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');

		const id = await userManager.create({
			name: "User To Update",
			email: uniqueUpdateEmail,
			password: "hashedpwd123",
			role: "user"
		});

		// Update the user
		const changes = await userManager.update(id, {
			name: "Updated Admin"
		});

		expect(changes).toBe(1);

		// Verify update
		const user = await userManager.findById(id);
		expect(user).toBeDefined();
		expect(user?.name).toBe("Updated Admin");
	});

	test("should delete an entity", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');

		// Create a user specifically for deletion with unique email
		const uniqueDeleteEmail = uniqueEmail('delete-test');
		const id = await userManager.create({
			name: "User To Delete",
			email: uniqueDeleteEmail,
			password: "hashedpwd777",
			role: "user"
		});

		// Delete the user
		const changes = await userManager.delete(id);

		expect(changes).toBe(1);

		// Verify deletion
		const user = await userManager.findById(id);
		expect(user).toBeUndefined();
	});

	test("should check if entity exists", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');

		// Create a user first with unique email
		const uniqueExistsEmail = uniqueEmail('exists-test');
		const id = await userManager.create({
			name: "Exists Test User",
			email: uniqueExistsEmail,
			password: "hashedpwd456",
			role: "user"
		});

		// Check if the user exists
		const exists = await userManager.exists(id);
		expect(exists).toBe(true);

		// Check a non-existent ID
		const notExists = await userManager.exists(999999);
		expect(notExists).toBe(false);
	});

	test("should perform a transaction", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const db = context.getDatabase();

		const uniqueTxEmail = uniqueEmail('transaction-test');

		// Start a transaction
		await db.transaction(async (tx) => {
			// Get the entity manager for the transaction context
			const txUserManager = context.getEntityManager<User>('User');

			await txUserManager.create({
				name: "Transaction User",
				email: uniqueTxEmail,
				password: "hashedpwd999",
				role: "user"
			});
		});

		// Verify transaction was committed
		const userManager = context.getEntityManager<User>('User');
		const users = await userManager.findBy({ email: uniqueTxEmail });
		expect(users.length).toBe(1);
		expect(users[0].name).toBe("Transaction User");
	});

	test("should rollback a transaction on error", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const db = context.getDatabase();

		const uniqueRollbackEmail = uniqueEmail('rollback-test');

		try {
			// Start a transaction that will fail
			await db.transaction(async (tx) => {
				// Get the entity manager
				const txUserManager = context.getEntityManager<User>('User');

				await txUserManager.create({
					name: "Transaction User",
					email: uniqueRollbackEmail,
					password: "hashedpwd999",
					role: "user"
				});

				// This should cause a constraint violation
				await txUserManager.create({
					name: "Duplicate User",
					email: uniqueRollbackEmail, // Same email
					password: "hashedpwd888",
					role: "user"
				});
			});
			// If we reach here, something went wrong
			fail("Transaction should have failed with constraint violation");
		} catch (error: any) {
			// Expected error - transaction should be rolled back
			expect(error).toBeDefined();
		}

		// Verify transaction was rolled back
		const userManager = context.getEntityManager<User>('User');
		const users = await userManager.findBy({ email: uniqueRollbackEmail });
		expect(users.length).toBe(0);
	});
});