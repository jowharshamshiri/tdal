/**
 * Entity Schema Definition
 * Provides JSON Schema for YAML validation and TypeScript interfaces
 */

import { EntityMapping } from "./entity-mapping";

/**
 * JSON Schema for entity validation
 * Used by the config loader to validate entity YAML files
 */
export const entityJsonSchema = {
	type: 'object',
	required: ['entity', 'table', 'idField', 'columns'],
	properties: {
		entity: {
			type: 'string',
			description: 'Entity name in PascalCase'
		},
		table: {
			type: 'string',
			description: 'Database table name'
		},
		idField: {
			type: 'string',
			description: 'Primary key field name'
		},
		columns: {
			type: 'array',
			items: {
				type: 'object',
				required: ['logical', 'physical'],
				properties: {
					logical: {
						type: 'string',
						description: 'Logical column name (in code)'
					},
					physical: {
						type: 'string',
						description: 'Physical column name (in database)'
					},
					primaryKey: {
						type: 'boolean',
						description: 'Whether this is a primary key'
					},
					autoIncrement: {
						type: 'boolean',
						description: 'Whether the column auto-increments'
					},
					nullable: {
						type: 'boolean',
						description: 'Whether the column can be null'
					},
					type: {
						type: 'string',
						description: 'Column data type',
						enum: [
							'string', 'integer', 'number', 'boolean', 'date', 'datetime',
							'time', 'timestamp', 'text', 'json', 'blob'
						]
					},
					unique: {
						type: 'boolean',
						description: 'Whether the column has a unique constraint'
					},
					comment: {
						type: 'string',
						description: 'Column comment'
					},
					foreignKey: {
						type: 'string',
						description: 'Foreign key reference'
					}
				}
			}
		},
		relations: {
			type: 'array',
			items: {
				type: 'object',
				required: ['name', 'type', 'sourceEntity', 'targetEntity', 'sourceColumn', 'targetColumn'],
				properties: {
					name: {
						type: 'string',
						description: 'Relation name'
					},
					type: {
						type: 'string',
						enum: ['oneToOne', 'oneToMany', 'manyToOne', 'manyToMany'],
						description: 'Relation type'
					},
					sourceEntity: {
						type: 'string',
						description: 'Source entity'
					},
					targetEntity: {
						type: 'string',
						description: 'Target entity'
					},
					sourceColumn: {
						type: 'string',
						description: 'Source column'
					},
					targetColumn: {
						type: 'string',
						description: 'Target column'
					},
					junctionTable: {
						type: 'string',
						description: 'For many-to-many, junction table'
					},
					junctionSourceColumn: {
						type: 'string',
						description: 'For many-to-many, junction source column'
					},
					junctionTargetColumn: {
						type: 'string',
						description: 'For many-to-many, junction target column'
					},
					isOwner: {
						type: 'boolean',
						description: 'For one-to-one, whether this is the owner side'
					},
					inverseName: {
						type: 'string',
						description: 'Inverse relation name'
					}
				},
				allOf: [
					{
						if: {
							properties: { type: { enum: ['manyToMany'] } }
						},
						then: {
							required: ['junctionTable', 'junctionSourceColumn', 'junctionTargetColumn']
						}
					}
				]
			}
		},
		timestamps: {
			type: 'object',
			properties: {
				createdAt: {
					type: 'string',
					description: 'Created at column name'
				},
				updatedAt: {
					type: 'string',
					description: 'Updated at column name'
				},
				deletedAt: {
					type: 'string',
					description: 'Deleted at column name'
				}
			}
		},
		softDelete: {
			type: 'object',
			required: ['column', 'deletedValue', 'nonDeletedValue'],
			properties: {
				column: {
					type: 'string',
					description: 'Soft delete column name'
				},
				deletedValue: {
					description: 'Value indicating a deleted record'
				},
				nonDeletedValue: {
					description: 'Value indicating a non-deleted record'
				}
			}
		},
		api: {
			type: 'object',
			properties: {
				exposed: {
					type: 'boolean',
					description: 'Whether to expose entity via REST API'
				},
				basePath: {
					type: 'string',
					description: 'Base path for the entity API'
				},
				operations: {
					type: 'object',
					properties: {
						getAll: { type: 'boolean' },
						getById: { type: 'boolean' },
						create: { type: 'boolean' },
						update: { type: 'boolean' },
						delete: { type: 'boolean' }
					}
				},
				permissions: {
					type: 'object',
					properties: {
						getAll: { type: 'array', items: { type: 'string' } },
						getById: { type: 'array', items: { type: 'string' } },
						create: { type: 'array', items: { type: 'string' } },
						update: { type: 'array', items: { type: 'string' } },
						delete: { type: 'array', items: { type: 'string' } }
					}
				},
				fields: {
					type: 'object',
					additionalProperties: {
						type: 'object',
						properties: {
							read: { type: 'array', items: { type: 'string' } },
							write: { type: 'array', items: { type: 'string' } }
						}
					}
				},
				recordAccess: {
					type: 'object',
					required: ['condition'],
					properties: {
						condition: {
							type: 'string',
							description: 'Record-level access control condition'
						}
					}
				}
			}
		},
		hooks: {
			type: 'object',
			properties: {
				beforeCreate: { type: 'array', items: { $ref: '#/definitions/hook' } },
				afterCreate: { type: 'array', items: { $ref: '#/definitions/hook' } },
				beforeUpdate: { type: 'array', items: { $ref: '#/definitions/hook' } },
				afterUpdate: { type: 'array', items: { $ref: '#/definitions/hook' } },
				beforeDelete: { type: 'array', items: { $ref: '#/definitions/hook' } },
				afterDelete: { type: 'array', items: { $ref: '#/definitions/hook' } },
				beforeGetById: { type: 'array', items: { $ref: '#/definitions/hook' } },
				afterGetById: { type: 'array', items: { $ref: '#/definitions/hook' } },
				beforeGetAll: { type: 'array', items: { $ref: '#/definitions/hook' } },
				afterGetAll: { type: 'array', items: { $ref: '#/definitions/hook' } }
			}
		},
		computed: {
			type: 'array',
			items: {
				type: 'object',
				required: ['name', 'implementation'],
				properties: {
					name: {
						type: 'string',
						description: 'Property name'
					},
					dependencies: {
						type: 'array',
						items: { type: 'string' },
						description: 'Fields this property depends on'
					},
					implementation: {
						type: 'string',
						description: 'Property implementation'
					},
					cache: {
						type: 'boolean',
						description: 'Whether to cache the computed value'
					}
				}
			}
		},
		validation: {
			type: 'object',
			properties: {
				rules: {
					type: 'object',
					additionalProperties: {
						type: 'array',
						items: {
							type: 'object',
							required: ['type', 'message'],
							properties: {
								type: {
									type: 'string',
									enum: ['required', 'minLength', 'maxLength', 'min', 'max', 'pattern', 'email', 'custom'],
									description: 'Rule type'
								},
								value: {
									description: 'Rule value (if applicable)'
								},
								message: {
									type: 'string',
									description: 'Error message'
								},
								implementation: {
									type: 'string',
									description: 'Custom implementation (for custom rules)'
								}
							}
						}
					}
				}
			}
		},
		workflows: {
			type: 'array',
			items: {
				type: 'object',
				required: ['name', 'states', 'transitions'],
				properties: {
					name: {
						type: 'string',
						description: 'Workflow name'
					},
					stateField: {
						type: 'string',
						description: 'Field that stores the state'
					},
					states: {
						type: 'array',
						items: {
							type: 'object',
							required: ['name'],
							properties: {
								name: {
									type: 'string',
									description: 'State name'
								},
								initial: {
									type: 'boolean',
									description: 'Whether this is the initial state'
								},
								description: {
									type: 'string',
									description: 'State description'
								}
							}
						}
					},
					transitions: {
						type: 'array',
						items: {
							type: 'object',
							required: ['from', 'to', 'action'],
							properties: {
								from: {
									type: 'string',
									description: 'Source state'
								},
								to: {
									type: 'string',
									description: 'Target state'
								},
								action: {
									type: 'string',
									description: 'Transition action name'
								},
								roles: {
									type: 'array',
									items: { type: 'string' },
									description: 'Roles that can perform this transition'
								},
								hooks: {
									type: 'object',
									properties: {
										before: {
											type: 'string',
											description: 'Before transition hook'
										},
										after: {
											type: 'string',
											description: 'After transition hook'
										}
									}
								}
							}
						}
					}
				}
			}
		}
	},
	definitions: {
		hook: {
			type: 'object',
			required: ['name', 'implementation'],
			properties: {
				name: {
					type: 'string',
					description: 'Hook name'
				},
				implementation: {
					type: 'string',
					description: 'Inline implementation or path to external file'
				},
				condition: {
					type: 'string',
					description: 'Optional condition for hook execution'
				},
				priority: {
					type: 'number',
					description: 'Hook priority (lower numbers run first)'
				},
				async: {
					type: 'boolean',
					description: 'Whether the hook should be async'
				}
			}
		}
	}
};

