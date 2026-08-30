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
  assert.equal(result.remainingRisks.length, 1);
});
