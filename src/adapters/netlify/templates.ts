/**
 * Netlify Templates
 * Code templates for Netlify function handlers
 */

import { EntityConfig, EntityAction } from '../../entity/entity-config';

/**
 * Template options for handler generation
 */
export interface TemplateOptions {
	/**
	 * Entity configuration
	 */
	entity?: EntityConfig;

	/**
	 * Available actions
	 */
	actions?: EntityAction[];

	/**
	 * Whether to generate TypeScript code
	 */
	typescript?: boolean;
}

/**
 * Generate handler template for an entity
 * @param options Template options
 * @returns Generated handler code
 */
export function generateHandlerTemplate(options: TemplateOptions): string {
	const { entity, actions = [], typescript = true } = options;

	if (!entity) {
		throw new Error('Entity configuration is required for handler generation');
	}

	const entityName = entity.entity;
	const tableName = entity.table;
	const lowerEntityName = entityName.toLowerCase();

	return `${typescript ? 'import { verifyToken } from "../../utils/auth-middleware";' : 'const { verifyToken } = require("../../utils/auth-middleware");'}
${typescript ? 'import { Event, Context, ApiResponse, CORS_HEADERS } from "../../types";' : 'const { CORS_HEADERS } = require("../../types");'}
${typescript ? `import { create${entityName}Repository } from "../../repositories";` : `const { create${entityName}Repository } = require("../../repositories");`}
${typescript ? 'import { getDb } from "../../db";' : 'const { getDb } = require("../../db");'}

${typescript ? 'export const handler = async (event: any, context: any): Promise<any> => {' : 'exports.handler = async (event, context) => {'}
  // Handle OPTIONS request (preflight for CORS)
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: "",
    }${typescript ? ' as ApiResponse' : ''};
  }

  const db = getDb();
  const path = event.path.split("/");
  const ${lowerEntityName}Id = 
    path[path.length - 1] !== "${lowerEntityName}s" ? path[path.length - 1] : null;

  // Skip auth for public endpoints if applicable
  const isPublicEndpoint = ${entity.api?.permissions?.getAll?.includes('public') || false}; 

  // Only authenticate for protected endpoints
  let userId${typescript ? ': number | null' : ''} = null;
  let userRole${typescript ? ': string | null' : ''} = null;
  let modifiedEvent = event;

  if (!isPublicEndpoint) {
    // Authenticate request
    const authenticatedEvent = await verifyToken(event);

    // Check if auth failed
    if ("isError" in authenticatedEvent && authenticatedEvent.isError) {
      return authenticatedEvent${typescript ? ' as ApiResponse' : ''};
    }

    userId = authenticatedEvent.user?.user_id || null;
    userRole = authenticatedEvent.user?.role || null;
    modifiedEvent = authenticatedEvent${typescript ? ' as Event' : ''};
  }

  try {
    // Create repository
    const repo = create${entityName}Repository(db);

    // GET - Read ${lowerEntityName}s
    if (modifiedEvent.httpMethod === "GET") {
      if (${lowerEntityName}Id) {
        // Get specific ${lowerEntityName} by ID
        const ${lowerEntityName}Detail = await repo.findById(
          parseInt(${lowerEntityName}Id)
        );

        if (!${lowerEntityName}Detail) {
          return {
            statusCode: 404,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "${entityName} not found" }),
          }${typescript ? ' as ApiResponse' : ''};
        }

        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify(${lowerEntityName}Detail),
        }${typescript ? ' as ApiResponse' : ''};
      } else {
        // Get all ${lowerEntityName}s
        const ${lowerEntityName}s = await repo.findAll();

        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            ${lowerEntityName}s,
          }),
        }${typescript ? ' as ApiResponse' : ''};
      }
    }

    // POST - Create ${lowerEntityName}
    if (modifiedEvent.httpMethod === "POST") {
      ${isRoleRestricted(entity, 'create') ? checkRoleRestriction(entity, 'create') : ''}
      
      if (!modifiedEvent.body) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ message: "Request body is required" }),
        }${typescript ? ' as ApiResponse' : ''};
      }

      const data = JSON.parse(modifiedEvent.body);
      
      // Create new ${lowerEntityName}
      const new${entityName}Id = await repo.create(data);

      // Get the created ${lowerEntityName}
      const new${entityName} = await repo.findById(new${entityName}Id);

      return {
        statusCode: 201,
        headers: CORS_HEADERS,
        body: JSON.stringify(new${entityName}),
      }${typescript ? ' as ApiResponse' : ''};
    }

    // PUT - Update ${lowerEntityName}
    if (modifiedEvent.httpMethod === "PUT") {
      ${isRoleRestricted(entity, 'update') ? checkRoleRestriction(entity, 'update') : ''}
      
      if (!${lowerEntityName}Id) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ message: "${entityName} ID is required" }),
        }${typescript ? ' as ApiResponse' : ''};
      }

      if (!modifiedEvent.body) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ message: "Request body is required" }),
        }${typescript ? ' as ApiResponse' : ''};
      }

      const data = JSON.parse(modifiedEvent.body);

      // Check if ${lowerEntityName} exists
      const ${lowerEntityName}Exists = await repo.exists(parseInt(${lowerEntityName}Id));

      if (!${lowerEntityName}Exists) {
        return {
          statusCode: 404,
          headers: CORS_HEADERS,
          body: JSON.stringify({ message: "${entityName} not found" }),
        }${typescript ? ' as ApiResponse' : ''};
      }

      // Update ${lowerEntityName}
      await repo.update(parseInt(${lowerEntityName}Id), data);

      // Get updated ${lowerEntityName}
      const updated${entityName} = await repo.findById(parseInt(${lowerEntityName}Id));

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify(updated${entityName}),
      }${typescript ? ' as ApiResponse' : ''};
    }

    // DELETE - Delete ${lowerEntityName}
    if (modifiedEvent.httpMethod === "DELETE") {
      ${isRoleRestricted(entity, 'delete') ? checkRoleRestriction(entity, 'delete') : ''}
      
      if (!${lowerEntityName}Id) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ message: "${entityName} ID is required" }),
        }${typescript ? ' as ApiResponse' : ''};
      }

      // Delete ${lowerEntityName}
      await repo.delete(parseInt(${lowerEntityName}Id));

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: "${entityName} deleted successfully" }),
      }${typescript ? ' as ApiResponse' : ''};
    }

    // Handle custom actions
    ${generateCustomActionHandlers(entity, actions)}

    // If we got here, method not allowed
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: "Method not allowed" }),
    }${typescript ? ' as ApiResponse' : ''};
  } catch (error: any) {
    console.error("Error handling ${lowerEntityName}s:", error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        message: "Server error",
        error: error instanceof Error ? error.message : "Unknown error",
      }),
    }${typescript ? ' as ApiResponse' : ''};
  }
};
`;
}

