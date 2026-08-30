import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ERROR_CATEGORY } from '../contracts/errors.mjs';
import { normalizePortugueseOutput } from '../intelligence/response.mjs';
import { createEvaluator } from '../orchestrator/evaluator.mjs';
import { classifyFailure, recoveryPolicy } from '../orchestrator/errors.mjs';
import { routeIntent } from '../runtime/intent-router.mjs';
import { permissionPolicy } from '../safety/policies.mjs';
import { createSandbox } from '../safety/sandbox.mjs';

const cases = [];
const check = (name, pass, evidence) => cases.push({ name, status: pass ? 'PASS' : 'FAIL', evidence });

const now = new Date('2026-08-30T23:33:00-03:00');
const time = routeIntent({ question: 'perguntei apenas o horário', now });
check('golden:instant-time', time.route === 'instant' && time.answer === 'Agora são **23:33**.', time);
check('golden:casual-fast', routeIntent({ question: 'fala bb' }).route === 'fast', routeIntent({ question: 'fala bb' }));
check('golden:deep-effort', routeIntent({ question: 'compare as opções', effort: 'Alto' }).route === 'deep', routeIntent({ question: 'compare as opções', effort: 'Alto' }));
check('golden:coding-agent', routeIntent({ question: 'corrija os bugs do projeto e rode os testes' }).route === 'agent', routeIntent({ question: 'corrija os bugs do projeto e rode os testes' }));
check('golden:memory-selective', routeIntent({ question: 'você lembra do que eu prefiro?' }).needs.memory, routeIntent({ question: 'você lembra do que eu prefiro?' }));
check('golden:security-context', routeIntent({ question: 'analise esta vulnerabilidade de token' }).context === 'security', routeIntent({ question: 'analise esta vulnerabilidade de token' }));
check('golden:secret-deny', permissionPolicy({ name: 'filesystem.read', risk: 'read' }, { path: '.env.production' }).decision === 'deny', '.env.production');
check('golden:destructive-deny', permissionPolicy({ name: 'shell.run', risk: 'execute' }, { command: 'git', args: ['reset', '--hard'] }).decision === 'deny', 'git reset --hard');
check('golden:error-contract', classifyFailure('rate limit 429') === ERROR_CATEGORY.TRANSIENT && recoveryPolicy(ERROR_CATEGORY.TRANSIENT, 0).retry, classifyFailure('rate limit 429'));
check('golden:language', normalizePortugueseOutput('Como posso eu ajudar? Posso respondo.') === 'Como posso ajudar? Posso responder.', normalizePortugueseOutput('Como posso eu ajudar? Posso respondo.'));

const evaluator = createEvaluator();
const falseMutation = await evaluator.summarize({ objective: 'Corrija o arquivo quebrado.', plan: [{ id: 'one', status: 'completed' }] }, [{ tool: 'filesystem.read', status: 'completed', output: { path: 'app.ts', content: 'x' } }]);
check('golden:false-success-mutation', falseMutation.verdict === 'FAIL', falseMutation.verdict);
const falseMedia = await evaluator.summarize({ objective: 'Gere uma imagem real.', plan: [{ id: 'one', status: 'completed' }] }, [{ tool: 'filesystem.read', status: 'completed', output: { path: 'prompt.txt', content: 'x' } }]);
check('golden:false-success-media', falseMedia.verdict === 'FAIL', falseMedia.verdict);

const workspace = await mkdtemp(join(tmpdir(), 'nexo-master-golden-'));
try {
  const sandbox = createSandbox({ workspace });
  let traversalBlocked = false;
  try { await sandbox.run({ command: 'rg', args: ['secret', '../'] }); } catch { traversalBlocked = true; }
  check('golden:path-traversal', traversalBlocked, '../');
} finally {
  await rm(workspace, { recursive: true, force: true });
}

const passed = cases.filter(item => item.status === 'PASS').length;
console.log(JSON.stringify({
  suite: 'Nexo master golden',
  scope: 'control-plane golden tasks; does not claim generative model quality',
  passed,
  failed: cases.length - passed,
  total: cases.length,
  score: Math.round((passed / cases.length) * 100),
  cases,
}, null, 2));
if (passed !== cases.length) process.exitCode = 1;

