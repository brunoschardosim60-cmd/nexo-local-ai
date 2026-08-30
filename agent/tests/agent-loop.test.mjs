import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createCheckpointManager } from '../core/checkpoints.mjs';
import { createTaskGraph } from '../core/task-graph.mjs';
import { createDatabase } from '../memory/database.mjs';
import { createExecutor } from '../orchestrator/executor.mjs';
import { createAgentLoop } from '../orchestrator/agent-loop.mjs';
import { createPermissionManager } from '../safety/permissions.mjs';
import { createToolRegistry } from '../tools/registry.mjs';

test('persiste plano, pausa para aprovação e retoma até validar', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nexo-agent-test-'));
  const database = createDatabase(directory); let memorySaved = false; let flakyAttempts = 0;
  const registry = createToolRegistry([
    { name: 'inspect', description: 'inspeciona', risk: 'read', schema: {}, execute: async () => ({ files: ['app/page.tsx'] }) },
    { name: 'flaky_check', description: 'falha uma vez', risk: 'read', schema: {}, execute: async () => { flakyAttempts += 1; if (flakyAttempts === 1) throw new Error('falha transitória'); return { ok: true }; } },
    { name: 'write_fix', description: 'edita', risk: 'write', schema: {}, execute: async input => ({ path: input.path, bytes: 12 }) },
  ]);
  const permissionManager = createPermissionManager(database);
  const actions = [
    { tool: 'inspect', input: {}, reason: 'mapear', successCriteria: 'arquivos listados' },
    { tool: 'flaky_check', input: {}, reason: 'validar retry', successCriteria: 'passou' },
    { tool: 'write_fix', input: { path: 'fix.txt', content: 'corrigido' }, reason: 'corrigir', successCriteria: 'arquivo escrito' },
  ];
  const planner = {
    async createPlan() { return actions.map((_, index) => ({ id: `step-${index + 1}`, title: `Etapa ${index + 1}`, description: 'Teste controlado', status: 'pending' })); },
    async selectAction({ task }) { return actions[task.currentStep]; },
    async replan() { throw new Error('Não deveria replanejar após retry bem-sucedido.'); },
  };
  const logger = { info: async () => {}, warn: async () => {}, error: async () => {} };
  const executor = createExecutor({ registry, database, logger, maxOutput: 10_000 });
  const taskGraph = createTaskGraph(database); const checkpoints = createCheckpointManager(database, taskGraph);
  const evaluator = {
    evaluateTool(action, execution) { return { success: execution.ok, reason: execution.ok ? action.successCriteria : execution.error }; },
    async summarize() { return { validated: true, summary: 'Fluxo validado.', evidence: ['3 ferramentas concluídas'], remainingRisks: [] }; },
  };
  const loop = createAgentLoop({
    config: { limits: { maxSteps: 8, maxRetries: 2, maxTaskMinutes: 5 } }, database, registry, permissionManager, planner, executor, evaluator,
    memory: { search: () => [], remember: () => { memorySaved = true; } }, rag: { search: () => [] }, logger, taskGraph, checkpoints,
  });

  try {
    const paused = await loop.createTask('Teste controlado do loop persistente', { maxSteps: 8, maxRetries: 2 });
    assert.equal(paused.status, 'awaiting_approval');
    assert.equal(paused.toolRuns.length, 3);
    assert.equal(paused.graph.length, 3);
    assert.ok(paused.checkpoints.some(item => item.kind === 'permission'));
    assert.equal(flakyAttempts, 2);
    const permission = paused.permissions.find(item => item.status === 'pending');
    assert.ok(permission);
    const completed = await loop.decidePermission(paused.id, permission.id, 'approved');
    assert.equal(completed.status, 'completed');
    assert.equal(completed.result.validated, true);
    assert.equal(completed.plan.filter(step => step.status === 'completed').length, 3);
    assert.equal(memorySaved, true);
  } finally {
    database.db.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('DAG executa nós independentes em paralelo e espera dependências', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nexo-dag-test-')); const database = createDatabase(directory);
  let active = 0; let maximumConcurrency = 0; const completed = new Set();
  const registry = createToolRegistry([{
    name: 'parallel.read', description: 'leitura controlada', risk: 'read', schema: {},
    execute: async input => {
      active += 1; maximumConcurrency = Math.max(maximumConcurrency, active);
      await new Promise(resolve => setTimeout(resolve, input.delay || 5)); active -= 1; completed.add(input.id); return { id: input.id };
    },
  }]);
  const planner = {
    async createPlan() {
      return [
        { id: 'a', title: 'A', description: 'A', status: 'pending', dependencies: [] },
        { id: 'b', title: 'B', description: 'B', status: 'pending', dependencies: [] },
        { id: 'c', title: 'C', description: 'C', status: 'pending', dependencies: [] },
        { id: 'd', title: 'D', description: 'D', status: 'pending', dependencies: ['a', 'b', 'c'] },
      ];
    },
    async selectAction({ step }) {
      if (step.id === 'd') assert.deepEqual([...completed].sort((left, right) => left.localeCompare(right)), ['a', 'b', 'c']);
      return { tool: 'parallel.read', input: { id: step.id, delay: step.id === 'd' ? 1 : 60 }, reason: 'teste DAG', successCriteria: 'concluído' };
    },
    async replan() { return []; },
  };
  const logger = { info: async () => {}, warn: async () => {}, error: async () => {} }; const taskGraph = createTaskGraph(database);
  const loop = createAgentLoop({
    config: { limits: { maxSteps: 8, maxRetries: 0, maxTaskMinutes: 5 } }, database, registry, permissionManager: createPermissionManager(database), planner,
    executor: createExecutor({ registry, database, logger, maxOutput: 10_000 }),
    evaluator: { evaluateTool: (_, execution) => ({ success: execution.ok, reason: 'observado' }), async summarize() { return { validated: true, verdict: 'PASS', summary: 'DAG validado.', evidence: ['A, B e C antes de D'], remainingRisks: [] }; } },
    memory: { search: () => [], remember: () => {} }, rag: { search: () => [] }, logger, taskGraph, checkpoints: createCheckpointManager(database, taskGraph),
  });
  try {
    const task = await loop.createTask('Executar grafo paralelo completo', { maxSteps: 8, maxRetries: 0 });
    assert.equal(task.status, 'completed'); assert.equal(maximumConcurrency, 3); assert.equal(task.plan.every(step => step.status === 'completed'), true);
    assert.ok(task.events.some(event => event.type === 'dag.parallel_batch_completed'));
  } finally { database.db.close(); await rm(directory, { recursive: true, force: true }); }
});
