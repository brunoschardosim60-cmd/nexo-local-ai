import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createEventBus } from '../events/event-bus.mjs';
import { createDatabase } from '../memory/database.mjs';
import { inferPersonalMode } from '../personal/modes.mjs';
import { createProactivityEngine } from '../personal/proactivity.mjs';
import { createPersonalStore } from '../personal/store.mjs';
import { createStudyEngine } from '../personal/study-engine.mjs';
import { createPersonalWorkEngine } from '../personal/work-engine.mjs';

async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), 'nexo-v7-')); const database = createDatabase(directory);
  const eventBus = createEventBus({ database, logger: { info: async () => {} } }); const store = createPersonalStore(database);
  const continuity = { async build() { return { sessionId: 'main', previous: null }; } }; const projectWorkspaces = { list() { return []; } };
  const work = createPersonalWorkEngine({ store, database, continuity, eventBus, projectWorkspaces });
  const remembered = []; const memory = { async remember(content, options) { remembered.push({ content, options }); return `m-${remembered.length}`; } };
  const study = createStudyEngine({ store, memory, eventBus }); const proactivity = createProactivityEngine({ store, eventBus });
  try { await run({ database, eventBus, store, work, study, proactivity, remembered }); } finally { proactivity.close(); database.db.close(); await rm(directory, { recursive: true, force: true }); }
}

test('Goal Manager persiste estados, marcos editáveis e progresso por critérios', () => fixture(async ({ store, work }) => {
  const goal = store.createGoal({ title: 'Aprender JavaScript', status: 'ACTIVE', priority: 5 });
  const planned = work.decompose(goal.id); assert.equal(planned.milestones.length, 6); assert.equal(planned.milestones[0].editable, true);
  const task = store.createTask({ title: 'Praticar DOM', goalId: goal.id, status: 'DONE' }); const updated = work.updateGoalProgress(goal.id);
  assert.equal(store.getTask(task.id).status, 'DONE'); assert.ok(updated.progress > 0); assert.equal(updated.evidence.at(-1).source, 'criteria');
}));

test('Priority Engine considera prazo, importância, esforço, dependências e bloqueio', () => fixture(async ({ store, work }) => {
  const urgent = store.createTask({ title: 'Entrega urgente', priority: 5, deadline: new Date(Date.now() + 86_400_000).toISOString(), estimatedMinutes: 30 });
  const later = store.createTask({ title: 'Tarefa futura', priority: 2, deadline: new Date(Date.now() + 30 * 86_400_000).toISOString(), estimatedMinutes: 480 });
  const blocked = store.createTask({ title: 'Tarefa bloqueada', priority: 5, status: 'BLOCKED', dependencies: [later.id] });
  const ranked = work.rankTasks(); assert.equal(ranked[0].id, urgent.id); assert.ok(work.priorityFor(blocked, [urgent, later, blocked]).parts.blocked < 0);
}));

test('Daily Context e Smart Resume usam somente estado persistido e evidências', () => fixture(async ({ store, work, database }) => {
  store.createGoal({ title: 'Publicar Nexo', status: 'ACTIVE' }); store.createTask({ title: 'Rodar build', status: 'IN_PROGRESS' });
  const daily = work.dailyContext(new Date(), { persist: true }); assert.equal(daily.activeGoals.length, 1); assert.equal(daily.pendingTasks.length, 1); assert.ok(daily.evidence.goalIds.length);
  database.createTask({ objective: 'Revisar aplicação', maxSteps: 4, maxRetries: 0 }); const resumed = await work.smartResume({ scope: 'project:.' }); assert.ok(resumed.lastObjective || resumed.pending.length);
}));

test('proatividade é opt-in, deduplica e respeita precisão, foco e orçamento', () => fixture(async ({ store, eventBus, proactivity }) => {
  assert.equal(store.getSettings().proactivityLevel, 'OFF'); await eventBus.publish('test.failed', { project: 'Nexo' }, { source: 'tests' }); await new Promise(resolve => setImmediate(resolve)); assert.equal(store.listSuggestions().length, 0);
  store.updateSettings({ proactivityLevel: 'LOW', notificationsEnabled: true, interruptionBudget: { maxPerDay: 1, minMinutesBetween: 90 } });
  const event = await eventBus.publish('test.failed', { project: 'Nexo' }, { source: 'tests' }); await proactivity.consider(event); assert.equal(store.listSuggestions().length, 1);
  await proactivity.consider(event); assert.equal(store.listSuggestions().length, 1); assert.equal(proactivity.deliver({ limit: 3 }).items.length, 1); assert.equal(proactivity.deliver({ limit: 3 }).items.length, 0);
  store.updateSettings({ focusMode: true }); assert.equal(proactivity.deliver().reason, 'focus-mode');
}));

