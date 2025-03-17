// credit-repository.test.ts
import {
	setupTestEnvironment,
	teardownTestEnvironment,
	getTestFramework,
	generateTestData,
	cleanupTestData
} from '../test-setup';
import { faker } from '@faker-js/faker';

// Define interfaces for entities
interface User {
	user_id?: number;
	name: string;
	email: string;
	password?: string;
	role: string;
}

interface UserCredit {
	credit_id?: number;
	user_id: number;
	amount: number;
	source: string;
	transaction_id?: string;
	purchase_date: string;
	expiry_date: string;
}

// Helper function to generate a unique email
function uniqueEmail(prefix: string = ''): string {
	const timestamp = Date.now();
	const random = Math.floor(Math.random() * 10000);
	return `${prefix}${timestamp}-${random}@example.com`;
}

describe("Credit Repository Operations", () => {
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
		// Clean up test data after each test
		await cleanupTestData();
	});

	test("should create a credit for a user", async () => {
		// Generate a user first with unique email
		const userEmail = uniqueEmail('credit-user');
		await generateTestData({
			count: 1,
			withRelations: false,
			fixedValues: {
				User: {
					name: 'Credit Test User',
					email: userEmail,
					role: 'user',
					password: 'password123'
				}
			}
		});

		const framework = getTestFramework();
		const context = framework.getContext();

		// Get user
		const userManager = context.getEntityManager<User>('User');
		const users = await userManager.findBy({ email: userEmail });
		expect(users.length).toBe(1);
		const userId = users[0].user_id!;

		// Get credit manager
		const creditManager = context.getEntityManager<UserCredit>('UserCredit');

		// Create new credit
		const creditData: Partial<UserCredit> = {
			user_id: userId,
			amount: 100,
			source: 'purchase',
			transaction_id: `tx-${Date.now()}`,
			purchase_date: new Date().toISOString(),
			expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days in future
		};

		const creditId = await creditManager.create(creditData);
		expect(creditId).toBeGreaterThan(0);

		// Verify credit creation
		const credit = await creditManager.findById(creditId);
		expect(credit).toBeDefined();
		expect(credit?.user_id).toBe(userId);
		expect(credit?.amount).toBe(100);
		expect(credit?.source).toBe('purchase');
	});

	test("should find credits for a user", async () => {
		// Generate a user with credits
		const userEmail = uniqueEmail('credit-find-user');
		await generateTestData({
			count: 1,
			withRelations: false,
			fixedValues: {
				User: {
					name: 'Find Credits User',
					email: userEmail,
					role: 'user',
					password: 'password123'
				}
			}
		});

		const framework = getTestFramework();
		const context = framework.getContext();

		// Get user
		const userManager = context.getEntityManager<User>('User');
		const users = await userManager.findBy({ email: userEmail });
		expect(users.length).toBe(1);
		const userId = users[0].user_id!;

		// Get credit manager
		const creditManager = context.getEntityManager<UserCredit>('UserCredit');

		// Create multiple credits for the user
		for (let i = 0; i < 3; i++) {
			await creditManager.create({
				user_id: userId,
				amount: 50 + i * 10,
				source: `test-${i}`,
				purchase_date: new Date().toISOString(),
				expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
			});
		}

		// Find credits by user ID
		const credits = await creditManager.findBy({ user_id: userId });

		// Should have 3 credits
		expect(credits.length).toBe(3);

		// Verify credit values
		expect(credits.some(c => c.amount === 50)).toBe(true);
		expect(credits.some(c => c.amount === 60)).toBe(true);
		expect(credits.some(c => c.amount === 70)).toBe(true);
	});

	test("should calculate sum of user credits", async () => {
		// Generate a user
		const userEmail = uniqueEmail('credit-sum-user');
		await generateTestData({
			count: 1,
			withRelations: false,
			fixedValues: {
				User: {
					name: 'Sum Credits User',
					email: userEmail,
					role: 'user',
					password: 'password123'
				}
			}
		});

		const framework = getTestFramework();
		const context = framework.getContext();

		// Get user
		const userManager = context.getEntityManager<User>('User');
		const users = await userManager.findBy({ email: userEmail });
		expect(users.length).toBe(1);
		const userId = users[0].user_id!;

		// Get credit manager
		const creditManager = context.getEntityManager<UserCredit>('UserCredit');

		// Create credits with known amounts
		await creditManager.create({
			user_id: userId,
			amount: 100,
			source: 'test-1',
			purchase_date: new Date().toISOString(),
			expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
		});

		await creditManager.create({
			user_id: userId,
			amount: 200,
			source: 'test-2',
			purchase_date: new Date().toISOString(),
			expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
		});

		// Use aggregate to sum credits
		const db = context.getDatabase();
		const results = await db.aggregate('user_credits', {
			aggregates: [
				{ function: 'SUM', field: 'amount', alias: 'total_amount' }
			],
			conditions: { user_id: userId }
		});

		// Verify sum is correct
		expect(results.length).toBe(1);
		expect(results[0].total_amount).toBe(300);
	});

	test("should delete a credit", async () => {
		// Generate a user
		const userEmail = uniqueEmail('credit-delete-user');
		await generateTestData({
			count: 1,
			withRelations: false,
			fixedValues: {
				User: {
					name: 'Delete Credit User',
					email: userEmail,
					role: 'user',
					password: 'password123'
				}
			}
		});

		const framework = getTestFramework();
		const context = framework.getContext();

		// Get user
		const userManager = context.getEntityManager<User>('User');
		const users = await userManager.findBy({ email: userEmail });
		expect(users.length).toBe(1);
		const userId = users[0].user_id!;

		// Get credit manager
		const creditManager = context.getEntityManager<UserCredit>('UserCredit');

		// Create a credit
		const creditId = await creditManager.create({
			user_id: userId,
			amount: 100,
			source: 'test-delete',
			purchase_date: new Date().toISOString(),
			expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
		});

		// Verify credit exists
		let credit = await creditManager.findById(creditId);
		expect(credit).toBeDefined();

		// Delete the credit
		const deleteResult = await creditManager.delete(creditId);
		expect(deleteResult).toBe(1);

		// Verify credit is deleted
		credit = await creditManager.findById(creditId);
		expect(credit).toBeUndefined();
	});
});