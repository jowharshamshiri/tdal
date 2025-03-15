// category-repository.test.ts
import {
	setupTestDatabase,
	teardownTestDatabase,
	createTestSchema,
	insertTestData,
	cleanupDatabase,
} from "./test-setup";
import { DatabaseAdapter } from "../../src/database/core/types";
import { ProductCategoryRepository } from "./repositories/category-repository";

describe("ProductCategoryRepository", () => {
	let db: DatabaseAdapter;
	let productCategoryRepo: ProductCategoryRepository;

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
		productCategoryRepo = new ProductCategoryRepository(db);
	});

	test("should find root categories", async () => {
		const rootCategories = await productCategoryRepo.findRootCategories();

		expect(rootCategories).toHaveLength(1);
		expect(rootCategories[0].category_name).toBe("Dog Food");
		expect(rootCategories[0].parent_id).toBeNull();
	});

	test("should find categories by parent ID", async () => {
		const childCategories = await productCategoryRepo.findByParentId(1);

		expect(childCategories).toHaveLength(2);
		expect(childCategories[0].category_name).toBe("Dry Food");
		expect(childCategories[1].category_name).toBe("Wet Food");
	});

	test("should find all categories with metadata", async () => {
		const categories = await productCategoryRepo.findAllWithMeta();

		expect(categories).toHaveLength(3);

		// Dog Food category should have 2 children
		const mathProductCategory = categories.find(
			(c) => c.category_name === "Dog Food"
		);
		expect(mathProductCategory).toBeDefined();
		if (mathProductCategory) {
			expect(mathProductCategory.child_count).toBe(2);
			expect(mathProductCategory.parent_name).toBeNull();
		}

		// Dry Food category should have Dog Food as parent
		const algebraProductCategory = categories.find(
			(c) => c.category_name === "Dry Food"
		);
		expect(algebraProductCategory).toBeDefined();
		if (algebraProductCategory) {
			expect(algebraProductCategory.parent_name).toBe("Dog Food");
		}

		// Wet Food category should have Dog Food as parent
		const geometryProductCategory = categories.find(
			(c) => c.category_name === "Wet Food"
		);
		expect(geometryProductCategory).toBeDefined();
		if (geometryProductCategory) {
			expect(geometryProductCategory.parent_name).toBe("Dog Food");
		}
	});

	test("should get category detail", async () => {
		const productCategoryDetail =
			await productCategoryRepo.getProductCategoryDetail(1);

		expect(productCategoryDetail).toBeDefined();
		if (!productCategoryDetail) return;

		expect(productCategoryDetail.category_name).toBe("Dog Food");

		// Should include parent (null for root category)
		expect(productCategoryDetail.parent).toBeNull();

		// Should include children
		expect(productCategoryDetail.children).toHaveLength(2);
		expect(productCategoryDetail.children[0].category_name).toBe("Dry Food");
		expect(productCategoryDetail.children[1].category_name).toBe("Wet Food");

		// Should include descendant count
		expect(productCategoryDetail.descendant_count).toBe(2);

		// Should include products
		expect(productCategoryDetail.products).toHaveLength(1);
		expect(productCategoryDetail.products[0].title).toBe("Kibble Crunch");
	});

	test("should return undefined for non-existent category detail", async () => {
		const productCategoryDetail =
			await productCategoryRepo.getProductCategoryDetail(999);

		expect(productCategoryDetail).toBeUndefined();
	});

	test("should add a product to a category", async () => {
		const success = await productCategoryRepo.addProduct(1, 3);

		expect(success).toBe(true);

		// Verify product was added
		const productCategoryDetail =
			await productCategoryRepo.getProductCategoryDetail(1);
		if (!productCategoryDetail) {
			throw new Error("ProductCategory not found");
		}
		const hasProduct = productCategoryDetail.products.some(
			(f) => f.product_id === 3
		);
		expect(hasProduct).toBe(true);
	});

	test("should remove a product from a category", async () => {
		const success = await productCategoryRepo.removeProduct(1, 1);

		expect(success).toBe(true);

		// Verify product was removed
		const productCategoryDetail =
			await productCategoryRepo.getProductCategoryDetail(1);
		if (!productCategoryDetail) {
			throw new Error("ProductCategory not found");
		}
		const hasProduct = productCategoryDetail.products.some(
			(f) => f.product_id === 1
		);
		expect(hasProduct).toBe(false);
	});

	test("should search categories by name", async () => {
		const categories = await productCategoryRepo.searchByName("Dry");

		expect(categories).toHaveLength(1);
		expect(categories[0].category_name).toBe("Dry Food");
	});

	test("should get category hierarchy", async () => {
		const hierarchy = await productCategoryRepo.getProductCategoryHierarchy();

		expect(hierarchy).toHaveLength(1);
		expect(hierarchy[0].category_name).toBe("Dog Food");
		expect(Array.isArray(hierarchy[0].children)).toBe(true);

		const children = hierarchy[0].children as Array<Record<string, unknown>>;
		expect(children).toHaveLength(2);

		// Check children
		expect(children[0].category_name).toBe("Dry Food");
		expect(children[1].category_name).toBe("Wet Food");
	});

	test("should get product counts", async () => {
		const counts = await productCategoryRepo.getProductCounts(1);

		expect(counts).toBeDefined();
		expect(counts.direct).toBe(1);
		expect(counts.total).toBe(3); // Dog Food (1) + Dry Food (1) + Wet Food (1)
	});
});