/**
 * Generate index template
 * @param options Template options
 * @returns Generated index code
 */
export function generateIndexTemplate(options: TemplateOptions): string {
	const { typescript = true } = options;

	return `${typescript ? '/**\n * Netlify Functions Index\n * Entry point for the API\n */' : '// Netlify Functions Index'}

${typescript ? 'export * from "./db";' : 'module.exports = { ...require("./db") };'}
${typescript ? 'export * from "./repositories";' : 'Object.assign(module.exports, require("./repositories"));'}
${typescript ? 'export * from "./types";' : 'Object.assign(module.exports, require("./types"));'}
${typescript ? 'export * from "./utils/auth-middleware";' : 'Object.assign(module.exports, require("./utils/auth-middleware"));'}
`;
}

/**
 * Generate type definitions template
 * @returns Generated type definitions code
 */
export function generateTypeDefinitionsTemplate(): string {
	return `/**
 * API types index file
 * Exports all API-related type definitions
 */

// HTTP Method types
export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "OPTIONS"
  | "PATCH";

// Lambda event context
export interface Context {
  functionName: string;
  functionVersion: string;
  invokedFunctionArn: string;
  memoryLimitInMB: string;
  awsRequestId: string;
  logGroupName: string;
  logStreamName: string;
  identity?: {
    cognitoIdentityId: string;
    cognitoIdentityPoolId: string;
  };
  clientContext?: {
    client: {
      installationId: string;
      appTitle: string;
      appVersionName: string;
      appVersionCode: string;
      appPackageName: string;
    };
    env: {
      platformVersion: string;
      platform: string;
      make: string;
      model: string;
      locale: string;
    };
  };
}

// Generic Lambda event
export interface Event {
  httpMethod: HttpMethod;
  path: string;
  headers: Record<string, string>;
  queryStringParameters: Record<string, string> | null;
  body: string | null;
  isBase64Encoded: boolean;
  // Custom field added by our middleware
  user?: {
    user_id: number;
    email: string;
    role: string;
  };
}

// Standard API response format
export interface ApiResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  isError?: boolean;
}

// Standard headers for CORS
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

// Helper function to create a success response
export function createSuccessResponse<T>(
  data: T,
  statusCode = 200
): ApiResponse {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
    body: JSON.stringify(data),
  };
}

// Helper function to create an error response
export function createErrorResponse(
  message: string,
  statusCode = 400,
  error?: string,
  details?: Record<string, unknown>
): ApiResponse {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
    body: JSON.stringify({
      message,
      error,
      status: statusCode,
      ...(details && { data: details }),
    }),
    isError: true,
  };
}
`;
}

/**
 * Generate auth utility template
 * @param options Template options
 * @returns Generated auth utility code
 */
