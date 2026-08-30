import { defineTool } from '../tools/contracts.mjs';

const ENTITY_PATTERNS = [
  ['FILE', /(?:^|\s)([\w./\\-]+\.(?:js|ts|tsx|jsx|mjs|py|md|json|yaml|yml|sql|css|html))\b/gi],
  ['TECHNOLOGY', /\b(SQLite|React|Next\.js|Node\.js|TypeScript|JavaScript|Python|Ollama|Git|Docker|JWT|API|RAG|LSP|Tree-sitter)\b/gi],
  ['PROJECT', /\b(?:projeto|project)\s+([\w-]{2,60})\b/gi],
];

function extractEntities(content) {
  const found = []; for (const [type, pattern] of ENTITY_PATTERNS) { pattern.lastIndex = 0; for (const match of String(content).matchAll(pattern)) found.push({ type, name: match[1] }); }
  return [...new Map(found.map(item => [`${item.type}:${item.name.toLowerCase()}`, item])).values()].slice(0, 30);
}

export function createKnowledgeEngine(database, memory) {
  async function rememberStructured(content, { type = 'semantic', scope = 'global', source = 'AGENT', relation = 'RELATED_TO', ...options } = {}) {
    const entities = extractEntities(content); const id = await memory.remember(content, { kind: type, scope, source, entities, ...options });
    if (!id) return null;
    const stored = entities.map(entity => database.upsertEntity({ ...entity, scope, metadata: { sourceMemoryId: id } }));
    for (let index = 1; index < stored.length; index += 1) database.linkEntities({ fromEntityId: stored[0].id, toEntityId: stored[index].id, type: relation, sourceMemoryId: id, confidence: options.confidence ?? 0.7 });
    return { memoryId: id, entities: stored };
  }
  async function recordProcedure({ name, steps, scope = 'global', outcome = null, confidence = 0.8, source = 'AGENT' }) { return rememberStructured(`Procedimento ${String(name)}: ${steps.map((step, index) => `${index + 1}. ${String(step)}`).join(' ')}${outcome ? ` Resultado: ${String(outcome)}` : ''}`, { type: 'procedural', scope, source, confidence, importance: 0.82, metadata: { name, steps, outcome, reusable: true } }); }
  async function recordDecision({ decision, rationale, alternatives = [], scope = 'global', source = 'AGENT' }) { return rememberStructured(`Decisão: ${decision}. Motivo: ${rationale}.${alternatives.length ? ` Alternativas consideradas: ${alternatives.join(', ')}.` : ''}`, { type: 'decision', scope, source, confidence: 0.82, importance: 0.86, relation: 'DECIDED', metadata: { decision, rationale, alternatives } }); }
  async function recordError({ error, cause, fix, scope = 'global', evidence = [], source = 'TOOL' }) { return rememberStructured(`Erro: ${error}. Causa: ${cause}. Correção: ${fix}.`, { type: 'error', scope, source, confidence: evidence.length ? 0.88 : 0.65, importance: 0.8, relation: 'FIXED_BY', metadata: { error, cause, fix, evidence } }); }
  function traverse(startEntityId, { depth = 2, relationTypes = null } = {}) {
    const safeDepth = Math.max(1, Math.min(Number(depth) || 2, 5)); const visited = new Set([startEntityId]); let frontier = [startEntityId]; const relations = [];
    for (let hop = 1; hop <= safeDepth && frontier.length; hop += 1) { const next = []; for (const entityId of frontier) for (const relation of database.listRelations({ entityId, limit: 500 })) { if (relationTypes?.length && !relationTypes.includes(relation.type)) continue; relations.push({ ...relation, hop }); const neighbor = relation.fromEntityId === entityId ? relation.toEntityId : relation.fromEntityId; if (!visited.has(neighbor)) { visited.add(neighbor); next.push(neighbor); } } frontier = next; }
    return { start: database.getEntity(startEntityId), entities: [...visited].map(id => database.getEntity(id)).filter(Boolean), relations: [...new Map(relations.map(item => [item.id, item])).values()], depth: safeDepth };
  }
  return { extractEntities, rememberStructured, recordProcedure, recordDecision, recordError, entities: options => database.listEntities(options), link: input => database.linkEntities(input), relations: options => database.listRelations(options), traverse, health: () => ({ engine: 'local-knowledge-graph-v1', entities: database.listEntities({ limit: 10_000 }).length, relations: database.listRelations({ limit: 10_000 }).length, maxTraversalDepth: 5 }) };
}

