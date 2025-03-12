/**
 * User repository
 * Data access for user-related operations
 */

import { EntityDao } from "../database/orm/entity-dao";
import {
  User,
  UserProfile,
  UserMapping,
  CreditBalance,
  UserCredit,
  UserResourceAccess,
} from "../models";
import { DateExpressions } from "../database/orm/date-functions";
import { EntityQueryBuilder } from "../database/query/entity-query-builder";
import { Relation, OneToManyRelation } from "../database/orm/relation-types";

/**
 * Convert string type relations to proper Relation objects
 */
const typedUserMapping = {
  ...UserMapping,
  relations: (UserMapping.relations || []).map((relation: any): Relation => {
    if (relation.type === "oneToMany") {
      return {
        ...relation,
        type: "oneToMany" as const,
      } as OneToManyRelation;
    }
    throw new Error(`Unknown relation type: ${relation.type}`);
  }),
};

/**
 * Repository for user operations
 */
export class UserRepository extends EntityDao<User> {
  /**
   * Entity mapping for User
   */
  protected readonly entityMapping = typedUserMapping;

  /**
   * Find user by email
   * @param email User email address
   * @returns User if found, undefined otherwise
   */
  async findByEmail(email: string): Promise<User | undefined> {
    return this.findOneBy({ email } as Partial<User>);
  }

  /**
   * Get user credit balance
   * @param userId User ID
   * @returns Credit balance information
   */
  async getCreditBalance(userId: number): Promise<CreditBalance> {
    // Get the total balance
    const currentDateTime = DateExpressions.currentDateTime();

    const balanceQb = this.db.createQueryBuilder();
    balanceQb
      .select("SUM(amount) as balance")
      .from("user_credits")
      .where(`user_id = ? AND expiry_date >= ${currentDateTime}`, userId);

    const balanceResult = await balanceQb.getOne<{ balance: number }>();
    const total = balanceResult?.balance || 0;

    // Get credit details with remaining days
    const detailsQb = this.db.createQueryBuilder();

    // Calculate remaining days using database-agnostic date functions
    const daysDiff = DateExpressions.dateDiff(
      "expiry_date",
      currentDateTime,
      "day"
    );

    detailsQb
      .select([
        "credit_id",
        "user_id",
        "amount",
        "source",
        "transaction_id",
        "purchase_date",
        "expiry_date",
      ])
      .selectRaw(`${daysDiff} as days_remaining`)
      .from("user_credits")
      .where(`user_id = ? AND expiry_date >= ${currentDateTime}`, userId)
      .orderBy("expiry_date", "ASC");

    const details = await detailsQb.execute<UserCredit>();

    // Get access history with resource names
    const historyQb = this.db.createQueryBuilder();

    historyQb
      .select([
        "a.access_id",
        "a.user_id",
        "a.resource_type",
        "a.resource_id",
        "a.credit_cost",
        "a.access_date",
      ])
      .from("user_resource_access", "a")
      .leftJoin(
        "categories",
        "c",
        "a.resource_type = 'category' AND a.resource_id = c.category_id"
      )
      .leftJoin(
        "products",
        "f",
        "a.resource_type = 'product' AND a.resource_id = f.product_id"
      )
      .selectRaw(
        `
        CASE 
          WHEN a.resource_type = 'category' THEN c.category_name 
          WHEN a.resource_type = 'product' THEN f.title 
          ELSE 'Unknown' 
        END as resource_name
      `
      )
      .where("a.user_id = ?", userId)
      .orderBy("a.access_date", "DESC")
      .limit(20);

    const accessHistory = await historyQb.execute<UserResourceAccess>();

    return {
      total,
      details,
      access_history: accessHistory,
    };
  }

  /**
   * Change user password
   * @param userId User ID
   * @param newPasswordHash Hashed new password
   * @returns Number of affected rows
   */
  async changePassword(
    userId: number,
    newPasswordHash: string
  ): Promise<number> {
    return this.update(userId, { password: newPasswordHash } as Partial<User>);
  }

