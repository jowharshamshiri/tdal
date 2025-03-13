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
		// Get total balance by aggregating active credits
		const qb = this.createQueryBuilder();
		qb.from("user_credits")
			.whereColumn("user_id", "=", userId)
			.whereDateColumn("expiry_date", ">=", DateExpressions.currentDateTime());

		const totalBalance = await qb.aggregate("SUM", "amount", "total", false);
		const total = totalBalance[0]?.total || 0;

		// Get detailed credit information with days remaining
		const creditQb = this.createQueryBuilder();
		creditQb.from("user_credits", "uc")
			.whereColumn("user_id", "=", userId)
			.whereDateColumn("expiry_date", ">=", DateExpressions.currentDateTime())
			.selectExpression(
				DateExpressions.dateDiff("expiry_date", DateExpressions.currentDateTime(), "day"),
				"days_remaining"
			)
			.orderBy("expiry_date", "ASC");

		const details = await creditQb.execute<UserCredit>();

		// Get recent access history with resource names
		const accessQb = this.createQueryBuilder();
		accessQb.from("user_resource_access", "a")
			.whereColumn("user_id", "=", userId)
			.leftJoin("categories", "c", "a.resource_type = 'category' AND a.resource_id = c.category_id")
			.leftJoin("products", "f", "a.resource_type = 'product' AND a.resource_id = f.product_id")
			.selectExpression(
				`CASE 
          WHEN a.resource_type = 'category' THEN c.category_name 
          WHEN a.resource_type = 'product' THEN f.title 
          ELSE 'Unknown' 
        END`,
				"resource_name"
			)
			.orderBy("a.access_date", "DESC")
			.limit(20);

		const accessHistory = await accessQb.execute<UserResourceAccess>();

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
	 * Fix for getUserWithAccessHistory method
	 * Properly handles CASE expressions and table references
	 */
	async getUserWithAccessHistory(
		userId: number
	): Promise<Record<string, unknown>> {
		try {
			// Get user
			const user = await this.findById(userId);
			if (!user) {
				return {};
			}

			// Get recent access history with resource names
			const accessQb = this.createQueryBuilder();
			accessQb.select(["a.*"])
				.from("user_resource_access", "a")
				.where(`a.user_id = ?`, userId)
				.leftJoin("categories", "c", "a.resource_type = 'category' AND a.resource_id = c.category_id")
				.leftJoin("products", "f", "a.resource_type = 'product' AND a.resource_id = f.product_id")
				// Use raw SQL expression for CASE statement to avoid parameterization issues
				.selectRaw(
					`CASE 
			WHEN a.resource_type = 'category' THEN c.category_name 
			WHEN a.resource_type = 'product' THEN f.title 
			ELSE 'Unknown' 
		  END as resource_name`
				)
				.orderBy("a.access_date", "DESC")
				.limit(10);

			const recentAccess = await accessQb.execute<UserResourceAccess>();

			// Get credit balance
			const creditQb = this.createQueryBuilder();
			creditQb.select(["SUM(amount) as credit_balance"])
				.from("user_credits", "uc")
				.where(`uc.user_id = ?`, userId)
				.whereDateColumn("expiry_date", ">=", DateExpressions.currentDateTime());

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

	/**
	 * Fix for findAllWithCreditBalance method
	 * Properly handles expressions and subqueries
	 */
	async findAllWithCreditBalance(): Promise<User[]> {
		try {
			const qb = this.createQueryBuilder();

			// Select all user fields
			qb.select(["*"]);

			// Add credit balance calculation - use subquery rather than expression
			const creditBalanceExpression = DateExpressions.currentDateTime();
			qb.selectRaw(
				`(SELECT COALESCE(SUM(amount), 0) FROM user_credits 
		  WHERE user_id = users.user_id 
		  AND expiry_date >= ${creditBalanceExpression}) as credit_balance`
			);

			// Add resource access count as a subquery
			qb.selectRaw(
				`(SELECT COUNT(*) FROM user_resource_access 
		  WHERE user_id = users.user_id) as resource_access_count`
			);

			// Set the correct table
			qb.from("users");

			// Order by name
			qb.orderBy("name");

			return qb.execute<User>();
		} catch (error) {
			console.error(`Error finding users with credit balance: ${error}`);
			return [];
		}
	}



}