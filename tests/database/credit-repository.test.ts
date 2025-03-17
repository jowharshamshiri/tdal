// credit-repository.test.ts
import {
	setupTestEnvironment,
	teardownTestEnvironment,
	getTestFramework,
	generateTestData,
	cleanupTestData
} from "../test-setup";
import { DatabaseAdapter } from "../../src/database/core/types";

// Define interfaces for the entities being tested
interface CreditPackage {
	package_id: number;
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
	credit_id: number;
	user_id: number;
	amount: number;
	source: string;
	transaction_id?: string;
	purchase_date: string;
	expiry_date: string;
}

interface PaymentTransaction {
	transaction_id: number;
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

		// Generate core test data
		await generateTestData({
			count: 1,
			withRelations: false,
			fixedValues: {
				User: [
					{
						user_id: 1,
						name: "Store Owner",
						email: "store@example.com",
						role: "admin"
					},
					{
						user_id: 2,
						name: "Customer",
						email: "customer@example.com",
						role: "user"
					}
				],
				CreditPackage: [
					{
						package_id: 1,
						name: "Puppy Starter",
						description: "50 credits for beginners",
						credit_amount: 50,
						price: 4.99,
						validity_days: 90,
						active: true
					},
					{
						package_id: 2,
						name: "Dog Lover Pack",
						description: "200 credits for enthusiasts",
						credit_amount: 200,
						price: 14.99,
						validity_days: 180,
						active: true
					}
				],
				UserCredit: [
					{
						user_id: 2,
						amount: 10,
						source: "signup_bonus",
						purchase_date: new Date().toISOString(),
						expiry_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
					},
					{
						user_id: 2,
						amount: 50,
						source: "purchase",
						purchase_date: new Date().toISOString(),
						expiry_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
					}
				]
			}
		});
	});

	afterEach(async () => {
		await cleanupTestData();
	});

	describe("CreditPackageRepository", () => {
		test("should find active credit packages", async () => {
			const framework = getTestFramework();
			const context = framework.getContext();
			const packageRepo = context.getEntityManager<CreditPackage>('CreditPackage');

			const packages = await packageRepo.findBy({ active: true });

			expect(packages).toHaveLength(2);
			expect(packages[0].name).toBe("Puppy Starter");
			expect(packages[1].name).toBe("Dog Lover Pack");
		});

		test("should get active package by ID", async () => {
			const framework = getTestFramework();
			const context = framework.getContext();
			const packageRepo = context.getEntityManager<CreditPackage>('CreditPackage');
			const db = context.getDatabase();

			const pkg = await packageRepo.findBy({ package_id: 1, active: true });

			expect(pkg).toHaveLength(1);
			expect(pkg[0].name).toBe("Puppy Starter");

			// Deactivate the package
			await db.execute(
				"UPDATE credit_packages SET active = 0 WHERE package_id = 1"
			);

			const inactivePkg = await packageRepo.findBy({ package_id: 1, active: true });
			expect(inactivePkg).toHaveLength(0);
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

			const success = await packageRepo.update(1, {
				name: "Updated Puppy Starter",
				price: 5.99
			});

			expect(success).toBe(1);

			// Verify package was updated
			const pkg = await packageRepo.findById(1);
			expect(pkg).toBeDefined();
			expect(pkg?.name).toBe("Updated Puppy Starter");
			expect(pkg?.price).toBe(5.99);
		});

		test("should deactivate a credit package", async () => {
			const framework = getTestFramework();
			const context = framework.getContext();
			const packageRepo = context.getEntityManager<CreditPackage>('CreditPackage');

			const success = await packageRepo.update(1, { active: false });

			expect(success).toBe(1);

			// Verify package was deactivated
			const pkg = await packageRepo.findById(1);
			expect(pkg).toBeDefined();
			expect(pkg?.active).toBe(0); // SQLite stores booleans as 0/1
		});
	});

	describe("UserCreditRepository", () => {
		test("should find credits for a user", async () => {
			const framework = getTestFramework();
			const context = framework.getContext();
			const userCreditRepo = context.getEntityManager<UserCredit>('UserCredit');

			const credits = await userCreditRepo.findBy({ user_id: 2 });

			expect(credits).toHaveLength(2);
			expect(credits[0].amount).toBe(10);
			expect(credits[1].amount).toBe(50);
		});

		test("should get credit balance for a user", async () => {
			const framework = getTestFramework();
			const context = framework.getContext();
			const db = context.getDatabase();

			const balanceResult = await db.querySingle(`
				SELECT SUM(amount) as balance
				FROM user_credits
				WHERE user_id = 2
			`);

			expect(balanceResult.balance).toBe(60); // 10 + 50
		});

		test("should add credits to a user", async () => {
			const framework = getTestFramework();
			const context = framework.getContext();
			const userCreditRepo = context.getEntityManager<UserCredit>('UserCredit');
			const db = context.getDatabase();

			// Get initial credit balance
			const initialBalanceResult = await db.querySingle(`
				SELECT SUM(amount) as balance
				FROM user_credits
				WHERE user_id = 2
			`);

			// Add credits
			const now = new Date();
			const expiryDate = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000); // 180 days later

			const creditData = {
				user_id: 2,
				amount: 100,
				source: "admin_grant",
				transaction_id: null,
				purchase_date: now.toISOString(),
				expiry_date: expiryDate.toISOString()
			};

			const id = await userCreditRepo.create(creditData);

			expect(id).toBeGreaterThan(0);

			// Verify credits were added
			const finalBalanceResult = await db.querySingle(`
				SELECT SUM(amount) as balance
				FROM user_credits
				WHERE user_id = 2
			`);

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
			const userCreditRepo = context.getEntityManager<UserCredit>('UserCredit');
			const db = context.getDatabase();

			// Add a credit that expires soon
			const soon = new Date();
			soon.setDate(soon.getDate() + 5);

			await userCreditRepo.create({
				user_id: 2,
				amount: 25,
				source: "admin_grant",
				purchase_date: new Date().toISOString(),
				expiry_date: soon.toISOString()
			});

			// Query for expiring credits in next 10 days
			const expiringCredits = await db.query(`
				SELECT 
					*, 
					CAST((julianday(expiry_date) - julianday('now')) AS INTEGER) as days_remaining
				FROM user_credits
				WHERE 
					user_id = 2 AND
					CAST((julianday(expiry_date) - julianday('now')) AS INTEGER) <= 10
				ORDER BY expiry_date ASC
			`);

			expect(expiringCredits).toHaveLength(1);
			expect(expiringCredits[0].amount).toBe(25);
			expect(expiringCredits[0].days_remaining).toBeLessThanOrEqual(6);
		});

		test("should get credit totals by source", async () => {
			const framework = getTestFramework();
			const context = framework.getContext();
			const db = context.getDatabase();

			// Calculate credit totals by source
			const signupCredits = await db.querySingle(`
				SELECT SUM(amount) as total
				FROM user_credits
				WHERE user_id = 2 AND source = 'signup_bonus'
			`);

			const purchaseCredits = await db.querySingle(`
				SELECT SUM(amount) as total
				FROM user_credits
				WHERE user_id = 2 AND source = 'purchase'
			`);

			const adminGrantCredits = await db.querySingle(`
				SELECT SUM(amount) as total
				FROM user_credits
				WHERE user_id = 2 AND source = 'admin_grant'
			`);

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
			const db = context.getDatabase();

			// First create a transaction
			const now = new Date().toISOString();
			await db.execute(`
				INSERT INTO payment_transactions (
					user_id, package_id, amount, credit_amount, 
					payment_session_id, status, transaction_date, created_at, updated_at
				)
				VALUES (
					2, 1, 4.99, 50, 'sess_123', 'completed', 
					?, ?, ?
				)
			`, now, now, now);

			const transactions = await transactionRepo.findBy({ user_id: 2 });

			expect(transactions).toHaveLength(1);
			expect(transactions[0].amount).toBe(4.99);
		});

		test("should create a transaction", async () => {
			const framework = getTestFramework();
			const context = framework.getContext();
			const transactionRepo = context.getEntityManager<PaymentTransaction>('PaymentTransaction');

			const transactionData = {
				user_id: 2,
				package_id: 1,
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
			expect(transaction?.user_id).toBe(2);
			expect(transaction?.package_id).toBe(1);
			expect(transaction?.amount).toBe(4.99);
			expect(transaction?.credit_amount).toBe(50);
			expect(transaction?.payment_session_id).toBe("sess_456");
			expect(transaction?.status).toBe("pending");
		});

		test("should update transaction status", async () => {
			const framework = getTestFramework();
			const context = framework.getContext();
			const transactionRepo = context.getEntityManager<PaymentTransaction>('PaymentTransaction');

			// First create a transaction
			const transactionData = {
				user_id: 2,
				package_id: 1,
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
			const db = context.getDatabase();

			// First create a transaction
			const transactionData = {
				user_id: 2,
				package_id: 1,
				amount: 4.99,
				credit_amount: 50,
				payment_session_id: "sess_abc",
				status: "pending",
				transaction_date: new Date().toISOString()
			};

			const id = await transactionRepo.create(transactionData);

			// Get initial credit balance
			const initialBalanceResult = await db.querySingle(`
				SELECT SUM(amount) as balance
				FROM user_credits
				WHERE user_id = 2
			`);
			const initialBalance = initialBalanceResult.balance || 0;

			// Complete transaction
			await transactionRepo.update(id, {
				status: "completed",
				payment_payment_intent: "pi_456"
			});

			// Add credits
			const expiryDate = new Date();
			expiryDate.setDate(expiryDate.getDate() + 180); // 180 days from now

			await userCreditRepo.create({
				user_id: 2,
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
				WHERE user_id = 2
			`);
			const newBalance = newBalanceResult.balance || 0;

			expect(newBalance).toBe(initialBalance + 50);
		});

		test("should find transaction by Payment session ID", async () => {
			const framework = getTestFramework();
			const context = framework.getContext();
			const transactionRepo = context.getEntityManager<PaymentTransaction>('PaymentTransaction');

			// First create a transaction
			const transactionData = {
				user_id: 2,
				package_id: 1,
				amount: 4.99,
				credit_amount: 50,
				payment_session_id: "sess_xyz",
				status: "pending",
				transaction_date: new Date().toISOString()
			};

			await transactionRepo.create(transactionData);

			// Find by payment session ID
			const transactions = await transactionRepo.findBy({
				payment_session_id: "sess_xyz"
			});

			expect(transactions).toHaveLength(1);
			expect(transactions[0].payment_session_id).toBe("sess_xyz");
		});

		test("should find transaction by Payment payment intent ID", async () => {
			const framework = getTestFramework();
			const context = framework.getContext();
			const transactionRepo = context.getEntityManager<PaymentTransaction>('PaymentTransaction');

			// First create a transaction
			const transactionData = {
				user_id: 2,
				package_id: 1,
				amount: 4.99,
				credit_amount: 50,
				payment_session_id: "sess_123",
				status: "pending",
				transaction_date: new Date().toISOString()
			};

			const id = await transactionRepo.create(transactionData);

			// Update with payment intent
			await transactionRepo.update(id, {
				status: "completed",
				payment_payment_intent: "pi_xyz"
			});

			// Find by payment intent
			const transactions = await transactionRepo.findBy({
				payment_payment_intent: "pi_xyz"
			});

			expect(transactions).toHaveLength(1);
			expect(transactions[0].payment_payment_intent).toBe("pi_xyz");
		});

		test("should get transaction statistics", async () => {
			const framework = getTestFramework();
			const context = framework.getContext();
			const db = context.getDatabase();

			// Add multiple transactions with different statuses
			const now = new Date().toISOString();

			await db.execute(`
				INSERT INTO payment_transactions (
					user_id, package_id, amount, credit_amount, 
					payment_session_id, status, transaction_date, created_at, updated_at
				)
				VALUES 
					(2, 1, 4.99, 50, 'sess_1', 'completed', ?, ?, ?),
					(2, 2, 14.99, 200, 'sess_2', 'pending', ?, ?, ?),
					(1, 1, 4.99, 50, 'sess_3', 'failed', ?, ?, ?)
			`, now, now, now, now, now, now, now, now, now);

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