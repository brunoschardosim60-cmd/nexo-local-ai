import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConversationStateEngine } from '../conversation/conversation-state.mjs';
import { evaluateConversationResponse } from '../intelligence/response.mjs';
import { createDatabase } from '../memory/database.mjs';
import { classifyConversationContext } from '../runtime/intent-router.mjs';
import { conversationCases } from './conversation-v10-dataset.mjs';

const root = await mkdtemp(join(tmpdir(), 'nexo-conversation-eval-'));
const database = createDatabase(root);
const engine = createConversationStateEngine(database);
const results = [];
const latencies = [];

try {
  for (const scenario of conversationCases) {
    const history = []; let turn = null; const responseChecks = [];
    for (const exchange of scenario.exchanges) {
      const started = performance.now();
      turn = engine.observeTurn({
        sessionId: scenario.id,
        question: exchange.user,
        history,
        profile: { relationshipId: scenario.id },
        context: classifyConversationContext(exchange.user),
      });
      latencies.push(performance.now() - started);
      const quality = evaluateConversationResponse(exchange.assistant, { context: turn.state.tone, state: turn.state, question: exchange.user });
      responseChecks.push(quality.pass);
      engine.completeTurn({ sessionId: scenario.id, content: exchange.assistant, historyLength: history.length });
      history.push({ role: 'user', content: exchange.user }, { role: 'assistant', content: exchange.assistant });
    }
    const properties = {
      turnCount: history.length >= 5 && history.length <= 20,
      canonicalIdentity: turn.state.assistantCanonicalName === 'Nexo',
      compactPrompt: turn.prompt.length < 4_000,
      identityInPrompt: /Nome canônico: Nexo/.test(turn.prompt),
      scenarioExpectation: Boolean(scenario.expect(turn.state)),
      responseSanity: responseChecks.every(Boolean),
    };
    const failed = Object.entries(properties).filter(([, pass]) => !pass).map(([key]) => key);
    results.push({ id: scenario.id, category: scenario.category, pass: failed.length === 0, failed, properties });
  }
} finally {
  database.db.close();
  await rm(root, { recursive: true, force: true });
}

const sortedLatencies = latencies.sort((a, b) => a - b);
const passed = results.filter(item => item.pass).length;
const categories = Object.fromEntries([...new Set(results.map(item => item.category))].map(category => {
  const group = results.filter(item => item.category === category);
  return [category, { passed: group.filter(item => item.pass).length, total: group.length }];
}));
const report = {
  suite: 'nexo-conversation-intelligence-v10',
  scenarios: results.length,
  turns: results.length * 6,
  passed,
  failed: results.length - passed,
  score: Number((passed / results.length * 100).toFixed(1)),
  categories,
  workingStateLatencyMs: {
    median: Number(sortedLatencies[Math.floor(sortedLatencies.length / 2)].toFixed(3)),
    p95: Number(sortedLatencies[Math.floor(sortedLatencies.length * 0.95)].toFixed(3)),
  },
  failures: results.filter(item => !item.pass),
};
console.log(JSON.stringify(report, null, 2));
if (passed !== results.length) process.exitCode = 1;
