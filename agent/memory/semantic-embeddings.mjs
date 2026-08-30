import { cosineSimilarity, embedText } from './embeddings.mjs';

function lexicalFallback(text, error = null) {
  return { vector: embedText(String(text || '')), model: 'lexical-hash-v1', semantic: false, error: error ? String(error.message || error) : null };
}

export function createSemanticEmbeddings({ ollamaUrl, model = 'embeddinggemma', fetchImpl = globalThis.fetch, timeoutMs = 45_000 } = {}) {
  const cache = new Map();

  async function request(input) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${String(ollamaUrl || 'http://127.0.0.1:11434').replace(/\/$/, '')}/api/embed`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ model, input, truncate: true, keep_alive: 0 }),
      });
      if (!response.ok) throw new Error(`Ollama embeddings respondeu ${response.status}.`);
      const payload = await response.json();
      if (!Array.isArray(payload.embeddings) || payload.embeddings.some(vector => !Array.isArray(vector) || vector.length === 0)) throw new Error('Ollama não retornou vetores válidos.');
      return payload.embeddings;
    } finally { clearTimeout(timer); }
  }

  async function embed(text) {
    const content = String(text || '').slice(0, 24_000);
    const key = `${model}:${content}`;
    if (cache.has(key)) return cache.get(key);
    let result;
    try { result = { vector: (await request(content))[0], model, semantic: true, error: null }; }
    catch (error) { result = lexicalFallback(content, error); }
    cache.set(key, result);
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    return result;
  }

  async function embedMany(texts) {
    const contents = texts.map(text => String(text || '').slice(0, 24_000));
    if (!contents.length) return [];
    try {
      const vectors = await request(contents);
      return vectors.map(vector => ({ vector, model, semantic: true, error: null }));
    } catch (error) { return contents.map(content => lexicalFallback(content, error)); }
  }

  return { embed, embedMany, similarity: cosineSimilarity, model, health: () => ({ provider: 'Ollama local', model, fallback: 'lexical-hash-v1', cacheSize: cache.size }) };
}