/**
 * Generate TypeScript interface from entity config
 * @param entity Entity configuration
 * @returns TypeScript interface as string
 */
export function generateEntityInterface(entity: EntityMapping): string {
	let interfaceCode = `/**
 * Generated interface for ${entity.entity}
 * Automatically generated from YAML schema
 */
export interface ${entity.entity} {
`;

	// Add properties for each column
	for (const column of entity.columns) {
		const optional = column.nullable ? '?' : '';
		const tsType = mapTypeToTypeScript(column.type || 'string');

		// Add JSDoc comment if available
		if (column.comment) {
			interfaceCode += `  /**
   * ${column.comment}
   */
  `;
		}

		interfaceCode += `  ${column.logical}${optional}: ${tsType};\n`;
	}

	// Add computed properties if defined
	if (entity.computed) {
		for (const computed of entity.computed) {
			interfaceCode += `  /** Computed property */
  ${computed.name}: any;\n`;
		}
	}

	interfaceCode += `}\n`;
	return interfaceCode;
}

/**
 * Map database type to TypeScript type
 * @param dbType Database type
 * @returns Corresponding TypeScript type
 */
export function mapTypeToTypeScript(dbType: string): string {
	switch (dbType.toLowerCase()) {
		case 'string':
		case 'text':
		case 'varchar':
		case 'char':
			return 'string';
		case 'integer':
		case 'int':
		case 'bigint':
		case 'smallint':
			return 'number';
		case 'number':
		case 'decimal':
		case 'float':
		case 'double':
			return 'number';
		case 'boolean':
		case 'bool':
			return 'boolean';
		case 'date':
		case 'datetime':
		case 'timestamp':
			return 'Date';
		case 'json':
		case 'object':
			return 'Record<string, any>';
		case 'blob':
		case 'binary':
			return 'Buffer';
		default:
			return 'any';
	}
}

