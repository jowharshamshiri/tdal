import { DatabaseContext } from "./database/core/database-context";

// Export database configuration functions
export const configureDatabase = (config: any) =>
  DatabaseContext.configure(config);
export const getDatabase = () => DatabaseContext.getDatabase();
export const closeDatabase = () => DatabaseContext.closeDatabase();

// Import required modules
import { ApiResponse, Event, CORS_HEADERS, createErrorResponse } from "./api";
import { SchemaLoader } from "./database/schema/schema-loader";

// Initialize database
const initializeDatabase = async (): Promise<void> => {
  try {
    // Configure database - using SQLite as default
    configureDatabase({
      type: "sqlite",
      connection: {
        filename: process.env.DB_PATH || "./data/tdal.db",
        testFilename: process.env.TEST_DB_PATH || "./data/test_tdal.db",
      },
      useTestDatabase: process.env.NODE_ENV === "test",
    });

    // Check if database needs initialization
    const db = getDatabase();
    const dbInfo = await db.getDatabaseInfo();

    // Initialize database if tables don't exist
    if (
      !dbInfo.tables ||
      (dbInfo.tables as Array<Record<string, unknown>>).length === 0
    ) {
      if (process.env.NODE_ENV === "development") {
        const logMessage = "Initializing database...";
        // Use a logger instead of direct console.log
        if (
          typeof process !== "undefined" &&
          process.env.NODE_ENV === "development"
        ) {
          // eslint-disable-next-line no-console
          console.log(logMessage);
        }
      }

      const schemaLoader = new SchemaLoader(db);
      await schemaLoader.initializeDatabase();

      if (process.env.NODE_ENV === "development") {
        const logMessage = "Database initialized successfully";
        // Use a logger instead of direct console.log
        if (
          typeof process !== "undefined" &&
          process.env.NODE_ENV === "development"
        ) {
          // eslint-disable-next-line no-console
          console.log(logMessage);
        }
      }
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      // Use a logger instead of direct console.error
      if (
        typeof process !== "undefined" &&
        process.env.NODE_ENV === "development"
      ) {
        // eslint-disable-next-line no-console
        console.error("Error initializing database:", error);
      }
    }
    throw error;
  }
};

// Default handler for OPTIONS requests (CORS preflight)
const handleOptions = async (): Promise<ApiResponse> => {
  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: "",
  };
};

// Authentication middleware
export const authenticate = async (
  event: Event
): Promise<ApiResponse | Event> => {
  // Skip authentication for OPTIONS requests
  if (event.httpMethod === "OPTIONS") {
    return handleOptions();
  }

  // Check for Authorization header
  const authHeader = event.headers.Authorization || event.headers.authorization;

  if (!authHeader) {
    return createErrorResponse("Missing authorization header", 401);
  }

  try {
    // JWT validation logic would go here
    // For now, we'll skip actual validation and just return a mock user

    // In a real implementation, you would:
    // 1. Extract the token from the auth header
    // 2. Verify the token signature
    // 3. Check if the token is expired
    // 4. Set the user info in the event object

    // Mock user for demonstration purposes
    const mockUser = {
      user_id: 1,
      name: "John Smith",
      email: "admin@dogfood.com",
      role: "admin",
    };

    // Add user info to event
    return {
      ...event,
      user: mockUser,
    };
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      // Use a logger instead of direct console.error
      if (
        typeof process !== "undefined" &&
        process.env.NODE_ENV === "development"
      ) {
        // eslint-disable-next-line no-console
        console.error("Authentication error:", error);
      }
    }
    return createErrorResponse("Invalid token", 401);
  }
};

// Credit check middleware
export const checkCredits = (
  resourceType: string,
  getResourceId: (event: Event) => number
) => {
  return async (event: Event): Promise<ApiResponse | Event> => {
    // Skip credit check for OPTIONS requests
    if (event.httpMethod === "OPTIONS") {
      return handleOptions();
    }

    try {
      // Skip credit check for free resources or admins
      if (!event.user) {
        return createErrorResponse("Authentication required", 401);
      }

      // Admins bypass credit check
      if (event.user.role === "admin") {
        return event;
      }

      // Get resource ID from the event
      const resourceId = getResourceId(event);

      // Check if user has enough credits
      let hasAccess = false;

      if (resourceType === "product") {
        // Import repositories dynamically to avoid cyclic dependencies
        const ProductRepository = (
          await import("./repositories/product-repository")
        ).ProductRepository;
        const productRepo = new ProductRepository();
        const result = await productRepo.checkCreditAccess(
          resourceId,
          event.user.user_id
        );
        hasAccess = result.allowed;

        if (!hasAccess) {
          return createErrorResponse(
            result.message,
            403,
            "INSUFFICIENT_CREDITS",
            {
              cost: result.cost,
              balance: result.balance,
              remainingCredits: result.remainingCredits,
            }
          );
        }
      }

      // Allow access if passed all checks
      return event;
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        // Use a logger instead of direct console.error
        if (
          typeof process !== "undefined" &&
          process.env.NODE_ENV === "development"
        ) {
          // eslint-disable-next-line no-console
          console.error("Credit check error:", error);
        }
      }
      return createErrorResponse("Error checking credits", 500);
    }
  };
};