export function createMemoryTools(memory, knowledge) {
  return [
    defineTool({ name: 'memory.search', description: 'Recupera memórias locais por significado, texto, escopo, confiança e atualidade.', risk: 'read', inputSchema: { type: 'object', properties: { query: { type: 'string', minLength: 2, maxLength: 2000 }, scope: { type: 'string', maxLength: 300 }, kind: { type: 'string', maxLength: 40 }, limit: { type: 'integer', minimum: 1, maximum: 30 } }, required: ['query'], additionalProperties: false }, execute: input => memory.search(input.query, input) }),
    defineTool({ name: 'memory.remember', description: 'Registra conhecimento útil na memória local após o gate de persistência.', risk: 'write', inputSchema: { type: 'object', properties: { content: { type: 'string', minLength: 8, maxLength: 12000 }, kind: { type: 'string', enum: ['episodic','semantic','procedural','user','project','style','error','decision'] }, scope: { type: 'string', maxLength: 300 }, importance: { type: 'number', minimum: 0, maximum: 1 }, confidence: { type: 'number', minimum: 0, maximum: 1 } }, required: ['content'], additionalProperties: false }, execute: async input => ({ id: await memory.remember(input.content, { ...input, source: 'AGENT' }) }) }),
    defineTool({ name: 'memory.confirm', description: 'Confirma uma memória incerta e reforça sua confiança.', risk: 'write', inputSchema: { type: 'object', properties: { id: { type: 'string', minLength: 8, maxLength: 100 } }, required: ['id'], additionalProperties: false }, execute: input => memory.confirm(input.id) }),
    defineTool({ name: 'memory.forget', description: 'Arquiva uma memória local; não faz exclusão física autônoma.', risk: 'write', inputSchema: { type: 'object', properties: { id: { type: 'string', minLength: 8, maxLength: 100 } }, required: ['id'], additionalProperties: false }, execute: input => memory.forget(input.id) }),
    defineTool({ name: 'knowledge.entities', description: 'Busca entidades do grafo local de conhecimento.', risk: 'read', inputSchema: { type: 'object', properties: { query: { type: 'string', maxLength: 300 }, scope: { type: 'string', maxLength: 300 }, limit: { type: 'integer', minimum: 1, maximum: 100 } }, additionalProperties: false }, execute: input => knowledge.entities(input) }),
    defineTool({ name: 'knowledge.traverse', description: 'Percorre relações verificáveis do grafo local em até cinco saltos.', risk: 'read', inputSchema: { type: 'object', properties: { entityId: { type: 'string', minLength: 8, maxLength: 100 }, depth: { type: 'integer', minimum: 1, maximum: 5 } }, required: ['entityId'], additionalProperties: false }, execute: input => knowledge.traverse(input.entityId, input) }),
    defineTool({ name: 'knowledge.procedure', description: 'Registra um procedimento reutilizável e seu resultado.', risk: 'write', inputSchema: { type: 'object', properties: { name: { type: 'string', minLength: 2, maxLength: 300 }, steps: { type: 'array', items: { type: 'string', maxLength: 1000 }, maxItems: 30 }, scope: { type: 'string', maxLength: 300 }, outcome: { type: 'string', maxLength: 2000 } }, required: ['name','steps'], additionalProperties: false }, execute: input => knowledge.recordProcedure(input) }),
    defineTool({ name: 'knowledge.decision', description: 'Registra decisão, justificativa e alternativas no histórico local.', risk: 'write', inputSchema: { type: 'object', properties: { decision: { type: 'string', minLength: 3, maxLength: 2000 }, rationale: { type: 'string', minLength: 3, maxLength: 3000 }, alternatives: { type: 'array', items: { type: 'string', maxLength: 500 }, maxItems: 20 }, scope: { type: 'string', maxLength: 300 } }, required: ['decision','rationale'], additionalProperties: false }, execute: input => knowledge.recordDecision(input) }),
  ];
}
