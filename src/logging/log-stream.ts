import * as fs from 'fs';
import * as path from 'path';

export interface LogStreamOptions {
	id: string;
	level?: 'trace' | 'debug' | 'info' | 'warn' | 'error';
	destination: 'console' | 'file' | 'memory';
	filePath?: string;
	fileOptions?: {
		maxFileSize?: number;
		maxFiles?: number;
		dailyLogs?: boolean;
		fileNamePattern?: string;
	};
	formatOptions?: {
		timestampFormat?: string;
		useColors?: boolean;
		includePid?: boolean;
		pretty?: boolean;
	};
}

export class LogStream {
	private id: string;
	private level: 'trace' | 'debug' | 'info' | 'warn' | 'error';
	private destination: 'console' | 'file' | 'memory';
	private filePath?: string;
	private fileOptions: Required<NonNullable<LogStreamOptions['fileOptions']>>;
	private formatOptions: Required<NonNullable<LogStreamOptions['formatOptions']>>;
	private buffer: string[] = []; // History of log entries
	private fileStream?: fs.WriteStream;
	private currentFileSize: number = 0;
	private rotatedFiles: string[] = [];
	private colors: Record<string, string> = {
		'trace': '\x1b[90m', // Grey
		'debug': '\x1b[36m', // Cyan
		'info': '\x1b[32m',  // Green
		'warn': '\x1b[33m',  // Yellow
		'error': '\x1b[31m'  // Red
	};

	constructor(options: LogStreamOptions) {
		this.id = options.id;
		this.level = options.level || 'info';
		this.destination = options.destination;
		this.filePath = options.filePath;

		// Set default options
		this.fileOptions = {
			maxFileSize: options.fileOptions?.maxFileSize || 10 * 1024 * 1024,
			maxFiles: options.fileOptions?.maxFiles || 5,
			dailyLogs: options.fileOptions?.dailyLogs || false,
			fileNamePattern: options.fileOptions?.fileNamePattern || 'app-%DATE%.log'
		};

		this.formatOptions = {
			timestampFormat: options.formatOptions?.timestampFormat || 'YYYY-MM-DD HH:mm:ss.SSS',
			useColors: options.formatOptions?.useColors || false,
			includePid: options.formatOptions?.includePid || false,
			pretty: options.formatOptions?.pretty || false
		};

		this.initializeDestination();
	}

	get streamId(): string {
		return this.id;
	}

