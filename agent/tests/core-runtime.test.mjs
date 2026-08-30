import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createNexoCore } from '../core/nexo-core.mjs';
import { createTaskGraph } from '../core/task-graph.mjs';
import { createCheckpointManager } from '../core/checkpoints.mjs';
import { redactSecrets } from '../context/context-engine.mjs';
import { createRepositoryIntelligence } from '../context/repository-map.mjs';
import { createDatabase } from '../memory/database.mjs';
import { createSandbox } from '../safety/sandbox.mjs';
import { permissionPolicy } from '../safety/policies.mjs';
import { createFilesystemTools } from '../tools/filesystem.mjs';
import { createGitTools } from '../tools/git.mjs';
import { createToolRegistry } from '../tools/registry.mjs';

test('tools validam contrato e patch exige o hash observado', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nexo-tools-'));
  try {
    await writeFile(join(directory, 'sample.txt'), 'linha 1\nlinha 2\nlinha 3', 'utf8');
    const filesystem = createFilesystemTools(directory); const registry = createToolRegistry(filesystem.definitions);
    await assert.rejects(registry.execute('filesystem.read', {}), /obrigatório/);
    await assert.rejects(registry.execute('filesystem.read', { path: 'sample.txt', extra: true }), /não faz parte/);
    const observed = await registry.execute('filesystem.read', { path: 'sample.txt' });
    await assert.rejects(registry.execute('filesystem.patch', { path: 'sample.txt', startLine: 2, endLine: 2, expectedHash: '0'.repeat(64), replacement: 'nova linha' }), /mudou desde a leitura/);
    const patched = await registry.execute('filesystem.patch', { path: 'sample.txt', startLine: 2, endLine: 2, expectedHash: observed.sha256, replacement: 'nova linha' });
    assert.notEqual(patched.beforeHash, patched.afterHash); assert.equal(await readFile(join(directory, 'sample.txt'), 'utf8'), 'linha 1\nnova linha\nlinha 3');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Task Graph e checkpoints sobrevivem no SQLite', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nexo-graph-')); const database = createDatabase(directory);
  try {
    const task = database.createTask({ objective: 'Validar grafo persistente', maxSteps: 5, maxRetries: 1 }); const graph = createTaskGraph(database);
    graph.sync(task.id, [
      { id: 'step-1', title: 'Mapear', description: 'Mapear projeto', status: 'completed', dependencies: [] },
      { id: 'step-2', title: 'Validar', description: 'Validar projeto', status: 'pending', dependencies: ['step-1'] },
    ]);
    assert.deepEqual(graph.ready(task.id).map(node => node.id), ['step-2']); assert.equal(graph.validate(task.id).valid, true);
    const checkpoints = createCheckpointManager(database, graph); checkpoints.capture(task.id, 'plan', 'Grafo criado');
    assert.equal(checkpoints.latest(task.id).state.graph.length, 2);
  } finally { database.db.close(); await rm(directory, { recursive: true, force: true }); }
});

test('Repository Intelligence encontra símbolos, referências e Git', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nexo-repo-')); const dataDir = join(directory, 'data'); await mkdir(join(directory, 'src'));
  const database = createDatabase(dataDir);
  try {
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'sample', scripts: { test: 'node --test' } }), 'utf8');
    await writeFile(join(directory, 'src', 'user.ts'), "export function createUser(name: string) { return { name }; }\nexport const current = createUser('Nexo');\n", 'utf8');
    const repository = createRepositoryIntelligence({ workspace: directory, database }); const map = await repository.build('.');
    assert.equal(map.manifest.name, 'sample'); assert.equal((await repository.findSymbol('createUser')).length, 1); assert.equal((await repository.findReferences('createUser')).length, 2);
    const initialized = spawnSync('git', ['init'], { cwd: directory, windowsHide: true }); assert.equal(initialized.status, 0);
    const sandbox = createSandbox({ workspace: directory }); const registry = createToolRegistry(createGitTools(sandbox));
    const status = await registry.execute('git.status', {}); assert.equal(status.exitCode, 0); assert.match(status.stdout, /No commits yet|main|master/);
  } finally { database.db.close(); await rm(directory, { recursive: true, force: true }); }
});

test('executor local bloqueia escapes de caminho e processadores externos', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nexo-sandbox-'));
  try {
    const sandbox = createSandbox({ workspace: directory });
    await assert.rejects(sandbox.run({ command: 'rg', args: ['--pre=cmd', 'segredo', '.'] }), /Opção não permitida/);
    await assert.rejects(sandbox.run({ command: 'rg', args: ['segredo', '../fora'] }), /travessia/);
    await assert.rejects(sandbox.run({ command: 'node', args: ['--check', 'C:\\Windows\\System32\\drivers\\etc\\hosts'] }), /absolutos/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Nexo Core expõe runtime completo e remove segredos do contexto', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nexo-core-')); const dataDir = join(directory, 'data');
  const core = createNexoCore({ projectRoot: directory, workspace: directory, dataDir, autoResume: false });
  try {
    const health = core.health(); assert.equal(health.runtime, 'Nexo Core'); assert.equal(health.taskGraph, true); assert.equal(health.checkpoints, true);
    assert.ok(health.tools.some(tool => tool.name === 'filesystem.patch')); assert.ok(health.tools.some(tool => tool.name === 'repository.map')); assert.ok(health.tools.some(tool => tool.name === 'git.status'));
    core.memory.remember('Bruno prefere o tema violeta escuro.', { kind: 'user', confidence: 0.95, source: 'test' });
    assert.match(core.memory.search('preferência violeta', { limit: 1 })[0].content, /violeta/);
    assert.equal(redactSecrets('token=abcdefghijklmnop'), '[SEGREDO REMOVIDO]');
    assert.equal(permissionPolicy({ name: 'filesystem.read', risk: 'read' }, { path: '.ssh/id_rsa' }).decision, 'deny');
    assert.equal(permissionPolicy({ name: 'shell.run', risk: 'execute' }, { command: 'git', args: ['reset', '--hard'] }).decision, 'deny');
  } finally { core.close(); await rm(directory, { recursive: true, force: true }); }
});
