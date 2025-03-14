# Module Standards

This document outlines the coding standards, module patterns, and best practices for the framework. Following these standards ensures consistency across the codebase and makes it easier to maintain and extend the framework.

## Module Organization

### File Naming

- Use kebab-case for filenames (e.g., `entity-manager.ts`)
- Use singular nouns for files containing a single class or function (e.g., `logger.ts`)
- Use plural nouns for files containing multiple related definitions (e.g., `types.ts`)
- Use the `.ts` extension for TypeScript files

### Directory Structure

/src
/core # Core framework components
/entity # Entity management
/database # Database adapters
/api # API generation
/hooks # Hook system
/actions # Action system
/validation # Validation engine
/integration # External integrations
/utils # Utility functions
/middleware # Express middleware
/config # Configuration loaders
/plugins # Plugin system
Copy

### Module Types

- **Core Modules**: Fundamental types and services (e.g., `app-context.ts`)
- **Feature Modules**: Specific framework features (e.g., `workflow-engine.ts`)
- **Adapter Modules**: Adapters for external systems (e.g., `mysql-adapter.ts`)
- **Utility Modules**: Helper functions and utilities (e.g., `string-utils.ts`)

## Import Standards

### Import Paths

- Use absolute imports with path aliases for framework modules:
  ```typescript
  import { Logger } from "@/core/types";
  import { EntityConfig } from "@/entity/entity-config";
  ```

Use relative imports only for modules in the same directory:

```typescript
import { someFunction } from "./helper";
```

Import Organization
Organize imports in the following order:

Node.js built-in modules
External dependencies
Framework modules (using path aliases)
Relative imports

````typescript
// Node.js built-in modules
import _ as fs from 'fs';
import _ as path from 'path';

// External dependencies
import express from 'express';
import \* as yaml from 'js-yaml';

// Framework modules
import { Logger } from '@/core/types';
import { EntityConfig } from '@/entity/entity-config';

// Relative imports
import { someFunction } from './helper';
```

Named vs. Default Exports

Use named exports for most functionality:
```typescript
export interface Logger { /_ ... _/ }
export class FileLogger implements Logger { /_ ... _/ }
```

Use default exports only for main module exports:
```typescript
export default class EntityManager { /_ ... _/ }
```
Module Patterns
Class-Based Modules
For complex components, use class-based modules:
```typescript
/\*\*

