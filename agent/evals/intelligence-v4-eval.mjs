import { createAgentConfig } from '../config.mjs';
import { createModelRouter } from '../models/router.mjs';
import { intelligenceV4Cases } from './intelligence-v4-dataset.mjs';

const LEVEL = { low: 0, medium: 1, high: 2 };
const router = createModelRouter(createAgentConfig());

function evaluate(item) {
  const analysis = router.analyze({ objective: item.prompt, purpose: 'response' }); const expected = item.expectation;
  const checks = [
    expected.domain ? analysis.domain === expected.domain : true,
    expected.needsTools == null ? true : analysis.needsTools === expected.needsTools,
    expected.needsLongContext == null ? true : analysis.needsLongContext === expected.needsLongContext,
    expected.minimumDifficulty ? LEVEL[analysis.difficulty.level] >= LEVEL[expected.minimumDifficulty] : true,
    expected.maximumDifficulty ? LEVEL[analysis.difficulty.level] <= LEVEL[expected.maximumDifficulty] : true,
  ];
  return { ...item, passed: checks.every(Boolean), observed: { domain: analysis.domain, difficulty: analysis.difficulty.level, needsTools: analysis.needsTools, needsLongContext: analysis.needsLongContext } };
}

const results = intelligenceV4Cases.map(evaluate);
const categories = Object.fromEntries([...new Set(results.map(item => item.category))].map(category => {
  const group = results.filter(item => item.category === category); const passed = group.filter(item => item.passed).length;
  return [category, { passed, total: group.length, score: Number((passed / group.length).toFixed(3)) }];
}));
const passed = results.filter(item => item.passed).length;
const report = {
  suite: 'Nexo Intelligence V4 readiness', scope: 'roteamento determinístico e sinais de contexto; não mede sozinho a qualidade generativa do modelo',
  cases: results.length, passed, failed: results.length - passed, score: Number((passed / results.length).toFixed(3)), categories,
  failures: results.filter(item => !item.passed).slice(0, 30).map(item => ({ id: item.id, category: item.category, expected: item.expectation, observed: item.observed })),
};
console.log(JSON.stringify(report, null, 2));
if (report.failed) process.exitCode = 1;
