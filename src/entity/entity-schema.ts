/**
 * Entity Schema Definition
 * Provides JSON Schema for YAML validation and TypeScript interfaces
 */

import { EntityConfig, ColumnMapping } from "./entity-config";

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
			oneOf: [
				{ type: 'string' },
				{
					type: 'array',
					items: { type: 'string' },
					description: 'Composite primary key field names'
				}
			],
			description: 'Primary key field name(s)'
		},
		schema: {
			type: 'string',
			description: 'Database schema name'
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
					length: {
						type: 'number',
						description: 'Column length (for string types)'
					},
					precision: {
						type: 'number',
						description: 'Column precision (for numeric types)'
					},
					scale: {
						type: 'number',
						description: 'Column scale (for numeric types)'
					},
					foreignKey: {
						oneOf: [
							{
								type: 'string',
								description: 'Foreign key reference (table.column)'
							},
							{
								type: 'object',
								required: ['table', 'columns'],
								properties: {
									table: { type: 'string' },
									columns: {
										type: 'array',
										items: { type: 'string' }
									}
								},
								description: 'Composite foreign key reference'
							}
						]
					},
					api: {
						type: 'object',
						properties: {
							readable: {
								type: 'boolean',
								description: 'Whether this field is readable via API'
							},
							writable: {
								type: 'boolean',
								description: 'Whether this field is writable via API'
							},
							roles: {
								type: 'object',
								properties: {
									read: {
										type: 'array',
										items: { type: 'string' },
										description: 'Roles that can read this field'
									},
									write: {
										type: 'array',
										items: { type: 'string' },
										description: 'Roles that can write this field'
									}
								}
							}
						}
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
		junctionTables: {
			type: 'array',
			items: {
				type: 'object',
				required: ['table', 'sourceEntity', 'targetEntity', 'sourceColumn', 'targetColumn'],
				properties: {
					table: {
						type: 'string',
						description: 'Junction table name'
					},
					sourceEntity: {
						type: 'string',
						description: 'Source entity name'
					},
					targetEntity: {
						type: 'string',
						description: 'Target entity name'
					},
					sourceColumn: {
						oneOf: [
							{ type: 'string' },
							{ type: 'array', items: { type: 'string' } }
						],
						description: 'Source column(s) in junction table'
					},
					targetColumn: {
						oneOf: [
							{ type: 'string' },
							{ type: 'array', items: { type: 'string' } }
						],
						description: 'Target column(s) in junction table'
					},
					extraColumns: {
						type: 'array',
						items: {
							type: 'object',
							required: ['name', 'type'],
							properties: {
								name: { type: 'string' },
								type: { type: 'string' },
								nullable: { type: 'boolean' },
								defaultValue: {}
							}
						},
						description: 'Additional columns for the junction table'
					}
				}
			},
			description: 'Junction tables for many-to-many relationships'
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
				afterGetAll: { type: 'array', items: { $ref: '#/definitions/hook' } },
				beforeApi: { type: 'array', items: { $ref: '#/definitions/hook' } },
				afterApi: { type: 'array', items: { $ref: '#/definitions/hook' } }
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
					},
					exposeInApi: {
						type: 'boolean',
						description: 'Whether to expose in API responses'
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
								},
								applyToApi: {
									type: 'boolean',
									description: 'Whether to apply this validation to API requests'
								}
							}
						}
					}
				}
			}
		},
		actions: {
			type: 'array',
			items: {
				type: 'object',
				required: ['name', 'implementation'],
				properties: {
					name: {
						type: 'string',
						description: 'Action name'
					},
					description: {
						type: 'string',
						description: 'Action description'
					},
					implementation: {
						type: 'string',
						description: 'Action implementation'
					},
					httpMethod: {
						type: 'string',
						enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
						description: 'HTTP method'
					},
					route: {
						type: 'string',
						description: 'API route path'
					},
					roles: {
						type: 'array',
						items: { type: 'string' },
						description: 'Roles allowed to execute this action'
					},
					transactional: {
						type: 'boolean',
						description: 'Whether to execute in a transaction'
					},
					parameters: {
						type: 'array',
						items: {
							type: 'object',
							required: ['name', 'type'],
							properties: {
								name: {
									type: 'string',
									description: 'Parameter name'
								},
								type: {
									type: 'string',
									enum: ['string', 'number', 'boolean', 'object', 'array'],
									description: 'Parameter type'
								},
								required: {
									type: 'boolean',
									description: 'Whether the parameter is required'
								},
								description: {
									type: 'string',
									description: 'Parameter description'
								}
							}
						}
					}
				}
			}
		},
		middleware: {
			type: 'object',
			properties: {
				all: {
					type: 'array',
					items: { type: 'string' },
					description: 'Middleware to apply to all routes'
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
 * Map database type to TypeScript type
 * @param dbType Database type
 * @returns Corresponding TypeScript type
 */
export function mapDbTypeToTypeScript(dbType: string): string {
	if (!dbType) return 'any';

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
	if (!tsType) return 'string';

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
		case 'any':
			return 'string';
		default:
			return 'string';
	}
}

/**
 * Get database column type for a specific SQL dialect
 * @param column Column definition
 * @param dialect SQL dialect
 * @returns SQL column type
 */
export function getSqlColumnType(
	column: ColumnMapping,
	dialect: 'sqlite' | 'mysql' | 'postgres' = 'sqlite'
): string {
	if (!column.type) return dialect === 'postgres' ? 'VARCHAR(255)' : 'TEXT';

	const type = column.type.toLowerCase();

	// Different dialects have different type names
	switch (dialect) {
		case 'mysql':
			return getMySQLColumnType(column);
		case 'postgres':
			return getPostgresColumnType(column);
		case 'sqlite':
		default:
			return getSQLiteColumnType(column);
	}
}

/**
 * Get SQLite column type
 */
function getSQLiteColumnType(column: ColumnMapping): string {
	const type = column.type?.toLowerCase();

	switch (type) {
		case 'integer':
		case 'int':
		case 'bigint':
		case 'smallint':
		case 'tinyint':
			return 'INTEGER';
		case 'real':
		case 'float':
		case 'double':
		case 'decimal':
		case 'number':
			return 'REAL';
		case 'boolean':
		case 'bool':
			return 'INTEGER';
		case 'date':
		case 'datetime':
		case 'timestamp':
			return 'TEXT';
		case 'blob':
		case 'binary':
			return 'BLOB';
		case 'varchar':
		case 'string':
		case 'char':
		case 'text':
		default:
			return 'TEXT';
	}
}

/**
 * Get MySQL column type
 */
function getMySQLColumnType(column: ColumnMapping): string {
	const type = column.type?.toLowerCase();

	switch (type) {
		case 'integer':
		case 'int':
			return 'INT';
		case 'bigint':
			return 'BIGINT';
		case 'smallint':
			return 'SMALLINT';
		case 'tinyint':
			return 'TINYINT';
		case 'float':
		case 'number':
			return 'FLOAT';
		case 'double':
			return 'DOUBLE';
		case 'decimal':
			if (column.precision && column.scale) {
				return `DECIMAL(${column.precision},${column.scale})`;
			}
			return 'DECIMAL(10,2)';
		case 'boolean':
		case 'bool':
			return 'TINYINT(1)';
		case 'date':
			return 'DATE';
		case 'datetime':
		case 'timestamp':
			return 'DATETIME';
		case 'blob':
		case 'binary':
			return 'BLOB';
		case 'text':
			return 'TEXT';
		case 'varchar':
		case 'string':
			return column.length ? `VARCHAR(${column.length})` : 'VARCHAR(255)';
		case 'char':
			return column.length ? `CHAR(${column.length})` : 'CHAR(1)';
		default:
			return 'VARCHAR(255)';
	}
}

/**
 * Get PostgreSQL column type
 */
function getPostgresColumnType(column: ColumnMapping): string {
	const type = column.type?.toLowerCase();

	switch (type) {
		case 'integer':
		case 'int':
			return 'INTEGER';
		case 'bigint':
			return 'BIGINT';
		case 'smallint':
			return 'SMALLINT';
		case 'tinyint':
			return 'SMALLINT';
		case 'float':
		case 'number':
			return 'REAL';
		case 'double':
			return 'DOUBLE PRECISION';
		case 'decimal':
			if (column.precision && column.scale) {
				return `DECIMAL(${column.precision},${column.scale})`;
			}
			return 'DECIMAL(10,2)';
		case 'boolean':
		case 'bool':
			return 'BOOLEAN';
		case 'date':
			return 'DATE';
		case 'datetime':
		case 'timestamp':
			return 'TIMESTAMP';
		case 'blob':
		case 'binary':
			return 'BYTEA';
		case 'text':
			return 'TEXT';
		case 'varchar':
		case 'string':
			return column.length ? `VARCHAR(${column.length})` : 'VARCHAR(255)';
		case 'char':
			return column.length ? `CHAR(${column.length})` : 'CHAR(1)';
		case 'json':
		case 'jsonb':
			return 'JSONB';
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
export function validateEntity(entity: EntityConfig, ajv: any): { valid: boolean; errors: any[] } {
	const validate = ajv.compile(entityJsonSchema);
	const valid = validate(entity);

	return {
		valid,
		errors: validate.errors || []
	};
}