/**
 * Webhook Handler
 * Manages webhook registration and delivery
 */

import crypto from 'crypto';
import axios, { AxiosRequestConfig } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '@/core/types';
import { AppContext } from '@/core/app-context';
import { EventBus } from './event-bus';
/**
 * Webhook configuration
 */
export interface WebhookConfig {
	/** Webhook ID */
	id: string;
	/** Webhook URL */
	url: string;
	/** Event name to trigger on */
	event: string;
	/** Secret for signature verification */
	secret?: string;
	/** HTTP method (default: POST) */
	method?: 'GET' | 'POST' | 'PUT';
	/** Additional headers */
	headers?: Record<string, string>;
	/** Retry configuration */
	retry?: {
		/** Maximum number of retries */
		maxRetries: number;
		/** Delay between retries in ms */
		delay: number;
		/** Whether to use exponential backoff */
		exponential?: boolean;
	};
	/** Whether the webhook is enabled */
	enabled?: boolean;
	/** Description */
	description?: string;
	/** Webhook owner */
	owner?: string;
	/** Created date */
	createdAt?: string;
	/** Updated date */
	updatedAt?: string;
}

/**
 * Webhook event payload
 */
export interface WebhookPayload<T = any> {
	/** Webhook ID */
	id: string;
	/** Event name */
	event: string;
	/** Timestamp */
	timestamp: number;
	/** Event data */
	data: T;
}

/**
 * Webhook delivery status
 */
export enum WebhookDeliveryStatus {
	SUCCESS = 'success',
	FAILED = 'failed',
	PENDING = 'pending',
	RETRYING = 'retrying'
}

/**
 * Webhook delivery record
 */
export interface WebhookDelivery {
	/** Delivery ID */
	id: string;
	/** Webhook ID */
	webhookId: string;
	/** Event name */
	event: string;
	/** Delivery status */
	status: WebhookDeliveryStatus;
	/** Request details */
	request: {
		/** HTTP method */
		method: string;
		/** URL */
		url: string;
		/** Headers */
		headers: Record<string, string>;
		/** Request body */
		body: string;
	};
	/** Response details */
	response?: {
		/** Status code */
		statusCode: number;
		/** Response headers */
		headers: Record<string, string>;
		/** Response body */
		body: string;
	};
	/** Retry count */
	retryCount: number;
	/** Error message */
	error?: string;
	/** Request timestamp */
	timestamp: number;
	/** Completion timestamp */
	completedAt?: number;
}

/**
 * Webhook handler
 * Manages webhook registration and delivery
 */
export class WebhookHandler {
	/** Application context */
	private appContext: AppContext;
	/** Logger instance */
	private logger: Logger;
	/** Registered webhooks */
	private webhooks: Map<string, WebhookConfig> = new Map();
	/** Webhook deliveries */
	private deliveries: Map<string, WebhookDelivery> = new Map();
	/** Event bus */
	private eventBus: EventBus;

	/**
	 * Constructor
	 * @param appContext Application context
	 * @param logger Logger instance
	 * @param eventBus Event bus
	 */
	constructor(appContext: AppContext, logger: Logger, eventBus: EventBus) {
		this.appContext = appContext;
		this.logger = logger;
		this.eventBus = eventBus;
	}

	/**
	 * Initialize webhook handler
	 * Subscribe to the event bus
	 */
	initialize(): void {
		// Subscribe to all events on the event bus
		this.eventBus.subscribe('*', this.handleEvent.bind(this), {
			priority: 100, // Run after other handlers
			catchErrors: true
		});

		this.logger.info('Webhook handler initialized');
	}

	/**
	 * Register a webhook
	 * @param config Webhook configuration
	 * @returns Webhook ID
	 */
	registerWebhook(config: Omit<WebhookConfig, 'id'>): string {
		// Generate a unique ID if not provided
		const id = uuidv4();

		const webhook: WebhookConfig = {
			id,
			...config,
			enabled: config.enabled ?? true,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		};

		// Store the webhook
		this.webhooks.set(id, webhook);

		this.logger.info(`Registered webhook ${id} for event ${webhook.event}`);

		return id;
	}