	private initializeDestination(): void {
		if (this.destination === 'file' && this.filePath) {
			// Ensure directory exists
			const dir = path.dirname(this.filePath);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}

			// Check if file exists and get size
			if (fs.existsSync(this.filePath)) {
				const stats = fs.statSync(this.filePath);
				this.currentFileSize = stats.size;

				// Rotate if needed
				if (this.currentFileSize >= this.fileOptions.maxFileSize) {
					this.rotateLogFile();
				}
			}

			// Write buffer to file
			if (this.buffer.length > 0) {
				const content = this.buffer.join('\n') + '\n';
				fs.appendFileSync(this.filePath, content);
				this.currentFileSize += Buffer.byteLength(content);
			}
		}
	}

	changeDestination(destination: 'console' | 'file' | 'memory', filePath?: string): void {
		// Close existing file stream if any
		if (this.fileStream) {
			this.fileStream.end();
			this.fileStream = undefined;
		}

		this.destination = destination;

		if (destination === 'file') {
			this.filePath = filePath;
			this.initializeDestination();
		}
	}

	private getLogLevelPriority(level: string): number {
		const levels = ['trace', 'debug', 'info', 'warn', 'error'];
		return levels.indexOf(level);
	}

	private shouldLog(messageLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error'): boolean {
		return this.getLogLevelPriority(messageLevel) >= this.getLogLevelPriority(this.level);
	}

	private formatTimestamp(date: Date): string {
		const pad = (num: number, size: number = 2): string => {
			let numStr = num.toString();
			while (numStr.length < size) numStr = "0" + numStr;
			return numStr;
		};

		const year = date.getFullYear();
		const month = pad(date.getMonth() + 1);
		const day = pad(date.getDate());
		const hours = pad(date.getHours());
		const minutes = pad(date.getMinutes());
		const seconds = pad(date.getSeconds());
		const milliseconds = pad(date.getMilliseconds(), 3);

		return this.formatOptions.timestampFormat
			.replace('YYYY', year.toString())
			.replace('MM', month)
			.replace('DD', day)
			.replace('HH', hours)
			.replace('mm', minutes)
			.replace('ss', seconds)
			.replace('SSS', milliseconds);
	}

	private rotateLogFile(): void {
		if (!this.filePath) return;

		const dir = path.dirname(this.filePath);
		const ext = path.extname(this.filePath);
		const basename = path.basename(this.filePath, ext);

		// Create a new filename with timestamp for the rotated file
		const now = new Date();
		const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
		const rotatedFileName = `${basename}.${timestamp}${ext}`;
		const rotatedFilePath = path.join(dir, rotatedFileName);

		// Close current file stream if exists
		if (this.fileStream) {
			this.fileStream.end();
			this.fileStream = undefined;
		}

		// Rename current log file to rotated file
		fs.renameSync(this.filePath, rotatedFilePath);
		this.rotatedFiles.push(rotatedFilePath);

		// Reset file size
		this.currentFileSize = 0;

		// Cleanup old files
		this.cleanupOldLogFiles();
	}

	private cleanupOldLogFiles(): void {
		if (this.rotatedFiles.length <= this.fileOptions.maxFiles) return;

		// Sort files by creation date (oldest first)
		this.rotatedFiles.sort((a, b) => {
			const statsA = fs.statSync(a);
			const statsB = fs.statSync(b);
			return statsA.birthtime.getTime() - statsB.birthtime.getTime();
		});

		// Delete oldest files
		while (this.rotatedFiles.length > this.fileOptions.maxFiles) {
			const oldestFile = this.rotatedFiles.shift();
			if (oldestFile && fs.existsSync(oldestFile)) {
				fs.unlinkSync(oldestFile);
			}
		}
	}

	private formatLogEntry(level: string, message: string, metadata?: Record<string, any>): string {
		const timestamp = this.formatTimestamp(new Date());
		const pidInfo = this.formatOptions.includePid ? ` [PID:${process.pid}]` : '';
		const metadataStr = metadata && Object.keys(metadata).length > 0
			? ' ' + JSON.stringify(metadata)
			: '';

		let formattedMessage = `[${timestamp}]${pidInfo} [${level.toUpperCase()}]${metadataStr} ${message}`;

		if (this.formatOptions.useColors && this.formatOptions.pretty) {
			const color = this.colors[level] || '\x1b[0m';
			const reset = '\x1b[0m';
			formattedMessage = `${color}${formattedMessage}${reset}`;
		}

		return formattedMessage;
	}

	log(level: 'trace' | 'debug' | 'info' | 'warn' | 'error', message: string, metadata?: Record<string, any>): void {
		if (!this.shouldLog(level)) return;

		const logEntry = this.formatLogEntry(level, message, metadata);

		// Add to buffer for history
		this.buffer.push(logEntry);

		// Trim buffer if too large (keep last 1000 entries)
		if (this.buffer.length > 1000) {
			this.buffer = this.buffer.slice(this.buffer.length - 1000);
		}

		// Output based on destination
		switch (this.destination) {
			case 'console':
				if (level === 'error') {
					console.error(logEntry);
				} else if (level === 'warn') {
					console.warn(logEntry);
				} else if (level === 'info') {
					console.info(logEntry);
				} else {
					console.log(logEntry);
				}
				break;

			case 'file':
				if (this.filePath) {
					// Append newline for file
					const entryWithNewline = logEntry + '\n';

					try {
						fs.appendFileSync(this.filePath, entryWithNewline);
						this.currentFileSize += Buffer.byteLength(entryWithNewline);

						// Check if rotation is needed
						if (this.currentFileSize >= this.fileOptions.maxFileSize) {
							this.rotateLogFile();
						}
					} catch (error) {
						console.error(`Error writing to log file: ${error}`);
					}
				}
				break;

			case 'memory':
				// Already added to buffer, no other action needed
				break;
		}
	}

	getHistory(): string[] {
		return [...this.buffer];
	}

	clearHistory(): void {
		this.buffer = [];
	}

	setLevel(level: 'trace' | 'debug' | 'info' | 'warn' | 'error'): void {
		this.level = level;
	}

	getLevel(): string {
		return this.level;
	}
}