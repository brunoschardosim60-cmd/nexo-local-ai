import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createBackgroundScheduler } from '../background/scheduler.mjs';
import { createBrowserAgent, pngSize } from '../browser/browser-agent.mjs';
import { createEventBus } from '../events/event-bus.mjs';
import { createMcpManager } from '../mcp/client.mjs';
import { createDatabase } from '../memory/database.mjs';
import { assertSafeUrl, createResearchAgent } from '../research/research-agent.mjs';
import { permissionPolicy } from '../safety/policies.mjs';
import { createSkillEngine } from '../skills/skill-engine.mjs';
import { createMultiAgentCoordinator } from '../specialists/coordinator.mjs';
import { createSpecialistRegistry } from '../specialists/registry.mjs';

test('Research Agent normaliza fontes e bloqueia SSRF', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ query: { search: [{ title: 'Nexo', snippet: '<b>Assistente</b> local', timestamp: '2026-01-01T00:00:00Z' }] } }), { status: 200, headers: { 'content-type': 'application/json' } });
  const research = createResearchAgent({ fetchImpl });
  const result = await research.search({ query: 'Nexo', sources: ['wikipedia'], limit: 2 });
  assert.equal(result.results[0].source, 'wikipedia'); assert.equal(result.results[0].snippet, 'Assistente local'); assert.match(result.results[0].url, /wikipedia/);
  await assert.rejects(() => assertSafeUrl('http://127.0.0.1/admin'), /privados|localhost/);
  await assert.rejects(() => assertSafeUrl('file:///etc/passwd'), /HTTP/);
});

test('Skills locais são descobertas, recuperadas e desativadas persistentemente', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nexo-skills-')); const root = join(directory, 'skills'); await mkdir(join(root, 'coding'), { recursive: true });
  await writeFile(join(root, 'coding', 'SKILL.md'), '---\nname: test-coding\ndescription: programação bugs testes\n---\n\nLeia antes de editar.\n', 'utf8');
  const database = createDatabase(join(directory, 'state'));
  try {
    const skills = createSkillEngine({ roots: [root], database }); await skills.ready();
    assert.equal(skills.list().length, 1); assert.equal(skills.match('corrigir bugs de programação')[0].name, 'test-coding');
    skills.setEnabled('test-coding', false); assert.equal(skills.match('programação bugs').length, 0);
    const second = createSkillEngine({ roots: [root], database }); await second.ready(); assert.equal(second.list()[0].enabled, false);
  } finally { database.db.close(); await rm(directory, { recursive: true, force: true }); }
});

test('scheduler persiste, dispara e publica eventos', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nexo-jobs-')); const database = createDatabase(join(directory, 'state'));
  try {
    const eventBus = createEventBus({ database, logger: { info: async () => undefined } }); const scheduler = createBackgroundScheduler({ database, eventBus, autoStart: false });
    scheduler.setExecutor(objective => ({ id: `task-${objective.length}` })); const job = scheduler.schedule({ name: 'Checagem', objective: 'Verifique o projeto local', delaySeconds: 0 });
    const runs = await scheduler.tick(new Date(Date.now() + 100)); const stored = database.getBackgroundJob(job.id);
    assert.equal(runs.length, 1); assert.equal(stored.status, 'completed'); assert.equal(stored.runCount, 1); assert.ok(database.listRuntimeEvents({ type: 'background.dispatched' }).length);
    scheduler.close();
  } finally { database.db.close(); await rm(directory, { recursive: true, force: true }); }
});

test('Browser Agent mantém sessão e verifica screenshot estruturalmente', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nexo-browser-')); const database = createDatabase(join(directory, 'state'));
  try {
    const research = { fetchPage: async url => ({ url, title: 'Página de teste', text: 'conteúdo', excerpt: 'conteúdo', links: [{ text: 'Próxima', url: 'https://example.com/next' }] }) };
    const browser = createBrowserAgent({ workspace: directory, database, research, browserPath: null });
    const opened = await browser.openPage({ url: 'https://example.com' }); const followed = await browser.follow({ sessionId: opened.sessionId, linkIndex: 0 }); assert.equal(followed.url, 'https://example.com/next');
    const png = Buffer.alloc(2200); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png); png.writeUInt32BE(1440, 16); png.writeUInt32BE(900, 20);
    await writeFile(join(directory, 'preview.png'), png); assert.deepEqual(pngSize(png), { width: 1440, height: 900 });
    const verified = await browser.inspectScreenshot({ path: 'preview.png', expectedWidth: 1440, expectedHeight: 900 }); assert.equal(verified.valid, true);
  } finally { database.db.close(); await rm(directory, { recursive: true, force: true }); }
});

