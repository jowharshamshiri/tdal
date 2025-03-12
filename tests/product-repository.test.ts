// product-repository.test.ts
import {
	setupTestDatabase,
	teardownTestDatabase,
	createTestSchema,
	insertTestData,
	cleanupDatabase,
} from "./test-setup";
import { DatabaseAdapter } from "../src/database/core/types";
import { ProductRepository } from "../src/repositories/product-repository";

describe("ProductRepository", () => {
	let db: DatabaseAdapter;
	let productRepo: ProductRepository;

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
		productRepo = new ProductRepository(db);
	});

	test("should find products by category ID", async () => {
		const products = await productRepo.findByProductCategoryId(1);

		expect(products).toHaveLength(1);
		expect(products[0].title).toBe("Kibble Crunch");
	});

	test("should find free products", async () => {
		const products = await productRepo.findFreeProducts();

		expect(products).toHaveLength(2);
		expect(products.every((f) => f.is_free)).toBe(true);
	});

	test("should find products with metadata for a user", async () => {
		const products = await productRepo.findWithMetaForUser(2);

		expect(products).toHaveLength(3);

		// User should have access to the premium product
		const premiumProduct = products.find((f) => f.product_id === 3);
		expect(premiumProduct).toBeDefined();
		if (premiumProduct) {
			expect(premiumProduct.requires_credits).toBeTruthy();
			expect(premiumProduct.has_access).toBeTruthy(); // Changed to toBeTruthy()
		}
	});

	test("should get product with metadata for a user", async () => {
		const product = await productRepo.getWithMetaForUser(3, 2);

		expect(product).toBeDefined();
		if (!product) return;

		expect(product.title).toBe("Gourmet Paws");
		expect(product.requires_credits).toBeTruthy();
		expect(product.has_access).toBeTruthy(); // Changed to toBeTruthy()

		// Should include associated categories
		expect(product.categories).toHaveLength(1);
		if (product.categories) {
			expect(product.categories[0].category_name).toBe("Dry Food");
		}
	});

	test("should get product with metadata for a user without access", async () => {
		// First remove the user's access
		await db.execute(
			"DELETE FROM user_resource_access WHERE user_id = 2 AND resource_id = 3"
		);

		const product = await productRepo.getWithMetaForUser(3, 2);

		expect(product).toBeDefined();
		if (!product) return;

		expect(product.requires_credits).toBeTruthy();
		expect(product.has_access).toBeFalsy(); // Changed to toBeFalsy()

		// Should have credit info
		expect(product.credit_info).toBeDefined();
		if (product.credit_info) {
			expect(product.credit_info.cost).toBe(5);
			expect(product.credit_info.remaining_credits).toBe(60);
		}

		// Should hide full pricing and provide preview
		expect(product.pricing).toBeUndefined();
		expect(product.pricing_preview).toBeDefined();
	});

	test("should check credit access for a user", async () => {
		// Free product
		const freeResult = await productRepo.checkCreditAccess(1, 2);

		expect(freeResult.allowed).toBe(true);
		expect(freeResult.message).toContain("free");

		// Already accessed premium product
		const accessedResult = await productRepo.checkCreditAccess(3, 2);

		expect(accessedResult.allowed).toBe(true);
		expect(accessedResult.message).toContain("already have access");

		// Remove access to test credit check
		await db.execute(
			"DELETE FROM user_resource_access WHERE user_id = 2 AND resource_id = 3"
		);

		const creditResult = await productRepo.checkCreditAccess(3, 2);

		expect(creditResult.allowed).toBe(true);
		expect(creditResult.cost).toBe(5);
		expect(creditResult.balance).toBe(60);
		expect(creditResult.remainingCredits).toBe(55);
	});

	test("should grant access to a product", async () => {
		// Remove existing access
		await db.execute(
			"DELETE FROM user_resource_access WHERE user_id = 2 AND resource_id = 3"
		);

		// Check initial credits
		const initialBalanceResult = await db.querySingle<{ total: number }>(
			"SELECT SUM(amount) as total FROM user_credits WHERE user_id = 2"
		);
		const initialBalance = initialBalanceResult?.total ?? 0;

		expect(initialBalance).toBe(60);

		const success = await productRepo.grantAccess(3, 2, 5);

		expect(success).toBe(true);

		// Verify access was granted
		const access = await db.querySingle(
			"SELECT * FROM user_resource_access WHERE user_id = 2 AND resource_id = 3 AND resource_type = ?",
			"product"
		);
		expect(access).toBeDefined();

		// Verify credits were deducted
		const newBalanceResult = await db.querySingle<{ total: number }>(
			"SELECT SUM(amount) as total FROM user_credits WHERE user_id = 2"
		);
		const newBalance = newBalanceResult?.total ?? 0;

		expect(newBalance).toBe(55);
	});

	test("should bookmark a product", async () => {
		const success = await productRepo.bookmark(1, 2);

		expect(success).toBe(true);

		// Verify bookmark was created
		const bookmark = await db.querySingle(
			"SELECT * FROM user_product_bookmark WHERE user_id = 2 AND product_id = 1"
		);
		expect(bookmark).toBeDefined();
		expect((bookmark as any)?.removed).toBe(0);

		// Verify product bookmark count was updated
		const product = await productRepo.findById(1);
		expect(product).toBeDefined();
		if (product) {
			expect(product.bookmark_count).toBe(1);
		}
	});

	test("should remove a bookmark", async () => {
		// First create a bookmark
		await productRepo.bookmark(1, 2);

		const success = await productRepo.removeBookmark(1, 2);

		expect(success).toBe(true);

		// Verify bookmark was marked as removed
		const bookmark = await db.querySingle(
			"SELECT * FROM user_product_bookmark WHERE user_id = 2 AND product_id = 1"
		);
		expect(bookmark).toBeDefined();
		expect((bookmark as any)?.removed).toBe(1);

		// Verify product bookmark count was updated
		const product = await productRepo.findById(1);
		expect(product).toBeDefined();
		if (product) {
			expect(product.bookmark_count).toBe(0);
		}
	});

	test("should update user data for a product", async () => {
		const success = await productRepo.updateUserData(
			1,
			2,
			30,
			"This is a test note"
		);

		expect(success).toBe(true);

		// Verify user data was created
		const userData = await db.querySingle(
			"SELECT * FROM user_product_data WHERE user_id = 2 AND product_id = 1"
		);
		expect(userData).toBeDefined();
		expect((userData as any)?.view_count).toBe(1);
		expect((userData as any)?.total_view_time).toBe(30);
		expect((userData as any)?.notes).toBe("This is a test note");

		// Verify product stats were updated
		const product = await productRepo.findById(1);
		expect(product).toBeDefined();
		if (product) {
			expect(product.total_view_count).toBe(1);
			expect(product.avg_view_time).toBe(30);
		}
	});

	test("should update existing user data for a product", async () => {
		// First create initial data
		await productRepo.updateUserData(1, 2, 30, "Initial note");

		const success = await productRepo.updateUserData(1, 2, 20, "Updated note");

		expect(success).toBe(true);

		// Verify user data was updated
		const userData = await db.querySingle(
			"SELECT * FROM user_product_data WHERE user_id = 2 AND product_id = 1"
		);
		expect(userData).toBeDefined();
		expect((userData as any)?.view_count).toBe(2); // Incremented
		expect((userData as any)?.total_view_time).toBe(50); // 30 + 20
		expect((userData as any)?.notes).toBe("Updated note");

		// Verify product stats were updated
		const product = await productRepo.findById(1);
		expect(product).toBeDefined();
		if (product) {
			expect(product.total_view_count).toBe(2);
			expect(product.avg_view_time).toBe(25); // (30*1 + 20) / 2
		}
	});

	test("should search products by text", async () => {
		const products = await productRepo.searchByText("Meaty");

		expect(products).toHaveLength(1);
		expect(products[0].title).toBe("Meaty Chunks");
	});

	test("should get bookmarked products", async () => {
		// First create a bookmark
		await productRepo.bookmark(1, 2);

		const bookmarked = await productRepo.getBookmarkedProducts(2);

		expect(bookmarked).toHaveLength(1);
		expect(bookmarked[0].product_id).toBe(1);
		expect(bookmarked[0].is_bookmarked).toBeTruthy();
	});
});
