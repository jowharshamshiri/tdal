// test-setup.ts
import { Framework } from "../src/core/framework";
import { DatabaseContext } from "../src/database/core/database-context";
import * as path from "path";
import * as fs from "fs";
import { faker } from '@faker-js/faker';
import { EntityConfig } from '../src/entity/entity-config';
import { Relation } from '../src/database';
// Import EntityGenerator at the top of the file
import { EntityGenerator, createEntityGenerator } from "../src/generator/entity-generator";

/**
 * Test framework instance
 */
let testFramework: Framework | null = null;

/**
 * Test data factory instance
 */
let testDataFactory: TestDataFactory | null = null;


/**
 * Initialize the test environment
 * @param configPath Path to the configuration file
 * @returns Initialized framework instance
 */
export async function setupTestEnvironment(configPath: string = './tests/test-app.yaml'): Promise<Framework> {
	// Check if test framework already exists
	if (testFramework) {
		return testFramework;
	}

	try {
		// Resolve the absolute path to the config file
		const absoluteConfigPath = path.resolve(process.cwd(), configPath);

		// Verify the config file exists
		if (!fs.existsSync(absoluteConfigPath)) {
			throw new Error(`Config file not found at: ${absoluteConfigPath}`);
		}

		// Create test data directory structure
		const dataDir = path.join(process.cwd(), 'data');
		if (!fs.existsSync(dataDir)) {
			fs.mkdirSync(dataDir, { recursive: true });
		}

		// Reset database context before initializing (to avoid stale connections)
		if (DatabaseContext.hasInstance && DatabaseContext.hasInstance()) {
			DatabaseContext.closeDatabase();
		}

		// Initialize framework with the config file
		testFramework = new Framework({
			configPath: absoluteConfigPath,
			autoGenerateApi: false // Don't auto-generate API to speed up tests
		});

		// Initialize the framework - this will load the entities from the config file
		// and synchronize the database schema
		await testFramework.initialize(absoluteConfigPath);

		// Get the application context
		const context = testFramework.getContext();

		// Initialize entity generator to generate all required repositories
		const entityGenerator = createEntityGenerator(context, {
			entityDirectory: path.dirname(absoluteConfigPath),
			logger: context.getLogger()
		});

		// Create repository instances for all entities
		const repositories = await entityGenerator.createRepositoryInstances();

		// Store repositories for later use (optional)
		(testFramework as any).repositories = repositories;

		context.getLogger().info('Test environment successfully initialized with entity repositories');
		return testFramework;
	} catch (error) {
		console.error('Failed to initialize test environment:', error);
		throw error;
	}
}

/**
 * Get the test framework instance
 * @returns Test framework instance
 * @throws Error if the test environment hasn't been initialized
 */
export function getTestFramework(): Framework {
	if (!testFramework) {
		throw new Error('Test environment not initialized. Call setupTestEnvironment first.');
	}
	return testFramework;
}

/**
 * Clean up the test environment
 */
export async function teardownTestEnvironment(): Promise<void> {
	if (!testFramework) {
		return;
	}

	try {
		// Stop the framework
		await testFramework.stop();

		// Close database connections
		if (DatabaseContext.hasInstance && DatabaseContext.hasInstance()) {
			DatabaseContext.closeDatabase();
		}

		// Clear the reference
		testFramework = null;

		console.info('[INFO] Test environment successfully cleaned up');
	} catch (error) {
		console.error('Error during test environment cleanup:', error);
		throw error;
	}
}

/**
 * Helper function to register a custom test entity if needed
 * This would only be used for specific test cases that need entities
 * not defined in the app.yaml config
 */
export function registerTestEntity(entityConfig: any): boolean {
	try {
		const context = getTestFramework().getContext();
		return context.registerEntity(entityConfig.entity, entityConfig);
	} catch (error) {
		console.error('Failed to register test entity:', error);
		return false;
	}
}

/**
 * Options for generating test data
 */
export interface TestDataOptions {
	/**
	 * Number of records to generate per entity
	 */
	count?: number;

	/**
	 * Whether to handle relationships
	 */
	withRelations?: boolean;

	/**
	 * Custom value generators for specific fields
	 */
	customGenerators?: Record<string, (entity: string) => any>;

	/**
	 * Fixed values to use for specific fields
	 */
	fixedValues?: Record<string, Record<string, any>>;
}

/**
 * Test Data Factory
 * Creates test data for entities
 */
export class TestDataFactory {
	private framework: Framework;
	private generatedIds: Map<string, number[]> = new Map();

	/**
	 * Constructor
	 * @param framework Framework instance
	 */
	constructor(framework: Framework) {
		this.framework = framework;
	}

