// user-repository.test.ts
import { faker } from '@faker-js/faker';
import {
	setupTestEnvironment,
	teardownTestEnvironment,
	getTestFramework,
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
		// Get the framework and entity manager
		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');

		// Create a user with unique email
		const userEmail = faker.internet.email();
		await userManager.create({
			name: 'Pet Store Owner',
			email: userEmail,
			password: faker.internet.password(),
			role: 'admin'
		});

		// Use the entity manager to find by condition
		const users = await userManager.findBy({ email: userEmail });

		expect(users.length).toBe(1);
		expect(users[0].name).toBe("Pet Store Owner");
		expect(users[0].email).toBe(userEmail);
		expect(users[0].role).toBe("admin");
	});

	test("should return empty array for non-existent email", async () => {
		// Use a very unlikely email address
		const nonExistentEmail = `nonexistent-${Date.now()}@example.com`;

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

		// Get the framework and entity manager
		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');

		// Create a user
		const userId = await userManager.create({
			name: 'Login Test User',
			email: faker.internet.email(),
			password: faker.internet.password(),
			role: 'user'
		});

		// Update the last_login field
		const newLoginTime = new Date().toISOString();
		await userManager.update(userId, {
			last_login: newLoginTime
		});

		// Verify the last_login field was updated
		const updatedUser = await userManager.findById(userId);
		expect(updatedUser).toBeDefined();
		expect(updatedUser?.last_login).toBeDefined();

		// Verify the timestamp is recent
		if (updatedUser?.last_login) {
			const lastLogin = new Date(updatedUser.last_login);
			expect(lastLogin.getTime()).toBeGreaterThanOrEqual(before.getTime());
		}
	});

	test("should find users with credit balance using query builder", async () => {
		// Get the framework and entity managers
		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');
		const db = context.getDatabase();

		// Create a user
		const userId = await userManager.create({
			name: 'Credit Test User',
			email: faker.internet.email(),
			password: faker.internet.password(),
			role: 'user'
		});

		// Add credit to the user
		await db.execute(
			"INSERT INTO user_credits (user_id, amount, source, purchase_date, expiry_date) VALUES (?, ?, ?, ?, ?)",
			userId, 100, 'test', new Date().toISOString(),
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
		if (testUser) {
			expect(Number(testUser.credit_balance)).toBe(100);
		}
	});

	test("should get user credit details", async () => {
		// Get the framework and entity managers
		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');
		const db = context.getDatabase();

		// Create a user
		const userId = await userManager.create({
			name: 'Credit Details User',
			email: faker.internet.email(),
			password: faker.internet.password(),
			role: 'user'
		});

		// Add two credit entries to the user
		await db.execute(
			"INSERT INTO user_credits (user_id, amount, source, purchase_date, expiry_date) VALUES (?, ?, ?, ?, ?)",
			userId, 50, 'purchase', new Date().toISOString(),
			new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days from now
		);

		await db.execute(
			"INSERT INTO user_credits (user_id, amount, source, purchase_date, expiry_date) VALUES (?, ?, ?, ?, ?)",
			userId, 10, 'bonus', new Date().toISOString(),
			new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString() // 15 days from now
		);

		// Get the user's credits using a query builder
		const creditQuery = db.createQueryBuilder();
		const userCredits = await creditQuery
			.select('*')
			.from('user_credits')
			.where('user_id = ?', userId)
			.execute();

		// Calculate the total credit balance
		const totalBalance = userCredits.reduce((sum, credit) => sum + Number(credit.amount), 0);

		expect(userCredits.length).toBe(2);
		expect(totalBalance).toBe(60);
	});

	test("should change user password", async () => {
		// Get the framework and entity manager
		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');

		// Create a user
		const userId = await userManager.create({
			name: 'Password Test User',
			email: faker.internet.email(),
			password: 'oldhashpassword',
			role: 'user'
		});

		// Update the password
		await userManager.update(userId, {
			password: "newhashpassword"
		});

		// Verify password change
		const updatedUser = await userManager.findById(userId);
		expect(updatedUser).toBeDefined();
		expect(updatedUser?.password).toBe("newhashpassword");
	});

	test("should update user profile", async () => {
		// Get the framework and entity manager
		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');

		// Create a user
		const userId = await userManager.create({
			name: 'Profile Test User',
			email: faker.internet.email(),
			password: faker.internet.password(),
			role: 'user'
		});

		// Update the profile
		const newName = "New User Name";
		const newEmail = faker.internet.email();

		await userManager.update(userId, {
			name: newName,
			email: newEmail
		});

		// Verify profile update
		const updatedUser = await userManager.findById(userId);
		expect(updatedUser).toBeDefined();
		expect(updatedUser?.name).toBe(newName);
		expect(updatedUser?.email).toBe(newEmail);
	});

	test("should retrieve user without password field", async () => {
		// Get the framework and entity manager
		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');
		const db = context.getDatabase();

		// Create a user
		const userId = await userManager.create({
			name: 'Secure User',
			email: faker.internet.email(),
			password: 'securepassword',
			role: 'user'
		});

		// Use query builder to select specific fields (excluding password)
		const queryBuilder = db.createQueryBuilder();
		const profile = await queryBuilder
			.select(['name', 'email', 'role'])
			.from('users')
			.where('user_id = ?', userId)
			.getOne();

		expect(profile).toBeDefined();
		expect(profile.name).toBe("Secure User");
		expect(profile.email).toBeDefined();
		expect(profile.role).toBe("user");

		// Password should not be included
		expect(Object.prototype.hasOwnProperty.call(profile, "password")).toBe(false);
	});

	test("should get user with resource access history", async () => {
		// Get the framework and entity managers
		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');
		const productManager = context.getEntityManager('Product');
		const accessManager = context.getEntityManager('UserResourceAccess');
		const db = context.getDatabase();

		// Create a user
		const userId = await userManager.create({
			name: 'Resource Access User',
			email: faker.internet.email(),
			password: faker.internet.password(),
			role: 'user'
		});

		// Create a product
		const productId = await productManager.create({
			title: faker.commerce.productName(),
			pricing: 'standard',
			is_free: false,
			credit_cost: 10
		});

		// Add resource access record - create exactly one record
		await accessManager.create({
			user_id: userId,
			resource_type: 'product',
			resource_id: productId,
			credit_cost: 10,
			access_date: new Date().toISOString()
		});

		// Add credit to the user
		await db.execute(
			"INSERT INTO user_credits (user_id, amount, source, purchase_date, expiry_date) VALUES (?, ?, ?, ?, ?)",
			userId, 50, 'purchase', new Date().toISOString(),
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
			.where('u.user_id = ?', userId)
			.groupBy('u.user_id')
			.getOne();

		// Get the user's recent access history
		const accessHistory = await accessManager.findBy({ user_id: userId });

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