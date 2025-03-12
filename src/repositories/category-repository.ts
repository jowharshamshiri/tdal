/**
 * ProductCategory repository
 * Data access for category-related operations
 */

import { EntityDao } from "../database/orm/entity-dao";
import {
  ProductCategory,
  ProductCategoryWithMeta,
  ProductCategoryDetail,
  ProductCategoryMapping,
  ProductCategoryProductMapping,
} from "../models";
import { Product } from "../models/product";
import { EntityQueryBuilder } from "../database/query/entity-query-builder";
import {
  Relation,
  ManyToManyRelation,
  OneToManyRelation,
  ManyToOneRelation,
} from "../database/orm/relation-types";

/**
 * Convert string type relations to proper Relation objects
 */
const typedProductCategoryMapping = {
  ...ProductCategoryMapping,
  relations: (ProductCategoryMapping.relations || []).map(
    (relation: any): Relation => {
      if (relation.type === "manyToOne") {
        return {
          ...relation,
          type: "manyToOne" as const,
        } as ManyToOneRelation;
      } else if (relation.type === "oneToMany") {
        return {
          ...relation,
          type: "oneToMany" as const,
        } as OneToManyRelation;
      } else if (relation.type === "manyToMany") {
        return {
          ...relation,
          type: "manyToMany" as const,
        } as ManyToManyRelation;
      }
      throw new Error(`Unknown relation type: ${relation.type}`);
    }
  ),
};

/**
 * Repository for category operations
 */
export class ProductCategoryRepository extends EntityDao<ProductCategory> {
  /**
   * Entity mapping for ProductCategory
   */
  protected readonly entityMapping = typedProductCategoryMapping;

  /**
   * Find all root categories (those without a parent)
   * @returns Array of root categories
   */
  async findRootCategories(): Promise<ProductCategory[]> {
    return this.findBy({ parent_id: null } as Partial<ProductCategory>);
  }

  /**
   * Get the complete category hierarchy
   * @returns Hierarchical tree of categories
   */
  async getProductCategoryHierarchy(): Promise<Record<string, unknown>[]> {
    // Get all categories
    const categories = await this.findAll({
      orderBy: [{ field: "category_name" }],
    });

    // Build hierarchy map
    const productCategoryMap = new Map<number, Record<string, unknown>>();
    const rootCategories: Record<string, unknown>[] = [];

    // First pass: create all nodes
    categories.forEach((category) => {
      productCategoryMap.set(category.category_id, {
        ...category,
        children: [],
      });
    });

    // Second pass: build the tree
    categories.forEach((category) => {
      const node = productCategoryMap.get(category.category_id);

      if (category.parent_id === null) {
        // Root category
        rootCategories.push(node || {});
      } else {
        // Child category - add to parent's children array
        const parent = productCategoryMap.get(category.parent_id);
        if (parent) {
          (parent.children as Record<string, unknown>[]).push(node || {});
        } else {
          // Orphaned node (parent doesn't exist) - add to root
          rootCategories.push(node || {});
        }
      }
    });

    return rootCategories;
  }

  /**
   * Find all categories with metadata
   * @returns Array of categories with metadata
   */
  async findAllWithMeta(): Promise<ProductCategoryWithMeta[]> {
    // Use query builder for this complex query
    const qb = this.createQueryBuilder() as unknown as EntityQueryBuilder;

    // Select all category fields, add table alias
    qb.select(["c.*"]).from(this.tableName, "c");

    // Join with parent categories
    qb.leftJoin("categories", "p", "c.parent_id = p.category_id");
    qb.selectRaw("p.category_name as parent_name");

    // Get child count using subquery
    const childCountQb = this.db.createQueryBuilder();
    childCountQb
      .select("COUNT(*)")
      .from("categories", "c2")
      .where("c2.parent_id = c.category_id");

    qb.selectRaw(`(${childCountQb.toSql()}) as child_count`);

    // Get direct product count using subquery
    const productCountQb = this.db.createQueryBuilder();
    productCountQb
      .select("COUNT(*)")
      .from("category_product", "cf")
      .where("cf.category_id = c.category_id");

    qb.selectRaw(`(${productCountQb.toSql()}) as direct_product_count`);

    // Order by name
    qb.orderBy("c.category_name");

    // Execute query
    return qb.execute<ProductCategoryWithMeta>();
  }

  /**
   * Search categories by name
   * @param searchTerm Search term
   * @returns Array of matching categories
   */
  async searchByName(searchTerm: string): Promise<ProductCategory[]> {
    const qb = this.createQueryBuilder() as unknown as EntityQueryBuilder;

    // Select all fields with table alias
    qb.select(["c.*"]).from(this.tableName, "c");

    // Join with parent category for parent name
    qb.leftJoin("categories", "p", "c.parent_id = p.category_id");
    qb.selectRaw("p.category_name as parent_name");

    // Search by name
    qb.where(`c.category_name LIKE ?`, `%${searchTerm}%`);

    // Order by name
    qb.orderBy("c.category_name");

    return qb.execute<ProductCategory>();
  }

