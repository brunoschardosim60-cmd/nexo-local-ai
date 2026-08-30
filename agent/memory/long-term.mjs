const PROVENANCE = new Set(['USER_EXPLICIT', 'USER_INFERRED', 'TOOL', 'FILE', 'WEB', 'AGENT', 'SYSTEM', 'DERIVED']);
const SOURCE_ALIASES = { user: 'USER_EXPLICIT', agent: 'AGENT', tool: 'TOOL', file: 'FILE', web: 'WEB', system: 'SYSTEM', derived: 'DERIVED' };

function clamp(value, min = 0, max = 1) { return Math.max(min, Math.min(max, Number(value) || 0)); }
function recencyScore(date) { const ageDays = Math.max(0, (Date.now() - new Date(date).getTime()) / 86_400_000); return Math.exp(-ageDays / 120); }
function normalizeSource(source, explicit) { if (explicit && (!source || String(source).toLowerCase() === 'agent')) return 'USER_EXPLICIT'; const value = String(source || (explicit ? 'USER_EXPLICIT' : 'AGENT')).toUpperCase(); return PROVENANCE.has(value) ? value : SOURCE_ALIASES[String(source || '').toLowerCase()] || (explicit ? 'USER_EXPLICIT' : 'AGENT'); }
function summarize(content) { const clean = String(content).replace(/\s+/g, ' ').trim(); return clean.length <= 180 ? clean : `${clean.slice(0, 177)}…`; }
function topics(content) { return [...new Set(String(content).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[a-z0-9_-]{4,}/g) || [])].filter(word => !['para','como','isso','essa','este','uma','com','que','mais','sobre'].includes(word)).slice(0, 12); }
function expandQuery(query) { const expansions = { login: ['autenticação', 'sessão', 'jwt'], autenticacao: ['login', 'sessão', 'jwt'], erro: ['falha', 'bug', 'correção'], banco: ['database', 'sqlite', 'dados'], usuario: ['perfil', 'preferência'] }; const normalized = String(query).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); const extra = []; for (const [key, values] of Object.entries(expansions)) if (normalized.includes(key)) extra.push(...values); return [...new Set([query, ...extra])].join(' '); }
function current(item, now = Date.now()) { return (!item.validFrom || new Date(item.validFrom).getTime() <= now) && (!item.validUntil || new Date(item.validUntil).getTime() > now) && (!item.expiresAt || new Date(item.expiresAt).getTime() > now); }

