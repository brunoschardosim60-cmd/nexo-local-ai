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
    discover({ objective = '', namespaces = [], limit = 14 } = {}) {
      const tokens = new Set(String(objective).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[a-z0-9]{3,}/g) || []);
      return [...tools.values()].map(tool => { const haystack = `${tool.name} ${tool.description}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); let score = namespaces.some(prefix => tool.name.startsWith(prefix)) ? 6 : 0; for (const token of tokens) if (haystack.includes(token)) score += 1; return { tool, score }; }).filter(item => item.score > 0 || namespaces.length === 0).sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name)).slice(0, limit).map(({ tool: { name, description, risk, inputSchema, version } }) => ({ name, description, risk, schema: inputSchema, version }));
    },
    async execute(name, input, context = {}) {
      const tool = this.get(name);
      if (Array.isArray(context.allowedNamespaces) && context.allowedNamespaces.length && !context.allowedNamespaces.some(prefix => tool.name.startsWith(prefix))) throw new Error(`Especialista sem capacidade para ${tool.name}.`);
      if (context.capabilityManager && context.capabilityId) { const decision = context.capabilityManager.validate(context.capabilityId, tool, input, context); if (!decision.allowed) throw new Error(decision.reason); }
      const validated = validateSchema(input || {}, tool.inputSchema, tool.name);
      return tool.execute(validated, context);
    },
  };
}
