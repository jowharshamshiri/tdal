# tdal

# TDAL: A Declarative YAML-Driven Application Framework

## Project Vision

TDAL is a framework that allows developers to build full-stack web applications using primarily YAML configuration files. The core principle is **"configuration over code"** while still maintaining the flexibility to implement complex business logic when needed.

Our vision is to drastically reduce the amount of boilerplate code needed to build modern web applications by providing a declarative approach to defining:

- Data models and relationships
- API endpoints with built-in CRUD operations
- Authentication and authorization rules
- UI components and layouts
- Business logic through hooks and actions
- Workflows and state transitions
- Integrations with external systems

### Core Philosophy

The framework is built on several key principles:

1. **Simplicity by default, complexity when needed** - The framework should make common tasks trivial while still allowing for complex customizations when required
2. **Convention over configuration** - Sensible defaults that follow best practices
3. **Progressive disclosure** - Simple scenarios require minimal YAML, but advanced features are available when needed
4. **Type safety** - Generate TypeScript interfaces from YAML schemas
5. **Developer experience first** - Comprehensive error messages, hot reloading, and tooling
6. **Extensibility** - Plugin architecture for custom components and logic
7. **Declarative approach** - Express what should happen, not how it should happen
8. **Configuration as documentation** - YAML files serve as both configuration and high-level documentation

## System Architecture

TDAL is structured around a core engine that processes YAML configuration files and generates or executes the appropriate code at each layer of the application:

```
┌─────────────────────┐
│  YAML Configuration │
└───────────┬─────────┘
            │
┌───────────▼─────────┐
│   TDAL Engine     │
└───────────┬─────────┘
            │
┌───────────▼─────────┐
│ Generated Components │
└───────────┬─────────┘
            │
┌───────────▼─────────┐
│  Runtime Framework   │
└───────────┬─────────┘
            │
┌───────────▼─────────┐
│    Your Application  │
└─────────────────────┘
```

### Key Components

1. **Configuration Loader** - Loads, validates, and processes YAML files
2. **Entity Manager** - Manages entity definitions, relationships, and database mappings
3. **API Generator** - Creates REST APIs based on entity definitions
4. **Auth Provider** - Implements authentication and authorization
5. **UI Generator** - Creates frontend components based on entity and UI definitions
6. **Business Logic Engine** - Executes hooks, actions, and workflows
7. **Integration Layer** - Manages connections to external systems
8. **Plugin System** - Allows for extensibility through plugins

## YAML Configuration

### Entity Definitions

Entities are the foundation of the system. They define the data model, relationships, validation rules, and more:

```yaml
entity: Product
table: products
idField: product_id

# Database schema definition
columns:
  - logical: product_id
    physical: product_id
    primaryKey: true
    autoIncrement: true
    type: integer
  - logical: title
    physical: title
    type: string
  - logical: pricing
    physical: pricing
    type: string
  - logical: is_free
    physical: is_free
    type: boolean
    defaultValue: false

# Relationships with other entities
relations:
  - name: categories
    type: manyToMany
    sourceEntity: Product
    targetEntity: ProductCategory
    sourceColumn: product_id
    targetColumn: category_id
    junctionTable: category_product
    junctionSourceColumn: product_id
    junctionTargetColumn: category_id

# Automatic timestamp management
timestamps:
  createdAt: created_at
  updatedAt: updated_at

# Field validation rules
validation:
  rules:
    title:
      - type: "required"
        message: "Title is required"
      - type: "maxLength"
        value: 100
        message: "Title cannot exceed 100 characters"

    pricing:
      - type: "required"
        message: "Pricing is required"

# Computed properties
computed:
  - name: "displayTitle"
    implementation: |
      (entity) => {
        return `${entity.title} - ${entity.pricing}`;
      }

# API exposure configuration
api:
  exposed: true
  basePath: "/api/products"
  operations:
    getAll: true
    getById: true
    create: true
    update: true
    delete: true

  # Role-based permissions
  permissions:
    getAll: ["user", "admin"]
    getById: ["user", "admin"]
    create: ["admin"]
    update: ["admin"]
    delete: ["admin"]

# Business logic hooks
hooks:
  beforeCreate:
    - name: "setDefaultValues"
      implementation: |
        async (entity, context) => {
          entity.total_view_count = 0;
          entity.bookmark_count = 0;
          return entity;
        }

  afterGetById:
    - name: "incrementViewCount"
      implementation: |
        async (entity, context) => {
          entity.total_view_count = (entity.total_view_count || 0) + 1;
          // Update in database but don't wait for completion
          context.entityDao.update(entity.product_id, { 
            total_view_count: entity.total_view_count 
          });
          return entity;
        }

# Custom business logic actions
actions:
  - name: "markAsFeatured"
    path: "/:id/featured"
    method: "POST"
    permissions: ["admin"]
    implementation: |
      async (req, context) => {
        const productId = req.params.id;
        const { featured } = req.body;
        
        await context.entityDao.update(productId, { 
          is_featured: featured 
        });
        
        return { success: true };
      }

# UI display configuration
ui:
  list:
    fields: ["title", "pricing", "is_free", "created_at"]
    actions: ["edit", "delete", "markAsFeatured"]

  detail:
    fields: ["title", "pricing", "is_free", "created_at", "updated_at"]
    layout: "tabs"
    tabs:
      - name: "Basic Info"
        fields: ["title", "pricing", "is_free"]
      - name: "Metadata"
        fields: ["created_at", "updated_at"]
```

