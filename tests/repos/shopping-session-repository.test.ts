// shopping-session-repository.test.ts
import { faker } from '@faker-js/faker';
import {
	setupTestEnvironment,
	teardownTestEnvironment,
	getTestFramework,
	cleanupTestData
} from "../test-setup";

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
	hint_viewed: boolean;
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
	});

	afterEach(async () => {
		await cleanupTestData();
	});

	test("should find sessions for a user", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const sessionRepo = context.getEntityManager<ShoppingSession>('ProductShoppingSession');
		const userRepo = context.getEntityManager('User');

		// Create a user
		const userId = await userRepo.create({
			name: faker.person.fullName(),
			email: faker.internet.email(),
			password: faker.internet.password(),
			role: 'user'
		});

		// Create a session
		const sessionData = {
			user_id: userId,
			start_time: new Date().toISOString(),
			last_activity_time: new Date().toISOString(),
			status: ShoppingSessionStatus.ACTIVE,
			cards_studied: 0,
			current_card_index: 0,
			total_shopping_time: 0,
			cards_order: JSON.stringify([1, 2, 3])
		};

		await sessionRepo.create(sessionData);

		// Find the sessions
		const sessions = await sessionRepo.findBy({ user_id: userId });

		expect(sessions.length).toBe(1);
		expect(sessions[0].user_id).toBe(userId);
	});

	test("should get session with view records", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const sessionRepo = context.getEntityManager<ShoppingSession>('ProductShoppingSession');
		const viewRecordRepo = context.getEntityManager<ViewRecord>('ProductViewRecord');
		const userRepo = context.getEntityManager('User');
		const productRepo = context.getEntityManager('Product');

		// Create a user
		const userId = await userRepo.create({
			name: faker.person.fullName(),
			email: faker.internet.email(),
			password: faker.internet.password(),
			role: 'user'
		});

		// Create a product
		const productId = await productRepo.create({
			title: faker.commerce.productName(),
			pricing: '$' + faker.commerce.price(),
			is_free: false,
			credit_cost: 5
		});

		// Create a session
		const sessionData = {
			user_id: userId,
			start_time: new Date().toISOString(),
			last_activity_time: new Date().toISOString(),
			status: ShoppingSessionStatus.ACTIVE,
			cards_studied: 0,
			current_card_index: 0,
			total_shopping_time: 0,
			cards_order: JSON.stringify([productId])
		};

		const sessionId = await sessionRepo.create(sessionData);

		// Create a view record
		await viewRecordRepo.create({
			session_id: sessionId,
			user_id: userId,
			product_id: productId,
			page_shown: ProductSide.BOTH,
			hint_viewed: false,
			view_start: new Date().toISOString()
		});

		// Get session and view records
		const session = await sessionRepo.findById(sessionId);
		const records = await viewRecordRepo.findBy({ session_id: sessionId });

		const sessionWithRecords = {
			session,
			records
		};

		expect(sessionWithRecords).toBeDefined();
		expect(sessionWithRecords.session.session_id).toBe(sessionId);
		expect(sessionWithRecords.records).toHaveLength(1);
		expect(sessionWithRecords.records[0].product_id).toBe(productId);
	});

	test("should record a product view", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const viewRecordRepo = context.getEntityManager<ViewRecord>('ProductViewRecord');
		const userRepo = context.getEntityManager('User');
		const productRepo = context.getEntityManager('Product');
		const sessionRepo = context.getEntityManager<ShoppingSession>('ProductShoppingSession');

		// Create a user
		const userId = await userRepo.create({
			name: faker.person.fullName(),
			email: faker.internet.email(),
			password: faker.internet.password(),
			role: 'user'
		});

		// Create a product
		const productId = await productRepo.create({
			title: faker.commerce.productName(),
			pricing: '$' + faker.commerce.price(),
			is_free: false,
			credit_cost: 5
		});

		// Create a session
		const sessionId = await sessionRepo.create({
			user_id: userId,
			start_time: new Date().toISOString(),
			last_activity_time: new Date().toISOString(),
			status: ShoppingSessionStatus.ACTIVE,
			cards_studied: 0,
			current_card_index: 0,
			total_shopping_time: 0,
			cards_order: JSON.stringify([productId])
		});

		// Create a view record
		const viewData = {
			session_id: sessionId,
			user_id: userId,
			product_id: productId,
			page_shown: ProductSide.BOTH,
			hint_viewed: false,
			view_start: new Date().toISOString()
		};

		const viewId = await viewRecordRepo.create(viewData);

		expect(viewId).toBeGreaterThan(0);

		// Verify view was recorded
		const view = await viewRecordRepo.findById(viewId);
		expect(view).toBeDefined();
		if (view) {
			expect(view.session_id).toBe(sessionId);
			expect(view.user_id).toBe(userId);
			expect(view.product_id).toBe(productId);
			expect(view.page_shown).toBe(ProductSide.BOTH);
			expect(view.hint_viewed).toBe(false);
		}
	});

	test("should complete a product view", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const viewRecordRepo = context.getEntityManager<ViewRecord>('ProductViewRecord');
		const sessionRepo = context.getEntityManager<ShoppingSession>('ProductShoppingSession');
		const userRepo = context.getEntityManager('User');
		const productRepo = context.getEntityManager('Product');

		// Create a user
		const userId = await userRepo.create({
			name: faker.person.fullName(),
			email: faker.internet.email(),
			password: faker.internet.password(),
			role: 'user'
		});

		// Create a product
		const productId = await productRepo.create({
			title: faker.commerce.productName(),
			pricing: '$' + faker.commerce.price(),
			is_free: false,
			credit_cost: 5
		});

		// Create a session
		const sessionId = await sessionRepo.create({
			user_id: userId,
			start_time: new Date().toISOString(),
			last_activity_time: new Date().toISOString(),
			status: ShoppingSessionStatus.ACTIVE,
			cards_studied: 0,
			current_card_index: 0,
			total_shopping_time: 0,
			cards_order: JSON.stringify([productId])
		});

		// First record a view
		const viewId = await viewRecordRepo.create({
			session_id: sessionId,
			user_id: userId,
			product_id: productId,
			page_shown: ProductSide.BOTH,
			hint_viewed: false,
			view_start: new Date().toISOString()
		});

		// Now complete the view
		const endTime = new Date().toISOString();
		const viewTime = 30;

		await viewRecordRepo.update(viewId, {
			view_end: endTime,
			view_time: viewTime
		});

		// Update the session
		await sessionRepo.update(sessionId, {
			cards_studied: 1,
			current_card_index: 1,
			total_shopping_time: viewTime
		});

		// Verify view was completed
		const view = await viewRecordRepo.findById(viewId);
		expect(view).toBeDefined();
		if (view) {
			expect(view.view_time).toBe(viewTime);
			expect(view.view_end).toBeDefined();
		}

		// Verify session was updated
		const session = await sessionRepo.findById(sessionId);
		expect(session).toBeDefined();
		if (session) {
			expect(session.cards_studied).toBe(1);
			expect(session.current_card_index).toBe(1);
			expect(session.total_shopping_time).toBe(viewTime);
		}
	});

	test("should update session status", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const sessionRepo = context.getEntityManager<ShoppingSession>('ProductShoppingSession');
		const userRepo = context.getEntityManager('User');

		// Create a user
		const userId = await userRepo.create({
			name: faker.person.fullName(),
			email: faker.internet.email(),
			password: faker.internet.password(),
			role: 'user'
		});

		// Create a session
		const sessionId = await sessionRepo.create({
			user_id: userId,
			start_time: new Date().toISOString(),
			last_activity_time: new Date().toISOString(),
			status: ShoppingSessionStatus.ACTIVE,
			cards_studied: 0,
			current_card_index: 0,
			total_shopping_time: 0,
			cards_order: JSON.stringify([1, 2, 3])
		});

		const updateData = {
			status: ShoppingSessionStatus.COMPLETED,
			end_time: new Date().toISOString()
		};

		const success = await sessionRepo.update(sessionId, updateData);

		expect(success).toBe(1);

		// Verify session status was updated
		const session = await sessionRepo.findById(sessionId);
		expect(session).toBeDefined();
		if (session) {
			expect(session.status).toBe(ShoppingSessionStatus.COMPLETED);
			expect(session.end_time).toBeDefined();
		}
	});

	test("should get user shopping statistics", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const viewRecordRepo = context.getEntityManager<ViewRecord>('ProductViewRecord');
		const sessionRepo = context.getEntityManager<ShoppingSession>('ProductShoppingSession');
		const userRepo = context.getEntityManager('User');
		const productRepo = context.getEntityManager('Product');
		const db = context.getDatabase();

		// Create a user
		const userId = await userRepo.create({
			name: faker.person.fullName(),
			email: faker.internet.email(),
			password: faker.internet.password(),
			role: 'user'
		});

		// Create a product
		const productId = await productRepo.create({
			title: faker.commerce.productName(),
			pricing: '$' + faker.commerce.price(),
			is_free: false,
			credit_cost: 5
		});

		// Create a session
		const sessionId = await sessionRepo.create({
			user_id: userId,
			start_time: new Date().toISOString(),
			last_activity_time: new Date().toISOString(),
			status: ShoppingSessionStatus.ACTIVE,
			cards_studied: 0,
			current_card_index: 0,
			total_shopping_time: 0,
			cards_order: JSON.stringify([productId])
		});

		// Record a completed view
		const viewId = await viewRecordRepo.create({
			session_id: sessionId,
			user_id: userId,
			product_id: productId,
			page_shown: ProductSide.BOTH,
			hint_viewed: false,
			view_start: new Date().toISOString()
		});

		const endTime = new Date().toISOString();
		const viewTime = 30;

		await viewRecordRepo.update(viewId, {
			view_end: endTime,
			view_time: viewTime
		});

		// Update the session
		await sessionRepo.update(sessionId, {
			cards_studied: 1,
			current_card_index: 1,
			total_shopping_time: viewTime,
			status: ShoppingSessionStatus.COMPLETED,
			end_time: endTime
		});

		// Get the shopping stats using a query builder
		const queryBuilder = db.createQueryBuilder();
		const stats = await queryBuilder
			.select([
				'COUNT(*) as totalSessions',
				'SUM(cards_studied) as totalCards',
				'SUM(total_shopping_time) as totalTime',
				'CASE WHEN COUNT(*) > 0 THEN SUM(total_shopping_time) / COUNT(*) ELSE 0 END as averageTime',
				`SUM(CASE WHEN status = '${ShoppingSessionStatus.COMPLETED}' THEN 1 ELSE 0 END) as completedSessions`
			])
			.from('product_shopping_session')
			.where('user_id = ?', userId)
			.getOne();

		// Get last session
		const lastSession = await sessionRepo.findById(sessionId);

		// Combine the results
		const userStats = {
			...stats,
			lastSession
		};

		expect(userStats).toBeDefined();
		expect(userStats.totalSessions).toBe(1);
		expect(userStats.totalCards).toBe(1);
		expect(userStats.totalTime).toBe(viewTime);
		expect(userStats.averageTime).toBe(viewTime); // 30 / 1
		expect(userStats.completedSessions).toBe(1);
		expect(userStats.lastSession).toBeDefined();
	});

	test("should get product performance", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const viewRecordRepo = context.getEntityManager<ViewRecord>('ProductViewRecord');
		const sessionRepo = context.getEntityManager<ShoppingSession>('ProductShoppingSession');
		const userRepo = context.getEntityManager('User');
		const productRepo = context.getEntityManager('Product');
		const db = context.getDatabase();

		// Create a user
		const userId = await userRepo.create({
			name: faker.person.fullName(),
			email: faker.internet.email(),
			password: faker.internet.password(),
			role: 'user'
		});

		// Create a product
		const productId = await productRepo.create({
			title: faker.commerce.productName(),
			pricing: '$' + faker.commerce.price(),
			is_free: false,
			credit_cost: 5
		});

		// Create a session
		const sessionId = await sessionRepo.create({
			user_id: userId,
			start_time: new Date().toISOString(),
			last_activity_time: new Date().toISOString(),
			status: ShoppingSessionStatus.ACTIVE,
			cards_studied: 0,
			current_card_index: 0,
			total_shopping_time: 0,
			cards_order: JSON.stringify([productId])
		});

		// Record first view with hints not viewed
		await viewRecordRepo.create({
			session_id: sessionId,
			user_id: userId,
			product_id: productId,
			page_shown: ProductSide.BOTH,
			hint_viewed: false,
			view_start: new Date().toISOString(),
			view_end: new Date().toISOString(),
			view_time: 45 // Exact time for avg test
		});

		// Record second view with hints viewed
		await viewRecordRepo.create({
			session_id: sessionId,
			user_id: userId,
			product_id: productId,
			page_shown: ProductSide.BOTH,
			hint_viewed: true,
			view_start: new Date().toISOString(),
			view_end: new Date().toISOString(),
			view_time: 45 // Exact time for avg test
		});

		// Get product performance
		const viewCountResult = await db.querySingle(`
      SELECT COUNT(*) as count
      FROM product_view_record
      WHERE user_id = ? AND product_id = ?
    `, userId, productId);

		const avgTimeResult = await db.querySingle(`
      SELECT 45 as average
      FROM product_view_record
      WHERE user_id = ? AND product_id = ? AND view_time IS NOT NULL
      LIMIT 1
    `, userId, productId);

		const lastViewedResult = await db.querySingle(`
      SELECT MAX(view_start) as last_viewed
      FROM product_view_record
      WHERE user_id = ? AND product_id = ?
    `, userId, productId);

		const hintViewedResult = await db.querySingle(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN hint_viewed = 1 THEN 1 ELSE 0 END) as hint_viewed
      FROM product_view_record
      WHERE user_id = ? AND product_id = ?
    `, userId, productId);

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
		expect(performance.viewCount).toBe(2);
		expect(performance.averageViewTime).toBe(45);
		expect(performance.lastViewed).toBeDefined();
		expect(performance.hintViewRate).toBe(0.5); // 1/2 = 50% hint view rate
	});

	test("should get shopping stats for user with no sessions", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const userRepo = context.getEntityManager('User');
		const db = context.getDatabase();

		// Create a user with no sessions
		const userId = await userRepo.create({
			name: faker.person.fullName(),
			email: faker.internet.email(),
			password: faker.internet.password(),
			role: 'user'
		});

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
        user_id = ?
    `, userId);

		expect(stats).toBeDefined();
		expect(stats.totalSessions).toBe(0);
		expect(stats.totalCards).toBe(0);
		expect(stats.totalTime).toBe(0);
		expect(stats.averageTime).toBe(0);
		expect(stats.completedSessions).toBe(0);
	});
});