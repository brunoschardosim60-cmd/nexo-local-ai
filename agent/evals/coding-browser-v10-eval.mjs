import { createCodingAgent } from '../coding/coding-agent.mjs';
import { createGoalEngine } from '../goals/engine.mjs';
import { createPlanner } from '../orchestrator/planner.mjs';
import { createPlaywrightBrowserProvider } from '../browser/playwright-provider.mjs';

const cases = [];
function check(name, condition, evidence) {
  cases.push({ name, status: condition ? 'PASS' : 'FAIL', evidence });
}

const goal = createGoalEngine().create(
  'Corrija o bug visual do site, rode os testes e confira no navegador.',
);
const criteria = goal.acceptanceCriteria
  .map((item) => item.criterion)
  .join(' | ');
check('goal:architecture-first', /arquitetura/i.test(criteria), criteria);
check('goal:observable-change', /diff ou artefato/i.test(criteria), criteria);
check('goal:code-validation', /valida[cç][aã]o/i.test(criteria), criteria);
check('goal:real-browser', /navegador real/i.test(criteria), criteria);
check('goal:final-comparison', /objetivo original/i.test(criteria), criteria);

const sandboxRuns = [];
const coding = createCodingAgent({
  repository: {
    build: async () => ({
      root: '/project',
      stats: { files: 8 },
      manifest: {
        scripts: { test: 'node --test', lint: 'oxlint', build: 'vite build' },
      },
      routes: ['/'],
    }),
    findSymbol: async (symbol) => [{ symbol, file: 'src/app.ts', line: 7 }],
  },
  sandbox: {
    run: async ({ command, args }) => {
      sandboxRuns.push([command, ...args].join(' '));
      return {
        exitCode: args.includes('lint') ? 1 : 0,
        stdout: '',
        stderr: args.includes('lint') ? 'lint failure' : '',
      };
    },
  },
});
const inspection = await coding.inspect({ symbol: 'renderApp' });
check(
  'coding:manifest-test',
  inspection.recommendedChecks.includes('test'),
  inspection.recommendedChecks,
);
check(
  'coding:manifest-lint',
  inspection.recommendedChecks.includes('lint'),
  inspection.recommendedChecks,
);
check(
  'coding:manifest-build',
  inspection.recommendedChecks.includes('build'),
  inspection.recommendedChecks,
);
check(
  'coding:symbol-context',
  inspection.symbols.length === 1,
  inspection.symbols,
);
const successful = await coding.validate({ checks: ['test'] });
check('coding:test-success', successful.valid === true, successful);
const stopped = await coding.validate({ checks: ['test', 'lint', 'build'] });
check(
  'coding:stop-on-first-failure',
  stopped.valid === false &&
    stopped.results.length === 2 &&
    !sandboxRuns.includes('npm run build'),
  stopped,
);
let unknownRejected = false;
try {
  await coding.validate({ checks: ['deploy'] });
} catch {
  unknownRejected = true;
}
check(
  'coding:unknown-check-refused',
  unknownRejected,
  'deploy não pertence à allowlist',
);

const planner = createPlanner({
  ollama: {
    json: async () => {
      throw new Error('modelo indisponível no eval determinístico');
    },
  },
  router: {
    route: () => ({
      model: 'eval',
      analysis: { difficulty: { level: 'low' } },
    }),
  },
  specialists: { suggest: () => 'coding', prompt: () => '', list: () => [] },
});
const plan = await planner.createPlan({
  objective: 'Corrija o layout responsivo do site e valide no navegador',
  tools: [],
  context: {},
});
const planText = plan
  .map((step) => `${step.title}: ${step.description}`)
  .join(' | ');
check('plan:maps-repository', /Mapear o projeto/i.test(planText), planText);
check(
  'plan:diagnoses-before-edit',
  plan.findIndex((step) => /Diagnosticar/i.test(step.title)) <
    plan.findIndex((step) => /corre[cç][aã]o/i.test(step.title)),
  planText,
);
check('plan:validates-code', /Execute os testes/i.test(planText), planText);
check(
  'plan:uses-real-browser',
  plan.some(
    (step) =>
      step.assignedAgent === 'browser' &&
      /DOM.*console.*rede/i.test(step.description),
  ),
  planText,
);
check(
  'plan:reviews-evidence',
  /evidência do navegador/i.test(planText),
  planText,
);

const browser = createPlaywrightBrowserProvider({
  workspace: process.cwd(),
  database: {},
  research: {},
  browserPath: null,
});
const definitions = new Map(
  browser.definitions.map((tool) => [tool.name, tool]),
);
check('browser:observe-contract', definitions.has('browser.observe'), [
  ...definitions.keys(),
]);
check('browser:screenshot-contract', definitions.has('browser.screenshot'), [
  ...definitions.keys(),
]);
check(
  'browser:sensitive-input-contract',
  definitions.get('browser.type')?.inputSchema?.properties?.sensitive?.type ===
    'boolean',
  definitions.get('browser.type')?.inputSchema,
);

const passed = cases.filter((item) => item.status === 'PASS').length;
const report = {
  suite: 'Nexo coding + browser reliability gates',
  scope:
    '20 gates determinísticos de arquitetura, validação, planejamento e contratos; não substitui uma taxa de resolução autônoma medida com modelo local',
  passed,
  failed: cases.length - passed,
  total: cases.length,
  score: Number((passed / cases.length).toFixed(3)),
  cases,
};
console.log(JSON.stringify(report, null, 2));
if (report.failed) process.exitCode = 1;