test('cliente MCP stdio negocia, descobre e chama tools', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nexo-mcp-')); const serverPath = join(directory, 'server.mjs'); const configPath = join(directory, 'mcp.json');
  const source = `import readline from 'node:readline';\nconst lines=readline.createInterface({input:process.stdin});\nlines.on('line',line=>{const m=JSON.parse(line);if(m.method==='notifications/initialized')return;let result={};if(m.method==='initialize')result={protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'test',version:'1'}};if(m.method==='tools/list')result={tools:[{name:'echo',description:'eco',inputSchema:{type:'object'}}]};if(m.method==='tools/call')result={content:[{type:'text',text:String(m.params.arguments.value)}],structuredContent:{echo:m.params.arguments.value}};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');});\n`;
  await writeFile(serverPath, source, 'utf8'); await writeFile(configPath, JSON.stringify({ servers: [{ id: 'test', command: process.execPath, args: [serverPath], cwd: '.' }] }), 'utf8');
  const mcp = createMcpManager({ workspace: directory, configPath });
  try { const tools = await mcp.listTools('test'); assert.equal(tools.tools[0].name, 'echo'); const called = await mcp.callTool({ serverId: 'test', tool: 'echo', arguments: { value: 'Nexo' } }); assert.deepEqual(called.structuredContent, { echo: 'Nexo' }); }
  finally { await mcp.close(); await rm(directory, { recursive: true, force: true }); }
});

test('especialistas selecionam função sem conceder novas permissões', () => {
  const specialists = createSpecialistRegistry(); assert.equal(specialists.suggest('pesquise artigos e fontes'), 'research'); assert.equal(specialists.suggest('corrija o bug e rode testes'), 'coding'); assert.match(specialists.prompt('browser'), /permissões/);
  assert.equal(permissionPolicy({ name: 'filesystem.read', risk: 'read' }, { path: '.env.local' }).decision, 'deny');
});

test('coordenador delega subtarefas com vínculo e especialista', () => {
  const delegated = []; const coordinator = createMultiAgentCoordinator({ database: { listChildTasks: () => [] }, eventBus: { publish: async () => undefined }, maxParallel: 4 });
  coordinator.setLoop({ enqueueTask(objective, options) { delegated.push({ objective, options }); return { id: `child-${delegated.length}-0000`, objective, status: 'planning', assignedAgent: options.assignedAgent }; }, getTask: () => null });
  const result = coordinator.delegate({ tasks: [{ objective: 'Pesquisar fontes públicas', specialist: 'research' }, { objective: 'Revisar os módulos locais', specialist: 'coding' }] }, { taskId: 'parent-task-0000' });
  assert.equal(result.parallel, true); assert.equal(result.children.length, 2); assert.equal(delegated[0].options.parentTaskId, 'parent-task-0000'); assert.equal(delegated[1].options.assignedAgent, 'coding');
});

test('migração adiciona vínculo multi-agent sem apagar tarefas antigas', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nexo-migration-')); const state = join(directory, 'state'); await mkdir(state, { recursive: true });
  const legacy = new DatabaseSync(join(state, 'nexo.db'));
  legacy.exec(`CREATE TABLE tasks (id TEXT PRIMARY KEY, objective TEXT NOT NULL, status TEXT NOT NULL, plan_json TEXT NOT NULL DEFAULT '[]', current_step INTEGER NOT NULL DEFAULT 0, steps_used INTEGER NOT NULL DEFAULT 0, max_steps INTEGER NOT NULL, max_retries INTEGER NOT NULL, result_json TEXT, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT)`); legacy.close();
  const database = createDatabase(state);
  try { const columns = new Set(database.db.prepare('PRAGMA table_info(tasks)').all().map(column => column.name)); assert.ok(columns.has('parent_task_id')); assert.ok(columns.has('assigned_agent')); }
  finally { database.db.close(); await rm(directory, { recursive: true, force: true }); }
});
