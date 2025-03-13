
/**
 * Integration Schema Definition
 * Defines schemas for YAML-based integration configurations
 */

/**
 * Integration configuration
 */
export interface IntegrationConfig {
	/** Integration name */
	name: string;
	/** Integration type */
	type: IntegrationType;
	/** Integration description */
	description?: string;
	/** Configuration specific to integration type */
	config: RestIntegrationConfig | WebhookIntegrationConfig | CustomIntegrationConfig;
	/** Authentication configuration */
	auth?: IntegrationAuthConfig;
	/** Event handlers */
	handlers?: IntegrationEventHandler[];
	/** Whether the integration is enabled */
	enabled?: boolean;
}

/**
 * Integration type enum
 */
export enum IntegrationType {
	REST = 'rest',
	WEBHOOK = 'webhook',
	GRAPHQL = 'graphql',
	GRPC = 'grpc',
	CUSTOM = 'custom'
}

/**
 * REST integration configuration
 */
export interface RestIntegrationConfig {
	/** Base URL for the API */
	baseUrl: string;
	/** Default request headers */
	headers?: Record<string, string>;
	/** Timeout in milliseconds */
	timeout?: number;
	/** Rate limiting configuration */
	rateLimit?: {
		/** Maximum requests per interval */
		maxRequests: number;
		/** Interval in milliseconds */
		interval: number;
	};
	/** Retry configuration */
	retry?: {
		/** Maximum number of retries */
		maxRetries: number;
		/** Base delay between retries in milliseconds */
		baseDelay: number;
		/** Maximum delay between retries in milliseconds */
		maxDelay?: number;
	};
	/** Endpoints configuration */
	endpoints: RestEndpoint[];
}

/**
 * REST endpoint configuration
 */
export interface RestEndpoint {
	/** Endpoint name */
	name: string;
	/** HTTP method */
	method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
	/** Path relative to base URL */
	path: string;
	/** Request data mapping */
	requestMapping?: string;
	/** Response data mapping */
	responseMapping?: string;
	/** Endpoint-specific headers */
	headers?: Record<string, string>;
	/** Timeout in milliseconds */
	timeout?: number;
	/** Cache configuration */
	cache?: {
		/** Time-to-live in seconds */
		ttl: number;
		/** Cache key parameters */
		keyParams?: string[];
	};
}

/**
 * Webhook integration configuration
 */
export interface WebhookIntegrationConfig {
	/** Endpoint path */
	path: string;
	/** HTTP method */
	method: 'POST' | 'PUT' | 'PATCH';
	/** Signature verification */
	signature?: {
		/** Header containing signature */
		header: string;
		/** Secret for verification */
		secret: string;
		/** Algorithm for verification */
		algorithm: 'sha1' | 'sha256' | 'sha512';
	};
	/** Payload validation schema */
	validation?: {
		/** Schema type */
		type: 'json-schema';
		/** Schema definition */
		schema: any;
	};
}

/**
 * Custom integration configuration
 */
export interface CustomIntegrationConfig {
	/** Handler implementation */
	implementation: string;
	/** Additional configuration */
	options?: Record<string, any>;
}

/**
 * Integration authentication configuration
 */
export interface IntegrationAuthConfig {
	/** Authentication type */
	type: 'none' | 'basic' | 'apiKey' | 'bearer' | 'oauth2' | 'custom';
	/** Basic auth configuration */
	basic?: {
		/** Username */
		username: string;
		/** Password */
		password: string;
	};
	/** API key configuration */
	apiKey?: {
		/** Key name */
		name: string;
		/** Key value */
		value: string;
		/** Key location */
		in: 'header' | 'query';
	};
	/** Bearer token configuration */
	bearer?: {
		/** Token value */
		token: string;
		/** Token source */
		source?: 'static' | 'environment' | 'function';
	};
	/** OAuth2 configuration */
	oauth2?: {
		/** Grant type */
		grantType: 'client_credentials' | 'authorization_code' | 'password' | 'implicit';
		/** Token URL */
		tokenUrl: string;
		/** Authorization URL */
		authorizationUrl?: string;
		/** Client ID */
		clientId: string;
		/** Client secret */
		clientSecret: string;
		/** Scopes */
		scopes?: string[];
		/** Additional parameters */
		additionalParams?: Record<string, string>;
	};
	/** Custom authentication configuration */
	custom?: {
		/** Handler implementation */
		implementation: string;
		/** Additional configuration */
		options?: Record<string, any>;
	};
}

