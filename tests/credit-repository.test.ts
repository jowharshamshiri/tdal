// credit-repository.test.ts
import {
	setupTestDatabase,
	teardownTestDatabase,
	createTestSchema,
	insertTestData,
	cleanupDatabase,
} from "./test-setup";
import { DatabaseAdapter } from "../src/database/core/types";
import {
	CreditPackageRepository,
	UserCreditRepository,
	PaymentTransactionRepository,
} from "../src/repositories/credit-repository";

describe("CreditRepository", () => {
	let db: DatabaseAdapter;
	let packageRepo: CreditPackageRepository;
	let userCreditRepo: UserCreditRepository;
	let transactionRepo: PaymentTransactionRepository;

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

		// Create repository instances
		packageRepo = new CreditPackageRepository(db);
		userCreditRepo = new UserCreditRepository(db);
		transactionRepo = new PaymentTransactionRepository(db);
	});

	describe("CreditPackageRepository", () => {
		test("should find active credit packages", async () => {
			const packages = await packageRepo.findActive();

			expect(packages).toHaveLength(2);
			expect(packages[0].name).toBe("Puppy Starter");
			expect(packages[1].name).toBe("Dog Lover Pack");
		});

		test("should get active package by ID", async () => {
			const pkg = await packageRepo.getActivePackage(1);

			expect(pkg).toBeDefined();
			if (pkg) {
				expect(pkg.name).toBe("Puppy Starter");
			}

			// Deactivate the package
			await db.execute(
				"UPDATE credit_packages SET active = 0 WHERE package_id = 1"
			);

			const inactivePkg = await packageRepo.getActivePackage(1);
			expect(inactivePkg).toBeUndefined();
		});

		test("should create a new credit package", async () => {
			const packageData = {
				name: "Mega Pack",
				description: "500 credits for power users",
				credit_amount: 500,
				price: 39.99,
				validity_days: 365,
				active: true,
			};

			const id = await packageRepo.createPackage(packageData);

			expect(id).toBeGreaterThan(0);

			// Verify package was created
			const pkg = await packageRepo.findById(id);
			expect(pkg).toBeDefined();
			if (pkg) {
				expect(pkg.name).toBe("Mega Pack");
				expect(pkg.credit_amount).toBe(500);
			}
		});

		test("should update a credit package", async () => {
			const success = await packageRepo.updatePackage(1, {
				name: "Updated Puppy Starter",
				price: 5.99,
			});

			expect(success).toBe(true);

			// Verify package was updated
			const pkg = await packageRepo.findById(1);
			expect(pkg).toBeDefined();
			if (pkg) {
				expect(pkg.name).toBe("Updated Puppy Starter");
				expect(pkg.price).toBe(5.99);
			}
		});

		test("should deactivate a credit package", async () => {
			const success = await packageRepo.deactivatePackage(1);

			expect(success).toBe(true);

			// Verify package was deactivated
			const pkg = await packageRepo.findById(1);
			expect(pkg).toBeDefined();
			if (pkg) {
				// Check for 0 instead of false - SQLite stores booleans as 0/1
				expect(pkg.active).toBe(0);
			}
		});
	});

	describe("UserCreditRepository", () => {
		test("should find credits for a user", async () => {
			const credits = await userCreditRepo.findForUser(2);

			expect(credits).toHaveLength(2);
			expect(credits[0].amount).toBe(10);
			expect(credits[1].amount).toBe(50);
		});

		test("should get credit balance for a user", async () => {
			const balance = await userCreditRepo.getBalance(2);

			expect(balance).toBe(60); // 10 + 50
		});

		test("should add credits to a user", async () => {
			const id = await userCreditRepo.addCredits(
				2,
				100,
				"admin_grant",
				null,
				180
			);

			expect(id).toBeGreaterThan(0);

			// Verify credits were added
			const balance = await userCreditRepo.getBalance(2);
			expect(balance).toBe(160); // 10 + 50 + 100

			// Verify credit record
			const credit = await db.findById("user_credits", "credit_id", id);
			expect(credit).toBeDefined();
			if (credit) {
				expect((credit as any).amount).toBe(100);
				expect((credit as any).source).toBe("admin_grant");
			}

			// Verify expiry date (approximately 180 days in the future)
			if (credit) {
				const expiryDate = new Date((credit as any).expiry_date as string);
				const now = new Date();
				const daysDiff = Math.round(
					(expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
				);
				expect(daysDiff).toBeGreaterThanOrEqual(179);
				expect(daysDiff).toBeLessThanOrEqual(181);
			}
		});

		test("should get expiring credits", async () => {
			// Add a credit that expires soon
			const soon = new Date();
			soon.setDate(soon.getDate() + 5);

			await db.execute(
				`
		  INSERT INTO user_credits (user_id, amount, source, purchase_date, expiry_date)
		  VALUES (2, 25, 'admin_grant', '2023-01-15T12:00:00.000Z', ?)
		`,
				soon.toISOString()
			);

			const expiringCredits = await userCreditRepo.getExpiringCredits(2, 10);

			expect(expiringCredits).toHaveLength(1);
			expect(expiringCredits[0].amount).toBe(25);
			expect(expiringCredits[0].days_remaining).toBeLessThanOrEqual(6);
		});

		test("should get credit totals by source", async () => {
			const totals = await userCreditRepo.getTotalsBySource(2);

			expect(totals).toBeDefined();
			expect(totals.signup_bonus).toBe(10);
			expect(totals.purchase).toBe(50);
			expect(totals.admin_grant).toBe(0);
		});
	});

	describe("PaymentTransactionRepository", () => {
		test("should find transactions for a user", async () => {
			// First create a transaction
			await db.execute(`
		  INSERT INTO payment_transactions (
			user_id, package_id, amount, credit_amount, 
			payment_session_id, status, transaction_date, created_at, updated_at
		  )
		  VALUES (
			2, 1, 4.99, 50, 'sess_123', 'completed', 
			'2023-01-15T12:00:00.000Z', '2023-01-15T12:00:00.000Z', '2023-01-15T12:00:00.000Z'
		  )
		`);

			const transactions = await transactionRepo.findForUser(2);

			// There are now 2 transactions in the database
			expect(transactions).toHaveLength(2);
			expect(transactions[0].amount).toBe(4.99);
		});

		test("should create a transaction", async () => {
			const id = await transactionRepo.createTransaction(
				2,
				1,
				4.99,
				50,
				"sess_456"
			);

			expect(id).toBeGreaterThan(0);

			// Verify transaction was created
			const transaction = await transactionRepo.findById(id);
			expect(transaction).toBeDefined();
			if (transaction) {
				expect(transaction.user_id).toBe(2);
				expect(transaction.package_id).toBe(1);
				expect(transaction.amount).toBe(4.99);
				expect(transaction.credit_amount).toBe(50);
				expect(transaction.payment_session_id).toBe("sess_456");
				expect(transaction.status).toBe("pending");
			}
		});

		test("should update transaction status", async () => {
			// First create a transaction
			const id = await transactionRepo.createTransaction(
				2,
				1,
				4.99,
				50,
				"sess_789"
			);

			const success = await transactionRepo.updateStatus(
				id,
				"completed",
				"pi_123"
			);

			expect(success).toBe(true);

			// Verify transaction was updated
			const transaction = await transactionRepo.findById(id);
			expect(transaction).toBeDefined();
			if (transaction) {
				expect(transaction.status).toBe("completed");
				expect(transaction.payment_payment_intent).toBe("pi_123");
			}
		});

		test("should complete a transaction and add credits", async () => {
			// First create a transaction
			const id = await transactionRepo.createTransaction(
				2,
				1,
				4.99,
				50,
				"sess_abc"
			);

			// Get initial credit balance
			const initialBalance = await userCreditRepo.getBalance(2);

			const success = await transactionRepo.completeTransaction(
				id,
				"pi_456",
				180
			);

			expect(success).toBe(true);

			// Verify transaction was updated
			const transaction = await transactionRepo.findById(id);
			expect(transaction).toBeDefined();
			if (transaction) {
				expect(transaction.status).toBe("completed");
				expect(transaction.payment_payment_intent).toBe("pi_456");
			}

			// Verify credits were added
			const newBalance = await userCreditRepo.getBalance(2);
			expect(newBalance).toBe(initialBalance + 50);
		});

		test("should find transaction by Payment session ID", async () => {
			// First create a transaction
			await transactionRepo.createTransaction(2, 1, 4.99, 50, "sess_xyz");

			const transaction = await transactionRepo.findByPaymentSessionId(
				"sess_xyz"
			);

			expect(transaction).toBeDefined();
			if (transaction) {
				expect(transaction.payment_session_id).toBe("sess_xyz");
			}
		});

		test("should find transaction by Payment payment intent ID", async () => {
			// First create a transaction and update with payment intent
			const id = await transactionRepo.createTransaction(
				2,
				1,
				4.99,
				50,
				"sess_123"
			);
			await transactionRepo.updateStatus(id, "completed", "pi_xyz");

			const transaction = await transactionRepo.findByPaymentPaymentIntentId(
				"pi_xyz"
			);

			expect(transaction).toBeDefined();
			if (transaction) {
				expect(transaction.payment_payment_intent).toBe("pi_xyz");
			}
		});

		test("should get transaction statistics", async () => {
			// Add multiple transactions with different statuses
			await db.execute(`
		  INSERT INTO payment_transactions (
			user_id, package_id, amount, credit_amount, 
			payment_session_id, status, transaction_date, created_at, updated_at
		  )
		  VALUES 
			(2, 1, 4.99, 50, 'sess_1', 'completed', '2023-01-15T12:00:00.000Z', '2023-01-15T12:00:00.000Z', '2023-01-15T12:00:00.000Z'),
			(2, 2, 14.99, 200, 'sess_2', 'pending', '2023-01-16T12:00:00.000Z', '2023-01-16T12:00:00.000Z', '2023-01-16T12:00:00.000Z'),
			(1, 1, 4.99, 50, 'sess_3', 'failed', '2023-01-17T12:00:00.000Z', '2023-01-17T12:00:00.000Z', '2023-01-17T12:00:00.000Z')
		`);

			const stats = await transactionRepo.getTransactionStats();

			expect(stats).toBeDefined();
			// There's already 1 transaction in the test data, plus 3 added = 4
			expect(stats.total).toBe(4);
			// Adjust expectations based on actual DB state
			expect(stats.completed).toBe(2); // There are 2 completed transactions
			expect(stats.pending).toBe(1);
			expect(stats.failed).toBe(1);
			expect(stats.refunded).toBe(0);
			expect(stats.totalAmount).toBe(9.98); // Sum of completed transactions
			expect(stats.totalCredits).toBe(100); // Sum of credits from completed transactions
		});
	});
});
