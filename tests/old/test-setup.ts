// tests/tdal/test-setup.ts
import { DatabaseAdapter, DatabaseContext, SQLiteAdapter, SQLiteConfig } from "../src/database";
import { SchemaLoader } from "../src/database/schema/schema-loader";
import * as path from "path";
import * as fs from "fs";

export async function setupTestDatabase(): Promise<DatabaseAdapter> {
	// Create an in-memory SQLite database for testing
	const config = {
		type: "sqlite",
		connection: {
			memory: true,
			filename: ":memory:",
		},
	};

	const db = new SQLiteAdapter(config as SQLiteConfig);
	await db.connect();

	// Enable foreign keys
	await db.execute("PRAGMA foreign_keys = ON");

	return db;
}

export function teardownTestDatabase(): void {
	// Any cleanup needed
}

export async function createTestSchema(db: DatabaseAdapter): Promise<void> {
	const schemaLoader = new SchemaLoader(db, {
		baseDir: path.join(process.cwd(), "sql"),
		schemaDir: "schema",
		seedDir: "test",
	});

	// Load schema from schema.sql
	await schemaLoader.loadSchema(path.join(process.cwd(), "sql", "schema.sql"));
}

export async function insertTestData(db: DatabaseAdapter): Promise<void> {
	const schemaLoader = new SchemaLoader(db, {
		baseDir: path.join(process.cwd(), "sql"),
		schemaDir: "schema",
		seedDir: "test",
	});
	// Load test data
	await schemaLoader.loadSeedData("../../sql/test-data.sql");
}

export async function cleanupDatabase(db: DatabaseAdapter): Promise<void> {
	// Temporarily disable foreign key constraints
	await db.execute("PRAGMA foreign_keys = OFF");

	// Clear all tables in correct order
	await db.executeScript(`
	  DELETE FROM product_view_record;
	  DELETE FROM product_shopping_session;
	  DELETE FROM user_product_preferences;
	  DELETE FROM user_product_data;
	  DELETE FROM user_product_bookmark;
	  DELETE FROM user_resource_access;
	  DELETE FROM payment_transactions;
	  DELETE FROM user_credits;
	  DELETE FROM credit_packages;
	  DELETE FROM category_product;
	  DELETE FROM products;
	  DELETE FROM categories;
	  DELETE FROM users;
	`);

	// Re-enable foreign key constraints
	await db.execute("PRAGMA foreign_keys = ON");
}

// Helper function to calculate expiry date (if needed in your application)
export function getExpiryDate(dateString: string, days: number): string {
	const date = new Date(dateString);
	date.setDate(date.getDate() + days);
	return date.toISOString();
}



/**
 * Close test database connection
 */
export function closeTestDatabase(): void {
	DatabaseContext.closeDatabase();
}

/**
 * Setup for Jest tests - can be used in jest.setup.js
 */
export async function setupJestTestEnvironment(): Promise<void> {
	await setupTestDatabase();
}

/**
 * Teardown for Jest tests - can be used in jest.teardown.js
 */
export function teardownJestTestEnvironment(): void {
	closeTestDatabase();
}
