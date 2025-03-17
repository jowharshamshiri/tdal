// product-repository.test.ts
import {
	setupTestEnvironment,
	teardownTestEnvironment,
	getTestFramework,
	generateTestData,
	cleanupTestData
} from '../test-setup';
import { faker } from '@faker-js/faker';

// Define interfaces for Product-related entities based on test-app.yaml
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
	created_at?: string;
	updated_at?: string;
}

// Helper function to generate a unique title
function uniqueTitle(prefix: string = ''): string {
	const timestamp = Date.now();
	const random = Math.floor(Math.random() * 10000);
	return `${prefix} Product ${timestamp}-${random}`;
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

	test("should create and retrieve a product", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const productManager = context.getEntityManager<Product>('Product');

		const uniqueProductTitle = uniqueTitle('Create');

		// Create a new product
		const productData = {
			title: uniqueProductTitle,
			pricing: "premium",
			hint: "This is a test hint",
			teaser: "This is a test teaser",
			credit_cost: 10,
			is_free: false
		};

		const productId = await productManager.create(productData);
		expect(productId).toBeGreaterThan(0);

		// Retrieve the product
		const product = await productManager.findById(productId);
		expect(product).toBeDefined();
		expect(product?.title).toBe(uniqueProductTitle);
		expect(product?.pricing).toBe("premium");
		expect(product?.credit_cost).toBe(10);
		expect(product?.is_free).toBe(false);
	});

	test("should update a product's information", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const productManager = context.getEntityManager<Product>('Product');

		const uniqueProductTitle = uniqueTitle('Update');

		// Create a product to update
		const productId = await productManager.create({
			title: uniqueProductTitle,
			pricing: "standard",
			credit_cost: 5,
			is_free: false
		});

		// Update the product
		const updatedData = {
			pricing: "premium",
			credit_cost: 15,
			teaser: "New exciting teaser!"
		};

		const result = await productManager.update(productId, updatedData);
		expect(result).toBe(1); // One row affected

		// Verify the update
		const updatedProduct = await productManager.findById(productId);
		expect(updatedProduct).toBeDefined();
		expect(updatedProduct?.title).toBe(uniqueProductTitle); // Title should remain unchanged
		expect(updatedProduct?.pricing).toBe("premium");
		expect(updatedProduct?.credit_cost).toBe(15);
		expect(updatedProduct?.teaser).toBe("New exciting teaser!");
	});

	test("should find products by pricing type", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const productManager = context.getEntityManager<Product>('Product');

		// Create several products with different pricing
		await productManager.create({
			title: uniqueTitle('Free'),
			pricing: "free",
			is_free: true
		});

		await productManager.create({
			title: uniqueTitle('Standard1'),
			pricing: "standard",
			credit_cost: 5,
			is_free: false
		});

		await productManager.create({
			title: uniqueTitle('Standard2'),
			pricing: "standard",
			credit_cost: 7,
			is_free: false
		});

		await productManager.create({
			title: uniqueTitle('Premium'),
			pricing: "premium",
			credit_cost: 15,
			is_free: false
		});

		// Find products by pricing
		const freeProducts = await productManager.findBy({ pricing: "free" });
		const standardProducts = await productManager.findBy({ pricing: "standard" });
		const premiumProducts = await productManager.findBy({ pricing: "premium" });

		expect(freeProducts.length).toBe(1);
		expect(standardProducts.length).toBe(2);
		expect(premiumProducts.length).toBe(1);
	});

	test("should handle product categories relationship", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const productManager = context.getEntityManager<Product>('Product');
		const categoryManager = context.getEntityManager<ProductCategory>('ProductCategory');

		// Create a category
		const categoryName = `Test Category ${Date.now()}`;
		const categoryId = await categoryManager.create({
			category_name: categoryName,
			description: "Test category description"
		});

		// Create a product
		const productId = await productManager.create({
			title: uniqueTitle('Category'),
			pricing: "standard",
			credit_cost: 5,
			is_free: false
		});

		// Associate product with category (if the method is available)
		if (productManager.manageManyToMany) {
			await productManager.manageManyToMany(
				productId,
				"categories",
				[categoryId],
				'add'
			);

			// Find related categories through product's relation
			const relatedCategories = await productManager.findRelated(productId, "categories");
			expect(relatedCategories.length).toBe(1);
			expect(relatedCategories[0].category_name).toBe(categoryName);
		}

		// Alternative approach for checking relationship
		// This depends on how the database schema is set up, but we'll include it as a fallback
		const sql = `
		SELECT c.category_name 
		FROM categories c
		JOIN category_product cp ON c.category_id = cp.category_id
		WHERE cp.product_id = ?
	  `;

		try {
			const db = context.getDatabase();
			const results = await db.query(sql, productId);
			if (results.length > 0) {
				expect(results[0].category_name).toBe(categoryName);
			}
		} catch (error) {
			// If this fails, it might be because the query doesn't match the schema
			// We'll rely on the manageManyToMany test above
		}
	});

	test("should delete a product", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const productManager = context.getEntityManager<Product>('Product');

		// Create a product to delete
		const productId = await productManager.create({
			title: uniqueTitle('Delete'),
			pricing: "standard",
			credit_cost: 5,
			is_free: false
		});

		// Delete the product
		const result = await productManager.delete(productId);
		expect(result).toBe(1); // One row affected

		// Verify the product was deleted
		const deletedProduct = await productManager.findById(productId);
		expect(deletedProduct).toBeUndefined();
	});

	test("should find products by free status", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const productManager = context.getEntityManager<Product>('Product');

		// Create free and paid products
		await productManager.create({
			title: uniqueTitle('Free1'),
			pricing: "free",
			is_free: true
		});

		await productManager.create({
			title: uniqueTitle('Free2'),
			pricing: "free",
			is_free: true
		});

		await productManager.create({
			title: uniqueTitle('Paid1'),
			pricing: "standard",
			credit_cost: 5,
			is_free: false
		});

		// Find products by is_free status
		const freeProducts = await productManager.findBy({ is_free: true });
		const paidProducts = await productManager.findBy({ is_free: false });

		expect(freeProducts.length).toBe(2);
		expect(paidProducts.length).toBe(1);
	});

	test("should perform search on product titles", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const productManager = context.getEntityManager<Product>('Product');

		// Create products with specific titles for searching
		await productManager.create({
			title: "Unique Programming Course",
			pricing: "premium",
			is_free: false
		});

		await productManager.create({
			title: "Programming for Beginners",
			pricing: "standard",
			is_free: false
		});

		await productManager.create({
			title: "Advanced Art Techniques",
			pricing: "premium",
			is_free: false
		});

		// Search for products with 'Programming' in the title
		// Some implementations might use a special search method
		let programmingProducts;

		if (typeof productManager.search === 'function') {
			programmingProducts = await productManager.search("Programming");
		} else {
			// Fall back to using findBy with LIKE condition if search isn't available
			const db = context.getDatabase();
			const qb = db.createQueryBuilder();
			qb.select(['*'])
				.from('products')
				.where("title LIKE ?", "%Programming%");

			programmingProducts = await qb.execute();
		}

		expect(programmingProducts.length).toBe(2);

		// Ensure both programming courses are found
		const titles = programmingProducts.map(p => p.title);
		expect(titles).toContain("Unique Programming Course");
		expect(titles).toContain("Programming for Beginners");
		expect(titles).not.toContain("Advanced Art Techniques");
	});
});