/**
 * Map TypeScript type to database type
 * @param tsType TypeScript type
 * @returns Corresponding database type
 */
export function mapTypeScriptToDbType(tsType: string): string {
	switch (tsType.toLowerCase()) {
		case 'string':
			return 'varchar';
		case 'number':
			return 'float';
		case 'boolean':
			return 'boolean';
		case 'date':
			return 'datetime';
		case 'buffer':
			return 'blob';
		case 'record<string, any>':
		case 'object':
			return 'json';
		default:
			return 'varchar';
	}
}

/**
 * Get database column definition SQL
 * @param column Column definition
 * @param dialect SQL dialect
 * @returns SQL column definition
 */
export function getColumnDefinition(
	column: any,
	dialect: 'sqlite' | 'mysql' | 'postgres' = 'sqlite'
): string {
	let sql = `${column.physical} `;

	// Add type
	if (column.type) {
		switch (dialect) {
			case 'mysql':
				sql += getMySQLColumnType(column);
				break;
			case 'postgres':
				sql += getPostgresColumnType(column);
				break;
			case 'sqlite':
			default:
				sql += getSQLiteColumnType(column);
				break;
		}
	}

	// Add constraints
	if (column.primaryKey) {
		sql += ' PRIMARY KEY';
	}

	if (column.autoIncrement) {
		switch (dialect) {
			case 'mysql':
				sql += ' AUTO_INCREMENT';
				break;
			case 'postgres':
				if (!column.primaryKey) {
					sql += ' GENERATED ALWAYS AS IDENTITY';
				}
				break;
			case 'sqlite':
			default:
				sql += ' AUTOINCREMENT';
				break;
		}
	}

	if (column.nullable === false) {
		sql += ' NOT NULL';
	}

	if (column.unique) {
		sql += ' UNIQUE';
	}

	return sql;
}

