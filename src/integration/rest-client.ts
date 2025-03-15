/**
 * REST Client
 * Generic REST API client for integration with external services
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import {
	RestIntegrationConfig,
	RestEndpoint,
	IntegrationAuthConfig
} from './integration-schema';
import { Logger } from '../core/types';

/**
 * Request options
 */
export interface RequestOptions {
	/** Request path parameters */
	pathParams?: Record<string, string>;
	/** Request query parameters */
	queryParams?: Record<string, string>;
	/** Request headers */
	headers?: Record<string, string>;
	/** Request body */
	body?: any;
	/** Request timeout */
	timeout?: number;
	/** Whether to use cache */
	useCache?: boolean;
}

/**
 * REST client for external API integration
 */
export class RestClient {
	/** Axios instance */
	private client: AxiosInstance;
	/** Integration configuration */
	private config: RestIntegrationConfig;
	/** Authentication configuration */
	private authConfig?: IntegrationAuthConfig;
	/** Cache storage */
	private cache: Map<string, { data: any; expires: number }> = new Map();
	/** Logger instance */
	private logger: Logger;
	/** Request mappings */
	private requestMappings: Map<string, Function> = new Map();
	/** Response mappings */
	private responseMappings: Map<string, Function> = new Map();
	/** Token refresh promise */
	private refreshTokenPromise: Promise<string> | null = null;

	/**
	 * Constructor
	 * @param config Integration configuration
	 * @param authConfig Authentication configuration
	 * @param logger Logger instance
	 */
	constructor(
		config: RestIntegrationConfig,
		authConfig: IntegrationAuthConfig | undefined,
		logger: Logger
	) {
		this.config = config;
		this.authConfig = authConfig;
		this.logger = logger;

		// Create axios instance with default config
		this.client = axios.create({
			baseURL: config.baseUrl,
			timeout: config.timeout || 30000,
			headers: config.headers || {}
		});

		// Set up interceptors
		this.setupInterceptors();

		// Set up mappings
		this.loadMappings();
	}

	/**
	 * Set up axios interceptors
	 */
	private setupInterceptors(): void {
		// Request interceptor
		this.client.interceptors.request.use(
			async (config) => {
				// Apply authentication
				config = await this.applyAuthentication(config);

				// Ensure headers is never undefined
				config.headers = config.headers || {};

				// Log request
				this.logger.debug(`REST Client Request: ${config.method?.toUpperCase()} ${config.url}`, {
					headers: config.headers,
					data: config.data
				});

				return config;
			},
			(error) => {
				this.logger.error('REST Client Request Error:', error);
				return Promise.reject(error);
			}
		);

		// Response interceptor
		this.client.interceptors.response.use(
			(response) => {
				// Log response
				this.logger.debug(`REST Client Response: ${response.status}`, {
					data: response.data
				});

				return response;
			},
			async (error: AxiosError) => {
				// Log error
				this.logger.error(`REST Client Response Error: ${error.message}`, {
					status: error.response?.status,
					data: error.response?.data
				});

				// Handle authentication errors
				if (error.response?.status === 401 && this.authConfig?.type === 'oauth2') {
					if (!this.refreshTokenPromise) {
						// Try to refresh the token
						this.refreshTokenPromise = this.refreshAccessToken();
					}

					try {
						// Wait for token refresh
						const token = await this.refreshTokenPromise;

						// Update the failed request's authorization header
						const originalRequest = error.config as AxiosRequestConfig;
						if (originalRequest.headers) {
							originalRequest.headers['Authorization'] = `Bearer ${token}`;
						}

						// Retry the request
						return this.client(originalRequest);
					} catch (refreshError) {
						// Token refresh failed
						this.logger.error('Token refresh failed', refreshError);
						return Promise.reject(error);
					} finally {
						this.refreshTokenPromise = null;
					}
				}

				// Apply retries if configured
				if (this.config.retry && this.shouldRetry(error)) {
					return this.retryRequest(error);
				}

				return Promise.reject(error);
			}
		);
	}

	/**
	 * Load request and response mappings
	 */
	private loadMappings(): void {
		if (!this.config.endpoints) {
			return;
		}

		for (const endpoint of this.config.endpoints) {
			if (endpoint.requestMapping) {
				try {
					this.requestMappings.set(
						endpoint.name,
						this.createMappingFunction(endpoint.requestMapping)
					);
				} catch (error: any) {
					this.logger.error(`Failed to load request mapping for ${endpoint.name}:`, error);
				}
			}

			if (endpoint.responseMapping) {
				try {
					this.responseMappings.set(
						endpoint.name,
						this.createMappingFunction(endpoint.responseMapping)
					);
				} catch (error: any) {
					this.logger.error(`Failed to load response mapping for ${endpoint.name}:`, error);
				}
			}
		}
	}

