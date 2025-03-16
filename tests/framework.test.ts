// framework.test.ts
import { setupTestEnvironment, teardownTestEnvironment, getTestFramework, generateTestData } from './test-setup';

// Define the interface for our test entity
interface TestEntity {
	id?: number;
	name: string;
	active: boolean;
}

describe('Framework Tests', () => {

	beforeEach(async () => {
		// Generate test data with relationships
		await generateTestData({
			count: 5,  // 5 records per entity
			withRelations: true,
			// Customize specific fields if needed
			customGenerators: {
				email: () => 'test@example.com'
			},
			// Set fixed values for specific entities/fields
			fixedValues: {
				User: {
					role: 'admin'
				}
			}
		});
	});

	it('should initialize framework with configuration', () => {
		const framework = getTestFramework();
		const config = framework.getConfig();

		expect(config).toBeDefined();
		expect(config.name).toEqual('Test API Framework');
		expect(config.version).toEqual('1.0.0');
	});

	it('should register and access a test entity', async () => {
		// Get the entity DAO
		const framework = getTestFramework();
		const context = framework.getContext();
		const entityDao = context.getEntityManager<TestEntity>('TestEntity');

		expect(entityDao).toBeDefined();

		// Create a test record
		const id = await entityDao.create({
			name: 'Test Record',
			active: true
		});

		expect(id).toBeDefined();

		// Retrieve the record
		const record = await entityDao.findById(id);

		expect(record).toBeDefined();
		expect(record?.name).toEqual('Test Record');
		expect(record?.active).toBe(true);
	});
});