/**
 * Core type definitions for the YAML-driven web application framework
 */

import { Express, Request, Response, NextFunction } from 'express';
import { EntityDao } from '../database/entity-dao';
import { DatabaseAdapter } from '../database/database-adapter';

/**
 * Application configuration object
 */
export interface AppConfig {
	/** Application name */
	name: string;
	/** Application version */
	version: string;
	/** Server port */
	port: number;
	/** Base API path */
	apiBasePath: string;
	/** Database configuration */
	database: DatabaseConfig;
	/** Authentication configuration */
	auth?: AuthConfig;
	/** Path to entities directory */
	entitiesDir: string;
	/** Production mode flag */
	production: boolean;
}

/**
 * Database configuration
 */
export interface DatabaseConfig {
	/** Database type (sqlite, postgres, mysql) */
	type: 'sqlite' | 'postgres' | 'mysql';
	/** Connection details */
	connection: {
		/** SQLite filename or connection string for other DBs */
		filename?: string;
		/** Database host */
		host?: string;
		/** Database port */
		port?: number;
		/** Database name */
		database?: string;
		/** Database user */
		user?: string;
		/** Database password */
		password?: string;
		/** SSL configuration */
		ssl?: boolean;
	};
	/** Whether to synchronize schema automatically */
	synchronize?: boolean;
	/** Connection pool options */
	pool?: {
		min?: number;
		max?: number;
	};
}

/**
 * Authentication configuration
 */
export interface AuthConfig {
	/** Auth provider type */
	provider: 'jwt' | 'oauth2';
	/** Secret key for token signing */
	secret: string;
	/** Access token expiry */
	tokenExpiry: string;
	/** Refresh token expiry */
	refreshTokenExpiry?: string;
	/** User entity name */
	userEntity: string;
	/** Username field in user entity */
	usernameField: string;
	/** Password field in user entity */
	passwordField: string;
	/** User role field */
	roleField?: string;
	/** Available roles */
	roles?: Role[];
}

/**
 * Role definition
 */
export interface Role {
	/** Role name */
	name: string;
	/** Role description */
	description: string;
	/** Parent role for inheritance */
	inherits?: string;
}

/**
 * Entity definition from YAML
 */
export interface EntityConfig {
	/** Entity name */
	entity: string;
	/** Database table name */
	table: string;
	/** ID field name */
	idField: string;
	/** Column definitions */
	columns: EntityColumn[];
	/** Entity relationships */
	relations?: EntityRelation[];
	/** Timestamp configuration */
	timestamps?: {
		createdAt?: string;
		updatedAt?: string;
		deletedAt?: string;
	};
	/** Soft delete configuration */
	softDelete?: {
		column: string;
		deletedValue: any;
		nonDeletedValue: any;
	};
	/** API configuration */
	api?: EntityApiConfig;
	/** Hooks for entity lifecycle */
	hooks?: EntityHooks;
	/** Custom actions */
	actions?: EntityAction[];
	/** Validation rules */
	validation?: ValidationRules;
	/** Computed properties */
	computed?: ComputedProperty[];
	/** Workflow definitions */
	workflows?: Workflow[];
}

/**
 * Entity column definition
 */
export interface EntityColumn {
	/** Logical column name (in code) */
	logical: string;
	/** Physical column name (in database) */
	physical: string;
	/** Whether this is a primary key */
	primaryKey?: boolean;
	/** Whether the column auto-increments */
	autoIncrement?: boolean;
	/** Whether the column can be null */
	nullable?: boolean;
	/** Column data type */
	type?: string;
	/** Whether the column has a unique constraint */
	unique?: boolean;
	/** Column comment */
	comment?: string;
	/** Foreign key reference */
	foreignKey?: string;
}

/**
 * Entity relation definition
 */
export interface EntityRelation {
	/** Relation name */
	name: string;
	/** Relation type */
	type: 'oneToOne' | 'oneToMany' | 'manyToOne' | 'manyToMany';
	/** Source entity */
	sourceEntity: string;
	/** Target entity */
	targetEntity: string;
	/** Source column */
	sourceColumn: string;
	/** Target column */
	targetColumn: string;
	/** For many-to-many, junction table */
	junctionTable?: string;
	/** For many-to-many, junction source column */
	junctionSourceColumn?: string;
	/** For many-to-many, junction target column */
	junctionTargetColumn?: string;
	/** For one-to-one, whether this is the owner side */
	isOwner?: boolean;
	/** Inverse relation name */
	inverseName?: string;
}

/**
 * Entity API configuration
 */