/**
 * Get SQLite column type
 * @param column Column definition
 * @returns SQLite column type
 */
function getSQLiteColumnType(column: any): string {
	if (!column.type) return 'TEXT';

	const type = column.type.toLowerCase();

	switch (type) {
		case 'integer':
		case 'int':
		case 'bigint':
		case 'smallint':
			return 'INTEGER';
		case 'number':
		case 'float':
		case 'double':
		case 'decimal':
			return 'REAL';
		case 'boolean':
		case 'bool':
			return 'INTEGER'; // SQLite stores booleans as 0/1
		case 'date':
		case 'datetime':
		case 'timestamp':
			return 'TEXT'; // SQLite stores dates as ISO strings
		case 'json':
		case 'object':
			return 'TEXT'; // SQLite stores JSON as text
		case 'blob':
		case 'binary':
			return 'BLOB';
		case 'string':
		case 'text':
		case 'varchar':
		case 'char':
		default:
			return 'TEXT';
	}
}

/**
 * Get MySQL column type
 * @param column Column definition
 * @returns MySQL column type
 */
function getMySQLColumnType(column: any): string {
	if (!column.type) return 'VARCHAR(255)';

	const type = column.type.toLowerCase();

	switch (type) {
		case 'integer':
		case 'int':
			return 'INT';
		case 'bigint':
			return 'BIGINT';
		case 'smallint':
			return 'SMALLINT';
		case 'number':
		case 'float':
			return 'FLOAT';
		case 'double':
			return 'DOUBLE';
		case 'decimal':
			return 'DECIMAL(10,2)';
		case 'boolean':
		case 'bool':
			return 'TINYINT(1)';
		case 'date':
			return 'DATE';
		case 'datetime':
		case 'timestamp':
			return 'DATETIME';
		case 'json':
		case 'object':
			return 'JSON';
		case 'blob':
		case 'binary':
			return 'BLOB';
		case 'text':
			return 'TEXT';
		case 'string':
		case 'varchar':
			return 'VARCHAR(255)';
		case 'char':
			return 'CHAR(1)';
		default:
			return 'VARCHAR(255)';
	}
}

/**
 * Get PostgreSQL column type
 * @param column Column definition
 * @returns PostgreSQL column type
 */
function getPostgresColumnType(column: any): string {
	if (!column.type) return 'VARCHAR(255)';

	const type = column.type.toLowerCase();

	switch (type) {
		case 'integer':
		case 'int':
			return 'INTEGER';
		case 'bigint':
			return 'BIGINT';
		case 'smallint':
			return 'SMALLINT';
		case 'number':
		case 'float':
			return 'REAL';
		case 'double':
			return 'DOUBLE PRECISION';
		case 'decimal':
			return 'DECIMAL(10,2)';
		case 'boolean':
		case 'bool':
			return 'BOOLEAN';
		case 'date':
			return 'DATE';
		case 'datetime':
		case 'timestamp':
			return 'TIMESTAMP';
		case 'json':
		case 'object':
			return 'JSONB';
		case 'blob':
		case 'binary':
			return 'BYTEA';
		case 'text':
			return 'TEXT';
		case 'string':
		case 'varchar':
			return 'VARCHAR(255)';
		case 'char':
			return 'CHAR(1)';
		default:
			return 'VARCHAR(255)';
	}
}

/**
 * Validate an entity configuration against JSON schema
 * @param entity Entity configuration
 * @param ajv Ajv instance
 * @returns Validation result
 */
export function validateEntity(entity: EntityMapping, ajv: any): { valid: boolean; errors: any[] } {
	const validate = ajv.compile(entityJsonSchema);
	const valid = validate(entity);

	return {
		valid,
		errors: validate.errors || []
	};
}