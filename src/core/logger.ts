import { Logger, LoggingConfig } from "./types";
import fs from 'fs';
import path from 'path';

export class DefaultLogger implements Logger {
	private console: boolean = true;
	private logToFile: boolean = true;
	private logFilePath?: string;
	private useDailyLogs: boolean = false;
	private level: 'trace' | 'debug' | 'info' | 'warn' | 'error' = 'info';
	private pretty: boolean = false;
	private formatters: Record<string, (data: any) => string> = {};
	private logStackTraces: boolean = true;
	private maxFileSize: number = 10 * 1024 * 1024; // 10MB
	private maxFiles: number = 10;
	private fileNamePattern: string = "app-%DATE%.log";
	private timestampFormat: string = "YYYY-MM-DD HH:mm:ss.SSS";
	private useColors: boolean = true;
	private colors: Record<string, string> = {
		'trace': '\x1b[90m', // Grey
		'debug': '\x1b[36m', // Cyan
		'info': '\x1b[32m',  // Green
		'warn': '\x1b[33m',  // Yellow
		'error': '\x1b[31m'  // Red
	};
	private metadata: Record<string, any> = {};
	private includePid: boolean = false;
	private serializeObjects: boolean = true;
	private maxObjectDepth: number = 2;
	private currentFileSize: number = 0;
	private rotatedFiles: string[] = [];

	constructor(options: LoggingConfig = {}) {
		this.console = options.console !== undefined ? options.console : true;
		this.logToFile = options.logToFile !== undefined ? options.logToFile : true;
		this.useDailyLogs = options.useDailyLogs !== undefined ? options.useDailyLogs : false;
		this.level = options.level || 'info';
		this.pretty = options.pretty || false;
		this.formatters = options.formatters || {};
		this.logStackTraces = options.logStackTraces || true;
		this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024;
		this.maxFiles = options.maxFiles || 10;
		this.fileNamePattern = options.fileNamePattern || "app-%DATE%.log";
		this.timestampFormat = options.timestampFormat || "YYYY-MM-DD HH:mm:ss.SSS";
		this.useColors = options.useColors !== undefined ? options.useColors : true;
		this.colors = options.colors || this.colors;
		this.metadata = options.metadata || {};
		this.includePid = options.includePid || false;
		this.serializeObjects = options.serializeObjects !== undefined ? options.serializeObjects : true;
		this.maxObjectDepth = options.maxObjectDepth || 2;

		if (this.logToFile) {
			this.logFilePath = this.init(options.logsDir);
			this.checkFileSize();
		} else {
			this.logFilePath = undefined;
		}
	}

	setLevel(level: 'trace' | 'debug' | 'info' | 'warn' | 'error'): void {
		this.level = level;
	}

	addMetadata(metadata: Record<string, any>): void {
		this.metadata = { ...this.metadata, ...metadata };
	}

	private formatTimestamp(date: Date): string {
		const pad = (num: number, size: number = 2): string => {
			let numStr = num.toString();
			while (numStr.length < size) numStr = "0" + numStr;
			return numStr;
		};

		// Simple implementation of timestampFormat
		// A more robust solution would use a dedicated date formatting library
		const year = date.getFullYear();
		const month = pad(date.getMonth() + 1);
		const day = pad(date.getDate());
		const hours = pad(date.getHours());
		const minutes = pad(date.getMinutes());
		const seconds = pad(date.getSeconds());
		const milliseconds = pad(date.getMilliseconds(), 3);

		return this.timestampFormat
			.replace('YYYY', year.toString())
			.replace('MM', month)
			.replace('DD', day)
			.replace('HH', hours)
			.replace('mm', minutes)
			.replace('ss', seconds)
			.replace('SSS', milliseconds);
	}

