/**
 * Core framework types
 * Defines the fundamental types used throughout the framework
 */

import { Express, Request, Response, NextFunction } from 'express';

import { DatabaseAdapter } from '../database/core/types';
import { DbConfig } from '../database/core/connection-types';
import { EntityDao } from '../database';

/**
 * Application configuration
 */
export interface AppConfig {
	/**
	 * Application name
	 */
	name: string;

	/**
	 * Application version
	 */
	version: string;

	/**
	 * Server port
	 */
	port: number;

	/**
	 * Server host
	 */
	host?: string;

	/**
	 * API base path
	 */
	apiBasePath?: string;

	/**
	 * Path to entities directory
	 */
	entitiesDir?: string;

	/**
	 * Database configuration
	 */
	database?: DbConfig;

	/**
	 * Authentication configuration
	 */
	auth?: AuthConfig;

	/**
	 * CORS configuration
	 */
	cors?: CorsConfig;

	/**
	 * Logging configuration
	 */
	logging?: LoggingConfig;

	/**
	 * Whether the application is running in production mode
	 */
	production?: boolean;

	/**
	 * Framework-specific options
	 */
	framework?: {
		/**
		 * Enable automatic API generation
		 */
		enableApi?: boolean;

		/**
		 * Enable automatic schema synchronization
		 */
		syncSchema?: boolean;

		/**
		 * Enable database migrations
		 */
		enableMigrations?: boolean;

		/**
		 * Path to migrations directory
		 */
		migrationsDir?: string;
	};

	/**
	 * Custom application options
	 */
	[key: string]: any;
}

/**
 * Authentication configuration
 */
export interface AuthConfig {
	/**
	 * Authentication provider
	 */
	provider: 'jwt' | 'oauth2' | 'custom';

	/**
	 * Secret key for token signing
	 */
	secret?: string;

	/**
	 * Token expiration time
	 */
	tokenExpiry?: string;

	/**
	 * Refresh token expiration time
	 */
	refreshTokenExpiry?: string;

	/**
	 * User entity name
	 */
	userEntity?: string;

	/**
	 * Username field
	 */
	usernameField?: string;

	/**
	 * Password field
	 */
	passwordField?: string;

	/**
	 * OAuth2 configuration
	 */
	oauth2?: {
		/**
		 * OAuth2 providers
		 */
		providers: {
			/**
			 * Provider name
			 */
			name: string;

			/**
			 * Client ID
			 */
			clientId: string;

			/**
			 * Client secret
			 */
			clientSecret: string;

			/**
			 * Authorization URL
			 */
			authorizationUrl: string;

			/**
			 * Token URL
			 */
			tokenUrl: string;

			/**
			 * Callback URL
			 */
			callbackUrl: string;

			/**
			 * Scopes
			 */
			scopes: string[];
		}[];
	};

	/**
	 * Available roles
	 */
	roles?: Role[];
}

/**
 * Role definition
 */
export interface Role {
	/**
	 * Role name
	 */
	name: string;

	/**
	 * Role description
	 */
	description?: string;

	/**
	 * Parent role (for inheritance)
	 */
	inherits?: string;

	/**
	 * Role permissions
	 */
	permissions?: string[];
}

/**
 * CORS configuration
 */
export interface CorsConfig {
	/**
	 * Allowed origins
	 */
	origin?: string | string[] | boolean;

	/**
	 * Allowed methods
	 */
	methods?: string | string[];

	/**
	 * Allowed headers
	 */
	allowedHeaders?: string | string[];

	/**
	 * Exposed headers
	 */
	exposedHeaders?: string | string[];

	/**
	 * Whether to allow credentials
	 */
	credentials?: boolean;

	/**
	 * Max age
	 */
	maxAge?: number;
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
	/**
	 * Log level
	 */
	level?: 'debug' | 'info' | 'warn' | 'error';

	/**
	 * Whether to pretty print logs
	 */
	pretty?: boolean;

	/**
	 * Log file path
	 */
	file?: string;
}

/**
 * Logger interface
 */
export interface Logger {
	/**
	 * Log debug message
	 */
	debug(message: string, ...args: any[]): void;

	/**
	 * Log info message
	 */
	info(message: string, ...args: any[]): void;

	/**
	 * Log warning message
	 */
	warn(message: string, ...args: any[]): void;

	/**
	 * Log error message
	 */
	error(message: string, ...args: any[]): void;
}

/**
 * Base application context interface
 */
