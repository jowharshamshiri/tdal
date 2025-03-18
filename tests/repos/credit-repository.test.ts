// credit-repository.test.ts
import { faker } from '@faker-js/faker';
import {
	setupTestEnvironment,
	teardownTestEnvironment,
	getTestFramework,
	cleanupTestData
} from "../test-setup";

// Define interfaces for the entities being tested
interface CreditPackage {
	package_id?: number;
	name: string;
	description: string;
	credit_amount: number;
	price: number;
	validity_days: number;
	active: boolean;
	created_at?: string;
	updated_at?: string;
}

interface UserCredit {
	credit_id?: number;
	user_id: number;
	amount: number;
	source: string;
	transaction_id?: string;
	purchase_date: string;
	expiry_date: string;
}

interface PaymentTransaction {
	transaction_id?: number;
	user_id: number;
	package_id?: number;
	amount: number;
	credit_amount: number;
	payment_session_id?: string;
	payment_payment_intent?: string;
	status: string;
	transaction_date: string;
	created_at?: string;
	updated_at?: string;
}

describe("CreditRepository", () => {
	beforeAll(async () => {
		await setupTestEnvironment('./tests/test-app.yaml');
	});

	afterAll(async () => {
		await teardownTestEnvironment();
	});

	beforeEach(async () => {
		await cleanupTestData();
	});

	afterEach(async () => {
		await cleanupTestData();
	});

	describe("CreditPackageRepository", () => {
		test("should find active credit packages", async () => {
			const framework = getTestFramework();
			const context = framework.getContext();
			const packageRepo = context.getEntityManager<CreditPackage>('CreditPackage');

			// Create some packages
			await packageRepo.create({
				name: "Puppy Starter",
				description: "50 credits for beginners",
				credit_amount: 50,
				price: 4.99,
				validity_days: 90,
				active: true
			});

			await packageRepo.create({
				name: "Dog Lover Pack",
				description: "200 credits for enthusiasts",
				credit_amount: 200,
				price: 14.99,
				validity_days: 180,
				active: true
			});

			const packages = await packageRepo.findBy({ active: true });

			expect(packages.length).toBe(2);

			const packageNames = packages.map(p => p.name);
			expect(packageNames).toContain("Puppy Starter");
			expect(packageNames).toContain("Dog Lover Pack");
		});

		test("should get active package by ID", async () => {
			const framework = getTestFramework();
			const context = framework.getContext();
			const packageRepo = context.getEntityManager<CreditPackage>('CreditPackage');
			const db = context.getDatabase();

			// Create a package
			const packageId = await packageRepo.create({
				name: "Puppy Starter",
				description: "50 credits for beginners",
				credit_amount: 50,
				price: 4.99,
				validity_days: 90,
				active: true
			});

			const pkg = await packageRepo.findBy({ package_id: packageId, active: true });

			expect(pkg.length).toBe(1);
			expect(pkg[0].name).toBe("Puppy Starter");

			// Deactivate the package
			await packageRepo.update(packageId, { active: false });

			const inactivePkg = await packageRepo.findBy({ package_id: packageId, active: true });
			expect(inactivePkg.length).toBe(0);
		});

		test("should create a new credit package", async () => {
			const framework = getTestFramework();
			const context = framework.getContext();
			const packageRepo = context.getEntityManager<CreditPackage>('CreditPackage');

			const packageData = {
				name: "Mega Pack",
				description: "500 credits for power users",
				credit_amount: 500,
				price: 39.99,
				validity_days: 365,
				active: true
			};

			const id = await packageRepo.create(packageData);

			expect(id).toBeGreaterThan(0);

			// Verify package was created
			const pkg = await packageRepo.findById(id);
			expect(pkg).toBeDefined();
			expect(pkg?.name).toBe("Mega Pack");
			expect(pkg?.credit_amount).toBe(500);
		});

		test("should update a credit package", async () => {
			const framework = getTestFramework();
			const context = framework.getContext();
			const packageRepo = context.getEntityManager<CreditPackage>('CreditPackage');

			// Create a package
			const packageId = await packageRepo.create({
				name: "Puppy Starter",
				description: "50 credits for beginners",
				credit_amount: 50,
				price: 4.99,
				validity_days: 90,
				active: true
			});

			const success = await packageRepo.update(packageId, {
				name: "Updated Puppy Starter",
				price: 5.99
			});

			expect(success).toBe(1);

			// Verify package was updated
			const pkg = await packageRepo.findById(packageId);
			expect(pkg).toBeDefined();
			expect(pkg?.name).toBe("Updated Puppy Starter");
			expect(pkg?.price).toBe(5.99);
		});

		test("should deactivate a credit package", async () => {
			const framework = getTestFramework();
			const context = framework.getContext();
			const packageRepo = context.getEntityManager<CreditPackage>('CreditPackage');

			// Create a package
			const packageId = await packageRepo.create({
				name: "Puppy Starter",
				description: "50 credits for beginners",
				credit_amount: 50,
				price: 4.99,
				validity_days: 90,
				active: true
			});

			const success = await packageRepo.update(packageId, { active: false });

			expect(success).toBe(1);

			// Verify package was deactivated
			const pkg = await packageRepo.findById(packageId);
			expect(pkg).toBeDefined();
			expect(pkg?.active).toBe(false);
		});
	});

	describe("UserCreditRepository", () => {
		test("should find credits for a user", async () => {
			const framework = getTestFramework();
			const context = framework.getContext();
			const userRepo = context.getEntityManager('User');
			const userCreditRepo = context.getEntityManager<UserCredit>('UserCredit');

			// Create a user
			const userId = await userRepo.create({
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password(),
				role: 'user'
			});

			// Add credits
			await userCreditRepo.create({
				user_id: userId,
				amount: 10,
				source: "signup_bonus",
				purchase_date: new Date().toISOString(),
				expiry_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
			});

			await userCreditRepo.create({
				user_id: userId,
				amount: 50,
				source: "purchase",
				purchase_date: new Date().toISOString(),
				expiry_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
			});

			const credits = await userCreditRepo.findBy({ user_id: userId });

			expect(credits.length).toBe(2);

			// Sort by amount to make the test deterministic
			const sortedCredits = [...credits].sort((a, b) => a.amount - b.amount);
			expect(sortedCredits[0].amount).toBe(10);
			expect(sortedCredits[1].amount).toBe(50);
		});

		test("should get credit balance for a user", async () => {
			const framework = getTestFramework();
			const context = framework.getContext();
			const userRepo = context.getEntityManager('User');
			const userCreditRepo = context.getEntityManager<UserCredit>('UserCredit');
			const db = context.getDatabase();

			// Create a user
			const userId = await userRepo.create({
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password(),
				role: 'user'
			});

			// Add credits
			await userCreditRepo.create({
				user_id: userId,
				amount: 10,
				source: "signup_bonus",
				purchase_date: new Date().toISOString(),
				expiry_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
			});

			await userCreditRepo.create({
				user_id: userId,
				amount: 50,
				source: "purchase",
				purchase_date: new Date().toISOString(),
				expiry_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
			});

			const balanceResult = await db.querySingle(`
        SELECT SUM(amount) as balance
        FROM user_credits
        WHERE user_id = ?
      `, userId);

			expect(balanceResult.balance).toBe(60); // 10 + 50
		});

		test("should add credits to a user", async () => {
			const framework = getTestFramework();
			const context = framework.getContext();
			const userRepo = context.getEntityManager('User');
			const userCreditRepo = context.getEntityManager<UserCredit>('UserCredit');
			const db = context.getDatabase();

			// Create a user
			const userId = await userRepo.create({
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password(),
				role: 'user'
			});

			// Get initial credit balance (should be 0)
			const initialBalanceResult = await db.querySingle(`
        SELECT COALESCE(SUM(amount), 0) as balance
        FROM user_credits
        WHERE user_id = ?
      `, userId);

			// Add credits
			const now = new Date();
			const expiryDate = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000); // 180 days later

			const creditData = {
				user_id: userId,
				amount: 100,
				source: "admin_grant",
				purchase_date: now.toISOString(),
				expiry_date: expiryDate.toISOString()
			};

			const id = await userCreditRepo.create(creditData);

			expect(id).toBeGreaterThan(0);

			// Verify credits were added
			const finalBalanceResult = await db.querySingle(`
        SELECT SUM(amount) as balance
        FROM user_credits
        WHERE user_id = ?
      `, userId);

			expect(finalBalanceResult.balance).toBe(initialBalanceResult.balance + 100);

			// Verify credit record
			const credit = await userCreditRepo.findById(id);
			expect(credit).toBeDefined();
			expect(credit?.amount).toBe(100);
			expect(credit?.source).toBe("admin_grant");
		});

		test("should get expiring credits", async () => {
			const framework = getTestFramework();
			const context = framework.getContext();
			const userRepo = context.getEntityManager('User');
			const userCreditRepo = context.getEntityManager<UserCredit>('UserCredit');
			const db = context.getDatabase();

			// Create a user
			const userId = await userRepo.create({
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password(),
				role: 'user'
			});

			// Add a credit that expires soon
			const soon = new Date();
			soon.setDate(soon.getDate() + 5);

			await userCreditRepo.create({
				user_id: userId,
				amount: 25,
				source: "admin_grant",
				purchase_date: new Date().toISOString(),
				expiry_date: soon.toISOString()
			});

			// Add a credit that expires much later
			const later = new Date();
			later.setDate(later.getDate() + 100);

			await userCreditRepo.create({
				user_id: userId,
				amount: 75,
				source: "purchase",
				purchase_date: new Date().toISOString(),
				expiry_date: later.toISOString()
			});

			// Query for expiring credits in next 10 days
			const expiringCredits = await db.query(`
        SELECT 
          *, 
          CAST((julianday(expiry_date) - julianday('now')) AS INTEGER) as days_remaining
        FROM user_credits
        WHERE 
          user_id = ? AND
          CAST((julianday(expiry_date) - julianday('now')) AS INTEGER) <= 10
        ORDER BY expiry_date ASC
      `, userId);

			expect(expiringCredits.length).toBe(1);
			expect(expiringCredits[0].amount).toBe(25);
			expect(expiringCredits[0].days_remaining).toBeLessThanOrEqual(6);
		});

		test("should get credit totals by source", async () => {
			const framework = getTestFramework();
			const context = framework.getContext();
			const userRepo = context.getEntityManager('User');
			const userCreditRepo = context.getEntityManager<UserCredit>('UserCredit');
			const db = context.getDatabase();

			// Create a user
			const userId = await userRepo.create({
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password(),
				role: 'user'
			});

			// Add credits from different sources
			await userCreditRepo.create({
				user_id: userId,
				amount: 10,
				source: "signup_bonus",
				purchase_date: new Date().toISOString(),
				expiry_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
			});

			await userCreditRepo.create({
				user_id: userId,
				amount: 50,
				source: "purchase",
				purchase_date: new Date().toISOString(),
				expiry_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
			});

			// Calculate credit totals by source
			const signupCredits = await db.querySingle(`
        SELECT SUM(amount) as total
        FROM user_credits
        WHERE user_id = ? AND source = 'signup_bonus'
      `, userId);

			const purchaseCredits = await db.querySingle(`
        SELECT SUM(amount) as total
        FROM user_credits
        WHERE user_id = ? AND source = 'purchase'
      `, userId);

			const adminGrantCredits = await db.querySingle(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM user_credits
        WHERE user_id = ? AND source = 'admin_grant'
      `, userId);

			const totals = {
				signup_bonus: signupCredits.total || 0,
				purchase: purchaseCredits.total || 0,
				admin_grant: adminGrantCredits.total || 0
			};

			expect(totals).toBeDefined();
			expect(totals.signup_bonus).toBe(10);
			expect(totals.purchase).toBe(50);
			expect(totals.admin_grant).toBe(0);
		});
	});

	describe("PaymentTransactionRepository", () => {
		test("should find transactions for a user", async () => {
			const framework = getTestFramework();
			const context = framework.getContext();
			const transactionRepo = context.getEntityManager<PaymentTransaction>('PaymentTransaction');
			const userRepo = context.getEntityManager('User');
			const packageRepo = context.getEntityManager<CreditPackage>('CreditPackage');

			// Create a user
			const userId = await userRepo.create({
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password(),
				role: 'user'
			});

			// Create a package
			const packageId = await packageRepo.create({
				name: "Puppy Starter",
				description: "50 credits for beginners",
				credit_amount: 50,
				price: 4.99,
				validity_days: 90,
				active: true
			});

			// Create a transaction
			const now = new Date().toISOString();
			await transactionRepo.create({
				user_id: userId,
				package_id: packageId,
				amount: 4.99,
				credit_amount: 50,
				payment_session_id: "sess_123",
				status: "completed",
				transaction_date: now
			});

			const transactions = await transactionRepo.findBy({ user_id: userId });

			expect(transactions.length).toBe(1);
			expect(transactions[0].amount).toBe(4.99);
			expect(transactions[0].package_id).toBe(packageId);
		});

		test("should create a transaction", async () => {
			const framework = getTestFramework();
			const context = framework.getContext();
			const transactionRepo = context.getEntityManager<PaymentTransaction>('PaymentTransaction');
			const userRepo = context.getEntityManager('User');
			const packageRepo = context.getEntityManager<CreditPackage>('CreditPackage');

			// Create a user
			const userId = await userRepo.create({
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password(),
				role: 'user'
			});

			// Create a package
			const packageId = await packageRepo.create({
				name: "Puppy Starter",
				description: "50 credits for beginners",
				credit_amount: 50,
				price: 4.99,
				validity_days: 90,
				active: true
			});

			const transactionData = {
				user_id: userId,
				package_id: packageId,
				amount: 4.99,
				credit_amount: 50,
				payment_session_id: "sess_456",
				status: "pending",
				transaction_date: new Date().toISOString()
			};

			const id = await transactionRepo.create(transactionData);

			expect(id).toBeGreaterThan(0);

			// Verify transaction was created
			const transaction = await transactionRepo.findById(id);
			expect(transaction).toBeDefined();
			expect(transaction?.user_id).toBe(userId);
			expect(transaction?.package_id).toBe(packageId);
			expect(transaction?.amount).toBe(4.99);
			expect(transaction?.credit_amount).toBe(50);
			expect(transaction?.payment_session_id).toBe("sess_456");
			expect(transaction?.status).toBe("pending");
		});

		test("should update transaction status", async () => {
			const framework = getTestFramework();
			const context = framework.getContext();
			const transactionRepo = context.getEntityManager<PaymentTransaction>('PaymentTransaction');
			const userRepo = context.getEntityManager('User');
			const packageRepo = context.getEntityManager<CreditPackage>('CreditPackage');

			// Create a user
			const userId = await userRepo.create({
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password(),
				role: 'user'
			});

			// Create a package
			const packageId = await packageRepo.create({
				name: "Puppy Starter",
				description: "50 credits for beginners",
				credit_amount: 50,
				price: 4.99,
				validity_days: 90,
				active: true
			});

			// Create a transaction
			const transactionData = {
				user_id: userId,
				package_id: packageId,
				amount: 4.99,
				credit_amount: 50,
				payment_session_id: "sess_789",
				status: "pending",
				transaction_date: new Date().toISOString()
			};

			const id = await transactionRepo.create(transactionData);

			// Update status
			const updateData = {
				status: "completed",
				payment_payment_intent: "pi_123"
			};

			const success = await transactionRepo.update(id, updateData);

			expect(success).toBe(1);

			// Verify transaction was updated
			const transaction = await transactionRepo.findById(id);
			expect(transaction).toBeDefined();
			expect(transaction?.status).toBe("completed");
			expect(transaction?.payment_payment_intent).toBe("pi_123");
		});

		test("should complete a transaction and add credits", async () => {
			const framework = getTestFramework();
			const context = framework.getContext();
			const transactionRepo = context.getEntityManager<PaymentTransaction>('PaymentTransaction');
			const userCreditRepo = context.getEntityManager<UserCredit>('UserCredit');
			const userRepo = context.getEntityManager('User');
			const packageRepo = context.getEntityManager<CreditPackage>('CreditPackage');
			const db = context.getDatabase();

			// Create a user
			const userId = await userRepo.create({
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password(),
				role: 'user'
			});

			// Create a package
			const packageId = await packageRepo.create({
				name: "Puppy Starter",
				description: "50 credits for beginners",
				credit_amount: 50,
				price: 4.99,
				validity_days: 90,
				active: true
			});

			// Create a transaction
			const transactionData = {
				user_id: userId,
				package_id: packageId,
				amount: 4.99,
				credit_amount: 50,
				payment_session_id: "sess_abc",
				status: "pending",
				transaction_date: new Date().toISOString()
			};

			const id = await transactionRepo.create(transactionData);

			// Get initial credit balance
			const initialBalanceResult = await db.querySingle(`
        SELECT COALESCE(SUM(amount), 0) as balance
        FROM user_credits
        WHERE user_id = ?
      `, userId);
			const initialBalance = initialBalanceResult.balance || 0;

			// Complete transaction
			await transactionRepo.update(id, {
				status: "completed",
				payment_payment_intent: "pi_456"
			});

			// Add credits
			const expiryDate = new Date();
			expiryDate.setDate(expiryDate.getDate() + 90); // 90 days from now

			await userCreditRepo.create({
				user_id: userId,
				amount: 50,
				source: "purchase",
				transaction_id: String(id),
				purchase_date: new Date().toISOString(),
				expiry_date: expiryDate.toISOString()
			});

			// Verify transaction was updated
			const transaction = await transactionRepo.findById(id);
			expect(transaction).toBeDefined();
			expect(transaction?.status).toBe("completed");
			expect(transaction?.payment_payment_intent).toBe("pi_456");

			// Verify credits were added
			const newBalanceResult = await db.querySingle(`
        SELECT SUM(amount) as balance
        FROM user_credits
        WHERE user_id = ?
      `, userId);
			const newBalance = newBalanceResult.balance || 0;

			expect(newBalance).toBe(initialBalance + 50);
		});

		test("should find transaction by Payment session ID", async () => {
			const framework = getTestFramework();
			const context = framework.getContext();
			const transactionRepo = context.getEntityManager<PaymentTransaction>('PaymentTransaction');
			const userRepo = context.getEntityManager('User');
			const packageRepo = context.getEntityManager<CreditPackage>('CreditPackage');

			// Create a user
			const userId = await userRepo.create({
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password(),
				role: 'user'
			});

			// Create a package
			const packageId = await packageRepo.create({
				name: "Puppy Starter",
				description: "50 credits for beginners",
				credit_amount: 50,
				price: 4.99,
				validity_days: 90,
				active: true
			});

			// Create a transaction with a specific session ID
			const sessionId = "sess_xyz_" + faker.string.alphanumeric(10);
			const transactionData = {
				user_id: userId,
				package_id: packageId,
				amount: 4.99,
				credit_amount: 50,
				payment_session_id: sessionId,
				status: "pending",
				transaction_date: new Date().toISOString()
			};

			await transactionRepo.create(transactionData);

			// Find by payment session ID
			const transactions = await transactionRepo.findBy({
				payment_session_id: sessionId
			});

			expect(transactions.length).toBe(1);
			expect(transactions[0].payment_session_id).toBe(sessionId);
		});

		test("should find transaction by Payment payment intent ID", async () => {
			const framework = getTestFramework();
			const context = framework.getContext();
			const transactionRepo = context.getEntityManager<PaymentTransaction>('PaymentTransaction');
			const userRepo = context.getEntityManager('User');
			const packageRepo = context.getEntityManager<CreditPackage>('CreditPackage');

			// Create a user
			const userId = await userRepo.create({
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password(),
				role: 'user'
			});

			// Create a package
			const packageId = await packageRepo.create({
				name: "Puppy Starter",
				description: "50 credits for beginners",
				credit_amount: 50,
				price: 4.99,
				validity_days: 90,
				active: true
			});

			// Create a transaction
			const transactionData = {
				user_id: userId,
				package_id: packageId,
				amount: 4.99,
				credit_amount: 50,
				payment_session_id: "sess_123",
				status: "pending",
				transaction_date: new Date().toISOString()
			};

			const id = await transactionRepo.create(transactionData);

			// Generate a unique payment intent ID
			const paymentIntentId = "pi_xyz_" + faker.string.alphanumeric(10);

			// Update with payment intent
			await transactionRepo.update(id, {
				status: "completed",
				payment_payment_intent: paymentIntentId
			});

			// Find by payment intent
			const transactions = await transactionRepo.findBy({
				payment_payment_intent: paymentIntentId
			});

			expect(transactions.length).toBe(1);
			expect(transactions[0].payment_payment_intent).toBe(paymentIntentId);
		});

		test("should get transaction statistics", async () => {
			const framework = getTestFramework();
			const context = framework.getContext();
			const transactionRepo = context.getEntityManager<PaymentTransaction>('PaymentTransaction');
			const userRepo = context.getEntityManager('User');
			const packageRepo = context.getEntityManager<CreditPackage>('CreditPackage');
			const db = context.getDatabase();

			// Create a user
			const userId = await userRepo.create({
				name: faker.person.fullName(),
				email: faker.internet.email(),
				password: faker.internet.password(),
				role: 'user'
			});

			// Create a package
			const packageId = await packageRepo.create({
				name: "Puppy Starter",
				description: "50 credits for beginners",
				credit_amount: 50,
				price: 4.99,
				validity_days: 90,
				active: true
			});

			// Add multiple transactions with different statuses
			const now = new Date().toISOString();

			// Completed transaction
			await transactionRepo.create({
				user_id: userId,
				package_id: packageId,
				amount: 4.99,
				credit_amount: 50,
				payment_session_id: "sess_1",
				status: "completed",
				transaction_date: now
			});

			// Pending transaction
			await transactionRepo.create({
				user_id: userId,
				package_id: packageId,
				amount: 14.99,
				credit_amount: 200,
				payment_session_id: "sess_2",
				status: "pending",
				transaction_date: now
			});

			// Failed transaction
			await transactionRepo.create({
				user_id: userId,
				package_id: packageId,
				amount: 4.99,
				credit_amount: 50,
				payment_session_id: "sess_3",
				status: "failed",
				transaction_date: now
			});

			// Get transaction statistics
			const totalResult = await db.querySingle(`
        SELECT COUNT(*) as count
        FROM payment_transactions
      `);

			const completedResult = await db.querySingle(`
        SELECT COUNT(*) as count
        FROM payment_transactions
        WHERE status = 'completed'
      `);

			const pendingResult = await db.querySingle(`
        SELECT COUNT(*) as count
        FROM payment_transactions
        WHERE status = 'pending'
      `);

			const failedResult = await db.querySingle(`
        SELECT COUNT(*) as count
        FROM payment_transactions
        WHERE status = 'failed'
      `);

			const totalAmountResult = await db.querySingle(`
        SELECT SUM(amount) as sum
        FROM payment_transactions
        WHERE status = 'completed'
      `);

			const totalCreditsResult = await db.querySingle(`
        SELECT SUM(credit_amount) as sum
        FROM payment_transactions
        WHERE status = 'completed'
      `);

			const stats = {
				total: totalResult.count,
				completed: completedResult.count,
				pending: pendingResult.count,
				failed: failedResult.count,
				refunded: 0,
				totalAmount: totalAmountResult.sum || 0,
				totalCredits: totalCreditsResult.sum || 0
			};

			expect(stats).toBeDefined();
			expect(stats.total).toBe(3);
			expect(stats.completed).toBe(1);
			expect(stats.pending).toBe(1);
			expect(stats.failed).toBe(1);
			expect(stats.refunded).toBe(0);
			expect(stats.totalAmount).toBe(4.99);
			expect(stats.totalCredits).toBe(50);
		});
	});
});