	/**
	 * Generate test data for all entities
	 * @param options Generation options
	 * @returns Map of entity names to generated data
	 */
	async generateAll(options: TestDataOptions = {}): Promise<Map<string, any[]>> {
		const result = new Map<string, any[]>();
		const context = this.framework.getContext();
		const entityConfigs = context.getAllEntityConfigs();

		// First pass: Generate data without relationships
		for (const [entityName, config] of entityConfigs.entries()) {
			// Skip junction tables if they don't have a primary key
			if (!config.idField) continue;

			const data = await this.generate(entityName, { ...options, withRelations: false });
			result.set(entityName, data);
		}

		// Second pass: Set up relationships if requested
		if (options.withRelations) {
			for (const [entityName, config] of entityConfigs.entries()) {
				if (!config.relations || !config.idField) continue;

				const entityData = result.get(entityName) || [];
				await this.setupRelationships(entityName, entityData, result, options);
				result.set(entityName, entityData);
			}
		}

		return result;
	}

	/**
	 * Generate test data for a specific entity
	 * @param entityName Entity name
	 * @param options Generation options
	 * @returns Array of generated data
	 */
	async generate(entityName: string, options: TestDataOptions = {}): Promise<any[]> {
		const count = options.count || 10;
		const context = this.framework.getContext();
		const entityConfig = context.getEntityConfig(entityName);
		const entityManager = context.getEntityManager(entityName);
		const results: any[] = [];

		// Store the generated entity IDs for relationship handling
		this.generatedIds.set(entityName, []);

		for (let i = 0; i < count; i++) {
			const data = this.generateEntityData(entityConfig, options, i);

			try {
				// Insert the data into the database
				const id = await entityManager.create(data);

				// Store the ID for potential relationships
				this.generatedIds.get(entityName)?.push(Number(id));

				// Add ID to the data and collect
				results.push({ ...data, [entityConfig.idField]: id });
			} catch (error) {
				console.error(`Error creating test data for ${entityName}:`, error);
			}
		}

		return results;
	}

	/**
	 * Generate data for a single entity
	 * @param config Entity configuration
	 * @param options Generation options
	 * @param index Index in the batch (useful for deterministic generation)
	 * @returns Generated entity data
	 */
	private generateEntityData(config: EntityConfig, options: TestDataOptions, index: number): any {
		const data: Record<string, any> = {};

		// Process each column
		for (const column of config.columns) {
			// Skip primary key if auto-increment
			if (column.primaryKey && column.autoIncrement) continue;

			// Use fixed values if provided
			if (options.fixedValues?.[config.entity]?.[column.logical]) {
				data[column.logical] = options.fixedValues[config.entity][column.logical];
				continue;
			}

			// Use custom generator if provided
			if (options.customGenerators?.[column.logical]) {
				data[column.logical] = options.customGenerators[column.logical](config.entity);
				continue;
			}

			// Generate based on column type
			data[column.logical] = this.generateValueForColumn(column, config.entity, index);
		}

		return data;
	}

	/**
	 * Generate a value for a specific column
	 * @param column Column definition
	 * @param entityName Entity name (for context)
	 * @param index Index in the batch
	 * @returns Generated value
	 */
	private generateValueForColumn(column: any, entityName: string, index: number): any {
		const type = column.type?.toLowerCase() || 'string';

		// Handle nullable columns - occasionally return null
		if (column.nullable && Math.random() > 0.8) {
			return null;
		}

		switch (type) {
			case 'string':
			case 'varchar':
			case 'text':
				if (column.logical.includes('name')) {
					return column.logical.includes('first')
						? faker.person.firstName()
						: column.logical.includes('last')
							? faker.person.lastName()
							: faker.commerce.productName();
				}

				if (column.logical.includes('email')) {
					return faker.internet.email();
				}

				if (column.logical.includes('password')) {
					return faker.internet.password();
				}

				if (column.logical.includes('url') || column.logical.includes('image')) {
					return faker.image.url();
				}

				if (column.logical.includes('description')) {
					return faker.lorem.paragraph();
				}

				return faker.lorem.words(3);

			case 'integer':
			case 'int':
			case 'bigint':
			case 'smallint':
				if (column.logical.includes('count')) {
					return faker.number.int({ min: 0, max: 1000 });
				}

				if (column.logical.includes('price') || column.logical.includes('cost')) {
					return faker.number.int({ min: 1, max: 200 });
				}

				return faker.number.int({ min: 1, max: 100 });

			case 'number':
			case 'float':
			case 'decimal':
				return parseFloat(faker.finance.amount(0, 1000, 2));

			case 'boolean':
			case 'bool':
				return faker.datatype.boolean();

			case 'date':
			case 'datetime':
			case 'timestamp':
				return faker.date.past();

			case 'json':
			case 'object':
				return { data: faker.lorem.words(5) };

			default:
				return faker.lorem.word();
		}
	}

	/**
	 * Set up relationships between entities
	 * @param entityName Current entity name
	 * @param entityData Current entity data
	 * @param allData All generated data
	 * @param options Generation options
	 */
	private async setupRelationships(
		entityName: string,
		entityData: any[],
		allData: Map<string, any[]>,
		options: TestDataOptions
	): Promise<void> {
		const context = this.framework.getContext();
		const entityConfig = context.getEntityConfig(entityName);

		if (!entityConfig.relations) return;

		for (const relation of entityConfig.relations) {
			await this.setupRelation(entityName, relation, entityData, allData, options);
		}
	}