	private checkFileSize(): void {
		if (!this.logFilePath || !fs.existsSync(this.logFilePath)) {
			this.currentFileSize = 0;
			return;
		}

		const stats = fs.statSync(this.logFilePath);
		this.currentFileSize = stats.size;

		// Check if file needs rotation
		if (this.currentFileSize >= this.maxFileSize) {
			this.rotateLogFile();
		}
	}

	private rotateLogFile(): void {
		if (!this.logFilePath) return;

		const dir = path.dirname(this.logFilePath);
		const ext = path.extname(this.logFilePath);
		const basename = path.basename(this.logFilePath, ext);

		// Create a new filename with timestamp for the rotated file
		const now = new Date();
		const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
		const rotatedFileName = `${basename}.${timestamp}${ext}`;
		const rotatedFilePath = path.join(dir, rotatedFileName);

		// Rename current log file to rotated file
		fs.renameSync(this.logFilePath, rotatedFilePath);
		this.rotatedFiles.push(rotatedFilePath);

		// Create a new log file
		this.currentFileSize = 0;

		// Delete oldest log files if exceeding maxFiles
		this.cleanupOldLogFiles();
	}

	private cleanupOldLogFiles(): void {
		if (this.rotatedFiles.length <= this.maxFiles) return;

		// Sort rotated files by creation date (oldest first)
		this.rotatedFiles.sort((a, b) => {
			const statsA = fs.statSync(a);
			const statsB = fs.statSync(b);
			return statsA.birthtime.getTime() - statsB.birthtime.getTime();
		});

		// Delete oldest files
		while (this.rotatedFiles.length > this.maxFiles) {
			const oldestFile = this.rotatedFiles.shift();
			if (oldestFile && fs.existsSync(oldestFile)) {
				fs.unlinkSync(oldestFile);
			}
		}
	}

	private writeToFile(level: string, message: string): void {
		if (!this.logFilePath) {
			throw new Error('Log file path not set');
		}

		// Format the log entry
		const timestamp = this.formatTimestamp(new Date());
		const pidInfo = this.includePid ? ` [PID:${process.pid}]` : '';
		const metadataStr = Object.keys(this.metadata).length > 0
			? ' ' + JSON.stringify(this.metadata)
			: '';

		const logEntry = `[${timestamp}]${pidInfo} [${level.toUpperCase()}]${metadataStr} ${message}\n`;

		// Append to file
		fs.appendFileSync(this.logFilePath, logEntry);

		// Update current file size and check if rotation needed
		this.currentFileSize += Buffer.byteLength(logEntry);
		if (this.currentFileSize >= this.maxFileSize) {
			this.rotateLogFile();
		}
	}