### Authentication Configuration

```yaml
auth:
  provider: "jwt"
  secret: "${process.env.JWT_SECRET}"
  tokenExpiry: "24h"
  refreshTokenExpiry: "7d"

  # User entity configuration
  userEntity: "User"
  usernameField: "email"
  passwordField: "password"

  # Role configuration
  roles:
    - name: "admin"
      description: "Full system access"
    - name: "user"
      description: "Regular user access"
    - name: "guest"
      description: "Limited read-only access"

  # Login and registration endpoints
  endpoints:
    login:
      path: "/auth/login"
      method: "POST"
    register:
      path: "/auth/register"
      method: "POST"
      defaultRole: "user"
    refresh:
      path: "/auth/refresh"
      method: "POST"
    logout:
      path: "/auth/logout"
      method: "POST"

  # Password policy
  passwordPolicy:
    minLength: 8
    requireUppercase: true
    requireLowercase: true
    requireNumbers: true
    requireSpecialChars: true
```

### UI Configuration

```yaml
ui:
  theme:
    primaryColor: "#3f51b5"
    secondaryColor: "#f50057"
    fontFamily: "Roboto, sans-serif"

  layouts:
    - name: "default"
      template: |
        <div>
          <Header />
          <Sidebar />
          <main>
            <slot />
          </main>
          <Footer />
        </div>

  pages:
    - name: "productList"
      path: "/products"
      layout: "default"
      permissions: ["user", "admin"]
      components:
        - type: "DataTable"
          entity: "Product"
          columns: ["title", "pricing", "credit_cost"]
          actions: ["view", "edit", "delete"]
          filters: ["category_id", "is_free"]

    - name: "productEdit"
      path: "/products/:id"
      permissions: ["admin"]
      components:
        - type: "Form"
          entity: "Product"
          mode: "edit"
          fields: ["title", "pricing", "hint", "credit_cost", "category_ids"]
```

### Integration Configuration

```yaml
integrations:
  - name: "paymentGateway"
    type: "rest"
    baseUrl: "${process.env.PAYMENT_API_URL}"
    auth:
      type: "apiKey"
      headerName: "X-API-Key"
      value: "${process.env.PAYMENT_API_KEY}"

    endpoints:
      - name: "createPayment"
        method: "POST"
        path: "/payments"
        mapping:
          request: "./mappings/paymentRequest.js"
          response: "./mappings/paymentResponse.js"

      - name: "getPaymentStatus"
        method: "GET"
        path: "/payments/:id"
```

### Workflow Configuration

```yaml
workflows:
  - name: "productApproval"
    entity: "Product"
    stateField: "approval_status"

    states:
      - name: "draft"
        initial: true
      - name: "submitted"
      - name: "approved"
      - name: "rejected"

    transitions:
      - from: "draft"
        to: "submitted"
        action: "submitForApproval"
        permissions: ["user", "admin"]
        validation:
          - field: "title"
            rule: "required"

      - from: "submitted"
        to: "approved"
        action: "approve"
        permissions: ["admin"]
        hooks:
          after:
            - name: "sendApprovalNotification"
              implementation: |
                async (entity, context) => {
                  await context.services.notifications.send({
                    to: entity.createdBy,
                    template: "product-approved",
                    data: { product: entity }
                  });
                }

      - from: "submitted"
        to: "rejected"
        action: "reject"
        permissions: ["admin"]
        requireComment: true
```

## Database Integration

TDAL provides a database-agnostic approach with adapters for various database systems:

### Database Configuration

