// sqlite-adapter.test.ts
import {
  setupTestDatabase,
  teardownTestDatabase,
  createTestSchema,
  insertTestData,
  cleanupDatabase,
} from "./test-setup";
import { DatabaseAdapter } from "../src/database/core/types";
import { SQLiteAdapter } from "../src/database/adapters/sqlite-adapter";

interface User {
  user_id: number;
  name: string;
  email: string;
  password: string;
  role: string;
  created_at: string;
  last_login: string | null;
}

interface ProductCategory {
  category_id: number;
  category_name: string;
  description: string | null;
  parent_id: number | null;
}

describe("SQLiteAdapter", () => {
  let db: DatabaseAdapter;

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
  });

  test("should connect to database", async () => {
    const adapter = new SQLiteAdapter({
      type: "sqlite",
      connection: { memory: true, filename: ":memory:" },
    });

    const connection = await adapter.connect();
    expect(connection).toBeDefined();

    adapter.close();
  });

  test("should execute a query and return results", async () => {
    const results = await db.query<User>("SELECT * FROM users");

    expect(results).toHaveLength(2);
    expect(results[0].name).toBe("Pet Store Owner");
    expect(results[1].email).toBe("doggy@example.com");
  });

  test("should execute a query with parameters", async () => {
    const results = await db.query<User>(
      "SELECT * FROM users WHERE email = ?",
      "owner@dogfoodstore.com"
    );

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Pet Store Owner");
  });

  test("should get a single result", async () => {
    const result = await db.querySingle<User>(
      "SELECT * FROM users WHERE email = ?",
      "owner@dogfoodstore.com"
    );

    expect(result).toBeDefined();
    if (result) {
      expect(result.name).toBe("Pet Store Owner");
    }
  });

  test("should return undefined for non-existent single result", async () => {
    const result = await db.querySingle<User>(
      "SELECT * FROM users WHERE email = ?",
      "nonexistent@example.com"
    );

    expect(result).toBeUndefined();
  });

  test("should execute non-query statements", async () => {
    const result = await db.execute(
      "INSERT INTO users (name, email, password, role, created_at) VALUES (?, ?, ?, ?, ?)",
      "Test User",
      "test@example.com",
      "hashedpwd789",
      "user",
      "2023-01-03T12:00:00.000Z"
    );

    expect(result.changes).toBe(1);
    expect(result.lastInsertRowid).toBeDefined();

    // Verify insertion
    const inserted = await db.querySingle<User>(
      "SELECT * FROM users WHERE email = ?",
      "test@example.com"
    );
    expect(inserted).toBeDefined();
    if (inserted) {
      expect(inserted.name).toBe("Test User");
    }
  });

  test("should execute a SQL script", async () => {
    await db.executeScript(`
		INSERT INTO users (name, email, password, role, created_at)
		VALUES ('Script User', 'script@example.com', 'hashedpwd000', 'user', '2023-01-03T12:00:00.000Z');
	  `);

    const result = await db.querySingle<User>(
      "SELECT * FROM users WHERE email = ?",
      "script@example.com"
    );
    expect(result).toBeDefined();
    if (result) {
      expect(result.name).toBe("Script User");
    }
  });

  test("should perform a transaction that commits", async () => {
    await db.transaction(async (txDb: DatabaseAdapter) => {
      await txDb.execute(
        "INSERT INTO users (name, email, password, role, created_at) VALUES (?, ?, ?, ?, ?)",
        "Transaction User",
        "tx@example.com",
        "hashedpwd999",
        "user",
        "2023-01-03T12:00:00.000Z"
      );
    });

    const result = await db.querySingle<User>(
      "SELECT * FROM users WHERE email = ?",
      "tx@example.com"
    );
    expect(result).toBeDefined();
    if (result) {
      expect(result.name).toBe("Transaction User");
    }
  });

  test("should rollback a transaction on error", async () => {
    try {
      await db.transaction(async (txDb: DatabaseAdapter) => {
        await txDb.execute(
          "INSERT INTO users (name, email, password, role, created_at) VALUES (?, ?, ?, ?, ?)",
          "Rollback User",
          "rollback@example.com",
          "hashedpwd888",
          "user",
          "2023-01-03T12:00:00.000Z"
        );

        // This should cause an error (duplicate email)
        await txDb.execute(
          "INSERT INTO users (name, email, password, role, created_at) VALUES (?, ?, ?, ?, ?)",
          "Duplicate User",
          "owner@dogfoodstore.com",
          "hashedpwd777",
          "user",
          "2023-01-03T12:00:00.000Z"
        );
      });
    } catch (error) {
      // Expected error
    }

    // Verify the first insertion was rolled back
    const result = await db.querySingle<User>(
      "SELECT * FROM users WHERE email = ?",
      "rollback@example.com"
    );
    expect(result).toBeUndefined();
  });

  test("should find a record by ID", async () => {
    const user = await db.findById<User>("users", "user_id", 1);

    expect(user).toBeDefined();
    if (user) {
      expect(user.name).toBe("Pet Store Owner");
    }
  });

  test("should find all records", async () => {
    const users = await db.findAll<User>("users");

    expect(users).toHaveLength(2);
  });

	test("should find all records with options", async () => {
	const users = await db.findAll<User>("users", {
	  fields: ["name", "email"],
	  orderBy: [{ field: "name", direction: "DESC" }],
	  limit: 1,
	});
  
	expect(users).toHaveLength(1);
	expect(users[0].name).toBe("Pet Store Owner"); 
	expect(users[0].email).toBe("owner@dogfoodstore.com"); 
	expect(users[0].password).toBeUndefined(); 
  });

  test("should find records by conditions", async () => {
    const users = await db.findBy<User>("users", { role: "admin" });

    expect(users).toHaveLength(1);
    expect(users[0].name).toBe("Pet Store Owner");
  });

  test("should find records by multiple conditions", async () => {
    // First add another admin
    await db.execute(
      "INSERT INTO users (name, email, password, role, created_at) VALUES (?, ?, ?, ?, ?)",
      "Another Admin",
      "another@example.com",
      "hashedpwd666",
      "admin",
      "2023-01-03T12:00:00.000Z"
    );

    const users = await db.findBy<User>("users", {
      role: "admin",
      name: "Pet Store Owner",
    });

    expect(users).toHaveLength(1);
    expect(users[0].name).toBe("Pet Store Owner");
  });

  test("should find one record by conditions", async () => {
    const user = await db.findOneBy<User>("users", {
      email: "doggy@example.com",
    });

    expect(user).toBeDefined();
    if (user) {
      expect(user.name).toBe("Dog Lover");
    }
  });

  test("should count records", async () => {
    const count = await db.count("users");

    expect(count).toBe(2);
  });

  test("should count records with conditions", async () => {
    const count = await db.count("users", { role: "admin" });

    expect(count).toBe(1);
  });

  test("should insert a record", async () => {
    const id = await db.insert("users", {
      name: "New User",
      email: "new@example.com",
      password: "hashedpwd555",
      role: "user",
      created_at: "2023-01-03T12:00:00.000Z",
    });

    expect(id).toBeGreaterThan(0);

    // Verify insertion
    const user = await db.findById<User>("users", "user_id", id);
    expect(user).toBeDefined();
    if (user) {
      expect(user.name).toBe("New User");
    }
  });

  test("should update a record", async () => {
    const changes = await db.update("users", "user_id", 1, {
      name: "Updated Admin",
      email: "owner@dogfoodstore.com", // Same email
    });

    expect(changes).toBe(1);

    // Verify update
    const user = await db.findById<User>("users", "user_id", 1);
    expect(user).toBeDefined();
    if (user) {
      expect(user.name).toBe("Updated Admin");
    }
  });

  test("should update records by conditions", async () => {
    const changes = await db.updateBy(
      "users",
      { role: "user" },
      {
        role: "premium_user",
      }
    );

    expect(changes).toBe(1); // One user updated

    // Verify update
    const users = await db.findBy<User>("users", { role: "premium_user" });
    expect(users).toHaveLength(1);
    expect(users[0].name).toBe("Dog Lover");
  });

  test("should delete a record", async () => {
    const changes = await db.delete("users", "user_id", 1);

    expect(changes).toBe(1);

    // Verify deletion
    const user = await db.findById<User>("users", "user_id", 1);
    expect(user).toBeUndefined();
  });

  test("should delete records by conditions", async () => {
    // Temporarily disable foreign keys
    await db.execute("PRAGMA foreign_keys = OFF");

    const changes = await db.deleteBy("users", { role: "user" });

    expect(changes).toBe(1); // One user deleted

    // Re-enable foreign keys
    await db.execute("PRAGMA foreign_keys = ON");

    // Verify deletion
    const users = await db.findAll<User>("users");
    expect(users).toHaveLength(1);
    expect(users[0].role).toBe("admin");
  });

  test("should delete records with limit", async () => {
    // Add two more users
    await db.execute(`
	  INSERT INTO users (name, email, password, role, created_at)
	  VALUES 
		('User 1', 'user1@example.com', 'hashedpwd111', 'user', '2023-01-03T12:00:00.000Z'),
		('User 2', 'user2@example.com', 'hashedpwd222', 'user', '2023-01-03T12:00:00.000Z');
	`);

    // Temporarily disable foreign keys
    await db.execute("PRAGMA foreign_keys = OFF");

    const changes = await db.deleteBy("users", { role: "user" }, { limit: 2 });

    // Re-enable foreign keys
    await db.execute("PRAGMA foreign_keys = ON");

    expect(changes).toBe(2); // Two users deleted

    // Verify one user with role 'user' remains
    const users = await db.findBy<User>("users", { role: "user" });
    expect(users).toHaveLength(1);
  });

  test("should find records with joins", async () => {
    // First, create a more explicit query that selects the specific fields we want to check
    const results = await db.query<{
      category_name: string;
      product_id: number;
    }>(
      `SELECT c.category_name, cf.product_id 
	   FROM categories c
	   INNER JOIN category_product cf ON c.category_id = cf.category_id
	   INNER JOIN products f ON cf.product_id = f.product_id`
    );

    // The results should have one or more records
    expect(results.length).toBeGreaterThan(0);

    // Check that the first result has the expected properties
    if (results.length > 0) {
      expect(results[0]).toHaveProperty("category_name");
      expect(results[0]).toHaveProperty("product_id");
    }
  });

  test("should find records with joins and conditions", async () => {
    const results = await db.findWithJoin<ProductCategory>(
      "categories",
      [
        {
          type: "INNER",
          table: "category_product",
          alias: "cf",
          on: "categories.category_id = cf.category_id",
        },
        {
          type: "INNER",
          table: "products",
          alias: "f",
          on: "cf.product_id = f.product_id",
        },
      ],
      {
        "categories.category_name": "Dry Food",
      }
    );

    expect(results).toHaveLength(1);
    expect(results[0].category_name).toBe("Dry Food");
  });

  test("should find one record with joins", async () => {
    const result = await db.findOneWithJoin<ProductCategory>(
      "categories",
      [
        {
          type: "INNER",
          table: "category_product",
          alias: "cf",
          on: "categories.category_id = cf.category_id",
        },
        {
          type: "INNER",
          table: "products",
          alias: "f",
          on: "cf.product_id = f.product_id",
        },
      ],
      {
        "categories.category_id": 2,
      }
    );

    expect(result).toBeDefined();
    if (result) {
      expect(result.category_name).toBe("Dry Food");
    }
  });

  test("should get database info", async () => {
    const info = await db.getDatabaseInfo();

    expect(info).toBeDefined();
    expect(info.engine).toBe("SQLite");
    expect(info.tables).toBeDefined();
    expect(Array.isArray(info.tables)).toBe(true);
  });

  test("should create a query builder", () => {
    const qb = db.createQueryBuilder();

    expect(qb).toBeDefined();
    expect(typeof qb.select).toBe("function");
    expect(typeof qb.from).toBe("function");
    expect(typeof qb.where).toBe("function");
    expect(typeof qb.execute).toBe("function");
  });

  test("should get date functions", () => {
    const dateFunctions = db.getDateFunctions();

    expect(dateFunctions).toBeDefined();
    expect(typeof dateFunctions.currentDate).toBe("function");
    expect(typeof dateFunctions.currentDateTime).toBe("function");
    expect(typeof dateFunctions.dateDiff).toBe("function");
  });
});
