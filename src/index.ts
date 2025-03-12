// Main package exports
import { DatabaseContext } from './database/core/database-context';

// Export database configuration functions
export const configureDatabase = (config: any) =>
  DatabaseContext.configure(config);
export const getDatabase = () => DatabaseContext.getDatabase();
export const closeDatabase = () => DatabaseContext.closeDatabase();

// Export core modules
export * from './database/core/types';
export * from './database/core/connection-types';
export * from './database/core/database-context';
export * from './database/core/database-factory';

// Export adapters
export * from './database/adapters/adapter-base';
export * from './database/adapters/sqlite-adapter';
export * from './database/adapters/postgres-adapter';

// Export query builders
export type { QueryBuilder } from './database/query/query-builder';
export * from './database/query/entity-query-builder';
export * from './database/query/sqlite-query-builder';

// Export ORM components
export * from './database/orm/entity-dao';
export * from './database/orm/entity-mapping';
export * from './database/orm/relation-types';
export * from './database/orm/date-functions';

// Export schema loader
export * from './database/schema/schema-loader';

// Export repositories
export * from './repositories';

// Export models
export * from './models';