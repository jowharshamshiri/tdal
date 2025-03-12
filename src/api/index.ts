/**
 * API types index file
 * Exports all API-related type definitions
 */

// API types
export * from "./api-types";

// Authentication types
export * from "./auth-types";

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
