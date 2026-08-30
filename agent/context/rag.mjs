import { extname, relative } from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { cosineSimilarity, embedText } from '../memory/embeddings.mjs';

const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.json', '.csv', '.js', '.jsx', '.mjs', '.ts', '.tsx', '.py', '.html', '.css', '.xml', '.yaml', '.yml', '.sql']);

function chunks(content, size = 1400, overlap = 180) {
  const output = []; let start = 0;
  while (start < content.length) { const text = content.slice(start, start + size); output.push(text); start += Math.max(1, size - overlap); }
  return output;
}

export function createRag({ database, workspace, filesystem }) {
  return {
    indexText(source, content, metadata = {}) {
      if (typeof content !== 'string' || !content.trim()) throw new Error('Documento vazio.');
      const records = chunks(content.slice(0, 2_000_000)).map((text, index) => ({ index, content: text, vector: embedText(text), metadata: { source, chars: text.length, ...metadata } }));
      database.replaceDocumentChunks(String(source).slice(0, 500), records);
      return { source, chunks: records.length };
    },
    async indexFiles(paths) {
      const indexed = [];
      for (const inputPath of paths.slice(0, 100)) {
        const target = filesystem.safePath(inputPath); const info = await stat(target);
        if (!info.isFile() || info.size > 2_000_000 || !TEXT_EXTENSIONS.has(extname(target).toLowerCase())) continue;
        const source = relative(workspace, target); const content = await readFile(target, 'utf8');
        const records = chunks(content).map((text, index) => ({ index, content: text, vector: embedText(text), metadata: { source, chars: text.length } }));
        database.replaceDocumentChunks(source, records); indexed.push({ source, chunks: records.length });
      }
      return indexed;
    },
    search(query, limit = 8) {
      const queryVector = embedText(query);
      const lexical = new Map(database.searchDocumentChunksText(query, 100).map((item, index) => [item.id, 1 - index / 100]));
      return database.listDocumentChunks().map(item => ({ ...item, score: cosineSimilarity(queryVector, item.vector) * 0.82 + (lexical.get(item.id) || 0) * 0.18 }))
        .sort((left, right) => right.score - left.score).slice(0, limit);
    },
  };
}
