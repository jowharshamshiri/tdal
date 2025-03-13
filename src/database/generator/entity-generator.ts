import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'js-yaml';
Error.stackTraceLimit = Infinity;
// Get dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Types for entity metadata
export interface EntityColumnMetadata {
	logical: string;
	physical: string;
	primaryKey?: boolean;
	autoIncrement?: boolean;
	nullable?: boolean;
	type?: string;
	unique?: boolean;
	comment?: string;
	foreignKey?: string;
}

export interface EntityRelationMetadata {
	name: string;
	type: 'oneToOne' | 'oneToMany' | 'manyToOne' | 'manyToMany';
	sourceEntity: string;
	targetEntity: string;
	sourceColumn: string;
	targetColumn: string;
	isOwner?: boolean;
	inverseName?: string;
	junctionTable?: string;
	junctionSourceColumn?: string;
	junctionTargetColumn?: string;
}

export interface EntityTimestamps {
	createdAt?: string;
	updatedAt?: string;
	deletedAt?: string;
}

export interface EntityMetadata {
	entity: string;
	table: string;
	idField: string;
	columns: EntityColumnMetadata[];
	relations?: EntityRelationMetadata[];
	timestamps?: EntityTimestamps;
	softDelete?: {
		column: string;
		deletedValue: any;
		nonDeletedValue: any;
	};
}

/**
 * Entity Registry for tracking generated entities and repositories
 */
export class EntityRegistry {
	private static instance: EntityRegistry;
	private entities = new Map();
	private repositories = new Map();
	private mappings = new Map();

	private constructor() { }

	public static getInstance(): EntityRegistry {
		if (!EntityRegistry.instance) {
			EntityRegistry.instance = new EntityRegistry();
		}
		return EntityRegistry.instance;
	}

	public registerEntity(name, entityClass, mapping) {
		this.entities.set(name, entityClass);
		this.mappings.set(name, mapping);
	}

	public registerRepository(name, repositoryClass) {
		this.repositories.set(name, repositoryClass);
	}

	public getEntity(name) {
		return this.entities.get(name);
	}

	public getRepository(name) {
		return this.repositories.get(name);
	}

	public getMapping(name) {
		return this.mappings.get(name);
	}

	public getAllEntities() {
		return this.entities;
	}

	public getAllRepositories() {
		return this.repositories;
	}
}

/**
 * Main class for loading and generating entities/repositories
 */
export class EntityGenerator {
	private entityDirectory: string;
	private outputDirectory: string;
	private registry: EntityRegistry;

	constructor(entityDirectory = path.join(process.cwd(), 'src/entities'),
		outputDirectory = path.join(process.cwd(), 'src/generated')) {
		this.entityDirectory = entityDirectory;
		this.outputDirectory = outputDirectory;
		this.registry = EntityRegistry.getInstance();

		// Ensure output directory exists
		if (!fs.existsSync(this.outputDirectory)) {
			fs.mkdirSync(this.outputDirectory, { recursive: true });
		}
	}

	/**
	 * Load entity metadata from YAML files
	 */
	public loadEntityMetadata(): EntityMetadata[] {
		const entityFiles = fs
			.readdirSync(this.entityDirectory)
			.filter(file => file.endsWith('.yaml') || file.endsWith('.yml'));

		const entities: EntityMetadata[] = [];

		for (const file of entityFiles) {
			const filePath = path.join(this.entityDirectory, file);
			const content = fs.readFileSync(filePath, 'utf8');
			try {
				const entity = yaml.load(content) as EntityMetadata;
				console.log(`Loaded entity from ${file}:`, entity); // Add this line
				this.validateEntityMetadata(entity);
				entities.push(entity);
			} catch (error) {
				console.error(`Error parsing ${file}:`, error);
			}
		}

		return entities;
	}

	/**
	 * Validate entity metadata structure
	 */
	private validateEntityMetadata(metadata: EntityMetadata): void {
		if (!metadata.entity) throw new Error('Entity name is required');
		if (!metadata.table) throw new Error('Table name is required');
		if (!metadata.idField) throw new Error('ID field is required');
		if (!metadata.columns || !Array.isArray(metadata.columns) || metadata.columns.length === 0) {
			throw new Error('Columns are required and must be an array');
		}

		// Ensure we have a primary key
		const hasPrimaryKey = metadata.columns.some(col => col.primaryKey);
		if (!hasPrimaryKey) {
			throw new Error('At least one column must be marked as primary key');
		}
	}

	/**
	 * Generate TypeScript type for a column based on database type
	 */
	private getTypeScriptType(column: EntityColumnMetadata): string {
		if (!column.type) return 'any';

		const type = column.type.toLowerCase();
		const isNullable = column.nullable ? ' | null' : '';

		switch (type) {
			case 'int':
			case 'integer':
			case 'bigint':
			case 'smallint':
			case 'tinyint':
			case 'number':
				return `number${isNullable}`;
			case 'boolean':
			case 'bool':
				return `boolean${isNullable}`;
			case 'date':
			case 'datetime':
			case 'timestamp':
				return `string${isNullable}`;
			case 'json':
			case 'object':
				return `Record<string, any>${isNullable}`;
			case 'varchar':
			case 'char':
			case 'text':
			case 'string':
			default:
				return `string${isNullable}`;
		}
	}

