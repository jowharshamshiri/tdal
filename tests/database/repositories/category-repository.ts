/**
 * ProductCategory repository
 * Data access for category-related operations
 */

import { EntityDao } from "../../src/entity/entity-manager";
import {
	ProductCategory,
	ProductCategoryWithMeta,
	ProductCategoryDetail,
	ProductCategoryMapping,
} from "../../tests/models";
import { Product } from "../../tests/models/product";
import { EntityQueryBuilder } from "../../src/database/query/entity-query-builder";
import {
	Relation,
	ManyToManyRelation,
	OneToManyRelation,
	ManyToOneRelation,
} from "../../src/database/orm/relation-types";

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
	protected readonly entityConfig = typedProductCategoryMapping;

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
		// Use the aggregate method to get counts for the different metrics we need
		const qb = this.createQueryBuilder();

		// Start with selecting all category fields
		qb.select(["c.*"]).from(this.tableName, "c");

		// Left join with parent categories for parent name
		qb.leftJoin("categories", "p", "c.parent_id = p.category_id");
		qb.selectRaw("p.category_name as parent_name");

		// Get child count using a relation-based approach
		qb.selectExpression(
			"(SELECT COUNT(*) FROM categories c2 WHERE c2.parent_id = c.category_id)",
			"child_count"
		);

		// Get direct product count
		qb.selectExpression(
			"(SELECT COUNT(*) FROM category_product cp WHERE cp.category_id = c.category_id)",
			"direct_product_count"
		);

		// Get total product count (direct + descendants) - this would be better done in application code
		// but we're keeping it here for consistency
		qb.selectExpression(
			"(SELECT COUNT(DISTINCT cp.product_id) FROM category_product cp " +
			"INNER JOIN categories c_tree ON c_tree.category_id = cp.category_id " +
			"WHERE c_tree.category_id = c.category_id OR c_tree.parent_id = c.category_id)",
			"total_product_count"
		);

		// Order by name
		qb.orderBy("c.category_name");

		// Execute the query to get the results
		return qb.execute<ProductCategoryWithMeta>();
	}

	/**
	 * Search categories by name
	 * @param searchTerm Search term
	 * @returns Array of matching categories
	 */
	async searchByName(searchTerm: string): Promise<ProductCategory[]> {
		// Use the enhanced query builder through EntityDao
		const qb = this.createQueryBuilder();

		// Select all fields
		qb.select(["c.*"]).from(this.tableName, "c");

		// Join with parent category for parent name
		qb.leftJoin("categories", "p", "c.parent_id = p.category_id");
		qb.selectRaw("p.category_name as parent_name");

		// Use whereLike for search
		qb.whereLike("c.category_name", searchTerm, "both");

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
		} catch (error: any) {
			console.error(`Error finding categories by parent ID: ${error}`);
			return [];
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

			// Add the relation
			return this.addRelation(productCategoryId, "products", productId);
		} catch (error: any) {
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
			return this.removeRelation(productCategoryId, "products", productId);
		} catch (error: any) {
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
			// Get direct count
			const directCountResult = await this.aggregate({
				aggregates: [
					{ function: "COUNT", field: "product_id", alias: "count" }
				],
				conditions: { category_id: productCategoryId },
				from: "category_product"
			});

			const directCount = directCountResult[0]?.count as number || 0;

			// Get children categories recursively
			const children = await this.findByParentId(productCategoryId);
			let childrenIds = children.map(c => c.category_id);

			// If there are no children, total count is the same as direct count
			if (childrenIds.length === 0) {
				return { direct: directCount, total: directCount };
			}

			// Calculate total count by summing direct count and counts from all children
			let totalCount = directCount;
			for (const childId of childrenIds) {
				const childCounts = await this.getProductCounts(childId);
				totalCount += childCounts.direct;
			}

			return { direct: directCount, total: totalCount };
		} catch (error: any) {
			console.error(`Error getting product counts: ${error}`);
			return { direct: 0, total: 0 };
		}
	}

	/**
	 * Fix for getProductCategoryDetail method
	 * Correctly references the 'products' table instead of 'product'
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

			// Get products using a direct query rather than findRelated to avoid table name issue
			const productsQb = this.createQueryBuilder();
			productsQb.select(["p.*"])
				.from("products", "p")
				.innerJoin(
					"category_product",
					"cp",
					"p.product_id = cp.product_id"
				)
				.where(`cp.category_id = ?`, productCategoryId);

			const products = await productsQb.execute<Product>();

			// Get descendant count
			const descendants = await this.findByParentId(productCategoryId);
			const descendantCount = descendants.length;

			return {
				...category,
				parent,
				children,
				descendant_count: descendantCount,
				products,
			};
		} catch (error: any) {
			console.error(`Error getting category detail: ${error}`);
			return undefined;
		}
	}
}