import assert from 'node:assert/strict';
import test from 'node:test';
import { createEvaluator } from '../orchestrator/evaluator.mjs';

const completedTask = {
  objective: 'Liste os módulos reais do agente.',
  plan: [{ id: 'step-1', title: 'Listar', description: 'Listar pasta', status: 'completed' }],
};

test('o resumo final usa os caminhos realmente observados', async () => {
  const evaluator = createEvaluator({});
  const result = await evaluator.summarize(completedTask, [{
    tool: 'list_files', status: 'completed',
    output: [
      { path: 'nexo-local-ai\\agent\\orchestrator', type: 'folder' },
      { path: 'nexo-local-ai\\agent\\memory', type: 'folder' },
      { path: 'nexo-local-ai\\agent\\tools', type: 'folder' },
    ],
  }]);

  assert.equal(result.validated, true);
  assert.equal(result.verdict, 'PASS');
  assert.match(result.summary, /orchestrator, memory, tools/);
  assert.doesNotMatch(result.summary, /agent\.js|config\.json|utils/);
  assert.deepEqual(result.evidence, [
    'Pasta: nexo-local-ai\\agent\\orchestrator',
    'Pasta: nexo-local-ai\\agent\\memory',
    'Pasta: nexo-local-ai\\agent\\tools',
  ]);
});

test('uma edição sem teste permanece com alerta', async () => {
  const evaluator = createEvaluator({});
  const result = await evaluator.summarize(completedTask, [{
    tool: 'write_file', status: 'completed', output: { path: 'app/page.tsx', bytes: 1200, backup: '.nexo-backups/1/app/page.tsx' },
  }]);

  assert.equal(result.validated, false);
  assert.equal(result.verdict, 'UNCERTAIN');
  assert.equal(result.remainingRisks.length, 1);
});

test('uma promessa de correção sem alteração observada falha', async () => {
  const evaluator = createEvaluator();
  const result = await evaluator.summarize({ ...completedTask, objective: 'Corrija o arquivo quebrado.' }, [{
    tool: 'filesystem.read', status: 'completed', output: { path: 'app/page.tsx', content: 'conteúdo' },
  }]);
  assert.equal(result.verdict, 'FAIL');
  assert.equal(result.validated, false);
  assert.ok(result.acceptanceCriteria.some(item => !item.met));
});

test('uma operação Google só passa com evidência real da tool MCP', async () => {
  const evaluator = createEvaluator();
  const task = { objective: 'Crie um evento no meu Google Calendar.', plan: [{ id: 'step-1', status: 'completed' }] };
  const failed = await evaluator.summarize(task, [{ tool: 'mcp.tools', status: 'completed', output: { serverId: 'google-workspace', tools: [] } }]);
  assert.equal(failed.verdict, 'FAIL');
  const passed = await evaluator.summarize(task, [{ tool: 'mcp.call', status: 'completed', output: { serverId: 'google-workspace', tool: 'calendar_create_event', risk: 'write', content: [{ type: 'text', text: 'created' }] } }]);
  assert.equal(passed.verdict, 'PASS');
  assert.match(passed.evidence.join(' '), /calendar_create_event/);
});
