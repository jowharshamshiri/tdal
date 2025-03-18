// category-repository.test.ts
import { faker } from '@faker-js/faker';
import {
	setupTestEnvironment,
	teardownTestEnvironment,
	getTestFramework,
	cleanupTestData
} from "../test-setup";

// Define interface for ProductCategory entity
interface ProductCategory {
	category_id?: number;
	category_name: string;
	description?: string;
	parent_id?: number | null;
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
	});

	afterEach(async () => {
		await cleanupTestData();
	});

	test("should find root categories", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const productCategoryRepo = context.getEntityManager<ProductCategory>('ProductCategory');

		// Create a root category
		const categoryName = "Dog Food";

		await productCategoryRepo.create({
			category_name: categoryName,
			description: "All dog food products",
			parent_id: null
		});

		const rootCategories = await productCategoryRepo.findBy({ parent_id: null });

		expect(rootCategories.length).toBeGreaterThan(0);
		const category = rootCategories.find(c => c.category_name === categoryName);
		expect(category).toBeDefined();
		expect(category?.parent_id).toBeNull();
	});

	test("should find categories by parent ID", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const productCategoryRepo = context.getEntityManager<ProductCategory>('ProductCategory');

		// Create parent category
		const parentName = "Dog Food";
		const parentId = await productCategoryRepo.create({
			category_name: parentName,
			description: "All dog food products",
			parent_id: null
		});

		// Create child categories
		await productCategoryRepo.create({
			category_name: "Dry Food",
			description: "All dry dog food",
			parent_id: parentId
		});

		await productCategoryRepo.create({
			category_name: "Wet Food",
			description: "All wet dog food",
			parent_id: parentId
		});

		const childCategories = await productCategoryRepo.findBy({ parent_id: parentId });

		expect(childCategories.length).toBe(2);

		// Verify we have both types of food
		const categoryNames = childCategories.map(c => c.category_name);
		expect(categoryNames).toContain("Dry Food");
		expect(categoryNames).toContain("Wet Food");
	});

	test("should find all categories with metadata", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const productCategoryRepo = context.getEntityManager<ProductCategory>('ProductCategory');
		const db = context.getDatabase();

		// Create parent category
		const parentName = "Dog Food";
		const parentId = await productCategoryRepo.create({
			category_name: parentName,
			description: "All dog food products",
			parent_id: null
		});

		// Create child categories
		await productCategoryRepo.create({
			category_name: "Dry Food",
			description: "All dry dog food",
			parent_id: parentId
		});

		await productCategoryRepo.create({
			category_name: "Wet Food",
			description: "All wet dog food",
			parent_id: parentId
		});

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

		expect(categories.length).toBe(3);

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
		const productCategoryRepo = context.getEntityManager<ProductCategory>('ProductCategory');
		const productRepo = context.getEntityManager('Product');
		const db = context.getDatabase();

		// Create parent category
		const parentName = "Dog Food";
		const parentId = await productCategoryRepo.create({
			category_name: parentName,
			description: "All dog food products",
			parent_id: null
		});

		// Create child categories
		await productCategoryRepo.create({
			category_name: "Dry Food",
			description: "All dry dog food",
			parent_id: parentId
		});

		await productCategoryRepo.create({
			category_name: "Wet Food",
			description: "All wet dog food",
			parent_id: parentId
		});

		// Create a product
		const productId = await productRepo.create({
			title: "Kibble Crunch",
			pricing: "$19.99",
			is_free: false,
			credit_cost: 5
		});

		// Set up category-product relationship
		// First ensure the junction table exists
		await db.execute(`
      CREATE TABLE IF NOT EXISTS category_product (
        category_id INTEGER,
        product_id INTEGER,
        PRIMARY KEY (category_id, product_id)
      )
    `);

		await db.execute(`
      INSERT INTO category_product (category_id, product_id)
      VALUES (?, ?)
    `, parentId, productId);

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
        c.category_id = ?
    `, parentId);

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
        parent_id = ?
    `, parentId);

		// Get products
		const products = await db.query(`
      SELECT 
        p.product_id, 
        p.title 
      FROM 
        products p
        JOIN category_product cp ON p.product_id = cp.product_id
      WHERE 
        cp.category_id = ?
    `, parentId);

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

		const childNames = fullCategoryDetail.children.map(c => c.category_name);
		expect(childNames).toContain("Dry Food");
		expect(childNames).toContain("Wet Food");

		// Should include descendant count
		expect(fullCategoryDetail.descendant_count).toBe(2);

		// Should include products
		expect(fullCategoryDetail.products).toHaveLength(1);
		expect(fullCategoryDetail.products[0].title).toBe("Kibble Crunch");
	});

	test("should add a product to a category", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const productCategoryRepo = context.getEntityManager<ProductCategory>('ProductCategory');
		const productRepo = context.getEntityManager('Product');
		const db = context.getDatabase();

		// Create a category
		const categoryId = await productCategoryRepo.create({
			category_name: "Test Category",
			description: "Test category description",
			parent_id: null
		});

		// Create a product
		const productId = await productRepo.create({
			title: "Premium Chow",
			pricing: "$29.99",
			is_free: false,
			credit_cost: 10
		});

		// Ensure junction table exists
		await db.execute(`
      CREATE TABLE IF NOT EXISTS category_product (
        category_id INTEGER,
        product_id INTEGER,
        PRIMARY KEY (category_id, product_id)
      )
    `);

		// Add product to category
		await db.execute(`
      INSERT INTO category_product (category_id, product_id)
      VALUES (?, ?)
    `, categoryId, productId);

		// Verify product was added
		const result = await db.querySingle(`
      SELECT COUNT(*) as count 
      FROM category_product 
      WHERE category_id = ? AND product_id = ?
    `, categoryId, productId);

		expect(result.count).toBe(1);
	});

	test("should remove a product from a category", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const productCategoryRepo = context.getEntityManager<ProductCategory>('ProductCategory');
		const productRepo = context.getEntityManager('Product');
		const db = context.getDatabase();

		// Create a category
		const categoryId = await productCategoryRepo.create({
			category_name: "Test Category",
			description: "Test category description",
			parent_id: null
		});

		// Create a product
		const productId = await productRepo.create({
			title: "Premium Chow",
			pricing: "$29.99",
			is_free: false,
			credit_cost: 10
		});

		// Ensure junction table exists
		await db.execute(`
      CREATE TABLE IF NOT EXISTS category_product (
        category_id INTEGER,
        product_id INTEGER,
        PRIMARY KEY (category_id, product_id)
      )
    `);

		// Add a product to a category
		await db.execute(`
      INSERT INTO category_product (category_id, product_id)
      VALUES (?, ?)
    `, categoryId, productId);

		// Verify it was added
		const beforeCount = await db.querySingle(`
      SELECT COUNT(*) as count 
      FROM category_product 
      WHERE category_id = ? AND product_id = ?
    `, categoryId, productId);
		expect(beforeCount.count).toBe(1);

		// Remove the product
		await db.execute(`
      DELETE FROM category_product 
      WHERE category_id = ? AND product_id = ?
    `, categoryId, productId);

		// Verify removal
		const afterCount = await db.querySingle(`
      SELECT COUNT(*) as count 
      FROM category_product 
      WHERE category_id = ? AND product_id = ?
    `, categoryId, productId);
		expect(afterCount.count).toBe(0);
	});

	test("should search categories by name", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const productCategoryRepo = context.getEntityManager<ProductCategory>('ProductCategory');
		const db = context.getDatabase();

		// Create categories with distinct names
		await productCategoryRepo.create({
			category_name: "Dry Food",
			description: "All dry food",
			parent_id: null
		});

		await productCategoryRepo.create({
			category_name: "Wet Food",
			description: "All wet food",
			parent_id: null
		});

		const categories = await db.query(`
      SELECT * FROM categories WHERE category_name LIKE '%Dry%'
    `);

		expect(categories.length).toBe(1);
		expect(categories[0].category_name).toBe("Dry Food");
	});

	test("should get category hierarchy", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const productCategoryRepo = context.getEntityManager<ProductCategory>('ProductCategory');
		const db = context.getDatabase();

		// Create parent category
		const parentId = await productCategoryRepo.create({
			category_name: "Dog Food",
			description: "All dog food products",
			parent_id: null
		});

		// Create child categories
		await productCategoryRepo.create({
			category_name: "Dry Food",
			description: "All dry dog food",
			parent_id: parentId
		});

		await productCategoryRepo.create({
			category_name: "Wet Food",
			description: "All wet dog food",
			parent_id: parentId
		});

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

		expect(hierarchy.length).toBeGreaterThan(0);
		const dogFoodCategory = hierarchy.find(c => c.category_name === "Dog Food");
		expect(dogFoodCategory).toBeDefined();
		expect(Array.isArray(dogFoodCategory?.children)).toBe(true);

		if (dogFoodCategory) {
			const children = dogFoodCategory.children;
			expect(children.length).toBe(2);

			// Check children names
			const childNames = children.map(c => c.category_name);
			expect(childNames).toContain("Dry Food");
			expect(childNames).toContain("Wet Food");
		}
	});

	test("should get product counts", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const productCategoryRepo = context.getEntityManager<ProductCategory>('ProductCategory');
		const productRepo = context.getEntityManager('Product');
		const db = context.getDatabase();

		// Create parent category
		const parentId = await productCategoryRepo.create({
			category_name: "Dog Food",
			description: "All dog food",
			parent_id: null
		});

		// Create child categories
		const childId1 = await productCategoryRepo.create({
			category_name: "Dry Food",
			description: "All dry dog food",
			parent_id: parentId
		});

		const childId2 = await productCategoryRepo.create({
			category_name: "Wet Food",
			description: "All wet dog food",
			parent_id: parentId
		});

		// Create a product
		const productId = await productRepo.create({
			title: "Kibble Crunch",
			pricing: "$19.99",
			is_free: false,
			credit_cost: 5
		});

		// Ensure junction table exists
		await db.execute(`
      CREATE TABLE IF NOT EXISTS category_product (
        category_id INTEGER,
        product_id INTEGER,
        PRIMARY KEY (category_id, product_id)
      )
    `);

		// Add products to categories
		await db.execute(`
      INSERT INTO category_product (category_id, product_id) VALUES
      (?, ?),
      (?, ?),
      (?, ?)
    `, parentId, productId, childId1, productId, childId2, productId);

		// Get direct product count
		const directCountResult = await db.querySingle(`
      SELECT COUNT(*) as count
      FROM category_product
      WHERE category_id = ?
    `, parentId);

		// Get child category IDs
		const childCategoryIds = await db.query(`
      SELECT category_id
      FROM categories
      WHERE parent_id = ?
    `, parentId);

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