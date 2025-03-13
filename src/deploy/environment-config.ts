/**
 * Environment Configuration Manager
 * Handles environment-specific configuration and deployment settings
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as yaml from 'js-yaml';
import { AppConfig, Logger } from '../core/types';

/**
 * Environment types
 */
export type Environment = 'development' | 'test' | 'staging' | 'production';

/**
 * Environment-specific database configuration
 */
export interface EnvDatabaseConfig {
	/** Database type */
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
}

/**
 * Environment-specific configuration
 */
export interface EnvironmentConfig {
	/** Environment name */
	name: Environment;
	/** Database configuration */
	database: EnvDatabaseConfig;
	/** API configuration */
	api?: {
		/** API port */
		port: number;
		/** Cors configuration */
		cors?: {
			/** Allowed origins */
			origin: string | string[];
			/** Allowed headers */
			allowedHeaders?: string[];
		};
	};
	/** Authentication configuration */
	auth?: {
		/** JWT secret */
		secret: string;
		/** Token expiration time */
		tokenExpiry: string;
	};
	/** Logging configuration */
	logging?: {
		/** Log level */
		level: 'debug' | 'info' | 'warn' | 'error';
		/** Whether to log to console */
		console: boolean;
		/** Whether to log to file */
		file?: boolean;
		/** Log file path */
		filePath?: string;
	};
	/** Deployment configuration */
	deployment?: {
		/** Server hostname */
		host?: string;
		/** Whether to use HTTPS */
		https?: boolean;
		/** HTTPS certificate path */
		certPath?: string;
		/** HTTPS key path */
		keyPath?: string;
		/** Whether to use a proxy */
		behindProxy?: boolean;
		/** Server scaling */
		scaling?: {
			/** Minimum instances */
			minInstances?: number;
			/** Maximum instances */
			maxInstances?: number;
		};
	};
}

/**
 * Environment variables configuration
 */
export interface EnvVars {
	/** Node environment */
	NODE_ENV?: string;
	/** Database connection details */
	DB_TYPE?: string;
	DB_HOST?: string;
	DB_PORT?: string;
	DB_NAME?: string;
	DB_USER?: string;
	DB_PASSWORD?: string;
	DB_FILENAME?: string;
	/** API settings */
	API_PORT?: string;
	/** Auth settings */
	JWT_SECRET?: string;
	JWT_EXPIRY?: string;
	/** Deployment settings */
	DEPLOY_HOST?: string;
	DEPLOY_HTTPS?: string;
	DEPLOY_CERT_PATH?: string;
	DEPLOY_KEY_PATH?: string;
	LOG_LEVEL?: string;
}

/**
 * Environment configuration manager
 * Handles loading and processing environment-specific configuration
 */
export class EnvironmentConfigManager {
	/** Current environment */
	private env: Environment;
	/** Environment-specific configuration */
	private config: EnvironmentConfig | null = null;
	/** Application configuration */
	private appConfig: AppConfig | null = null;
	/** Logger instance */
	private logger: Logger;
	/** Environment variables */
	private envVars: EnvVars = {};

	/**
	 * Constructor
	 * @param logger Logger instance
	 * @param env Optional environment name (defaults to NODE_ENV or development)
	 */
	constructor(logger: Logger, env?: Environment) {
		this.logger = logger;

		// Load environment variables
		this.loadEnvVars();

		// Set environment
		this.env = env || (this.envVars.NODE_ENV as Environment) || 'development';

		this.logger.info(`Environment: ${this.env}`);
	}

	/**
	 * Load environment variables from .env file
	 */
	private loadEnvVars(): void {
		try {
			// Load .env file if exists
			const envPath = path.join(process.cwd(), '.env');
			if (fs.existsSync(envPath)) {
				dotenv.config({ path: envPath });
			}

			// Load environment-specific .env file if exists
			const envName = process.env.NODE_ENV || 'development';
			const envSpecificPath = path.join(process.cwd(), `.env.${envName}`);
			if (fs.existsSync(envSpecificPath)) {
				dotenv.config({ path: envSpecificPath });
			}

			// Store environment variables
			this.envVars = process.env as EnvVars;
		} catch (error) {
			this.logger.warn(`Failed to load environment variables: ${error}`);
		}
	}

	/**
	 * Load environment configuration
	 * @param configPath Path to environment config YAML file
	 * @returns Environment configuration
	 */
	loadEnvironmentConfig(configPath: string): EnvironmentConfig {
		try {
			// Load environment config file
			const configContent = fs.readFileSync(configPath, 'utf8');
			const config = yaml.load(configContent) as Record<string, any>;

			// Get environment-specific configuration
			const envConfig = config[this.env] as EnvironmentConfig;
			if (!envConfig) {
				throw new Error(`Configuration for environment ${this.env} not found`);
			}

			// Apply environment variables
			const mergedConfig = this.applyEnvVars(envConfig);

			this.config = mergedConfig;
			return mergedConfig;
		} catch (error) {
			this.logger.error(`Failed to load environment config: ${error}`);
			throw new Error(`Failed to load environment configuration: ${error}`);
		}
	}