- Class description
  \*/
  export class SomeClass {
  /\*\*
  - Constructor
  - @param param1 Parameter description
    \*/
    constructor(param1: string) {
    // ...
    }

/\*\*
```
- Method description
- @param param Method parameter
- @returns Return value description
  \*/
  someMethod(param: number): string {
  // ...
  }
  }
```
/\*\*

- Factory function
- @param options Options
- @returns Instance of SomeClass
  \*/
  export function createSomeClass(options: any): SomeClass {
  return new SomeClass(options);
  }
  Function-Based Modules
  For simpler components, use function-based modules:

  ```typescript
/\*\*
- Function description
- @param param1 Parameter description
- @returns Return value description
  \*/
  export function someFunction(param1: string): number {
  // ...
  }
  Interface-Based Modules
  For type definitions, use interface-based modules:
  ```typescript
/\*\*
- Interface description
  \*/
  export interface SomeInterface {
  /\*\*
  - Property description
    \*/
    property1: string;

/\*\*

- Method description
- @param param Parameter description
- @returns Return value description
  \*/
  method1(param: number): boolean;
  }
  Coding Style
  General Style

Use 2 spaces for indentation
Use semicolons at the end of statements
Use single quotes for strings
Use trailing commas in multiline arrays and objects
Limit line length to 100 characters
Use parentheses around arrow function parameters even when there is only one parameter
Use explicit return types for functions

Naming Conventions

Use PascalCase for interfaces, classes, and types
Use camelCase for variables, functions, methods, and properties
Use UPPER_SNAKE_CASE for constants
Use I prefix for interfaces only when necessary to avoid naming conflicts
Use descriptive names that reflect the purpose of the element

Documentation

Use JSDoc comments for all public APIs:
```typescript
/\*\*

- Function description
- @param param1 Parameter description
- @returns Return value description
  \*/
  function someFunction(param1: string): number {
  // ...
  }

Document all parameters, return values, and thrown exceptions
Include usage examples for complex APIs
Document implementation details with inline comments

Error Handling

Use specific error types:
```typescript
export class ValidationError extends Error {
constructor(message: string) {
super(message);
this.name = 'ValidationError';
}
}

Include context information in error messages
Handle errors at appropriate levels
Log errors with sufficient context
Use async/await with try/catch for asynchronous error handling

Component Patterns
Service Pattern
Services should follow this pattern:
```typescript
/\*\*

- Service interface
  \*/
  export interface SomeService {
  // Service methods
  }

/\*\*

- Service implementation
  \*/
  export class SomeServiceImpl implements SomeService {
  // Service implementation
  }

/\*\*

- Factory function
  _/
  export function createSomeService(/_ dependencies _/): SomeService {
  return new SomeServiceImpl(/_ dependencies \*/);
  }
  Registry Pattern
  Registries should follow this pattern:
  ```typescript
/\*\*
- Registry interface
  \*/
  export interface SomeRegistry {
  register(name: string, item: any): void;
  get(name: string): any;
  }

/\*\*

- Registry implementation
  \*/
  export class SomeRegistryImpl implements SomeRegistry {
  private items = new Map<string, any>();

register(name: string, item: any): void {
this.items.set(name, item);
}

get(name: string): any {
return this.items.get(name);
}
}

/\*\*

- Factory function
  \*/
  export function createSomeRegistry(): SomeRegistry {
  return new SomeRegistryImpl();
  }
  Factory Pattern
  Factories should follow this pattern:
  ```typescript
/\*\*
- Factory interface
  \*/
  export interface SomeFactory {
  create(options: any): any;
  }

/\*\*

- Factory implementation
  \*/
  export class SomeFactoryImpl implements SomeFactory {
  create(options: any): any {
  // Create and return instance
  }
  }

/\*\*

- Factory function
  \*/
  export function createSomeFactory(): SomeFactory {
  return new SomeFactoryImpl();
  }
  Testing Standards
  Unit Tests

Use test files named _.test.ts or _.spec.ts
Organize tests in a structure mirroring the source code
Use descriptive test names that explain the expected behavior
Follow the Arrange-Act-Assert pattern
Mock external dependencies

Integration Tests

Use test files named \*.integration.ts
Set up and tear down test resources appropriately
Use realistic test data
Test across component boundaries

E2E Tests

Use test files named \*.e2e.ts
Test complete user flows
Use realistic test data
Set up and tear down test resources appropriately

API Standards
REST API

Use plural nouns for resource names (e.g., /users not /user)
Use kebab-case for URL paths (e.g., /user-profiles not /userProfiles)
Use standard HTTP methods (GET, POST, PUT, DELETE) appropriately
Return appropriate HTTP status codes
Use consistent response formats

Error Responses

Use consistent error response format:
jsonCopy{
"error": "ErrorType",
"message": "Error message",
"status": 400,
"details": { /_ Additional error details _/ }
}

Include validation error details when applicable
Use appropriate HTTP status codes for different error types

Version Control
Commit Messages

Use the imperative mood in commit messages (e.g., "Add feature" not "Added feature")
Start with a capital letter
Limit the first line to 72 characters
Separate subject from body with a blank line
Use the body to explain what and why, not how

Branching Strategy

Use main or master for the main development branch
Use feature branches for new features
Use bug fix branches for bug fixes
Use release branches for releases
Use hotfix branches for urgent fixes

Documentation
Code Documentation

Use JSDoc comments for all public APIs
Document all parameters, return values, and thrown exceptions
Include usage examples for complex APIs

Framework Documentation

Maintain high-level architecture documentation
Document all framework concepts
Provide usage examples for common scenarios
Document extension points

Dependency Management
External Dependencies

Minimize external dependencies
Document all dependencies and their purpose
Pin dependency versions
Regularly update dependencies for security fixes

Internal Dependencies

Minimize circular dependencies
Use dependency injection to manage dependencies
Document dependency relationships

Performance and Optimization
Performance Considerations

Optimize for readability and maintainability first
Profile before optimizing
Document performance characteristics
Use appropriate data structures and algorithms

Memory Management

Avoid memory leaks
Clean up resources appropriately
Use weak references for caches
````