/**
 * Integration event handler
 */
export interface IntegrationEventHandler {
	/** Event name */
	event: string;
	/** Handler implementation */
	handler: string;
	/** Condition for event handling */
	condition?: string;
	/** Synchronous execution */
	sync?: boolean;
}

/**
 * JSON Schema for integration configuration validation
 */
export const integrationJsonSchema = {
	type: 'object',
	required: ['name', 'type', 'config'],
	properties: {
		name: {
			type: 'string',
			description: 'Integration name'
		},
		type: {
			type: 'string',
			enum: ['rest', 'webhook', 'graphql', 'grpc', 'custom'],
			description: 'Integration type'
		},
		description: {
			type: 'string',
			description: 'Integration description'
		},
		config: {
			type: 'object',
			description: 'Configuration specific to integration type'
		},
		auth: {
			type: 'object',
			description: 'Authentication configuration'
		},
		handlers: {
			type: 'array',
			items: {
				type: 'object',
				required: ['event', 'handler'],
				properties: {
					event: {
						type: 'string',
						description: 'Event name'
					},
					handler: {
						type: 'string',
						description: 'Handler implementation'
					},
					condition: {
						type: 'string',
						description: 'Condition for event handling'
					},
					sync: {
						type: 'boolean',
						description: 'Synchronous execution'
					}
				}
			}
		},
		enabled: {
			type: 'boolean',
			description: 'Whether the integration is enabled'
		}
	},
	allOf: [
		{
			if: {
				properties: { type: { enum: ['rest'] } }
			},
			then: {
				properties: {
					config: { $ref: '#/definitions/restConfig' }
				}
			}
		},
		{
			if: {
				properties: { type: { enum: ['webhook'] } }
			},
			then: {
				properties: {
					config: { $ref: '#/definitions/webhookConfig' }
				}
			}
		},
		{
			if: {
				properties: { type: { enum: ['custom'] } }
			},
			then: {
				properties: {
					config: { $ref: '#/definitions/customConfig' }
				}
			}
		}
	],
	definitions: {
		restConfig: {
			type: 'object',
			required: ['baseUrl', 'endpoints'],
			properties: {
				baseUrl: {
					type: 'string',
					description: 'Base URL for the API'
				},
				headers: {
					type: 'object',
					description: 'Default request headers'
				},
				timeout: {
					type: 'integer',
					description: 'Timeout in milliseconds'
				},
				rateLimit: {
					type: 'object',
					required: ['maxRequests', 'interval'],
					properties: {
						maxRequests: {
							type: 'integer',
							description: 'Maximum requests per interval'
						},
						interval: {
							type: 'integer',
							description: 'Interval in milliseconds'
						}
					}
				},
				retry: {
					type: 'object',
					required: ['maxRetries', 'baseDelay'],
					properties: {
						maxRetries: {
							type: 'integer',
							description: 'Maximum number of retries'
						},
						baseDelay: {
							type: 'integer',
							description: 'Base delay between retries in milliseconds'
						},
						maxDelay: {
							type: 'integer',
							description: 'Maximum delay between retries in milliseconds'
						}
					}
				},
				endpoints: {
					type: 'array',
					items: {
						type: 'object',
						required: ['name', 'method', 'path'],
						properties: {
							name: {
								type: 'string',
								description: 'Endpoint name'
							},
							method: {
								type: 'string',
								enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
								description: 'HTTP method'
							},
							path: {
								type: 'string',
								description: 'Path relative to base URL'
							},
							requestMapping: {
								type: 'string',
								description: 'Request data mapping'
							},
							responseMapping: {
								type: 'string',
								description: 'Response data mapping'
							},
							headers: {
								type: 'object',
								description: 'Endpoint-specific headers'
							},
							timeout: {
								type: 'integer',
								description: 'Timeout in milliseconds'
							},
							cache: {
								type: 'object',
								required: ['ttl'],
								properties: {
									ttl: {
										type: 'integer',
										description: 'Time-to-live in seconds'
									},
									keyParams: {
										type: 'array',
										items: {
											type: 'string'
										},
										description: 'Cache key parameters'
									}
								}
							}
						}
					}
				}
			}
		},
		webhookConfig: {
			type: 'object',
			required: ['path', 'method'],
			properties: {
				path: {
					type: 'string',
					description: 'Endpoint path'
				},
				method: {
					type: 'string',
					enum: ['POST', 'PUT', 'PATCH'],
					description: 'HTTP method'
				},
				signature: {
					type: 'object',
					required: ['header', 'secret', 'algorithm'],
					properties: {
						header: {
							type: 'string',
							description: 'Header containing signature'
						},
						secret: {
							type: 'string',
							description: 'Secret for verification'
						},
						algorithm: {
							type: 'string',
							enum: ['sha1', 'sha256', 'sha512'],
							description: 'Algorithm for verification'
						}
					}
				},
				validation: {
					type: 'object',
					required: ['type', 'schema'],
					properties: {
						type: {
							type: 'string',
							enum: ['json-schema'],
							description: 'Schema type'
						},
						schema: {
							description: 'Schema definition'
						}
					}
				}
			}
		},
		customConfig: {
			type: 'object',
			required: ['implementation'],
			properties: {
				implementation: {
					type: 'string',
					description: 'Handler implementation'
				},
				options: {
					type: 'object',
					description: 'Additional configuration'
				}
			}
		}
	}
};

