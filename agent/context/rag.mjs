import { extname, relative } from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.json', '.csv', '.js', '.jsx', '.mjs', '.ts', '.tsx', '.py', '.html', '.css', '.xml', '.yaml', '.yml', '.sql']);

function hash(content) { return createHash('sha256').update(content).digest('hex'); }
function chunks(content, size = 1400, overlap = 180) {
  const blocks = String(content).split(/(?=^#{1,6}\s|^```|^(?:export\s+)?(?:async\s+)?function\s+|^(?:export\s+)?class\s+|^\s*$)/gm).filter(Boolean);
  const output = []; let current = '';
  for (const block of blocks) { if (current && current.length + block.length > size) { output.push(current.trim()); current = `${current.slice(-overlap)}\n${block}`; } else current += block; }
  if (current.trim()) output.push(current.trim());
  return output.flatMap(text => text.length <= size * 2 ? [text] : Array.from({ length: Math.ceil(text.length / (size - overlap)) }, (_, index) => text.slice(index * (size - overlap), index * (size - overlap) + size))).filter(Boolean);
}

export function createRag({ database, workspace, filesystem, embeddings }) {
  return {
    async indexText(source, content, metadata = {}) {
      if (typeof content !== 'string' || !content.trim()) throw new Error('Documento vazio.');
      const sourceKey = String(source).slice(0, 500); const contentHash = hash(content); const previous = database.getDocumentSource(sourceKey);
      if (previous?.contentHash === contentHash && previous.embeddingModel === embeddings.model) return { source, chunks: 0, skipped: true, reason: 'unchanged' };
      const texts = chunks(content.slice(0, 2_000_000));
      const vectors = await embeddings.embedMany(texts);
      const records = texts.map((text, index) => ({ index, content: text, vector: vectors[index].vector, vectorModel: vectors[index].model, metadata: { source, chars: text.length, semantic: vectors[index].semantic, ...metadata } }));
      database.replaceDocumentChunks(sourceKey, records);
      database.putDocumentSource({ source: sourceKey, contentHash, size: content.length, sourceVersion: metadata.version || null, embeddingModel: vectors[0]?.model || embeddings.model, metadata });
      return { source, chunks: records.length, skipped: false, contentHash };
    },
    async indexFiles(paths) {
      const indexed = [];
      for (const inputPath of paths.slice(0, 100)) {
        const target = filesystem.safePath(inputPath); const info = await stat(target);
        if (!info.isFile() || info.size > 2_000_000 || !TEXT_EXTENSIONS.has(extname(target).toLowerCase())) continue;
        const source = relative(workspace, target); const content = await readFile(target, 'utf8'); const contentHash = hash(content); const previous = database.getDocumentSource(source);
        if (previous?.contentHash === contentHash && previous.embeddingModel === embeddings.model && previous.mtimeMs === info.mtimeMs) { indexed.push({ source, chunks: 0, skipped: true }); continue; }
        const texts = chunks(content); const vectors = await embeddings.embedMany(texts);
        const records = texts.map((text, index) => ({ index, content: text, vector: vectors[index].vector, vectorModel: vectors[index].model, metadata: { source, chars: text.length, semantic: vectors[index].semantic } }));
        database.replaceDocumentChunks(source, records); database.putDocumentSource({ source, contentHash, mtimeMs: info.mtimeMs, size: info.size, sourceVersion: `${info.mtimeMs}:${info.size}`, embeddingModel: vectors[0]?.model || embeddings.model, metadata: { extension: extname(target).toLowerCase() } }); indexed.push({ source, chunks: records.length, skipped: false });
      }
      return indexed;
    },
    async search(query, limit = 8) {
      const queryEmbedding = await embeddings.embed(query);
      const lexical = new Map(database.searchDocumentChunksText(query, 100).map((item, index) => [item.id, 1 - index / 100]));
      return database.listDocumentChunks().map(item => {
        const semantic = item.vectorModel === queryEmbedding.model ? embeddings.similarity(queryEmbedding.vector, item.vector) : 0;
        return { ...item, score: semantic * 0.82 + (lexical.get(item.id) || 0) * 0.18, semanticScore: semantic };
      })
        .sort((left, right) => right.score - left.score).slice(0, limit);
    },
    async migrate(limit = 2000) {
      const legacy = database.listDocumentChunks(limit).filter(item => item.vectorModel !== embeddings.model);
      const vectors = await embeddings.embedMany(legacy.map(item => item.content)); let migrated = 0;
      legacy.forEach((item, index) => { const embedded = vectors[index]; if (embedded?.semantic) { database.updateDocumentChunkVector(item.id, embedded.vector, embedded.model); migrated += 1; } });
      return { migrated, pending: Math.max(0, legacy.length - migrated) };
    },
    health() {
      const items = database.listDocumentChunks();
      return { engine: 'incremental-semantic-rag-v3', embeddingModel: embeddings.model, chunks: items.length, semantic: items.filter(item => item.vectorModel === embeddings.model).length, legacy: items.filter(item => item.vectorModel !== embeddings.model).length, smartChunks: true, contentHashing: true };
    },
  };
}
