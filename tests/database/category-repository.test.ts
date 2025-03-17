// category-repository.test.ts
import {
	setupTestEnvironment,
	teardownTestEnvironment,
	getTestFramework,
	generateTestData,
	cleanupTestData
} from '../test-setup';
import { faker } from '@faker-js/faker';

// Define interfaces for entities
interface ProductCategory {
	category_id?: number;
	category_name: string;
	description?: string;
	parent_id?: number;
	image_url?: string;
	created_at?: string;
	updated_at?: string;
}

describe("Category Repository Operations", () => {
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
		// Clean up test data after each test
		await cleanupTestData();
	});

	test("should create a category", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const categoryManager = context.getEntityManager<ProductCategory>('ProductCategory');

		const uniqueName = `Test Category ${Date.now()}`;
		const categoryData: Partial<ProductCategory> = {
			category_name: uniqueName,
			description: 'A test category',
			image_url: 'https://example.com/image.jpg'
		};

		const categoryId = await categoryManager.create(categoryData);
		expect(categoryId).toBeGreaterThan(0);

		// Verify category creation
		const category = await categoryManager.findById(categoryId);
		expect(category).toBeDefined();
		expect(category?.category_name).toBe(uniqueName);
		expect(category?.description).toBe('A test category');
	});

	test("should create child categories with parent-child relationship", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const categoryManager = context.getEntityManager<ProductCategory>('ProductCategory');

		// Create parent category
		const parentName = `Parent Category ${Date.now()}`;
		const parentId = await categoryManager.create({
			category_name: parentName,
			description: 'A parent category'
		});

		// Create child category
		const childName = `Child Category ${Date.now()}`;
		const childId = await categoryManager.create({
			category_name: childName,
			description: 'A child category',
			parent_id: parentId
		});

		// Verify parent category
		const parent = await categoryManager.findById(parentId);
		expect(parent).toBeDefined();
		expect(parent?.category_name).toBe(parentName);

		// Verify child category
		const child = await categoryManager.findById(childId);
		expect(child).toBeDefined();
		expect(child?.category_name).toBe(childName);
		expect(child?.parent_id).toBe(parentId);
	});

	test("should find categories by name", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const categoryManager = context.getEntityManager<ProductCategory>('ProductCategory');

		// Create categories with a specific pattern in the name
		const namePrefix = `FindTest ${Date.now()}`;

		for (let i = 0; i < 3; i++) {
			await categoryManager.create({
				category_name: `${namePrefix} Category ${i}`,
				description: `Test category ${i}`
			});
		}

		// Create another category with a different name
		await categoryManager.create({
			category_name: `Other Category ${Date.now()}`,
			description: 'Other category'
		});

		// Search for categories with the prefix
		const db = context.getDatabase();
		const found = await db.findBy('categories', {}, {
			orderBy: [{ field: 'category_name', direction: 'ASC' }]
		});

		// Filter in memory since different databases handle LIKE differently
		const filteredCategories = found.filter(cat =>
			cat.category_name.includes(namePrefix)
		);

		// Should find exactly 3 categories with our prefix
		expect(filteredCategories.length).toBe(3);
		// Verify they're in the right order
		expect(filteredCategories[0].category_name).toContain('0');
		expect(filteredCategories[1].category_name).toContain('1');
		expect(filteredCategories[2].category_name).toContain('2');
	});

	test("should update a category", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const categoryManager = context.getEntityManager<ProductCategory>('ProductCategory');

		// Create a category
		const originalName = `Update Test ${Date.now()}`;
		const categoryId = await categoryManager.create({
			category_name: originalName,
			description: 'Original description'
		});

		// Update the category
		const newName = `Updated Category ${Date.now()}`;
		const result = await categoryManager.update(categoryId, {
			category_name: newName,
			description: 'Updated description'
		});

		expect(result).toBe(1); // 1 row affected

		// Verify update
		const updated = await categoryManager.findById(categoryId);
		expect(updated).toBeDefined();
		expect(updated?.category_name).toBe(newName);
		expect(updated?.description).toBe('Updated description');
	});

	test("should delete a category", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const categoryManager = context.getEntityManager<ProductCategory>('ProductCategory');

		// Create a category to delete
		const categoryId = await categoryManager.create({
			category_name: `Delete Test ${Date.now()}`,
			description: 'To be deleted'
		});

		// Verify category exists
		let category = await categoryManager.findById(categoryId);
		expect(category).toBeDefined();

		// Delete the category
		const deleteResult = await categoryManager.delete(categoryId);
		expect(deleteResult).toBe(1);

		// Verify category is deleted
		category = await categoryManager.findById(categoryId);
		expect(category).toBeUndefined();
	});

	test("should find categories with hierarchy", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const categoryManager = context.getEntityManager<ProductCategory>('ProductCategory');

		// Create a hierarchy of categories
		const timestamp = Date.now();
		const rootId = await categoryManager.create({
			category_name: `Root ${timestamp}`,
			description: 'Root category'
		});

		const child1Id = await categoryManager.create({
			category_name: `Child 1 ${timestamp}`,
			description: 'First child',
			parent_id: rootId
		});

		const child2Id = await categoryManager.create({
			category_name: `Child 2 ${timestamp}`,
			description: 'Second child',
			parent_id: rootId
		});

		const grandchildId = await categoryManager.create({
			category_name: `Grandchild ${timestamp}`,
			description: 'Grandchild category',
			parent_id: child1Id
		});

		// Find all categories
		const categories = await categoryManager.findBy({});

		// Filter for just our categories from this test
		const testCategories = categories.filter(c =>
			c.category_name.includes(timestamp.toString())
		);

		// Should have our 4 categories
		expect(testCategories.length).toBe(4);

		// Find root categories (no parent)
		const rootCategories = testCategories.filter(c => !c.parent_id);
		expect(rootCategories.length).toBe(1);
		expect(rootCategories[0].category_id).toBe(rootId);

		// Find child categories of root
		const childCategories = testCategories.filter(c => c.parent_id === rootId);
		expect(childCategories.length).toBe(2);
		expect(childCategories.some(c => c.category_id === child1Id)).toBe(true);
		expect(childCategories.some(c => c.category_id === child2Id)).toBe(true);

		// Find grandchild categories
		const grandchildCategories = testCategories.filter(c => c.parent_id === child1Id);
		expect(grandchildCategories.length).toBe(1);
		expect(grandchildCategories[0].category_id).toBe(grandchildId);
	});
});