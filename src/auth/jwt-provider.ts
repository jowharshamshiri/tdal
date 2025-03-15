/**
 * JWT Provider
 * Handles JWT token generation, verification, and management
 */

import jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { AppContext } from '../core/app-context';
import { Logger } from '../core/types';

/**
 * JWT token options
 */
export interface JwtOptions {
	/**
	 * Secret key for signing tokens
	 */
	secret?: string;

	/**
	 * Token expiration time
	 */
	expiresIn?: string | number;

	/**
	 * Token issuer
	 */
	issuer?: string;

	/**
	 * Token audience
	 */
	audience?: string;

	/**
	 * JWT algorithm
	 */
	algorithm?: jwt.Algorithm;
}

/**
 * Token payload
 */
export interface TokenPayload {
	/**
	 * User ID
	 */
	user_id: number | string;

	/**
	 * User email
	 */
	email: string;

	/**
	 * User role
	 */
	role: string;

	/**
	 * Custom claims
	 */
	[key: string]: any;
}

/**
 * Token verification result
 */
export interface TokenVerificationResult {
	/**
	 * Whether verification was successful
	 */
	valid: boolean;

	/**
	 * Decoded token payload
	 */
	payload?: any;

	/**
	 * Error message if verification failed
	 */
	error?: string;

	/**
	 * JWT token expiration date
	 */
	expires?: Date;
}

/**
 * JWT Provider class
 * Handles JWT token operations
 */
export class JwtProvider {
	/**
	 * Secret key for signing tokens
	 */
	private secret: string;

	/**
	 * Logger instance
	 */
	private logger: Logger;

	/**
	 * Default token options
	 */
	private defaultOptions: JwtOptions;

	/**
	 * Constructor
	 * @param appContext Application context
	 */
	constructor(private appContext: AppContext) {
		this.logger = appContext.getLogger();

		// Get JWT configuration from app context
		const config = appContext.getConfig();
		this.secret = config.auth?.secret || process.env.JWT_SECRET || this.generateSecret();

		// Set default options
		this.defaultOptions = {
			expiresIn: config.auth?.tokenExpiry || '24h',
			algorithm: 'HS256',
			issuer: config.name || 'api',
		};

		this.logger.info('JWT Provider initialized');
	}

	/**
	 * Generate a JWT token
	 * @param payload Token payload
	 * @param options Token options
	 * @returns JWT token
	 */
	generateToken(payload: TokenPayload, options: JwtOptions = {}): string {
		try {
			const tokenOptions = {
				...this.defaultOptions,
				...options,
			};

			// Use provided secret or default
			const secretKey = options.secret || this.secret;

			// Add issued at timestamp
			const enhancedPayload = {
				...payload,
				iat: Math.floor(Date.now() / 1000),
			};

			// Generate token
			const token = jwt.sign(enhancedPayload, secretKey, tokenOptions);
			return token;
		} catch (error: any) {
			this.logger.error(`Error generating JWT token: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Verify a JWT token
	 * @param token JWT token
	 * @param options Token options
	 * @returns Token verification result
	 */
	verifyToken(token: string, options: JwtOptions = {}): TokenVerificationResult {
		try {
			// Use provided secret or default
			const secretKey = options.secret || this.secret;

			// Verify token
			const decoded = jwt.verify(token, secretKey, {
				algorithms: options.algorithm ? [options.algorithm] : ['HS256'],
				issuer: options.issuer || this.defaultOptions.issuer,
				audience: options.audience,
			});

			// Calculate expiration date if exp exists
			let expires: Date | undefined = undefined;
			if (typeof decoded === 'object' && decoded.exp) {
				expires = new Date(decoded.exp * 1000);
			}

			return {
				valid: true,
				payload: decoded,
				expires,
			};
		} catch (error: any) {
			this.logger.debug(`JWT verification failed: ${error.message}`);
			return {
				valid: false,
				error: error.message,
			};
		}
	}

	/**
	 * Decode a JWT token without verification
	 * @param token JWT token
	 * @returns Decoded token payload or null if invalid
	 */
	decodeToken(token: string): any | null {
		try {
			return jwt.decode(token);
		} catch (error: any) {
			this.logger.debug(`JWT decode failed: ${error.message}`);
			return null;
		}
	}

	/**
	 * Generate a refresh token
	 * @param userId User ID
	 * @param options Token options
	 * @returns Refresh token
	 */
	generateRefreshToken(userId: number | string, options: JwtOptions = {}): string {
		try {
			// Use longer expiration for refresh tokens
			const config = this.appContext.getConfig();
			const refreshExpiry = config.auth?.refreshTokenExpiry || '7d';

			const refreshOptions = {
				...this.defaultOptions,
				...options,
				expiresIn: options.expiresIn || refreshExpiry,
			};

			// Create payload with minimal data for security
			const payload = {
				user_id: userId,
				type: 'refresh',
				jti: this.generateTokenId(),
			};

			// Generate token
			const tokenPayload: TokenPayload = {
				user_id: userId,
				email: 'refresh-token', // Placeholder, not used for validation
				role: 'user',           // Placeholder, not used for validation
				type: 'refresh',
				jti: this.generateTokenId()
			};

			return this.generateToken(tokenPayload, refreshOptions);
		} catch (error: any) {
			this.logger.error(`Error generating refresh token: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Check if a token is expired
	 * @param token JWT token or decoded payload with exp
	 * @returns Whether the token is expired
	 */
	isTokenExpired(token: string | any): boolean {
		try {
			let exp: number;

			if (typeof token === 'string') {
				// Decode the token to get the payload
				const decoded = this.decodeToken(token);
				if (!decoded || typeof decoded !== 'object' || !decoded.exp) {
					return true; // No expiration means we treat it as expired
				}
				exp = decoded.exp;
			} else if (typeof token === 'object' && token.exp) {
				// Already decoded payload
				exp = token.exp;
			} else {
				return true; // Invalid token format
			}

			// Check expiration
			const now = Math.floor(Date.now() / 1000);
			return exp < now;
		} catch (error: any) {
			this.logger.debug(`Error checking token expiration: ${error.message}`);
			return true; // On error, treat as expired
		}
	}

	/**
	 * Generate a token ID
	 * @returns Unique token ID
	 */
	private generateTokenId(): string {
		return crypto.randomBytes(16).toString('hex');
	}

	/**
	 * Generate a random secret key
	 * @returns Random secret key
	 */
	private generateSecret(): string {
		const secret = crypto.randomBytes(32).toString('hex');
		this.logger.warn('Generated random JWT secret. This should be configured properly in production.');
		return secret;
	}

	/**
	 * Extract the authorization token from a request
	 * @param authHeader Authorization header value
	 * @returns Token or null if invalid
	 */
	extractTokenFromHeader(authHeader: string): string | null {
		if (!authHeader) {
			return null;
		}

		// Handle Bearer token format
		if (authHeader.startsWith('Bearer ')) {
			return authHeader.substring(7);
		}

		// Handle basic token format (just the token itself)
		return authHeader;
	}
}

/**
 * Create a JWT provider
 * @param appContext Application context
 * @returns JWT provider instance
 */
export function createJwtProvider(appContext: AppContext): JwtProvider {
	return new JwtProvider(appContext);
}