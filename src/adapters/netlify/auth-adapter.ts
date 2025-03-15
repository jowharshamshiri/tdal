/**
 * Netlify Authentication Adapter
 * Adapts authentication for Netlify Functions
 */

import { Logger } from '../../core/types';
import { AuthAdapter } from '../types';

/**
 * Netlify authentication adapter
 */
export class NetlifyAuthAdapter implements AuthAdapter {
	/**
	 * Logger instance
	 */
	private logger: Logger;

	/**
	 * Constructor
	 * @param logger Logger instance
	 */
	constructor(logger: Logger) {
		this.logger = logger;
	}

	/**
	 * Adapt authentication configuration to Netlify
	 * @param authConfig Authentication configuration
	 * @param options Additional options
	 * @returns Authentication code for Netlify
	 */
	adaptAuthentication(authConfig: any, options?: Record<string, any>): string {
		const typescript = options?.typescript !== false;

		this.logger.debug('Adapting authentication for Netlify');

		return `${typescript ? '/**\n * Authentication for Netlify Functions\n * Generated from application authentication configuration\n */' : '// Authentication for Netlify Functions'}

${typescript ? 'import jwt from "jsonwebtoken";' : 'const jwt = require("jsonwebtoken");'}
${typescript ? 'import { ApiResponse, CORS_HEADERS } from "../types";' : 'const { CORS_HEADERS } = require("../types");'}

// JWT secret from environment variables or configuration
const JWT_SECRET = process.env.JWT_SECRET || "${authConfig.secret || 'change-this-in-production'}";

${typescript ? '/**\n * Sign JWT token\n * @param payload Token payload\n * @param options Token options\n * @returns JWT token\n */' : '// Sign JWT token'}
${typescript ? 'export function signToken(payload: any, options?: jwt.SignOptions): string {' : 'exports.signToken = function(payload, options) {'}
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: "${authConfig.tokenExpiry || '24h'}",
    ...options
  });
}

${typescript ? '/**\n * Generate refresh token\n * @param userId User ID\n * @returns Refresh token\n */' : '// Generate refresh token'}
${typescript ? 'export function generateRefreshToken(userId: number | string): string {' : 'exports.generateRefreshToken = function(userId) {'}
  return jwt.sign(
    { 
      user_id: userId,
      type: 'refresh'
    }, 
    JWT_SECRET, 
    { 
      expiresIn: "${authConfig.refreshTokenExpiry || '7d'}"
    }
  );
}

${typescript ? '/**\n * Verify JWT token\n * @param token JWT token\n * @returns Decoded token payload or null if invalid\n */' : '// Verify JWT token'}
${typescript ? 'export function verifyToken(token: string): any | null {' : 'exports.verifyToken = function(token) {'}
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

${typescript ? '/**\n * Middleware to authenticate requests\n * @param event Netlify Function event\n * @returns Event with user data or error response\n */' : '// Middleware to authenticate requests'}
${typescript ? 'export async function authenticate(event: any): Promise<any> {' : 'exports.authenticate = async function(event) {'}
  // Get Authorization header
  const authHeader = event.headers.authorization || event.headers.Authorization;

  if (!authHeader) {
    return {
      statusCode: 401,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        message: "Unauthorized: Missing authentication token",
      }),
      isError: true
    }${typescript ? ' as ApiResponse' : ''};
  }

  // Extract token from header
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.substring(7)
    : authHeader;

  try {
    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Attach user data to event
    return {
      ...event,
      user: decoded
    };
  } catch (error) {
    return {
      statusCode: 401,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        message: "Unauthorized: Invalid token",
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      isError: true
    }${typescript ? ' as ApiResponse' : ''};
  }
}
`;
	}

	/**
	 * Generate verification code for Netlify
	 * @param options Additional options
	 * @returns Verification code
	 */
	generateVerification(options?: Record<string, any>): string {
		const typescript = options?.typescript !== false;

		return `${typescript ? '/**\n * Token verification for Netlify Functions\n */' : '// Token verification for Netlify Functions'}

${typescript ? 'import jwt from "jsonwebtoken";' : 'const jwt = require("jsonwebtoken");'}
${typescript ? 'import { Event, ApiResponse, CORS_HEADERS } from "../types";' : 'const { CORS_HEADERS } = require("../types");'}

// JWT secret from environment variables
const JWT_SECRET = process.env.JWT_SECRET || "your-default-secret-change-me";

${typescript ? 'export async function verifyToken(event: Event): Promise<Event | ApiResponse> {' : 'exports.verifyToken = async function(event) {'}
  // Get Authorization header
  const authHeader = event.headers.authorization || event.headers.Authorization;

  if (!authHeader) {
    return {
      statusCode: 401,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        message: "Unauthorized: Missing authentication token",
      }),
      isError: true,
    }${typescript ? ' as ApiResponse' : ''};
  }

  // Extract token from header
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.substring(7)
    : authHeader;

  try {
    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Attach user data to event
    return {
      ...event,
      user: decoded,
    }${typescript ? ' as Event' : ''};
  } catch (error) {
    return {
      statusCode: 401,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        message: "Unauthorized: Invalid token",
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      isError: true,
    }${typescript ? ' as ApiResponse' : ''};
  }
}
`;
	}
}