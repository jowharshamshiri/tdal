/**
 * Credit repositories
 * Data access for credit-related operations
 */

import { EntityDao } from "../database/orm/entity-dao";
import {
	CreditPackage,
	UserCredit,
	PaymentTransaction,
	CreditPackageMapping,
	UserCreditMapping,
	PaymentTransactionMapping,
	CreditSource,
} from "../models";
import { DateExpressions } from "../database/orm/date-functions";
import { EntityQueryBuilder } from "../database/query/entity-query-builder";
import { Relation, ManyToOneRelation } from "../database/orm/relation-types";
import { DatabaseAdapter } from "@/database";

/**
 * Convert string type relations to proper Relation objects
 */
const typedUserCreditMapping = {
	...UserCreditMapping,
	relations: (UserCreditMapping.relations || []).map(
		(relation: any): Relation => {
			if (relation.type === "manyToOne") {
				return {
					...relation,
					type: "manyToOne" as const,
				} as ManyToOneRelation;
			}
			throw new Error(`Unknown relation type: ${relation.type}`);
		}
	),
};

/**
 * Convert string type relations to proper Relation objects for PaymentTransaction
 */
const typedPaymentTransactionMapping = {
	...PaymentTransactionMapping,
	relations: (PaymentTransactionMapping.relations || []).map(
		(relation: any): Relation => {
			if (relation.type === "manyToOne") {
				return {
					...relation,
					type: "manyToOne" as const,
				} as ManyToOneRelation;
			}
			throw new Error(`Unknown relation type: ${relation.type}`);
		}
	),
};

/**
 * Repository for credit package operations
 */
export class CreditPackageRepository extends EntityDao<CreditPackage> {
	/**
	 * Entity mapping for CreditPackage
	 */
	protected readonly entityMapping = CreditPackageMapping;

	/**
	 * Find active credit packages
	 * @returns Array of active credit packages
	 */
	async findActive(): Promise<CreditPackage[]> {
		return this.findBy({ active: true } as unknown as Partial<CreditPackage>, {
			orderBy: [{ field: "price" }]
		});
	}

	/**
	 * Get credit package by ID with validation
	 * @param packageId Package ID
	 * @returns Credit package if found and active
	 */
	async getActivePackage(
		packageId: number
	): Promise<CreditPackage | undefined> {
		const pkg = await this.findById(packageId);

		if (!pkg || !pkg.active) {
			return undefined;
		}

		return pkg;
	}

	/**
	 * Create a new credit package
	 * @param packageData Package data
	 * @returns Created package ID
	 */
	async createPackage(
		packageData: Omit<CreditPackage, "package_id" | "created_at" | "updated_at">
	): Promise<number> {
		// Create a clean copy of the data
		const cleanData = { ...packageData };

		// Let the ORM handle the boolean conversion
		return this.create(cleanData);
	}

	/**
	 * Update a credit package
	 * @param packageId Package ID
	 * @param packageData Package data
	 * @returns Whether the update was successful
	 */
	async updatePackage(
		packageId: number,
		packageData: Partial<CreditPackage>
	): Promise<boolean> {
		try {
			const result = await this.update(packageId, packageData);
			return result > 0;
		} catch (error) {
			console.error("Error updating credit package:", error);
			return false;
		}
	}

	/**
	 * Deactivate a credit package
	 * @param packageId Package ID
	 * @returns Whether the deactivation was successful
	 */
	async deactivatePackage(packageId: number): Promise<boolean> {
		try {
			const result = await this.update(packageId, {
				active: false
			} as unknown as Partial<CreditPackage>);

			return result > 0;
		} catch (error) {
			console.error("Error deactivating credit package:", error);
			return false;
		}
	}
}

/**
 * Repository for user credit operations
 */
export class UserCreditRepository extends EntityDao<UserCredit> {
	/**
	 * Entity mapping for UserCredit
	 */
	protected readonly entityMapping = typedUserCreditMapping;

	/**
	 * Get available credit balance for a user
	 * @param userId User ID
	 * @returns Available credit balance
	 */
	async getBalance(userId: number): Promise<number> {
		const result = await this.aggregate({
			aggregates: [
				{ function: "SUM", field: "amount", alias: "balance" }
			],
			conditions: {
				user_id: userId
			},
			having: `expiry_date >= ${DateExpressions.currentDateTime()}`
		});

		return result[0]?.balance as number || 0;
	}

	/**
	 * Add credits to a user
	 * @param userId User ID
	 * @param amount Credit amount
	 * @param source Source of credits
	 * @param transactionId Optional transaction ID
	 * @param validityDays Days until expiry
	 * @returns ID of the new credit record
	 */
	async addCredits(
		userId: number,
		amount: number,
		source: CreditSource,
		transactionId: string | null = null,
		validityDays = 365
	): Promise<number> {
		const now = new Date();
		const expiryDate = new Date(now);
		expiryDate.setDate(expiryDate.getDate() + validityDays);

		const creditData: Partial<UserCredit> = {
			user_id: userId,
			amount,
			source,
			transaction_id: transactionId,
			purchase_date: now.toISOString(),
			expiry_date: expiryDate.toISOString(),
		};

		return this.create(creditData);
	}