```yaml
database:
  type: "postgres" # or sqlite, mysql, etc.
  connection:
    host: "${process.env.DB_HOST}"
    port: "${process.env.DB_PORT}"
    database: "${process.env.DB_NAME}"
    user: "${process.env.DB_USER}"
    password: "${process.env.DB_PASSWORD}"

  pool:
    min: 2
    max: 10

  migrations:
    directory: "./migrations"
    tablePrefix: "ymm_"
```

### Data Access Layer

The framework generates a data access layer based on entity definitions:

1. **Entity DAO (Data Access Object)** - Provides CRUD operations for entities
2. **Query Builder** - Allows for complex queries beyond basic CRUD
3. **Transaction Support** - Manages database transactions
4. **Migration System** - Handles schema evolution

## API Generation

TDAL automatically generates REST APIs for entities:

1. **Standard CRUD Endpoints** - GET, POST, PUT, DELETE operations
2. **Custom Actions** - Additional endpoints for business operations
3. **Filtering, Sorting, Pagination** - Query parameter handling
4. **Response Formatting** - Consistent response structure
5. **Error Handling** - Standardized error responses
6. **Validation** - Request payload validation
7. **Documentation** - OpenAPI/Swagger documentation

### API Customization

For entities, the framework generates standard REST endpoints:

- `GET /{basePath}` - List all resources
- `GET /{basePath}/:id` - Get a specific resource
- `POST /{basePath}` - Create a new resource
- `PUT /{basePath}/:id` - Update a resource
- `DELETE /{basePath}/:id` - Delete a resource

Custom actions can be defined to handle complex operations:

```yaml
actions:
  - name: "searchProducts"
    path: "/search"
    method: "POST"
    permissions: ["user", "admin"]
    implementation: |
      async (req, context) => {
        const { query, filters } = req.body;
        
        // Complex search logic here
        const results = await context.services.search.findProducts(query, filters);
        
        return {
          count: results.length,
          results
        };
      }
```

## Authentication and Authorization

TDAL's auth system is designed to be flexible and secure:

### Authentication

- **JWT-based authentication** - Secure token-based auth
- **Multiple auth strategies** - JWT, OAuth, API Key
- **User registration and login** - Built-in user management
- **Password policies** - Configurable password requirements
- **Token refresh** - Secure token refreshing

### Authorization

- **Role-based access control** - Assign permissions by role
- **Field-level security** - Control access to specific fields
- **Operation-level permissions** - Control access to CRUD operations
- **Record-level access control** - Filter records based on user
- **Permission inheritance** - Role hierarchy

## Business Logic

TDAL supports embedding business logic directly in YAML:

### Hook System

Hooks are executed at specific points in the entity lifecycle:

- `beforeValidate` - Before validation runs
- `afterValidate` - After validation succeeds
- `beforeCreate` - Before a record is created
- `afterCreate` - After a record is created
- `beforeUpdate` - Before a record is updated
- `afterUpdate` - After a record is updated
- `beforeDelete` - Before a record is deleted
- `afterDelete` - After a record is deleted
- `beforeGetById` - Before retrieving a single record
- `afterGetById` - After retrieving a single record
- `beforeGetAll` - Before retrieving multiple records
- `afterGetAll` - After retrieving multiple records

### Custom Actions

Custom actions define business operations beyond CRUD:

```yaml
actions:
  - name: "promoteToFeatured"
    path: "/:id/promote"
    method: "POST"
    permissions: ["admin"]
    validation:
      schema:
        type: "object"
        properties:
          featuredUntil:
            type: "string"
            format: "date-time"
    implementation: |
      async (req, context) => {
        const { id } = req.params;
        const { featuredUntil } = req.body;
        
        await context.entityDao.update(id, {
          is_featured: true,
          featured_until: featuredUntil
        });
        
        // Notify the product owner
        const product = await context.entityDao.findById(id);
        await context.services.notification.notify({
          userId: product.owner_id,
          message: `Your product ${product.title} has been featured!`
        });
        
        return {
          success: true,
          message: "Product promoted to featured"
        };
      }
```

### Computed Properties

Computed properties derive values from other fields:

```yaml
computed:
  - name: "fullName"
    dependencies: ["firstName", "lastName"]
    implementation: |
      (entity) => {
        return `${entity.firstName} ${entity.lastName}`;
      }

  - name: "isExpired"
    dependencies: ["expiryDate"]
    implementation: |
      (entity) => {
        return new Date(entity.expiryDate) < new Date();
      }
```

### Validation Rules

