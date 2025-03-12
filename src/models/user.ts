/**
 * User models
 * Defines user-related entity types
 */

import { BaseRecord, ResourceType } from "./index";

/**
 * User role type
 */
export type UserRole = "user" | "admin";

/**
 * User model
 * Represents a user in the system
 */
export interface User extends BaseRecord {
  /**
   * User ID
   */
  user_id: number;

  /**
   * User's full name
   */
  name: string;

  /**
   * User's email address
   */
  email: string;

  /**
   * Hashed password
   */
  password: string;

  /**
   * User role
   */
  role: UserRole;

  /**
   * Account creation timestamp
   */
  created_at: string;

  /**
   * Last login timestamp
   */
  last_login: string | null;

  /**
   * Current credit balance (calculated field)
   */
  credit_balance?: number;
}

/**
 * User profile
 * Public user information (excludes sensitive data)
 */
export interface UserProfile {
  /**
   * User ID
   */
  user_id: number;

  /**
   * User's full name
   */
  name: string;

  /**
   * User's email address
   */
  email: string;

  /**
   * User role
   */
  role: UserRole;

  /**
   * Account creation timestamp
   */
  created_at: string;

  /**
   * Last login timestamp
   */
  last_login: string | null;
}

/**
 * User resource access record
 * Tracks which resources a user has access to
 */
export interface UserResourceAccess extends BaseRecord {
  /**
   * Access ID
   */
  access_id: number;

  /**
   * User ID
   */
  user_id: number;

  /**
   * Resource type (category, product, etc.)
   */
  resource_type: ResourceType;

  /**
   * Resource ID
   */
  resource_id: number;

  /**
   * Credit cost paid for access
   */
  credit_cost: number;

  /**
   * Timestamp when access was granted
   */
  access_date: string;

  /**
   * Resource name (for display purposes)
   */
  resource_name?: string;
}

/**
 * User preferences
 * Stores user-specific settings
 */
export interface UserPreferences {
  /**
   * User ID
   */
  user_id: number;

  /**
   * Theme preference
   */
  theme: "light" | "dark" | "system";

  /**
   * Email notification settings
   */
  notifications: {
    /**
     * New content notifications
     */
    new_content: boolean;

    /**
     * Marketing emails
     */
    marketing: boolean;

    /**
     * Credit balance alerts
     */
    credit_alerts: boolean;
  };

  /**
   * Shopping session defaults
   */
  shopping_defaults: {
    /**
     * Cards per session
     */
    cards_per_session: number;

    /**
     * Auto-shuffle cards
     */
    shuffle: boolean;

    /**
     * Show hints by default
     */
    show_hints: boolean;
  };
}

/**
 * User mapping for ORM
 * Defines the mapping between User entity and database
 */
export const UserMapping = {
  entity: "User",
  table: "users",
  idField: "user_id",
  columns: [
    {
      logical: "user_id",
      physical: "user_id",
      primaryKey: true,
      autoIncrement: true,
    },
    { logical: "name", physical: "name" },
    { logical: "email", physical: "email", unique: true },
    { logical: "password", physical: "password" },
    { logical: "role", physical: "role" },
    { logical: "created_at", physical: "created_at" },
    { logical: "last_login", physical: "last_login", nullable: true },
  ],
  relations: [
    {
      name: "credits",
      type: "oneToMany",
      sourceEntity: "User",
      targetEntity: "UserCredit",
      sourceColumn: "user_id",
      targetColumn: "user_id",
    },
    {
      name: "resourceAccess",
      type: "oneToMany",
      sourceEntity: "User",
      targetEntity: "UserResourceAccess",
      sourceColumn: "user_id",
      targetColumn: "user_id",
    },
    {
      name: "shoppingSessions",
      type: "oneToMany",
      sourceEntity: "User",
      targetEntity: "ProductShoppingSession",
      sourceColumn: "user_id",
      targetColumn: "user_id",
    },
  ],
  timestamps: {
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
};
