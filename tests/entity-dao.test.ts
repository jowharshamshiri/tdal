// entity-dao.test.ts
import {
	setupTestDatabase,
	teardownTestDatabase,
	createTestSchema,
	insertTestData,
	cleanupDatabase,
} from "./test-setup";
import { DatabaseAdapter } from "../src/database/core/types";
import { EntityDao } from "../src/entity/entity-manager";
import { EntityConfig } from "../src/database/orm/entity-mapping";
import { User, UserMapping } from "./models/user";
import { Relation } from "../src/database/orm/relation-types";

// Create a concrete implementation of EntityDao for testing
class TestUserDao extends EntityDao<User> {
	protected readonly entityConfig: EntityConfig = {
		...UserMapping,
		// Fix the relations type by properly casting each relation
		relations: UserMapping.relations
			? (UserMapping.relations.map((rel) => ({
				...rel,
				// The type assertion here ensures compatibility with the Relation type
			})) as Relation[])
			: [],
	};
}

describe("EntityDao", () => {
	let db: DatabaseAdapter;
	let userDao: TestUserDao;

	beforeAll(async () => {
		db = await setupTestDatabase();
		await createTestSchema(db);
	});

	afterAll(() => {
		teardownTestDatabase();
	});

	beforeEach(async () => {
		// Use the new cleanupDatabase function
		await cleanupDatabase(db);
		await insertTestData(db);

		// Create DAO instance
		userDao = new TestUserDao(db);
	});

	test("should find entity by ID", async () => {
		const user = await userDao.findById(1);

		expect(user).toBeDefined();
		if (user) {
			expect(user.name).toBe("Pet Store Owner");
			expect(user.email).toBe("owner@dogfoodstore.com");
		}
	});

	test("should return undefined when entity not found by ID", async () => {
		const user = await userDao.findById(999);

		expect(user).toBeUndefined();
	});

	test("should find all entities", async () => {
		const users = await userDao.findAll();

		expect(users).toHaveLength(2);
		expect(users[0].name).toBe("Pet Store Owner");
		expect(users[1].name).toBe("Dog Lover");
	});

	// Update the test to match the correct ordering or update the order direction
	test("should find all entities with options", async () => {
		const users = await userDao.findAll({
			fields: ["name", "email"],
			orderBy: [{ field: "name", direction: "DESC" }],
			limit: 1,
		});

		expect(users).toHaveLength(1);
		expect(users[0].name).toBe("Pet Store Owner");
		expect(users[0].email).toBe("owner@dogfoodstore.com");
		expect(users[0].password).toBeUndefined();
	});

	test("should find entities by conditions", async () => {
		const users = await userDao.findBy({ role: "admin" } as Partial<User>);

		expect(users).toHaveLength(1);
		expect(users[0].name).toBe("Pet Store Owner");
	});

	test("should find one entity by conditions", async () => {
		const user = await userDao.findOneBy({
			email: "doggy@example.com",
		} as Partial<User>);

		expect(user).toBeDefined();
		if (user) {
			expect(user.name).toBe("Dog Lover");
		}
	});

	test("should count entities", async () => {
		const count = await userDao.count();

		expect(count).toBe(2);
	});

	test("should count entities with conditions", async () => {
		const count = await userDao.count({ role: "admin" } as Partial<User>);

		expect(count).toBe(1);
	});

	test("should create an entity", async () => {
		const newUser: Partial<User> = {
			name: "New User",
			email: "new@example.com",
			password: "hashedpwd555",
			role: "user",
		};

		const id = await userDao.create(newUser);

		expect(id).toBeGreaterThan(0);

		// Verify creation with added timestamps
		const user = await userDao.findById(id);
		expect(user).toBeDefined();
		if (user) {
			expect(user.name).toBe("New User");
			expect(user.created_at).toBeDefined();
		}
	});

	test("should update an entity", async () => {
		const changes = await userDao.update(1, {
			name: "Updated Admin",
		} as Partial<User>);

		expect(changes).toBe(1);

		// Verify update with updated timestamp
		const user = await userDao.findById(1);
		expect(user).toBeDefined();
		if (user) {
			expect(user.name).toBe("Updated Admin");
			expect(user.updated_at).toBeDefined();
		}
	});

	test("should delete an entity", async () => {
		const changes = await userDao.delete(1);

		expect(changes).toBe(1);

		// Verify deletion
		const user = await userDao.findById(1);
		expect(user).toBeUndefined();
	});

	test("should check if entity exists", async () => {
		const exists = await userDao.exists(1);

		expect(exists).toBe(true);

		const notExists = await userDao.exists(999);

		expect(notExists).toBe(false);
	});

	test("should perform a transaction", async () => {
		await userDao.transaction(async (txDao) => {
			await txDao.create({
				name: "Transaction User",
				email: "tx@example.com",
				password: "hashedpwd999",
				role: "user",
			} as Partial<User>);
		});

		// Verify transaction was committed
		const user = await userDao.findOneBy({
			email: "tx@example.com",
		} as Partial<User>);
		expect(user).toBeDefined();
		if (user) {
			expect(user.name).toBe("Transaction User");
		}
	});

	test("should rollback a transaction on error", async () => {
		try {
			await userDao.transaction(async (txDao) => {
				await txDao.create({
					name: "Transaction User",
					email: "tx@example.com",
					password: "hashedpwd999",
					role: "user",
				} as Partial<User>);

				// This will cause an error due to duplicate email
				await txDao.create({
					name: "Duplicate User",
					email: "tx@example.com",
					password: "hashedpwd888",
					role: "user",
				} as Partial<User>);
			});
		} catch (error) {
			// Expected error
		}

		// Verify transaction was rolled back
		const user = await userDao.findOneBy({
			email: "tx@example.com",
		} as Partial<User>);
		expect(user).toBeUndefined();
	});
});
