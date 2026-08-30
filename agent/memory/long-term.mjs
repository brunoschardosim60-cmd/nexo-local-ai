import { cosineSimilarity, embedText } from './embeddings.mjs';

export function createLongTermMemory(database) {
  return {
    remember(content, { kind = 'episodic', importance = 0.5, confidence = 0.7, source = 'agent', metadata = {}, lastConfirmedAt = null } = {}) {
      if (typeof content !== 'string' || content.trim().length < 8) return null;
      return database.putMemory({ kind, content: content.trim().slice(0, 12_000), vector: embedText(content), importance, confidence, source, metadata, lastConfirmedAt });
    },
    search(query, { limit = 6, kind } = {}) {
      const queryVector = embedText(query);
      const lexical = new Map(database.searchMemoriesText(query, 100).map((item, index) => [item.id, 1 - index / 100]));
      return database.listMemories(800)
        .filter(item => !kind || item.kind === kind)
        .map(item => ({ ...item, score: cosineSimilarity(queryVector, item.vector) * 0.62 + item.importance * 0.16 + item.confidence * 0.1 + (lexical.get(item.id) || 0) * 0.12 }))
        .sort((left, right) => right.score - left.score)
        .slice(0, limit)
        .map(item => { database.touchMemory(item.id); return item; });
    },
  };
}
