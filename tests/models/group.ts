/**
 * ProductCategory models
 * Defines category-related entity types
 */

import { BaseRecord } from "./index";
import { Product } from "./product";

/**
 * ProductCategory model
 * Represents a shopping category in the system
 */
export interface ProductCategory extends BaseRecord {
  /**
   * ProductCategory ID
   */
  category_id: number;

  /**
   * ProductCategory name
   */
  category_name: string;

  /**
   * Description of the category
   */
  description: string | null;

  /**
   * Parent category ID (for hierarchical categories)
   */
  parent_id: number | null;

  /**
   * Image URL for the category
   */
  image_url?: string | null;

  /**
   * Parent category name (for display purposes)
   */
  parent_name?: string;
}

/**
 * ProductCategory with additional metadata
 */
export interface ProductCategoryWithMeta extends ProductCategory {
  /**
   * Name of the parent category
   */
  parent_name?: string;

  /**
   * Number of child categories
   */
  child_count?: number;

  /**
   * Number of directly associated products
   */
  direct_product_count?: number;

  /**
   * Total number of products (including descendants)
   */
  total_product_count?: number;
}

/**
 * ProductCategory detail with related data
 */
export interface ProductCategoryDetail extends ProductCategory {
  /**
   * Parent category
   */
  parent?: ProductCategory | null;

  /**
   * Child categories
   */
  children: ProductCategory[];

  /**
   * Total number of descendant categories
   */
  descendant_count: number;

  /**
   * Associated products
   */
  products: Product[];
}

/**
 * ProductCategory-product association
 */
export interface ProductCategoryProduct {
  /**
   * ProductCategory ID
   */
  category_id: number;

  /**
   * Product ID
   */
  product_id: number;
}

/**
 * ProductCategory mapping for ORM
 * Defines the mapping between ProductCategory entity and database
 */
export const ProductCategoryMapping = {
  entity: "ProductCategory",
  table: "categories",
  idField: "category_id",
  columns: [
    {
      logical: "category_id",
      physical: "category_id",
      primaryKey: true,
      autoIncrement: true,
    },
    { logical: "category_name", physical: "category_name" },
    { logical: "description", physical: "description", nullable: true },
    { logical: "parent_id", physical: "parent_id", nullable: true },
    { logical: "image_url", physical: "image_url", nullable: true },
    { logical: "created_at", physical: "created_at" },
    { logical: "updated_at", physical: "updated_at" },
  ],
  relations: [
    {
      name: "parent",
      type: "manyToOne",
      sourceEntity: "ProductCategory",
      targetEntity: "ProductCategory",
      sourceColumn: "parent_id",
      targetColumn: "category_id",
    },
    {
      name: "children",
      type: "oneToMany",
      sourceEntity: "ProductCategory",
      targetEntity: "ProductCategory",
      sourceColumn: "category_id",
      targetColumn: "parent_id",
    },
    {
      name: "products",
      type: "manyToMany",
      sourceEntity: "ProductCategory",
      targetEntity: "Product",
      sourceColumn: "category_id",
      targetColumn: "product_id",
      junctionTable: "category_product",
      junctionSourceColumn: "category_id",
      junctionTargetColumn: "product_id",
    },
  ],
  timestamps: {
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
};

/**
 * ProductCategoryProduct mapping for ORM
 * Defines the mapping for the junction table
 */
export const ProductCategoryProductMapping = {
  entity: "ProductCategoryProduct",
  table: "category_product",
  idField: "", // No single primary key
  columns: [
    { logical: "category_id", physical: "category_id" },
    { logical: "product_id", physical: "product_id" },
  ],
  // No timestamps for junction table
};
