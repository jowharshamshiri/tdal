/**
 * Core framework types
 * Defines the fundamental types used throughout the framework
 */

import { Request, Response, NextFunction } from 'express';
import { DatabaseAdapter } from '../database/core/types';
import { EntityConfig } from '../entity/entity-config';
import { EntityDao } from '../entity/entity-manager';
import { StringValue } from 'ms';

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
	 * API adapters configuration
	 */
	adapters?: {
		/**
		 * Default adapter to use
		 */
		default?: string;

		/**
		 * Adapters configuration
		 */
		config?: Record<string, AdapterConfig>;
	};

	/**
	 * Global middleware configuration
	 */
	middleware?: MiddlewareConfig;

	/**
	 * Plugin configuration
	 */
	plugins?: PluginConfig[];

	/**
	 * Custom application options
	 */
	[key: string]: any;
}

/**
 * Database configuration
 */
export interface DbConfig {
	/**
	 * Database type
	 */
	type: 'sqlite' | 'mysql' | 'postgres' | 'custom';

	/**
	 * Database connection string
	 */
	connectionString?: string;

	/**
	 * Database host
	 */
	host?: string;

	/**
	 * Database port
	 */
	port?: number;

	/**
	 * Database name
	 */
	database?: string;

	/**
	 * Database username
	 */
	username?: string;

	/**
	 * Database password
	 */
	password?: string;

	/**
	 * Path to SQLite database file
	 */
	filename?: string;

	/**
	 * Connection pool options
	 */
	pool?: {
		min?: number;
		max?: number;
		idleTimeoutMillis?: number;
	};

	/**
	 * SSL configuration
	 */
	ssl?: boolean | {
		rejectUnauthorized?: boolean;
		ca?: string;
		cert?: string;
		key?: string;
	};

	/**
	 * Custom database options
	 */
	options?: Record<string, any>;
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
	tokenExpiry?: StringValue | number;

	/**
	 * Refresh token expiration time
	 */
	refreshTokenExpiry?: StringValue | number;

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
	inherits?: string | string[];

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
	level?: 'trace' | 'debug' | 'info' | 'warn' | 'error';

	/**
	 * Whether to pretty print logs
	 */
	pretty?: boolean;

	/**
	 * Custom log formatters
	 */
	formatters?: Record<string, (data: any) => string>;

	/**
	 * Whether to log to console
	 * @default true
	 */
	console?: boolean;

	/**
	 * Whether to log to file
	 * @default true
	 */
	logToFile?: boolean;

	/**
	 * Directory to store log files
	 * @default process.cwd()/trash/logs
	 */
	logsDir?: string;

	/**
	 * Whether to use daily consolidated log files (true) or create new file per session (false)
	 * @default false
	 */
	useDailyLogs?: boolean;

	/**
	 * Whether to log stack traces for errors
	 * @default true
	 */
	logStackTraces?: boolean;

	/**
	 * Maximum size of log file in bytes before rotation
	 * @default 10485760 (10MB)
	 */
	maxFileSize?: number;

	/**
	 * Maximum number of log files to retain
	 * @default 10
	 */
	maxFiles?: number;

	/**
	 * Custom log file name pattern
	 * Available placeholders: %DATE%, %LEVEL%, %PID%
	 * @default "app-%DATE%.log"
	 */
	fileNamePattern?: string;

	/**
	 * Format for log timestamps
	 * @default "YYYY-MM-DD HH:mm:ss.SSS"
	 */
	timestampFormat?: string;

	/**
	 * Whether to use colors in console output
	 * @default true
	 */
	useColors?: boolean;

	/**
	 * Custom color map for different log levels
	 */
	colors?: Record<string, string>;

	/**
	 * Custom metadata to include with every log entry
	 */
	metadata?: Record<string, any>;

	/**
	 * Whether to include process ID in logs
	 * @default false
	 */
	includePid?: boolean;

	/**
	 * Whether to serialize complex objects in logs
	 * @default true
	 */
	serializeObjects?: boolean;

	/**
	 * Maximum depth for object serialization
	 * @default 2
	 */
	maxObjectDepth?: number;
}

/**
 * Logger interface
 */
export interface Logger {
	/**
	 * Log trace message (most detailed level)
	 */
	trace(message: string, ...args: any[]): void;

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
	 * Log error message or object
	 */
	error(messageOrError: string | Error, ...args: any[]): void;

	/**
	 * Set logger level dynamically
	 */
	setLevel(level: 'trace' | 'debug' | 'info' | 'warn' | 'error'): void;

	/**
	 * Add custom metadata to logger
	 */
	addMetadata(metadata: Record<string, any>): void;
}

/**
 * Application context interface
 */
export interface AppContext {
	/**
	 * Get the Express application
	 */
	getApp(): any;

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
	 * Get entity configuration by name
	 */
	getEntityConfig(entityName: string): EntityConfig;