test('proatividade aprende com sugestões descartadas e atendidas', () => fixture(async ({ store, proactivity }) => {
  const baseRule = { pattern: 'goal.stalled', importance: 0.7, confidence: 0.8 };
  const record = (status, index) => {
    const suggestion = store.putSuggestion({
      kind: 'stale', title: `Objetivo parado ${index}`, message: 'Sem avanço recente.',
      importance: 0.7, confidence: 0.8, reason: 'feedback de teste', source: 'goal.stalled',
      sourceEventId: `evt-${status}-${index}`, action: { command: 'resume-goal' }, dedupeKey: `${status}-${index}`,
    });
    store.updateSuggestion(suggestion.id, status);
  };
  for (let index = 0; index < 5; index += 1) record('DISMISSED', index);
  const discouraged = proactivity.learnedRule(baseRule);
  assert.equal(discouraged.learning.samples, 5);
  assert.ok(discouraged.learning.adjustment < 0);
  assert.ok(discouraged.importance < baseRule.importance);

  for (let index = 0; index < 12; index += 1) record('ACTED', index);
  const encouraged = proactivity.learnedRule(baseRule);
  assert.ok(encouraged.learning.engagement > 0.5);
  assert.ok(encouraged.importance > baseRule.importance);
}));

test('ACT exige confirmação explícita e capabilities limitadas', () => fixture(async ({ proactivity }) => {
  assert.throws(() => proactivity.createTrigger({ name: 'Rodar testes', eventPattern: 'project.changed', action: { objective: 'npm test' }, policy: 'ACT' }), /confirmação explícita/);
  const trigger = proactivity.createTrigger({ name: 'Rodar testes', eventPattern: 'project.changed', action: { objective: 'npm test' }, policy: 'ACT', userConfirmed: true, conditions: { userApproved: true }, capabilities: ['code.validate'] }); assert.equal(trigger.policy, 'ACT');
}));

test('Study Engine mede tentativa real, detecta lacuna, gera recall e pistas sem spoiler', () => fixture(async ({ store, study, remembered }) => {
  store.updateSettings({ spacedRepetitionEnabled: true, tutorMode: 'CHALLENGE', dontSpoil: true }); const concept = study.recordConcept({ name: 'Promises', scope: 'learning:js', dependencies: ['funções'] });
  const result = await study.recordAttempt({ conceptId: concept.id, scope: 'learning:js', score: 0.25, mistakes: ['Usei await fora de async'], questions: ['q1', 'q2'] });
  assert.match(result.misconception, /assíncrono/); assert.ok(result.nextReviewAt); assert.equal(remembered.length, 1);
  assert.equal(study.recallQuestions({ conceptId: concept.id, count: 4 }).length, 4); assert.equal(study.hint({ conceptId: concept.id, level: 2 }).spoiler, false); assert.equal(study.instruction().mode, 'CHALLENGE');
}));

test('controles validam antes de persistir e limpam áreas isoladamente', () => fixture(async ({ store }) => {
  assert.throws(() => store.updateSettings({ proactivityLevel: 'INVALID' }), /inválido/); assert.equal(store.getSettings().proactivityLevel, 'OFF');
  store.createGoal({ title: 'Objetivo local' }); store.createTask({ title: 'Tarefa preservada' }); store.putSuggestion({ kind: 'info', title: 'Aviso', message: 'Teste', importance: 1, confidence: 1, reason: 'eval', source: 'test', sourceEventId: 'evt', action: { command: 'open' }, dedupeKey: 'eval' });
  store.clearActivity(); assert.equal(store.listSuggestions({ status: null }).length, 0); assert.equal(store.listGoals().length, 1); assert.equal(store.listTasks().length, 1);
}));

test('modos contextuais inferem trabalho, criatividade, estudo e foco com override', () => {
  assert.equal(inferPersonalMode({ question: 'rode os testes e valide o projeto' }).mode, 'WORK'); assert.equal(inferPersonalMode({ question: 'vamos criar ideias e variações visuais' }).mode, 'CREATIVE'); assert.equal(inferPersonalMode({ question: 'me ensine JavaScript para a prova' }).mode, 'STUDY'); assert.equal(inferPersonalMode({ question: 'olá', settings: { focusMode: true } }).mode, 'FOCUS'); assert.equal(inferPersonalMode({ question: 'teste', override: 'STUDY' }).source, 'override');
});