	/**
	 * Create a mapping function from a mapping string
	 * @param mapping Mapping string
	 * @returns Mapping function
	 */
	private createMappingFunction(mapping: string): Function {
		// For inline mappings (JavaScript code), create a function
		if (mapping.includes('=>') || mapping.includes('function')) {
			return new Function('data', `return (${mapping})(data);`);
		}

		// For external file mappings, load the file
		if (mapping.startsWith('./') || mapping.startsWith('/')) {
			// In a real implementation, this would dynamically load the file
			throw new Error(`External mapping files not supported yet: ${mapping}`);
		}

		// For simple property mappings (e.g. '$.data.items'), create a simple accessor
		return new Function('data', `return ${this.convertJsonPathToJs(mapping)};`);
	}

	/**
	 * Convert a JSONPath-like string to JavaScript
	 * @param path JSONPath-like string
	 * @returns JavaScript path expression
	 */
	private convertJsonPathToJs(path: string): string {
		// Simple implementation, handles basic paths like '$.data.items'
		return path.replace(/^\$\./, 'data.');
	}

	/**
	 * Apply authentication to a request
	 * @param config Axios request config
	 * @returns Updated request config
	 */
	private async applyAuthentication(config: AxiosRequestConfig): Promise<AxiosRequestConfig> {
		if (!this.authConfig || this.authConfig.type === 'none') {
			return config;
		}

		const headers = config.headers || {};

		switch (this.authConfig.type) {
			case 'basic':
				if (this.authConfig.basic) {
					const { username, password } = this.authConfig.basic;
					const auth = Buffer.from(`${username}:${password}`).toString('base64');
					headers['Authorization'] = `Basic ${auth}`;
				}
				break;

			case 'apiKey':
				if (this.authConfig.apiKey) {
					const { name, value, in: location } = this.authConfig.apiKey;
					if (location === 'header') {
						headers[name] = value;
					} else if (location === 'query') {
						config.params = {
							...config.params,
							[name]: value
						};
					}
				}
				break;

			case 'bearer':
				if (this.authConfig.bearer) {
					const { token, source } = this.authConfig.bearer;
					let bearerToken = token;

					if (source === 'environment') {
						bearerToken = process.env[token] || '';
					} else if (source === 'function') {
						// This would dynamically load and execute a function
						// For simplicity, we'll just use the static token
						bearerToken = token;
					}

					headers['Authorization'] = `Bearer ${bearerToken}`;
				}
				break;

			case 'oauth2':
				if (this.authConfig.oauth2) {
					// Get the token - in a real implementation, this would handle token caching
					const accessToken = await this.getAccessToken();
					headers['Authorization'] = `Bearer ${accessToken}`;
				}
				break;

			case 'custom':
				if (this.authConfig.custom && this.authConfig.custom.implementation) {
					// In a real implementation, this would dynamically load and execute the custom auth handler
					this.logger.warn('Custom authentication not implemented');
				}
				break;
		}

		config.headers = headers;
		return config;
	}

