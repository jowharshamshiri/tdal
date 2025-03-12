/**
 * Product repository
 * Data access for product-related operations
 */

import { EntityDao } from "../database/orm/entity-dao";
import {
  Product,
  ProductWithMeta,
  CreditCheckResult,
  ProductCategoryWithMeta,
  ProductMapping,
} from "../models";
import { DateExpressions } from "../database/orm/date-functions";
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
const typedProductMapping = {
  ...ProductMapping,
  relations: (ProductMapping.relations || []).map((relation: any): Relation => {
    if (relation.type === "manyToMany") {
      return {
        ...relation,
        type: "manyToMany" as const,
      } as ManyToManyRelation;
    } else if (relation.type === "oneToMany") {
      return {
        ...relation,
        type: "oneToMany" as const,
      } as OneToManyRelation;
    } else if (relation.type === "manyToOne") {
      return {
        ...relation,
        type: "manyToOne" as const,
      } as ManyToOneRelation;
    }
    throw new Error(`Unknown relation type: ${relation.type}`);
  }),
};

/**
 * Repository for product operations
 */
export class ProductRepository extends EntityDao<Product> {
  /**
   * Entity mapping for Product
   */
  protected readonly entityMapping = typedProductMapping;

  /**
   * Find products with metadata for a user
   * @param userId User ID
   * @returns Array of products with metadata
   */
  async findWithMetaForUser(userId: number): Promise<ProductWithMeta[]> {
    const qb = this.createQueryBuilder() as unknown as EntityQueryBuilder;

    // Select all product fields - specify the table name with alias
    qb.select(["f.*"]).from(this.tableName, "f");

    // Add category count
    const productCategoryCountQb = this.db.createQueryBuilder();
    productCategoryCountQb
      .select("COUNT(*)")
      .from("category_product", "cf")
      .where("cf.product_id = f.product_id");

    qb.selectRaw(`(${productCategoryCountQb.toSql()}) as category_count`);

    // Add user access check
    const hasAccessQb = this.db.createQueryBuilder();
    hasAccessQb
      .select("COUNT(*)")
      .from("user_resource_access", "ura")
      .where(
        `ura.user_id = ${userId} AND ura.resource_type = 'product' AND ura.resource_id = f.product_id`
      );

    qb.selectRaw(`(${hasAccessQb.toSql()}) > 0 as has_access`);

    // Add requires credits flag
    qb.selectRaw("(is_free = 0 AND credit_cost > 0) as requires_credits");

    // Join with bookmark table to check if bookmarked
    qb.leftJoin(
      "user_product_bookmark",
      "ufb",
      `f.product_id = ufb.product_id AND ufb.user_id = ${userId} AND ufb.removed = 0`
    );

    qb.selectRaw(
      "ufb.bookmark_id IS NOT NULL AND ufb.removed = 0 as is_bookmarked"
    );

    // Join with user data table for user-specific stats
    qb.leftJoin(
      "user_product_data",
      "ufd",
      `f.product_id = ufd.product_id AND ufd.user_id = ${userId}`
    );

    qb.selectRaw("ufd.view_count as user_view_count");
    qb.selectRaw("ufd.last_viewed");
    qb.selectRaw("ufd.total_view_time");
    qb.selectRaw("ufd.notes");

    // Order by product ID
    qb.orderBy("f.product_id");

    return qb.execute<ProductWithMeta>();
  }

