/**
 * Core framework types
 * Defines the fundamental types used throughout the framework
 */

import { Express, Request, Response, NextFunction } from 'express';

import { DatabaseAdapter } from '../database/core/types';
import { DbConfig } from '../database/core/connection-types';
import { EntityDao } from '@/entity/entity-manager';

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
	 * Global middleware configuration
	 */
	middleware?: MiddlewareConfig;

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
	request?: any;

	/**
	 * Response object (if hook is triggered by an API call)
	 */
	response?: any;

	/**
	 * Express next function (if hook is triggered by an API call)
	 */
	next?: any;

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
 * Hook function
 * Generic function that takes data and context and returns a result
 */
export type HookFunction<T = any> = (data: T, context: HookContext) => Promise<any> | any;

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
 * Action definition
 */
export interface ActionDefinition {
	/**
	 * Action name
	 */
	name: string;

	/**
	 * Description of what the action does
	 */
	description?: string;

	/**
	 * Action implementation
	 */
	implementation: string | Function;

	/**
	 * HTTP method for the action endpoint
	 */
	httpMethod?: string;

	/**
	 * Route path for the action endpoint
	 */
	route?: string;

	/**
	 * Required roles to execute this action
	 */
	roles?: string[];

	/**
	 * Whether the action requires a transaction
	 */
	transactional?: boolean;

	/**
	 * Parameter schema for input validation
	 */
	params?: {
		[key: string]: {
			type: string;
			required?: boolean;
			description?: string;
			default?: any;
		};
	};

	/**
	 * Additional action metadata
	 */
	metadata?: Record<string, any>;
}

/**
 * Middleware configuration
 */
export interface MiddlewareConfig {
	/**
	 * Global middleware (applied to all routes)
	 */
	global?: string[];

	/**
	 * Entity-specific middleware
	 */
	entity?: {
		[entityName: string]: string[];
	};

	/**
	 * Action-specific middleware
	 */
	action?: {
		[actionName: string]: string[];
	};

	/**
	 * Route-specific middleware
	 */
	route?: {
		[routePath: string]: string[];
	};

	/**
	 * Method-specific middleware
	 */
	method?: {
		get?: string[];
		post?: string[];
		put?: string[];
		delete?: string[];
		patch?: string[];
	};
}

/**
 * Middleware definition
 */
export interface MiddlewareDefinition {
	/**
	 * Middleware name
	 */
	name: string;

	/**
	 * Middleware implementation function or import path
	 */
	handler: Function | string;

	/**
	 * Middleware options
	 */
	options?: Record<string, any>;

	/**
	 * Middleware priority (lower numbers run first)
	 */
	priority?: number;
}

/**
 * API route configuration
 */
export interface RouteConfig {
	/**
	 * HTTP method
	 */
	method: string;

	/**
	 * Route path
	 */
	path: string;

	/**
	 * Handler function
	 */
	handler: Function;

	/**
	 * Middleware to apply
	 */
	middleware?: string[];

	/**
	 * Associated entity name
	 */
	entity?: string;

	/**
	 * Operation name
	 */
	operation?: string;

	/**
	 * Required roles
	 */
	roles?: string[];

	/**
	 * Request schema for validation
	 */
	requestSchema?: Record<string, any>;

	/**
	 * Response schema
	 */
	responseSchema?: Record<string, any>;
}

/**
 * API error response
 */
export interface ApiError {
	/**
	 * Error message
	 */
	message: string;

	/**
	 * Error code
	 */
	code: string;

	/**
	 * HTTP status code
	 */
	status: number;

	/**
	 * Additional error data
	 */
	data?: Record<string, any>;
}

/**
 * Entity API configuration
 */
export interface EntityApiConfig {
	/**
	 * Whether to expose entity via REST API
	 */
	exposed: boolean;

	/**
	 * Base path for the entity API
	 */
	basePath?: string;

	/**
	 * Operations to enable/disable
	 */
	operations?: {
		getAll?: boolean;
		getById?: boolean;
		create?: boolean;
		update?: boolean;
		delete?: boolean;
	};

