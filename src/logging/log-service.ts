import { LogStream, LogStreamOptions } from './log-stream';
import { Logger } from '../types';
import * as path from 'path';

/**
 * Logger implementation that writes to a LogStream
 */
class StreamLogger implements Logger {
	private metadata: Record<string, any> = {};

	constructor(private stream: LogStream) { }

	trace(message: string, ...args: any[]): void {
		const formattedMessage = this.formatMessage(message, args);
		this.stream.log('trace', formattedMessage, this.metadata);
	}

	debug(message: string, ...args: any[]): void {
		const formattedMessage = this.formatMessage(message, args);
		this.stream.log('debug', formattedMessage, this.metadata);
	}

	info(message: string, ...args: any[]): void {
		const formattedMessage = this.formatMessage(message, args);
		this.stream.log('info', formattedMessage, this.metadata);
	}

	warn(message: string, ...args: any[]): void {
		const formattedMessage = this.formatMessage(message, args);
		this.stream.log('warn', formattedMessage, this.metadata);
	}

	error(messageOrError: string | Error, ...args: any[]): void {
		const message = messageOrError instanceof Error ? messageOrError.message : messageOrError;
		const formattedMessage = this.formatMessage(message, args);
		this.stream.log('error', formattedMessage, this.metadata);

		// Log stack trace if provided
		if (messageOrError instanceof Error && messageOrError.stack) {
			this.stream.log('error', `Stack trace: ${messageOrError.stack}`);

			if (messageOrError.cause) {
				this.stream.log('error', `Caused by: ${messageOrError.cause}`);
			}
		}
	}

	setLevel(level: 'trace' | 'debug' | 'info' | 'warn' | 'error'): void {
		this.stream.setLevel(level);
	}

	addMetadata(metadata: Record<string, any>): void {
		this.metadata = { ...this.metadata, ...metadata };
	}

	private formatMessage(message: string, args: any[]): string {
		if (args.length === 0) {
			return message;
		}

		return message + ' ' + args.map(arg => {
			if (arg === null) return 'null';
			if (arg === undefined) return 'undefined';
			if (typeof arg === 'object') {
				try {
					return JSON.stringify(arg);
				} catch (e) {
					return '[Object]';
				}
			}
			return String(arg);
		}).join(' ');
	}
}

/**
 * Service that manages log streams and creates loggers
 */
export class LoggingService {
	private static instance: LoggingService;
	private streams: Map<string, LogStream> = new Map();
	private defaultStreamId: string = 'default';

	private constructor() { }

	static getInstance(): LoggingService {
		if (!LoggingService.instance) {
			LoggingService.instance = new LoggingService();
		}
		return LoggingService.instance;
	}

	/**
	 * Create a new log stream
	 */
	createStream(options: LogStreamOptions): LogStream {
		const existingStream = this.streams.get(options.id);
		if (existingStream) {
			// Update existing stream if it already exists
			existingStream.changeDestination(options.destination, options.filePath);
			if (options.level) {
				existingStream.setLevel(options.level);
			}
			return existingStream;
		}

		const stream = new LogStream(options);
		this.streams.set(options.id, stream);
		return stream;
	}

	/**
	 * Get an existing stream by ID
	 */
	getStream(id: string): LogStream | undefined {
		return this.streams.get(id);
	}

	/**
	 * Set the default stream ID
	 */
	setDefaultStreamId(id: string): void {
		if (!this.streams.has(id)) {
			throw new Error(`Stream with ID '${id}' does not exist`);
		}
		this.defaultStreamId = id;
	}

	/**
	 * Get the default stream ID
	 */
	getDefaultStreamId(): string {
		return this.defaultStreamId;
	}

	/**
	 * Create a logger that writes to a specific stream
	 */
	createLogger(streamId?: string): Logger {
		const id = streamId || this.defaultStreamId;
		const stream = this.getStream(id);

		if (!stream) {
			throw new Error(`Log stream with ID '${id}' not found`);
		}

		return new StreamLogger(stream);
	}

	/**
	 * Get all stream IDs
	 */
	getStreamIds(): string[] {
		return Array.from(this.streams.keys());
	}

	/**
	 * Create a console logger (convenience method)
	 */
	createConsoleLogger(id: string = 'console', level: 'trace' | 'debug' | 'info' | 'warn' | 'error' = 'info'): Logger {
		const stream = this.createStream({
			id,
			destination: 'console',
			level,
			formatOptions: {
				useColors: true,
				pretty: true
			}
		});

		return new StreamLogger(stream);
	}

	/**
	 * Create a file logger (convenience method)
	 */
	createFileLogger(
		id: string = 'file',
		filePath: string,
		level: 'trace' | 'debug' | 'info' | 'warn' | 'error' = 'info',
		dailyLogs: boolean = false
	): Logger {
		const stream = this.createStream({
			id,
			destination: 'file',
			filePath,
			level,
			fileOptions: {
				dailyLogs
			}
		});

		return new StreamLogger(stream);
	}
}

// Export the StreamLogger for direct use
export { StreamLogger };