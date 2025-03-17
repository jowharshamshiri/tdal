/**
 * YAML Generator
 * Bidirectional conversion between YAML config and entity configurations
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { EntityConfig, ColumnMapping } from '../entity/entity-config';
import { mapDbTypeToTypeScript, mapTypeScriptToDbType } from '../entity/entity-schema';

/**
 * Generate YAML from an entity configuration object
 * @param entity Entity configuration
 * @returns YAML string
 */
export function generateYaml(entity: EntityConfig): string {
	return yaml.dump(entity, {
		indent: 2,
		lineWidth: 100,
		noRefs: true,
		sortKeys: false
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
 * Parse a YAML entity file
 * @param filePath Path to YAML file
 * @returns Entity configuration
 */
export function parseEntityFile(filePath: string): EntityConfig {
	const content = fs.readFileSync(filePath, 'utf8');
	return yaml.load(content) as EntityConfig;
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
	const columns: ColumnMapping[] = [];

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
			const column: ColumnMapping = {
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
 * Convert a string to camelCase
 * @param input Input string
 * @returns camelCase string
 */
export function camelCase(input: string): string {
	return input
		.replace(/[_-](\w)/g, (_, c) => c.toUpperCase())
		.replace(/^\w/, c => c.toLowerCase());
}

/**
 * Convert a string to PascalCase
 * @param input Input string
 * @returns PascalCase string
 */
export function pascalCase(input: string): string {
	return input
		.replace(/(^\w|[_-]\w)/g, match => match.replace(/[_-]/, '').toUpperCase());
}
/**
 * Create a basic entity configuration scaffold
 * @param entityName Entity name in PascalCase
 * @param tableName Optional table name (defaults to lowercase entity name)
 * @returns Entity configuration
 */
export function createEntityScaffold(
	entityName: string,
	tableName: string = entityName.toLowerCase()
): EntityConfig {
	return {
		entity: entityName,
		table: tableName,
		idField: 'id',
		columns: [
			{
				logical: 'id',
				physical: 'id',
				type: 'integer',
				primaryKey: true,
				autoIncrement: true,
				nullable: false
			},
			{
				logical: 'name',
				physical: 'name',
				type: 'string',
				nullable: false
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
		// Example of many-to-many relation with implicit junction
		relations: [{
			name: 'tags',
			type: 'manyToMany',
			sourceEntity: entityName,
			targetEntity: 'Tag',
			sourceColumn: 'id',
			targetColumn: 'id',
			junctionTable: `${tableName}_tags`,
			junctionSourceColumn: `${tableName.replace(/s$/, '')}_id`,
			junctionTargetColumn: 'tag_id',
			implicitJunction: true
		}],
		// Example of junction table configuration
		junctionTables: [{
			table: `${tableName}_categories`,
			sourceEntity: entityName,
			targetEntity: 'Category',
			sourceColumn: 'id',
			targetColumn: 'id',
			extraColumns: [
				{
					name: 'created_at',
					type: 'datetime',
					nullable: false
				}
			]
		}],
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
 * Load all entity configurations from a directory
 * @param dirPath Path to directory containing YAML files
 * @returns Map of entity name to entity configuration
 */
export function loadEntities(dirPath: string): Map<string, EntityConfig> {
	const entities = new Map<string, EntityConfig>();

	if (!fs.existsSync(dirPath)) {
		throw new Error(`Entities directory not found: ${dirPath}`);
	}

	const files = fs.readdirSync(dirPath)
		.filter(file => file.endsWith('.yaml') || file.endsWith('.yml'));

	for (const file of files) {
		const filePath = path.join(dirPath, file);
		const entity = parseEntityFile(filePath);
		entities.set(entity.entity, entity);
	}

	return entities;
}

/**
 * Convert JSON configuration to YAML
 * @param jsonMetadata JSON string or object
 * @returns YAML string
 */
export function convertJsonToYaml(jsonMetadata: string | object): string {
	const data = typeof jsonMetadata === 'string'
		? JSON.parse(jsonMetadata)
		: jsonMetadata;

	return yaml.dump(data, {
		indent: 2,
		lineWidth: 100,
		noRefs: true,
		sortKeys: false
	});
}

/**
 * Create a YAML file from JSON metadata
 * @param jsonMetadata JSON string or object
 * @param outputPath Output directory path
 * @returns Path to the created YAML file
 */
export function createYamlFromJson(
	jsonMetadata: string | object,
	outputPath: string = path.join(process.cwd(), 'entities')
): string {
	// Parse the metadata if it's a string
	const metadata = typeof jsonMetadata === 'string'
		? JSON.parse(jsonMetadata)
		: jsonMetadata;

	// Get entity name
	const entityName = metadata.entity;
	if (!entityName) {
		throw new Error('Entity name is required in metadata');
	}

	// Convert to YAML
	const yamlContent = yaml.dump(metadata, {
		indent: 2,
		lineWidth: 100,
		noRefs: true
	});

	// Create directory if it doesn't exist
	if (!fs.existsSync(outputPath)) {
		fs.mkdirSync(outputPath, { recursive: true });
	}

	// Write to file
	const filePath = path.join(outputPath, `${entityName.toLowerCase()}.yaml`);
	fs.writeFileSync(filePath, yamlContent, 'utf8');

	return filePath;
}