	private init(logsDirPath?: string): string {
		// Ensure logs directory exists
		const logsDir = logsDirPath ? logsDirPath : path.join(process.cwd(), 'logs');
		if (!fs.existsSync(logsDir)) {
			fs.mkdirSync(logsDir, { recursive: true });
		}

		// Create log file with filename based on pattern
		const now = new Date();
		const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

		let logFileName: string;
		if (this.useDailyLogs) {
			// Replace placeholders in fileNamePattern
			logFileName = this.fileNamePattern
				.replace('%DATE%', dateStr)
				.replace('%PID%', process.pid.toString());
		} else {
			// Session-specific log file with timestamp including hours, minutes, seconds
			const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
			logFileName = this.fileNamePattern
				.replace('%DATE%', `${dateStr}-${timeStr}`)
				.replace('%PID%', process.pid.toString());
		}

		// Get list of existing rotated log files
		const files = fs.readdirSync(logsDir);
		const logFileRegex = new RegExp('^' + path.basename(logFileName, path.extname(logFileName)).replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\.[0-9]+' + path.extname(logFileName) + '$');

		this.rotatedFiles = files
			.filter(file => logFileRegex.test(file))
			.map(file => path.join(logsDir, file));

		const logFilePath = path.join(logsDir, logFileName);
		return logFilePath;
	}

	private shouldLog(messageLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error'): boolean {
		const levels = ['trace', 'debug', 'info', 'warn', 'error'];
		const configLevelIndex = levels.indexOf(this.level);
		const messageLevelIndex = levels.indexOf(messageLevel);
		return messageLevelIndex >= configLevelIndex;
	}

	private serializeArg(arg: any, depth: number = 0): string {
		if (depth > this.maxObjectDepth) {
			return '[Object]';
		}

		if (arg === null) {
			return 'null';
		}

		if (arg === undefined) {
			return 'undefined';
		}

		if (typeof arg !== 'object') {
			return String(arg);
		}

		if (arg instanceof Error) {
			return arg.message;
		}

		if (Array.isArray(arg)) {
			return '[' + arg.map(item => this.serializeArg(item, depth + 1)).join(', ') + ']';
		}

		try {
			if (this.serializeObjects) {
				const entries = Object.entries(arg).map(([key, value]) =>
					`${key}: ${this.serializeArg(value, depth + 1)}`
				);
				return '{' + entries.join(', ') + '}';
			} else {
				return '[Object]';
			}
		} catch (e) {
			return '[Object]';
		}
	}

	private formatMessage(level: string, message: string, args: any[] = []): string {
		if (this.formatters && this.formatters[level]) {
			return this.formatters[level]({ level, message, args, metadata: this.metadata });
		}

		let formattedMessage = message;
		if (args.length > 0) {
			formattedMessage += ' ' + args.map(arg => this.serializeArg(arg)).join(' ');
		}

		if (this.pretty && this.useColors) {
			const color = this.colors[level] || '\x1b[0m';
			const reset = '\x1b[0m';
			return `${color}${formattedMessage}${reset}`;
		}

		return formattedMessage;
	}

	trace(message: string, ...args: any[]): void {
		if (!this.shouldLog('trace')) return;

		const formattedMessage = this.formatMessage('trace', message, args);

		if (this.console) {
			console.debug(formattedMessage);
		}

		if (this.logToFile) {
			this.writeToFile('trace', formattedMessage);
		}
	}

	debug(message: string, ...args: any[]): void {
		if (!this.shouldLog('debug')) return;

		const formattedMessage = this.formatMessage('debug', message, args);

		if (this.console) {
			console.debug(formattedMessage);
		}

		if (this.logToFile) {
			this.writeToFile('debug', formattedMessage);
		}
	}

	info(message: string, ...args: any[]): void {
		if (!this.shouldLog('info')) return;

		const formattedMessage = this.formatMessage('info', message, args);

		if (this.console) {
			console.info(formattedMessage);
		}

		if (this.logToFile) {
			this.writeToFile('info', formattedMessage);
		}
	}

	warn(message: string, ...args: any[]): void {
		if (!this.shouldLog('warn')) return;

		const formattedMessage = this.formatMessage('warn', message, args);

		if (this.console) {
			console.warn(formattedMessage);
		}

		if (this.logToFile) {
			this.writeToFile('warn', formattedMessage);
		}
	}

	error(messageOrError: string | Error, ...args: any[]): void {
		if (!this.shouldLog('error')) return;

		const message = messageOrError instanceof Error ? messageOrError.message : messageOrError;
		const formattedMessage = this.formatMessage('error', message, args);

		if (this.console) {
			console.error(formattedMessage);
		}

		if (this.logToFile) {
			this.writeToFile('error', formattedMessage);
		}

		// Log stack trace if enabled and available
		if (this.logStackTraces && messageOrError instanceof Error && messageOrError.stack) {
			let stackTrace = `Stack trace: ${messageOrError.stack}`;

			if (messageOrError.cause) {
				stackTrace += `\nCaused by: ${messageOrError.cause.stack || messageOrError.cause}`;
			}

			if (this.console) {
				console.error(this.useColors ? `${this.colors.error}${stackTrace}\x1b[0m` : stackTrace);
			}

			if (this.logToFile) {
				this.writeToFile('error', stackTrace);
			}
		}
	}
}