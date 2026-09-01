import assert from 'node:assert/strict';
import test from 'node:test';
import { adaptiveCorrectionBudget } from '../orchestrator/adaptive-budgets.mjs';
import { validateTaskLimits } from '../safety/policies.mjs';

test('orçamento de correção cresce com dificuldade sem desperdiçar tentativas simples', () => {
  const easy = adaptiveCorrectionBudget({ difficulty: 'low', effort: 'Extra alto' });
  const medium = adaptiveCorrectionBudget({ difficulty: 'medium', effort: 'Médio' });
  const hard = adaptiveCorrectionBudget({ difficulty: 'high', effort: 'Extra alto' });
  assert.deepEqual(easy, { difficulty: 'low', maxRetries: 0, maxSelfCorrections: 1 });
  assert.ok(medium.maxRetries > easy.maxRetries);
  assert.ok(hard.maxRetries > medium.maxRetries);
  assert.ok(hard.maxSelfCorrections > medium.maxSelfCorrections);
});

test('limites preservam zero explícito e permitem teto adaptativo separado do padrão', () => {
  const defaults = { maxSteps: 8, maxRetries: 2, maxRetryLimit: 4, maxSelfCorrections: 3, maxSelfCorrectionLimit: 5, maxToolCalls: 20, maxModelCalls: 20, maxTaskMinutes: 5, maxCost: 0 };
  const easy = validateTaskLimits({ maxRetries: 0, maxSelfCorrections: 1 }, defaults);
  const hard = validateTaskLimits({ maxRetries: 4, maxSelfCorrections: 5 }, defaults);
  assert.equal(easy.maxRetries, 0);
  assert.equal(easy.maxSelfCorrections, 1);
  assert.equal(hard.maxRetries, 4);
  assert.equal(hard.maxSelfCorrections, 5);
});