	/**
	 * Generate entity interface code
	 */
	public generateEntityInterface(metadata: EntityMetadata): string {
		const { entity, columns } = metadata;

		let code = `/**
 * Generated entity interface for ${entity}
 * DO NOT EDIT THIS FILE DIRECTLY - it is generated from YAML metadata
 */

import { BaseRecord } from "../models/index.js";

/**
 * ${entity} model
 */
export interface ${entity} extends BaseRecord {\n`;

		// Add properties for each column
		for (const column of columns) {
			const type = this.getTypeScriptType(column);
			const optional = column.nullable ? '?' : '';
			const comment = column.comment ? `\n   * ${column.comment}\n   */\n` : '';

			code += `  /**
   * ${column.logical}${comment}
	*/
`;
			code += `  ${column.logical}${optional}: ${type};\n\n`;
		}

		code += `}\n\n`;

		// Add entity mapping
		code += `/**
 * Entity mapping for ${entity}
 */
export const ${entity}Mapping = ${JSON.stringify(metadata, null, 2)};\n`;

		return code;
	}

	/**
	 * Generate repository class code
	 */
	public generateRepositoryClass(metadata: EntityMetadata): string {
		const { entity } = metadata;

		let code = `/**
 * Generated repository for ${entity}
 * DO NOT EDIT THIS FILE DIRECTLY - it is generated from YAML metadata
 */

import { EntityDao } from "../database/orm/entity-dao.js";
import { ${entity}, ${entity}Mapping } from "./${entity.toLowerCase()}.js";
import { DatabaseAdapter } from "../database/core/types.js";
import {
  Relation,
  ManyToManyRelation,
  OneToManyRelation,
  ManyToOneRelation,
  OneToOneRelation
} from "../database/orm/relation-types.js";
 
${metadata.relations && metadata.relations.length > 0
				? metadata.relations
					.map(relation => `import { ${relation.targetEntity} } from "./${relation.targetEntity.toLowerCase()}.js";`)
					.join('\n')
				: ''
			}


/**
 * Convert string type relations to proper Relation objects
 */
const typed${entity}Mapping = {
  ...${entity}Mapping,
  relations: 'relations' in ${entity}Mapping ? (${entity}Mapping.relations as any[]).map((relation) => {
    if (relation.type === "manyToMany") {
      return {
        ...relation,
        type: "manyToMany",
      } as ManyToManyRelation;
    } else if (relation.type === "oneToMany") {
      return {
        ...relation,
        type: "oneToMany",
      } as OneToManyRelation;
    } else if (relation.type === "manyToOne") {
      return {
        ...relation,
        type: "manyToOne",
      } as ManyToOneRelation;
    } else if (relation.type === "oneToOne") {
      return {
        ...relation,
        type: "oneToOne",
      } as OneToOneRelation;
    }
    throw new Error('Unknown relation type: \${relation}');
  }) : []
};

/**
 * Repository for ${entity} operations
 */
export class ${entity}Repository extends EntityDao<${entity}> {
  /**
   * Entity mapping for ${entity}
   */
  protected readonly entityMapping = typed${entity}Mapping;

  /**
   * Find by ID with custom return type
   */
  async findById(id: number): Promise<${entity} | undefined> {
    return super.findById(id);
  }

  /**
   * Find all entities
   */
  async findAll(): Promise<${entity}[]> {
    return super.findAll();
  }

  /**
   * Find entities by criteria
   */
  async findBy(criteria: Partial<${entity}>): Promise<${entity}[]> {
    return super.findBy(criteria);
  }

  /**
   * Find a single entity by criteria
   */
  async findOneBy(criteria: Partial<${entity}>): Promise<${entity} | undefined> {
    return super.findOneBy(criteria);
  }

  /**
   * Create a new entity
   */
  async create(data: Partial<${entity}>): Promise<number> {
    return super.create(data);
  }

  /**
   * Update an entity
   */
  async update(id: number, data: Partial<${entity}>): Promise<number> {
    return super.update(id, data);
  }

  /**
   * Delete an entity
   */
  async delete(id: number): Promise<number> {
    return super.delete(id);
  }`;

		// Add relation methods
		if (metadata.relations && metadata.relations.length > 0) {
			for (const relation of metadata.relations) {
				const methodName = `findBy${this.capitalizeFirstLetter(relation.name)}`;
				const returnType = relation.type === 'oneToMany' || relation.type === 'manyToMany'
					? `${relation.targetEntity}[]`
					: `${relation.targetEntity} | undefined`;

				code += `\n\n  /**
   * Find ${relation.targetEntity} related to this ${entity}
   */
  async ${methodName}(id: number): Promise<${returnType}> {
    return this.findRelated(id, "${relation.name}");
  }`;
			}
		}

		code += '\n}\n';

		return code;
	}