/**
 * Create a basic REST integration configuration
 * @param name Integration name
 * @param baseUrl Base URL for the API
 * @param endpoints Array of endpoint configurations
 * @returns Integration configuration
 */
export function createRestIntegration(
	name: string,
	baseUrl: string,
	endpoints: RestEndpoint[]
): IntegrationConfig {
	return {
		name,
		type: IntegrationType.REST,
		config: {
			baseUrl,
			endpoints
		},
		enabled: true
	};
}

/**
 * Create a basic webhook integration configuration
 * @param name Integration name
 * @param path Endpoint path
 * @param handler Handler implementation
 * @returns Integration configuration
 */
export function createWebhookIntegration(
	name: string,
	path: string,
	handler: string
): IntegrationConfig {
	return {
		name,
		type: IntegrationType.WEBHOOK,
		config: {
			path,
			method: 'POST'
		},
		handlers: [
			{
				event: 'webhook:receive',
				handler
			}
		],
		enabled: true
	};
}

/**
 * Validate an integration configuration against the schema
 * @param config Integration configuration
 * @returns Validation result
 */
export function validateIntegrationConfig(config: IntegrationConfig): { valid: boolean; errors?: string[] } {
	// In a real implementation, this would use Ajv or another JSON Schema validator
	// This is a simplified placeholder

	const errors: string[] = [];

	// Basic validation
	if (!config.name) {
		errors.push('Integration name is required');
	}

	if (!config.type) {
		errors.push('Integration type is required');
	}

	if (!config.config) {
		errors.push('Integration configuration is required');
	}

	// Type-specific validation
	if (config.type === IntegrationType.REST) {
		const restConfig = config.config as RestIntegrationConfig;

		if (!restConfig.baseUrl) {
			errors.push('REST integration requires a baseUrl');
		}

		if (!restConfig.endpoints || !Array.isArray(restConfig.endpoints) || restConfig.endpoints.length === 0) {
			errors.push('REST integration requires at least one endpoint');
		}
	} else if (config.type === IntegrationType.WEBHOOK) {
		const webhookConfig = config.config as WebhookIntegrationConfig;

		if (!webhookConfig.path) {
			errors.push('Webhook integration requires a path');
		}

		if (!webhookConfig.method) {
			errors.push('Webhook integration requires a method');
		}
	} else if (config.type === IntegrationType.CUSTOM) {
		const customConfig = config.config as CustomIntegrationConfig;

		if (!customConfig.implementation) {
			errors.push('Custom integration requires an implementation');
		}
	}

	return {
		valid: errors.length === 0,
		errors: errors.length > 0 ? errors : undefined
	};
}