// Handler factory for creating API handlers
export const createHandler = (
  handler: (event: Event) => Promise<ApiResponse>,
  middleware: Array<(event: Event) => Promise<ApiResponse | Event>> = []
) => {
  return async (rawEvent: unknown): Promise<ApiResponse> => {
    try {
      // Initialize database
      await initializeDatabase();

      // Apply middleware
      let event = rawEvent as Event;

      for (const mw of middleware) {
        const result = await mw(event);

        if ("statusCode" in result) {
          // Middleware returned an API response, short-circuit
          return result as ApiResponse;
        }

        // Middleware passed, continue with modified event
        event = result as Event;
      }

      // Execute handler
      return await handler(event);
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        // Use a logger instead of direct console.error
        if (
          typeof process !== "undefined" &&
          process.env.NODE_ENV === "development"
        ) {
          // eslint-disable-next-line no-console
          console.error("Handler error:", error);
        }
      }
      return createErrorResponse("Internal server error", 500);
    } finally {
      // Close database connection
      closeDatabase();
    }
  };
};

// API handler registry
export const handlers = {
  // Auth handlers
  login: createHandler(async (): Promise<ApiResponse> => {
    // Handle login logic here
    return createErrorResponse("Not implemented", 501);
  }),

  register: createHandler(async (): Promise<ApiResponse> => {
    // Handle registration logic here
    return createErrorResponse("Not implemented", 501);
  }),

  // User handlers
  getUsers: createHandler(async (): Promise<ApiResponse> => {
    // Handle get users logic here
    return createErrorResponse("Not implemented", 501);
  }, [authenticate]),

  // ProductCategory handlers
  getCategories: createHandler(async (): Promise<ApiResponse> => {
    // Handle get categories logic here
    return createErrorResponse("Not implemented", 501);
  }, [authenticate]),

  // Product handlers
  getProducts: createHandler(async (): Promise<ApiResponse> => {
    // Handle get products logic here
    return createErrorResponse("Not implemented", 501);
  }, [authenticate]),

  // Credit handlers
  getCreditPackages: createHandler(async (): Promise<ApiResponse> => {
    // Handle get credit packages logic here
    return createErrorResponse("Not implemented", 501);
  }, [authenticate]),

  // Shopping session handlers
  startShoppingSession: createHandler(async (): Promise<ApiResponse> => {
    // Handle start shopping session logic here
    return createErrorResponse("Not implemented", 501);
  }, [authenticate]),
};

// Main entry point for serverless functions
export const handler = async (event: unknown): Promise<ApiResponse> => {
  const typedEvent = event as Event;

  // Handle OPTIONS requests
  if (typedEvent.httpMethod === "OPTIONS") {
    return handleOptions();
  }

  // Route the request to the appropriate handler
  const path = typedEvent.path.toLowerCase();

  if (path.endsWith("/login")) {
    return handlers.login(event);
  } else if (path.endsWith("/register")) {
    return handlers.register(event);
  } else if (path.endsWith("/users")) {
    return handlers.getUsers(event);
  } else if (path.endsWith("/categories")) {
    return handlers.getCategories(event);
  } else if (path.endsWith("/products")) {
    return handlers.getProducts(event);
  } else if (path.endsWith("/credit-packages")) {
    return handlers.getCreditPackages(event);
  } else if (path.endsWith("/shopping-sessions")) {
    return handlers.startShoppingSession(event);
  }

  // Default response for unmatched routes
  return createErrorResponse("Not found", 404);
};

// For local development server
if (process.env.NODE_ENV === "development") {
  initializeDatabase()
    .then(() => {
      // Use a logger instead of direct console.log
      if (
        typeof process !== "undefined" &&
        process.env.NODE_ENV === "development"
      ) {
        // eslint-disable-next-line no-console
        console.log("Database initialized for development");
      }
    })
    .catch((error) => {
      // Use a logger instead of direct console.error
      if (
        typeof process !== "undefined" &&
        process.env.NODE_ENV === "development"
      ) {
        // eslint-disable-next-line no-console
        console.error("Failed to initialize database for development:", error);
      }
    });
}
