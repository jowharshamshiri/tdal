/**
 * API Request and Response interfaces for all endpoints
 */

import { PaginationParams } from "../../tests/models";
import {
	User,
	ProductCategoryWithMeta,
	ProductCategoryDetail,
	Product,
	ProductWithMeta,
	CreditPackage,
	CreditBalance,
	PaymentTransaction,
	UserResourceAccess,
} from "../../tests/models";

// ==================
// Categories API
// ==================

/**
 * Response for getting all categories
 */
export interface GetCategoriesResponse {
	/**
	 * Array of categories with metadata
	 */
	categories: ProductCategoryWithMeta[];

	/**
	 * User's current credit balance
	 */
	user_credits?: number;
}

/**
 * Response for getting a category by ID
 */
export type GetProductCategoryByIdResponse = ProductCategoryDetail;

/**
 * Request for creating a category
 */
export interface CreateProductCategoryRequest {
	/**
	 * ProductCategory name
	 */
	category_name: string;

	/**
	 * Optional description
	 */
	description?: string | null;

	/**
	 * Optional parent category ID
	 */
	parent_id?: number | null;

	/**
	 * Optional image URL
	 */
	image_url?: string | null;
}

/**
 * Request for updating a category
 */
export interface UpdateProductCategoryRequest {
	/**
	 * Updated category name
	 */
	category_name?: string;

	/**
	 * Updated description
	 */
	description?: string | null;

	/**
	 * Updated parent category ID
	 */
	parent_id?: number | null;

	/**
	 * Updated image URL
	 */
	image_url?: string | null;
}

// ==================
// Products API
// ==================

/**
 * Request for getting products
 */
export interface GetProductsRequest extends PaginationParams {
	/**
	 * Optional category ID to filter by
	 */
	category_id?: string | number;

	/**
	 * Whether to include products from descendant categories
	 */
	include_descendants?: string | boolean;
}

/**
 * Response for getting products
 */
export interface GetProductsResponse {
	/**
	 * Array of products with metadata
	 */
	products: ProductWithMeta[];

	/**
	 * User's current credit balance
	 */
	user_credits?: number;
}

/**
 * Response for getting a product by ID
 */
export type GetProductByIdResponse = ProductWithMeta;

/**
 * Request for creating a product
 */
export interface CreateProductRequest {
	/**
	 * Title text
	 */
	title: string;

	/**
	 * Pricing text
	 */
	pricing: string;

	/**
	 * Optional hint
	 */
	hint?: string | null;

	/**
	 * Optional teaser content
	 */
	teaser?: string | null;

	/**
	 * ProductCategory IDs to associate with
	 */
	category_ids?: number[];

	/**
	 * Credit cost to access
	 */
	credit_cost?: number;

	/**
	 * Whether the product is free
	 */
	is_free?: boolean;
}

/**
 * Request for updating a product
 */
export interface UpdateProductRequest {
	/**
	 * Updated title text
	 */
	title?: string;

	/**
	 * Updated pricing text
	 */
	pricing?: string;

	/**
	 * Updated hint
	 */
	hint?: string | null;

	/**
	 * Updated teaser content
	 */
	teaser?: string | null;

	/**
	 * Updated category IDs
	 */
	category_ids?: number[];

	/**
	 * Updated credit cost
	 */
	credit_cost?: number;

	/**
	 * Updated free status
	 */
	is_free?: boolean;
}

// ==================
// Relationships API
// ==================

/**
 * Request for getting relationships
 */
export interface GetRelationshipsRequest {
	/**
	 * Optional category ID to filter by
	 */
	category_id?: string | number;

	/**
	 * Optional product ID to filter by
	 */
	product_id?: string | number;
}

/**
 * Request for creating a relationship
 */
export interface CreateRelationshipRequest {
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
 * Request for deleting a relationship
 */
export interface DeleteRelationshipRequest {
	/**
	 * ProductCategory ID
	 */
	category_id: number;

	/**
	 * Product ID
	 */
	product_id: number;
}

// ==================
// Search API
// ==================

/**
 * Request for searching
 */
export interface SearchRequest {
	/**
	 * Search query
	 */
	q: string;

	/**
	 * Optional type to filter by
	 */
	type?: "category" | "product";

	/**
	 * Whether to include descendants
	 */
	include_descendants?: string | boolean;
}

/**
 * Search result for categories
 */
export interface SearchProductCategoryResult {
	/**
	 * Result type
	 */
	type: "categories";

	/**
	 * Matching categories
	 */
	items: ProductCategoryWithMeta[];
}

/**
 * Search result for products
 */
export interface SearchProductResult {
	/**
	 * Result type
	 */
	type: "products";

	/**
	 * Matching products
	 */
	items: ProductWithMeta[];
}

/**
 * Combined search response
 */
export type SearchResponse = Array<
	SearchProductCategoryResult | SearchProductResult
>;

// ==================
// User API
// ==================

/**
 * Response for getting all users
 */
export type GetUsersResponse = Array<
	User & {
		credit_balance?: number;
		resource_access_count?: number;
	}
>;

/**
 * Response for getting a user by ID
 */
export interface GetUserByIdResponse {
	/**
	 * User ID
	 */
	user_id: number;

