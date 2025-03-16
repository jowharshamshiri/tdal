// framework.test.ts
import { setupTestEnvironment, teardownTestEnvironment, getTestFramework } from './test-setup';

// Define the interface for our test entity
interface TestEntity {
	id?: number;
	name: string;
	active: boolean;
}

describe('Framework Tests', () => {
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