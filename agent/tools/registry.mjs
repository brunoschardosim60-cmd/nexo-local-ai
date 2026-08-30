import { assertSchemaDefinition, validateSchema } from './contracts.mjs';

export function createToolRegistry(toolDefinitions) {
  const tools = new Map(); const aliases = new Map();
  for (const tool of toolDefinitions) {
    if (!tool?.name || tools.has(tool.name)) throw new Error(`Ferramenta duplicada ou inválida: ${tool?.name || 'sem nome'}`);
    const inputSchema = tool.inputSchema || tool.schema || { type: 'object' };
    assertSchemaDefinition(inputSchema, tool.name);
    const normalized = { version: 1, aliases: [], ...tool, inputSchema };
    tools.set(normalized.name, normalized);
    for (const alias of normalized.aliases) {
      if (aliases.has(alias) || tools.has(alias)) throw new Error(`Alias duplicado: ${alias}`);
      aliases.set(alias, normalized.name);
    }
  }
  return {
    get(name) { const canonical = aliases.get(name) || name; const tool = tools.get(canonical); if (!tool) throw new Error(`Ferramenta desconhecida: ${name}`); return tool; },
    describe() { return [...tools.values()].map(({ name, description, risk, inputSchema, version }) => ({ name, description, risk, schema: inputSchema, version })); },
    async execute(name, input, context = {}) {
      const tool = this.get(name); const validated = validateSchema(input || {}, tool.inputSchema, tool.name);
      return tool.execute(validated, context);
    },
  };
}