```yaml
validation:
  rules:
    email:
      - type: "required"
        message: "Email is required"
      - type: "email"
        message: "Invalid email format"

    password:
      - type: "required"
        message: "Password is required"
      - type: "minLength"
        value: 8
        message: "Password must be at least 8 characters"
      - type: "custom"
        implementation: |
          (value) => {
            return /[A-Z]/.test(value) && /[0-9]/.test(value);
          }
        message: "Password must contain at least one uppercase letter and one number"
```

## UI Generation

TDAL can generate frontend code for various frameworks:

### Page Definitions

```yaml
pages:
  - name: "productList"
    path: "/products"
    layout: "default"
    title: "Products"
    permissions: ["user", "admin"]
    components:
      - type: "DataTable"
        entity: "Product"
        columns:
          - name: "title"
            label: "Product Title"
            sortable: true
          - name: "pricing"
            label: "Price"
            sortable: true
          - name: "is_free"
            label: "Free?"
            component: "BooleanBadge"
        actions:
          - name: "view"
            label: "View"
            icon: "eye"
            permissions: ["user", "admin"]
          - name: "edit"
            label: "Edit"
            icon: "pencil"
            permissions: ["admin"]
        filters:
          - field: "category_id"
            label: "Category"
            component: "SelectFilter"
            options:
              entityRef: "ProductCategory"
              valueField: "category_id"
              labelField: "category_name"
```

### Component Library

TDAL provides a library of built-in components:

1. **Form** - Auto-generated forms for entities
2. **DataTable** - Table with sorting, filtering, pagination
3. **DetailView** - Display entity details
4. **Card** - Card component for entity display
5. **Chart** - Data visualization
6. **Dashboard** - Configurable dashboard
7. **FileUpload** - File upload handling
8. **SelectFilter** - Dropdown filter
9. **DateRangePicker** - Date range selection
10. **Kanban** - Kanban board for workflow states

### Custom Components

Developers can create custom components:

```yaml
components:
  - name: "ProductCard"
    source: "./components/ProductCard.js"
    props:
      - name: "product"
        type: "object"
        required: true
      - name: "showPrice"
        type: "boolean"
        default: true
```

### Layout System

```yaml
layouts:
  - name: "dashboard"
    template: |
      <div class="dashboard-layout">
        <Sidebar />
        <div class="main-content">
          <Header />
          <div class="page-content">
            <slot />
          </div>
          <Footer />
        </div>
      </div>
```

## Event System

TDAL includes a powerful event system:

```yaml
events:
  - name: "productViewed"
    description: "Triggered when a product is viewed"
    payload:
      type: "object"
      properties:
        productId:
          type: "number"
        userId:
          type: "number"
    handlers:
      - name: "incrementViewCount"
        implementation: |
          async (event, context) => {
            await context.entityDao.query(
              "UPDATE products SET view_count = view_count + 1 WHERE product_id = ?",
              event.payload.productId
            );
          }

      - name: "logProductView"
        implementation: |
          async (event, context) => {
            await context.services.analytics.logEvent("product_view", {
              productId: event.payload.productId,
              userId: event.payload.userId,
              timestamp: new Date().toISOString()
            });
          }
```

### Event Types

1. **Entity Events** - CRUD operations on entities
2. **Custom Events** - Developer-defined events
3. **System Events** - Framework-level events
4. **External Events** - Events from integrations

### Event Handlers

Event handlers can:

1. **Modify data** - Update entity records
2. **Trigger notifications** - Send emails, push notifications
3. **Update external systems** - Call APIs, update integrations
4. **Start workflows** - Trigger workflow transitions
5. **Emit new events** - Chain events together

## Plugin System

TDAL's plugin system enables extensibility:

```yaml
plugins:
  - name: "yamlang-export"
    source: "npm:yamlang-export-plugin"
    config:
      formats: ["csv", "xlsx", "pdf"]

  - name: "yamlang-analytics"
    source: "./plugins/analytics"
    config:
      provider: "google-analytics"
      trackingId: "${process.env.GA_TRACKING_ID}"
```

### Plugin Types

1. **Entity Plugins** - Extend entity functionality
2. **UI Plugins** - Add custom components
3. **API Plugins** - Add custom endpoints
4. **Auth Plugins** - Add authentication providers
5. **Database Plugins** - Add database adapters
6. **Integration Plugins** - Add integration capabilities
7. **Workflow Plugins** - Add workflow functionality

### Extension Points

Plugins can hook into various extension points:

1. **Entity Lifecycle** - Modify entity behavior
2. **Request Pipeline** - Process API requests
3. **Authentication Process** - Customize auth
4. **UI Rendering** - Add custom rendering
5. **Command Line** - Add CLI commands

