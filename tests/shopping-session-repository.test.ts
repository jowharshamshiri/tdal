// shopping-session-repository.test.ts
import {
	setupTestDatabase,
	teardownTestDatabase,
	createTestSchema,
	insertTestData,
	cleanupDatabase,
} from "./test-setup";
import { DatabaseAdapter } from "../src/database/core/types";
import { ShoppingSessionRepository } from "../src/repositories/shopping-session-repository";
import { ShoppingSessionStatus } from "../src/models/shopping-session";

// Define ProductSide enum
enum ProductSide {
	TITLE = "title",
	PRICING = "pricing",
	BOTH = "both",
}

interface ViewRecord {
	session_id: number;
	user_id: number;
	product_id: number;
	page_shown: string;
	hint_viewed: number;
	view_time?: number;
	view_end?: string;
}

describe("ShoppingSessionRepository", () => {
	let db: DatabaseAdapter;
	let sessionRepo: ShoppingSessionRepository;

	beforeAll(async () => {
		db = await setupTestDatabase();
		await createTestSchema(db);
	});

	afterAll(() => {
		teardownTestDatabase();
	});

	beforeEach(async () => {
		// Use the new cleanupDatabase function
		await cleanupDatabase(db);
		await insertTestData(db);

		// Create repository instance
		sessionRepo = new ShoppingSessionRepository(db);
	});

	test("should find active sessions for a user", async () => {
		const activeSessions = await sessionRepo.findActiveSessionsForUser(2);

		expect(activeSessions).toHaveLength(1);
		expect(activeSessions[0].status).toBe(ShoppingSessionStatus.ACTIVE);
	});

	test("should find sessions for a user", async () => {
		const sessions = await sessionRepo.findSessionsForUser(2);

		expect(sessions).toHaveLength(1);
		expect(sessions[0].user_id).toBe(2);
	});

	test("should get session with view records", async () => {
		const sessionWithRecords = await sessionRepo.getSessionWithRecords(1);

		expect(sessionWithRecords).toBeDefined();
		if (!sessionWithRecords) return;

		expect(sessionWithRecords.session.session_id).toBe(1);
		expect(sessionWithRecords.records).toHaveLength(1);
		expect(sessionWithRecords.records[0].product_id).toBe(1);
		expect(sessionWithRecords.records[0].title).toBe("Kibble Crunch");
	});

	test("should start a new shopping session", async () => {
		const productIds = [1, 2, 3];

		const sessionId = await sessionRepo.startSession(2, 1, productIds);

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
		const viewId = await sessionRepo.recordView(
			1,
			2,
			1,
			ProductSide.BOTH,
			false
		);

		expect(viewId).toBeGreaterThan(0);

		// Verify view was recorded
		const view = await db.findById<ViewRecord>(
			"product_view_record",
			"record_id",
			viewId
		);
		expect(view).toBeDefined();
		if (view) {
			expect(view.session_id).toBe(1);
			expect(view.user_id).toBe(2);
			expect(view.product_id).toBe(1);
			expect(view.page_shown).toBe("both");
			expect(view.hint_viewed).toBe(0);
		}
	});

	test("should complete a product view", async () => {
		// First record a view
		const viewId = await sessionRepo.recordView(
			1,
			2,
			1,
			ProductSide.BOTH,
			false
		);

		const success = await sessionRepo.completeView(viewId, 1, 30);

		expect(success).toBe(true);

		// Verify view was completed
		const view = await db.findById<ViewRecord>(
			"product_view_record",
			"record_id",
			viewId
		);
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
		const success = await sessionRepo.updateStatus(
			1,
			ShoppingSessionStatus.COMPLETED
		);

		expect(success).toBe(true);

		// Verify session status was updated
		const session = await sessionRepo.findById(1);
		expect(session).toBeDefined();
		if (!session) return;

		expect(session.status).toBe(ShoppingSessionStatus.COMPLETED);
		expect(session.end_time).toBeDefined();
	});

	test("should get user shopping statistics", async () => {
		// Record a completed view
		const viewId = await sessionRepo.recordView(
			1,
			2,
			1,
			ProductSide.BOTH,
			false
		);
		await sessionRepo.completeView(viewId, 1, 30);

		// Complete the session
		await sessionRepo.updateStatus(1, ShoppingSessionStatus.COMPLETED);

		const stats = await sessionRepo.getUserShoppingStats(2);

		expect(stats).toBeDefined();
		expect(stats.totalSessions).toBe(1);
		expect(stats.totalCards).toBe(1);
		expect(stats.totalTime).toBe(30);
		expect(stats.averageTime).toBe(30); // 30 / 1
		expect(stats.completedSessions).toBe(1);
		expect(stats.lastSession).toBeDefined();
	});

	test("should get product performance", async () => {
		// Record a completed view
		const viewId = await sessionRepo.recordView(
			1,
			2,
			1,
			ProductSide.BOTH,
			true
		);
		await sessionRepo.completeView(viewId, 1, 45);

		const performance = await sessionRepo.getProductPerformance(2, 1);

		expect(performance).toBeDefined();
		// In the test data, there was already one view record, plus we added one = 2
		expect(performance.viewCount).toBe(2);
		expect(performance.averageViewTime).toBe(45);
		expect(performance.lastViewed).toBeDefined();
		expect(performance.hintViewRate).toBe(1); // 2/2 = 100% hint view rate
	});

	test("should handle product performance with no views", async () => {
		const performance = await sessionRepo.getProductPerformance(2, 999); // Non-existent product ID

		expect(performance).toBeDefined();
		expect(performance.viewCount).toBe(0);
		expect(performance.averageViewTime).toBe(0);
		expect(performance.lastViewed).toBeUndefined();
		expect(performance.hintViewRate).toBe(0);
	});

	test("should calculate average correctly for multiple views", async () => {
		// Record first view
		const viewId1 = await sessionRepo.recordView(
			1,
			2,
			1,
			ProductSide.BOTH,
			true
		);
		await sessionRepo.completeView(viewId1, 1, 30);

		// Record second view
		const viewId2 = await sessionRepo.recordView(
			1,
			2,
			1,
			ProductSide.TITLE,
			false
		);
		await sessionRepo.completeView(viewId2, 1, 50);

		const performance = await sessionRepo.getProductPerformance(2, 1);

		// There was one view in test data + two we added = 3
		expect(performance.viewCount).toBe(3);
		// Average of all three views
		expect(performance.averageViewTime).toBe(40); // (30 + 50 + initial test view) / 3
		expect(performance.hintViewRate).toBe(2 / 3); // 2/3 views had hints
	});

	test("should start session with null category ID", async () => {
		const productIds = [1, 2];

		const sessionId = await sessionRepo.startSession(2, null, productIds);

		expect(sessionId).toBeGreaterThan(0);

		// Verify session was created without category ID
		const session = await sessionRepo.findById(sessionId);
		expect(session).toBeDefined();
		if (!session) return;

		expect(session.category_id).toBeNull(); // Changed from toBeUndefined()
	});

	test("should get session with records when none exist", async () => {
		// Create a new session without any view records
		const productIds = [1, 2];
		const sessionId = await sessionRepo.startSession(2, null, productIds);

		const sessionWithRecords = await sessionRepo.getSessionWithRecords(
			sessionId
		);

		expect(sessionWithRecords).toBeDefined();
		if (!sessionWithRecords) return;

		expect(sessionWithRecords.session.session_id).toBe(sessionId);
		expect(sessionWithRecords.records).toHaveLength(0);
	});

	test("should handle non-existent session", async () => {
		const sessionWithRecords = await sessionRepo.getSessionWithRecords(999); // Non-existent ID

		expect(sessionWithRecords).toBeUndefined();
	});

	test("should find sessions with limit", async () => {
		// Create multiple sessions
		await sessionRepo.startSession(2, null, [1, 2]);
		await sessionRepo.startSession(2, null, [3, 4]);

		const sessions = await sessionRepo.findSessionsForUser(2, 2);

		expect(sessions).toHaveLength(2);
	});

	test("should handle transaction failure in completeView", async () => {
		// Mock a transaction that fails
		jest.spyOn(db, "transaction").mockImplementationOnce(() => {
			return Promise.resolve(false);
		});

		const viewId = await sessionRepo.recordView(
			1,
			2,
			1,
			ProductSide.BOTH,
			false
		);

		const success = await sessionRepo.completeView(viewId, 1, 30);

		expect(success).toBe(false);
	});

	test("should handle transaction failure in updateStatus", async () => {
		// Mock the update method to return 0 instead of throwing an error
		jest
			.spyOn(ShoppingSessionRepository.prototype, "update")
			.mockImplementationOnce(() => {
				return Promise.resolve(0); // Return 0 changes instead of throwing error
			});

		const success = await sessionRepo.updateStatus(
			1,
			ShoppingSessionStatus.COMPLETED
		);

		expect(success).toBe(false);
	});

	test("should get shopping stats for user with no sessions", async () => {
		const stats = await sessionRepo.getUserShoppingStats(999); // Non-existent user ID

		expect(stats).toBeDefined();
		expect(stats.totalSessions).toBe(0);
		expect(stats.totalCards).toBe(0);
		expect(stats.totalTime).toBe(0);
		expect(stats.averageTime).toBe(0);
		expect(stats.completedSessions).toBe(0);
	});
});