	/**
	 * Update a webhook
	 * @param id Webhook ID
	 * @param updates Webhook updates
	 * @returns Updated webhook config
	 */
	updateWebhook(id: string, updates: Partial<WebhookConfig>): WebhookConfig | null {
		const webhook = this.webhooks.get(id);

		if (!webhook) {
			return null;
		}

		// Update the webhook
		const updated: WebhookConfig = {
			...webhook,
			...updates,
			id, // Ensure ID doesn't change
			updatedAt: new Date().toISOString()
		};

		// Store the updated webhook
		this.webhooks.set(id, updated);

		this.logger.info(`Updated webhook ${id}`);

		return updated;
	}

	/**
	 * Delete a webhook
	 * @param id Webhook ID
	 * @returns Whether the webhook was deleted
	 */
	deleteWebhook(id: string): boolean {
		const exists = this.webhooks.has(id);

		if (exists) {
			this.webhooks.delete(id);
			this.logger.info(`Deleted webhook ${id}`);
		}

		return exists;
	}

	/**
	 * Get a webhook by ID
	 * @param id Webhook ID
	 * @returns Webhook configuration
	 */
	getWebhook(id: string): WebhookConfig | undefined {
		return this.webhooks.get(id);
	}

	/**
	 * List all webhooks
	 * @param event Optional event filter
	 * @returns Webhook configurations
	 */
	listWebhooks(event?: string): WebhookConfig[] {
		const webhooks = Array.from(this.webhooks.values());

		if (event) {
			return webhooks.filter(webhook => webhook.event === event);
		}

		return webhooks;
	}

	/**
	 * Get a delivery by ID
	 * @param id Delivery ID
	 * @returns Webhook delivery
	 */
	getDelivery(id: string): WebhookDelivery | undefined {
		return this.deliveries.get(id);
	}

	/**
	 * List deliveries for a webhook
	 * @param webhookId Webhook ID
	 * @param limit Maximum number of deliveries to return
	 * @returns Webhook deliveries
	 */
	listDeliveries(webhookId: string, limit: number = 10): WebhookDelivery[] {
		const deliveries = Array.from(this.deliveries.values())
			.filter(delivery => delivery.webhookId === webhookId)
			.sort((a, b) => b.timestamp - a.timestamp); // Most recent first

		return deliveries.slice(0, limit);
	}

	/**
	 * Manually trigger a webhook
	 * @param webhookId Webhook ID
	 * @param eventData Event data
	 * @returns Delivery ID
	 */
	async triggerWebhook<T = any>(webhookId: string, eventData: T): Promise<string | null> {
		const webhook = this.webhooks.get(webhookId);

		if (!webhook || !webhook.enabled) {
			return null;
		}

		return this.deliverWebhook(webhook, webhook.event, eventData);
	}

	/**
	 * Retry a failed delivery
	 * @param deliveryId Delivery ID
	 * @returns Whether the retry was scheduled
	 */
	async retryDelivery(deliveryId: string): Promise<boolean> {
		const delivery = this.deliveries.get(deliveryId);

		if (!delivery || delivery.status !== WebhookDeliveryStatus.FAILED) {
			return false;
		}

		const webhook = this.webhooks.get(delivery.webhookId);

		if (!webhook || !webhook.enabled) {
			return false;
		}

		// Update delivery status
		const updatedDelivery: WebhookDelivery = {
			...delivery,
			status: WebhookDeliveryStatus.RETRYING,
			retryCount: delivery.retryCount + 1
		};

		this.deliveries.set(deliveryId, updatedDelivery);

		try {
			// Parse the original request body
			const eventData = JSON.parse(delivery.request.body).data;

			// Send the webhook
			const result = await this.sendWebhook(
				webhook,
				deliveryId,
				webhook.event,
				eventData
			);

			return result;
		} catch (error: any) {
			this.logger.error(`Failed to retry delivery ${deliveryId}: ${error}`);

			// Update delivery status
			const failedDelivery: WebhookDelivery = {
				...updatedDelivery,
				status: WebhookDeliveryStatus.FAILED,
				error: String(error)
			};

			this.deliveries.set(deliveryId, failedDelivery);

			return false;
		}
	}

	/**
	 * Event handler
	 * Called when an event is published on the event bus
	 * @param eventData Event data
	 * @param context Event context
	 */
	private async handleEvent(eventData: any, context: any): Promise<void> {
		const { eventName } = context;

		// Skip internal events
		if (eventName.startsWith('webhook.')) {
			return;
		}

		// Find webhooks that should be triggered for this event
		const matchingWebhooks = this.listWebhooks(eventName).filter(webhook => webhook.enabled);

		if (matchingWebhooks.length === 0) {
			return;
		}

		this.logger.debug(`Found ${matchingWebhooks.length} webhooks for event ${eventName}`);

		// Deliver the event to each webhook
		for (const webhook of matchingWebhooks) {
			this.deliverWebhook(webhook, eventName, eventData).catch(error => {
				this.logger.error(`Failed to deliver webhook ${webhook.id}: ${error}`);
			});
		}
	}

