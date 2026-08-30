const TYPES = new Set(['object', 'string', 'number', 'integer', 'boolean', 'array']);

function valueType(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function validateValue(value, schema, path) {
  if (!schema || !schema.type) return;
  const actual = valueType(value);
  const accepted = schema.type === 'number' ? ['number', 'integer'] : [schema.type];
  if (!accepted.includes(actual)) throw new Error(`${path} deve ser ${schema.type}; recebido ${actual}.`);
  if (schema.enum && !schema.enum.includes(value)) throw new Error(`${path} deve ser um de: ${schema.enum.join(', ')}.`);
  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) throw new Error(`${path} é muito curto.`);
    if (schema.maxLength != null && value.length > schema.maxLength) throw new Error(`${path} é muito longo.`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) throw new Error(`${path} possui formato inválido.`);
  }
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) throw new Error(`${path} deve ser no mínimo ${schema.minimum}.`);
    if (schema.maximum != null && value > schema.maximum) throw new Error(`${path} deve ser no máximo ${schema.maximum}.`);
  }
  if (Array.isArray(value)) {
    if (schema.maxItems != null && value.length > schema.maxItems) throw new Error(`${path} excede ${schema.maxItems} itens.`);
    value.forEach((item, index) => validateValue(item, schema.items, `${path}[${index}]`));
  }
  if (schema.type === 'object') {
    const properties = schema.properties || {};
    for (const required of schema.required || []) if (value[required] == null) throw new Error(`${path}.${required} é obrigatório.`);
    if (schema.additionalProperties === false) {
      const unknown = Object.keys(value).find(key => !(key in properties));
      if (unknown) throw new Error(`${path}.${unknown} não faz parte do contrato.`);
    }
    for (const [key, child] of Object.entries(properties)) if (value[key] != null) validateValue(value[key], child, `${path}.${key}`);
  }
}

export function validateSchema(value, schema, label = 'input') {
  validateValue(value, schema, label);
  return value;
}

export function defineTool(definition) {
  if (!definition || typeof definition.name !== 'string' || !definition.name.includes('.')) throw new Error('Tool precisa de um nome canônico com namespace.');
  if (typeof definition.description !== 'string' || !definition.description.trim()) throw new Error(`Tool ${definition.name} precisa de descrição.`);
  if (!definition.inputSchema || definition.inputSchema.type !== 'object') throw new Error(`Tool ${definition.name} precisa de inputSchema do tipo object.`);
  if (typeof definition.execute !== 'function') throw new Error(`Tool ${definition.name} precisa de execute().`);
  return Object.freeze({ version: 1, aliases: [], ...definition });
}

export function assertSchemaDefinition(schema, toolName) {
  if (!schema || typeof schema !== 'object') return;
  if (schema.type && !TYPES.has(schema.type)) throw new Error(`Schema inválido em ${toolName}: ${schema.type}.`);
}
