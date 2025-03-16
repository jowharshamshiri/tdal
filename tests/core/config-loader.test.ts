// config-loader.test.ts
import { ConfigLoader } from "../../src/core/config-loader";
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { EntityConfig } from "../../src/entity/entity-config";

describe("ConfigLoader", () => {
	let configLoader: ConfigLoader;
	let tempDir: string;
	let mockLogger: any;

	beforeAll(() => {
		// Create a temporary directory for test configs
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdal-config-test-'));

		// Create necessary directories
		fs.mkdirSync(path.join(tempDir, 'entities'), { recursive: true });
		fs.mkdirSync(path.join(tempDir, 'config'), { recursive: true });
	});

	afterAll(() => {
		// Clean up temporary directory
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	beforeEach(() => {
		// Create a mock logger for each test
		mockLogger = {
			debug: jest.fn(),
			info: jest.fn(),
			warn: jest.fn(),
			error: jest.fn()
		};

		// Create a new ConfigLoader for each test
		configLoader = new ConfigLoader({
			configDir: path.join(tempDir, 'config'),
			entitiesDir: path.join(tempDir, 'entities'),
			logger: mockLogger
		});
	});

	test("should load application configuration", async () => {
		// Create a test app.yaml
		const appConfig = {
			name: "Test App",
			version: "1.0.0",
			port: 3000,
			host: "localhost"
		};

		fs.writeFileSync(
			path.join(tempDir, 'config', 'app.yaml'),
			`name: ${appConfig.name}
version: ${appConfig.version}
port: ${appConfig.port}
host: ${appConfig.host}`
		);

		const loadedConfig = await configLoader.loadAppConfig();

		expect(loadedConfig).toBeDefined();
		expect(loadedConfig.name).toBe(appConfig.name);
		expect(loadedConfig.version).toBe(appConfig.version);
		expect(loadedConfig.port).toBe(appConfig.port);
		expect(loadedConfig.host).toBe(appConfig.host);
		expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("Loading application configuration"));
	});

	test("should throw error if app config file not found", async () => {
		// Create a non-existent file path
		const nonExistentPath = path.join(tempDir, 'config', 'non-existent.yaml');

		await expect(configLoader.loadAppConfig(nonExistentPath)).rejects.toThrow();
		expect(mockLogger.error).toHaveBeenCalled();
	});

	test("should load entity configuration", async () => {
		// Create a test entity.yaml
		const entityConfig = `
entity: User
table: users
idField: user_id
columns:
  - logical: user_id
    physical: user_id
    primaryKey: true
  - logical: name
    physical: name
  - logical: email
    physical: email
`;

		fs.writeFileSync(
			path.join(tempDir, 'entities', 'user.yaml'),
			entityConfig
		);

		const entities = await configLoader.loadEntities();

		expect(entities.size).toBe(1);
		expect(entities.has('User')).toBe(true);

		const userEntity = entities.get('User');
		expect(userEntity).toBeDefined();
		if (userEntity) {
			expect(userEntity.entity).toBe('User');
			expect(userEntity.table).toBe('users');
			expect(userEntity.columns.length).toBe(3);
		}
	});

	test("should handle entity relations", async () => {
		// Create entities with relations
		const userConfig = `
entity: User
table: users
idField: user_id
columns:
  - logical: user_id
    physical: user_id
    primaryKey: true
  - logical: name
    physical: name
`;

		const postConfig = `
entity: Post
table: posts
idField: post_id
columns:
  - logical: post_id
    physical: post_id
    primaryKey: true
  - logical: user_id
    physical: user_id
  - logical: title
    physical: title
relations:
  - name: author
    type: manyToOne
    sourceEntity: Post
    targetEntity: User
    sourceColumn: user_id
    targetColumn: user_id
`;

		fs.writeFileSync(
			path.join(tempDir, 'entities', 'user.yaml'),
			userConfig
		);

		fs.writeFileSync(
			path.join(tempDir, 'entities', 'post.yaml'),
			postConfig
		);

		const entities = await configLoader.loadEntities();

		expect(entities.size).toBe(2);
		expect(entities.has('User')).toBe(true);
		expect(entities.has('Post')).toBe(true);

		const post = entities.get('Post');
		expect(post?.relations?.length).toBe(1);
		if (post?.relations) {
			expect(post.relations[0].name).toBe('author');
			expect(post.relations[0].targetEntity).toBe('User');
		}
	});

	test("should validate entity configurations", async () => {
		// Create an invalid entity (missing required fields)
		const invalidConfig = `
entity: Invalid
table: invalids
# Missing idField
columns: []
`;

		fs.writeFileSync(
			path.join(tempDir, 'entities', 'invalid.yaml'),
			invalidConfig
		);

		await expect(configLoader.loadEntities()).rejects.toThrow();
		expect(mockLogger.error).toHaveBeenCalled();
	});

	test("should resolve entity relationships", async () => {
		// Create entities with bidirectional relations
		const userConfig = `
entity: User
table: users
idField: user_id
columns:
  - logical: user_id
    physical: user_id
    primaryKey: true
  - logical: name
    physical: name
relations:
  - name: posts
    type: oneToMany
    sourceEntity: User
    targetEntity: Post
    sourceColumn: user_id
    targetColumn: user_id
    inverseName: author
`;

		const postConfig = `
entity: Post
table: posts
idField: post_id
columns:
  - logical: post_id
    physical: post_id
    primaryKey: true
  - logical: user_id
    physical: user_id
  - logical: title
    physical: title
relations:
  - name: author
    type: manyToOne
    sourceEntity: Post
    targetEntity: User
    sourceColumn: user_id
    targetColumn: user_id
    inverseName: posts
`;

		fs.writeFileSync(
			path.join(tempDir, 'entities', 'user.yaml'),
			userConfig
		);

		fs.writeFileSync(
			path.join(tempDir, 'entities', 'post.yaml'),
			postConfig
		);

		const entities = await configLoader.loadEntities();

		// No validation errors should be thrown
		expect(entities.size).toBe(2);
		expect(mockLogger.warn).not.toHaveBeenCalledWith(
			expect.stringContaining("Inverse relation")
		);
	});

	test("should warn about invalid inverse relations", async () => {
		// Create entities with invalid inverse relations
		const userConfig = `
entity: User
table: users
idField: user_id
columns:
  - logical: user_id
    physical: user_id
    primaryKey: true
  - logical: name
    physical: name
relations:
  - name: posts
    type: oneToMany
    sourceEntity: User
    targetEntity: Post
    sourceColumn: user_id
    targetColumn: user_id
    inverseName: nonExistentRelation
`;

		const postConfig = `
entity: Post
table: posts
idField: post_id
columns:
  - logical: post_id
    physical: post_id
    primaryKey: true
  - logical: user_id
    physical: user_id
  - logical: title
    physical: title
relations:
  - name: author
    type: manyToOne
    sourceEntity: Post
    targetEntity: User
    sourceColumn: user_id
    targetColumn: user_id
`;

		fs.writeFileSync(
			path.join(tempDir, 'entities', 'user.yaml'),
			userConfig
		);

		fs.writeFileSync(
			path.join(tempDir, 'entities', 'post.yaml'),
			postConfig
		);

		await configLoader.loadEntities();

		// Should warn about inverse relation issues
		expect(mockLogger.warn).toHaveBeenCalledWith(
			expect.stringContaining("Inverse relation nonExistentRelation not found")
		);
	});

	test("should handle external code loading", async () => {
		// Create a simple JS module
		const jsModule = `
module.exports = function(entity) {
  return entity.name.toUpperCase();
};
`;

		const modulePath = path.join(tempDir, 'test-module.js');
		fs.writeFileSync(modulePath, jsModule);

		const loadedModule = await configLoader.loadExternalCode(modulePath);

		expect(typeof loadedModule).toBe('function');
		expect(loadedModule({ name: 'test' })).toBe('TEST');
	});

	test("should get entity by name", async () => {
		// Set up a test entity
		const userEntity: EntityConfig = {
			entity: 'User',
			table: 'users',
			idField: 'user_id',
			columns: [
				{ logical: 'user_id', physical: 'user_id', primaryKey: true }
			]
		};

		// @ts-ignore - add entity directly to private map
		configLoader.entities.set('User', userEntity);

		const entity = configLoader.getEntity('User');

		expect(entity).toBeDefined();
		expect(entity).toBe(userEntity);
	});

	test("should handle non-existent entities", () => {
		const entity = configLoader.getEntity('NonExistent');

		expect(entity).toBeUndefined();
	});
});