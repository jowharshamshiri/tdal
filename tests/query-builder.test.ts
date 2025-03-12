// query-builder.test.ts
import {
  setupTestDatabase,
  teardownTestDatabase,
  createTestSchema,
  insertTestData,
  cleanupDatabase,
} from "./test-setup";
import { DatabaseAdapter } from "../src/database/core/types";
import { SQLiteQueryBuilder } from "../src/database/query/sqlite-query-builder";
import { QueryBuilder } from "../src/database/query/query-builder";

interface UserRecord {
  name: string;
  email: string;
  role: string;
  password?: string;
  uppercase_name?: string;
}

describe("SQLiteQueryBuilder", () => {
  let db: DatabaseAdapter;
  let qb: QueryBuilder;

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

    // Create a new query builder for each test
    qb = new SQLiteQueryBuilder(db);
  });

  test("should build a simple SELECT query", () => {
    qb.select(["*"]).from("users");

    expect(qb.getQuery()).toBe("SELECT * FROM users");
    expect(qb.getParameters()).toEqual([]);
  });

  test("should build a SELECT query with specific fields", () => {
    qb.select(["name", "email"]).from("users");

    expect(qb.getQuery()).toBe("SELECT name, email FROM users");
    expect(qb.getParameters()).toEqual([]);
  });

  test("should build a SELECT query with table alias", () => {
    qb.select(["u.name", "u.email"]).from("users", "u");

    expect(qb.getQuery()).toBe("SELECT u.name, u.email FROM users u");
    expect(qb.getParameters()).toEqual([]);
  });

  test("should build a SELECT query with WHERE clause", () => {
    qb.select(["*"]).from("users").where("role = ?", "admin");

    expect(qb.getQuery()).toBe("SELECT * FROM users WHERE (role = ?)");
    expect(qb.getParameters()).toEqual(["admin"]);
  });

  test("should build a SELECT query with multiple WHERE conditions", () => {
    qb.select(["*"])
      .from("users")
      .where("role = ?", "admin")
      .andWhere("name LIKE ?", "%Admin%");

    expect(qb.getQuery()).toBe(
      "SELECT * FROM users WHERE (role = ?) AND (name LIKE ?)"
    );
    expect(qb.getParameters()).toEqual(["admin", "%Admin%"]);
  });

  test("should build a SELECT query with OR WHERE conditions", () => {
    qb.select(["*"])
      .from("users")
      .where("role = ?", "admin")
      .orWhere("role = ?", "premium_user");

    expect(qb.getQuery()).toBe(
      "SELECT * FROM users WHERE (role = ?) OR (role = ?)"
    );
    expect(qb.getParameters()).toEqual(["admin", "premium_user"]);
  });

  test("should build a SELECT query with condition object", () => {
    qb.select(["*"])
      .from("users")
      .where({ field: "role", operator: "=", value: "admin" });

    expect(qb.getQuery()).toBe("SELECT * FROM users WHERE (role = ?)");
    expect(qb.getParameters()).toEqual(["admin"]);
  });

  test("should build a SELECT query with IN operator", () => {
    qb.select(["*"])
      .from("users")
      .where({
        field: "role",
        operator: "IN",
        value: ["admin", "premium_user"],
      });

    expect(qb.getQuery()).toBe("SELECT * FROM users WHERE (role IN (?, ?))");
    expect(qb.getParameters()).toEqual(["admin", "premium_user"]);
  });

  test("should build a SELECT query with IS NULL operator", () => {
    qb.select(["*"])
      .from("users")
      .where({ field: "last_login", operator: "IS NULL", value: null });

    expect(qb.getQuery()).toBe(
      "SELECT * FROM users WHERE (last_login IS NULL)"
    );
    expect(qb.getParameters()).toEqual([]);
  });

  test("should build a SELECT query with BETWEEN operator", () => {
    qb.select(["*"])
      .from("users")
      .where({
        field: "created_at",
        operator: "BETWEEN",
        value: ["2023-01-01", "2023-01-31"],
      });

    expect(qb.getQuery()).toBe(
      "SELECT * FROM users WHERE (created_at BETWEEN ? AND ?)"
    );
    expect(qb.getParameters()).toEqual(["2023-01-01", "2023-01-31"]);
  });

  test("should build a SELECT query with INNER JOIN", () => {
    qb.select(["u.*", "c.amount"])
      .from("users", "u")
      .innerJoin("user_credits", "c", "u.user_id = c.user_id");

    expect(qb.getQuery()).toBe(
      "SELECT u.*, c.amount FROM users u INNER JOIN user_credits c ON u.user_id = c.user_id"
    );
    expect(qb.getParameters()).toEqual([]);
  });

  test("should build a SELECT query with LEFT JOIN", () => {
    qb.select(["u.*", "c.amount"])
      .from("users", "u")
      .leftJoin("user_credits", "c", "u.user_id = c.user_id");

    expect(qb.getQuery()).toBe(
      "SELECT u.*, c.amount FROM users u LEFT JOIN user_credits c ON u.user_id = c.user_id"
    );
    expect(qb.getParameters()).toEqual([]);
  });

  test("should build a SELECT query with multiple JOINs", () => {
    qb.select(["u.*", "c.amount", "a.resource_type"])
      .from("users", "u")
      .leftJoin("user_credits", "c", "u.user_id = c.user_id")
      .leftJoin("user_resource_access", "a", "u.user_id = a.user_id");

    expect(qb.getQuery()).toBe(
      "SELECT u.*, c.amount, a.resource_type FROM users u " +
        "LEFT JOIN user_credits c ON u.user_id = c.user_id " +
        "LEFT JOIN user_resource_access a ON u.user_id = a.user_id"
    );
    expect(qb.getParameters()).toEqual([]);
  });

  test("should build a SELECT query with ORDER BY", () => {
    qb.select(["*"]).from("users").orderBy("name");

    expect(qb.getQuery()).toBe("SELECT * FROM users ORDER BY name ASC");
    expect(qb.getParameters()).toEqual([]);
  });

  test("should build a SELECT query with ORDER BY DESC", () => {
    qb.select(["*"]).from("users").orderBy("name", "DESC");

    expect(qb.getQuery()).toBe("SELECT * FROM users ORDER BY name DESC");
    expect(qb.getParameters()).toEqual([]);
  });

  test("should build a SELECT query with multiple ORDER BY clauses", () => {
    qb.select(["*"]).from("users").orderBy("role").orderBy("name", "DESC");

    expect(qb.getQuery()).toBe(
      "SELECT * FROM users ORDER BY role ASC, name DESC"
    );
    expect(qb.getParameters()).toEqual([]);
  });

  test("should build a SELECT query with GROUP BY", () => {
    qb.select(["role", "COUNT(*) as count"]).from("users").groupBy("role");

    expect(qb.getQuery()).toBe(
      "SELECT role, COUNT(*) as count FROM users GROUP BY role"
    );
    expect(qb.getParameters()).toEqual([]);
  });

  test("should build a SELECT query with multiple GROUP BY fields", () => {
    qb.select(["role", "created_at", "COUNT(*) as count"])
      .from("users")
      .groupBy(["role", "created_at"]);

    expect(qb.getQuery()).toBe(
      "SELECT role, created_at, COUNT(*) as count FROM users GROUP BY role, created_at"
    );
    expect(qb.getParameters()).toEqual([]);
  });

  test("should build a SELECT query with HAVING", () => {
    qb.select(["role", "COUNT(*) as count"])
      .from("users")
      .groupBy("role")
      .having("COUNT(*) > ?", 1);

    expect(qb.getQuery()).toBe(
      "SELECT role, COUNT(*) as count FROM users GROUP BY role HAVING COUNT(*) > ?"
    );
    expect(qb.getParameters()).toEqual([1]);
  });

  test("should build a SELECT query with LIMIT", () => {
    qb.select(["*"]).from("users").limit(10);

    expect(qb.getQuery()).toBe("SELECT * FROM users LIMIT 10");
    expect(qb.getParameters()).toEqual([]);
  });

  test("should build a SELECT query with LIMIT and OFFSET", () => {
    qb.select(["*"]).from("users").limit(10).offset(20);

    expect(qb.getQuery()).toBe("SELECT * FROM users LIMIT 10 OFFSET 20");
    expect(qb.getParameters()).toEqual([]);
  });

  test("should build a complex SELECT query", () => {
    qb.select([
      "u.name",
      "COUNT(c.credit_id) as credit_count",
      "SUM(c.amount) as total_credits",
    ])
      .from("users", "u")
      .leftJoin("user_credits", "c", "u.user_id = c.user_id")
      .where("u.role = ?", "user")
      .groupBy("u.user_id")
      .having("COUNT(c.credit_id) > ?", 0)
      .orderBy("total_credits", "DESC")
      .limit(5);

    expect(qb.getQuery()).toBe(
      "SELECT u.name, COUNT(c.credit_id) as credit_count, SUM(c.amount) as total_credits " +
        "FROM users u LEFT JOIN user_credits c ON u.user_id = c.user_id " +
        "WHERE (u.role = ?) GROUP BY u.user_id " +
        "HAVING COUNT(c.credit_id) > ? ORDER BY total_credits DESC LIMIT 5"
    );
    expect(qb.getParameters()).toEqual(["user", 0]);
  });

  test("should execute a query and return results", async () => {
    const results = await qb.select(["*"]).from("users").execute<UserRecord>();

    expect(results).toHaveLength(2);
    expect(results[0].name).toBe("Pet Store Owner");
    expect(results[1].name).toBe("Dog Lover");
  });

  test("should execute a query with parameters", async () => {
    const results = await qb
      .select(["*"])
      .from("users")
      .where("role = ?", "admin")
      .execute<UserRecord>();

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Pet Store Owner");
  });

  test("should get a single result", async () => {
    const result = await qb
      .select(["*"])
      .from("users")
      .where("email = ?", "owner@dogfoodstore.com")
      .getOne<UserRecord>();

    expect(result).toBeDefined();
    expect(result?.name).toBe("Pet Store Owner");
  });

  test("should return undefined for non-existent single result", async () => {
    const result = await qb
      .select(["*"])
      .from("users")
      .where("email = ?", "nonexistent@example.com")
      .getOne<UserRecord>();

    expect(result).toBeUndefined();
  });

  test("should get count", async () => {
    const count = await qb.select(["*"]).from("users").getCount();

    expect(count).toBe(2);
  });

  test("should get count with conditions", async () => {
    const count = await qb
      .select(["*"])
      .from("users")
      .where("role = ?", "admin")
      .getCount();

    expect(count).toBe(1);
  });

  test("should handle edge cases with empty IN condition", async () => {
    const results = await qb
      .select(["*"])
      .from("users")
      .where({ field: "user_id", operator: "IN", value: [] })
      .execute<UserRecord>();

    expect(results).toHaveLength(0); // Should return no results for empty IN condition
  });

  test("should handle complex joins with multiple conditions", async () => {
    const results = await qb
      .select(["u.name", "f.title"])
      .from("users", "u")
      .innerJoin("user_resource_access", "a", "u.user_id = a.user_id")
      .innerJoin(
        "products",
        "f",
        "a.resource_id = f.product_id AND a.resource_type = ?",
        "product"
      )
      .where("u.role = ?", "user")
      .execute<{ name: string; title: string }>();

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Dog Lover");
    expect(results[0].title).toBe("Gourmet Paws");
  });

  test("should handle raw SQL expressions", async () => {
    qb.select(["*"]).from("users").selectRaw("UPPER(name) as uppercase_name");

    const results = await qb.execute<UserRecord>();

    expect(results).toHaveLength(2);
    expect(results[0].uppercase_name).toBe("PET STORE OWNER");
    expect(results[1].uppercase_name).toBe("DOG LOVER");
  });
});
