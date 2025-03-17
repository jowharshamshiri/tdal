// user-repository.test.ts
import { 
  setupTestEnvironment, 
  teardownTestEnvironment, 
  getTestFramework, 
  generateTestData,
  cleanupTestData
} from '../../test-setup';
import { EntityManager } from "../../../src/entity/entity-manager";
import { QueryBuilder } from "../../../src/database/query/query-builder";

// Define interface for User entity based on test-app.yaml
interface User {
  user_id?: number;
  name: string;
  email: string;
  password?: string;
  role: string;
  created_at?: string;
  last_login?: string;
}

// Interface for user resource access
interface UserResourceAccess {
  access_id?: number;
  user_id: number;
  resource_type: string;
  resource_id: number;
  credit_cost: number;
  access_date: string;
  created_at?: string;
}

describe("User Entity Operations", () => {
	let userManager: EntityManager<User>;
	let resourceAccessManager: EntityManager<UserResourceAccess>;
	let framework: any;
	let queryBuilder: QueryBuilder;

	beforeAll(async () => {
		// Initialize test framework with test-app.yaml configuration
		await setupTestEnvironment('./tests/test-app.yaml');
		framework = getTestFramework();
		
		// Get entity managers from the framework context
		const context = framework.getContext();
		userManager = context.getEntityManager<User>('User');
		resourceAccessManager = context.getEntityManager<UserResourceAccess>('UserResourceAccess');
		
		// Get query builder for advanced queries
		queryBuilder = context.getDatabase().createQueryBuilder();
	});

	afterAll(async () => {
		await teardownTestEnvironment();
	});

	beforeEach(async () => {
		// Clean up any previous test data
		await cleanupTestData();
		
		// Generate test data with fixed values for predictable test results
		await generateTestData({
			count: 3,  // Generate a reasonable number of records
			withRelations: true,
			fixedValues: {
				User: {
					name: 'Pet Store Owner',
					email: 'owner@dogfoodstore.com',
					role: 'admin'
				}
			}
		});
	});

	test("should find user by email", async () => {
		// Use the entity manager to find by condition
		const users = await userManager.find({ email: "owner@dogfoodstore.com" });
		const user = users[0];

		expect(user).toBeDefined();
		expect(user.name).toBe("Pet Store Owner");
		expect(user.role).toBe("admin");
	});

	test("should return undefined for non-existent email", async () => {
		// Use the entity manager to find by condition
		const users = await userManager.find({ email: "nonexistent@example.com" });
		
		expect(users).toHaveLength(0);
	});

	test("should update last login timestamp", async () => {
		const before = new Date();
		
		// Find the test user first
		const users = await userManager.find({ email: "owner@dogfoodstore.com" });
		const user = users[0];
		
		// Update the last_login field
		await userManager.update(user.user_id!, {
			last_login: new Date().toISOString()
		});

		// Verify the last_login field was updated
		const updatedUser = await userManager.findById(user.user_id!);
		expect(updatedUser).toBeDefined();
		expect(updatedUser?.last_login).toBeDefined();

		// Verify the timestamp is recent
		if (updatedUser?.last_login) {
			const lastLogin = new Date(updatedUser.last_login);
			expect(lastLogin.getTime()).toBeGreaterThanOrEqual(before.getTime());
		}
	});

	test("should find users with credit balance using query builder", async () => {
		// Create a user credit record first to ensure we have data to test with
		const users = await userManager.find({});
		const user = users.find(u => u.name === 'Pet Store Owner');
		
		// Get the UserCredit entity manager
		const creditManager = framework.getContext().getEntityManager('UserCredit');
		
		// Add credit to the user
		await creditManager.create({
			user_id: user?.user_id,
			amount: 100,
			source: 'test',
			purchase_date: new Date().toISOString(),
			expiry_date: new Date(Date.now() + 30*24*60*60*1000).toISOString() // 30 days from now
		});
		
		// Build a query to find users with credit balance
		const queryBuilder = framework.getContext().getDatabase().createQueryBuilder();
		const results = await queryBuilder
			.select(['u.user_id', 'u.name', 'u.role', 'SUM(c.amount) as credit_balance'])
			.from('users', 'u')
			.leftJoin('user_credits', 'c', 'u.user_id = c.user_id')
			.groupBy('u.user_id')
			.orderBy('u.name')
			.execute();
		
		// Verify we have results
		expect(results.length).toBeGreaterThan(0);
		
		// Find our test user in the results
		const testUser = results.find(u => u.name === 'Pet Store Owner');
		expect(testUser).toBeDefined();
		expect(Number(testUser.credit_balance)).toBe(100);
	});

	test("should get user credit details", async () => {
		// Create a user credit record first to ensure we have data to test with
		const users = await userManager.find({});
		const user = users.find(u => u.name === 'Pet Store Owner');
		
		// Get the UserCredit entity manager
		const creditManager = framework.getContext().getEntityManager('UserCredit');
		
		// Add two credit entries to the user
		await creditManager.create({
			user_id: user?.user_id,
			amount: 50,
			source: 'purchase',
			purchase_date: new Date().toISOString(),
			expiry_date: new Date(Date.now() + 30*24*60*60*1000).toISOString() // 30 days from now
		});
		
		await creditManager.create({
			user_id: user?.user_id,
			amount: 10,
			source: 'bonus',
			purchase_date: new Date().toISOString(),
			expiry_date: new Date(Date.now() + 15*24*60*60*1000).toISOString() // 15 days from now
		});
		
		// Get the user's credits using the entity manager
		const userCredits = await creditManager.find({ user_id: user?.user_id });
		
		// Calculate the total credit balance
		const totalBalance = userCredits.reduce((sum, credit) => sum + Number(credit.amount), 0);
		
		expect(userCredits.length).toBe(2);
		expect(totalBalance).toBe(60);
	});

	test("should change user password", async () => {
		// Find the test user first
		const users = await userManager.find({ email: "owner@dogfoodstore.com" });
		const user = users[0];
		
		// Update the password
		await userManager.update(user.user_id!, {
			password: "newhashpassword"
		});
		
		// Verify password change
		const updatedUser = await userManager.findById(user.user_id!);
		expect(updatedUser).toBeDefined();
		expect(updatedUser?.password).toBe("newhashpassword");
	});

	test("should update user profile", async () => {
		// Find the test user first
		const users = await userManager.find({ email: "owner@dogfoodstore.com" });
		const user = users[0];
		
		// Update the profile
		await userManager.update(user.user_id!, {
			name: "New Admin Name",
			email: "newowner@dogfoodstore.com"
		});
		
		// Verify profile update
		const updatedUser = await userManager.findById(user.user_id!);
		expect(updatedUser).toBeDefined();
		expect(updatedUser?.name).toBe("New Admin Name");
		expect(updatedUser?.email).toBe("newowner@dogfoodstore.com");
	});

	test("should retrieve user without password field", async () => {
		// Find the test user first
		const users = await userManager.find({ email: "owner@dogfoodstore.com" });
		const user = users[0];
		
		// Use query builder to select specific fields (excluding password)
		const queryBuilder = framework.getContext().getDatabase().createQueryBuilder();
		const profile = await queryBuilder
			.select(['name', 'email', 'role'])
			.from('users')
			.where('user_id = ?', user.user_id)
			.getOne();
		
		expect(profile).toBeDefined();
		expect(profile.name).toBe("Pet Store Owner");
		expect(profile.email).toBe("owner@dogfoodstore.com");
		expect(profile.role).toBe("admin");
		
		// Password should not be included
		expect(Object.prototype.hasOwnProperty.call(profile, "password")).toBe(false);
	});

	test("should get user with resource access history", async () => {
		// Find the test user first
		const users = await userManager.find({});
		const user = users.find(u => u.name === 'Pet Store Owner');
		
		// Add resource access record
		await resourceAccessManager.create({
			user_id: user?.user_id!,
			resource_type: 'product',
			resource_id: 1,
			credit_cost: 10,
			access_date: new Date().toISOString()
		});
		
		// Use query builder to join user with resource access
		const queryBuilder = framework.getContext().getDatabase().createQueryBuilder();
		const result = await queryBuilder
			.select([
				'u.user_id', 
				'u.name', 
				'u.email', 
				'u.role',
				'SUM(c.amount) as credit_balance'
			])
			.from('users', 'u')
			.leftJoin('user_credits', 'c', 'u.user_id = c.user_id')
			.where('u.user_id = ?', user?.user_id)
			.groupBy('u.user_id')
			.getOne();
		
		// Get the user's recent access history
		const accessHistory = await resourceAccessManager.find({ user_id: user?.user_id });
		
		// Combine the results
		const userWithHistory = {
			...result,
			recent_access: accessHistory
		};
		
		expect(userWithHistory).toBeDefined();
		expect(userWithHistory.name).toBe("Pet Store Owner");
		expect(Array.isArray(userWithHistory.recent_access)).toBe(true);
		expect(userWithHistory.recent_access.length).toBe(1);
		expect(userWithHistory.recent_access[0].resource_type).toBe("product");
	});
});
