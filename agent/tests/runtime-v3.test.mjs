import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createDatabase } from '../memory/database.mjs';
import { createPersonalityEngine } from '../personality/engine.mjs';
import { compactHistory, routeIntent } from '../runtime/intent-router.mjs';
import { createNexoRuntime } from '../runtime/nexo-runtime.mjs';
import { normalizePortugueseOutput } from '../intelligence/response.mjs';

test('Intent Router separa INSTANT, FAST, DEEP e AGENT', () => {
  const now = new Date('2026-08-30T03:42:00-03:00');
  assert.equal(routeIntent({ question: 'que horas são?', now }).route, 'instant');
  assert.equal(routeIntent({ question: 'iai' }).route, 'fast');
  assert.equal(routeIntent({ question: 'Nexo, tá por aí?' }).reason, 'presença-casual');
  assert.equal(routeIntent({ question: 'explique em detalhes a arquitetura deste sistema' }).route, 'deep');
  assert.equal(routeIntent({ question: 'corrija os bugs do projeto e rode os testes' }).route, 'agent');
});

test('histórico é limitado por mensagens e caracteres', () => {
  const history = Array.from({ length: 20 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `m${index}-${'x'.repeat(500)}` }));
  const compact = compactHistory(history, { maxMessages: 4, maxChars: 900 });
  assert.equal(compact.length <= 4, true);
  assert.equal(compact.reduce((total, item) => total + item.content.length, 0) <= 900, true);
  assert.match(compact.at(-1).content, /^m19-/);
});

test('normalização de português pertence ao Runtime e corrige erros conhecidos', () => {
  assert.equal(normalizePortugueseOutput('Posso respondo. Sou capacidade para ajudar.'), 'Posso responder. Tenho capacidade para ajudar.');
  assert.equal(normalizePortugueseOutput('Oi! Como posso ajudar você hoje?'), 'Oi!');
  assert.equal(normalizePortugueseOutput('O que está passando pela sua cabeça hoje?'), 'Tô por aqui.');
  assert.equal(normalizePortugueseOutput('Oi, Bruno! Tudo ótimo, e você?'), 'Oi, Bruno! Tô por aqui.');
});

test('Personality Engine aprende preferência explícita, aplica limite de segurança e pode ser apagado', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nexo-personality-')); const database = createDatabase(directory);
  try {
    const personality = createPersonalityEngine(database);
    personality.observe('pode falar palavrão. seja mais informal', 'casual');
    assert.equal(personality.health().learnedTraits >= 2, true);
    assert.equal(personality.snapshot('casual').traits.profanity > 0.25, true);
    assert.equal(personality.snapshot('security').traits.profanity, 0);
    personality.observe('sem palavrão, pare de xingar', 'casual');
    assert.equal(database.listPersonalityTraits().find(item => item.trait === 'profanity').contradictionCount >= 1, true);
    personality.reset(); assert.equal(personality.health().learnedTraits, 0);
  } finally { database.db.close(); await rm(directory, { recursive: true, force: true }); }
});

test('Runtime carrega contexto progressivamente e usa o modelo capaz em DEEP', async () => {
  const calls = { memory: 0, rag: 0, research: 0 };
  const runtime = createNexoRuntime({
    config: { fastModel: 'fast:3b', capableModel: 'capable:7b' },
    memory: { search() { calls.memory += 1; return [{ content: 'Projeto medicina' }]; }, remember() {} },
    rag: { search() { calls.rag += 1; return []; } },
    router: {}, ollama: { warm: async model => ({ model, ready: true }) },
    research: { async search() { calls.research += 1; return { results: [] }; } },
    loop: { enqueueTask() { return { id: 'task-1' }; } },
    personality: { observe() {}, prompt() { return 'tom natural'; }, health() { return { adaptive: true }; } },
  });
  const fast = await runtime.prepare({ question: 'iai', history: [], effort: 'Médio' });
  assert.equal(fast.route, 'fast'); assert.equal(fast.model, 'fast:3b'); assert.equal(fast.options.stop.includes('Como posso'), true); assert.deepEqual(calls, { memory: 0, rag: 0, research: 0 });
  const memoryAnswer = await runtime.prepare({ question: 'qual é o meu projeto de medicina?', history: [], effort: 'Médio' });
  assert.equal(memoryAnswer.route, 'fast'); assert.equal(memoryAnswer.model, 'fast:3b'); assert.equal(calls.memory, 1); assert.equal(calls.rag, 0);
  assert.equal(memoryAnswer.contextStats.contextChars > 0, true);
  const deep = await runtime.prepare({ question: 'compare duas arquiteturas para uma API', history: [], effort: 'Alto' });
  assert.equal(deep.route, 'deep'); assert.equal(deep.model, 'capable:7b');
});