	/**
	 * Get an OAuth2 access token
	 * @returns Access token
	 */
	private async getAccessToken(): Promise<string> {
		if (!this.authConfig?.oauth2) {
			throw new Error('OAuth2 configuration not provided');
		}

		// In a real implementation, this would check for a cached token
		// and only fetch a new one if necessary

		const { tokenUrl, clientId, clientSecret, grantType, additionalParams } = this.authConfig.oauth2;

		const params = new URLSearchParams();
		params.append('grant_type', grantType);
		params.append('client_id', clientId);
		params.append('client_secret', clientSecret);

		if (additionalParams) {
			for (const [key, value] of Object.entries(additionalParams)) {
				params.append(key, value);
			}
		}

		try {
			const response = await axios.post(tokenUrl, params.toString(), {
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded'
				}
			});

			if (response.data && response.data.access_token) {
				return response.data.access_token;
			}

			throw new Error('Invalid token response');
		} catch (error: any) {
			this.logger.error('Failed to get OAuth2 token:', error);
			throw error;
		}
	}

	/**
	 * Refresh an OAuth2 access token
	 * @returns New access token
	 */
	private async refreshAccessToken(): Promise<string> {
		if (!this.authConfig?.oauth2) {
			throw new Error('OAuth2 configuration not provided');
		}

		// In a real implementation, this would use the refresh token
		// For simplicity, we'll just get a new token
		return this.getAccessToken();
	}

	/**
	 * Check if a request should be retried
	 * @param error Request error
	 * @returns Whether the request should be retried
	 */
	private shouldRetry(error: AxiosError): boolean {
		if (!this.config.retry) {
			return false;
		}

		const { maxRetries } = this.config.retry;
		const retryCount = (error.config as any)?.__retryCount || 0;

		if (retryCount >= maxRetries) {
			return false;
		}

		// Retry on network errors or 5xx responses
		return !error.response || (error.response.status >= 500 && error.response.status < 600);
	}

	/**
	 * Retry a failed request
	 * @param error Request error
	 * @returns Retried request promise
	 */
	private async retryRequest(error: AxiosError): Promise<AxiosResponse> {
		if (!this.config.retry) {
			throw error;
		}

		const { baseDelay, maxDelay } = this.config.retry;
		const config = error.config as any;
		config.__retryCount = (config.__retryCount || 0) + 1;

		// Calculate delay with exponential backoff
		const delay = Math.min(
			baseDelay * Math.pow(2, config.__retryCount - 1),
			maxDelay || 30000
		);

		// Log retry attempt
		this.logger.info(
			`Retrying request to ${config.url} (Attempt ${config.__retryCount})`,
			{ delay }
		);

		// Wait for the delay
		await new Promise(resolve => setTimeout(resolve, delay));

		// Retry the request
		return this.client(config);
	}

	/**
	 * Execute a request
	 * @param endpoint Endpoint name or configuration
	 * @param options Request options
	 * @returns Response data
	 */
	async execute<T = any>(
		endpoint: string | RestEndpoint,
		options: RequestOptions = {}
	): Promise<T> {
		const endpointConfig = typeof endpoint === 'string'
			? this.findEndpoint(endpoint)
			: endpoint;

		if (!endpointConfig) {
			throw new Error(`Endpoint not found: ${endpoint}`);
		}

		// Check cache
		const cacheKey = this.getCacheKey(endpointConfig, options);
		if (options.useCache !== false && endpointConfig.cache && cacheKey) {
			const cached = this.cache.get(cacheKey);
			if (cached && cached.expires > Date.now()) {
				this.logger.debug(`Cache hit for ${endpointConfig.name}`);
				return cached.data;
			}
		}

		// Prepare request
		let url = this.buildUrl(endpointConfig.path, options.pathParams);
		let body = options.body;

		// Apply request mapping
		if (endpointConfig.name && this.requestMappings.has(endpointConfig.name)) {
			body = this.requestMappings.get(endpointConfig.name)!(body);
		}

		// Prepare request config
		const requestConfig: AxiosRequestConfig = {
			url,
			method: endpointConfig.method,
			params: options.queryParams,
			data: body,
			headers: {
				...endpointConfig.headers,
				...options.headers
			},
			timeout: options.timeout || endpointConfig.timeout || this.config.timeout
		};

		try {
			// Execute request
			const response = await this.client(requestConfig);

			// Apply response mapping
			let responseData = response.data;
			if (endpointConfig.name && this.responseMappings.has(endpointConfig.name)) {
				responseData = this.responseMappings.get(endpointConfig.name)!(responseData);
			}

			// Store in cache if needed
			if (endpointConfig.cache && cacheKey) {
				const ttl = endpointConfig.cache.ttl * 1000;
				this.cache.set(cacheKey, {
					data: responseData,
					expires: Date.now() + ttl
				});
			}

			return responseData;
		} catch (error: any) {
			this.logger.error(`Error executing ${endpointConfig.name}:`, error);
			throw error;
		}
	}

	/**
	 * Execute GET request
	 * @param endpoint Endpoint name
	 * @param options Request options
	 * @returns Response data
	 */
	async get<T = any>(endpoint: string, options: RequestOptions = {}): Promise<T> {
		const endpointConfig = this.findEndpoint(endpoint);
		if (!endpointConfig) {
			throw new Error(`Endpoint not found: ${endpoint}`);
		}

		if (endpointConfig.method !== 'GET') {
			throw new Error(`Endpoint ${endpoint} is not a GET endpoint`);
		}

		return this.execute<T>(endpointConfig, options);
	}

	/**
	 * Execute POST request
	 * @param endpoint Endpoint name
	 * @param body Request body
	 * @param options Request options
	 * @returns Response data
	 */
	async post<T = any>(
		endpoint: string,
		body: any,
		options: RequestOptions = {}
	): Promise<T> {
		const endpointConfig = this.findEndpoint(endpoint);
		if (!endpointConfig) {
			throw new Error(`Endpoint not found: ${endpoint}`);
		}

		if (endpointConfig.method !== 'POST') {
			throw new Error(`Endpoint ${endpoint} is not a POST endpoint`);
		}

		return this.execute<T>(endpointConfig, { ...options, body });
	}

	/**
	 * Execute PUT request
	 * @param endpoint Endpoint name
	 * @param body Request body
	 * @param options Request options
	 * @returns Response data
	 */
	async put<T = any>(
		endpoint: string,
		body: any,
		options: RequestOptions = {}
	): Promise<T> {
		const endpointConfig = this.findEndpoint(endpoint);
		if (!endpointConfig) {
			throw new Error(`Endpoint not found: ${endpoint}`);
		}

		if (endpointConfig.method !== 'PUT') {
			throw new Error(`Endpoint ${endpoint} is not a PUT endpoint`);
		}

		return this.execute<T>(endpointConfig, { ...options, body });
	}

	/**
	 * Execute PATCH request
	 * @param endpoint Endpoint name
	 * @param body Request body
	 * @param options Request options
	 * @returns Response data
	 */
	async patch<T = any>(
		endpoint: string,
		body: any,
		options: RequestOptions = {}
	): Promise<T> {
		const endpointConfig = this.findEndpoint(endpoint);
		if (!endpointConfig) {
			throw new Error(`Endpoint not found: ${endpoint}`);
		}

		if (endpointConfig.method !== 'PATCH') {
			throw new Error(`Endpoint ${endpoint} is not a PATCH endpoint`);
		}

		return this.execute<T>(endpointConfig, { ...options, body });
	}

	/**
	 * Execute DELETE request
	 * @param endpoint Endpoint name
	 * @param options Request options
	 * @returns Response data
	 */
	async delete<T = any>(
		endpoint: string,
		options: RequestOptions = {}
	): Promise<T> {
		const endpointConfig = this.findEndpoint(endpoint);
		if (!endpointConfig) {
			throw new Error(`Endpoint not found: ${endpoint}`);
		}

		if (endpointConfig.method !== 'DELETE') {
			throw new Error(`Endpoint ${endpoint} is not a DELETE endpoint`);
		}

		return this.execute<T>(endpointConfig, options);
	}

	/**
	 * Find an endpoint by name
	 * @param name Endpoint name
	 * @returns Endpoint configuration or undefined
	 */
	private findEndpoint(name: string): RestEndpoint | undefined {
		return this.config.endpoints.find(endpoint => endpoint.name === name);
	}

	/**
	 * Build a URL with path parameters
	 * @param path URL path
	 * @param params Path parameters
	 * @returns URL with path parameters
	 */
	private buildUrl(path: string, params?: Record<string, string>): string {
		if (!params) {
			return path;
		}

		let url = path;
		for (const [key, value] of Object.entries(params)) {
			url = url.replace(`:${key}`, encodeURIComponent(value));
		}

		return url;
	}

	/**
	 * Generate a cache key for a request
	 * @param endpoint Endpoint configuration
	 * @param options Request options
	 * @returns Cache key
	 */
	private getCacheKey(
		endpoint: RestEndpoint,
		options: RequestOptions
	): string | null {
		if (!endpoint.cache) {
			return null;
		}

		const { keyParams } = endpoint.cache;
		const parts = [endpoint.name];

		// Add path parameters
		if (options.pathParams) {
			for (const [key, value] of Object.entries(options.pathParams)) {
				if (!keyParams || keyParams.includes(key)) {
					parts.push(`${key}=${value}`);
				}
			}
		}

		// Add query parameters
		if (options.queryParams) {
			for (const [key, value] of Object.entries(options.queryParams)) {
				if (!keyParams || keyParams.includes(key)) {
					parts.push(`${key}=${value}`);
				}
			}
		}

		// Add body parameters if it's a simple object
		if (options.body && typeof options.body === 'object' && !Array.isArray(options.body)) {
			for (const [key, value] of Object.entries(options.body)) {
				if (!keyParams || keyParams.includes(key)) {
					if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
						parts.push(`${key}=${value}`);
					}
				}
			}
		}

		return parts.join(',');
	}

	/**
	 * Clear the cache
	 * @param endpoint Optional endpoint name to clear specific cache
	 */
	clearCache(endpoint?: string): void {
		if (endpoint) {
			// Clear cache for a specific endpoint
			for (const key of this.cache.keys()) {
				if (key.startsWith(`${endpoint},`)) {
					this.cache.delete(key);
				}
			}
		} else {
			// Clear all cache
			this.cache.clear();
		}
	}

	/**
	 * Get the cache size
	 * @returns Number of cached items
	 */
	getCacheSize(): number {
		return this.cache.size;
	}
}

/**
 * Create a REST client
 * @param config Integration configuration
 * @param authConfig Authentication configuration
 * @param logger Logger instance
 * @returns REST client instance
 */
export function createRestClient(
	config: RestIntegrationConfig,
	authConfig: IntegrationAuthConfig | undefined,
	logger: Logger
): RestClient {
	return new RestClient(config, authConfig, logger);
}