	/**
	 * Get all entity configurations
	 */
	getAllEntityConfigs(): Map<string, EntityConfig>;

	/**
	 * Get a service by name
	 */
	getService<T>(name: string): T;

	/**
	 * Check if a service exists
	 */
	hasService(name: string): boolean;

	/**
	 * Get the logger
	 */
	getLogger(): Logger;

	/**
	 * Get middleware configuration by name
	 */
	getMiddlewareConfig(name: string): MiddlewareConfig | undefined;

	/**
	 * Register a service
	 */
	registerService(definition: ServiceDefinition): void;

	/**
	 * Register middleware
	 */
	registerMiddleware(name: string, config: MiddlewareConfig): void;

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

export type DynamicObject<T = any> = {
	[key: string]: T;
};

export interface ActionImplementations {
	[actionName: string]: (params: any, context: HookContext) => Promise<any>;
}

export interface EntityHookHandler {
	executeHook: (hookType: string, data: any, context: HookContext) => Promise<any>;
}

/**
 * Hook context for entity lifecycle hooks
 */
export interface HookContext {
	/**
	 * Database adapter
	 */
	db: DatabaseAdapter | undefined;

	/**
	 * Application context
	 */
	appContext?: AppContext;

	/**
	 * Current user (if authenticated)
	 */
	user?: {
		id?: number | string;
		user_id?: number | string;
		username?: string;
		email?: string;
		role?: string;
		[key: string]: any;
	};

	/**
	 * Original entity data (for update/delete hooks)
	 */
	originalEntity?: Record<string, unknown>;

	/**
	 * Request object (if hook is triggered by an API call)
	 */
	request?: Request;

	/**
	 * Response object (if hook is triggered by an API call)
	 */
	response?: Response;

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
	operation?: string;

	/**
	 * Action name
	 */
	action?: string;

	/**
	 * Logger instance
	 */
	logger?: Logger;

	/**
	 * Additional context data
	 */
	data?: Record<string, unknown>;

	/**
	 * Get a service by name
	 */
	getService?: <T>(name: string) => T;

	/**
	 * Get an entity manager
	 */
	getEntityManager?: <T>(name?: string) => EntityDao<T>;

	/**
	 * Path parameters
	 */
	params?: Record<string, string>;

	/**
	 * Query parameters
	 */
	query?: Record<string, any>;

	/**
	 * Request body
	 */
	body?: any;

	/**
	 * Send JSON response
	 */
	sendJson?: (data: any, status?: number) => void;

	/**
	 * Send error response
	 */
	sendError?: (message: string, status?: number, errorType?: string, details?: Record<string, any>) => void;
}

/**
 * Hook function type
 */
export type HookFunction<T = any> = (data: T, context: HookContext) => Promise<any> | any;

/**
 * Action function type
 */
export type ActionFunction = (params: any, context: HookContext) => Promise<any> | any;

// /**
//  * Validation function type
//  */
// export type ValidationFunction<T = any> = (
// 	value: any,
// 	entity: T,
// 	context: HookContext
// ) => boolean | string | { valid: boolean; message?: string };

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
 * API error
 */
export interface ApiError extends Error {
	/**
	 * HTTP status code
	 */
	status: number;

	/**
	 * Error type
	 */
	code?: string;

	/**
	 * Additional error data
	 */
	data?: Record<string, any>;
}

/**
 * Action result
 */
export interface ActionResult<T = any> {
	/**
	 * Whether the action was successful
	 */
	success: boolean;

	/**
	 * Action result data
	 */
	data?: T;

	/**
	 * Error message if unsuccessful
	 */
	error?: string;

	/**
	 * HTTP status code
	 */
	statusCode?: number;

	/**
	 * Additional metadata
	 */
	metadata?: Record<string, any>;
}

/**
 * Controller context
 */
export interface ControllerContext extends HookContext {
	/**
	 * Entity name
	 */
	entityName: string;

	/**
	 * Operation name
	 */
	operation: string;

	/**
	 * Route parameters
	 */
	params: Record<string, string>;

	/**
	 * Query parameters
	 */
	query: Record<string, any>;

	/**
	 * Request body
	 */
	body: any;
}

/**
 * Middleware configuration
 */
export interface MiddlewareConfig {
	/**
	 * Middleware name
	 */
	name?: string;

	/**
	 * Middleware handler
	 */
	handler: Function | string;

	/**
	 * Middleware options
	 */
	options?: Record<string, any>;

	/**
	 * Middleware priority
	 */
	priority?: number;

	/**
	 * Global middleware (applied to all routes)
	 */
	global?: string[];

	/**
	 * Entity-specific middleware
	 */
	entity?: Record<string, string[]>;

	/**
	 * Action-specific middleware
	 */
	action?: Record<string, string[]>;

	/**
	 * Route-specific middleware
	 */
	route?: Record<string, string[]>;