	/**
	 * Get total credits by source
	 * @param userId User ID
	 * @returns Object with totals by source
	 */
	async getTotalsBySource(
		userId: number
	): Promise<Record<CreditSource, number>> {
		const results = await this.aggregate({
			aggregates: [
				{ function: "SUM", field: "amount", alias: "total" }
			],
			groupBy: ["source"],
			conditions: {
				user_id: userId
			}
		}) as { source: CreditSource; total: number }[];

		// Convert to record object
		const totals: Record<CreditSource, number> = {
			purchase: 0,
			signup_bonus: 0,
			admin_grant: 0,
		};

		results.forEach((result) => {
			totals[result.source] = result.total;
		});

		return totals;
	}



	/**
	 * Fix for findForUser method in UserCreditRepository
	 * Avoids issues with DateExpressions in WHERE clauses
	 */
	async findForUser(
		userId: number,
		includeExpired = false
	): Promise<UserCredit[]> {
		const qb = this.createQueryBuilder();

		// Select all fields
		qb.select(["*"]);

		// Add days remaining calculation - use subquery approach to avoid parameter issues
		const currentDateTimeExpr = DateExpressions.currentDateTime();
		qb.selectRaw(
			`(CAST((julianday(expiry_date) - julianday(${currentDateTimeExpr})) AS INTEGER)) as days_remaining`
		);

		// Filter by user ID
		qb.where(`user_id = ?`, userId);

		// Filter out expired credits if requested
		if (!includeExpired) {
			qb.andWhere(`expiry_date >= ${currentDateTimeExpr}`);
		}

		// Order by expiry date (soonest first)
		qb.orderBy("expiry_date");

		return qb.execute<UserCredit>();
	}

	/**
	 * Fix for getExpiringCredits method in UserCreditRepository
	 * Avoids issues with DateExpressions and complex WHERE clauses
	 */
	async getExpiringCredits(
		userId: number,
		daysThreshold: number
	): Promise<UserCredit[]> {
		const qb = this.createQueryBuilder();

		// Select all fields
		qb.select(["*"]);

		// Add days remaining calculation using raw SQL 
		const currentDateTimeExpr = DateExpressions.currentDateTime();
		qb.selectRaw(
			`(CAST((julianday(expiry_date) - julianday(${currentDateTimeExpr})) AS INTEGER)) as days_remaining`
		);

		// Filter by user ID
		qb.where(`user_id = ?`, userId);

		// Filter to only include non-expired credits
		qb.andWhere(`expiry_date >= ${currentDateTimeExpr}`);

		// Add condition for credits expiring soon - use explicit calculation
		qb.andWhere(
			`(CAST((julianday(expiry_date) - julianday(${currentDateTimeExpr})) AS INTEGER)) <= ?`,
			daysThreshold
		);

		// Order by expiry date (soonest first)
		qb.orderBy("expiry_date");

		return qb.execute<UserCredit>();
	}




}

/**
 * Repository for payment transaction operations
 */
export class PaymentTransactionRepository extends EntityDao<PaymentTransaction> {
	/**
	 * Entity mapping for PaymentTransaction
	 */
	protected readonly entityMapping = typedPaymentTransactionMapping;

	/**
	 * Create a new payment transaction
	 * @param userId User ID
	 * @param packageId Package ID
	 * @param amount Payment amount
	 * @param creditAmount Credit amount
	 * @param paymentSessionId Payment session ID
	 * @returns ID of the new transaction
	 */
	async createTransaction(
		userId: number,
		packageId: number,
		amount: number,
		creditAmount: number,
		paymentSessionId: string
	): Promise<number> {
		const transactionData: Partial<PaymentTransaction> = {
			user_id: userId,
			package_id: packageId,
			amount,
			credit_amount: creditAmount,
			payment_session_id: paymentSessionId,
			status: "pending",
			transaction_date: new Date().toISOString(),
		};

		return this.create(transactionData);
	}

	/**
	 * Update transaction status
	 * @param transactionId Transaction ID
	 * @param status New status
	 * @param paymentIntentId Optional Payment payment intent ID
	 * @returns Whether the operation succeeded
	 */
	async updateStatus(
		transactionId: number,
		status: "pending" | "completed" | "failed" | "refunded",
		paymentIntentId?: string
	): Promise<boolean> {
		try {
			const updateData: Partial<PaymentTransaction> = { status };

			if (paymentIntentId) {
				updateData.payment_payment_intent = paymentIntentId;
			}

			await this.update(transactionId, updateData);
			return true;
		} catch (error) {
			console.error("Error updating transaction status:", error);
			return false;
		}
	}