	/**
	 * Apply environment variables to configuration
	 * @param config Base configuration
	 * @returns Merged configuration
	 */
	private applyEnvVars(config: EnvironmentConfig): EnvironmentConfig {
		const result = { ...config };

		// Override database configuration
		if (this.envVars.DB_TYPE) {
			result.database.type = this.envVars.DB_TYPE as any;
		}

		if (this.envVars.DB_FILENAME) {
			result.database.connection.filename = this.envVars.DB_FILENAME;
		}

		if (this.envVars.DB_HOST) {
			result.database.connection.host = this.envVars.DB_HOST;
		}

		if (this.envVars.DB_PORT) {
			result.database.connection.port = parseInt(this.envVars.DB_PORT, 10);
		}

		if (this.envVars.DB_NAME) {
			result.database.connection.database = this.envVars.DB_NAME;
		}

		if (this.envVars.DB_USER) {
			result.database.connection.user = this.envVars.DB_USER;
		}

		if (this.envVars.DB_PASSWORD) {
			result.database.connection.password = this.envVars.DB_PASSWORD;
		}

		// Override API configuration
		if (!result.api) {
			result.api = { port: 3000 };
		}

		if (this.envVars.API_PORT) {
			result.api.port = parseInt(this.envVars.API_PORT, 10);
		}

		// Override auth configuration
		if (!result.auth) {
			result.auth = { secret: 'default-secret', tokenExpiry: '24h' };
		}

		if (this.envVars.JWT_SECRET) {
			result.auth.secret = this.envVars.JWT_SECRET;
		}

		if (this.envVars.JWT_EXPIRY) {
			result.auth.tokenExpiry = this.envVars.JWT_EXPIRY;
		}

		// Override deployment configuration
		if (!result.deployment) {
			result.deployment = {};
		}

		if (this.envVars.DEPLOY_HOST) {
			result.deployment.host = this.envVars.DEPLOY_HOST;
		}

		if (this.envVars.DEPLOY_HTTPS) {
			result.deployment.https = this.envVars.DEPLOY_HTTPS === 'true';
		}

		if (this.envVars.DEPLOY_CERT_PATH) {
			result.deployment.certPath = this.envVars.DEPLOY_CERT_PATH;
		}

		if (this.envVars.DEPLOY_KEY_PATH) {
			result.deployment.keyPath = this.envVars.DEPLOY_KEY_PATH;
		}

		// Override logging configuration
		if (!result.logging) {
			result.logging = { level: 'info', console: true };
		}

		if (this.envVars.LOG_LEVEL) {
			result.logging.level = this.envVars.LOG_LEVEL as any;
		}

		return result;
	}

	/**
	 * Apply environment configuration to application configuration
	 * @param appConfig Application configuration
	 * @returns Merged application configuration
	 */
	applyToAppConfig(appConfig: AppConfig): AppConfig {
		if (!this.config) {
			throw new Error('Environment configuration not loaded. Call loadEnvironmentConfig() first.');
		}

		const result = { ...appConfig };

		// Override database configuration
		result.database = {
			...result.database,
			...this.config.database
		};

		// Override API configuration
		if (this.config.api) {
			result.port = this.config.api.port;
		}

		// Override auth configuration
		if (this.config.auth && result.auth) {
			result.auth.secret = this.config.auth.secret;
			result.auth.tokenExpiry = this.config.auth.tokenExpiry;
		}

		// Set production flag
		result.production = this.env === 'production';

		this.appConfig = result;
		return result;
	}

	/**
	 * Get the current environment
	 * @returns Environment name
	 */
	getEnvironment(): Environment {
		return this.env;
	}

	/**
	 * Get the current environment configuration
	 * @returns Environment configuration
	 */
	getConfig(): EnvironmentConfig {
		if (!this.config) {
			throw new Error('Environment configuration not loaded. Call loadEnvironmentConfig() first.');
		}

		return this.config;
	}

	/**
	 * Get the application configuration
	 * @returns Application configuration
	 */
	getAppConfig(): AppConfig {
		if (!this.appConfig) {
			throw new Error('Application configuration not applied. Call applyToAppConfig() first.');
		}

		return this.appConfig;
	}

