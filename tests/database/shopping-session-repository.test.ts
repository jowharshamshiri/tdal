// shopping-session-repository.test.ts
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

interface ProductCategory {
	category_id?: number;
	category_name: string;
	description?: string;
}

interface ProductShoppingSession {
	session_id?: number;
	user_id: number;
	category_id?: number;
	start_time: string;
	last_activity_time: string;
	end_time?: string;
	status: string;
	cards_studied: number;
	current_card_index: number;
	total_shopping_time: number;
	cards_order?: string;
	created_at?: string;
	updated_at?: string;
}

// Helper function to generate a unique email
function uniqueEmail(prefix: string = ''): string {
	const timestamp = Date.now();
	const random = Math.floor(Math.random() * 10000);
	return `${prefix}${timestamp}-${random}@example.com`;
}

describe("Shopping Session Repository Operations", () => {
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

	test("should create a shopping session", async () => {
		// Generate test user
		const userEmail = uniqueEmail('session-user');
		await generateTestData({
			count: 1,
			withRelations: false,
			fixedValues: {
				User: {
					name: 'Session Test User',
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

		// Create a category
		const categoryManager = context.getEntityManager<ProductCategory>('ProductCategory');
		const categoryName = `Test Category ${Date.now()}`;
		const categoryId = await categoryManager.create({
			category_name: categoryName,
			description: 'Test category for shopping session'
		});

		// Get shopping session manager
		const sessionManager = context.getEntityManager<ProductShoppingSession>('ProductShoppingSession');

		// Create a shopping session
		const now = new Date();
		const sessionData: Partial<ProductShoppingSession> = {
			user_id: userId,
			category_id: categoryId,
			start_time: now.toISOString(),
			last_activity_time: now.toISOString(),
			status: 'active',
			cards_studied: 0,
			current_card_index: 0,
			total_shopping_time: 0
		};

		const sessionId = await sessionManager.create(sessionData);
		expect(sessionId).toBeGreaterThan(0);

		// Verify session creation
		const session = await sessionManager.findById(sessionId);
		expect(session).toBeDefined();
		expect(session?.user_id).toBe(userId);
		expect(session?.category_id).toBe(categoryId);
		expect(session?.status).toBe('active');
	});

	test("should find active sessions for a user", async () => {
		// Generate test user
		const userEmail = uniqueEmail('active-sessions');
		await generateTestData({
			count: 1,
			withRelations: false,
			fixedValues: {
				User: {
					name: 'Active Sessions User',
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

		// Create a category
		const categoryManager = context.getEntityManager<ProductCategory>('ProductCategory');
		const categoryId = await categoryManager.create({
			category_name: `Active Sessions Category ${Date.now()}`,
			description: 'Category for active sessions test'
		});

		// Get shopping session manager
		const sessionManager = context.getEntityManager<ProductShoppingSession>('ProductShoppingSession');

		// Create active sessions for the user
		const now = new Date();

		for (let i = 0; i < 2; i++) {
			await sessionManager.create({
				user_id: userId,
				category_id: categoryId,
				start_time: now.toISOString(),
				last_activity_time: now.toISOString(),
				status: 'active',
				cards_studied: i * 5,
				current_card_index: i * 5,
				total_shopping_time: i * 60 // seconds
			});
		}

		// Create a completed session
		await sessionManager.create({
			user_id: userId,
			category_id: categoryId,
			start_time: new Date(now.getTime() - 3600000).toISOString(), // 1 hour ago
			last_activity_time: new Date(now.getTime() - 1800000).toISOString(), // 30 min ago
			end_time: now.toISOString(),
			status: 'completed',
			cards_studied: 10,
			current_card_index: 10,
			total_shopping_time: 1800 // 30 minutes
		});

		// Find active sessions
		const activeSessions = await sessionManager.findBy({
			user_id: userId,
			status: 'active'
		});

		// Should have exactly 2 active sessions
		expect(activeSessions.length).toBe(2);

		// Find all sessions
		const allSessions = await sessionManager.findBy({ user_id: userId });

		// Should have 3 sessions total
		expect(allSessions.length).toBe(3);

		// Verify completed session
		const completedSessions = allSessions.filter(s => s.status === 'completed');
		expect(completedSessions.length).toBe(1);
		expect(completedSessions[0].end_time).toBeDefined();
	});

	test("should update shopping session status", async () => {
		// Generate test user
		const userEmail = uniqueEmail('session-update');
		await generateTestData({
			count: 1,
			withRelations: false,
			fixedValues: {
				User: {
					name: 'Update Session User',
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

		// Get shopping session manager
		const sessionManager = context.getEntityManager<ProductShoppingSession>('ProductShoppingSession');

		// Create a shopping session
		const now = new Date();
		const sessionId = await sessionManager.create({
			user_id: userId,
			start_time: now.toISOString(),
			last_activity_time: now.toISOString(),
			status: 'active',
			cards_studied: 0,
			current_card_index: 0,
			total_shopping_time: 0
		});

		// Update session to completed
		const later = new Date(now.getTime() + 3600000); // 1 hour later
		const updateResult = await sessionManager.update(sessionId, {
			status: 'completed',
			end_time: later.toISOString(),
			last_activity_time: later.toISOString(),
			cards_studied: 20,
			current_card_index: 20,
			total_shopping_time: 3600 // 1 hour
		});

		expect(updateResult).toBe(1); // 1 row affected

		// Verify update
		const updatedSession = await sessionManager.findById(sessionId);
		expect(updatedSession).toBeDefined();
		expect(updatedSession?.status).toBe('completed');
		expect(updatedSession?.end_time).toBeDefined();
		expect(updatedSession?.cards_studied).toBe(20);
		expect(updatedSession?.total_shopping_time).toBe(3600);
	});

	test("should count shopping sessions by category", async () => {
		// Generate test user
		const userEmail = uniqueEmail('category-count');
		await generateTestData({
			count: 1,
			withRelations: false,
			fixedValues: {
				User: {
					name: 'Category Count User',
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

		// Create categories
		const categoryManager = context.getEntityManager<ProductCategory>('ProductCategory');
		const timestamp = Date.now();

		const category1Id = await categoryManager.create({
			category_name: `Category 1 ${timestamp}`,
			description: 'First category'
		});

		const category2Id = await categoryManager.create({
			category_name: `Category 2 ${timestamp}`,
			description: 'Second category'
		});

		// Get shopping session manager
		const sessionManager = context.getEntityManager<ProductShoppingSession>('ProductShoppingSession');

		// Create sessions for category 1
		const now = new Date();
		for (let i = 0; i < 3; i++) {
			await sessionManager.create({
				user_id: userId,
				category_id: category1Id,
				start_time: now.toISOString(),
				last_activity_time: now.toISOString(),
				status: 'active',
				cards_studied: i * 5,
				current_card_index: i * 5,
				total_shopping_time: i * 60
			});
		}

		// Create sessions for category 2
		for (let i = 0; i < 2; i++) {
			await sessionManager.create({
				user_id: userId,
				category_id: category2Id,
				start_time: now.toISOString(),
				last_activity_time: now.toISOString(),
				status: 'active',
				cards_studied: i * 5,
				current_card_index: i * 5,
				total_shopping_time: i * 60
			});
		}

		// Count sessions by category
		const db = context.getDatabase();
		const results = await db.aggregate('product_shopping_session', {
			aggregates: [
				{ function: 'COUNT', field: '*', alias: 'session_count' }
			],
			groupBy: ['category_id'],
			conditions: { user_id: userId }
		});

		// Should have results for 2 categories
		expect(results.length).toBe(2);

		// Find counts for each category
		const category1Count = results.find(r => r.category_id === category1Id)?.session_count;
		const category2Count = results.find(r => r.category_id === category2Id)?.session_count;

		expect(category1Count).toBe(3);
		expect(category2Count).toBe(2);
	});

	test("should delete a shopping session", async () => {
		// Generate test user
		const userEmail = uniqueEmail('session-delete');
		await generateTestData({
			count: 1,
			withRelations: false,
			fixedValues: {
				User: {
					name: 'Delete Session User',
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

		// Get shopping session manager
		const sessionManager = context.getEntityManager<ProductShoppingSession>('ProductShoppingSession');

		// Create a shopping session
		const now = new Date();
		const sessionId = await sessionManager.create({
			user_id: userId,
			start_time: now.toISOString(),
			last_activity_time: now.toISOString(),
			status: 'active',
			cards_studied: 0,
			current_card_index: 0,
			total_shopping_time: 0
		});

		// Verify session exists
		let session = await sessionManager.findById(sessionId);
		expect(session).toBeDefined();

		// Delete the session
		const deleteResult = await sessionManager.delete(sessionId);
		expect(deleteResult).toBe(1);

		// Verify session is deleted
		session = await sessionManager.findById(sessionId);
		expect(session).toBeUndefined();
	});
});