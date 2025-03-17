// user-repository.test.ts
import {
	setupTestEnvironment,
	teardownTestEnvironment,
	getTestFramework,
	generateTestData,
	cleanupTestData
} from '../test-setup';
import { faker } from '@faker-js/faker';

// Define interface for User entity based on test-app.yaml
interface User {
	user_id?: number;
	name: string;
	email: string;
	password?: string;
	role: string;
	created_at?: string;
	updated_at?: string;
	last_login?: string;
}

// Define interface for UserCredit entity based on test-app.yaml
interface UserCredit {
	credit_id?: number;
	user_id: number;
	amount: number;
	source: string;
	transaction_id?: string;
	purchase_date: string;
	expiry_date: string;
}

// Helper function to generate a unique email
function uniqueEmail(prefix: string = ''): string {
	const timestamp = Date.now();
	const random = Math.floor(Math.random() * 10000);
	return `${prefix}${timestamp}-${random}@example.com`;
}

describe("User Repository Operations", () => {
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
		// Clean up any test data created during the test
		await cleanupTestData();
	});

	test("should create and retrieve a user", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');

		const uniqueUserEmail = uniqueEmail('create-user');

		// Create a new user
		const userData = {
			name: "New Test User",
			email: uniqueUserEmail,
			password: "hashedpassword123",
			role: "user"
		};

		const userId = await userManager.create(userData);
		expect(userId).toBeGreaterThan(0);

		// Retrieve the user
		const user = await userManager.findById(userId);
		expect(user).toBeDefined();
		expect(user?.name).toBe("New Test User");
		expect(user?.email).toBe(uniqueUserEmail);
		expect(user?.role).toBe("user");
	});

	test("should update a user's information", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');

		const uniqueUserEmail = uniqueEmail('update-user');

		// Create a user to update
		const userId = await userManager.create({
			name: "Update Test User",
			email: uniqueUserEmail,
			password: "hashedpassword123",
			role: "user"
		});

		// Update the user
		const updatedData = {
			name: "Updated User Name",
			role: "premium"
		};

		const result = await userManager.update(userId, updatedData);
		expect(result).toBe(1); // One row affected

		// Verify the update
		const updatedUser = await userManager.findById(userId);
		expect(updatedUser).toBeDefined();
		expect(updatedUser?.name).toBe("Updated User Name");
		expect(updatedUser?.role).toBe("premium");
		expect(updatedUser?.email).toBe(uniqueUserEmail); // Email should remain unchanged
	});

	test("should find users by role", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');

		// Create several users with different roles
		const adminEmail = uniqueEmail('admin');
		const userEmail1 = uniqueEmail('user1');
		const userEmail2 = uniqueEmail('user2');

		await userManager.create({
			name: "Admin User",
			email: adminEmail,
			password: "hashedpassword123",
			role: "admin"
		});

		await userManager.create({
			name: "Regular User 1",
			email: userEmail1,
			password: "hashedpassword123",
			role: "user"
		});

		await userManager.create({
			name: "Regular User 2",
			email: userEmail2,
			password: "hashedpassword123",
			role: "user"
		});

		// Find users by role
		const adminUsers = await userManager.findBy({ role: "admin" });
		const regularUsers = await userManager.findBy({ role: "user" });

		expect(adminUsers.length).toBe(1);
		expect(regularUsers.length).toBe(2);

		// Verify admin user
		expect(adminUsers[0].email).toBe(adminEmail);

		// Verify regular users
		const userEmails = regularUsers.map(u => u.email);
		expect(userEmails).toContain(userEmail1);
		expect(userEmails).toContain(userEmail2);
	});

	test("should handle user credits relationship", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');
		const creditManager = context.getEntityManager<UserCredit>('UserCredit');

		const uniqueUserEmail = uniqueEmail('credit-user');

		// Create a user with credits
		const userId = await userManager.create({
			name: "Credit Test User",
			email: uniqueUserEmail,
			password: "hashedpassword123",
			role: "user"
		});

		// Add credits for the user
		const now = new Date();
		const expiryDate = new Date();
		expiryDate.setFullYear(now.getFullYear() + 1); // Expires in 1 year

		const creditData = {
			user_id: userId,
			amount: 100,
			source: "purchase",
			transaction_id: "tx-" + Date.now(),
			purchase_date: now.toISOString(),
			expiry_date: expiryDate.toISOString()
		};

		const creditId = await creditManager.create(creditData);
		expect(creditId).toBeGreaterThan(0);

		// Verify the credit was created and associated with user
		const userCredits = await creditManager.findBy({ user_id: userId });
		expect(userCredits.length).toBe(1);
		expect(userCredits[0].amount).toBe(100);
		expect(userCredits[0].source).toBe("purchase");

		// Find related credits through user's relation
		if (userManager.findRelated) {
			const relatedCredits = await userManager.findRelated(userId, "credits");
			expect(relatedCredits.length).toBe(1);
			expect(relatedCredits[0].amount).toBe(100);
		}
	});

	test("should delete a user", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');

		const uniqueUserEmail = uniqueEmail('delete-user');

		// Create a user to delete
		const userId = await userManager.create({
			name: "Delete Test User",
			email: uniqueUserEmail,
			password: "hashedpassword123",
			role: "user"
		});

		// Delete the user
		const result = await userManager.delete(userId);
		expect(result).toBe(1); // One row affected

		// Verify the user was deleted
		const deletedUser = await userManager.findById(userId);
		expect(deletedUser).toBeUndefined();
	});

	test("should perform bulk user operations", async () => {
		const framework = getTestFramework();
		const context = framework.getContext();
		const userManager = context.getEntityManager<User>('User');

		// Create multiple users at once
		const bulkUsers = [
			{
				name: "Bulk User 1",
				email: uniqueEmail('bulk1'),
				password: "hashedpassword123",
				role: "user"
			},
			{
				name: "Bulk User 2",
				email: uniqueEmail('bulk2'),
				password: "hashedpassword123",
				role: "user"
			},
			{
				name: "Bulk User 3",
				email: uniqueEmail('bulk3'),
				password: "hashedpassword123",
				role: "admin"
			}
		];

		// Use bulkCreate if available, otherwise create them one by one
		if (userManager.bulkCreate) {
			const count = await userManager.bulkCreate(bulkUsers);
			expect(count).toBe(3);
		} else {
			for (const userData of bulkUsers) {
				const id = await userManager.create(userData);
				expect(id).toBeGreaterThan(0);
			}
		}

		// Find all users
		const allUsers = await userManager.findBy({});
		expect(allUsers.length).toBeGreaterThanOrEqual(3);

		// Verify we can find at least one admin and one regular user
		const admins = await userManager.findBy({ role: "admin" });
		const regularUsers = await userManager.findBy({ role: "user" });

		expect(admins.length).toBeGreaterThanOrEqual(1);
		expect(regularUsers.length).toBeGreaterThanOrEqual(2);
	});
});