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

		// Use query builder instead of raw SQL
		const queryBuilder = db.createQueryBuilder();
		const categories = await queryBuilder
			.select([
				'c.category_id',
				'c.category_name',
				'c.description',
				'c.parent_id',
				'p.category_name as parent_name',
				`(SELECT COUNT(*) FROM categories cc WHERE cc.parent_id = c.category_id) as child_count`
			])
			.from('categories', 'c')
			.leftJoin('categories', 'p', 'c.parent_id = p.category_id')
			.orderBy('c.category_id')
			.execute();

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

		// Set up category-product relationship using many-to-many relationship management
		await productCategoryRepo.manageManyToMany(
			parentId,
			"products",
			[productId],
			"add"
		);

		// Get the category details
		const category = await productCategoryRepo.findById(parentId);

		// Use query builder for child categories
		const queryBuilder = db.createQueryBuilder();
		const children = await queryBuilder
			.select(['category_id', 'category_name', 'description', 'parent_id'])
			.from('categories')
			.where('parent_id = ?', parentId)
			.execute();

		// Use query builder for products
		const productQueryBuilder = db.createQueryBuilder();
		const products = await productQueryBuilder
			.select(['p.product_id', 'p.title'])
			.from('products', 'p')
			.innerJoin('category_product', 'cp', 'p.product_id = cp.product_id')
			.where('cp.category_id = ?', parentId)
			.execute();

		// Get descendant count
		const descendantCountQueryBuilder = db.createQueryBuilder();
		const descendantResult = await descendantCountQueryBuilder
			.select(['COUNT(*) as descendant_count'])
			.from('categories')
			.where('parent_id = ?', parentId)
			.getOne();

		// Combine the results
		const fullCategoryDetail = {
			...category,
			children,
			products,
			descendant_count: descendantResult?.descendant_count || 0
		};

		expect(fullCategoryDetail).toBeDefined();
		expect(fullCategoryDetail.category_name).toBe("Dog Food");

		// Should include parent (null for root category)
		expect(fullCategoryDetail.parent_id).toBeNull();

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

		// Add product to category using manageManyToMany
		await productCategoryRepo.manageManyToMany(
			categoryId,
			"products",
			[productId],
			"add"
		);

		// Use query builder to verify product was added
		const queryBuilder = context.getDatabase().createQueryBuilder();
		const result = await queryBuilder
			.select(['COUNT(*) as count'])
			.from('category_product')
			.where('category_id = ? AND product_id = ?', categoryId, productId)
			.getOne();

		expect(result.count).toBe(1);
	});

	test("should remove a product from a category", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const productCategoryRepo = context.getEntityManager<ProductCategory>('ProductCategory');
		const productRepo = context.getEntityManager('Product');

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

		// Add a product to a category
		await productCategoryRepo.manageManyToMany(
			categoryId,
			"products",
			[productId],
			"add"
		);

		// Use query builder to verify it was added
		const queryBuilder = context.getDatabase().createQueryBuilder();
		const beforeResult = await queryBuilder
			.select(['COUNT(*) as count'])
			.from('category_product')
			.where('category_id = ? AND product_id = ?', categoryId, productId)
			.getOne();

		expect(beforeResult.count).toBe(1);

		// Remove the product
		await productCategoryRepo.manageManyToMany(
			categoryId,
			"products",
			[productId],
			"remove"
		);

		// Use query builder to verify removal
		const afterResult = await queryBuilder
			.select(['COUNT(*) as count'])
			.from('category_product')
			.where('category_id = ? AND product_id = ?', categoryId, productId)
			.getOne();

		expect(afterResult.count).toBe(0);
	});

	test("should search categories by name", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const productCategoryRepo = context.getEntityManager<ProductCategory>('ProductCategory');

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

		// Use query builder for search instead of raw SQL
		const queryBuilder = context.getDatabase().createQueryBuilder();
		const categories = await queryBuilder
			.select('*')
			.from('categories')
			.whereLike('category_name', 'Dry')
			.execute();

		expect(categories.length).toBe(1);
		expect(categories[0].category_name).toBe("Dry Food");
	});

	test("should get category hierarchy", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const productCategoryRepo = context.getEntityManager<ProductCategory>('ProductCategory');

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

		// Get root categories using entity manager
		const rootCategories = await productCategoryRepo.findBy({ parent_id: null });

		// Build hierarchy using entity manager
		const hierarchy = [];
		for (const root of rootCategories) {
			const children = await productCategoryRepo.findBy({ parent_id: root.category_id });
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

		// Add products to categories using the entity manager
		await productCategoryRepo.manageManyToMany(parentId, "products", [productId], "add");
		await productCategoryRepo.manageManyToMany(childId1, "products", [productId], "add");
		await productCategoryRepo.manageManyToMany(childId2, "products", [productId], "add");

		// Use query builder to get direct product count
		const queryBuilder = context.getDatabase().createQueryBuilder();
		const directCountResult = await queryBuilder
			.select(['COUNT(*) as count'])
			.from('category_product')
			.where('category_id = ?', parentId)
			.getOne();

		// Get child categories using entity manager
		const childCategories = await productCategoryRepo.findBy({ parent_id: parentId });
		const childIds = childCategories.map(c => c.category_id);

		// Count products in child categories using query builder
		let childProductsCount = 0;
		for (const childId of childIds) {
			const childQueryBuilder = context.getDatabase().createQueryBuilder();
			const result = await childQueryBuilder
				.select(['COUNT(*) as count'])
				.from('category_product')
				.where('category_id = ?', childId)
				.getOne();

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