export interface EntityApiConfig {
	/** Whether to expose entity via REST API */
	exposed: boolean;
	/** Base path for the entity API */
	basePath?: string;
	/** Which operations to enable */
	operations?: {
		getAll?: boolean;
		getById?: boolean;
		create?: boolean;
		update?: boolean;
		delete?: boolean;
	};
	/** Role-based permissions */
	permissions?: {
		getAll?: string[];
		getById?: string[];
		create?: string[];
		update?: string[];
		delete?: string[];
	};
	/** Field-level permissions */
	fields?: Record<string, {
		read?: string[];
		write?: string[];
	}>;
	/** Record-level access control */
	recordAccess?: {
		condition: string;
	};
}

/**
 * Entity lifecycle hooks
 */
export interface EntityHooks {
	/** Before create hooks */
	beforeCreate?: Hook[];
	/** After create hooks */
	afterCreate?: Hook[];
	/** Before update hooks */
	beforeUpdate?: Hook[];
	/** After update hooks */
	afterUpdate?: Hook[];
	/** Before delete hooks */
	beforeDelete?: Hook[];
	/** After delete hooks */
	afterDelete?: Hook[];
	/** Before getById hooks */
	beforeGetById?: Hook[];
	/** After getById hooks */
	afterGetById?: Hook[];
	/** Before getAll hooks */
	beforeGetAll?: Hook[];
	/** After getAll hooks */
	afterGetAll?: Hook[];
}

/**
 * Hook definition
 */
export interface Hook {
	/** Hook name */
	name: string;
	/** Inline implementation or path to external file */
	implementation: string;
	/** Optional condition for hook execution */
	condition?: string;
}

/**
 * Custom entity action
 */
export interface EntityAction {
	/** Action name */
	name: string;
	/** HTTP path for the action */
	path: string;
	/** HTTP method */
	method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
	/** Authorized roles */
	auth?: string[];
	/** Action implementation */
	implementation: string;
}

/**
 * Entity validation rules
 */
export interface ValidationRules {
	/** Field-specific rules */
	rules: Record<string, ValidationRule[]>;
}

/**
 * Validation rule
 */
export interface ValidationRule {
	/** Rule type */
	type: 'required' | 'minLength' | 'maxLength' | 'min' | 'max' | 'pattern' | 'email' | 'custom';
	/** Rule value (if applicable) */
	value?: any;
	/** Error message */
	message: string;
	/** Custom implementation (for custom rules) */
	implementation?: string;
}

/**
 * Computed property
 */
export interface ComputedProperty {
	/** Property name */
	name: string;
	/** Fields this property depends on */
	dependencies?: string[];
	/** Property implementation */
	implementation: string;
}

/**
 * Entity workflow
 */
export interface Workflow {
	/** Workflow name */
	name: string;
	/** Workflow states */
	states: WorkflowState[];
	/** State transitions */
	transitions: WorkflowTransition[];
}

/**
 * Workflow state
 */
export interface WorkflowState {
	/** State name */
	name: string;
	/** Whether this is the initial state */
	initial?: boolean;
}

/**
 * Workflow transition
 */
export interface WorkflowTransition {
	/** Source state */
	from: string;
	/** Target state */
	to: string;
	/** Transition action name */
	action: string;
	/** Roles that can perform this transition */
	permissions?: string[];
	/** Transition hooks */
	hooks?: {
		before?: string;
		after?: string;
	};
}

/**
 * Hook context provided to hook implementations
 */
export interface HookContext {
	/** Entity DAO */
	entityDao: EntityDao<any>;
	/** Current user (if authenticated) */
	user?: {
		id: number | string;
		username: string;
		role: string;
	};
	/** Original HTTP request */
	req?: Request;
	/** HTTP response */
	res?: Response;
	/** Express next function */
	next?: NextFunction;
	/** Database access */
	db: DatabaseAdapter;
	/** Logger */
	logger: Logger;
	/** Service container */
	services: Record<string, any>;
}

/**
 * Logger interface
 */
export interface Logger {
	debug(message: string, ...args: any[]): void;
	info(message: string, ...args: any[]): void;
	warn(message: string, ...args: any[]): void;
	error(message: string, ...args: any[]): void;
}

/**
 * Application context
 */
export interface AppContext {
	/** Express application instance */
	app: Express;
	/** Application configuration */
	config: AppConfig;
	/** Database adapter */
	db: DatabaseAdapter;
	/** Entity managers */
	entities: Record<string, EntityDao<any>>;
	/** Logger */
	logger: Logger;
	/** Service container */
	services: Record<string, any>;
}