export interface AppContext {
	/**
	 * Get the Express application
	 */
	getApp(): Express;

	/**
	 * Get the application configuration
	 */
	getConfig(): AppConfig;

	/**
	 * Get the database adapter
	 */
	getDatabase(): DatabaseAdapter;

	/**
	 * Get an entity manager by entity name
	 */
	getEntityManager<T>(entityName: string): EntityDao<T>;

	/**
	 * Get a service by name
	 */
	getService<T>(name: string): T;

	/**
	 * Get the logger
	 */
	getLogger(): Logger;

	/**
	 * Shutdown the application
	 */
	shutdown(): Promise<void>;
}

/**
 * Service definition
 */
export interface ServiceDefinition {
	/**
	 * Service name
	 */
	name: string;

	/**
	 * Service implementation
	 */
	implementation: any;

	/**
	 * Service dependencies
	 */
	dependencies?: string[];

	/**
	 * Whether this is a singleton service
	 */
	singleton?: boolean;
}

/**
 * API Controller interface
 */
export interface ApiController {
	/**
	 * Get all entities
	 */
	getAll(req: Request, res: Response, next: NextFunction): Promise<void>;

	/**
	 * Get entity by ID
	 */
	getById(req: Request, res: Response, next: NextFunction): Promise<void>;

	/**
	 * Create entity
	 */
	create(req: Request, res: Response, next: NextFunction): Promise<void>;

	/**
	 * Update entity
	 */
	update(req: Request, res: Response, next: NextFunction): Promise<void>;

	/**
	 * Delete entity
	 */
	delete(req: Request, res: Response, next: NextFunction): Promise<void>;

	/**
	 * Custom action
	 */
	[key: string]: (req: Request, res: Response, next: NextFunction) => Promise<void>;
}

/**
 * Hook context for entity lifecycle hooks
 */
export interface HookContext {
	/**
	 * Database adapter
	 */
	db: DatabaseAdapter;

	/**
	 * Application context
	 */
	appContext?: AppContext;

	/**
	 * Current user (if authenticated)
	 */
	user?: {
		id: number | string;
		username: string;
		role: string;
	};

	/**
	 * Original entity data (for update/delete hooks)
	 */
	originalEntity?: Record<string, unknown>;

	/**
	 * Request object (if hook is triggered by an API call)
	 */
	request?: Request | any;

	/**
	 * Response object (if hook is triggered by an API call)
	 */
	response?: Response | any;

	/**
	 * Express next function (if hook is triggered by an API call)
	 */
	next?: NextFunction;

	/**
	 * Entity name
	 */
	entityName?: string;

	/**
	 * Operation name
	 */
	operation?: 'create' | 'update' | 'delete' | 'find' | 'findById' | 'custom' | 'getAll' | 'getById';

	/**
	 * Logger instance
	 */
	logger?: Logger;

	/**
	 * Additional context data
	 */
	data?: Record<string, unknown>;

	/**
	 * Service container
	 */
	services?: Record<string, any>;
}

/**
 * Entity computed property implementation function
 */
export type ComputedPropertyFunction<T = any> = (entity: T) => any;

/**
 * Hook function
 */
export type HookFunction<T = any> = (
	data: T,
	context: HookContext
) => Promise<T | void> | T | void;

/**
 * Entity lifecycle hook implementation function
 */
export type EntityHookFunction<T> = (entity: T, context: HookContext) => Promise<T | void> | T | void;

/**
 * Validation function
 */
export type ValidationFunction<T = any> = (
	value: any,
	entity: T,
	context: HookContext
) => boolean | string | { valid: boolean; message?: string };

/**
 * Validator function for entity validation
 */
export type ValidatorFunction<T> = (entity: T) => boolean | string | { valid: boolean; message?: string };

/**
 * Action implementation function
 */
export type ActionFunction = (params: any, context: HookContext) => Promise<any> | any;

/**
 * Pagination options
 */
export interface PaginationOptions {
	/**
	 * Page number
	 */
	page?: number;

	/**
	 * Page size
	 */
	limit?: number;

	/**
	 * Sort field
	 */
	sort?: string;

	/**
	 * Sort direction
	 */
	order?: 'asc' | 'desc';

	/**
	 * Offset
	 */
	offset?: number;
}

/**
 * Pagination result
 */
export interface PaginationResult<T> {
	/**
	 * Items on the current page
	 */
	items: T[];

	/**
	 * Total number of items
	 */
	total: number;

