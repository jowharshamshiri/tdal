/**
 * Product models
 * Defines product-related entity types
 */

import { BaseRecord } from "./index";
import { ProductCategoryWithMeta } from "./group";

/**
 * Product model
 * Represents a product in the system
 */
export interface Product extends BaseRecord {
  /**
   * Product ID
   */
  product_id: number;

  /**
   * Title text
   */
  title?: string;

  /**
   * Pricing text
   */
  pricing?: string;

  /**
   * Optional hint
   */
  hint?: string | null;

  /**
   * Teaser content shown before purchase
   */
  teaser?: string | null;

  /**
   * Credit cost to access this product
   */
  credit_cost?: number;

  /**
   * Whether this product is free
   */
  is_free: boolean;

  /**
   * ProductCategory IDs (for form handling)
   */
  category_ids?: number[];

  /**
   * Credit information for display
   */
  credit_info?: {
    cost: number;
    remaining_credits: number;
  };

  /**
   * Total times viewed by all users
   */
  total_view_count?: number;

  /**
   * Number of users who bookmarked this
   */
  bookmark_count?: number;

  /**
   * Average time users spend viewing this card (seconds)
   */
  avg_view_time?: number;
}

/**
 * Product with additional metadata
 */
export interface ProductWithMeta extends Product {
  /**
   * Whether the user has access to this product
   */
  has_access?: boolean;

  /**
   * Whether this product requires credits
   */
  requires_credits?: boolean;

  /**
   * Number of categories this product is associated with
   */
  category_count?: number;

  /**
   * Associated categories
   */
  categories?: ProductCategoryWithMeta[];

  /**
   * Credit information
   */
  credit_info?: {
    cost: number;
    remaining_credits: number;
  };

  /**
   * Preview of the pricing (for non-accessible products)
   */
  pricing_preview?: string;

  /**
   * User's remaining credits
   */
  remaining_credits?: number;

  // Current user-specific fields
  /**
   * Whether the user has bookmarked this product
   */
  is_bookmarked?: boolean;

  /**
   * Times viewed by current user
   */
  user_view_count?: number;

  /**
   * When the user last viewed this product
   */
  last_viewed?: string | null;

  /**
   * Total time the user spent viewing this product
   */
  total_view_time?: number;

  /**
   * User's notes on this product
   */
  notes?: string | null;
}

/**
 * User-specific product data
 * Tracks each user's interaction with each product
 */
export interface UserProductData extends BaseRecord {
  /**
   * Data ID
   */
  data_id: number;

  /**
   * User ID
   */
  user_id: number;

  /**
   * Product ID
   */
  product_id: number;

  /**
   * Times viewed by this user
   */
  view_count: number;

  /**
   * When the user last viewed this product
   */
  last_viewed: string;

  /**
   * Total time spent viewing this product
   */
  total_view_time: number;

  /**
   * User's notes on this product
   */
  notes?: string;
}

/**
 * User bookmarked products
 * Tracks which products are bookmarked by which users
 */
export interface UserProductBookmark extends BaseRecord {
  /**
   * Bookmark ID
   */
  bookmark_id: number;

  /**
   * User ID
   */
  user_id: number;

  /**
   * Product ID
   */
  product_id: number;

  /**
   * When the bookmark was created
   */
  created_at: string;

  /**
   * Whether the bookmark has been removed
   */
  removed: boolean;
}

/**
 * Credit check result
 * Result of checking whether a user has enough credits to access a resource
 */
export interface CreditCheckResult {
  /**
   * Whether access is allowed
   */
  allowed: boolean;

  /**
   * Message explaining the result
   */
  message: string;

  /**
   * Cost of the resource
   */
  cost?: number;

  /**
   * User's current balance
   */
  balance?: number;

  /**
   * Credits remaining after purchase
   */
  remainingCredits?: number;
}

/**
 * Product mapping for ORM
 * Defines the mapping between Product entity and database
 */
export const ProductMapping = {
  entity: "Product",
  table: "products",
  idField: "product_id",
  columns: [
    {
      logical: "product_id",
      physical: "product_id",
      primaryKey: true,
      autoIncrement: true,
    },
    { logical: "title", physical: "title" },
    { logical: "pricing", physical: "pricing" },
    { logical: "hint", physical: "hint", nullable: true },
    { logical: "teaser", physical: "teaser", nullable: true },
    { logical: "credit_cost", physical: "credit_cost", nullable: true },
    { logical: "is_free", physical: "is_free" },
    {
      logical: "total_view_count",
      physical: "total_view_count",
      nullable: true,
    },
    { logical: "bookmark_count", physical: "bookmark_count", nullable: true },
    { logical: "avg_view_time", physical: "avg_view_time", nullable: true },
    { logical: "created_at", physical: "created_at" },
    { logical: "updated_at", physical: "updated_at" },
  ],
  relations: [
    {
      name: "categories",
      type: "manyToMany",
      sourceEntity: "Product",
      targetEntity: "ProductCategory",
      sourceColumn: "product_id",
      targetColumn: "category_id",
      junctionTable: "category_product",
      junctionSourceColumn: "product_id",
      junctionTargetColumn: "category_id",
    },
    {
      name: "userBookmarks",
      type: "oneToMany",
      sourceEntity: "Product",
      targetEntity: "UserProductBookmark",
      sourceColumn: "product_id",
      targetColumn: "product_id",
    },
    {
      name: "userData",
      type: "oneToMany",
      sourceEntity: "Product",
      targetEntity: "UserProductData",
      sourceColumn: "product_id",
      targetColumn: "product_id",
    },
  ],
  timestamps: {
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
};

/**
 * UserProductData mapping for ORM
 */
export const UserProductDataMapping = {
  entity: "UserProductData",
  table: "user_product_data",
  idField: "data_id",
  columns: [
    {
      logical: "data_id",
      physical: "data_id",
      primaryKey: true,
      autoIncrement: true,
    },
    { logical: "user_id", physical: "user_id" },
    { logical: "product_id", physical: "product_id" },
    { logical: "view_count", physical: "view_count" },
    { logical: "last_viewed", physical: "last_viewed" },
    { logical: "total_view_time", physical: "total_view_time" },
    { logical: "notes", physical: "notes", nullable: true },
  ],
  relations: [
    {
      name: "user",
      type: "manyToOne",
      sourceEntity: "UserProductData",
      targetEntity: "User",
      sourceColumn: "user_id",
      targetColumn: "user_id",
    },
    {
      name: "product",
      type: "manyToOne",
      sourceEntity: "UserProductData",
      targetEntity: "Product",
      sourceColumn: "product_id",
      targetColumn: "product_id",
    },
  ],
};

/**
 * UserProductBookmark mapping for ORM
 */
export const UserProductBookmarkMapping = {
  entity: "UserProductBookmark",
  table: "user_product_bookmark",
  idField: "bookmark_id",
  columns: [
    {
      logical: "bookmark_id",
      physical: "bookmark_id",
      primaryKey: true,
      autoIncrement: true,
    },
    { logical: "user_id", physical: "user_id" },
    { logical: "product_id", physical: "product_id" },
    { logical: "created_at", physical: "created_at" },
    { logical: "removed", physical: "removed" },
  ],
  relations: [
    {
      name: "user",
      type: "manyToOne",
      sourceEntity: "UserProductBookmark",
      targetEntity: "User",
      sourceColumn: "user_id",
      targetColumn: "user_id",
    },
    {
      name: "product",
      type: "manyToOne",
      sourceEntity: "UserProductBookmark",
      targetEntity: "Product",
      sourceColumn: "product_id",
      targetColumn: "product_id",
    },
  ],
};