	/**
	 * Complete a transaction and add credits to user
	 * @param transactionId Transaction ID
	 * @param paymentIntentId Payment payment intent ID
	 * @param validityDays Days until credits expire
	 * @returns Whether the operation succeeded
	 */
	async completeTransaction(
		transactionId: number,
		paymentIntentId: string,
		validityDays = 365
	): Promise<boolean> {
		return this.transaction(async (dao: this) => {
			try {
				// Get transaction data
				const txDao = new PaymentTransactionRepository(this.db);
				const transaction = await txDao.findById(transactionId);

				if (!transaction) {
					throw new Error(`Transaction ${transactionId} not found`);
				}

				// Update transaction status
				await txDao.updateStatus(transactionId, "completed", paymentIntentId);

				// Add credits to user
				const creditDao = new UserCreditRepository(this.db);
				await creditDao.addCredits(
					transaction.user_id,
					transaction.credit_amount,
					"purchase",
					transactionId.toString(),
					validityDays
				);

				return true;
			} catch (error) {
				console.error("Error completing transaction:", error);
				return false;
			}
		});
	}

	/**
	 * Get transaction by Payment session ID
	 * @param sessionId Payment session ID
	 * @returns Transaction if found
	 */
	async findByPaymentSessionId(
		sessionId: string
	): Promise<PaymentTransaction | undefined> {
		return this.findOneBy({
			payment_session_id: sessionId,
		} as Partial<PaymentTransaction>);
	}

	/**
	 * Get transaction by Payment payment intent ID
	 * @param paymentIntentId Payment payment intent ID
	 * @returns Transaction if found
	 */
	async findByPaymentPaymentIntentId(
		paymentIntentId: string
	): Promise<PaymentTransaction | undefined> {
		return this.findOneBy({
			payment_payment_intent: paymentIntentId,
		} as Partial<PaymentTransaction>);
	}


	/**
	 * Get transaction statistics
	 * @param userId Optional user ID to filter by
	 * @returns Transaction statistics
	 */
	async getTransactionStats(userId?: number): Promise<{
		total: number;
		completed: number;
		failed: number;
		pending: number;
		refunded: number;
		totalAmount: number;
		totalCredits: number;
	}> {
		try {
			// Get total count
			const totalCount = userId
				? await this.count({ user_id: userId })
				: await this.count();

			// Get counts by status
			const statusCounts: Record<string, number> = {};
			const statuses = ["completed", "pending", "failed", "refunded"];

			for (const status of statuses) {
				const conditions = userId
					? { status, user_id: userId }
					: { status };

				statusCounts[status] = await this.count(conditions as Partial<PaymentTransaction>);
			}

			// Get total amount and credits for completed transactions
			const completedConditions = userId
				? { status: "completed", user_id: userId }
				: { status: "completed" };

			const aggregateResults = await this.aggregate({
				aggregates: [
					{ function: "SUM", field: "amount", alias: "total_amount" },
					{ function: "SUM", field: "credit_amount", alias: "total_credits" }
				],
				conditions: completedConditions
			});

			return {
				total: totalCount,
				completed: statusCounts.completed,
				failed: statusCounts.failed,
				pending: statusCounts.pending,
				refunded: statusCounts.refunded,
				totalAmount: aggregateResults[0]?.total_amount as number || 0,
				totalCredits: aggregateResults[0]?.total_credits as number || 0,
			};
		} catch (error) {
			console.error(`Error getting transaction stats: ${error}`);
			return {
				total: 0,
				completed: 0,
				failed: 0,
				pending: 0,
				refunded: 0,
				totalAmount: 0,
				totalCredits: 0,
			};
		}
	}


	/**
	 * Fix for CreditPackageRepository.findActive() method
	 * Issue: boolean parameter handling
	 */
	async findActive(): Promise<CreditPackage[]> {
		// Using direct query with correct parameter type (1 instead of true)
		return this.db.query<CreditPackage>(
			`SELECT * FROM credit_packages WHERE active = 1 ORDER BY price`
		);
	}

	/**
	 * Fix for UserCreditRepository.findForUser() method
	 * Issue: Syntax error in WHERE clause with date expression
	 */
	async findForUser(
		userId: number,
		includeExpired = false
	): Promise<UserCredit[]> {
		let query = `
	  SELECT uc.*, 
	  (julianday(expiry_date) - julianday('now')) as days_remaining
	  FROM user_credits uc
	  WHERE uc.user_id = ?
	`;

		// Add expiry filter if needed
		if (!includeExpired) {
			query += ` AND uc.expiry_date >= datetime('now')`;
		}

		// Add ordering
		query += ` ORDER BY uc.expiry_date`;

		return this.db.query<UserCredit>(query, userId);
	}

	/**
	 * Fix for UserCreditRepository.getExpiringCredits() method
	 * Issue: Syntax error in WHERE clause with date expression and calculations
	 */
	async getExpiringCredits(
		userId: number,
		daysThreshold: number
	): Promise<UserCredit[]> {
		const query = `
	  SELECT uc.*, 
	  (julianday(expiry_date) - julianday('now')) as days_remaining
	  FROM user_credits uc
	  WHERE uc.user_id = ?
	  AND uc.expiry_date >= datetime('now')
	  AND (julianday(expiry_date) - julianday('now')) <= ?
	  ORDER BY uc.expiry_date
	`;

		return this.db.query<UserCredit>(query, userId, daysThreshold);
	}
}