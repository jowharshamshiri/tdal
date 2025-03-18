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
		const db = context.getDatabase();
		const queryBuilder = db.createQueryBuilder();
		const categories = await queryBuilder
			.select([
				'c.category_id',
				'c.category_name',
				'c.description',
				'c.parent_id',
				'p.category_name as parent_name',
				'(SELECT COUNT(*) FROM categories cc WHERE cc.parent_id = c.category_id) as child_count'
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

		// Add product to category using manageManyToMany
		await productCategoryRepo.manageManyToMany(parentId, 'products', [productId], 'add');

		// Get category details using entity manager
		const category = await productCategoryRepo.findById(parentId);

		// Get parent category details if needed
		let parentCategory = null;
		if (category?.parent_id) {
			parentCategory = await productCategoryRepo.findById(category.parent_id);
		}

		// Get children using entity manager
		const children = await productCategoryRepo.findBy({ parent_id: parentId });

		// Get descendant count
		const descendantCount = children.length;

		// Get products using findRelated
		const products = await productCategoryRepo.findRelated<any>(parentId, 'products');

		// Combine the results
		const fullCategoryDetail = {
			...category,
			parent_category_id: category?.parent_id,
			parent_category_name: parentCategory?.category_name,
			descendant_count,
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
		await productCategoryRepo.manageManyToMany(categoryId, 'products', [productId], 'add');

		// Verify product was added using findRelated
		const products = await productCategoryRepo.findRelated<any>(categoryId, 'products');
		expect(products.length).toBe(1);
		expect(products[0].title).toBe("Premium Chow");
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

		// Add product to category using manageManyToMany
		await productCategoryRepo.manageManyToMany(categoryId, 'products', [productId], 'add');

		// Verify it was added
		const beforeProducts = await productCategoryRepo.findRelated<any>(categoryId, 'products');
		expect(beforeProducts.length).toBe(1);

		// Remove the product using manageManyToMany
		await productCategoryRepo.manageManyToMany(categoryId, 'products', [productId], 'remove');

		// Verify removal
		const afterProducts = await productCategoryRepo.findRelated<any>(categoryId, 'products');
		expect(afterProducts.length).toBe(0);
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

		// Use query builder instead of raw SQL
		const db = context.getDatabase();
		const queryBuilder = db.createQueryBuilder();
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

		// Get children for each root category
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

		// Add products to categories using manageManyToMany
		await productCategoryRepo.manageManyToMany(parentId, 'products', [productId], 'add');
		await productCategoryRepo.manageManyToMany(childId1, 'products', [productId], 'add');
		await productCategoryRepo.manageManyToMany(childId2, 'products', [productId], 'add');

		// Get direct product count
		const parentProducts = await productCategoryRepo.findRelated<any>(parentId, 'products');
		const directCount = parentProducts.length;

		// Get child category IDs
		const childCategories = await productCategoryRepo.findBy({ parent_id: parentId });
		const childIds = childCategories.map(c => c.category_id);

		// Count products in child categories
		let childProductsCount = 0;
		for (const childId of childIds) {
			const childProducts = await productCategoryRepo.findRelated<any>(childId, 'products');
			childProductsCount += childProducts.length;
		}

		const counts = {
			direct: directCount,
			total: directCount + childProductsCount
		};

		expect(counts).toBeDefined();
		expect(counts.direct).toBe(1);
		expect(counts.total).toBe(3); // Dog Food (1) + Dry Food (1) + Wet Food (1)
	});
});