  /**
   * Get product with metadata for a user
   * @param productId Product ID
   * @param userId User ID
   * @returns Product with metadata
   */
  async getWithMetaForUser(
    productId: number,
    userId: number
  ): Promise<ProductWithMeta | undefined> {
    const qb = this.createQueryBuilder() as unknown as EntityQueryBuilder;

    // Select all product fields with table alias
    qb.select(["f.*"]).from(this.tableName, "f");

    // Add category count
    const productCategoryCountQb = this.db.createQueryBuilder();
    productCategoryCountQb
      .select("COUNT(*)")
      .from("category_product", "cf")
      .where("cf.product_id = f.product_id");

    qb.selectRaw(`(${productCategoryCountQb.toSql()}) as category_count`);

    // Add user access check
    const hasAccessQb = this.db.createQueryBuilder();
    hasAccessQb
      .select("COUNT(*)")
      .from("user_resource_access", "ura")
      .where(
        `ura.user_id = ${userId} AND ura.resource_type = 'product' AND ura.resource_id = f.product_id`
      );

    qb.selectRaw(`(${hasAccessQb.toSql()}) > 0 as has_access`);

    // Add requires credits flag
    qb.selectRaw("(is_free = 0 AND credit_cost > 0) as requires_credits");

    // Join with bookmark table to check if bookmarked
    qb.leftJoin(
      "user_product_bookmark",
      "ufb",
      `f.product_id = ufb.product_id AND ufb.user_id = ${userId} AND ufb.removed = 0`
    );

    qb.selectRaw(
      "ufb.bookmark_id IS NOT NULL AND ufb.removed = 0 as is_bookmarked"
    );

    // Join with user data table for user-specific stats
    qb.leftJoin(
      "user_product_data",
      "ufd",
      `f.product_id = ufd.product_id AND ufd.user_id = ${userId}`
    );

    qb.selectRaw("ufd.view_count as user_view_count");
    qb.selectRaw("ufd.last_viewed");
    qb.selectRaw("ufd.total_view_time");
    qb.selectRaw("ufd.notes");

    // Get remaining credit count using database-agnostic date expressions
    const currentDateTime = DateExpressions.currentDateTime();

    const creditBalanceQb = this.db.createQueryBuilder();
    creditBalanceQb
      .select("SUM(uc.amount)")
      .from("user_credits", "uc")
      .where(`uc.user_id = ${userId} AND uc.expiry_date >= ${currentDateTime}`);

    qb.selectRaw(`(${creditBalanceQb.toSql()}) as remaining_credits`);

    // Add the product ID filter
    qb.where("f.product_id = ?", productId);

    const product = await qb.getOne<ProductWithMeta>();

    if (!product) {
      return undefined;
    }

    // Get associated categories
    const categoriesQb = this.db.createQueryBuilder();

    categoriesQb
      .select(["c.*", "p.category_name as parent_name"])
      .from("categories", "c")
      .leftJoin("categories", "p", "c.parent_id = p.category_id")
      .innerJoin("category_product", "cf", "c.category_id = cf.category_id")
      .where("cf.product_id = ?", productId)
      .orderBy("c.category_name");

    const categories = await categoriesQb.execute<ProductCategoryWithMeta>();

    // Process access information
    if (product.requires_credits && !product.has_access) {
      product.credit_info = {
        cost: product.credit_cost || 0,
        remaining_credits: Number(product.remaining_credits) || 0,
      };

      // Create a preview of the pricing if not accessible
      if (product.pricing) {
        product.pricing_preview = this.createPricingPreview(product.pricing);
        delete product.pricing; // Remove full pricing
      }
    }

    // Add categories to the product
    product.categories = categories;

    return product;
  }

  /**
   * Check if a user has enough credits to access a product
   * @param productId Product ID
   * @param userId User ID
   * @returns Credit check result
   */
  async checkCreditAccess(
    productId: number,
    userId: number
  ): Promise<CreditCheckResult> {
    // Use query builder for this complex query
    const qb = this.createQueryBuilder() as unknown as EntityQueryBuilder;

    // Select product info with table alias
    qb.select(["f.is_free", "f.credit_cost"]).from(this.tableName, "f");

    // Add user access check
    const hasAccessQb = this.db.createQueryBuilder();
    hasAccessQb
      .select("COUNT(*)")
      .from("user_resource_access", "ura")
      .where(
        `ura.user_id = ${userId} AND ura.resource_type = 'product' AND ura.resource_id = f.product_id`
      );

    qb.selectRaw(`(${hasAccessQb.toSql()}) > 0 as has_access`);

    // Get credit balance using database-agnostic date expressions
    const currentDateTime = DateExpressions.currentDateTime();

    const balanceQb = this.db.createQueryBuilder();
    balanceQb
      .select("SUM(uc.amount)")
      .from("user_credits", "uc")
      .where(`uc.user_id = ${userId} AND uc.expiry_date >= ${currentDateTime}`);

    qb.selectRaw(`(${balanceQb.toSql()}) as balance`);

    // Add product ID filter
    qb.where("f.product_id = ?", productId);

    const result = await qb.getOne<{
      is_free: boolean;
      has_access: boolean;
      credit_cost: number;
      balance: number;
    }>();

    if (!result) {
      return {
        allowed: false,
        message: "Product not found",
      };
    }

    // If it's free, allow access
    if (result.is_free) {
      return {
        allowed: true,
        message: "This is a free product",
      };
    }

    // If user already has access, allow
    if (result.has_access) {
      return {
        allowed: true,
        message: "You already have access to this product",
      };
    }

    // Check credits
    const cost = result.credit_cost || 0;
    const balance = result.balance || 0;

    if (balance >= cost) {
      return {
        allowed: true,
        message: `This will cost ${cost} credits`,
        cost,
        balance,
        remainingCredits: balance - cost,
      };
    } else {
      return {
        allowed: false,
        message: `Not enough credits. This costs ${cost} credits but you only have ${balance}`,
        cost,
        balance,
        remainingCredits: 0,
      };
    }
  }

