Core Framework

src/core/framework.ts - Main entry point and bootstrapper
src/core/config-loader.ts - YAML configuration loader with schema validation
src/core/app-context.ts - Application context and dependency container
src/core/types.ts - Core type definitions

Entity Layer

src/entity/entity-schema.ts - Entity YAML schema definition with TypeScript interfaces
src/entity/entity-manager.ts - Entity lifecycle and relationship management
src/entity/yaml-generator.ts - Bidirectional YAML/code generator
src/entity/computed-properties.ts - Computed property handling

Database Layer

src/database/database-adapter.ts - Database adapter interface
src/database/adapter-factory.ts - Database adapter factory
src/database/entity-dao.ts - Enhanced entity data access object
src/database/migration-generator.ts - Generates migrations from entity changes

API Generation

src/api/api-generator.ts - Generates REST endpoints from entity definitions
src/api/controller-factory.ts - Creates controllers with hooks and actions
src/api/route-registry.ts - Route management and middleware application
src/api/hooks-executor.ts - Lifecycle hook execution engine

Authentication & Authorization

src/auth/auth-config.ts - Authentication YAML schema definition
src/auth/jwt-provider.ts - JWT authentication implementation
src/auth/permission-validator.ts - Role and permission validation
src/auth/field-access-control.ts - Field-level access control engine

Business Logic

src/logic/hook-context.ts - Execution context for hooks
src/logic/action-executor.ts - Custom action executor
src/logic/workflow-engine.ts - State machine for entity workflows
src/logic/validation-engine.ts - Validation rules engine

UI Generation

src/ui/ui-schema.ts - UI YAML schema definition
src/ui/page-generator.ts - Generates frontend pages from YAML
src/ui/component-registry.ts - Component registry and factory
src/ui/form-builder.ts - Auto-generated forms from entity schema
src/ui/data-table-builder.ts - Auto-generated data tables

Integration Layer

src/integration/integration-schema.ts - Integration YAML schema
src/integration/rest-client.ts - REST API integration client
src/integration/event-bus.ts - Event publishing and subscription
src/integration/webhook-handler.ts - Webhook registration and handling

Plugin System

src/plugins/plugin-manager.ts - Plugin loading and management
src/plugins/extension-points.ts - Framework extension points
src/plugins/plugin-schema.ts - Plugin configuration schema

CLI and Development Tools

src/cli/index.ts - Command-line interface entry point
src/cli/generate-command.ts - Code generation commands
src/cli/dev-server.ts - Development server with hot reloading
src/cli/scaffold-command.ts - Project and entity scaffolding

Templates and Examples

templates/entity-template.yaml - Basic entity template
templates/full-app-template.yaml - Complete application template
examples/todo-app/entities/todo.yaml - Example Todo entity
examples/todo-app/app.yaml - Example application configuration

Configuration Schemas

schemas/entity-schema.json - JSON Schema for entity validation
schemas/api-schema.json - JSON Schema for API configuration
schemas/auth-schema.json - JSON Schema for auth configuration
schemas/ui-schema.json - JSON Schema for UI configuration

Testing and Deployment

src/test/test-executor.ts - YAML-defined test executor
src/deploy/environment-config.ts - Environment configuration manager
