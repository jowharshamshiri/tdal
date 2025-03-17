// category-repository.test.ts
import {
	setupTestEnvironment,
	teardownTestEnvironment,
	getTestFramework,
	generateTestData,
	cleanupTestData
} from "../test-setup";
import { DatabaseAdapter } from "../../src/database/core/types";

// Define interface for ProductCategory entity
interface ProductCategory {
	category_id: number;
	category_name: string;
	description?: string;
	parent_id?: number;
	image_url?: string;
	created_at?: string;
	updated_at?: string;
}

describe("ProductCategoryRepository", () => {
	beforeAll(async () => {
		await setupTestEnvironment('./tests/test-app.yaml');
	});

	afterAll(async () => {
		await teardownTestEnvironment();
	});

	beforeEach(async () => {
		await cleanupTestData();

		// Generate test data for categories with predictable structure
		await generateTestData({
			count: 1,
			withRelations: true,
			fixedValues: {
				ProductCategory: [
					{
						category_id: 1,
						category_name: "Dog Food",
						description: "All dog food products",
						parent_id: null
					},
					{
						category_id: 2,
						category_name: "Dry Food",
						description: "All dry dog food",
						parent_id: 1
					},
					{
						category_id: 3,
						category_name: "Wet Food",
						description: "All wet dog food",
						parent_id: 1
					}
				],
				Product: {
					product_id: 1,
					title: "Kibble Crunch",
					pricing: "$19.99",
					credit_cost: 5
				}
			}
		});
	});

	afterEach(async () => {
		await cleanupTestData();
	});

	test("should find root categories", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const productCategoryRepo = context.getEntityManager<ProductCategory>('ProductCategory');

		const rootCategories = await productCategoryRepo.findBy({ parent_id: null });

		expect(rootCategories).toHaveLength(1);
		expect(rootCategories[0].category_name).toBe("Dog Food");
		expect(rootCategories[0].parent_id).toBeNull();
	});

	test("should find categories by parent ID", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const productCategoryRepo = context.getEntityManager<ProductCategory>('ProductCategory');

		const childCategories = await productCategoryRepo.findBy({ parent_id: 1 });

		expect(childCategories).toHaveLength(2);
		expect(childCategories[0].category_name).toBe("Dry Food");
		expect(childCategories[1].category_name).toBe("Wet Food");
	});

	test("should find all categories with metadata", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const db = context.getDatabase();

		// Use raw query for complex data retrieval
		const categories = await db.query(`
			SELECT 
				c.category_id, 
				c.category_name, 
				c.description,
				c.parent_id,
				p.category_name as parent_name,
				(
					SELECT COUNT(*) 
					FROM categories cc 
					WHERE cc.parent_id = c.category_id
				) as child_count
			FROM 
				categories c
				LEFT JOIN categories p ON c.parent_id = p.category_id
			ORDER BY 
				c.category_id
		`);

		expect(categories).toHaveLength(3);

		// Dog Food category should have 2 children
		const dogFoodCategory = categories.find(
			(c) => c.category_name === "Dog Food"
		);
		expect(dogFoodCategory).toBeDefined();
		if (dogFoodCategory) {
			expect(dogFoodCategory.child_count).toBe(2);
			expect(dogFoodCategory.parent_name).toBeNull();
		}

		// Dry Food category should have Dog Food as parent
		const dryFoodCategory = categories.find(
			(c) => c.category_name === "Dry Food"
		);
		expect(dryFoodCategory).toBeDefined();
		if (dryFoodCategory) {
			expect(dryFoodCategory.parent_name).toBe("Dog Food");
		}

		// Wet Food category should have Dog Food as parent
		const wetFoodCategory = categories.find(
			(c) => c.category_name === "Wet Food"
		);
		expect(wetFoodCategory).toBeDefined();
		if (wetFoodCategory) {
			expect(wetFoodCategory.parent_name).toBe("Dog Food");
		}
	});

	test("should get category detail", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const db = context.getDatabase();

		// Set up category-product relationship
		await db.execute(`
			INSERT INTO category_product (category_id, product_id)
			VALUES (1, 1)
		`);

		// Use raw query to get category details with related data
		const productCategoryDetail = await db.querySingle(`
			SELECT 
				c.category_id, 
				c.category_name, 
				c.description,
				c.parent_id,
				p.category_id as parent_category_id,
				p.category_name as parent_category_name,
				(
					SELECT COUNT(*) 
					FROM categories cc 
					WHERE cc.parent_id = c.category_id
				) as descendant_count
			FROM 
				categories c
				LEFT JOIN categories p ON c.parent_id = p.category_id
			WHERE 
				c.category_id = 1
		`);

		// Get children
		const children = await db.query(`
			SELECT 
				category_id, 
				category_name, 
				description, 
				parent_id 
			FROM 
				categories 
			WHERE 
				parent_id = 1
		`);

		// Get products
		const products = await db.query(`
			SELECT 
				p.product_id, 
				p.title 
			FROM 
				products p
				JOIN category_product cp ON p.product_id = cp.product_id
			WHERE 
				cp.category_id = 1
		`);

		// Combine the results
		const fullCategoryDetail = {
			...productCategoryDetail,
			children,
			products
		};

		expect(fullCategoryDetail).toBeDefined();
		expect(fullCategoryDetail.category_name).toBe("Dog Food");

		// Should include parent (null for root category)
		expect(fullCategoryDetail.parent_category_id).toBeNull();

		// Should include children
		expect(fullCategoryDetail.children).toHaveLength(2);
		expect(fullCategoryDetail.children[0].category_name).toBe("Dry Food");
		expect(fullCategoryDetail.children[1].category_name).toBe("Wet Food");

		// Should include descendant count
		expect(fullCategoryDetail.descendant_count).toBe(2);

		// Should include products
		expect(fullCategoryDetail.products).toHaveLength(1);
		expect(fullCategoryDetail.products[0].title).toBe("Kibble Crunch");
	});

	test("should add a product to a category", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const db = context.getDatabase();

		// Create a new product
		await db.execute(`
			INSERT INTO products (product_id, title, pricing, credit_cost)
			VALUES (3, 'Premium Chow', '$29.99', 10)
		`);

		// Add product to category
		await db.execute(`
			INSERT INTO category_product (category_id, product_id)
			VALUES (1, 3)
		`);

		// Verify product was added
		const result = await db.querySingle(`
			SELECT COUNT(*) as count 
			FROM category_product 
			WHERE category_id = 1 AND product_id = 3
		`);

		expect(result.count).toBe(1);
	});

	test("should remove a product from a category", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const db = context.getDatabase();

		// Add a product to a category
		await db.execute(`
			INSERT INTO category_product (category_id, product_id)
			VALUES (1, 1)
		`);

		// Verify it was added
		const beforeCount = await db.querySingle(`
			SELECT COUNT(*) as count 
			FROM category_product 
			WHERE category_id = 1 AND product_id = 1
		`);
		expect(beforeCount.count).toBe(1);

		// Remove the product
		await db.execute(`
			DELETE FROM category_product 
			WHERE category_id = 1 AND product_id = 1
		`);

		// Verify removal
		const afterCount = await db.querySingle(`
			SELECT COUNT(*) as count 
			FROM category_product 
			WHERE category_id = 1 AND product_id = 1
		`);
		expect(afterCount.count).toBe(0);
	});

	test("should search categories by name", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const db = context.getDatabase();

		const categories = await db.query(`
			SELECT * FROM categories WHERE category_name LIKE '%Dry%'
		`);

		expect(categories).toHaveLength(1);
		expect(categories[0].category_name).toBe("Dry Food");
	});

	test("should get category hierarchy", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const db = context.getDatabase();

		// Use recursive query to get hierarchy
		const rootCategories = await db.query(`
			SELECT 
				category_id, 
				category_name, 
				description, 
				parent_id 
			FROM 
				categories 
			WHERE 
				parent_id IS NULL
		`);

		// Get children for each root category
		const hierarchy = [];
		for (const root of rootCategories) {
			const children = await db.query(`
				SELECT 
					category_id, 
					category_name, 
					description, 
					parent_id 
				FROM 
					categories 
				WHERE 
					parent_id = ?
			`, root.category_id);

			hierarchy.push({
				...root,
				children
			});
		}

		expect(hierarchy).toHaveLength(1);
		expect(hierarchy[0].category_name).toBe("Dog Food");
		expect(Array.isArray(hierarchy[0].children)).toBe(true);

		const children = hierarchy[0].children;
		expect(children).toHaveLength(2);

		// Check children
		expect(children[0].category_name).toBe("Dry Food");
		expect(children[1].category_name).toBe("Wet Food");
	});

	test("should get product counts", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const db = context.getDatabase();

		// Add products to categories
		await db.execute(`
			INSERT INTO category_product (category_id, product_id) VALUES
			(1, 1),
			(2, 1),
			(3, 1)
		`);

		// Get direct product count
		const directCountResult = await db.querySingle(`
			SELECT COUNT(*) as count
			FROM category_product
			WHERE category_id = 1
		`);

		// Get total product count (including children)
		const childCategoryIds = await db.query(`
			SELECT category_id
			FROM categories
			WHERE parent_id = 1
		`);

		const childIds = childCategoryIds.map(c => c.category_id);

		// Count products in child categories
		let childProductsCount = 0;
		for (const childId of childIds) {
			const result = await db.querySingle(`
				SELECT COUNT(*) as count
				FROM category_product
				WHERE category_id = ?
			`, childId);
			childProductsCount += result.count;
		}

		const counts = {
			direct: directCountResult.count,
			total: directCountResult.count + childProductsCount
		};

		expect(counts).toBeDefined();
		expect(counts.direct).toBe(1);
		expect(counts.total).toBe(3); // Dog Food (1) + Dry Food (1) + Wet Food (1)
	});
});