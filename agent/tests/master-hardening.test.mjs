import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ERROR_CATEGORY, NexoError } from '../contracts/errors.mjs';
import { capabilityError } from '../extensions/contracts.mjs';
import { classifyFailure, recoveryPolicy } from '../orchestrator/errors.mjs';
import { createEvaluator } from '../orchestrator/evaluator.mjs';
import { permissionPolicy } from '../safety/policies.mjs';
import { createSandbox } from '../safety/sandbox.mjs';

test('orchestrator e extensions usam o mesmo contrato estruturado de erro', () => {
  const error = capabilityError('RATE_LIMIT', 'Muitas chamadas.', { provider: 'demo' });
  assert.ok(error instanceof NexoError);
  assert.deepEqual(error.toJSON(), {
    code: 'CAPABILITY_RATE_LIMIT', category: ERROR_CATEGORY.TRANSIENT,
    message: 'Muitas chamadas.', recoverable: true, retryAfter: null,
    details: { provider: 'demo' },
  });
  assert.equal(classifyFailure(error), ERROR_CATEGORY.TRANSIENT);
  assert.equal(recoveryPolicy(error.category, 0).action, 'retry-with-backoff');
});

test('auth, permissão, capability ausente e falha definitiva não recebem retry cego', () => {
  assert.equal(classifyFailure('token 401 inválido'), ERROR_CATEGORY.AUTH);
  assert.equal(classifyFailure('provider indisponível'), ERROR_CATEGORY.MISSING_CAPABILITY);
  assert.equal(recoveryPolicy(ERROR_CATEGORY.AUTH, 0).retry, false);
  assert.equal(recoveryPolicy(ERROR_CATEGORY.PERMISSION, 0).retry, false);
  assert.equal(recoveryPolicy(ERROR_CATEGORY.DEFINITIVE, 0).retry, false);
});

test('política bloqueia secrets e comandos destrutivos antes de aprovação', () => {
  const readTool = { name: 'filesystem.read', risk: 'read' };
  assert.equal(permissionPolicy(readTool, { path: '.env.local' }).decision, 'deny');
  assert.equal(permissionPolicy(readTool, { path: '.ssh/id_ed25519' }).decision, 'deny');
  assert.equal(permissionPolicy({ name: 'shell.run', risk: 'execute' }, { command: 'git', args: ['reset', '--hard'] }).decision, 'deny');
});

test('sandbox rejeita travessia e metacaracteres sem criar processo', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'nexo-hardening-'));
  const sandbox = createSandbox({ workspace });
  try {
    await assert.rejects(() => sandbox.run({ command: 'rg', args: ['segredo', '../'] }), /travessia/);
    await assert.rejects(() => sandbox.run({ command: 'rg', args: ['x; whoami', '.'] }), /shell/);
    await assert.rejects(() => sandbox.run({ command: 'powershell', args: ['whoami'] }), /não permitido/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('verifier recusa sucesso falso de teste e artefato de mídia ausente', async () => {
  const evaluator = createEvaluator();
  assert.equal(evaluator.evaluateTool({ tool: 'shell.run' }, { ok: true, output: { command: 'npm test', exitCode: 1, stderr: 'failed' } }).success, false);
  const result = await evaluator.summarize({
    objective: 'Gere uma imagem real do projeto.',
    plan: [{ id: 'one', status: 'completed' }],
  }, [{ tool: 'filesystem.read', status: 'completed', output: { path: 'README.md', content: 'ok' } }]);
  assert.equal(result.verdict, 'FAIL');
  assert.ok(result.acceptanceCriteria.some(item => /mídia real/.test(item.criterion) && !item.met));
});