	/**
	 * Deliver a webhook
	 * @param webhook Webhook configuration
	 * @param eventName Event name
	 * @param eventData Event data
	 * @returns Delivery ID
	 */
	private async deliverWebhook<T = any>(
		webhook: WebhookConfig,
		eventName: string,
		eventData: T
	): Promise<string> {
		// Create a delivery ID
		const deliveryId = uuidv4();

		// Create the delivery record
		const delivery: WebhookDelivery = {
			id: deliveryId,
			webhookId: webhook.id,
			event: eventName,
			status: WebhookDeliveryStatus.PENDING,
			request: {
				method: webhook.method || 'POST',
				url: webhook.url,
				headers: {},
				body: '' // Will be set during sending
			},
			retryCount: 0,
			timestamp: Date.now()
		};

		// Store the delivery
		this.deliveries.set(deliveryId, delivery);

		// Send the webhook
		try {
			await this.sendWebhook(webhook, deliveryId, eventName, eventData);
			return deliveryId;
		} catch (error: any) {
			this.logger.error(`Failed to deliver webhook ${webhook.id}: ${error}`);

			// Schedule retry if configured
			if (webhook.retry && webhook.retry.maxRetries > 0) {
				this.scheduleRetry(webhook, deliveryId, eventName, eventData, 0);
			}

			return deliveryId;
		}
	}

	/**
	 * Send a webhook
	 * @param webhook Webhook configuration
	 * @param deliveryId Delivery ID
	 * @param eventName Event name
	 * @param eventData Event data
	 * @returns Whether the delivery was successful
	 */
	private async sendWebhook<T = any>(
		webhook: WebhookConfig,
		deliveryId: string,
		eventName: string,
		eventData: T
	): Promise<boolean> {
		// Get the delivery record
		const delivery = this.deliveries.get(deliveryId);

		if (!delivery) {
			throw new Error(`Delivery ${deliveryId} not found`);
		}

		try {
			// Create the payload
			const payload: WebhookPayload<T> = {
				id: deliveryId,
				event: eventName,
				timestamp: Date.now(),
				data: eventData
			};

			// Convert to JSON
			const body = JSON.stringify(payload);

			// Create headers
			const headers: Record<string, string> = {
				'Content-Type': 'application/json',
				'User-Agent': 'YAML-Framework-Webhook',
				'X-Webhook-ID': webhook.id,
				'X-Webhook-Event': eventName,
				'X-Webhook-Delivery': deliveryId,
				...(webhook.headers || {})
			};

			// Add signature if secret is provided
			if (webhook.secret) {
				const signature = this.generateSignature(body, webhook.secret);
				headers['X-Webhook-Signature'] = signature;
			}

			// Update the delivery record
			const updatedDelivery: WebhookDelivery = {
				...delivery,
				status: WebhookDeliveryStatus.PENDING,
				request: {
					method: webhook.method || 'POST',
					url: webhook.url,
					headers,
					body
				}
			};

			this.deliveries.set(deliveryId, updatedDelivery);

			// Create request configuration
			const config: AxiosRequestConfig = {
				method: webhook.method || 'POST',
				url: webhook.url,
				headers,
				data: body,
				timeout: 10000, // 10 seconds
			};

			// Send the request
			const response = await axios(config);

			// Update the delivery record
			const successDelivery: WebhookDelivery = {
				...updatedDelivery,
				status: WebhookDeliveryStatus.SUCCESS,
				response: {
					statusCode: response.status,
					headers: Object.entries(response.headers).reduce(
						(acc, [key, value]) => ({ ...acc, [key]: String(value) }),
						{}
					),
					body: typeof response.data === 'object' ?
						JSON.stringify(response.data) :
						String(response.data || '')
				},
				completedAt: Date.now()
			};

			this.deliveries.set(deliveryId, successDelivery);

			// Log success
			this.logger.info(`Successfully delivered webhook ${webhook.id} for event ${eventName}`);

			// Publish success event
			this.eventBus.publish('webhook.delivery.success', {
				deliveryId,
				webhookId: webhook.id,
				event: eventName
			});

			return true;
		} catch (error: any) {
			const errorMessage = error.response ?
				`Status ${error.response.status}: ${error.response.statusText}` :
				String(error);

			// Update the delivery record
			const failedDelivery: WebhookDelivery = {
				...delivery,
				status: WebhookDeliveryStatus.FAILED,
				error: errorMessage,
				response: error.response ? {
					statusCode: error.response.status,
					headers: Object.entries(error.response.headers || {}).reduce(
						(acc, [key, value]) => ({ ...acc, [key]: String(value) }),
						{}
					),
					body: typeof error.response.data === 'object' ?
						JSON.stringify(error.response.data) :
						String(error.response.data || '')
				} : undefined,
				completedAt: Date.now()
			};

			this.deliveries.set(deliveryId, failedDelivery);

			// Log failure
			this.logger.error(`Failed to deliver webhook ${webhook.id} for event ${eventName}: ${errorMessage}`);

			// Publish failure event
			this.eventBus.publish('webhook.delivery.failure', {
				deliveryId,
				webhookId: webhook.id,
				event: eventName,
				error: errorMessage
			});

			throw error;
		}
	}

