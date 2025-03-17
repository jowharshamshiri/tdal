export interface LoggingConfig {
	// Global defaults
	level?: 'trace' | 'debug' | 'info' | 'warn' | 'error';

	// Stream definitions
	streams?: Record<string, {
		destination: 'console' | 'file' | 'memory';
		level?: 'trace' | 'debug' | 'info' | 'warn' | 'error';
		filePath?: string;
		maxFileSize?: number;
		maxFiles?: number;
		dailyLogs?: boolean;
		fileNamePattern?: string;
		formatOptions?: {
			timestampFormat?: string;
			useColors?: boolean;
			includePid?: boolean;
			pretty?: boolean;
		};
	}>;

	// Default stream to use
	defaultStream?: string;

	// Legacy options for backward compatibility
	pretty?: boolean;
	console?: boolean;
	logToFile?: boolean;
	logsDir?: string;
	fileNamePattern?: string;
	dailyLogs?: boolean;
	logStackTraces?: boolean;
	maxFileSize?: number;
	maxFiles?: number;
	timestampFormat?: string;
	useColors?: boolean;
	includePid?: boolean;
	serializeObjects?: boolean;
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