export function createLongTermMemory(database, embeddings, gate = null) {
  async function migrate(limit = 800) {
    const legacy = database.listMemories({ limit, status: ['ACTIVE', 'UNCERTAIN', 'SUPERSEDED', 'FORGOTTEN'], includeExpired: true }).filter(item => item.vectorModel !== embeddings.model);
    if (!legacy.length) return { migrated: 0, pending: 0 };
    const vectors = await embeddings.embedMany(legacy.map(item => item.content)); let migrated = 0;
    legacy.forEach((item, index) => { const embedded = vectors[index]; if (embedded?.semantic) { database.updateMemoryVector(item.id, embedded.vector, embedded.model); migrated += 1; } });
    if (vectors[0]?.vector?.length) database.upsertEmbeddingSpace({ model: embeddings.model, dimensions: vectors[0].vector.length, version: 'v1', compatible: true });
    return { migrated, pending: Math.max(0, legacy.length - migrated), model: embeddings.model };
  }

  async function remember(content, options = {}) {
    const { importance = 0.5, confidence = 0.7, metadata = {}, lastConfirmedAt = null, explicit = false, privacy = 'LOCAL_ONLY', status = 'ACTIVE', summary = '', entities = [], topics: suppliedTopics = [], observedAt = null, validFrom = null, validUntil = null, expiresAt = null } = options;
    let { kind = 'episodic', source = 'agent', scope = 'global' } = options;
    if (typeof content !== 'string' || content.trim().length < 8) return null;
    const clean = content.trim().slice(0, 12_000); source = normalizeSource(source, explicit); scope = String(scope || 'global').slice(0, 300);
    const decision = gate?.evaluate?.(clean, { kind, importance, confidence, source, explicit, scope }) || { persist: true, kind, scope, sensitivity: 'NORMAL', reason: 'sem gate' };
    if (!decision.persist) return null; kind = decision.kind || kind;
    if (decision.duplicateId) { database.reinforceMemory(decision.duplicateId, { importance, confidence, confirmedAt: lastConfirmedAt || (explicit ? new Date().toISOString() : null) }); return decision.duplicateId; }
    const embedded = await embeddings.embed(clean);
    if (embedded.vector?.length) database.upsertEmbeddingSpace({ model: embedded.model, dimensions: embedded.vector.length, version: 'v1', compatible: true });
    const contradiction = decision.contradictionId ? database.getMemory(decision.contradictionId) : null;
    const canSupersede = Boolean(contradiction && explicit && source === 'USER_EXPLICIT');
    const id = database.putMemory({ type: kind, content: clean, summary: summary || summarize(clean), embedding: embedded.vector, vectorModel: embedded.model, entities, topics: suppliedTopics.length ? suppliedTopics : topics(clean), importance: clamp(importance), confidence: clamp(confidence), source, scope, privacy: decision.sensitivity === 'RESTRICTED' ? 'RESTRICTED' : privacy, status: contradiction && !canSupersede ? 'UNCERTAIN' : status, metadata: { ...metadata, semantic: embedded.semantic, memoryGate: decision.reason, gateScores: decision.scores || null, contradicts: contradiction?.id || null }, lastConfirmedAt: lastConfirmedAt || (explicit ? new Date().toISOString() : null), observedAt, validFrom, validUntil, expiresAt });
    if (contradiction) {
      database.contradictMemory(contradiction.id);
      if (canSupersede) database.setMemoryStatus(contradiction.id, 'SUPERSEDED', { supersededBy: id });
      database.recordMemoryConflict({ oldMemoryId: contradiction.id, newMemoryId: id, resolution: canSupersede ? 'SUPERSEDE' : 'UNCERTAIN', status: canSupersede ? 'RESOLVED' : 'OPEN', reason: canSupersede ? 'Atualização explícita do usuário preservou a versão anterior como superseded.' : 'Evidência insuficiente; ambas foram preservadas sem sobrescrita.', evidence: [{ source, explicit }] });
    }
    return id;
  }

  async function search(query, { limit = 6, kind = null, scope = 'global', includeGlobal = true, queryExpansion = true, status = ['ACTIVE', 'UNCERTAIN'] } = {}) {
    const expanded = queryExpansion ? expandQuery(query) : String(query); const queryEmbedding = await embeddings.embed(expanded);
    const lexical = new Map(database.searchMemoriesText(expanded, 150).map((item, index) => [item.id, 1 - index / 150]));
    const scoped = database.listMemories({ limit: 5000, scope, kind, status });
    const global = includeGlobal && scope !== 'global' ? database.listMemories({ limit: 3000, scope: 'global', kind, status }) : [];
    const seenIds = new Set(); const seenContent = new Set();
    return [...scoped, ...global].filter(item => { if (seenIds.has(item.id) || !current(item)) return false; seenIds.add(item.id); return true; }).map(item => {
      const semantic = item.vectorModel === queryEmbedding.model ? embeddings.similarity(queryEmbedding.vector, item.vector) : 0;
      const lexicalScore = lexical.get(item.id) || 0; const access = Math.min(1, Math.log2(1 + (item.accessCount || 0)) / 8);
      const scopeScore = item.scope === scope ? 1 : 0.65; const freshness = recencyScore(item.observedAt || item.createdAt);
      const scoreParts = { semantic: semantic * 0.46, lexical: lexicalScore * 0.18, importance: item.importance * 0.10, confidence: item.confidence * 0.09, scope: scopeScore * 0.08, recency: freshness * 0.06, access: access * 0.03 };
      const score = Object.values(scoreParts).reduce((sum, value) => sum + value, 0) * (item.status === 'UNCERTAIN' ? 0.82 : 1);
      return { ...item, score, semanticScore: semantic, retrieval: { expandedQuery: expanded, scoreParts, reason: `semântica ${semantic.toFixed(2)}, escopo ${item.scope}, confiança ${item.confidence.toFixed(2)}` } };
    }).sort((a, b) => b.score - a.score).filter(item => item.semanticScore >= 0.15 || item.retrieval.scoreParts.lexical > 0).filter(item => { const key = item.content.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim(); if (seenContent.has(key)) return false; seenContent.add(key); return true; }).slice(0, limit).map(item => { database.touchMemory(item.id); return item; });
  }

  async function update(id, patch = {}) {
    const currentMemory = database.getMemory(id); if (!currentMemory) return null;
    const editable = Object.fromEntries(Object.entries(patch).filter(([key]) => ['content','summary','type','kind','entities','topics','metadata','scope','privacy','importance','confidence','observedAt','validFrom','validUntil','expiresAt'].includes(key)));
    if (editable.content != null && (typeof editable.content !== 'string' || editable.content.trim().length < 8 || editable.content.length > 12_000)) throw new Error('Conteúdo de memória inválido.');
    if (editable.privacy && !['LOCAL_ONLY','SHAREABLE','RESTRICTED'].includes(editable.privacy)) throw new Error('Privacidade de memória inválida.');
    if ((editable.type || editable.kind) && !['working','episodic','semantic','procedural','user','project','style','error','decision'].includes(editable.type || editable.kind)) throw new Error('Tipo de memória inválido.');
    if (editable.importance != null) editable.importance = clamp(editable.importance); if (editable.confidence != null) editable.confidence = clamp(editable.confidence);
    if (editable.content && editable.content !== currentMemory.content) { editable.content = editable.content.trim(); editable.summary ||= summarize(editable.content); const embedded = await embeddings.embed(editable.content); database.updateMemoryVector(id, embedded.vector, embedded.model); }
    return database.updateMemory(id, editable);
  }
  function confirm(id) { const item = database.getMemory(id); return item ? database.updateMemory(id, { status: 'ACTIVE', confidence: Math.min(0.99, item.confidence + 0.15), lastConfirmedAt: new Date().toISOString() }) : null; }
  function forget(id) { return database.setMemoryStatus(id, 'FORGOTTEN'); }
  function remove(id) { return database.deleteMemory(id); }
  function explain(id) { const item = database.getMemory(id); return item ? { id, status: item.status, source: item.source, scope: item.scope, confidence: item.confidence, importance: item.importance, observedAt: item.observedAt, lastConfirmedAt: item.lastConfirmedAt, contradicts: item.metadata?.contradicts || null, supersededBy: item.supersededBy, retrievalPolicy: 'hybrid-v3' } : null; }
  async function consolidate({ olderThanDays = 365, maxImportance = 0.25, maxConfidence = 0.45, synthesize = true } = {}) {
    const cutoff = new Date(Date.now() - olderThanDays * 86_400_000).toISOString(); const candidates = database.listMemories({ limit: 5000, kind: 'episodic', status: ['ACTIVE'] }); let consolidated = 0;
    if (synthesize) { const groups = new Map(); for (const item of candidates) { const key = (item.topics?.[0] || item.scope); const group = groups.get(key) || []; group.push(item); groups.set(key, group); } for (const group of groups.values()) if (group.length >= 3) { await remember(`Padrão consolidado de ${group.length} episódios: ${group.slice(0, 3).map(item => item.summary).join(' | ')}`, { kind: 'semantic', source: 'DERIVED', scope: group[0].scope, confidence: Math.min(...group.map(item => item.confidence)) * 0.9, importance: Math.max(...group.map(item => item.importance)), metadata: { consolidatedFrom: group.map(item => item.id) } }); consolidated += 1; } }
    return { consolidated, forgotten: database.forgetMemories(cutoff, maxImportance, maxConfidence) };
  }
  function list(options = {}) { return database.listMemories(options); }
  function health() { const items = database.listMemories({ limit: 5000, status: ['ACTIVE', 'UNCERTAIN', 'SUPERSEDED', 'FORGOTTEN'], includeExpired: true }); return { engine: 'personal-memory-v3', embeddingModel: embeddings.model, records: items.length, memories: items.filter(item => ['ACTIVE','UNCERTAIN'].includes(item.status)).length, semantic: items.filter(item => item.vectorModel === embeddings.model).length, legacy: items.filter(item => item.vectorModel !== embeddings.model).length, scopes: new Set(items.map(item => item.scope)).size, uncertain: items.filter(item => item.status === 'UNCERTAIN').length, provenance: [...PROVENANCE], privacy: ['LOCAL_ONLY','SHAREABLE','RESTRICTED'], hybridRetrieval: true, temporal: true, contradictions: true }; }
  return { remember, search, list, update, confirm, forget, delete: remove, explain, migrate, consolidate, health };
}