	/**
	 * Schedule a webhook retry
	 * @param webhook Webhook configuration
	 * @param deliveryId Delivery ID
	 * @param eventName Event name
	 * @param eventData Event data
	 * @param retryCount Current retry count
	 */
	private scheduleRetry<T = any>(
		webhook: WebhookConfig,
		deliveryId: string,
		eventName: string,
		eventData: T,
		retryCount: number
	): void {
		// Skip if no retry configuration
		if (!webhook.retry || retryCount >= webhook.retry.maxRetries) {
			return;
		}

		// Calculate delay
		let delay = webhook.retry.delay;

		if (webhook.retry.exponential) {
			delay = delay * Math.pow(2, retryCount);
		}

		// Get the delivery record
		const delivery = this.deliveries.get(deliveryId);

		if (!delivery) {
			return;
		}

		// Update the delivery record
		const updatedDelivery: WebhookDelivery = {
			...delivery,
			status: WebhookDeliveryStatus.RETRYING,
			retryCount: retryCount + 1
		};

		this.deliveries.set(deliveryId, updatedDelivery);

		// Log retry
		this.logger.info(`Scheduling retry ${retryCount + 1}/${webhook.retry.maxRetries} for webhook ${webhook.id} in ${delay}ms`);

		// Schedule the retry
		setTimeout(async () => {
			try {
				await this.sendWebhook(webhook, deliveryId, eventName, eventData);
			} catch (error: any) {
				// Schedule next retry
				this.scheduleRetry(webhook, deliveryId, eventName, eventData, retryCount + 1);
			}
		}, delay);
	}

	/**
	 * Generate a signature for webhook payload verification
	 * @param payload Webhook payload
	 * @param secret Webhook secret
	 * @returns HMAC signature
	 */
	private generateSignature(payload: string, secret: string): string {
		const hmac = crypto.createHmac('sha256', secret);
		hmac.update(payload);
		return hmac.digest('hex');
	}

	/**
	 * Verify a webhook signature
	 * @param payload Webhook payload
	 * @param signature Webhook signature
	 * @param secret Webhook secret
	 * @returns Whether the signature is valid
	 */
	verifySignature(payload: string, signature: string, secret: string): boolean {
		const expectedSignature = this.generateSignature(payload, secret);
		return crypto.timingSafeEqual(
			Buffer.from(signature),
			Buffer.from(expectedSignature)
		);
	}

	/**
	 * Load webhook configurations
	 * @param webhooks Webhook configurations
	 */
	loadWebhooks(webhooks: WebhookConfig[]): void {
		for (const webhook of webhooks) {
			this.webhooks.set(webhook.id, webhook);
		}

		this.logger.info(`Loaded ${webhooks.length} webhooks`);
	}
}

/**
 * Create a webhook handler
 * @param appContext Application context
 * @param logger Logger instance
 * @param eventBus Event bus
 * @returns Webhook handler instance
 */
export function createWebhookHandler(
	appContext: AppContext,
	logger: Logger,
	eventBus: EventBus
): WebhookHandler {
	return new WebhookHandler(appContext, logger, eventBus);
}