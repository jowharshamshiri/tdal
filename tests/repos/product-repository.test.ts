// product-repository.test.ts
import { faker } from '@faker-js/faker';
import {
	setupTestEnvironment,
	teardownTestEnvironment,
	getTestFramework,
	cleanupTestData
} from "../test-setup";

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
		// Get the framework and entity managers
		const framework = getTestFramework();
		const context = framework.getContext();
		const categoryManager = context.getEntityManager<ProductCategory>('ProductCategory');
		const productManager = context.getEntityManager<Product>('Product');

		// Create a category
		const uniqueCategoryName = faker.commerce.department();
		const categoryId = await categoryManager.create({
			category_name: uniqueCategoryName,
			description: 'Test category description'
		});

		// Create a product
		const uniqueProductName = faker.commerce.productName();
		const productId = await productManager.create({
			title: uniqueProductName,
			pricing: 'premium',
			is_free: false,
			credit_cost: 5
		});

		// Add the product to the category using the framework's relationship management
		await categoryManager.manageManyToMany(
			categoryId,
			"products", // relationship name from ProductCategory entity
			[productId],
			"add"
		);

		// Find products for the category using a custom query
		const queryBuilder = context.getDatabase().createQueryBuilder();
		const products = await queryBuilder
			.select('p.*')
			.from('products', 'p')
			.innerJoin('category_product', 'cp', 'p.product_id = cp.product_id')
			.where('cp.category_id = ?', categoryId)
			.execute();

		expect(products.length).toBe(1);
		expect(products[0].title).toBe(uniqueProductName);
	});

	test("should find free products", async () => {
		// Get the framework and entity manager
		const framework = getTestFramework();
		const context = framework.getContext();
		const productManager = context.getEntityManager<Product>('Product');

		// Create multiple products
		const uniqueFreeProduct1 = faker.commerce.productName();
		await productManager.create({
			title: uniqueFreeProduct1,
			pricing: 'free',
			is_free: true,
			credit_cost: 0
		});

		const uniqueFreeProduct2 = faker.commerce.productName();
		await productManager.create({
			title: uniqueFreeProduct2,
			pricing: 'free trial',
			is_free: true,
			credit_cost: 0
		});

		const paidProduct = faker.commerce.productName();
		await productManager.create({
			title: paidProduct,
			pricing: '$9.99',
			is_free: false,
			credit_cost: 10
		});

		// Find free products
		const products = await productManager.findBy({ is_free: true });

		expect(products.length).toBe(2);
		expect(products.every(p => p.is_free === true)).toBe(true);

		// Verify both our free products are found
		const productTitles = products.map(p => p.title);
		expect(productTitles).toContain(uniqueFreeProduct1);
		expect(productTitles).toContain(uniqueFreeProduct2);
		expect(productTitles).not.toContain(paidProduct);
	});

	test("should get product metadata for a user", async () => {
		// Get framework and entity managers
		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager('User');
		const productManager = context.getEntityManager<Product>('Product');
		const db = context.getDatabase();

		// Create a user
		const uniqueUsername = faker.internet.userName();
		const userId = await userManager.create({
			name: uniqueUsername,
			email: faker.internet.email(),
			password: faker.internet.password(),
			role: 'user'
		});

		// Create a product
		const uniqueProductName = faker.commerce.productName();
		const productId = await productManager.create({
			title: uniqueProductName,
			pricing: 'premium content',
			is_free: false,
			credit_cost: 5
		});

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

		// Use a query builder to get product with metadata for this user
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
		// Get the framework and entity manager
		const framework = getTestFramework();
		const context = framework.getContext();
		const productManager = context.getEntityManager<Product>('Product');

		// Generate test data with a unique product name containing searchable text
		const searchTerm = "Meaty";
		const uniqueProductName = `${searchTerm} ${faker.commerce.productName()}`;

		// Create a product containing the search term
		await productManager.create({
			title: uniqueProductName,
			pricing: 'premium',
			is_free: false,
			credit_cost: 5
		});

		// Create other products that don't contain the search term
		await productManager.create({
			title: faker.commerce.productName(),
			pricing: 'standard',
			is_free: false,
			credit_cost: 3
		});

		// Run the search
		const db = context.getDatabase();
		const queryBuilder = db.createQueryBuilder();
		const results = await queryBuilder
			.select('*')
			.from('products')
			.whereLike('title', searchTerm)
			.execute();

		expect(results.length).toBe(1);
		expect(results[0].title).toBe(uniqueProductName);
	});

	test("should bookmark a product", async () => {
		// Get the framework and entity managers
		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager('User');
		const productManager = context.getEntityManager<Product>('Product');
		const bookmarkManager = context.getEntityManager('UserProductBookmark');

		// Create a user
		const uniqueUsername = faker.internet.userName();
		const userId = await userManager.create({
			name: uniqueUsername,
			email: faker.internet.email(),
			password: faker.internet.password(),
			role: 'user'
		});

		// Create a product
		const uniqueProductName = faker.commerce.productName();
		const productId = await productManager.create({
			title: uniqueProductName,
			pricing: 'standard',
			is_free: true,
			bookmark_count: 0
		});

		// Create a bookmark
		await bookmarkManager.create({
			user_id: userId,
			product_id: productId,
			created_at: new Date().toISOString(),
			removed: false
		});

		// Update the product bookmark count
		await productManager.update(productId, { bookmark_count: 1 });

		// Verify bookmark was created
		const bookmarks = await bookmarkManager.findBy({
			user_id: userId,
			product_id: productId
		});

		expect(bookmarks.length).toBe(1);
		expect(bookmarks[0].removed).toBe(false);

		// Verify product bookmark count was updated
		const updatedProduct = await productManager.findById(productId);
		expect(updatedProduct).toBeDefined();
		expect(updatedProduct?.bookmark_count).toBe(1);
	});

	test("should update user data for a product", async () => {
		// Get the framework and entity managers
		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager('User');
		const productManager = context.getEntityManager<Product>('Product');
		const productDataManager = context.getEntityManager('UserProductData');

		// Create a user
		const uniqueUsername = faker.internet.userName();
		const userId = await userManager.create({
			name: uniqueUsername,
			email: faker.internet.email(),
			password: faker.internet.password(),
			role: 'user'
		});

		// Create a product
		const uniqueProductName = faker.commerce.productName();
		const productId = await productManager.create({
			title: uniqueProductName,
			pricing: 'standard',
			is_free: true,
			total_view_count: 0,
			avg_view_time: 0
		});

		// Add user data
		const viewTime = 30;
		const notes = "This is a test note";

		await productDataManager.create({
			user_id: userId,
			product_id: productId,
			view_count: 1,
			last_viewed: new Date().toISOString(),
			total_view_time: viewTime,
			notes: notes
		});

		// Update product stats
		await productManager.update(productId, {
			total_view_count: 1,
			avg_view_time: viewTime
		});

		// Verify user data was created
		const userData = await productDataManager.findBy({
			user_id: userId,
			product_id: productId
		});

		expect(userData.length).toBe(1);
		expect(userData[0].view_count).toBe(1);
		expect(userData[0].total_view_time).toBe(viewTime);
		expect(userData[0].notes).toBe(notes);

		// Verify product stats were updated
		const updatedProduct = await productManager.findById(productId);
		expect(updatedProduct).toBeDefined();
		if (updatedProduct) {
			expect(updatedProduct.total_view_count).toBe(1);
			expect(updatedProduct.avg_view_time).toBe(viewTime);
		}
	});
});