  /**
   * Bookmark a product for a user
   * @param productId Product ID
   * @param userId User ID
   * @returns Whether the operation succeeded
   */
  async bookmark(productId: number, userId: number): Promise<boolean> {
    try {
      // Check if bookmark exists but is removed
      const qb = this.db.createQueryBuilder();
      qb.select("bookmark_id")
        .from("user_product_bookmark")
        .where("product_id = ? AND user_id = ?", productId, userId);

      const existing = await qb.getOne<{ bookmark_id: number }>();

      if (existing && existing.bookmark_id) {
        // Update existing bookmark
        await this.db.update(
          "user_product_bookmark",
          "bookmark_id",
          existing.bookmark_id,
          {
            removed: 0,
            created_at: new Date().toISOString(),
          }
        );
      } else {
        // Create new bookmark
        await this.db.insert("user_product_bookmark", {
          user_id: userId,
          product_id: productId,
          created_at: new Date().toISOString(),
          removed: 0,
        });
      }

      // Update product bookmark count
      const countQb = this.db.createQueryBuilder();
      countQb
        .select("COUNT(*) as count")
        .from("user_product_bookmark")
        .where("product_id = ? AND removed = 0", productId);

      const countResult = await countQb.getOne<{ count: number }>();
      const count = countResult?.count || 0;

      await this.update(productId, {
        bookmark_count: count,
      } as Partial<Product>);

      return true;
    } catch (error) {
      console.error("Error bookmarking product:", error);
      return false;
    }
  }

  /**
   * Remove a bookmark for a user
   * @param productId Product ID
   * @param userId User ID
   * @returns Whether the operation succeeded
   */
  async removeBookmark(productId: number, userId: number): Promise<boolean> {
    try {
      // Mark bookmark as removed
      await this.db.updateBy(
        "user_product_bookmark",
        { product_id: productId, user_id: userId },
        { removed: 1 }
      );

      // Update product bookmark count
      const countQb = this.db.createQueryBuilder();
      countQb
        .select("COUNT(*) as count")
        .from("user_product_bookmark")
        .where("product_id = ? AND removed = 0", productId);

      const countResult = await countQb.getOne<{ count: number }>();
      const count = countResult?.count || 0;

      await this.update(productId, {
        bookmark_count: count,
      } as Partial<Product>);

      return true;
    } catch (error) {
      console.error("Error removing bookmark:", error);
      return false;
    }
  }

  /**
   * Create a preview of the pricing
   * @param pricing Full pricing text
   * @returns Preview text
   */
  private createPricingPreview(pricing: string): string {
    const words = pricing.split(" ");
    if (words.length <= 3) {
      return words[0] + "...";
    }

    return words.slice(0, 3).join(" ") + "...";
  }

  /**
   * Find products by search term
   * @param searchTerm Search term
   * @returns Array of matching products
   */
  async searchByText(searchTerm: string): Promise<Product[]> {
    const qb = this.createQueryBuilder() as unknown as EntityQueryBuilder;

    // Select all fields
    qb.select(["*"]);

    // Add conditions for title or pricing containing the search term
    qb.where(`title LIKE ?`, `%${searchTerm}%`);
    qb.orWhere(`pricing LIKE ?`, `%${searchTerm}%`);

    // Order by title
    qb.orderBy("title");

    return qb.execute<Product>();
  }

  /**
   * Get products that a user has bookmarked
   * @param userId User ID
   * @returns Array of bookmarked products
   */
  async getBookmarkedProducts(userId: number): Promise<ProductWithMeta[]> {
    const qb = this.createQueryBuilder() as unknown as EntityQueryBuilder;

    // Select all product fields with table alias
    qb.select(["f.*"]).from(this.tableName, "f");

    // Join with bookmarks table
    qb.innerJoin(
      "user_product_bookmark",
      "b",
      `f.product_id = b.product_id AND b.user_id = ${userId} AND b.removed = 0`
    );

    // Add user-specific data
    qb.leftJoin(
      "user_product_data",
      "ufd",
      `f.product_id = ufd.product_id AND ufd.user_id = ${userId}`
    );

    qb.selectRaw("ufd.view_count as user_view_count");
    qb.selectRaw("ufd.last_viewed");
    qb.selectRaw("ufd.total_view_time");
    qb.selectRaw("ufd.notes");

    // Add is_bookmarked flag (always true for this query)
    qb.selectRaw("1 as is_bookmarked");

    // Order by bookmark date (most recent first)
    qb.orderBy("b.created_at", "DESC");

    return qb.execute<ProductWithMeta>();
  }

