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
   * Find credits for a user
   * @param userId User ID
   * @param includeExpired Whether to include expired credits
   * @returns Array of user credits
   */
  async findForUser(
    userId: number,
    includeExpired = false
  ): Promise<UserCredit[]> {
    const qb = this.createQueryBuilder();

    // Select all fields
    qb.select(["*"]);

    // Add days remaining calculation
    qb.selectExpression(
      DateExpressions.dateDiff("expiry_date", DateExpressions.currentDateTime(), "day"),
      "days_remaining"
    );

    // Filter by user ID
    qb.whereColumn("user_id", "=", userId);

    // Filter out expired credits if requested
    if (!includeExpired) {
      qb.whereDateColumn("expiry_date", ">=", DateExpressions.currentDateTime());
    }

    // Order by expiry date (soonest first)
    qb.orderBy("expiry_date");

    return qb.execute<UserCredit>();
  }

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
   * Get expiring credits for a user
   * @param userId User ID
   * @param daysThreshold Number of days threshold
   * @returns Array of soon-to-expire credits
   */
  async getExpiringCredits(
    userId: number,
    daysThreshold: number
  ): Promise<UserCredit[]> {
    const qb = this.createQueryBuilder();

    // Select all fields
    qb.select(["*"]);

    // Add days remaining calculation
    qb.selectExpression(
      DateExpressions.dateDiff("expiry_date", DateExpressions.currentDateTime(), "day"),
      "days_remaining"
    );

    // Filter by user ID
    qb.whereColumn("user_id", "=", userId);

    // Filter to only include non-expired credits
    qb.whereDateColumn("expiry_date", ">=", DateExpressions.currentDateTime());

    // Add condition for credits expiring soon
    qb.whereExpression(
      `${DateExpressions.dateDiff("expiry_date", DateExpressions.currentDateTime(), "day")} <= ?`,
      daysThreshold
    );

    // Order by expiry date (soonest first)
    qb.orderBy("expiry_date");

    return qb.execute<UserCredit>();
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
   * Find active credit packages
   * @returns Array of active credit packages
   */
  async findActive(): Promise<CreditPackage[]> {
    // Use findBy with active = true
    return this.db.findBy<CreditPackage>("credit_packages", { active: 1 }, {
      orderBy: [{ field: "price" }]
    });
  }

  /**
   * Find transactions for a user
   * @param userId User ID
   * @returns Array of payment transactions
   */
  async findForUser(userId: number): Promise<PaymentTransaction[]> {
    try {
      const qb = this.createQueryBuilder();

      // Select transaction fields and add package name
      qb.select(["t.*"])
        .from(this.tableName, "t")
        .leftJoin("credit_packages", "p", "t.package_id = p.package_id")
        .selectRaw("p.name as package_name")
        .whereColumn("t.user_id", "=", userId)
        .orderBy("t.transaction_date", "DESC");

      return qb.execute<PaymentTransaction>();
    } catch (error) {
      console.error(`Error finding transactions for user: ${error}`);
      return [];
    }
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
}