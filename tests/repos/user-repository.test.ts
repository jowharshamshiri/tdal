// user-repository.test.ts
import {
	setupTestEnvironment,
	teardownTestEnvironment,
	getTestFramework,
	generateTestData,
	cleanupTestData
} from '../test-setup';

// Define interface for User entity based on test-app.yaml
interface User {
	user_id?: number;
	name: string;
	email: string;
	password?: string;
	role: string;
	created_at?: string;
	last_login?: string;
}

// Interface for user resource access
interface UserResourceAccess {
	access_id?: number;
	user_id: number;
	resource_type: string;
	resource_id: number;
	credit_cost: number;
	access_date: string;
	created_at?: string;
}

// Helper function to generate a unique name with timestamp and random suffix
function uniqueName(prefix: string = ''): string {
	const timestamp = Date.now();
	const random = Math.floor(Math.random() * 10000);
	return `${prefix}-${timestamp}-${random}`;
}

// Helper function to generate a unique email
function uniqueEmail(prefix: string = ''): string {
	const name = uniqueName(prefix);
	return `${name}@example.com`;
}

describe("User Entity Operations", () => {
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

	test("should find user by email", async () => {
		// Create unique email for this test
		const uniqueUserEmail = uniqueEmail('owner');

		// Generate test data with fixed values for predictable test results
		await generateTestData({
			count: 1,
			withRelations: false,
			fixedValues: {
				User: {
					name: 'Pet Store Owner',
					email: uniqueUserEmail,
					role: 'admin'
				}
			}
		});

		// Get the framework and entity manager
		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');

		// Use the entity manager to find by condition
		const users = await userManager.findBy({ email: uniqueUserEmail });
		const user = users[0];

		expect(user).toBeDefined();
		expect(user.name).toBe("Pet Store Owner");
		expect(user.role).toBe("admin");
	});

	test("should return undefined for non-existent email", async () => {
		// Use a very unlikely email address
		const nonExistentEmail = uniqueEmail('nonexistent-user');

		// Get the framework and entity manager
		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');

		// Use the entity manager to find by condition
		const users = await userManager.findBy({ email: nonExistentEmail });

		expect(users).toHaveLength(0);
	});

	test("should update last login timestamp", async () => {
		const before = new Date();
		const uniqueUserEmail = uniqueEmail('login-test');

		// Generate test data
		await generateTestData({
			count: 1,
			withRelations: false,
			fixedValues: {
				User: {
					name: 'Login Test User',
					email: uniqueUserEmail,
					role: 'user'
				}
			}
		});

		// Get the framework and entity manager
		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');

		// Find the test user first
		const users = await userManager.findBy({ email: uniqueUserEmail });
		const user = users[0];

		// Update the last_login field
		await userManager.update(user.user_id!, {
			last_login: new Date().toISOString()
		});

		// Verify the last_login field was updated
		const updatedUser = await userManager.findById(user.user_id!);
		expect(updatedUser).toBeDefined();
		expect(updatedUser?.last_login).toBeDefined();

		// Verify the timestamp is recent
		if (updatedUser?.last_login) {
			const lastLogin = new Date(updatedUser.last_login);
			expect(lastLogin.getTime()).toBeGreaterThanOrEqual(before.getTime());
		}
	});

	test("should find users with credit balance using query builder", async () => {
		// Create unique email for this test
		const uniqueUserEmail = uniqueEmail('credit-user');

		// Generate test data
		await generateTestData({
			count: 1,
			withRelations: false,
			fixedValues: {
				User: {
					name: 'Credit Test User',
					email: uniqueUserEmail,
					role: 'user'
				}
			}
		});

		// Get the framework and entity managers
		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');
		const db = context.getDatabase();

		// Find the user we just created
		const users = await userManager.findBy({ email: uniqueUserEmail });
		const user = users[0];

		// Add credit to the user
		await db.execute(
			"INSERT INTO user_credits (user_id, amount, source, purchase_date, expiry_date) VALUES (?, ?, ?, ?, ?)",
			user.user_id, 100, 'test', new Date().toISOString(),
			new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days from now
		);

		// Build a query to find users with credit balance
		const queryBuilder = db.createQueryBuilder();
		const results = await queryBuilder
			.select(['u.user_id', 'u.name', 'u.role', 'SUM(c.amount) as credit_balance'])
			.from('users', 'u')
			.leftJoin('user_credits', 'c', 'u.user_id = c.user_id')
			.groupBy('u.user_id')
			.orderBy('u.name')
			.execute();

		// Verify we have results
		expect(results.length).toBeGreaterThan(0);

		// Find our test user in the results
		const testUser = results.find(u => u.name === 'Credit Test User');
		expect(testUser).toBeDefined();
		expect(Number(testUser.credit_balance)).toBe(100);
	});

	test("should get user credit details", async () => {
		// Create unique email for this test
		const uniqueUserEmail = uniqueEmail('credit-details');

		// Generate test data
		await generateTestData({
			count: 1,
			withRelations: false,
			fixedValues: {
				User: {
					name: 'Credit Details User',
					email: uniqueUserEmail,
					role: 'user'
				}
			}
		});

		// Get the framework and entity managers
		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');
		const db = context.getDatabase();

		// Find the user we just created
		const users = await userManager.findBy({ email: uniqueUserEmail });
		const user = users[0];

		// Add two credit entries to the user
		await db.execute(
			"INSERT INTO user_credits (user_id, amount, source, purchase_date, expiry_date) VALUES (?, ?, ?, ?, ?)",
			user.user_id, 50, 'purchase', new Date().toISOString(),
			new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days from now
		);

		await db.execute(
			"INSERT INTO user_credits (user_id, amount, source, purchase_date, expiry_date) VALUES (?, ?, ?, ?, ?)",
			user.user_id, 10, 'bonus', new Date().toISOString(),
			new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString() // 15 days from now
		);

		// Get the user's credits using a query builder
		const creditQuery = db.createQueryBuilder();
		const userCredits = await creditQuery
			.select('*')
			.from('user_credits')
			.where('user_id = ?', user.user_id)
			.execute();

		// Calculate the total credit balance
		const totalBalance = userCredits.reduce((sum, credit) => sum + Number(credit.amount), 0);

		expect(userCredits.length).toBe(2);
		expect(totalBalance).toBe(60);
	});

	test("should change user password", async () => {
		// Create unique email for this test
		const uniqueUserEmail = uniqueEmail('password-change');

		// Generate test data
		await generateTestData({
			count: 1,
			withRelations: false,
			fixedValues: {
				User: {
					name: 'Password Test User',
					email: uniqueUserEmail,
					role: 'user',
					password: 'oldhashpassword'
				}
			}
		});

		// Get the framework and entity manager
		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');

		// Find the test user first
		const users = await userManager.findBy({ email: uniqueUserEmail });
		const user = users[0];

		// Update the password
		await userManager.update(user.user_id!, {
			password: "newhashpassword"
		});

		// Verify password change
		const updatedUser = await userManager.findById(user.user_id!);
		expect(updatedUser).toBeDefined();
		expect(updatedUser?.password).toBe("newhashpassword");
	});

	test("should update user profile", async () => {
		// Create unique email for this test
		const uniqueUserEmail = uniqueEmail('profile-update');
		const newEmail = uniqueEmail('new-profile');

		// Generate test data
		await generateTestData({
			count: 1,
			withRelations: false,
			fixedValues: {
				User: {
					name: 'Profile Test User',
					email: uniqueUserEmail,
					role: 'user'
				}
			}
		});

		// Get the framework and entity manager
		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');

		// Find the test user first
		const users = await userManager.findBy({ email: uniqueUserEmail });
		const user = users[0];

		// Update the profile
		await userManager.update(user.user_id!, {
			name: "New User Name",
			email: newEmail
		});

		// Verify profile update
		const updatedUser = await userManager.findById(user.user_id!);
		expect(updatedUser).toBeDefined();
		expect(updatedUser?.name).toBe("New User Name");
		expect(updatedUser?.email).toBe(newEmail);
	});

	test("should retrieve user without password field", async () => {
		// Create unique email for this test
		const uniqueUserEmail = uniqueEmail('secure-profile');

		// Generate test data
		await generateTestData({
			count: 1,
			withRelations: false,
			fixedValues: {
				User: {
					name: 'Secure User',
					email: uniqueUserEmail,
					role: 'user',
					password: 'securepassword'
				}
			}
		});

		// Get the framework and entity manager
		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');
		const db = context.getDatabase();

		// Find the test user first
		const users = await userManager.findBy({ email: uniqueUserEmail });
		const user = users[0];

		// Use query builder to select specific fields (excluding password)
		const queryBuilder = db.createQueryBuilder();
		const profile = await queryBuilder
			.select(['name', 'email', 'role'])
			.from('users')
			.where('user_id = ?', user.user_id)
			.getOne();

		expect(profile).toBeDefined();
		expect(profile.name).toBe("Secure User");
		expect(profile.email).toBe(uniqueUserEmail);
		expect(profile.role).toBe("user");

		// Password should not be included
		expect(Object.prototype.hasOwnProperty.call(profile, "password")).toBe(false);
	});

	test("should get user with resource access history", async () => {
		// Create unique email for this test
		const uniqueUserEmail = uniqueEmail('resource-access');

		// Generate test data
		await generateTestData({
			count: 1,
			withRelations: true,
			fixedValues: {
				User: {
					name: 'Resource Access User',
					email: uniqueUserEmail,
					role: 'user'
				},
				Product: {
					title: uniqueName('Test Product'),
					pricing: 'standard',
					is_free: false,
					credit_cost: 10
				}
			}
		});

		// Get the framework and entity managers
		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');
		const productManager = context.getEntityManager('Product');
		const db = context.getDatabase();

		// Find the user and product we just created
		const users = await userManager.findBy({ email: uniqueUserEmail });
		const user = users[0];

		const products = await productManager.findBy({});
		const product = products[0]; // Get first product

		// Add resource access record
		await db.execute(
			"INSERT INTO user_resource_access (user_id, resource_type, resource_id, credit_cost, access_date, created_at) VALUES (?, ?, ?, ?, ?, ?)",
			user.user_id, 'product', product.product_id, 10, new Date().toISOString(), new Date().toISOString()
		);

		// Add credit to the user
		await db.execute(
			"INSERT INTO user_credits (user_id, amount, source, purchase_date, expiry_date) VALUES (?, ?, ?, ?, ?)",
			user.user_id, 50, 'purchase', new Date().toISOString(),
			new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days from now
		);

		// Use query builder to join user with resource access and credits
		const queryBuilder = db.createQueryBuilder();
		const result = await queryBuilder
			.select([
				'u.user_id',
				'u.name',
				'u.email',
				'u.role',
				'SUM(c.amount) as credit_balance'
			])
			.from('users', 'u')
			.leftJoin('user_credits', 'c', 'u.user_id = c.user_id')
			.where('u.user_id = ?', user.user_id)
			.groupBy('u.user_id')
			.getOne();

		// Get the user's recent access history
		const accessHistoryQuery = db.createQueryBuilder();
		const accessHistory = await accessHistoryQuery
			.select('*')
			.from('user_resource_access')
			.where('user_id = ?', user.user_id)
			.execute();

		// Combine the results
		const userWithHistory = {
			...result,
			recent_access: accessHistory
		};

		expect(userWithHistory).toBeDefined();
		expect(userWithHistory.name).toBe("Resource Access User");
		expect(Array.isArray(userWithHistory.recent_access)).toBe(true);
		expect(userWithHistory.recent_access.length).toBe(1);
		expect(userWithHistory.recent_access[0].resource_type).toBe("product");
		expect(Number(userWithHistory.credit_balance)).toBe(50);
	});
});