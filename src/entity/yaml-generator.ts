/**
 * YAML Generator
 * Bidirectional conversion between YAML config and code
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { EntityConfig, EntityColumn, EntityRelation, EntityApiConfig, ValidationRules } from '../core/types';
import { generateEntityInterface, mapTypeScriptToDbType } from './entity-schema';

/**
 * Generate YAML from an entity configuration object
 * @param entity Entity configuration
 * @returns YAML string
 */
export function generateYaml(entity: EntityConfig): string {
	return yaml.dump(entity, {
		indent: 2,
		lineWidth: 100,
		noRefs: true
	});
}

/**
 * Write entity YAML to file
 * @param entity Entity configuration
 * @param outputDir Output directory
 * @returns Path to the written file
 */
export function writeEntityYaml(entity: EntityConfig, outputDir: string): string {
	// Create output directory if it doesn't exist
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	const filePath = path.join(outputDir, `${entity.entity.toLowerCase()}.yaml`);
	const yamlContent = generateYaml(entity);

	fs.writeFileSync(filePath, yamlContent, 'utf8');
	return filePath;
}

/**
 * Generate TypeScript code for an entity
 * @param entity Entity configuration
 * @returns TypeScript code string
 */
export function generateEntityTypeScript(entity: EntityConfig): string {
	return generateEntityInterface(entity);
}

/**
 * Write entity TypeScript interface to file
 * @param entity Entity configuration
 * @param outputDir Output directory
 * @returns Path to the written file
 */
export function writeEntityTypeScript(entity: EntityConfig, outputDir: string): string {
	// Create output directory if it doesn't exist
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	const filePath = path.join(outputDir, `${entity.entity.toLowerCase()}.ts`);
	const tsContent = generateEntityTypeScript(entity);

	fs.writeFileSync(filePath, tsContent, 'utf8');
	return filePath;
}

/**
 * Generate a complete entity from a TypeScript interface
 * Uses reflection and comments to reverse-engineer entity configuration
 * 
 * @param tsSource TypeScript interface source
 * @param tableName Database table name
 * @param idField ID field name
 * @returns Entity configuration
 */
export function generateEntityFromTypeScript(
	tsSource: string,
	tableName: string,
	idField: string
): EntityConfig {
	const lines = tsSource.split('\n');
	let interfaceName = '';
	const columns: EntityColumn[] = [];

	// Parse the interface
	let i = 0;
	while (i < lines.length) {
		const line = lines[i].trim();

		// Find interface declaration
		if (line.startsWith('export interface ')) {
			interfaceName = line.replace('export interface ', '').replace('{', '').trim();
		}

		// Find property declarations
		else if (line.match(/^\w+(\?)?:\s*\w+;?/)) {
			// Extract property name and type
			const [propDef, ...rest] = line.split(':');
			const typeDef = rest.join(':').trim().replace(';', '');

			let propName = propDef.trim();
			const isOptional = propName.endsWith('?');
			if (isOptional) {
				propName = propName.slice(0, -1);
			}

			// Convert TypeScript type to database type
			const dbType = mapTypeScriptToDbType(typeDef);

			// Check for comments in previous lines
			let comment = '';
			let j = i - 1;
			while (j >= 0 && lines[j].trim().startsWith('*')) {
				const commentLine = lines[j].trim().replace(/^\*\s*/, '');
				if (commentLine && !commentLine.startsWith('/')) {
					comment = commentLine + (comment ? ' ' + comment : '');
				}
				j--;
			}

			// Create column definition
			const column: EntityColumn = {
				logical: propName,
				physical: propName, // Default to same name
				type: dbType,
				nullable: isOptional,
				primaryKey: propName === idField,
				autoIncrement: propName === idField && dbType === 'integer',
			};

			if (comment) {
				column.comment = comment;
			}

			columns.push(column);
		}

		i++;
	}

	// Create entity config
	return {
		entity: interfaceName,
		table: tableName,
		idField,
		columns,
		api: {
			exposed: true,
			operations: {
				getAll: true,
				getById: true,
				create: true,
				update: true,
				delete: true
			}
		},
		timestamps: {
			createdAt: 'created_at',
			updatedAt: 'updated_at'
		}
	};
}

/**
 * Generate a complete CRUD API entity from database schema
 * @param tableName Table name
 * @param db Database adapter
 * @returns Entity configuration
 */