	/**
	 * HTTP method-specific middleware
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
		ownerField: any;
		condition: string;
	};
}

/**
 * Plugin configuration
 */
export interface PluginConfig {
	/**
	 * Plugin name
	 */
	name: string;

	/**
	 * Whether the plugin is enabled
	 */
	enabled: boolean;

	/**
	 * Plugin configuration
	 */
	config?: Record<string, any>;

	/**
	 * Plugin source
	 */
	source: string;

	/**
	 * Plugin type
	 */
	type?: 'npm' | 'directory' | 'custom';
}

/**
 * API adapter configuration
 */
export interface AdapterConfig {
	/**
	 * Adapter type/name
	 */
	type: string;

	/**
	 * Whether the adapter is enabled
	 */
	enabled: boolean;

	/**
	 * Adapter-specific options
	 */
	options?: Record<string, any>;

	/**
	 * Output directory for generated files
	 */
	outputDir?: string;

	/**
	 * Authentication configuration for the adapter
	 */
	auth?: {
		/**
		 * Whether to include authentication in generated API
		 */
		enabled: boolean;

		/**
		 * Authentication provider (jwt, oauth, etc.)
		 */
		provider?: string;

		/**
		 * Authentication options
		 */
		options?: Record<string, any>;
	};

	/**
	 * Custom templates location
	 */
	templateDir?: string;
}

/**
 * Action implementation type
 */
export interface ActionImplementation {
	/**
	 * Action function
	 */
	fn: ActionFunction;

	/**
	 * Action metadata
	 */
	metadata: any;

	/**
	 * Entity name
	 */
	entityName: string;
}

/**
 * Action execution options
 */
export interface ActionExecutionOptions {
	/**
	 * Whether to execute in a transaction
	 */
	transactional?: boolean;

	/**
	 * Transaction isolation level
	 */
	isolationLevel?: 'READ_UNCOMMITTED' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';

	/**
	 * Whether to throw errors (true) or return error results (false)
	 */
	throwErrors?: boolean;

	/**
	 * Timeout in milliseconds
	 */
	timeout?: number;
}

/**
 * Authentication options
 */
export interface AuthenticationOptions {
	/**
	 * Whether authentication is required
	 */
	required?: boolean;

	/**
	 * JWT secret
	 */
	secret?: string;

	/**
	 * Required roles
	 */
	roles?: string[];

	/**
	 * Entity name for role-based access control
	 */
	entity?: string;

	/**
	 * Operation for role-based access control
	 */
	operation?: string;

	/**
	 * Custom authentication function
	 */
	customAuth?: (req: Request, res: Response, token: string) => Promise<boolean>;
}

/**
 * Authentication result
 */
export interface AuthenticationResult {
	/**
	 * Whether authentication was successful
	 */
	authenticated: boolean;

	/**
	 * User object if authenticated
	 */
	user?: any;

	/**
	 * Error message if authentication failed
	 */
	error?: string;

	/**
	 * HTTP status code for error response
	 */
	statusCode?: number;
}

// Add these to your @/core/types.ts file

export interface Workflow {
	name: string;
	states: WorkflowState[];
	transitions: WorkflowTransition[];
}

export interface WorkflowState {
	name: string;
	initial?: boolean;
	description?: string;
	metadata?: Record<string, any>;
}

export interface WorkflowTransition {
	from: string;
	to: string;
	action: string;
	permissions?: string[];
	hooks?: {
		before?: string;
		after?: string;
	};
	description?: string;
	metadata?: Record<string, any>;
}

// Missing interface from hook-context.ts
export interface EntityHookHandler {
	executeHook: (hookType: string, data: any, context: HookContext) => Promise<any>;
}

/**
 * Creates a generic API error
 * @param message Error message
 * @param status HTTP status code
 * @param code Error code
 * @param data Additional error data
 * @returns API error object
 */
export function createApiError(
	message: string,
	status: number = 400,
	code?: string,
	data?: Record<string, any>
): ApiError {
	const error = new Error(message) as ApiError;
	error.name = code || 'ApiError';
	error.status = status;
	error.code = code;
	error.data = data;
	return error;
}

/**
 * Create a success action result
 * @param data Result data
 * @param statusCode HTTP status code
 * @param metadata Additional metadata
 * @returns Action result
 */
export function createSuccessResult<T>(
	data: T,
	statusCode: number = 200,
	metadata?: Record<string, any>
): ActionResult<T> {
	return {
		success: true,
		data,
		statusCode,
		metadata
	};
}

/**
 * Create an error action result
 * @param error Error message or object
 * @param statusCode HTTP status code
 * @param metadata Additional metadata
 * @returns Action result
 */
export function createErrorResult(
	error: string | Error,
	statusCode: number = 400,
	metadata?: Record<string, any>
): ActionResult<void> {
	const errorMessage = typeof error === 'string' ? error : error.message;
	return {
		success: false,
		error: errorMessage,
		statusCode,
		metadata
	};
}