	/**
	 * Current page number
	 */
	page: number;

	/**
	 * Page size
	 */
	limit: number;

	/**
	 * Total number of pages
	 */
	pages: number;

	/**
	 * Whether there is a next page
	 */
	hasNext: boolean;

	/**
	 * Whether there is a previous page
	 */
	hasPrev: boolean;
}

/**
 * Search options
 */
export interface SearchOptions {
	/**
	 * Search query
	 */
	query: string;

	/**
	 * Fields to search in
	 */
	fields: string[];

	/**
	 * Whether to use fuzzy search
	 */
	fuzzy?: boolean;

	/**
	 * Pagination options
	 */
	pagination?: PaginationOptions;
}

/**
 * File upload options
 */
export interface FileUploadOptions {
	/**
	 * Field name
	 */
	field: string;

	/**
	 * Allowed file types
	 */
	allowedTypes?: string[];

	/**
	 * Maximum file size in bytes
	 */
	maxSize?: number;

	/**
	 * Upload directory
	 */
	destination?: string;

	/**
	 * Storage adapter
	 */
	storage?: 'local' | 's3' | 'azure' | 'gcs' | 'custom';

	/**
	 * Storage options
	 */
	storageOptions?: Record<string, any>;
}

/**
 * Entity change event
 */
export interface EntityChangeEvent<T = any> {
	/**
	 * Event type
	 */
	type: 'create' | 'update' | 'delete';

	/**
	 * Entity name
	 */
	entityName: string;

	/**
	 * Entity ID
	 */
	entityId: number | string;

	/**
	 * Entity data
	 */
	data: T;

	/**
	 * Previous entity data (for update and delete)
	 */
	previousData?: T;

	/**
	 * User who made the change
	 */
	user?: {
		id: number | string;
		username: string;
	};

	/**
	 * Timestamp
	 */
	timestamp: Date;
}

/**
 * Event subscriber interface
 */
export interface EventSubscriber {
	/**
	 * Event types to subscribe to
	 */
	events: string[];

	/**
	 * Handle event
	 */
	handleEvent(event: string, data: any): Promise<void> | void;
}

/**
 * Transaction options
 */
export interface TransactionOptions {
	/**
	 * Transaction isolation level
	 */
	isolationLevel?: 'READ_UNCOMMITTED' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';

	/**
	 * Transaction timeout in milliseconds
	 */
	timeout?: number;
}

/**
 * Workflow context
 */
export interface WorkflowContext extends HookContext {
	/**
	 * Workflow name
	 */
	workflowName: string;

	/**
	 * Current state
	 */
	currentState: string;

	/**
	 * Target state
	 */
	targetState: string;

	/**
	 * Transition action
	 */
	action: string;
}

/**
 * Workflow transition implementation function
 */
export type TransitionFunction<T = any> = (
	entity: T,
	fromState?: string,
	toState?: string,
	context?: HookContext | WorkflowContext
) => Promise<T | boolean> | T | boolean;

/**
 * Application plugin
 */
export interface Plugin {
	/**
	 * Plugin name
	 */
	name: string;

	/**
	 * Plugin version
	 */
	version: string;

	/**
	 * Initialize plugin
	 */
	initialize(context: AppContext): Promise<void> | void;

	/**
	 * Shutdown plugin
	 */
	shutdown?(): Promise<void> | void;

	/**
	 * Plugin dependencies
	 */
	dependencies?: string[];
}

/**
 * Migration interface
 */
export interface Migration {
	/**
	 * Migration ID
	 */
	id: string;

	/**
	 * Migration name
	 */
	name: string;

	/**
	 * Migration timestamp
	 */
	timestamp: number;

	/**
	 * Execute migration
	 */
	up(db: DatabaseAdapter): Promise<void>;

	/**
	 * Rollback migration
	 */
	down(db: DatabaseAdapter): Promise<void>;
}

/**
 * API controller method context
 */
export interface ControllerContext extends HookContext {
	/**
	 * Entity name
	 */
	entityName: string;

	/**
	 * Requested operation
	 */
	operation: 'getAll' | 'getById' | 'create' | 'update' | 'delete' | 'custom';

	/**
	 * Route parameters
	 */
	params: Record<string, string>;

	/**
	 * Query parameters
	 */
	query: Record<string, string>;

	/**
	 * Request body
	 */
	body: any;
}

/**
 * API controller method
 */
export type ControllerMethod = (context: ControllerContext) => Promise<any> | any;