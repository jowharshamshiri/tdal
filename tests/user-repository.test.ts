// user-repository.test.ts
import {
  setupTestDatabase,
  teardownTestDatabase,
  createTestSchema,
  insertTestData,
  cleanupDatabase,
} from "./test-setup";
import { DatabaseAdapter } from "../src/database/core/types";
import { UserRepository } from "../src/repositories/user-repository";
import { UserResourceAccess } from "../src/models";

describe("UserRepository", () => {
  let db: DatabaseAdapter;
  let userRepo: UserRepository;

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

    // Create repository instance
    userRepo = new UserRepository(db);
  });

  test("should find user by email", async () => {
    const user = await userRepo.findByEmail("owner@dogfoodstore.com");

    expect(user).toBeDefined();
    if (user) {
      expect(user.name).toBe("Pet Store Owner");
      expect(user.role).toBe("admin");
    }
  });

  test("should return undefined for non-existent email", async () => {
    const user = await userRepo.findByEmail("nonexistent@example.com");

    expect(user).toBeUndefined();
  });

  test("should update last login timestamp", async () => {
    const before = new Date();

    const changes = await userRepo.updateLastLogin(1);

    expect(changes).toBe(1);

    // Verify the last_login field was updated
    const user = await userRepo.findById(1);
    expect(user).toBeDefined();
    if (user) {
      expect(user.last_login).toBeDefined();

      // Verify the timestamp is recent
      if (user.last_login) {
        const lastLogin = new Date(user.last_login);
        expect(lastLogin.getTime()).toBeGreaterThanOrEqual(before.getTime());
      }
    }
  });

  test("should find all users with credit balance", async () => {
	const users = await userRepo.findAllWithCreditBalance();
  
	expect(users).toHaveLength(2);
  
	// Users are sorted by name, so "Dog Lover" (regular user) comes first
	expect(users[0].name).toBe("Dog Lover");
	expect(users[1].name).toBe("Pet Store Owner");
  
	// Regular user has 60 (10 + 50) balance
	expect(users[0].credit_balance).toBe(60);
	
	// Admin should have 0 balance
	expect(users[1].credit_balance).toBe(0);
  });

  test("should get user credit balance", async () => {
    const balance = await userRepo.getCreditBalance(2);

    expect(balance).toBeDefined();
    expect(balance.total).toBe(60);
    expect(balance.details).toHaveLength(2);
    expect(balance.details[0].amount).toBe(10);
    expect(balance.details[1].amount).toBe(50);
  });

  test("should change user password", async () => {
    const changes = await userRepo.changePassword(1, "newhashpassword");

    expect(changes).toBe(1);

    // Verify password change
    const user = await userRepo.findById(1);
    expect(user).toBeDefined();
    if (user) {
      expect(user.password).toBe("newhashpassword");
    }
  });

  test("should update user profile", async () => {
    const changes = await userRepo.updateProfile(
      1,
      "New Admin Name",
      "newowner@dogfoodstore.com"
    );

    expect(changes).toBe(1);

    // Verify profile update
    const user = await userRepo.findById(1);
    expect(user).toBeDefined();
    if (user) {
      expect(user.name).toBe("New Admin Name");
      expect(user.email).toBe("newowner@dogfoodstore.com");
    }
  });

  test("should get user profile", async () => {
    const profile = await userRepo.getUserProfile(1);

    expect(profile).toBeDefined();
    if (profile) {
      expect(profile.name).toBe("Pet Store Owner");
      expect(profile.email).toBe("owner@dogfoodstore.com");
      expect(profile.role).toBe("admin");

      // Password should not be included in profile
      // Fix: Use Object.hasOwnProperty instead of trying to access the property directly
      expect(Object.prototype.hasOwnProperty.call(profile, "password")).toBe(
        false
      );
    }
  });

  test("should get user with access history", async () => {
    const userWithHistory = await userRepo.getUserWithAccessHistory(2);

    expect(userWithHistory).toBeDefined();
    expect(userWithHistory.name).toBe("Dog Lover");
    expect(userWithHistory.credit_balance).toBe(60);

    // Regular user has one resource access
    expect(Array.isArray(userWithHistory.recent_access)).toBe(true);
    if (userWithHistory.recent_access) {
      const recentAccess =
        userWithHistory.recent_access as UserResourceAccess[];
      expect(recentAccess.length).toBe(1);
      expect(recentAccess[0].resource_type).toBe("product");
    }
  });
});
