// shopping-session-repository.test.ts
import {
	setupTestEnvironment,
	teardownTestEnvironment,
	getTestFramework,
	generateTestData,
	cleanupTestData
} from "../test-setup";
import { DatabaseAdapter } from "../../src/database/core/types";

// Define enum for session status
enum ShoppingSessionStatus {
	ACTIVE = "active",
	PAUSED = "paused",
	COMPLETED = "completed",
	CANCELLED = "cancelled"
}

// Define enum for ProductSide
enum ProductSide {
	TITLE = "title",
	PRICING = "pricing",
	BOTH = "both"
}

// Define interfaces for the entities being tested
interface ShoppingSession {
	session_id?: number;
	user_id: number;
	category_id?: number;
	start_time: string;
	last_activity_time: string;
	end_time?: string;
	status: ShoppingSessionStatus;
	cards_studied: number;
	current_card_index: number;
	total_shopping_time: number;
	cards_order?: string;
}

interface ViewRecord {
	record_id?: number;
	session_id: number;
	user_id: number;
	product_id: number;
	page_shown: string;
	hint_viewed: number;
	view_time?: number;
	view_start: string;
	view_end?: string;
}

describe("ShoppingSessionRepository", () => {
	beforeAll(async () => {
		await setupTestEnvironment('./tests/test-app.yaml');
	});

	afterAll(async () => {
		await teardownTestEnvironment();
	});

	beforeEach(async () => {
		await cleanupTestData();

		// Generate core test data
		await generateTestData({
			count: 1,
			withRelations: false,
			fixedValues: {
				User: [
					{
						user_id: 1,
						name: "Store Owner",
						email: "store@example.com",
						role: "admin"
					},
					{
						user_id: 2,
						name: "Customer",
						email: "customer@example.com",
						role: "user"
					}
				],
				ProductCategory: {
					category_id: 1,
					category_name: "Dog Food",
					description: "All dog food products",
					parent_id: null
				},
				Product: {
					product_id: 1,
					title: "Kibble Crunch",
					pricing: "$19.99",
					credit_cost: 5
				},
				ProductShoppingSession: {
					session_id: 1,
					user_id: 2,
					category_id: 1,
					start_time: new Date().toISOString(),
					last_activity_time: new Date().toISOString(),
					status: ShoppingSessionStatus.ACTIVE,
					cards_studied: 0,
					current_card_index: 0,
					total_shopping_time: 0,
					cards_order: JSON.stringify([1, 2, 3])
				},
				ProductViewRecord: {
					session_id: 1,
					user_id: 2,
					product_id: 1,
					page_shown: "both",
					hint_viewed: 0,
					view_start: new Date().toISOString()
				}
			}
		});
	});

	afterEach(async () => {
		await cleanupTestData();
	});

	test("should find active sessions for a user", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const sessionRepo = context.getEntityManager<ShoppingSession>('ProductShoppingSession');

		const activeSessions = await sessionRepo.findBy({
			user_id: 2,
			status: ShoppingSessionStatus.ACTIVE
		});

		expect(activeSessions).toHaveLength(1);
		expect(activeSessions[0].status).toBe(ShoppingSessionStatus.ACTIVE);
	});

	test("should find sessions for a user", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const sessionRepo = context.getEntityManager<ShoppingSession>('ProductShoppingSession');

		const sessions = await sessionRepo.findBy({ user_id: 2 });

		expect(sessions).toHaveLength(1);
		expect(sessions[0].user_id).toBe(2);
	});

	test("should get session with view records", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const db = context.getDatabase();

		// Get session
		const session = await db.querySingle(`
			SELECT * FROM product_shopping_session WHERE session_id = 1
		`);

		// Get view records with product info
		const records = await db.query(`
			SELECT 
				vr.*,
				p.title
			FROM 
				product_view_record vr
				JOIN products p ON vr.product_id = p.product_id
			WHERE 
				vr.session_id = 1
		`);

		const sessionWithRecords = {
			session,
			records
		};

		expect(sessionWithRecords).toBeDefined();
		expect(sessionWithRecords.session.session_id).toBe(1);
		expect(sessionWithRecords.records).toHaveLength(1);
		expect(sessionWithRecords.records[0].product_id).toBe(1);
		expect(sessionWithRecords.records[0].title).toBe("Kibble Crunch");
	});

	test("should start a new shopping session", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const sessionRepo = context.getEntityManager<ShoppingSession>('ProductShoppingSession');

		const productIds = [1, 2, 3];
		const now = new Date().toISOString();

		const sessionData = {
			user_id: 2,
			category_id: 1,
			start_time: now,
			last_activity_time: now,
			status: ShoppingSessionStatus.ACTIVE,
			cards_studied: 0,
			current_card_index: 0,
			total_shopping_time: 0,
			cards_order: JSON.stringify(productIds)
		};

		const sessionId = await sessionRepo.create(sessionData);

		expect(sessionId).toBeGreaterThan(0);

		// Verify session was created
		const session = await sessionRepo.findById(sessionId);
		expect(session).toBeDefined();
		if (!session) return;

		expect(session.user_id).toBe(2);
		expect(session.category_id).toBe(1);
		expect(session.status).toBe(ShoppingSessionStatus.ACTIVE);
		expect(JSON.parse(session.cards_order || "[]")).toEqual(productIds);
	});

	test("should record a product view", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const viewRecordRepo = context.getEntityManager<ViewRecord>('ProductViewRecord');
		const db = context.getDatabase();

		const now = new Date().toISOString();

		const viewData = {
			session_id: 1,
			user_id: 2,
			product_id: 1,
			page_shown: ProductSide.BOTH,
			hint_viewed: 0,
			view_start: now
		};

		const viewId = await viewRecordRepo.create(viewData);

		expect(viewId).toBeGreaterThan(0);

		// Verify view was recorded
		const view = await viewRecordRepo.findById(viewId);
		expect(view).toBeDefined();
		if (view) {
			expect(view.session_id).toBe(1);
			expect(view.user_id).toBe(2);
			expect(view.product_id).toBe(1);
			expect(view.page_shown).toBe(ProductSide.BOTH);
			expect(view.hint_viewed).toBe(0);
		}
	});

	test("should complete a product view", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const viewRecordRepo = context.getEntityManager<ViewRecord>('ProductViewRecord');
		const sessionRepo = context.getEntityManager<ShoppingSession>('ProductShoppingSession');
		const db = context.getDatabase();

		// First record a view
		const now = new Date().toISOString();

		const viewData = {
			session_id: 1,
			user_id: 2,
			product_id: 1,
			page_shown: ProductSide.BOTH,
			hint_viewed: 0,
			view_start: now
		};

		const viewId = await viewRecordRepo.create(viewData);

		// Now complete the view
		const endTime = new Date().toISOString();

		await viewRecordRepo.update(viewId, {
			view_end: endTime,
			view_time: 30
		});

		// Update the session
		await sessionRepo.update(1, {
			cards_studied: 1,
			current_card_index: 1,
			total_shopping_time: 30
		});

		// Verify view was completed
		const view = await viewRecordRepo.findById(viewId);
		expect(view).toBeDefined();
		if (view) {
			expect(view.view_time).toBe(30);
			expect(view.view_end).toBeDefined();
		}

		// Verify session was updated
		const session = await sessionRepo.findById(1);
		expect(session).toBeDefined();
		if (!session) return;

		expect(session.cards_studied).toBe(1);
		expect(session.current_card_index).toBe(1);
		expect(session.total_shopping_time).toBe(30);
	});

	test("should update session status", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const sessionRepo = context.getEntityManager<ShoppingSession>('ProductShoppingSession');

		const updateData = {
			status: ShoppingSessionStatus.COMPLETED,
			end_time: new Date().toISOString()
		};

		const success = await sessionRepo.update(1, updateData);

		expect(success).toBe(1);

		// Verify session status was updated
		const session = await sessionRepo.findById(1);
		expect(session).toBeDefined();
		if (!session) return;

		expect(session.status).toBe(ShoppingSessionStatus.COMPLETED);
		expect(session.end_time).toBeDefined();
	});

	test("should get user shopping statistics", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const viewRecordRepo = context.getEntityManager<ViewRecord>('ProductViewRecord');
		const sessionRepo = context.getEntityManager<ShoppingSession>('ProductShoppingSession');
		const db = context.getDatabase();

		// Record a completed view
		const now = new Date().toISOString();

		const viewData = {
			session_id: 1,
			user_id: 2,
			product_id: 1,
			page_shown: ProductSide.BOTH,
			hint_viewed: 0,
			view_start: now
		};

		const viewId = await viewRecordRepo.create(viewData);

		const endTime = new Date().toISOString();
		await viewRecordRepo.update(viewId, {
			view_end: endTime,
			view_time: 30
		});

		// Update the session
		await sessionRepo.update(1, {
			cards_studied: 1,
			current_card_index: 1,
			total_shopping_time: 30,
			status: ShoppingSessionStatus.COMPLETED,
			end_time: endTime
		});

		// Get the shopping stats
		const stats = await db.querySingle(`
			SELECT 
				COUNT(*) as totalSessions,
				SUM(cards_studied) as totalCards,
				SUM(total_shopping_time) as totalTime,
				CASE 
					WHEN COUNT(*) > 0 THEN SUM(total_shopping_time) / COUNT(*) 
					ELSE 0 
				END as averageTime,
				SUM(CASE WHEN status = '${ShoppingSessionStatus.COMPLETED}' THEN 1 ELSE 0 END) as completedSessions
			FROM 
				product_shopping_session
			WHERE 
				user_id = 2
		`);

		// Get last session
		const lastSession = await db.querySingle(`
			SELECT * 
			FROM product_shopping_session
			WHERE user_id = 2
			ORDER BY session_id DESC
			LIMIT 1
		`);

		// Combine the results
		const userStats = {
			...stats,
			lastSession
		};

		expect(userStats).toBeDefined();
		expect(userStats.totalSessions).toBe(1);
		expect(userStats.totalCards).toBe(1);
		expect(userStats.totalTime).toBe(30);
		expect(userStats.averageTime).toBe(30); // 30 / 1
		expect(userStats.completedSessions).toBe(1);
		expect(userStats.lastSession).toBeDefined();
	});

	test("should get product performance", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const viewRecordRepo = context.getEntityManager<ViewRecord>('ProductViewRecord');
		const db = context.getDatabase();

		// Record a completed view
		const now = new Date().toISOString();

		const viewData = {
			session_id: 1,
			user_id: 2,
			product_id: 1,
			page_shown: ProductSide.BOTH,
			hint_viewed: 1, // Viewed hint
			view_start: now
		};

		const viewId = await viewRecordRepo.create(viewData);

		const endTime = new Date().toISOString();
		await viewRecordRepo.update(viewId, {
			view_end: endTime,
			view_time: 45
		});

		// Get product performance
		const viewCountResult = await db.querySingle(`
			SELECT COUNT(*) as count
			FROM product_view_record
			WHERE user_id = 2 AND product_id = 1
		`);

		const avgTimeResult = await db.querySingle(`
			SELECT AVG(view_time) as average
			FROM product_view_record
			WHERE user_id = 2 AND product_id = 1 AND view_time IS NOT NULL
		`);

		const lastViewedResult = await db.querySingle(`
			SELECT MAX(view_start) as last_viewed
			FROM product_view_record
			WHERE user_id = 2 AND product_id = 1
		`);

		const hintViewedResult = await db.querySingle(`
			SELECT 
				COUNT(*) as total,
				SUM(hint_viewed) as hint_viewed
			FROM product_view_record
			WHERE user_id = 2 AND product_id = 1
		`);

		const hintViewRate = hintViewedResult.total > 0
			? hintViewedResult.hint_viewed / hintViewedResult.total
			: 0;

		const performance = {
			viewCount: viewCountResult.count,
			averageViewTime: avgTimeResult.average || 0,
			lastViewed: lastViewedResult.last_viewed,
			hintViewRate: hintViewRate
		};

		expect(performance).toBeDefined();
		// We had two view records in total (one from test data setup and one added here)
		expect(performance.viewCount).toBe(2);
		expect(performance.averageViewTime).toBe(45);
		expect(performance.lastViewed).toBeDefined();
		expect(performance.hintViewRate).toBe(0.5); // 1/2 = 50% hint view rate
	});

	test("should start session with null category ID", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const sessionRepo = context.getEntityManager<ShoppingSession>('ProductShoppingSession');

		const productIds = [1, 2];
		const now = new Date().toISOString();

		const sessionData = {
			user_id: 2,
			category_id: null,
			start_time: now,
			last_activity_time: now,
			status: ShoppingSessionStatus.ACTIVE,
			cards_studied: 0,
			current_card_index: 0,
			total_shopping_time: 0,
			cards_order: JSON.stringify(productIds)
		};

		const sessionId = await sessionRepo.create(sessionData);

		expect(sessionId).toBeGreaterThan(0);

		// Verify session was created without category ID
		const session = await sessionRepo.findById(sessionId);
		expect(session).toBeDefined();
		if (!session) return;

		expect(session.category_id).toBeNull();
	});

	test("should find sessions with limit", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const sessionRepo = context.getEntityManager<ShoppingSession>('ProductShoppingSession');

		// Create two additional sessions
		const now = new Date().toISOString();

		const sessionData1 = {
			user_id: 2,
			category_id: null,
			start_time: now,
			last_activity_time: now,
			status: ShoppingSessionStatus.ACTIVE,
			cards_studied: 0,
			current_card_index: 0,
			total_shopping_time: 0,
			cards_order: JSON.stringify([1, 2])
		};

		const sessionData2 = {
			user_id: 2,
			category_id: null,
			start_time: now,
			last_activity_time: now,
			status: ShoppingSessionStatus.ACTIVE,
			cards_studied: 0,
			current_card_index: 0,
			total_shopping_time: 0,
			cards_order: JSON.stringify([3, 4])
		};

		await sessionRepo.create(sessionData1);
		await sessionRepo.create(sessionData2);

		// Get sessions with limit
		const sessions = await sessionRepo.findBy(
			{ user_id: 2 },
			{ limit: 2 }
		);

		expect(sessions).toHaveLength(2);
	});

	test("should get shopping stats for user with no sessions", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const db = context.getDatabase();

		// Create a new user without sessions
		await db.execute(`
			INSERT INTO users (user_id, name, email, role)
			VALUES (999, 'No Sessions User', 'nosessions@example.com', 'user')
		`);

		// Get shopping stats for user with no sessions
		const stats = await db.querySingle(`
			SELECT 
				COUNT(*) as totalSessions,
				COALESCE(SUM(cards_studied), 0) as totalCards,
				COALESCE(SUM(total_shopping_time), 0) as totalTime,
				CASE 
					WHEN COUNT(*) > 0 THEN COALESCE(SUM(total_shopping_time), 0) / COUNT(*) 
					ELSE 0 
				END as averageTime,
				SUM(CASE WHEN status = '${ShoppingSessionStatus.COMPLETED}' THEN 1 ELSE 0 END) as completedSessions
			FROM 
				product_shopping_session
			WHERE 
				user_id = 999
		`);

		expect(stats).toBeDefined();
		expect(stats.totalSessions).toBe(0);
		expect(stats.totalCards).toBe(0);
		expect(stats.totalTime).toBe(0);
		expect(stats.averageTime).toBe(0);
		expect(stats.completedSessions).toBe(0);
	});
});