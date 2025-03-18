/**
 * Plugin Schema
 * Defines the structure of plugins and extension points
 */

import { Express, Request, Response, NextFunction } from 'express';
import { HookContext } from '../core/types';
import { AppContext } from '../core/app-context';
import { DatabaseAdapter } from '../database';
import { EntityConfig } from 'src/entity';
import { Logger } from '@/logging';

export interface PluginManifest {
	name: string;
	version: string;
	description: string;
	dependencies: Array<{ name: string; version?: string }>;
}

/**
 * Plugin definition
 */
export interface Plugin {
	/** Plugin name */
	name: string;

	/** Plugin version */
	version: string;

	/** Plugin description */
	description?: string;

	/** Plugin author */
	author?: string;

	/** Plugin configuration schema */
	configSchema?: Record<string, any>;

	/** Plugin initialization */
	initialize?: (context: AppContext, config: any) => Promise<void>;

	/** Plugin cleanup */
	cleanup?: () => Promise<void>;

	/** Plugin hooks */
	hooks?: PluginHooks;

	/** Express middleware */
	middleware?: Array<{
		/** Middleware path (e.g., '/api/*') */
		path?: string;
		/** Middleware handler */
		handler: (req: Request, res: Response, next: NextFunction) => void;
	}>;

	/** Custom commands for CLI */
	commands?: Array<{
		/** Command name */
		name: string;
		/** Command description */
		description: string;
		/** Command aliases */
		aliases?: string[];
		/** Command options */
		options?: Array<{
			/** Option flags (e.g., '-f, --force') */
			flags: string;
			/** Option description */
			description: string;
			/** Default value */
			defaultValue?: string | boolean | number;
		}>;
		/** Command handler */
		handler: (args: any, logger: Logger) => Promise<void>;
	}>;

	/** UI components */
	components?: Record<string, any>;

	/** Database extensions */
	databaseExtensions?: {
		/** Custom database adapter */
		adapter?: (config: any, logger: Logger) => DatabaseAdapter;
		/** Database migration handlers */
		migrations?: {
			/** Generate migration */
			generate?: (args: any, logger: Logger) => Promise<string>;
			/** Run migration */
			run?: (args: any, logger: Logger) => Promise<void>;
		};
	};

	/** Entity generators */
	entityGenerators?: {
		/** Generate entity from custom source */
		fromSource?: (source: any, logger: Logger) => Promise<EntityConfig>;
	};
}

/**
 * Plugin hooks
 */
export interface PluginHooks {
	/** Before server start */
	beforeServerStart?: (app: Express, context: AppContext) => Promise<void>;

	/** After server start */
	afterServerStart?: (app: Express, context: AppContext) => Promise<void>;

	/** Before route registration */
	beforeRouteRegistration?: (app: Express, context: AppContext) => Promise<void>;

	/** After route registration */
	afterRouteRegistration?: (app: Express, context: AppContext) => Promise<void>;

	/** Before database connect */
	beforeDatabaseConnect?: (config: any, context: AppContext) => Promise<any>;

	/** After database connect */
	afterDatabaseConnect?: (db: DatabaseAdapter, context: AppContext) => Promise<void>;

	/** Entity lifecycle hooks */
	entity?: {
		/** Before create */
		beforeCreate?: (entity: any, context: HookContext) => Promise<any>;

		/** After create */
		afterCreate?: (entity: any, context: HookContext) => Promise<any>;

		/** Before update */
		beforeUpdate?: (id: any, data: any, context: HookContext) => Promise<any>;

		/** After update */
		afterUpdate?: (id: any, entity: any, context: HookContext) => Promise<any>;

		/** Before delete */
		beforeDelete?: (id: any, context: HookContext) => Promise<boolean>;

		/** After delete */
		afterDelete?: (id: any, context: HookContext) => Promise<void>;

		/** Before get by ID */
		beforeGetById?: (id: any, context: HookContext) => Promise<any>;

		/** After get by ID */
		afterGetById?: (entity: any, context: HookContext) => Promise<any>;

		/** Before get all */
		beforeGetAll?: (options: any, context: HookContext) => Promise<any>;

		/** After get all */
		afterGetAll?: (entities: any[], context: HookContext) => Promise<any[]>;
	};

	/** API request lifecycle hooks */
	api?: {
		/** Before request */
		beforeRequest?: (req: Request, res: Response, next: NextFunction) => void;

		/** After request */
		afterRequest?: (req: Request, res: Response) => void;

		/** Before response */
		beforeResponse?: (req: Request, res: Response, data: any) => any;

		/** On error */
		onError?: (err: Error, req: Request, res: Response, next: NextFunction) => void;
	};
}