  /**
   * Find products by category ID
   * @param productCategoryId ProductCategory ID
   * @returns Array of products
   */
  async findByProductCategoryId(productCategoryId: number): Promise<Product[]> {
    try {
      const qb = this.db.createQueryBuilder();
      qb.select(["f.*"])
        .from("products", "f")
        .innerJoin("category_product", "cf", "f.product_id = cf.product_id")
        .where("cf.category_id = ?", productCategoryId)
        .orderBy("f.title");

      return qb.execute<Product>();
    } catch (error) {
      console.error(`Error finding products by category ID: ${error}`);
      return [];
    }
  }

  /**
   * Find free products
   * @returns Array of free products
   */
  async findFreeProducts(): Promise<Product[]> {
    try {
      return this.findBy({ is_free: 1 } as unknown as Partial<Product>);
    } catch (error) {
      console.error(`Error finding free products: ${error}`);
      return [];
    }
  }

  /**
   * Grant access to a product
   * @param productId Product ID
   * @param userId User ID
   * @param creditCost Credit cost
   * @returns Whether the operation succeeded
   */
  async grantAccess(
    productId: number,
    userId: number,
    creditCost: number
  ): Promise<boolean> {
    return this.db.transaction(async (db) => {
      try {
        // Step 1: Record the access
        const now = new Date().toISOString();

        await db.insert("user_resource_access", {
          user_id: userId,
          resource_type: "product",
          resource_id: productId,
          credit_cost: creditCost,
          access_date: now,
          created_at: now,
        });

        // Step 2: Deduct credits from the user's balance
        // Get credits that expire soonest first
        const creditsQb = db.createQueryBuilder();
        creditsQb
          .select(["credit_id", "amount"])
          .from("user_credits")
          .where("user_id = ? AND expiry_date >= datetime('now')", userId)
          .orderBy("expiry_date", "ASC");

        const creditsToUse = await creditsQb.execute<{
          credit_id: number;
          amount: number;
        }>();

        let remainingCost = creditCost;

        for (const credit of creditsToUse) {
          if (remainingCost <= 0) break;

          const amountToUse = Math.min(credit.amount, remainingCost);
          remainingCost -= amountToUse;

          if (amountToUse === credit.amount) {
            // Use the entire credit
            await db.delete("user_credits", "credit_id", credit.credit_id);
          } else {
            // Use part of the credit
            await db.update("user_credits", "credit_id", credit.credit_id, {
              amount: credit.amount - amountToUse,
            });
          }
        }

        return true;
      } catch (error) {
        console.error("Error granting access:", error);
        return false;
      }
    });
  }

  /**
   * Update user data for a product
   * @param productId Product ID
   * @param userId User ID
   * @param viewTime View time in seconds
   * @param notes Optional notes
   * @returns Whether the operation succeeded
   */
  async updateUserData(
    productId: number,
    userId: number,
    viewTime: number,
    notes?: string
  ): Promise<boolean> {
    try {
      // Get the product first to verify it exists
      const product = await this.findById(productId);
      if (!product) {
        throw new Error("Could not retrieve product data");
      }

      // Check if data exists
      const userDataQb = this.db.createQueryBuilder();
      userDataQb
        .select("data_id")
        .from("user_product_data")
        .where("product_id = ? AND user_id = ?", productId, userId);

      const existing = await userDataQb.getOne<{ data_id: number }>();

      const now = new Date().toISOString();

      if (existing && existing.data_id) {
        // Get current values
        const currentDataQb = this.db.createQueryBuilder();
        currentDataQb
          .select(["view_count", "total_view_time"])
          .from("user_product_data")
          .where("data_id = ?", existing.data_id);

        const currentData = await currentDataQb.getOne<{
          view_count: number;
          total_view_time: number;
        }>();

        if (!currentData) throw new Error("Could not retrieve current data");

        // Update existing data
        const updateData: Record<string, unknown> = {
          view_count: (currentData.view_count || 0) + 1,
          last_viewed: now,
          total_view_time: (currentData.total_view_time || 0) + viewTime,
        };

        if (notes !== undefined) {
          updateData.notes = notes;
        }

        await this.db.update(
          "user_product_data",
          "data_id",
          existing.data_id,
          updateData
        );
      } else {
        // Create new data
        await this.db.insert("user_product_data", {
          user_id: userId,
          product_id: productId,
          view_count: 1,
          last_viewed: now,
          total_view_time: viewTime,
          notes: notes || null,
        });
      }

      // Update product stats
      const totalViewCount = (product.total_view_count || 0) + 1;
      const avgViewTime = product.avg_view_time || 0;

      const newAvgViewTime =
        (avgViewTime * (totalViewCount - 1) + viewTime) / totalViewCount;

      await this.update(productId, {
        total_view_count: totalViewCount,
        avg_view_time: newAvgViewTime,
      } as Partial<Product>);

      return true;
    } catch (error) {
      console.error("Error updating user product data:", error);
      return false;
    }
  }
}