	/**
	 * User's name
	 */
	name: string;

	/**
	 * User's email
	 */
	email: string;

	/**
	 * User's role
	 */
	role: string;

	/**
	 * Account creation date
	 */
	created_at: string;

	/**
	 * Last login date
	 */
	last_login: string | null;

	/**
	 * Credit balance
	 */
	credit_balance: number;

	/**
	 * Recent resource access
	 */
	recent_access: UserResourceAccess[];
}

/**
 * Request for creating a user
 */
export interface CreateUserRequest {
	/**
	 * User's name
	 */
	name: string;

	/**
	 * User's email
	 */
	email: string;

	/**
	 * User's password
	 */
	password: string;

	/**
	 * User's role
	 */
	role?: "user" | "admin";
}

/**
 * Request for updating a user
 */
export interface UpdateUserRequest {
	/**
	 * Updated name
	 */
	name?: string;

	/**
	 * Updated email
	 */
	email?: string;

	/**
	 * New password
	 */
	password?: string;

	/**
	 * Current password (for verification)
	 */
	current_password?: string;

	/**
	 * Updated role
	 */
	role?: "user" | "admin";
}

/**
 * Request for adding credits to a user
 */
export interface AddCreditsRequest {
	/**
	 * Credit amount to add
	 */
	amount: number;

	/**
	 * Days until credits expire
	 */
	validity_days?: number;

	/**
	 * Optional note
	 */
	note?: string;
}

/**
 * Response for adding credits
 */
export interface AddCreditsResponse {
	/**
	 * Success message
	 */
	message: string;

	/**
	 * Amount of credits added
	 */
	credits_added: number;

	/**
	 * New total balance
	 */
	total_balance: number;
}

// ==================
// Payment/Credits API
// ==================

/**
 * Request for creating a checkout session
 */
export interface CreateCheckoutSessionRequest {
	/**
	 * Package ID to purchase
	 */
	package_id: number;

	/**
	 * Success redirect URL
	 */
	success_url: string;

	/**
	 * Cancel redirect URL
	 */
	cancel_url: string;
}

/**
 * Response for creating a checkout session
 */
export interface CreateCheckoutSessionResponse {
	/**
	 * Session ID
	 */
	id: string;

	/**
	 * Checkout URL
	 */
	url: string;
}

/**
 * Response for getting credit packages
 */
export type GetCreditPackagesResponse = CreditPackage[];

/**
 * Response for getting payment history
 */
export interface GetPaymentHistoryResponse {
	/**
	 * Payment transactions
	 */
	transactions: PaymentTransaction[];
}

/**
 * Response for getting credit balance
 */
export type GetCreditBalanceResponse = CreditBalance;

// ==================
// Errors
// ==================

/**
 * Standard error response
 */
export interface ErrorResponse {
	/**
	 * Error message
	 */
	message: string;

	/**
	 * Error type
	 */
	error?: string;

	/**
	 * Credit cost (for credit-related errors)
	 */
	cost?: number;

	/**
	 * Current balance (for credit-related errors)
	 */
	balance?: number;

	/**
	 * HTTP status code
	 */
	status?: number;

	/**
	 * Additional error data
	 */
	data?: Record<string, unknown>;
}

// ==================
// Shopping Session API
// ==================

/**
 * Request for starting a shopping session
 */
export interface StartShoppingSessionRequest {
	/**
	 * Optional category ID to shopping
	 */
	category_id?: number;

	/**
	 * Optional specific product IDs to shopping
	 */
	product_ids?: number[];

	/**
	 * Whether to shuffle the cards
	 */
	shuffle?: boolean;

	/**
	 * Maximum number of cards
	 */
	max_cards?: number;
}

/**
 * Response for starting a shopping session
 */
export interface StartShoppingSessionResponse {
	/**
	 * Session ID
	 */
	session_id: number;

	/**
	 * Products in the session
	 */
	products: Product[];
}

/**
 * Request for recording a product view
 */
export interface RecordViewRequest {
	/**
	 * Session ID
	 */
	session_id: number;

	/**
	 * Product ID
	 */
	product_id: number;

	/**
	 * Which pages were shown
	 */
	page_shown: "title" | "pricing" | "both";

	/**
	 * Whether the hint was viewed
	 */
	hint_viewed: boolean;

	/**
	 * View time in seconds
	 */
	view_time?: number;
}

/**
 * Request for updating session status
 */
export interface UpdateSessionStatusRequest {
	/**
	 * New status
	 */
	status: "active" | "paused" | "completed";
}

/**
 * Response for getting shopping statistics
 */
export interface ShoppingStatisticsResponse {
	/**
	 * Total sessions
	 */
	total_sessions: number;

	/**
	 * Total cards studied
	 */
	total_cards: number;

	/**
	 * Total shopping time in seconds
	 */
	total_time: number;

	/**
	 * Average time per card in seconds
	 */
	avg_time_per_card: number;

	/**
	 * Recent sessions
	 */
	recent_sessions: Array<{
		session_id: number;
		start_time: string;
		end_time?: string;
		cards_studied: number;
		total_shopping_time: number;
		status: string;
	}>;
}
