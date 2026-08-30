function recencyScore(date) {
  const ageDays = Math.max(0, (Date.now() - new Date(date).getTime()) / 86_400_000);
  return Math.exp(-ageDays / 120);
}

export function createLongTermMemory(database, embeddings, gate = null) {
  async function migrate(limit = 800) {
    const legacy = database.listMemories(limit).filter(item => item.vectorModel !== embeddings.model);
    if (!legacy.length) return { migrated: 0, pending: 0 };
    const vectors = await embeddings.embedMany(legacy.map(item => item.content));
    let migrated = 0;
    legacy.forEach((item, index) => {
      const embedded = vectors[index];
      if (embedded?.semantic) { database.updateMemoryVector(item.id, embedded.vector, embedded.model); migrated += 1; }
    });
    return { migrated, pending: Math.max(0, legacy.length - migrated) };
  }

  return {
    async remember(content, { kind = 'episodic', importance = 0.5, confidence = 0.7, source = 'agent', metadata = {}, lastConfirmedAt = null, explicit = false } = {}) {
      if (typeof content !== 'string' || content.trim().length < 8) return null;
      const clean = content.trim().slice(0, 12_000);
      const decision = gate?.evaluate?.(clean, { kind, importance, confidence, source, explicit }) || { persist: true, kind };
      if (!decision.persist) return null;
      kind = decision.kind || kind;
      if (decision.duplicateId) { database.reinforceMemory(decision.duplicateId, { importance, confidence, confirmedAt: lastConfirmedAt }); return decision.duplicateId; }
      if (decision.contradictionId) database.contradictMemory(decision.contradictionId);
      const embedded = await embeddings.embed(clean);
      return database.putMemory({ kind, content: clean, vector: embedded.vector, vectorModel: embedded.model, importance, confidence, source, metadata: { ...metadata, semantic: embedded.semantic, memoryGate: decision.reason, contradicts: decision.contradictionId || null }, lastConfirmedAt });
    },
    async search(query, { limit = 6, kind } = {}) {
      const queryEmbedding = await embeddings.embed(query);
      const lexical = new Map(database.searchMemoriesText(query, 100).map((item, index) => [item.id, 1 - index / 100]));
      const seen = new Set(); return database.listMemories(800)
        .filter(item => !kind || item.kind === kind)
        .map(item => {
          const semantic = item.vectorModel === queryEmbedding.model ? embeddings.similarity(queryEmbedding.vector, item.vector) : 0;
          const access = Math.min(1, Math.log2(1 + (item.accessCount || 0)) / 8);
          return { ...item, score: semantic * 0.58 + (lexical.get(item.id) || 0) * 0.18 + item.importance * 0.10 + item.confidence * 0.08 + recencyScore(item.lastAccessedAt) * 0.04 + access * 0.02, semanticScore: semantic };
        })
        .sort((left, right) => right.score - left.score)
        .filter(item => { const key = item.content.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim(); if (seen.has(key)) return false; seen.add(key); return true; })
        .slice(0, limit)
        .map(item => { database.touchMemory(item.id); return item; });
    },
    migrate,
    consolidate({ olderThanDays = 365, maxImportance = 0.25, maxConfidence = 0.45 } = {}) {
      const cutoff = new Date(Date.now() - olderThanDays * 86_400_000).toISOString();
      return { forgotten: database.forgetMemories(cutoff, maxImportance, maxConfidence) };
    },
    health() {
      const items = database.listMemories(2000);
      return { engine: 'semantic-rerank-v2', embeddingModel: embeddings.model, gate: gate?.health?.() || null, memories: items.length, semantic: items.filter(item => item.vectorModel === embeddings.model).length, legacy: items.filter(item => item.vectorModel !== embeddings.model).length };
    },
  };
}