  /**
   * Find categories by parent ID
   * @param parentId Parent category ID
   * @returns Array of child categories
   */
  async findByParentId(parentId: number): Promise<ProductCategory[]> {
    try {
      return this.findBy({ parent_id: parentId } as Partial<ProductCategory>);
    } catch (error) {
      console.error(`Error finding categories by parent ID: ${error}`);
      return [];
    }
  }

  /**
   * Get category detail with parent, children, and products
   * @param productCategoryId ProductCategory ID
   * @returns ProductCategory detail with related data
   */
  async getProductCategoryDetail(
    productCategoryId: number
  ): Promise<ProductCategoryDetail | undefined> {
    try {
      // Get base category information
      const category = await this.findById(productCategoryId);

      if (!category) {
        return undefined;
      }

      // Get parent category if exists
      let parent: ProductCategory | null = null;
      if (category.parent_id) {
        parent = (await this.findById(category.parent_id)) || null;
      }

      // Get direct children
      const children = await this.findBy(
        { parent_id: productCategoryId } as Partial<ProductCategory>,
        {
          orderBy: [{ field: "category_name" }],
        }
      );

      // Simplified approach to count descendants
      const descendantCountQb = this.db.createQueryBuilder();
      descendantCountQb
        .select("COUNT(*) as count")
        .from("categories")
        .where(
          "parent_id = ? OR parent_id IN (SELECT category_id FROM categories WHERE parent_id = ?)",
          productCategoryId,
          productCategoryId
        );

      const descendantCountResult = await descendantCountQb.getOne<{
        count: number;
      }>();

      // Get products directly using query builder instead of findRelated
      const productsQb = this.db.createQueryBuilder();
      productsQb
        .select(["f.*"])
        .from("products", "f")
        .innerJoin("category_product", "cf", "f.product_id = cf.product_id")
        .where("cf.category_id = ?", productCategoryId);

      const products = await productsQb.execute<Product>();

      return {
        ...category,
        parent,
        children,
        descendant_count: descendantCountResult?.count || 0,
        products,
      };
    } catch (error) {
      console.error(`Error getting category detail: ${error}`);
      return undefined;
    }
  }

  /**
   * Add a product to a category
   * @param productCategoryId ProductCategory ID
   * @param productId Product ID
   * @returns Whether the operation succeeded
   */
  async addProduct(
    productCategoryId: number,
    productId: number
  ): Promise<boolean> {
    try {
      // First check if category exists
      const productCategoryExists = await this.exists(productCategoryId);
      if (!productCategoryExists) {
        throw new Error("ProductCategory not found");
      }

      // Then check if the relationship already exists
      const existingQb = this.db.createQueryBuilder();
      existingQb
        .select("COUNT(*) as count")
        .from("category_product")
        .where(
          "category_id = ? AND product_id = ?",
          productCategoryId,
          productId
        );

      const existingResult = await existingQb.getOne<{ count: number }>();

      if (existingResult && existingResult.count > 0) {
        // Already exists, return success
        return true;
      }

      await this.db.insert("category_product", {
        category_id: productCategoryId,
        product_id: productId,
      });

      return true;
    } catch (error) {
      console.error("Error adding product to category:", error);
      return false;
    }
  }

  /**
   * Remove a product from a category
   * @param productCategoryId ProductCategory ID
   * @param productId Product ID
   * @returns Whether the operation succeeded
   */
  async removeProduct(
    productCategoryId: number,
    productId: number
  ): Promise<boolean> {
    try {
      const result = await this.db.execute(
        "DELETE FROM category_product WHERE category_id = ? AND product_id = ?",
        productCategoryId,
        productId
      );

      return result.changes ? result.changes > 0 : false;
    } catch (error) {
      console.error("Error removing product from category:", error);
      return false;
    }
  }

  /**
   * Get category product counts
   * @param productCategoryId ProductCategory ID
   * @returns Direct and total product counts
   */
  async getProductCounts(
    productCategoryId: number
  ): Promise<{ direct: number; total: number }> {
    try {
      // Direct count
      const directCountQb = this.db.createQueryBuilder();
      directCountQb
        .select("COUNT(*) as count")
        .from("category_product")
        .where("category_id = ?", productCategoryId);

      const directResult = await directCountQb.getOne<{ count: number }>();
      const directCount = directResult?.count || 0;

      // Total count (simplified approach)
      const totalCountQb = this.db.createQueryBuilder();
      totalCountQb
        .select("COUNT(*) as count")
        .from("category_product", "cf")
        .where(
          "cf.category_id = ? OR cf.category_id IN (SELECT category_id FROM categories WHERE parent_id = ?)",
          productCategoryId,
          productCategoryId
        );

      const totalResult = await totalCountQb.getOne<{ count: number }>();
      const totalCount = totalResult?.count || 0;

      return {
        direct: directCount,
        total: totalCount,
      };
    } catch (error) {
      console.error(`Error getting product counts: ${error}`);
      return { direct: 0, total: 0 };
    }
  }
}
