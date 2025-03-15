/**
 * Event Bus
 * Provides event publishing and subscription capabilities
 */

import { Logger } from '../core/types';
import { AppContext } from '../core/app-context';

/**
 * Event handler function
 */
export type EventHandler<T = any> = (
	event: T,
	context: EventContext
) => Promise<void> | void;

/**
 * Event context provided to event handlers
 */
export interface EventContext {
	/** Event name */
	eventName: string;
	/** Timestamp when the event was published */
	timestamp: number;
	/** Application context */
	appContext: AppContext;
	/** Logger instance */
	logger: Logger;
}

/**
 * Event handler registration
 */
interface EventHandlerRegistration {
	/** Event handler function */
	handler: EventHandler;
	/** Handler priority (lower numbers run first) */
	priority: number;
	/** Handler timeout in milliseconds */
	timeout?: number;
	/** Whether to catch and log errors */
	catchErrors: boolean;
}

/**
 * Event configuration from YAML
 */
export interface EventConfig {
	/** Event name */
	name: string;
	/** Event handlers */
	handlers: Array<{
		/** Handler name */
		name: string;
		/** Handler implementation */
		implementation: string;
		/** Handler condition */
		condition?: string;
		/** Handler priority */
		priority?: number;
		/** Handler timeout */
		timeout?: number;
		/** Whether to catch errors */
		catchErrors?: boolean;
	}>;
}

/**
 * Event bus
 * Handles event publishing and subscription
 */
export class EventBus {
	/** Event handlers by event name */
	private handlers: Map<string, EventHandlerRegistration[]> = new Map();
	/** Application context */
	private appContext: AppContext;
	/** Logger instance */
	private logger: Logger;
	/** Configuration loader */
	private configLoader: any;
	/** Loaded event handlers */
	private loadedHandlers: Set<string> = new Set();

	/**
	 * Constructor
	 * @param appContext Application context
	 * @param logger Logger instance
	 * @param configLoader Configuration loader for external code
	 */
	constructor(appContext: AppContext, logger: Logger, configLoader: any) {
		this.appContext = appContext;
		this.logger = logger;
		this.configLoader = configLoader;
	}

	/**
	 * Subscribe to an event
	 * @param eventName Event name
	 * @param handler Event handler
	 * @param options Handler options
	 * @returns Unsubscribe function
	 */
	subscribe<T = any>(
		eventName: string,
		handler: EventHandler<T>,
		options: {
			priority?: number;
			timeout?: number;
			catchErrors?: boolean;
		} = {}
	): () => void {
		// Get or create handlers array for this event
		const eventHandlers = this.handlers.get(eventName) || [];

		// Create handler registration
		const registration: EventHandlerRegistration = {
			handler,
			priority: options.priority ?? 10,
			timeout: options.timeout,
			catchErrors: options.catchErrors ?? true
		};

		// Add to handlers array
		eventHandlers.push(registration);

		// Sort handlers by priority
		eventHandlers.sort((a, b) => a.priority - b.priority);

		// Update handlers map
		this.handlers.set(eventName, eventHandlers);

		// Log subscription
		this.logger.debug(`Subscribed to event ${eventName}`);

		// Return unsubscribe function
		return () => {
			const currentHandlers = this.handlers.get(eventName) || [];
			const index = currentHandlers.indexOf(registration);

			if (index !== -1) {
				currentHandlers.splice(index, 1);
				this.handlers.set(eventName, currentHandlers);
				this.logger.debug(`Unsubscribed from event ${eventName}`);
			}
		};
	}

	/**
	 * Check if an event has subscribers
	 * @param eventName Event name
	 * @returns Whether the event has subscribers
	 */
	hasSubscribers(eventName: string): boolean {
		const handlers = this.handlers.get(eventName);
		return !!handlers && handlers.length > 0;
	}

	/**
	 * Get the number of subscribers for an event
	 * @param eventName Event name
	 * @returns Number of subscribers
	 */
	getSubscriberCount(eventName: string): number {
		const handlers = this.handlers.get(eventName);
		return handlers?.length || 0;
	}

	/**
	 * Publish an event
	 * @param eventName Event name
	 * @param eventData Event data
	 * @returns Promise that resolves when all handlers have been called
	 */
	async publish<T = any>(eventName: string, eventData: T): Promise<void> {
		const handlers = this.handlers.get(eventName);

		if (!handlers || handlers.length === 0) {
			this.logger.debug(`No handlers found for event ${eventName}`);
			return;
		}

		this.logger.debug(`Publishing event ${eventName} to ${handlers.length} handlers`);

		// Create event context
		const context: EventContext = {
			eventName,
			timestamp: Date.now(),
			appContext: this.appContext,
			logger: this.logger
		};

		// Call each handler
		const promises = handlers.map(registration =>
			this.executeHandler(registration, eventData, context)
		);

		// Wait for all handlers to complete
		await Promise.all(promises);
	}