/**
 * Plugin configuration
 */
export interface PluginConfig {
	/** Plugin name */
	name: string;

	/** Whether the plugin is enabled */
	enabled: boolean;

	/** Plugin configuration */
	config: Record<string, any>;

	/** Plugin options */
	options?: {
		/** Whether to load the plugin from npm */
		npm?: boolean;

		/** Plugin path (if not npm) */
		path?: string;
	};
}

/**
 * Plugin registration options
 */
export interface PluginRegistrationOptions {
	/** Whether to skip initialization */
	skipInitialization?: boolean;

	/** Whether to skip validation */
	skipValidation?: boolean;
}

/**
 * Extension points
 * Defines the ways plugins can extend the framework
 */
export enum ExtensionPoint {
	/** Express middleware */
	MIDDLEWARE = 'middleware',

	/** Entity hooks */
	ENTITY_HOOKS = 'entity_hooks',

	/** API hooks */
	API_HOOKS = 'api_hooks',

	/** CLI commands */
	COMMANDS = 'commands',

	/** UI components */
	COMPONENTS = 'components',

	/** Database extensions */
	DATABASE = 'database',

	/** Entity generators */
	ENTITY_GENERATORS = 'entity_generators',

	/** Server lifecycle hooks */
	SERVER_LIFECYCLE = 'server_lifecycle'
}

/**
 * Plugin validation result
 */
export interface PluginValidationResult {
	/** Whether the plugin is valid */
	valid: boolean;

	/** Validation errors */
	errors?: string[];
}

/**
 * JSON Schema for plugin configuration in YAML
 */
export const pluginConfigSchema = {
	type: 'object',
	required: ['name', 'enabled'],
	properties: {
		name: {
			type: 'string',
			description: 'Plugin name'
		},
		enabled: {
			type: 'boolean',
			description: 'Whether the plugin is enabled'
		},
		config: {
			type: 'object',
			description: 'Plugin configuration'
		},
		options: {
			type: 'object',
			properties: {
				npm: {
					type: 'boolean',
					description: 'Whether to load the plugin from npm'
				},
				path: {
					type: 'string',
					description: 'Plugin path (if not npm)'
				}
			}
		}
	}
};

/**
 * JSON Schema for plugin definition
 */
export const pluginSchema = {
	type: 'object',
	required: ['name', 'version'],
	properties: {
		name: {
			type: 'string',
			description: 'Plugin name'
		},
		version: {
			type: 'string',
			description: 'Plugin version'
		},
		description: {
			type: 'string',
			description: 'Plugin description'
		},
		author: {
			type: 'string',
			description: 'Plugin author'
		},
		configSchema: {
			type: 'object',
			description: 'Plugin configuration schema'
		},
		hooks: {
			type: 'object',
			description: 'Plugin hooks'
		},
		middleware: {
			type: 'array',
			items: {
				type: 'object',
				required: ['handler'],
				properties: {
					path: {
						type: 'string',
						description: 'Middleware path'
					},
					handler: {
						description: 'Middleware handler'
					}
				}
			}
		},
		commands: {
			type: 'array',
			items: {
				type: 'object',
				required: ['name', 'description', 'handler'],
				properties: {
					name: {
						type: 'string',
						description: 'Command name'
					},
					description: {
						type: 'string',
						description: 'Command description'
					},
					aliases: {
						type: 'array',
						items: {
							type: 'string'
						},
						description: 'Command aliases'
					},
					options: {
						type: 'array',
						items: {
							type: 'object',
							required: ['flags', 'description'],
							properties: {
								flags: {
									type: 'string',
									description: 'Option flags'
								},
								description: {
									type: 'string',
									description: 'Option description'
								},
								defaultValue: {
									description: 'Default value'
								}
							}
						}
					},
					handler: {
						description: 'Command handler'
					}
				}
			}
		},
		components: {
			type: 'object',
			description: 'UI components'
		},
		databaseExtensions: {
			type: 'object',
			properties: {
				adapter: {
					description: 'Custom database adapter'
				},
				migrations: {
					type: 'object',
					properties: {
						generate: {
							description: 'Generate migration'
						},
						run: {
							description: 'Run migration'
						}
					}
				}
			}
		},
		entityGenerators: {
			type: 'object',
			properties: {
				fromSource: {
					description: 'Generate entity from custom source'
				}
			}
		}
	}
};