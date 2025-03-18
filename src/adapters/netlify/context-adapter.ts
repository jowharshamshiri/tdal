/**
 * Netlify Context Adapter
 * Adapts context objects to Netlify Functions
 */

import { Logger } from '../../logging';
import { ContextAdapter } from '../types';

/**
 * Netlify context adapter
 */
export class NetlifyContextAdapter implements ContextAdapter {
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
	 * Adapt request context to Netlify
	 * @param options Additional options
	 * @returns Request context adapter code
	 */
	adaptRequestContext(options?: Record<string, any>): string {
		const typescript = options?.typescript !== false;

		this.logger.debug('Adapting request context for Netlify');

		return `${typescript ? '/**\n * Request Context Adapter for Netlify Functions\n * Converts Netlify Function events to framework contexts\n */' : '// Request Context Adapter for Netlify Functions'}

${typescript ? 'import { DatabaseAdapter } from "../database";' : 'const { DatabaseAdapter } = require("../database");'}
${typescript ? 'import { HookContext } from "../hooks";' : 'const { HookContext } = require("../hooks");'}

${typescript ? '/**\n * Create a hook context from Netlify event\n * @param event Netlify Function event\n * @param db Database adapter\n * @param options Additional options\n * @returns Hook context\n */' : '// Create a hook context from Netlify event'}
${typescript ? 'export function createContextFromEvent(event: any, db: DatabaseAdapter, options?: Record<string, any>): HookContext {' : 'exports.createContextFromEvent = function(event, db, options) {'}
  const entityName = options?.entityName || 'unknown';
  const operation = options?.operation || 'unknown';
  
  // Parse path for entity and ID
  const path = event.path.split('/');
  const pathEntityName = path[path.length - 2] || '';
  const pathId = path[path.length - 1] || '';
  
  // Parse query parameters
  const query = event.queryStringParameters || {};
  
  // Parse body if present
  let body = {};
  if (event.body) {
    try {
      body = JSON.parse(event.body);
    } catch (error: any) {
      console.warn('Error parsing request body:', error);
    }
  }
  
  // Create context
  return {
    db,
    user: event.user,
    entityName: options?.entityName || pathEntityName,
    operation: options?.operation || event.httpMethod.toLowerCase(),
    data: {
      ...options?.data,
      path,
      pathEntityName,
      pathId,
      query,
      body,
      headers: event.headers,
      httpMethod: event.httpMethod,
    },
    params: {
      id: pathId,
      ...query
    },
    getService: (name${typescript ? ': string' : ''}) => {
      if (options?.services && options.services[name]) {
        return options.services[name];
      }
      throw new Error(\`Service \${name} not available in Netlify context\`);
    }
  }${typescript ? ' as HookContext' : ''};
}
`;
	}

	/**
	 * Adapt response context to Netlify
	 * @param options Additional options
	 * @returns Response context adapter code
	 */
	adaptResponseContext(options?: Record<string, any>): string {
		const typescript = options?.typescript !== false;

		this.logger.debug('Adapting response context for Netlify');

		return `${typescript ? '/**\n * Response Context Adapter for Netlify Functions\n * Converts framework responses to Netlify Function responses\n */' : '// Response Context Adapter for Netlify Functions'}

${typescript ? 'import { CORS_HEADERS } from "../types";' : 'const { CORS_HEADERS } = require("../types");'}

${typescript ? '/**\n * Format response for Netlify\n * @param data Response data\n * @param statusCode HTTP status code\n * @param headers Additional headers\n * @returns Netlify Function response\n */' : '// Format response for Netlify'}
${typescript ? 'export function formatResponse(data: any, statusCode: number = 200, headers: Record<string, string> = {}): any {' : 'exports.formatResponse = function(data, statusCode = 200, headers = {}) {'}
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...headers
    },
    body: typeof data === 'string' ? data : JSON.stringify(data)
  };
}

${typescript ? '/**\n * Format error response for Netlify\n * @param message Error message\n * @param statusCode HTTP status code\n * @param errorType Error type\n * @param details Additional error details\n * @returns Netlify Function error response\n */' : '// Format error response for Netlify'}
${typescript ? 'export function formatErrorResponse(message: string, statusCode: number = 400, errorType?: string, details?: Record<string, any>): any {' : 'exports.formatErrorResponse = function(message, statusCode = 400, errorType, details) {'}
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS
    },
    body: JSON.stringify({
      message,
      error: errorType || 'Error',
      status: statusCode,
      ...(details && { details })
    }),
    isError: true
  };
}

${typescript ? '/**\n * Convert action result to Netlify response\n * @param result Action execution result\n * @returns Netlify Function response\n */' : '// Convert action result to Netlify response'}
${typescript ? 'export function actionResultToResponse(result: any): any {' : 'exports.actionResultToResponse = function(result) {'}
  if (!result) {
    return formatResponse({ message: 'No result returned' }, 204);
  }
  
  if (result.success === false) {
    return formatErrorResponse(
      result.error || 'Action failed',
      result.statusCode || 400,
      result.error ? 'ActionError' : undefined,
      result.metadata
    );
  }
  
  return formatResponse(
    result.data,
    result.statusCode || 200
  );
}
`;
	}
}