	/**
 * Set up a specific relationship
 * @param entityName Source entity name
 * @param relation Relationship definition
 * @param entityData Source entity data
 * @param allData All generated data
 * @param options Generation options
 */
	private async setupRelation(
		entityName: string,
		relation: Relation,
		entityData: any[],
		allData: Map<string, any[]>,
		options: TestDataOptions
	): Promise<void> {
		const context = this.framework.getContext();
		const entityConfig = context.getEntityConfig(entityName);
		const targetConfig = context.getEntityConfig(relation.targetEntity);
		const entityIdField = entityConfig.idField; // Use the actual ID field from entity config
		const targetIdField = targetConfig.idField; // Use the actual ID field from target config
		const targetIds = this.generatedIds.get(relation.targetEntity) || [];

		if (targetIds.length === 0) return;

		switch (relation.type) {
			case 'oneToMany':
				// Nothing to do here, the "many" side will handle this
				break;

			case 'manyToOne':
				// Set foreign key to a random target
				for (const item of entityData) {
					const randomTargetId = targetIds[Math.floor(Math.random() * targetIds.length)];
					item[relation.sourceColumn] = randomTargetId;

					try {
						await context.getEntityManager(entityName).update(
							item[entityIdField], // Use the entity's ID field
							{ [relation.sourceColumn]: randomTargetId }
						);
					} catch (error) {
						console.error(`Error updating ${entityName} relationship:`, error);
					}
				}
				break;

			case 'manyToMany':
				// For many-to-many relationships, check if the junction table is registered as an entity
				const hasJunctionEntity = context.getAllEntityConfigs().has(relation.junctionTable);

				if (hasJunctionEntity) {
					// Junction table exists as an entity, use entity manager
					const junctionTableManager = context.getEntityManager(relation.junctionTable);

					for (const item of entityData) {
						// Link to 1-3 random targets
						const numTargets = Math.floor(Math.random() * 3) + 1;
						const usedTargets = new Set<number>();

						for (let i = 0; i < numTargets; i++) {
							if (usedTargets.size >= targetIds.length) break;

							let randomTargetId;
							do {
								randomTargetId = targetIds[Math.floor(Math.random() * targetIds.length)];
							} while (usedTargets.has(randomTargetId));

							usedTargets.add(randomTargetId);

							try {
								await junctionTableManager.create({
									[relation.junctionSourceColumn]: item[entityIdField], // Use the entity's ID field
									[relation.junctionTargetColumn]: randomTargetId
								});
							} catch (error) {
								console.error(`Error creating junction table entry:`, error);
							}
						}
					}
				} else {
					// Junction table doesn't exist as a full entity - use direct database operations
					console.log(`Skipping many-to-many relationship setup for ${entityName} -> ${relation.targetEntity} (junction: ${relation.junctionTable})`);
					// We're skipping this relationship for now, but could use raw SQL here if needed
				}
				break;

			case 'oneToOne':
				// Similar to manyToOne but ensure one-to-one constraint
				if (relation.isOwner) {
					const usedTargetIds = new Set<number>();

					for (const item of entityData) {
						if (usedTargetIds.size >= targetIds.length) break;

						let randomTargetId;
						do {
							randomTargetId = targetIds[Math.floor(Math.random() * targetIds.length)];
						} while (usedTargetIds.has(randomTargetId));

						usedTargetIds.add(randomTargetId);

						try {
							await context.getEntityManager(entityName).update(
								item[entityIdField], // Use the entity's ID field
								{ [relation.sourceColumn]: randomTargetId }
							);
						} catch (error) {
							console.error(`Error updating one-to-one relationship:`, error);
						}
					}
				}
				break;
		}
	}

	/**
	 * Clear all generated test data
	 * @returns Promise resolving when complete
	 */
	async clear(): Promise<void> {
		const context = this.framework.getContext();
		const entityConfigs = context.getAllEntityConfigs();

		// Delete in reverse order to respect foreign keys
		const entityNames = Array.from(entityConfigs.keys()).reverse();

		for (const entityName of entityNames) {
			const entityManager = context.getEntityManager(entityName);
			const ids = this.generatedIds.get(entityName) || [];

			for (const id of ids) {
				try {
					await entityManager.delete(id);
				} catch (error) {
					console.error(`Error deleting test data for ${entityName}:`, error);
				}
			}
		}

		// Clear generated IDs
		this.generatedIds.clear();
	}
}

/**
 * Create and get the test data factory
 * @returns Test data factory instance
 */
export function getTestDataFactory(): TestDataFactory {
	if (!testDataFactory) {
		const framework = getTestFramework();
		testDataFactory = new TestDataFactory(framework);
	}
	return testDataFactory;
}

/**
 * Generate test data for all entities
 * @param options Generation options
 * @returns Map of entity names to generated data
 */
export async function generateTestData(options: TestDataOptions = {}): Promise<Map<string, any[]>> {
	const factory = getTestDataFactory();
	return factory.generateAll(options);
}

/**
 * Clean up test data between tests
 */
export async function cleanupTestData(): Promise<void> {
	if (testDataFactory) {
		await testDataFactory.clear();
	}
}
