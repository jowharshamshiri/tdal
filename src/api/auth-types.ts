/**
 * Authentication-related types
 */

/**
 * JWT payload structure
 */
export interface JwtPayload {
  /**
   * User ID
   */
  user_id: number;

  /**
   * User's email
   */
  email: string;

  /**
   * User's role
   */
  role: "user" | "admin";

  /**
   * User's name
   */
  name?: string;

  /**
   * Token issued at timestamp
   */
  iat?: number;

  /**
   * Token expiration timestamp
   */
  exp?: number;
}

/**
 * Login request
 */
export interface LoginRequest {
  /**
   * Action type
   */
  action: "login";

  /**
   * User's email
   */
  email: string;

  /**
   * User's password
   */
  password: string;
}

/**
 * Register request
 */
export interface RegisterRequest {
  /**
   * Action type
   */
  action: "register";

  /**
   * User's name
   */
  name: string;

  /**
   * User's email
   */
  email: string;

  /**
   * User's password
   */
  password: string;
}

/**
 * Reset password request
 */
export interface ResetPasswordRequest {
  /**
   * Action type
   */
  action: "reset_password";

  /**
   * User's email
   */
  email: string;
}

/**
 * Union type for all authentication requests
 */
export type AuthRequest = LoginRequest | RegisterRequest | ResetPasswordRequest;

/**
 * Authentication response
 */
export interface AuthResponse {
  /**
   * JWT token
   */
  token: string;

  /**
   * User information
   */
  user: {
    /**
     * User ID
     */
    user_id: number;

    /**
     * User's name
     */
    name: string;

    /**
     * User's email
     */
    email: string;

    /**
     * User's role
     */
    role: "user" | "admin";

    /**
     * User's credits
     */
    credits: number;
  };
}

/**
 * Result of authentication middleware
 */
export interface AuthResult {
  /**
   * HTTP status code
   */
  statusCode?: number;

  /**
   * HTTP headers
   */
  headers?: Record<string, string>;

  /**
   * Response body
   */
  body?: string;

  /**
   * Whether this is an error
   */
  isError?: boolean;

  /**
   * Authenticated user information
   */
  user?: JwtPayload;
}

/**
 * Error response from authentication
 */
export interface AuthErrorResponse {
  /**
   * HTTP status code
   */
  statusCode: number;

  /**
   * HTTP headers
   */
  headers: Record<string, string>;

  /**
   * Response body
   */
  body: string;

  /**
   * Whether this is an error
   */
  isError: true;
}

/**
 * Token verification function type
 */
export interface TokenVerifier {
  (event: unknown): Promise<AuthResult | unknown>;
}

/**
 * Credit checking function type
 */
export interface CreditChecker {
  (userId: number, resourceType: string, resourceId: number): Promise<{
    /**
     * Whether access is allowed
     */
    allowed: boolean;

    /**
     * Message
     */
    message: string;

    /**
     * Resource cost
     */
    cost?: number;

    /**
     * User's balance
     */
    balance?: number;

    /**
     * Remaining credits after purchase
     */
    remainingCredits?: number;
  }>;
}

/**
 * Auth context for React
 */
export interface AuthContextType {
  /**
   * Authenticated user
   */
  user: JwtPayload | null;

  /**
   * JWT token
   */
  token: string | null;

  /**
   * Whether the user is authenticated
   */
  isAuthenticated: boolean;

  /**
   * Whether the user is an admin
   */
  isAdmin: boolean;

  /**
   * User's credit balance
   */
  credits: number;

  /**
   * Login function
   */
  login: (email: string, password: string) => Promise<void>;

  /**
   * Register function
   */
  register: (name: string, email: string, password: string) => Promise<void>;

  /**
   * Logout function
   */
  logout: () => void;

  /**
   * Update credits function
   */
  updateCredits: (newAmount: number) => void;

  /**
   * Refresh credits function
   */
  refreshCredits: () => Promise<number>;
}
