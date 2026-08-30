import { extname, relative } from 'node:path';
import { readFile, stat } from 'node:fs/promises';

const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.json', '.csv', '.js', '.jsx', '.mjs', '.ts', '.tsx', '.py', '.html', '.css', '.xml', '.yaml', '.yml', '.sql']);

function chunks(content, size = 1400, overlap = 180) {
  const output = []; let start = 0;
  while (start < content.length) { const text = content.slice(start, start + size); output.push(text); start += Math.max(1, size - overlap); }
  return output;
}

export function createRag({ database, workspace, filesystem, embeddings }) {
  return {
    async indexText(source, content, metadata = {}) {
      if (typeof content !== 'string' || !content.trim()) throw new Error('Documento vazio.');
      const texts = chunks(content.slice(0, 2_000_000));
      const vectors = await embeddings.embedMany(texts);
      const records = texts.map((text, index) => ({ index, content: text, vector: vectors[index].vector, vectorModel: vectors[index].model, metadata: { source, chars: text.length, semantic: vectors[index].semantic, ...metadata } }));
      database.replaceDocumentChunks(String(source).slice(0, 500), records);
      return { source, chunks: records.length };
    },
    async indexFiles(paths) {
      const indexed = [];
      for (const inputPath of paths.slice(0, 100)) {
        const target = filesystem.safePath(inputPath); const info = await stat(target);
        if (!info.isFile() || info.size > 2_000_000 || !TEXT_EXTENSIONS.has(extname(target).toLowerCase())) continue;
        const source = relative(workspace, target); const content = await readFile(target, 'utf8');
        const texts = chunks(content); const vectors = await embeddings.embedMany(texts);
        const records = texts.map((text, index) => ({ index, content: text, vector: vectors[index].vector, vectorModel: vectors[index].model, metadata: { source, chars: text.length, semantic: vectors[index].semantic } }));
        database.replaceDocumentChunks(source, records); indexed.push({ source, chunks: records.length });
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
      return { engine: 'semantic-rag-v2', embeddingModel: embeddings.model, chunks: items.length, semantic: items.filter(item => item.vectorModel === embeddings.model).length, legacy: items.filter(item => item.vectorModel !== embeddings.model).length };
    },
  };
}