## Development Experience

TDAL prioritizes developer experience:

### Command Line Interface

```bash
# Create a new project
yamlang new my-project

# Generate entity
yamlang generate entity Product

# Start development server
yamlang dev

# Run migrations
yamlang migrate

# Build for production
yamlang build

# Run tests
yamlang test
```

### Hot Reloading

The framework watches for changes to YAML files and automatically:

1. **Validates** - Checks YAML syntax and schema
2. **Generates** - Updates generated code
3. **Reloads** - Refreshes the application

### Type Generation

TypeScript interfaces are generated for all entities:

```typescript
// Generated from Product entity YAML
export interface Product {
  product_id: number;
  title: string;
  pricing: string;
  is_free: boolean;
  created_at: string;
  updated_at: string;
  // Computed properties
  displayTitle: string;
}

// Generated from ProductCategory entity YAML
export interface ProductCategory {
  category_id: number;
  category_name: string;
  description?: string;
  parent_id?: number;
  created_at: string;
  updated_at: string;
}
```

### Documentation Generation

The framework generates documentation based on YAML:

1. **OpenAPI/Swagger** - API documentation
2. **Entity Diagrams** - Visual entity relationships
3. **Action Documentation** - Custom action documentation
4. **Event Documentation** - Event documentation

## Testing Framework

TDAL includes a testing framework:

```yaml
tests:
  - name: "createProduct"
    type: "api"
    endpoint: "POST /api/products"
    auth:
      role: "admin"
    request:
      body:
        title: "Test Product"
        pricing: "$9.99"
        is_free: false
    assertions:
      status: 201
      body:
        - "$.product_id": "exists"
        - "$.title": "Test Product"
        - "$.pricing": "$9.99"
        - "$.is_free": false
```

### Test Types

1. **API Tests** - Test REST endpoints
2. **Unit Tests** - Test business logic
3. **Integration Tests** - Test workflows
4. **UI Tests** - Test frontend components
5. **Performance Tests** - Test system performance

## Deployment and DevOps

TDAL supports various deployment options:

```yaml
deployment:
  environments:
    - name: "development"
      variables:
        NODE_ENV: "development"
        DB_HOST: "localhost"
      settings:
        debug: true
        logLevel: "debug"

    - name: "production"
      variables:
        NODE_ENV: "production"
        DB_HOST: "${process.env.PROD_DB_HOST}"
      settings:
        debug: false
        logLevel: "error"
        cache:
          enabled: true
          ttl: 3600
```

### Deployment Options

1. **Docker** - Containerized deployment
2. **Serverless** - FaaS deployment
3. **Traditional** - VM/Server deployment
4. **Static** - JAMstack deployment

### Infrastructure as Code

```yaml
infrastructure:
  provider: "aws"
  resources:
    - type: "database"
      engine: "postgres"
      size: "small"
    - type: "compute"
      size: "medium"
      autoscaling:
        min: 2
        max: 10
    - type: "storage"
      type: "s3"
      buckets:
        - name: "uploads"
          public: false
        - name: "public-assets"
          public: true
```

## Advanced Features

### Workflow Engine

TDAL includes a state machine for workflows:

```yaml
workflows:
  - name: "orderProcess"
    entity: "Order"
    stateField: "status"

    states:
      - name: "new"
        initial: true
      - name: "processing"
      - name: "shipped"
      - name: "delivered"
      - name: "cancelled"

    transitions:
      - from: "new"
        to: "processing"
        action: "startProcessing"
        permissions: ["admin"]
        auto: false

      - from: "processing"
        to: "shipped"
        action: "markShipped"
        permissions: ["admin"]
        validation:
          - field: "tracking_number"
            rule: "required"
        hooks:
          after:
            - name: "sendShippingNotification"
              implementation: |
                async (entity, context) => {
                  await context.services.email.send({
                    to: entity.customer_email,
                    subject: "Your order has shipped",
                    template: "order-shipped",
                    data: { order: entity }
                  });
                }
```

### Multi-tenant Support

```yaml
multiTenancy:
  enabled: true
  tenantField: "tenant_id"
  isolation: "database" # or "schema" or "row"
  provisioning:
    automatic: true
    template: "template_db"
```

### Internationalization

```yaml
i18n:
  defaultLocale: "en"
  supportedLocales: ["en", "es", "fr", "de"]
  translationDir: "./translations"
  entityFields:
    - entity: "Product"
      fields: ["title", "description"]
    - entity: "ProductCategory"
      fields: ["category_name", "description"]
```