	/**
	 * Save generated code to files
	 */
	public saveGeneratedCode(entityName: string, entityCode: string, repositoryCode: string): void {
		const entityFilePath = path.join(this.outputDirectory, `${entityName.toLowerCase()}.ts`);
		const repositoryFilePath = path.join(this.outputDirectory, `${entityName.toLowerCase()}-repository.ts`);

		fs.writeFileSync(entityFilePath, entityCode);
		fs.writeFileSync(repositoryFilePath, repositoryCode);

		console.log(`Generated entity: ${entityFilePath}`);
		console.log(`Generated repository: ${repositoryFilePath}`);
	}

	/**
	 * Generate entity and repository files
	 */
	public generateAllEntities(): void {
		const entities = this.loadEntityMetadata();

		for (const metadata of entities) {
			const entityCode = this.generateEntityInterface(metadata);
			const repositoryCode = this.generateRepositoryClass(metadata);

			this.saveGeneratedCode(metadata.entity, entityCode, repositoryCode);
		}
	}

	/**
	 * Helper to capitalize the first letter of a string
	 */
	private capitalizeFirstLetter(str: string): string {
		return str.charAt(0).toUpperCase() + str.slice(1);
	}

	/**
	 * Create repository instances at runtime
	 */
	public async createRepositoryInstances(db): Promise<Record<string, any>> {
		const entities = this.loadEntityMetadata();
		const repositories: Record<string, any> = {};

		for (const metadata of entities) {
			const entityName = metadata.entity;
			const repositoryClassName = `${entityName}Repository`;

			// Dynamically import the generated repository class
			try {
				// For ESM, use dynamic import
				const repositoryModulePath = path.join(this.outputDirectory, `${entityName.toLowerCase()}-repository.js`);
				const repositoryModule = await import(repositoryModulePath);
				const RepositoryClass = repositoryModule[repositoryClassName];

				// Create instance with the database connection
				repositories[entityName] = new RepositoryClass(db);

				// Register in the global registry
				this.registry.registerRepository(entityName, repositories[entityName]);
			} catch (error) {
				console.error(`Error creating repository for ${entityName}:`, error);
			}
		}

		return repositories;
	}
}

/**
 * Factory function to get a repository instance
 */
export async function getRepository(entityName, db) {
	const registry = EntityRegistry.getInstance();
	const repo = registry.getRepository(entityName);

	if (repo) {
		return repo;
	}

	// If not found in registry, try to dynamically load it
	try {
		const repositoryModulePath = path.join(
			process.cwd(),
			'src/generated',
			`${entityName.toLowerCase()}-repository.js`
		);

		// For ESM use dynamic import
		const repositoryModule = await import(repositoryModulePath);
		const RepositoryClass = repositoryModule[`${entityName}Repository`];

		// Import DB module dynamically if not provided
		let dbInstance = db;
		if (!dbInstance) {
			const dbModule = await import('../index.js');
			dbInstance = dbModule.getDatabase();
		}

		// Create instance with the provided database connection
		const instance = new RepositoryClass(dbInstance);

		// Register for future use
		registry.registerRepository(entityName, instance);

		return instance;
	} catch (error) {
		throw new Error(`Repository for ${entityName} not found: ${error}`);
	}
}

/**
 * Convert JSON metadata to YAML
 */
export function convertJsonToYaml(jsonMetadata: string): string {
	try {
		const metadata = JSON.parse(jsonMetadata);
		return yaml.dump(metadata);
	} catch (error) {
		throw new Error(`Error converting JSON to YAML: ${error}`);
	}
}

/**
 * Helper function to create YAML files from JSON metadata
 */
export function createYamlFromJson(
	jsonMetadata: string,
	outputPath: string = path.join(process.cwd(), 'src/entities')
): void {
	try {
		const metadata = JSON.parse(jsonMetadata);
		const entityName = metadata.entity;
		const yamlContent = yaml.dump(metadata);

		if (!fs.existsSync(outputPath)) {
			fs.mkdirSync(outputPath, { recursive: true });
		}

		const filePath = path.join(outputPath, `${entityName.toLowerCase()}.yaml`);
		fs.writeFileSync(filePath, yamlContent);

		console.log(`Created YAML file: ${filePath}`);
	} catch (error) {
		throw new Error(`Error creating YAML file: ${error}`);
	}
}

// Command line interface for the generator
// In ESM we use this pattern to check if file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
	const args = process.argv.slice(2);
	const command = args[0];

	switch (command) {
		case 'generate':
			const generator = new EntityGenerator();
			generator.generateAllEntities();
			break;
		case 'convert':
			if (args.length < 2) {
				console.error('Usage: convert <json-file> [output-directory]');
				process.exit(1);
			}

			const jsonFile = args[1];
			const outputDir = args[2] || path.join(process.cwd(), 'src/entities');

			try {
				const jsonContent = fs.readFileSync(jsonFile, 'utf8');
				createYamlFromJson(jsonContent, outputDir);
			} catch (error) {
				console.error(`Error converting JSON file: ${error}`);
				process.exit(1);
			}
			break;
		default:
			console.error('Unknown command. Available commands: generate, convert');
			process.exit(1);
	}
}