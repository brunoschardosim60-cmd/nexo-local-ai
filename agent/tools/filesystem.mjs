import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { defineTool } from './contracts.mjs';

const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.json', '.csv', '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.py', '.html', '.css', '.scss', '.xml', '.yaml', '.yml', '.toml', '.ini', '.sql', '.sh', '.ps1']);
const IGNORED = new Set(['node_modules', '.git', '.next', '.vinext', 'dist', '.wrangler', 'data']);

export function createFilesystemTools(workspace) {
  const hash = content => createHash('sha256').update(content).digest('hex');
  function safePath(input = '.') {
    const target = resolve(workspace, input);
    if (target !== workspace && !target.startsWith(`${workspace}${sep}`)) throw new Error('Caminho fora da área permitida.');
    return target;
  }
  async function walk(folder, output, limit) {
    if (output.length >= limit) return;
    const entries = await readdir(folder, { withFileTypes: true });
    for (const entry of entries) {
      if (output.length >= limit || IGNORED.has(entry.name)) continue;
      const absolute = join(folder, entry.name);
      if (entry.isDirectory()) await walk(absolute, output, limit);
      else output.push(absolute);
    }
  }
  return {
    safePath,
    definitions: [
      defineTool({
        name: 'filesystem.list', aliases: ['list_files'], description: 'Lista arquivos e pastas de um diretório.', risk: 'read',
        inputSchema: { type: 'object', properties: { path: { type: 'string', maxLength: 1000 } }, additionalProperties: false },
        execute: async input => {
          const target = safePath(input.path || '.');
          const entries = await readdir(target, { withFileTypes: true });
          return Promise.all(entries.filter(entry => !IGNORED.has(entry.name)).slice(0, 300).map(async entry => {
            const absolute = join(target, entry.name); const info = entry.isFile() ? await stat(absolute) : null;
            return { path: relative(workspace, absolute), type: entry.isDirectory() ? 'folder' : 'file', size: info?.size ?? null };
          }));
        },
      }),
      defineTool({
        name: 'filesystem.read', aliases: ['read_file'], description: 'Lê um arquivo de texto ou código e retorna seu hash SHA-256.', risk: 'read',
        inputSchema: { type: 'object', properties: { path: { type: 'string', minLength: 1, maxLength: 1000 } }, required: ['path'], additionalProperties: false },
        execute: async input => {
          const target = safePath(input.path); const info = await stat(target);
          if (!info.isFile() || info.size > 1_500_000 || !TEXT_EXTENSIONS.has(extname(target).toLowerCase())) throw new Error('Arquivo inválido, binário ou maior que 1,5 MB.');
          const content = await readFile(target, 'utf8');
          return { path: relative(workspace, target), content, sha256: hash(content) };
        },
      }),
      defineTool({
        name: 'filesystem.search', aliases: ['search_text'], description: 'Pesquisa texto em arquivos do projeto.', risk: 'read',
        inputSchema: { type: 'object', properties: { query: { type: 'string', minLength: 2, maxLength: 500 }, path: { type: 'string', maxLength: 1000 }, maxResults: { type: 'integer', minimum: 1, maximum: 200 } }, required: ['query'], additionalProperties: false },
        execute: async input => {
          const query = String(input.query || '').toLowerCase(); if (query.length < 2) throw new Error('Consulta muito curta.');
          const files = []; await walk(safePath(input.path || '.'), files, 1200); const matches = [];
          for (const file of files) {
            if (!TEXT_EXTENSIONS.has(extname(file).toLowerCase())) continue;
            let content; try { const info = await stat(file); if (info.size > 500_000) continue; content = await readFile(file, 'utf8'); } catch { continue; }
            const lines = content.split(/\r?\n/);
            for (let index = 0; index < lines.length; index += 1) if (lines[index].toLowerCase().includes(query)) matches.push({ path: relative(workspace, file), line: index + 1, text: lines[index].trim().slice(0, 500) });
            if (matches.length >= Math.min(Number(input.maxResults) || 80, 200)) break;
          }
          return matches;
        },
      }),
      defineTool({
        name: 'filesystem.write', aliases: ['write_file'], description: 'Cria ou substitui um arquivo de texto, fazendo backup quando necessário.', risk: 'write',
        inputSchema: { type: 'object', properties: { path: { type: 'string', minLength: 1, maxLength: 1000 }, content: { type: 'string', maxLength: 1_500_000 } }, required: ['path', 'content'], additionalProperties: false },
        execute: async input => {
          if (typeof input.content !== 'string' || input.content.length > 1_500_000) throw new Error('Conteúdo inválido ou muito grande.');
          const target = safePath(input.path); if (!TEXT_EXTENSIONS.has(extname(target).toLowerCase())) throw new Error('Extensão não permitida.');
          await mkdir(dirname(target), { recursive: true }); let backup = null;
          try { const info = await stat(target); if (info.isFile()) { backup = safePath(join('.nexo-backups', String(Date.now()), relative(workspace, target))); await mkdir(dirname(backup), { recursive: true }); await copyFile(target, backup); } } catch { /* novo arquivo */ }
          await writeFile(target, input.content, 'utf8');
          return { path: relative(workspace, target), bytes: Buffer.byteLength(input.content), backup: backup ? relative(workspace, backup) : null };
        },
      }),
      defineTool({
        name: 'filesystem.patch', description: 'Substitui um intervalo de linhas somente se o hash do arquivo ainda for o esperado.', risk: 'write',
        inputSchema: { type: 'object', properties: {
          path: { type: 'string', minLength: 1, maxLength: 1000 }, startLine: { type: 'integer', minimum: 1 }, endLine: { type: 'integer', minimum: 1 },
          expectedHash: { type: 'string', pattern: '^[a-fA-F0-9]{64}$' }, replacement: { type: 'string', maxLength: 500_000 },
        }, required: ['path', 'startLine', 'endLine', 'expectedHash', 'replacement'], additionalProperties: false },
        execute: async input => {
          const target = safePath(input.path); const info = await stat(target);
          if (!info.isFile() || info.size > 1_500_000 || !TEXT_EXTENSIONS.has(extname(target).toLowerCase())) throw new Error('Arquivo inválido para patch.');
          const content = await readFile(target, 'utf8'); const beforeHash = hash(content);
          if (beforeHash !== input.expectedHash.toLowerCase()) throw new Error('O arquivo mudou desde a leitura; releia antes de aplicar o patch.');
          const eol = content.includes('\r\n') ? '\r\n' : '\n'; const lines = content.split(/\r?\n/);
          if (input.startLine > input.endLine || input.endLine > lines.length) throw new Error('Intervalo de linhas inválido.');
          const next = [...lines.slice(0, input.startLine - 1), ...input.replacement.split(/\r?\n/), ...lines.slice(input.endLine)].join(eol);
          const backup = safePath(join('.nexo-backups', String(Date.now()), relative(workspace, target)));
          await mkdir(dirname(backup), { recursive: true }); await copyFile(target, backup); await writeFile(target, next, 'utf8');
          return { path: relative(workspace, target), startLine: input.startLine, endLine: input.endLine, beforeHash, afterHash: hash(next), backup: relative(workspace, backup) };
        },
      }),
      defineTool({
        name: 'filesystem.mkdir', aliases: ['create_folder'], description: 'Cria uma pasta dentro do workspace.', risk: 'write',
        inputSchema: { type: 'object', properties: { path: { type: 'string', minLength: 1, maxLength: 1000 } }, required: ['path'], additionalProperties: false },
        execute: async input => { const target = safePath(input.path); await mkdir(target, { recursive: true }); return { path: relative(workspace, target) }; },
      }),
    ],
  };
}