### File Storage

```yaml
storage:
  provider: "local" # or "s3", "azure", etc.
  basePath: "./uploads"

  buckets:
    - name: "product-images"
      path: "/products"
      public: true
      maxSize: 5242880 # 5MB
      allowedTypes: ["image/jpeg", "image/png"]

    - name: "user-documents"
      path: "/documents"
      public: false
      maxSize: 10485760 # 10MB
      allowedTypes: ["application/pdf"]
```

### Caching

```yaml
cache:
  provider: "redis" # or "memory", "memcached", etc.
  connection:
    host: "${process.env.REDIS_HOST}"
    port: "${process.env.REDIS_PORT}"

  strategies:
    - name: "entity"
      ttl: 3600
      entities: ["Product", "ProductCategory"]

    - name: "api"
      ttl: 60
      endpoints: ["GET /api/products", "GET /api/products/:id"]
```

## Implementation Details

### Core Engine

The TDAL engine handles:

1. **Configuration Loading** - Loading and validating YAML
2. **Schema Validation** - Ensuring YAML is valid
3. **Code Generation** - Generating runtime code
4. **Runtime Execution** - Executing the application

### Code Generation

TDAL generates:

1. **Entity Models** - TypeScript interfaces
2. **Database Schema** - Migration files
3. **API Controllers** - REST endpoints
4. **UI Components** - Frontend code
5. **Documentation** - API docs and diagrams

### Runtime Framework

The runtime framework provides:

1. **Entity Manager** - Managing entity instances
2. **Database Connection** - Database access
3. **Authentication** - User authentication
4. **Authorization** - Permission checking
5. **API Routing** - HTTP routing
6. **Error Handling** - Standardized error responses
7. **Logging** - Application logging

## Best Practices

### Entity Design

1. **Normalize data** - Follow database normalization rules
2. **Use meaningful names** - Clear and descriptive names
3. **Define relationships** - Properly define entity relationships
4. **Set validation rules** - Validate data at the entity level
5. **Use computed properties** - Derive values when possible

### API Design

1. **Follow REST principles** - Use HTTP methods appropriately
2. **Versioning** - Version your APIs
3. **Use proper status codes** - Return appropriate HTTP status codes
4. **Consistent responses** - Maintain consistent response structures
5. **Proper error handling** - Return informative error messages

### Security

1. **Input validation** - Validate all input
2. **Authentication** - Secure authentication methods
3. **Authorization** - Proper permission checking
4. **Data encryption** - Encrypt sensitive data
5. **CSRF protection** - Protect against CSRF attacks
6. **Rate limiting** - Implement rate limiting
7. **SQL injection prevention** - Parameterized queries

### Performance

1. **Indexing** - Properly index database fields
2. **Caching** - Cache frequently accessed data
3. **Pagination** - Paginate large result sets
4. **Query optimization** - Optimize database queries
5. **Lazy loading** - Load data only when needed

## Future Roadmap

### Short Term (0-6 months)

1. **Core Framework** - Develop the core engine and runtime
2. **Entity System** - Implement the entity system
3. **API Generation** - Create the API generator
4. **Authentication** - Implement JWT authentication
5. **CLI Tools** - Develop CLI tools for scaffolding

### Medium Term (6-12 months)

1. **UI Generation** - Implement the UI generator
2. **Workflow Engine** - Develop the workflow system
3. **Plugin System** - Create the plugin architecture
4. **Advanced Auth** - Add OAuth and other auth methods
5. **Documentation Generator** - Build documentation tools

### Long Term (12+ months)

1. **Cloud Integration** - Native support for cloud providers
2. **AI Features** - AI-assisted development
3. **Marketplace** - Plugin marketplace
4. **Enterprise Features** - Multi-tenant support, audit logs
5. **IDE Integration** - Editor plugins

## Use Cases

### Rapid Prototyping

TDAL is perfect for quickly building MVPs:

1. **Define entities** - Create your data model
2. **Expose APIs** - Generate REST endpoints
3. **Set up auth** - Configure authentication
4. **Create UI** - Generate basic UI components

### Enterprise Applications

For enterprise use, TDAL offers:

1. **Role-based security** - Fine-grained permissions
2. **Workflow management** - Business process automation
3. **Audit logging** - Track all changes
4. **Integration** - Connect to enterprise systems
5. **Multi-tenant** - Support multiple clients

### Content Management

TDAL can serve as a flexible CMS:

1. **Content modeling** - Define content types
2. **API-first** - Headless CMS capabilities
3. **Workflows** - Content approval workflows
4. **User management** - User roles and permissions
5. **Asset management** - File storage and serving