	/**
	 * Execute an event handler with timeout and error handling
	 * @param registration Handler registration
	 * @param eventData Event data
	 * @param context Event context
	 * @returns Promise that resolves when the handler completes
	 */
	private async executeHandler(
		registration: EventHandlerRegistration,
		eventData: any,
		context: EventContext
	): Promise<void> {
		try {
			// Create a promise that calls the handler
			const handlerPromise = Promise.resolve(registration.handler(eventData, context));

			// If no timeout specified, just await the handler
			if (!registration.timeout) {
				await handlerPromise;
				return;
			}

			// Otherwise, create a timeout promise
			const timeoutPromise = new Promise<void>((_, reject) => {
				setTimeout(() => {
					reject(new Error(`Handler timed out after ${registration.timeout}ms`));
				}, registration.timeout);
			});

			// Race the handler against the timeout
			await Promise.race([handlerPromise, timeoutPromise]);
		} catch (error: any) {
			// If catchErrors is true, log the error but don't rethrow
			if (registration.catchErrors) {
				this.logger.error(`Error in event handler for ${context.eventName}: ${error}`);
			} else {
				// Otherwise, rethrow the error
				throw error;
			}
		}
	}

	/**
	 * Load event configurations
	 * @param events Event configurations
	 */
	async loadEvents(events: EventConfig[]): Promise<void> {
		for (const event of events) {
			await this.loadEvent(event);
		}
	}

	/**
	 * Load a single event configuration
	 * @param event Event configuration
	 */
	private async loadEvent(event: EventConfig): Promise<void> {
		if (!event.handlers || event.handlers.length === 0) {
			return;
		}

		for (const handlerConfig of event.handlers) {
			await this.loadEventHandler(event.name, handlerConfig);
		}
	}

	/**
	 * Load and register an event handler
	 * @param eventName Event name
	 * @param handlerConfig Handler configuration
	 */
	private async loadEventHandler(
		eventName: string,
		handlerConfig: EventConfig['handlers'][0]
	): Promise<void> {
		const handlerKey = `${eventName}:${handlerConfig.name}`;

		// Skip if already loaded
		if (this.loadedHandlers.has(handlerKey)) {
			return;
		}

		try {
			let handlerFn: EventHandler;

			// If implementation is a file path, load it
			if (handlerConfig.implementation.startsWith('./')) {
				const handlerModule = await this.configLoader.loadExternalCode(handlerConfig.implementation);
				handlerFn = handlerModule.default || handlerModule;
			} else {
				// Otherwise, it's an inline implementation
				handlerFn = new Function(
					'event',
					'context',
					`return (async (event, context) => {
            ${handlerConfig.implementation}
          })(event, context);`
				) as EventHandler;
			}

			// Create condition function if provided
			let conditionFn: ((event: any, context: EventContext) => boolean) | undefined;
			if (handlerConfig.condition) {
				conditionFn = new Function(
					'event',
					'context',
					`return ${handlerConfig.condition};`
				) as (event: any, context: EventContext) => boolean;
			}

			// Create the handler wrapper
			const handlerWrapper: EventHandler = async (event, context) => {
				// Skip if condition is not met
				if (conditionFn && !conditionFn(event, context)) {
					return;
				}

				// Execute the handler
				await handlerFn(event, context);
			};

			// Subscribe the handler
			this.subscribe(eventName, handlerWrapper, {
				priority: handlerConfig.priority,
				timeout: handlerConfig.timeout,
				catchErrors: handlerConfig.catchErrors ?? true
			});

			// Mark as loaded
			this.loadedHandlers.add(handlerKey);
			this.logger.debug(`Loaded event handler ${handlerKey}`);
		} catch (error: any) {
			this.logger.error(`Failed to load event handler ${handlerKey}: ${error}`);
		}
	}

	/**
	 * Clear all event handlers
	 */
	clearAllHandlers(): void {
		this.handlers.clear();
		this.loadedHandlers.clear();
		this.logger.info('Cleared all event handlers');
	}
}

/**
 * Create an event bus
 * @param appContext Application context
 * @param logger Logger instance
 * @param configLoader Configuration loader
 * @returns Event bus instance
 */
export function createEventBus(
	appContext: AppContext,
	logger: Logger,
	configLoader: any
): EventBus {
	return new EventBus(appContext, logger, configLoader);
}