export function generateAuthUtilTemplate(options: TemplateOptions): string {
	const { typescript = true } = options;

	return `${typescript ? '/**\n * Authentication Middleware\n * JWT verification for Netlify functions\n */' : '// Authentication Middleware'}

${typescript ? 'import jwt from "jsonwebtoken";' : 'const jwt = require("jsonwebtoken");'}
${typescript ? 'import { Event, ApiResponse, CORS_HEADERS } from "../types";' : 'const { CORS_HEADERS } = require("../types");'}

// JWT secret from environment variables
const JWT_SECRET = process.env.JWT_SECRET || "your-default-secret-change-me";

${typescript ? '/**\n * Verify JWT token in Authorization header\n * @param event Netlify function event\n * @returns Original event with user data or error response\n */' : '// Verify JWT token in Authorization header'}
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
  } catch (error: any) {
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

/**
 * Check if an operation is restricted to specific roles
 * @param entity Entity configuration
 * @param operation Operation name
 * @returns Whether the operation is restricted to specific roles
 */
function isRoleRestricted(entity: EntityConfig, operation: string): boolean {
	return !!entity.api?.permissions?.[operation] &&
		!entity.api.permissions[operation].includes('public') &&
		entity.api.permissions[operation].length > 0;
}

/**
 * Generate role restriction check code
 * @param entity Entity configuration
 * @param operation Operation name
 * @returns Role restriction check code
 */
function checkRoleRestriction(entity: EntityConfig, operation: string): string {
	const permissions = entity.api?.permissions?.[operation] || [];
	const permissionsString = permissions.map(p => `"${p}"`).join(", ");

	return `// Only ${permissionsString} users can ${operation} ${entity.entity.toLowerCase()}
      if (${permissions.map(role => `userRole !== "${role}"`).join(' && ')}) {
        return {
          statusCode: 403,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            message: "Permission denied: Only ${permissions.join(' or ')} can ${operation} ${entity.entity.toLowerCase()}",
          }),
        } as ApiResponse;
      }
`;
}

/**
 * Generate custom action handlers
 * @param entity Entity configuration
 * @param actions Entity actions
 * @returns Custom action handlers code
 */
function generateCustomActionHandlers(entity: EntityConfig, actions: EntityAction[]): string {
	if (!actions || actions.length === 0) {
		return '// No custom actions defined';
	}

	const customActions = actions.filter(a => a.httpMethod && a.route);
	if (customActions.length === 0) {
		return '// No custom actions defined';
	}

	let code = '// Custom action handlers\n';

	for (const action of customActions) {
		const method = action.httpMethod.toUpperCase();
		const route = action.route;
		const actionName = action.name;

		code += `    // ${method} ${route} - ${action.description || actionName}\n`;
		code += `    if (modifiedEvent.httpMethod === "${method}" && path.endsWith("${route.replace(/^\//, '')}")) {\n`;

		// Add role restriction if applicable
		if (action.roles && action.roles.length > 0) {
			const rolesString = action.roles.map(r => `"${r}"`).join(", ");

			code += `      // Only ${rolesString} users can execute this action\n`;
			code += `      if (${action.roles.map(role => `userRole !== "${role}"`).join(' && ')}) {\n`;
			code += `        return {\n`;
			code += `          statusCode: 403,\n`;
			code += `          headers: CORS_HEADERS,\n`;
			code += `          body: JSON.stringify({\n`;
			code += `            message: "Permission denied: Only ${action.roles.join(' or ')} can perform this action",\n`;
			code += `          }),\n`;
			code += `        } as ApiResponse;\n`;
			code += `      }\n\n`;
		}

		// Parse request body for POST, PUT, PATCH
		if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
			code += `      if (!modifiedEvent.body) {\n`;
			code += `        return {\n`;
			code += `          statusCode: 400,\n`;
			code += `          headers: CORS_HEADERS,\n`;
			code += `          body: JSON.stringify({ message: "Request body is required" }),\n`;
			code += `        } as ApiResponse;\n`;
			code += `      }\n\n`;
			code += `      const requestData = JSON.parse(modifiedEvent.body);\n\n`;
		}

		// Execute action
		code += `      // Execute action\n`;
		code += `      try {\n`;
		code += `        const result = await repo.${actionName}({\n`;
		code += `          ...(modifiedEvent.queryStringParameters || {}),\n`;
		code += `          ...((modifiedEvent.body ? JSON.parse(modifiedEvent.body) : {}) || {}),\n`;
		code += `          user_id: userId\n`;
		code += `        });\n\n`;
		code += `        return {\n`;
		code += `          statusCode: 200,\n`;
		code += `          headers: CORS_HEADERS,\n`;
		code += `          body: JSON.stringify(result),\n`;
		code += `        } as ApiResponse;\n`;
		code += `      } catch (error: any) {\n`;
		code += `        return {\n`;
		code += `          statusCode: 400,\n`;
		code += `          headers: CORS_HEADERS,\n`;
		code += `          body: JSON.stringify({\n`;
		code += `            message: "Action failed",\n`;
		code += `            error: error instanceof Error ? error.message : "Unknown error"\n`;
		code += `          }),\n`;
		code += `        } as ApiResponse;\n`;
		code += `      }\n`;
		code += `    }\n\n`;
	}

	return code;
}