import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createNexoCore } from '../index.mjs';
import { permissionPolicy } from '../safety/policies.mjs';

const directory = await mkdtemp(join(tmpdir(), 'nexo-eval-'));
const cases = [];
function evaluate(name, condition, detail) { cases.push({ name, passed: Boolean(condition), detail }); }

const core = createNexoCore({ projectRoot: resolve('.'), workspace: resolve('..'), dataDir: directory, autoResume: false, autoStartScheduler: false, browserPath: null });
try {
  await core.skills.ready(); const health = core.health();
  evaluate('tool-registry', health.tools.length >= 34, `${health.tools.length} tools tipadas`);
  evaluate('skill-retrieval', core.skills.match('corrigir bugs e executar testes').some(skill => skill.name === 'coding-agent'), `${core.skills.health().enabled} skills ativas`);
  evaluate('specialist-routing', core.specialists.suggest('pesquise artigos e fontes') === 'research', 'pesquisa → research');
  evaluate('protected-path', permissionPolicy({ name: 'filesystem.read', risk: 'read' }, { path: '.env.local' }).decision === 'deny', 'segredo negado');
  evaluate('network-approval', permissionPolicy({ name: 'research.search', risk: 'network' }, { url: 'https://example.com' }).decision === 'ask', 'rede exige aprovação');
  evaluate('background-persistence', core.scheduler.schedule({ name: 'Eval', objective: 'Verifique o estado do projeto', delaySeconds: 60 }).status === 'active', 'job persistido');
  evaluate('capability-health', Boolean(health.capabilities?.browser && health.capabilities?.mcp && health.capabilities?.events), 'capacidades observáveis');
  evaluate('multi-agent', health.capabilities?.multiAgent?.maxParallel === 4, 'até quatro subtarefas paralelas');
} finally { core.close(); await rm(directory, { recursive: true, force: true }); }

const passed = cases.filter(item => item.passed).length; const score = Math.round((passed / cases.length) * 100);
console.log(JSON.stringify({ suite: 'nexo-runtime', score, passed, total: cases.length, cases }, null, 2));
if (passed !== cases.length) process.exitCode = 1;
