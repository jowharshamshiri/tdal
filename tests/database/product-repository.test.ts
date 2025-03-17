// product-repository.test.ts
import {
	setupTestEnvironment,
	teardownTestEnvironment,
	getTestFramework,
	generateTestData,
	cleanupTestData
} from "../test-setup";
import { DatabaseAdapter } from "../../src/database/core/types";

// Define interfaces for the entities we'll work with
interface Product {
	product_id?: number;
	title: string;
	pricing: string;
	hint?: string;
	teaser?: string;
	credit_cost?: number;
	is_free: boolean;
	total_view_count?: number;
	bookmark_count?: number;
	avg_view_time?: number;
	created_at?: string;
	updated_at?: string;
}

interface ProductCategory {
	category_id?: number;
	category_name: string;
	description?: string;
	parent_id?: number;
	image_url?: string;
}

// Helper function to generate a unique name with timestamp and random suffix
function uniqueName(prefix: string = ''): string {
	const timestamp = Date.now();
	const random = Math.floor(Math.random() * 10000);
	return `${prefix}-${timestamp}-${random}`;
}

describe("Product Repository Operations", () => {
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
		// Clean up any test data created during the test
		await cleanupTestData();
	});

	test("should find products by category ID", async () => {
		// Generate test data with unique names
		const uniqueCategoryName = uniqueName('dog-food');
		const uniqueProductName = uniqueName('kibble');

		await generateTestData({
			count: 1,
			withRelations: true,
			fixedValues: {
				ProductCategory: {
					category_name: uniqueCategoryName,
					description: 'Dog food category'
				},
				Product: {
					title: uniqueProductName,
					pricing: 'premium',
					is_free: false,
					credit_cost: 5
				}
			}
		});

		// Get the framework and entity managers
		const framework = getTestFramework();
		const context = framework.getContext();
		const categoryManager = context.getEntityManager<ProductCategory>('ProductCategory');
		const productManager = context.getEntityManager<Product>('Product');

		// Get the category ID for our test
		const categories = await categoryManager.findBy({ category_name: uniqueCategoryName });
		expect(categories.length).toBe(1);
		const categoryId = categories[0].category_id;

		// Use junction table to add product to category
		const db = context.getDatabase();
		const productResult = await productManager.findBy({ title: uniqueProductName });
		expect(productResult.length).toBe(1);
		const productId = productResult[0].product_id;

		// Add the product to the category using the junction table
		await db.execute(
			"INSERT INTO category_product (category_id, product_id) VALUES (?, ?)",
			categoryId, productId
		);

		// Now test finding products by category ID
		const products = await productManager.findBy({ "category_product.category_id": categoryId });

		expect(products.length).toBeGreaterThan(0);
		expect(products.some(p => p.title === uniqueProductName)).toBe(true);
	});

	test("should find free products", async () => {
		// Generate test data with unique names and free products
		const uniqueFreeProduct1 = uniqueName('free-product');
		const uniqueFreeProduct2 = uniqueName('free-product');

		await generateTestData({
			count: 1,
			withRelations: false,
			fixedValues: {
				Product: [
					{
						title: uniqueFreeProduct1,
						pricing: 'free',
						is_free: true,
					},
					{
						title: uniqueFreeProduct2,
						pricing: 'free trial',
						is_free: true,
					}
				]
			}
		});

		// Get the framework and entity manager
		const framework = getTestFramework();
		const context = framework.getContext();
		const productManager = context.getEntityManager<Product>('Product');

		// Find free products
		const products = await productManager.findBy({ is_free: true });

		expect(products.length).toBeGreaterThan(0);
		expect(products.every(p => p.is_free)).toBe(true);
		// Verify at least one of our test products is found
		expect(products.some(p =>
			p.title === uniqueFreeProduct1 || p.title === uniqueFreeProduct2
		)).toBe(true);
	});

	test("should get product metadata for a user", async () => {
		// Generate test data with unique names
		const uniqueProductName = uniqueName('premium-product');
		const uniqueUsername = uniqueName('test-user');

		await generateTestData({
			count: 1,
			withRelations: true,
			fixedValues: {
				User: {
					name: uniqueUsername,
					email: `${uniqueUsername}@example.com`,
					role: 'user'
				},
				Product: {
					title: uniqueProductName,
					pricing: 'premium content',
					is_free: false,
					credit_cost: 5
				}
			}
		});

		// Get framework and entity managers
		const framework = getTestFramework();
		const context = framework.getContext();
		const db = context.getDatabase();
		const userManager = context.getEntityManager('User');
		const productManager = context.getEntityManager<Product>('Product');

		// Find our test user and product
		const users = await userManager.findBy({ name: uniqueUsername });
		expect(users.length).toBe(1);
		const userId = users[0].user_id;

		const products = await productManager.findBy({ title: uniqueProductName });
		expect(products.length).toBe(1);
		const productId = products[0].product_id;

		// Add resource access record for this user and product
		await db.execute(
			"INSERT INTO user_resource_access (user_id, resource_type, resource_id, credit_cost, access_date, created_at) VALUES (?, ?, ?, ?, ?, ?)",
			userId, "product", productId, 5, new Date().toISOString(), new Date().toISOString()
		);

		// Add user credits
		await db.execute(
			"INSERT INTO user_credits (user_id, amount, source, purchase_date, expiry_date) VALUES (?, ?, ?, ?, ?)",
			userId, 60, "test", new Date().toISOString(), new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
		);

		// Now use a query builder to get product with metadata for this user
		const queryBuilder = db.createQueryBuilder();
		const productWithMeta = await queryBuilder
			.select([
				'p.*',
				'CASE WHEN p.is_free = 1 THEN 0 ELSE 1 END as requires_credits',
				'CASE WHEN ra.resource_id IS NOT NULL THEN 1 ELSE 0 END as has_access'
			])
			.from('products', 'p')
			.leftJoin(
				'user_resource_access',
				'ra',
				`p.product_id = ra.resource_id AND ra.resource_type = 'product' AND ra.user_id = ?`,
				userId
			)
			.where('p.product_id = ?', productId)
			.getOne();

		expect(productWithMeta).toBeDefined();
		expect(productWithMeta.title).toBe(uniqueProductName);
		expect(productWithMeta.requires_credits).toBeTruthy();
		expect(productWithMeta.has_access).toBeTruthy();
	});

	test("should search products by text", async () => {
		// Generate test data with a unique product name containing searchable text
		const searchTerm = "Meaty";
		const uniqueProductName = uniqueName(`${searchTerm}-chunks`);

		await generateTestData({
			count: 1,
			withRelations: false,
			fixedValues: {
				Product: {
					title: uniqueProductName,
					pricing: 'premium',
					is_free: false,
					credit_cost: 5
				}
			}
		});

		// Get the framework and entity manager
		const framework = getTestFramework();
		const context = framework.getContext();
		const db = context.getDatabase();
		const productManager = context.getEntityManager<Product>('Product');

		// Run the search
		const queryBuilder = db.createQueryBuilder();
		const results = await queryBuilder
			.select('*')
			.from('products')
			.whereLike('title', searchTerm)
			.execute();

		expect(results.length).toBeGreaterThan(0);
		expect(results.some(p => p.title === uniqueProductName)).toBe(true);
	});

	test("should bookmark a product", async () => {
		// Generate test data with unique names
		const uniqueProductName = uniqueName('bookmark-product');
		const uniqueUsername = uniqueName('bookmark-user');

		await generateTestData({
			count: 1,
			withRelations: true,
			fixedValues: {
				User: {
					name: uniqueUsername,
					email: `${uniqueUsername}@example.com`,
					role: 'user'
				},
				Product: {
					title: uniqueProductName,
					pricing: 'standard',
					is_free: true,
					bookmark_count: 0
				}
			}
		});

		// Get the framework and entity managers
		const framework = getTestFramework();
		const context = framework.getContext();
		const db = context.getDatabase();
		const userManager = context.getEntityManager('User');
		const productManager = context.getEntityManager<Product>('Product');

		// Find our test user and product
		const users = await userManager.findBy({ name: uniqueUsername });
		expect(users.length).toBe(1);
		const userId = users[0].user_id;

		const products = await productManager.findBy({ title: uniqueProductName });
		expect(products.length).toBe(1);
		const productId = products[0].product_id;

		// Create a bookmark
		await db.execute(
			"INSERT INTO user_product_bookmark (user_id, product_id, created_at, removed) VALUES (?, ?, ?, ?)",
			userId, productId, new Date().toISOString(), 0
		);

		// Update the product bookmark count
		await productManager.update(productId, { bookmark_count: 1 });

		// Verify bookmark was created
		const bookmark = await db.querySingle(
			"SELECT * FROM user_product_bookmark WHERE user_id = ? AND product_id = ?",
			userId, productId
		);
		expect(bookmark).toBeDefined();
		expect((bookmark as any)?.removed).toBe(0);

		// Verify product bookmark count was updated
		const updatedProduct = await productManager.findById(productId);
		expect(updatedProduct).toBeDefined();
		expect(updatedProduct?.bookmark_count).toBe(1);
	});

	test("should update user data for a product", async () => {
		// Generate test data with unique names
		const uniqueProductName = uniqueName('user-data-product');
		const uniqueUsername = uniqueName('user-data-user');

		await generateTestData({
			count: 1,
			withRelations: true,
			fixedValues: {
				User: {
					name: uniqueUsername,
					email: `${uniqueUsername}@example.com`,
					role: 'user'
				},
				Product: {
					title: uniqueProductName,
					pricing: 'standard',
					is_free: true,
					total_view_count: 0,
					avg_view_time: 0
				}
			}
		});

		// Get the framework and entity managers
		const framework = getTestFramework();
		const context = framework.getContext();
		const db = context.getDatabase();
		const userManager = context.getEntityManager('User');
		const productManager = context.getEntityManager<Product>('Product');

		// Find our test user and product
		const users = await userManager.findBy({ name: uniqueUsername });
		expect(users.length).toBe(1);
		const userId = users[0].user_id;

		const products = await productManager.findBy({ title: uniqueProductName });
		expect(products.length).toBe(1);
		const productId = products[0].product_id;

		// Add user data
		const viewTime = 30;
		const notes = "This is a test note";

		await db.execute(
			"INSERT INTO user_product_data (user_id, product_id, view_count, last_viewed, total_view_time, notes) VALUES (?, ?, ?, ?, ?, ?)",
			userId, productId, 1, new Date().toISOString(), viewTime, notes
		);

		// Update product stats
		await productManager.update(productId, {
			total_view_count: 1,
			avg_view_time: viewTime
		});

		// Verify user data was created
		const userData = await db.querySingle(
			"SELECT * FROM user_product_data WHERE user_id = ? AND product_id = ?",
			userId, productId
		);
		expect(userData).toBeDefined();
		expect((userData as any)?.view_count).toBe(1);
		expect((userData as any)?.total_view_time).toBe(viewTime);
		expect((userData as any)?.notes).toBe(notes);

		// Verify product stats were updated
		const updatedProduct = await productManager.findById(productId);
		expect(updatedProduct).toBeDefined();
		if (updatedProduct) {
			expect(updatedProduct.total_view_count).toBe(1);
			expect(updatedProduct.avg_view_time).toBe(viewTime);
		}
	});
});