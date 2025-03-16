/**
 * Credit models
 * Defines credit-related entity types
 */

import { BaseRecord } from "./index";
import { UserResourceAccess } from "./user";

/**
 * User credit source
 */
export type CreditSource = "purchase" | "signup_bonus" | "admin_grant";

/**
 * Payment transaction status
 */
export type TransactionStatus = "pending" | "completed" | "failed" | "refunded";

/**
 * User credit
 * Represents a credit balance entry for a user
 */
export interface UserCredit extends BaseRecord {
  /**
   * Credit ID
   */
  credit_id: number;

  /**
   * User ID
   */
  user_id: number;

  /**
   * Credit amount
   */
  amount: number;

  /**
   * Source of the credits
   */
  source: CreditSource;

  /**
   * Transaction ID (if from purchase)
   */
  transaction_id: string | null;

  /**
   * Purchase date
   */
  purchase_date: string;

  /**
   * Expiry date
   */
  expiry_date: string;

  /**
   * Days remaining until expiry
   */
  days_remaining?: number;
}

/**
 * Credit package
 * Represents a purchasable credit package
 */
export interface CreditPackage extends BaseRecord {
  /**
   * Package ID
   */
  package_id: number;

  /**
   * Package name
   */
  name: string;

  /**
   * Package description
   */
  description: string | null;

  /**
   * Credit amount included
   */
  credit_amount: number;

  /**
   * Package price
   */
  price: number;

  /**
   * Days until credits expire
   */
  validity_days: number;

  /**
   * Whether the package is active
   */
  active: boolean;
}

/**
 * Payment transaction
 * Represents a payment for credits
 */
export interface PaymentTransaction extends BaseRecord {
  /**
   * Transaction ID
   */
  transaction_id: number;

  /**
   * User ID
   */
  user_id: number;

  /**
   * Package ID (if applicable)
   */
  package_id: number | null;

  /**
   * Payment amount
   */
  amount: number;

  /**
   * Credit amount purchased
   */
  credit_amount: number;

  /**
   * Payment session ID
   */
  payment_session_id: string | null;

  /**
   * Payment payment intent ID
   */
  payment_payment_intent: string | null;

  /**
   * Transaction status
   */
  status: TransactionStatus;

  /**
   * Transaction date
   */
  transaction_date: string;

  /**
   * Package name (for display)
   */
  package_name?: string;
}

/**
 * Credit balance
 * Aggregated credit information for a user
 */
export interface CreditBalance {
  /**
   * Total credit balance
   */
  total: number;

  /**
   * Credit details
   */
  details: UserCredit[];

  /**
   * Recent access history
   */
  access_history: UserResourceAccess[];
}

/**
 * UserCredit mapping for ORM
 */
export const UserCreditMapping = {
  entity: "UserCredit",
  table: "user_credits",
  idField: "credit_id",
  columns: [
    {
      logical: "credit_id",
      physical: "credit_id",
      primaryKey: true,
      autoIncrement: true,
    },
    { logical: "user_id", physical: "user_id" },
    { logical: "amount", physical: "amount" },
    { logical: "source", physical: "source" },
    { logical: "transaction_id", physical: "transaction_id", nullable: true },
    { logical: "purchase_date", physical: "purchase_date" },
    { logical: "expiry_date", physical: "expiry_date" },
  ],
  relations: [
    {
      name: "user",
      type: "manyToOne",
      sourceEntity: "UserCredit",
      targetEntity: "User",
      sourceColumn: "user_id",
      targetColumn: "user_id",
    },
  ],
};

/**
 * CreditPackage mapping for ORM
 */
export const CreditPackageMapping = {
  entity: "CreditPackage",
  table: "credit_packages",
  idField: "package_id",
  columns: [
    {
      logical: "package_id",
      physical: "package_id",
      primaryKey: true,
      autoIncrement: true,
    },
    { logical: "name", physical: "name" },
    { logical: "description", physical: "description", nullable: true },
    { logical: "credit_amount", physical: "credit_amount" },
    { logical: "price", physical: "price" },
    { logical: "validity_days", physical: "validity_days" },
    { logical: "active", physical: "active" },
    { logical: "created_at", physical: "created_at" },
    { logical: "updated_at", physical: "updated_at" },
  ],
  timestamps: {
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
};

/**
 * PaymentTransaction mapping for ORM
 */
export const PaymentTransactionMapping = {
  entity: "PaymentTransaction",
  table: "payment_transactions",
  idField: "transaction_id",
  columns: [
    {
      logical: "transaction_id",
      physical: "transaction_id",
      primaryKey: true,
      autoIncrement: true,
    },
    { logical: "user_id", physical: "user_id" },
    { logical: "package_id", physical: "package_id", nullable: true },
    { logical: "amount", physical: "amount" },
    { logical: "credit_amount", physical: "credit_amount" },
    {
      logical: "payment_session_id",
      physical: "payment_session_id",
      nullable: true,
    },
    {
      logical: "payment_payment_intent",
      physical: "payment_payment_intent",
      nullable: true,
    },
    { logical: "status", physical: "status" },
    { logical: "transaction_date", physical: "transaction_date" },
    { logical: "created_at", physical: "created_at" },
    { logical: "updated_at", physical: "updated_at" },
  ],
  relations: [
    {
      name: "user",
      type: "manyToOne",
      sourceEntity: "PaymentTransaction",
      targetEntity: "User",
      sourceColumn: "user_id",
      targetColumn: "user_id",
    },
    {
      name: "package",
      type: "manyToOne",
      sourceEntity: "PaymentTransaction",
      targetEntity: "CreditPackage",
      sourceColumn: "package_id",
      targetColumn: "package_id",
    },
  ],
  timestamps: {
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
};

/**
 * UserResourceAccess mapping for ORM
 */
export const UserResourceAccessMapping = {
  entity: "UserResourceAccess",
  table: "user_resource_access",
  idField: "access_id",
  columns: [
    {
      logical: "access_id",
      physical: "access_id",
      primaryKey: true,
      autoIncrement: true,
    },
    { logical: "user_id", physical: "user_id" },
    { logical: "resource_type", physical: "resource_type" },
    { logical: "resource_id", physical: "resource_id" },
    { logical: "credit_cost", physical: "credit_cost" },
    { logical: "access_date", physical: "access_date" },
    { logical: "created_at", physical: "created_at" },
  ],
  relations: [
    {
      name: "user",
      type: "manyToOne",
      sourceEntity: "UserResourceAccess",
      targetEntity: "User",
      sourceColumn: "user_id",
      targetColumn: "user_id",
    },
  ],
  timestamps: {
    createdAt: "created_at",
  },
};
