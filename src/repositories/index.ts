/**
 * Repositories index file
 * Exports all data access repositories
 */

// User repository
export { UserRepository } from "./user-repository";

// ProductCategory repository
export { ProductCategoryRepository } from "./category-repository";

// Product repository
export { ProductRepository } from "./product-repository";

// Credit repositories
export {
  CreditPackageRepository,
  UserCreditRepository,
  PaymentTransactionRepository,
} from "./credit-repository";

// Shopping session repository
export { ShoppingSessionRepository } from "./shopping-session-repository";

// Factory functions to create repositories
import { DatabaseAdapter } from "../database/core/types";
import { DatabaseContext } from "../database/core/database-context";
import { UserRepository } from "./user-repository";
import { ProductCategoryRepository } from "./category-repository";
import { ProductRepository } from "./product-repository";
import {
  CreditPackageRepository,
  UserCreditRepository,
  PaymentTransactionRepository,
} from "./credit-repository";
import { ShoppingSessionRepository } from "./shopping-session-repository";

/**
 * Create a user repository
 * @param db Optional database adapter
 * @returns User repository instance
 */
export function createUserRepository(db?: DatabaseAdapter): UserRepository {
  return new UserRepository(db || DatabaseContext.getDatabase());
}

/**
 * Create a category repository
 * @param db Optional database adapter
 * @returns ProductCategory repository instance
 */
export function createProductCategoryRepository(
  db?: DatabaseAdapter
): ProductCategoryRepository {
  return new ProductCategoryRepository(db || DatabaseContext.getDatabase());
}

/**
 * Create a product repository
 * @param db Optional database adapter
 * @returns Product repository instance
 */
export function createProductRepository(
  db?: DatabaseAdapter
): ProductRepository {
  return new ProductRepository(db || DatabaseContext.getDatabase());
}

/**
 * Create a credit package repository
 * @param db Optional database adapter
 * @returns Credit package repository instance
 */
export function createCreditPackageRepository(
  db?: DatabaseAdapter
): CreditPackageRepository {
  return new CreditPackageRepository(db || DatabaseContext.getDatabase());
}

/**
 * Create a user credit repository
 * @param db Optional database adapter
 * @returns User credit repository instance
 */
export function createUserCreditRepository(
  db?: DatabaseAdapter
): UserCreditRepository {
  return new UserCreditRepository(db || DatabaseContext.getDatabase());
}

/**
 * Create a payment transaction repository
 * @param db Optional database adapter
 * @returns Payment transaction repository instance
 */
export function createPaymentTransactionRepository(
  db?: DatabaseAdapter
): PaymentTransactionRepository {
  return new PaymentTransactionRepository(db || DatabaseContext.getDatabase());
}

/**
 * Create a shopping session repository
 * @param db Optional database adapter
 * @returns Shopping session repository instance
 */
export function createShoppingSessionRepository(
  db?: DatabaseAdapter
): ShoppingSessionRepository {
  return new ShoppingSessionRepository(db || DatabaseContext.getDatabase());
}