### E-commerce

For e-commerce applications:

1. **Product catalog** - Product and category management
2. **Order processing** - Order workflow
3. **Payment integration** - Connect to payment gateways
4. **User accounts** - Customer accounts and history
5. **Promotions** - Discounts and special offers

## Advanced Examples

### Complete E-commerce Setup

```yaml
# Product entity
entity: Product
table: products
idField: product_id
columns:
  - logical: product_id
    physical: product_id
    primaryKey: true
    autoIncrement: true
    type: integer
  - logical: name
    physical: name
    type: string
  - logical: description
    physical: description
    type: text
  - logical: price
    physical: price
    type: decimal
  - logical: stock_quantity
    physical: stock_quantity
    type: integer
  - logical: is_active
    physical: is_active
    type: boolean
    defaultValue: true

relations:
  - name: categories
    type: manyToMany
    sourceEntity: Product
    targetEntity: Category
    sourceColumn: product_id
    targetColumn: category_id
    junctionTable: product_categories
    junctionSourceColumn: product_id
    junctionTargetColumn: category_id

  - name: reviews
    type: oneToMany
    sourceEntity: Product
    targetEntity: Review
    sourceColumn: product_id
    targetColumn: product_id

hooks:
  afterUpdate:
    - name: "checkStockLevel"
      implementation: |
        async (entity, context) => {
          if (entity.stock_quantity < 5 && entity.is_active) {
            await context.services.notification.notifyAdmin({
              message: `Low stock alert: ${entity.name} has only ${entity.stock_quantity} items left.`
            });
          }
          return entity;
        }

actions:
  - name: "adjustInventory"
    path: "/:id/inventory"
    method: "POST"
    permissions: ["admin", "inventory_manager"]
    implementation: |
      async (req, context) => {
        const { id } = req.params;
        const { adjustment, reason } = req.body;

        const product = await context.entityDao.findById(id);
        if (!product) {
          return {
            status: 404,
            body: { message: "Product not found" }
          };
        }

        const newQuantity = product.stock_quantity + adjustment;
        if (newQuantity < 0) {
          return {
            status: 400,
            body: { message: "Inventory cannot be negative" }
          };
        }

        await context.entityDao.update(id, {
          stock_quantity: newQuantity
        });

        // Log the inventory change
        await context.services.logging.logEvent("inventory_change", {
          product_id: id,
          previous: product.stock_quantity,
          new: newQuantity,
          adjustment,
          reason,
          user_id: context.user.user_id
        });

        return {
          status: 200,
          body: {
            message: "Inventory updated",
            previous_quantity: product.stock_quantity,
            new_quantity: newQuantity
          }
        };
      }

# Order entity
entity: Order
table: orders
idField: order_id
columns:
  - logical: order_id
    physical: order_id
    primaryKey: true
    autoIncrement: true
    type: integer
  - logical: customer_id
    physical: customer_id
    type: integer
  - logical: order_date
    physical: order_date
    type: datetime
    defaultValue: "CURRENT_TIMESTAMP"
  - logical: status
    physical: status
    type: string
    defaultValue: "new"
  - logical: total_amount
    physical: total_amount
    type: decimal
  - logical: shipping_address
    physical: shipping_address
    type: text
  - logical: tracking_number
    physical: tracking_number
    type: string
    nullable: true

relations:
  - name: customer
    type: manyToOne
    sourceEntity: Order
    targetEntity: User
    sourceColumn: customer_id
    targetColumn: user_id

  - name: items
    type: oneToMany
    sourceEntity: Order
    targetEntity: OrderItem
    sourceColumn: order_id
    targetColumn: order_id

workflows:
  - name: "orderProcess"
    entity: "Order"
    stateField: "status"

    states:
      - name: "new"
        initial: true
      - name: "processing"
      - name: "shipped"
      - name: "delivered"
      - name: "cancelled"

    transitions:
      - from: "new"
        to: "processing"
        action: "processOrder"
        permissions: ["admin", "order_manager"]
        hooks:
          after:
            - name: "allocateInventory"
              implementation: |
                async (entity, context) => {
                  const orderItems = await context.entityDao.findBy("OrderItem", {
                    order_id: entity.order_id
                  });

                  for (const item of orderItems) {
                    const product = await context.entityDao.findById("Product", item.product_id);

                    if (product.stock_quantity < item.quantity) {
                      throw new Error(`Insufficient inventory for product ${product.name}`);
                    }

                    await context.entityDao.update("Product", item.product_id, {
                      stock_quantity: product.stock_quantity - item.quantity
                    });
                  }
                }

      - from: "processing"
        to: "shipped"
        action: "shipOrder"
        permissions: ["admin", "shipping_manager"]
        validation:
          - field: "tracking_number"
            rule: "required"
        hooks:
          after:
            - name: "sendShippingNotification"
              implementation: |
                async (entity, context) => {
                  const customer = await context.entityDao.findById("User", entity.customer_id);

                  await context.services.email.send({
                    to: customer.email,
                    subject: "Your order has shipped",
                    template: "order-shipped",
                    data: {
                      order: entity,
                      tracking_number: entity.tracking_number,
                      customer_name: customer.name
                    }
                  });
                }

ui:
  pages:
    - name: "Orders"
      path: "/orders"
      permissions: ["admin", "order_manager"]
      components:
        - type: "Tabs"
          tabs:
            - name: "New"
              content:
                type: "DataTable"
                entity: "Order"
                filter:
                  status: "new"
                columns:
                  - name: "order_id"
                    label: "Order #"
                  - name: "customer.name"
                    label: "Customer"
                  - name: "order_date"
                    label: "Date"
                    format: "datetime"
                  - name: "total_amount"
                    label: "Total"
                    format: "currency"
                actions:
                  - name: "processOrder"
                    label: "Process"
                    workflow: true
                    confirmMessage: "Start processing this order?"

            - name: "Processing"
              content:
                type: "DataTable"
                entity: "Order"
                filter:
                  status: "processing"
                # Similar configuration as above

            - name: "Shipped"
              content:
                type: "DataTable"
                entity: "Order"
                filter:
                  status: "shipped"
                # Similar configuration as above
```