	/**
	 * Role-based permissions
	 */
	permissions?: {
		getAll?: string[];
		getById?: string[];
		create?: string[];
		update?: string[];
		delete?: string[];
	};

	/**
	 * Field-level permissions
	 */
	fields?: Record<string, {
		read?: string[];
		write?: string[];
	}>;

	/**
	 * Record-level access control
	 */
	recordAccess?: {
		condition: string;
	};
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
 * Workflow state definition
 */
export interface WorkflowState {
	/**
	 * State name
	 */
	name: string;

	/**
	 * Whether this is the initial state
	 */
	initial?: boolean;

	/**
	 * State description
	 */
	description?: string;

	/**
	 * Custom metadata for the state
	 */
	metadata?: Record<string, unknown>;
}

/**
 * Workflow transition definition
 */
export interface WorkflowTransition {
	/**
	 * Source state name
	 */
	from: string;

	/**
	 * Target state name
	 */
	to: string;

	/**
	 * Transition name/action
	 */
	action: string;

	/**
	 * Roles that can perform this transition
	 */
	roles?: string[];

	/**
	 * Implementation or path to external file for transition logic
	 */
	implementation?: string;

	/**
	 * Transition hooks
	 */
	hooks?: {
		before?: string;
		after?: string;
	};
}

/**
 * Check if a workflow transition is valid
 * 
 * @param workflow Workflow definition
 * @param currentState Current state
 * @param action Transition action
 * @returns Whether the transition is valid
 */
export function isValidTransition(
	workflow: Workflow,
	currentState: string,
	action: string
): boolean {
	return workflow.transitions.some(
		t => t.from === currentState && t.action === action
	);
}

/**
 * Get the target state for a transition
 * 
 * @param workflow Workflow definition
 * @param currentState Current state
 * @param action Transition action
 * @returns Target state or undefined if transition not found
 */
export function getTargetState(
	workflow: Workflow,
	currentState: string,
	action: string
): string | undefined {
	const transition = workflow.transitions.find(
		t => t.from === currentState && t.action === action
	);
	return transition?.to;
}

/**
 * Workflow definition
 */
export interface Workflow {
	/**
	 * Workflow name
	 */
	name: string;

	/**
	 * Field that stores the current state
	 */
	stateField: string;

	/**
	 * States in the workflow
	 */
	states: WorkflowState[];

	/**
	 * Transitions between states
	 */
	transitions: WorkflowTransition[];
}

/**
 * API controller method
 */
export type ControllerMethod = (context: ControllerContext) => Promise<any> | any;

/**
 * Entity API route definition
 */
export interface EntityApiRoute {
	/**
	 * HTTP method
	 */
	method: string;

	/**
	 * Route path
	 */
	path: string;

	/**
	 * Operation name
	 */
	operation: string;

	/**
	 * Handler function
	 */
	handler: ControllerMethod;

	/**
	 * Middleware to apply
	 */
	middleware?: string[];

	/**
	 * Required roles
	 */
	roles?: string[];
}

/**
 * Request processor options
 */
export interface RequestProcessorOptions {
	/**
	 * Whether to parse body
	 */
	parseBody?: boolean;

	/**
	 * Whether to validate request
	 */
	validate?: boolean;

	/**
	 * Whether to authenticate request
	 */
	authenticate?: boolean;

	/**
	 * Whether to authorize request
	 */
	authorize?: boolean;

	/**
	 * Custom middleware to apply
	 */
	middleware?: string[];
}

/**
 * Authentication provider interface
 */
export interface AuthProvider {
	/**
	 * Authenticate a user
	 */
	authenticate(credentials: any): Promise<any>;

	/**
	 * Verify a token
	 */
	verifyToken(token: string): Promise<any>;

	/**
	 * Generate a token
	 */
	generateToken(payload: any): Promise<string>;

	/**
	 * Check if a user has a role
	 */
	hasRole(user: any, role: string): boolean;
}