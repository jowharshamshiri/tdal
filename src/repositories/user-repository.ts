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

	// Fix for getCreditBalance method
	async getCreditBalance(userId: number): Promise<CreditBalance> {
		try {
			// Get total balance
			const totalResult = await this.db.querySingle<{ total: number }>(
				`SELECT SUM(amount) as total FROM user_credits 
		 WHERE user_id = ? AND expiry_date >= datetime('now')`,
				userId
			);

			const total = totalResult?.total || 0;

			// Get detailed credit information with days remaining
			const details = await this.db.query<UserCredit>(
				`SELECT uc.*, 
		 (julianday(expiry_date) - julianday('now')) as days_remaining 
		 FROM user_credits uc
		 WHERE user_id = ? AND expiry_date >= datetime('now')
		 ORDER BY expiry_date ASC`,
				userId
			);

			// Get recent access history with resource names
			const accessHistory = await this.db.query<UserResourceAccess>(
				`SELECT a.*, 
		 CASE 
		   WHEN a.resource_type = 'category' THEN c.category_name 
		   WHEN a.resource_type = 'product' THEN f.title 
		   ELSE 'Unknown' 
		 END as resource_name
		 FROM user_resource_access a
		 LEFT JOIN categories c ON a.resource_type = 'category' AND a.resource_id = c.category_id
		 LEFT JOIN products f ON a.resource_type = 'product' AND a.resource_id = f.product_id
		 WHERE a.user_id = ?
		 ORDER BY a.access_date DESC
		 LIMIT 20`,
				userId
			);

			return {
				total,
				details,
				access_history: accessHistory,
			};
		} catch (error) {
			console.error(`Error getting credit balance: ${error}`);
			return {
				total: 0,
				details: [],
				access_history: []
			};
		}
	}

	// Fix for getUserWithAccessHistory method
	async getUserWithAccessHistory(userId: number): Promise<Record<string, unknown>> {
		try {
			// Get user
			const user = await this.findById(userId);
			if (!user) {
				return {};
			}

			// Get credit balance
			const creditResult = await this.db.querySingle<{ credit_balance: number }>(
				`SELECT SUM(amount) as credit_balance 
		 FROM user_credits 
		 WHERE user_id = ? AND expiry_date >= datetime('now')`,
				userId
			);

			// Get recent access history with resource names
			const recentAccess = await this.db.query<UserResourceAccess>(
				`SELECT a.*, 
		 CASE 
		   WHEN a.resource_type = 'category' THEN c.category_name 
		   WHEN a.resource_type = 'product' THEN f.title 
		   ELSE 'Unknown' 
		 END as resource_name
		 FROM user_resource_access a
		 LEFT JOIN categories c ON a.resource_type = 'category' AND a.resource_id = c.category_id
		 LEFT JOIN products f ON a.resource_type = 'product' AND a.resource_id = f.product_id
		 WHERE a.user_id = ?
		 ORDER BY a.access_date DESC
		 LIMIT 10`,
				userId
			);

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

	// Fix for findAllWithCreditBalance method
	async findAllWithCreditBalance(): Promise<User[]> {
		try {
			return this.db.query<User>(
				`SELECT u.*, 
		 (SELECT COALESCE(SUM(amount), 0) FROM user_credits 
		  WHERE user_id = u.user_id 
		  AND expiry_date >= datetime('now')) as credit_balance,
		 (SELECT COUNT(*) FROM user_resource_access 
		  WHERE user_id = u.user_id) as resource_access_count
		 FROM users u
		 ORDER BY u.name`
			);
		} catch (error) {
			console.error(`Error finding users with credit balance: ${error}`);
			return [];
		}
	}

}