	/**
	 * Get log level based on environment
	 * @returns Log level
	 */
	getLogLevel(): string {
		if (!this.config || !this.config.logging) {
			// Default log levels by environment
			switch (this.env) {
				case 'development':
					return 'debug';
				case 'test':
					return 'error';
				case 'staging':
					return 'info';
				case 'production':
					return 'warn';
				default:
					return 'info';
			}
		}

		return this.config.logging.level;
	}

	/**
	 * Create a deployment configuration file
	 * @param outputPath Output file path
	 */
	createDeploymentConfig(outputPath: string): void {
		if (!this.config) {
			throw new Error('Environment configuration not loaded. Call loadEnvironmentConfig() first.');
		}

		if (!this.appConfig) {
			throw new Error('Application configuration not applied. Call applyToAppConfig() first.');
		}

		const deployConfig = {
			app: {
				name: this.appConfig.name,
				version: this.appConfig.version
			},
			environment: this.env,
			server: {
				port: this.config.api?.port || 3000,
				host: this.config.deployment?.host || 'localhost',
				https: this.config.deployment?.https || false,
				behindProxy: this.config.deployment?.behindProxy || false
			},
			database: {
				type: this.config.database.type,
				connection: {
					// Don't include sensitive info like passwords
					host: this.config.database.connection.host,
					port: this.config.database.connection.port,
					database: this.config.database.connection.database,
					user: this.config.database.connection.user
				}
			},
			logging: this.config.logging || { level: 'info', console: true },
			scaling: this.config.deployment?.scaling || { minInstances: 1, maxInstances: 1 }
		};

		// Write to file
		fs.writeFileSync(outputPath, JSON.stringify(deployConfig, null, 2), 'utf8');
		this.logger.info(`Deployment configuration written to ${outputPath}`);
	}
}

/**
 * Create a default environment configuration file
 * @param outputPath Output file path
 */
export function createDefaultEnvironmentConfig(outputPath: string): void {
	const defaultConfig = {
		development: {
			name: 'development',
			database: {
				type: 'sqlite',
				connection: {
					filename: 'data/dev.sqlite'
				},
				synchronize: true
			},
			api: {
				port: 3000,
				cors: {
					origin: '*'
				}
			},
			auth: {
				secret: 'dev-secret-key-change-me',
				tokenExpiry: '24h'
			},
			logging: {
				level: 'debug',
				console: true,
				file: true,
				filePath: 'logs/dev.log'
			}
		},
		test: {
			name: 'test',
			database: {
				type: 'sqlite',
				connection: {
					filename: ':memory:'
				},
				synchronize: true
			},
			api: {
				port: 3001,
				cors: {
					origin: '*'
				}
			},
			auth: {
				secret: 'test-secret-key',
				tokenExpiry: '1h'
			},
			logging: {
				level: 'error',
				console: true,
				file: false
			}
		},
		staging: {
			name: 'staging',
			database: {
				type: 'postgres',
				connection: {
					host: 'localhost',
					port: 5432,
					database: 'app_staging',
					user: 'app_user',
					password: 'change-me-in-env-file',
					ssl: false
				},
				synchronize: false
			},
			api: {
				port: 3000,
				cors: {
					origin: ['https://staging.example.com']
				}
			},
			auth: {
				secret: 'change-me-in-env-file',
				tokenExpiry: '12h'
			},
			logging: {
				level: 'info',
				console: true,
				file: true,
				filePath: 'logs/staging.log'
			},
			deployment: {
				host: '0.0.0.0',
				behindProxy: true,
				scaling: {
					minInstances: 1,
					maxInstances: 2
				}
			}
		},
		production: {
			name: 'production',
			database: {
				type: 'postgres',
				connection: {
					host: 'db.example.com',
					port: 5432,
					database: 'app_production',
					user: 'app_user',
					password: 'change-me-in-env-file',
					ssl: true
				},
				synchronize: false
			},
			api: {
				port: 3000,
				cors: {
					origin: ['https://example.com'],
					allowedHeaders: ['Content-Type', 'Authorization']
				}
			},
			auth: {
				secret: 'change-me-in-env-file',
				tokenExpiry: '8h'
			},
			logging: {
				level: 'warn',
				console: true,
				file: true,
				filePath: 'logs/production.log'
			},
			deployment: {
				host: '0.0.0.0',
				https: true,
				certPath: '/etc/letsencrypt/live/example.com/fullchain.pem',
				keyPath: '/etc/letsencrypt/live/example.com/privkey.pem',
				behindProxy: true,
				scaling: {
					minInstances: 2,
					maxInstances: 5
				}
			}
		}
	};

	// Write to file
	fs.writeFileSync(outputPath, yaml.dump(defaultConfig), 'utf8');
	console.log(`Default environment configuration written to ${outputPath}`);
}