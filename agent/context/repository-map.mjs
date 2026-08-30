import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { defineTool } from '../tools/contracts.mjs';

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.py', '.html', '.css', '.sql']);
const IGNORED = new Set(['node_modules', '.git', '.next', '.vinext', 'dist', 'out', 'coverage', '.wrangler', 'data', '.nexo-backups']);
const SECRET_NAMES = /^(?:\.env(?:\..*)?|id_rsa|id_ed25519|credentials(?:\.json)?|secrets?\..*)$/i;

function ensureInside(workspace, input = '.') {
  const target = resolve(workspace, input);
  if (target !== workspace && !target.startsWith(`${workspace}${sep}`)) throw new Error('Repositório fora da área permitida.');
  return target;
}

function extractSymbols(content, path) {
  const symbols = []; const lines = content.split(/\r?\n/);
  const patterns = [
    ['function', /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g],
    ['class', /\b(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/g],
    ['interface', /\b(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/g],
    ['type', /\b(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/g],
    ['variable', /\b(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g],
    ['python-function', /^\s*(?:async\s+)?def\s+([A-Za-z_][\w]*)\s*\(/gm],
    ['python-class', /^\s*class\s+([A-Za-z_][\w]*)\s*[:(]/gm],
  ];
  for (const [kind, pattern] of patterns) {
    for (const match of content.matchAll(pattern)) {
      const line = content.slice(0, match.index).split(/\r?\n/).length;
      symbols.push({ name: match[1], kind, path, line });
    }
  }
  const imports = [...content.matchAll(/(?:from\s+|require\s*\(\s*)['"]([^'"]+)['"]/g)].map(match => match[1]).slice(0, 200);
  const exports = [...content.matchAll(/\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|type|interface)?\s*([A-Za-z_$][\w$]*)?/g)].map(match => match[1] || 'default').slice(0, 200);
  const route = /(^|[\\/])app[\\/].*[\\/](?:page|route)\.(?:js|jsx|ts|tsx)$/.test(path) ? path.replace(/^.*?app[\\/]?/, '/').replace(/[\\/](?:page|route)\.(?:js|jsx|ts|tsx)$/, '').replace(/\\/g, '/') || '/' : null;
  return { symbols, imports, exports, route, lines: lines.length };
}

export function createRepositoryIntelligence({ workspace, database }) {
  let recent = null;
  async function inventory(rootInput = '.') {
    const root = ensureInside(workspace, rootInput); const files = [];
    async function walk(folder) {
      if (files.length >= 4000) return;
      const entries = await readdir(folder, { withFileTypes: true });
      for (const entry of entries) {
        if (files.length >= 4000 || IGNORED.has(entry.name) || SECRET_NAMES.test(entry.name)) continue;
        const absolute = join(folder, entry.name);
        if (entry.isDirectory()) await walk(absolute);
        else {
          const info = await stat(absolute);
          files.push({ absolute, path: relative(workspace, absolute), size: info.size, mtimeMs: Math.trunc(info.mtimeMs), extension: extname(entry.name).toLowerCase() });
        }
      }
    }
    await walk(root); return { root, files };
  }

  async function build(rootInput = '.', { refresh = false } = {}) {
    const requestedRoot = relative(workspace, ensureInside(workspace, rootInput)) || '.';
    if (!refresh && recent?.root === requestedRoot && Date.now() - recent.at < 15_000) return { ...recent.map, cached: true };
    const { root, files } = await inventory(rootInput);
    const fingerprint = createHash('sha256').update(files.map(file => `${file.path}:${file.size}:${file.mtimeMs}`).join('|')).digest('hex');
    const rootKey = relative(workspace, root) || '.'; const cached = database.getRepositoryMap(rootKey);
    if (!refresh && cached?.fingerprint === fingerprint) { recent = { root: rootKey, at: Date.now(), map: cached.map }; return { ...cached.map, cached: true }; }
    const entries = []; const symbols = []; const routes = []; const relations = [];
    for (const file of files) {
      const entry = { path: file.path, size: file.size, extension: file.extension, imports: [], exports: [], symbols: [], lines: null };
      if (SOURCE_EXTENSIONS.has(file.extension) && file.size <= 750_000) {
        try {
          const content = await readFile(file.absolute, 'utf8'); const extracted = extractSymbols(content, file.path);
          entry.imports = extracted.imports; entry.exports = extracted.exports; entry.symbols = extracted.symbols.map(symbol => symbol.name); entry.lines = extracted.lines;
          symbols.push(...extracted.symbols); if (extracted.route) routes.push({ route: extracted.route, path: file.path });
          for (const dependency of extracted.imports) relations.push({ from: file.path, type: 'imports', to: dependency });
        } catch { /* arquivo ilegível é mantido apenas no inventário */ }
      }
      entries.push(entry);
    }
    let manifest = null;
    const packageFile = files.find(file => /(^|[\\/])package\.json$/.test(file.path));
    if (packageFile) try {
      const parsed = JSON.parse(await readFile(packageFile.absolute, 'utf8'));
      manifest = { path: packageFile.path, name: parsed.name || null, scripts: parsed.scripts || {}, dependencies: Object.keys(parsed.dependencies || {}), devDependencies: Object.keys(parsed.devDependencies || {}) };
    } catch { /* package.json inválido */ }
    const map = { root: rootKey, fingerprint, generatedAt: new Date().toISOString(), files: entries, symbols, routes, relations, manifest, stats: { files: entries.length, sourceFiles: entries.filter(file => SOURCE_EXTENSIONS.has(file.extension)).length, symbols: symbols.length, routes: routes.length } };
    database.putRepositoryMap(rootKey, fingerprint, map); recent = { root: rootKey, at: Date.now(), map }; return { ...map, cached: false };
  }

  async function findSymbol(query, root = '.') {
    const map = await build(root); const needle = String(query).toLowerCase();
    return map.symbols.filter(symbol => symbol.name.toLowerCase().includes(needle)).slice(0, 100);
  }

  async function findReferences(symbol, rootInput = '.') {
    const { files } = await inventory(rootInput); const pattern = new RegExp(`\\b${String(symbol).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`); const results = [];
    for (const file of files) {
      if (results.length >= 150 || !SOURCE_EXTENSIONS.has(file.extension) || file.size > 750_000) continue;
      try {
        const lines = (await readFile(file.absolute, 'utf8')).split(/\r?\n/);
        lines.forEach((line, index) => { if (results.length < 150 && pattern.test(line)) results.push({ path: file.path, line: index + 1, text: line.trim().slice(0, 500) }); });
      } catch { /* ignorar */ }
    }
    return results;
  }

  return {
    build, findSymbol, findReferences,
    tools: [
      defineTool({
        name: 'repository.map', description: 'Cria ou recupera o mapa estrutural do repositório: arquivos, símbolos, imports, rotas e scripts.', risk: 'read',
        inputSchema: { type: 'object', properties: { path: { type: 'string', maxLength: 1000 }, refresh: { type: 'boolean' } }, additionalProperties: false },
        execute: input => build(input.path || '.', { refresh: Boolean(input.refresh) }),
      }),
      defineTool({
        name: 'code.find_symbol', description: 'Localiza declarações de funções, classes, tipos, interfaces e componentes pelo nome.', risk: 'read',
        inputSchema: { type: 'object', properties: { query: { type: 'string', minLength: 1, maxLength: 200 }, path: { type: 'string', maxLength: 1000 } }, required: ['query'], additionalProperties: false },
        execute: input => findSymbol(input.query, input.path || '.'),
      }),
      defineTool({
        name: 'code.find_references', description: 'Encontra referências textuais exatas de um símbolo no repositório.', risk: 'read',
        inputSchema: { type: 'object', properties: { symbol: { type: 'string', minLength: 1, maxLength: 200 }, path: { type: 'string', maxLength: 1000 } }, required: ['symbol'], additionalProperties: false },
        execute: input => findReferences(input.symbol, input.path || '.'),
      }),
    ],
  };
}