  /**
   * Update user profile information
   * @param userId User ID
   * @param name New name
   * @param email New email
   * @returns Number of affected rows
   */
  async updateProfile(
    userId: number,
    name: string,
    email: string
  ): Promise<number> {
    return this.update(userId, { name, email } as Partial<User>);
  }

  /**
   * Update user's last login timestamp
   * @param userId User ID
   * @returns Number of affected rows
   */
  async updateLastLogin(userId: number): Promise<number> {
    try {
      const lastLogin = new Date().toISOString();
      return this.update(userId, { last_login: lastLogin } as Partial<User>);
    } catch (error) {
      console.error(`Error updating last login: ${error}`);
      return 0;
    }
  }

  /**
   * Find all users with their credit balance
   * @returns Array of users with credit balance
   */
  async findAllWithCreditBalance(): Promise<User[]> {
    try {
      const qb = this.createQueryBuilder() as unknown as EntityQueryBuilder;

      // Select all user fields
      qb.select(["*"]);

      // Add user credit calculation using simpler expression for SQLite
      const creditBalanceQb = this.db.createQueryBuilder();
      creditBalanceQb
        .select("SUM(amount)")
        .from("user_credits", "credits")
        .where("user_id = users.user_id AND expiry_date >= datetime('now')");

      qb.selectRaw(
        `COALESCE((${creditBalanceQb.toSql()}), 0) as credit_balance`
      );

      // Add resource access count
      const resourceAccessQb = this.db.createQueryBuilder();
      resourceAccessQb
        .select("COUNT(*)")
        .from("user_resource_access", "access")
        .where("user_id = users.user_id");

      qb.selectRaw(
        `COALESCE((${resourceAccessQb.toSql()}), 0) as resource_access_count`
      );

      // Order by name
      qb.orderBy("name");

      return qb.execute<User>();
    } catch (error) {
      console.error(`Error finding users with credit balance: ${error}`);
      return [];
    }
  }

  /**
   * Get user profile (public user information)
   * @param userId User ID
   * @returns User profile
   */
  async getUserProfile(userId: number): Promise<UserProfile | undefined> {
    try {
      const user = await this.findById(userId);

      if (!user) {
        return undefined;
      }

      // Extract only the public fields
      const profile: UserProfile = {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role: user.role,
        created_at: user.created_at || "",
        last_login: user.last_login,
      };

      return profile;
    } catch (error) {
      console.error(`Error getting user profile: ${error}`);
      return undefined;
    }
  }

  /**
   * Get a user with recent resource access
   * @param userId User ID
   * @returns User with access history
   */
  async getUserWithAccessHistory(
    userId: number
  ): Promise<Record<string, unknown>> {
    try {
      const user = await this.findById(userId);

      if (!user) {
        return {};
      }

      // Get recent access history with a safer query
      const accessQb = this.db.createQueryBuilder();
      accessQb
        .select(["a.*"])
        .from("user_resource_access", "a")
        .leftJoin(
          "categories",
          "c",
          "a.resource_type = 'category' AND a.resource_id = c.category_id"
        )
        .leftJoin(
          "products",
          "f",
          "a.resource_type = 'product' AND a.resource_id = f.product_id"
        )
        .selectRaw(
          `CASE 
			WHEN a.resource_type = 'category' THEN c.category_name 
			WHEN a.resource_type = 'product' THEN f.title 
			ELSE 'Unknown' 
		  END as resource_name`
        )
        .where("a.user_id = ?", userId)
        .orderBy("a.access_date", "DESC")
        .limit(10);

      const recentAccess = await accessQb.execute<UserResourceAccess>();

      // Get credit balance with a simpler query
      const creditQb = this.db.createQueryBuilder();
      creditQb
        .select("SUM(amount) as credit_balance")
        .from("user_credits")
        .where("user_id = ? AND expiry_date >= datetime('now')", userId);

      const creditResult = await creditQb.getOne<{ credit_balance: number }>();

      return {
        ...user,
        credit_balance: creditResult?.credit_balance || 0,
        recent_access: recentAccess || [],
      };
    } catch (error) {
      console.error(`Error getting user with access history: ${error}`);
      return {};
    }
  }
}