## Technical Implementation

### Framework Structure

```
/src
  /core
    /config    # YAML configuration loading and processing
    /entity    # Entity management
    /database  # Database connection and operations
    /api       # API generation and handling
    /auth      # Authentication and authorization
    /ui        # UI generation
    /business  # Business logic execution
    /workflow  # Workflow engine
    /plugins   # Plugin system
    /events    # Event system
    /utils     # Utility functions
  /generated   # Generated code
  /runtime     # Runtime framework
  /cli         # Command-line tools
```

### Initialization Process

1. **Load Configuration** - Load YAML files
2. **Validate Configuration** - Validate against schemas
3. **Generate Code** - Generate runtime code
4. **Initialize Runtime** - Start the application
5. **Register Routes** - Set up API routes
6. **Start Server** - Begin listening for requests

### Request Processing

1. **Receive Request** - HTTP server receives request
2. **Authentication** - Verify user identity
3. **Authorization** - Check permissions
4. **Route Matching** - Match to API endpoint
5. **Parameter Parsing** - Parse request parameters
6. **Validation** - Validate request data
7. **Execute Hooks** - Run pre-operation hooks
8. **Execute Operation** - Perform the operation
9. **Execute Hooks** - Run post-operation hooks
10. **Format Response** - Format the response
11. **Send Response** - Send the HTTP response

## Contributing to TDAL

### Getting Started

1. **Fork the repository** - Create your own fork
2. **Clone the repository** - Clone to your local machine
3. **Install dependencies** - Install required packages
4. **Run the development server** - Start the local server
5. **Make changes** - Implement your changes
6. **Run tests** - Ensure tests pass
7. **Submit a pull request** - Contribute your changes

### Development Environment

```bash
# Clone the repository
git clone https://github.com/yamlang/yamlang.git

# Install dependencies
cd yamlang
npm install

# Run development server
npm run dev

# Run tests
npm test
```

### Contributing Guidelines

1. **Code Style** - Follow established code style
2. **Documentation** - Document new features
3. **Tests** - Write tests for new features
4. **Pull Requests** - Create focused pull requests
5. **Reviews** - Address review comments

## Conclusion

TDAL is a framework that enables developers to build full-stack applications with minimal code. By focusing on configuration over code, it drastically reduces development time while maintaining flexibility for complex scenarios.

The framework's core philosophy of "simplicity by default, complexity when needed" means that it can scale from simple prototypes to complex enterprise applications.

We believe that TDAL represents the future of application development, where developers can focus on business logic and user experience rather than boilerplate code.

We're committed to building a framework that is:

1. **Developer-friendly** - Easy to learn and use
2. **Flexible** - Adaptable to different needs
3. **Powerful** - Capable of building complex applications
4. **Maintainable** - Easy to understand and modify
5. **Extensible** - Easily enhanced with plugins

Join us in building the future of application development!
