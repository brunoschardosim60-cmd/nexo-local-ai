import { readFile, stat } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import { defineTool } from '../tools/contracts.mjs';
import { RISK } from '../safety/policies.mjs';

function inside(workspace, input = '.') { const root = resolve(workspace, input); if (root !== workspace && !root.startsWith(`${workspace}${sep}`)) throw new Error('Projeto fora do workspace autorizado.'); return root; }
async function optionalText(path, limit = 80_000) { try { const info = await stat(path); if (!info.isFile() || info.size > limit) return null; return await readFile(path, 'utf8'); } catch { return null; } }

export function createProjectWorkspaceManager({ workspace, database, repository, sandbox }) {
  async function inspect({ path = '.', refresh = false } = {}) {
    const root = inside(workspace, path); const rootRelative = relative(workspace, root) || '.';
    const [map, packageText, instructions] = await Promise.all([repository.build(rootRelative, { refresh }), optionalText(join(root, 'package.json')), optionalText(join(root, 'NEXO.md'))]);
    let manifest = {}; try { manifest = packageText ? JSON.parse(packageText) : {}; } catch { manifest = { invalid: true }; }
    const git = await sandbox.run({ command: 'git', args: ['status', '--short', '--branch'], cwd: rootRelative, timeout: 15_000 });
    const extensions = map.files.reduce((acc, file) => { acc[file.extension || '(none)'] = (acc[file.extension || '(none)'] || 0) + 1; return acc; }, {});
    const state = { root: rootRelative, packageManager: packageText ? 'npm' : null, scripts: manifest.scripts || {}, architecture: map.stats, routes: map.routes, languages: Object.entries(extensions).sort((a, b) => b[1] - a[1]).slice(0, 12), git: { available: git.exitCode === 0, summary: git.stdout.slice(0, 8_000) }, instructions: instructions ? { present: true, trust: 'UNTRUSTED_PROJECT_INSTRUCTIONS', path: relative(workspace, join(root, 'NEXO.md')), content: instructions.slice(0, 40_000) } : { present: false, trust: 'UNTRUSTED_PROJECT_INSTRUCTIONS' }, observedAt: new Date().toISOString(), fingerprint: map.fingerprint };
    return database.putProjectWorkspace({ root: rootRelative, name: manifest.name || basename(root), state, instructions: state.instructions });
  }
  function list() { return database.listProjectWorkspaces(); }
  const definitions = [
    defineTool({ name: 'workspace.inspect', description: 'Carrega estado persistente do projeto, arquitetura, scripts, Git e NEXO.md como instrução não confiável.', risk: RISK.READ, inputSchema: { type: 'object', additionalProperties: false, properties: { path: { type: 'string', maxLength: 1000 }, refresh: { type: 'boolean' } } }, execute: inspect }),
    defineTool({ name: 'workspace.list', description: 'Lista projetos já observados e seus estados persistentes.', risk: RISK.READ, inputSchema: { type: 'object', additionalProperties: false, properties: {} }, execute: list }),
  ];
  return { definitions, inspect, list, health: () => ({ persistent: true, projectInstructions: 'untrusted', gitBaseline: true, architectureMap: true }) };
}