export async function generateEntityFromDatabase(
	tableName: string,
	db: any // Database adapter with schema introspection
): Promise<EntityConfig | null> {
	try {
		// This is a placeholder - actual implementation would depend
		// on the database adapter's schema introspection capabilities
		const columns = await db.getTableColumns(tableName);
		const primaryKey = await db.getPrimaryKey(tableName);

		if (!columns || columns.length === 0) {
			return null;
		}

		// Convert to entity columns
		const entityColumns: EntityColumn[] = columns.map(col => ({
			logical: camelCase(col.name),
			physical: col.name,
			type: mapDbColumnTypeToTs(col.type),
			nullable: col.nullable,
			primaryKey: col.name === primaryKey,
			autoIncrement: col.autoIncrement,
			comment: col.comment
		}));

		// Generate entity name from table name
		const entityName = pascalCase(tableName);

		return {
			entity: entityName,
			table: tableName,
			idField: camelCase(primaryKey),
			columns: entityColumns,
			api: {
				exposed: true,
				operations: {
					getAll: true,
					getById: true,
					create: true,
					update: true,
					delete: true
				}
			}
		};
	} catch (error) {
		console.error(`Failed to generate entity for table ${tableName}:`, error);
		return null;
	}
}

/**
 * Create scaffolding for a new entity
 * @param entityName Entity name
 * @param tableName Table name (defaults to lowercase entity name)
 * @param outputDir Output directory
 * @returns Entity configuration
 */
export function scaffoldEntity(
	entityName: string,
	tableName: string = entityName.toLowerCase(),
	outputDir: string
): EntityConfig {
	// Create basic entity definition
	const entity: EntityConfig = {
		entity: entityName,
		table: tableName,
		idField: 'id',
		columns: [
			{
				logical: 'id',
				physical: 'id',
				primaryKey: true,
				autoIncrement: true,
				type: 'integer'
			},
			{
				logical: 'name',
				physical: 'name',
				type: 'string',
				nullable: false
			},
			{
				logical: 'description',
				physical: 'description',
				type: 'string',
				nullable: true
			},
			{
				logical: 'created_at',
				physical: 'created_at',
				type: 'datetime',
				nullable: false
			},
			{
				logical: 'updated_at',
				physical: 'updated_at',
				type: 'datetime',
				nullable: true
			}
		],
		api: {
			exposed: true,
			basePath: `/api/${tableName}`,
			operations: {
				getAll: true,
				getById: true,
				create: true,
				update: true,
				delete: true
			},
			permissions: {
				getAll: ['user', 'admin'],
				getById: ['user', 'admin'],
				create: ['admin'],
				update: ['admin'],
				delete: ['admin']
			}
		},
		timestamps: {
			createdAt: 'created_at',
			updatedAt: 'updated_at'
		}
	};

	// Write to YAML file
	writeEntityYaml(entity, outputDir);

	// Write TypeScript interface
	writeEntityTypeScript(entity, path.join(outputDir, '../models'));

	return entity;
}

/**
 * Add API configuration to an existing entity
 * @param entity Entity to update
 * @param apiConfig API configuration
 * @returns Updated entity
 */
export function addApiConfig(entity: EntityConfig, apiConfig: EntityApiConfig): EntityConfig {
	return {
		...entity,
		api: {
			...entity.api,
			...apiConfig
		}
	};
}

/**
 * Add validation rules to an existing entity
 * @param entity Entity to update
 * @param validationRules Validation rules
 * @returns Updated entity
 */
export function addValidationRules(entity: EntityConfig, validationRules: ValidationRules): EntityConfig {
	return {
		...entity,
		validation: {
			...entity.validation,
			rules: {
				...(entity.validation?.rules || {}),
				...validationRules.rules
			}
		}
	};
}

/**
 * Add a relation to an existing entity
 * @param entity Entity to update
 * @param relation Relation to add
 * @returns Updated entity
 */
export function addRelation(entity: EntityConfig, relation: EntityRelation): EntityConfig {
	const relations = entity.relations ? [...entity.relations] : [];

	// Check if relation already exists
	const existingIndex = relations.findIndex(r => r.name === relation.name);

	if (existingIndex >= 0) {
		// Update existing relation
		relations[existingIndex] = relation;
	} else {
		// Add new relation
		relations.push(relation);
	}

	return {
		...entity,
		relations
	};
}

/**
 * Convert a string to camelCase
 * @param input Input string
 * @returns camelCase string
 */
function camelCase(input: string): string {
	return input
		.replace(/[_-](\w)/g, (_, c) => c.toUpperCase())
		.replace(/^\w/, c => c.toLowerCase());
}

/**
 * Convert a string to PascalCase
 * @param input Input string
 * @returns PascalCase string
 */
function pascalCase(input: string): string {
	return input
		.replace(/(^\w|[_-]\w)/g, match => match.replace(/[_-]/, '').toUpperCase());
}

/**
 * Map database column type to TypeScript type
 * @param dbType Database type
 * @returns TypeScript type
 */
function mapDbColumnTypeToTs(dbType: string): string {
	const type = dbType.toLowerCase();

	if (type.includes('int')) return 'integer';
	if (type.includes('char') || type.includes('text')) return 'string';
	if (type.includes('float') || type.includes('double') || type.includes('numeric') || type.includes('decimal')) return 'number';
	if (type.includes('bool')) return 'boolean';
	if (type.includes('date') || type.includes('time')) return 'datetime';
	if (type.includes('json')) return 'json';
	if (type.includes('blob') || type.includes('binary')) return 'blob';

	return 'string'; // Default
}