import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createContextEngine } from '../context/context-engine.mjs';
import { createDatabase } from '../memory/database.mjs';
import { createLongTermMemory } from '../memory/long-term.mjs';
import { createSemanticEmbeddings } from '../memory/semantic-embeddings.mjs';
import { createModelRouter } from '../models/router.mjs';
import { createCritic } from '../orchestrator/critic.mjs';

const config = { fastModel: 'small', capableModel: 'large', coderModel: 'coder', reasoningModel: 'reasoner', visionModel: 'vision', embeddingModel: 'embeddinggemma' };

test('Model Router V2 classifica domínio, dificuldade e ferramentas', () => {
  const router = createModelRouter(config);
  const coding = router.route({ objective: 'Analise o projeto inteiro, encontre o bug da API, corrija os arquivos e rode os testes.', purpose: 'response' });
  assert.equal(coding.analysis.domain, 'coding');
  assert.equal(coding.analysis.difficulty.level, 'high');
  assert.equal(coding.analysis.needsTools, true);
  assert.equal(coding.model, 'coder');
  assert.equal(router.route({ objective: 'oi', purpose: 'response' }).model, 'small');
  assert.equal(router.route({ objective: 'Faça OCR desta imagem', purpose: 'vision' }).model, 'vision');
});

test('Model Router V2 usa benchmark local com amostra suficiente', () => {
  const database = { listModelBenchmarks: domain => domain === 'coding' ? [
    { model: 'coder', domain, score: 0.62, sampleCount: 30, medianLatencyMs: 9000 },
    { model: 'small', domain, score: 0.81, sampleCount: 30, medianLatencyMs: 1200 },
  ] : [] };
  const route = createModelRouter(config, database).route({ objective: 'corrija o bug no codigo', purpose: 'response' });
  assert.equal(route.model, 'small');
  assert.equal(route.source, 'benchmarks');
});

test('embeddings semânticos usam Ollama local e mantêm fallback lexical', async () => {
  const ok = createSemanticEmbeddings({ ollamaUrl: 'http://local', model: 'embeddinggemma', fetchImpl: async (_url, options) => {
    const { input } = JSON.parse(options.body); const texts = Array.isArray(input) ? input : [input];
    return new Response(JSON.stringify({ embeddings: texts.map(text => String(text).includes('gato') ? [1, 0] : [0, 1]) }), { status: 200 });
  } });
  assert.deepEqual((await ok.embed('gato')).vector, [1, 0]);
  assert.equal((await ok.embed('gato')).semantic, true);
  const fallback = createSemanticEmbeddings({ fetchImpl: async () => new Response('', { status: 503 }) });
  assert.equal((await fallback.embed('texto')).model, 'lexical-hash-v1');
});

test('memória recupera significado, registra modelo e aplica reranking', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nexo-v4-memory-')); const database = createDatabase(directory);
  const embeddings = {
    model: 'semantic-test',
    similarity: (left, right) => left.reduce((sum, value, index) => sum + value * right[index], 0),
    async embed(text) { return { vector: /gato|felino|animal domestico/i.test(text) ? [1, 0] : [0, 1], model: 'semantic-test', semantic: true }; },
    async embedMany(texts) { return Promise.all(texts.map(text => this.embed(text))); },
  };
  try {
    const memory = createLongTermMemory(database, embeddings);
    await memory.remember('Bruno adotou um gato chamado Nino.', { importance: 0.8, confidence: 0.9 });
    await memory.remember('A interface usa a cor violeta.', { importance: 0.8, confidence: 0.9 });
    const result = await memory.search('Qual é o felino do Bruno?', { limit: 1 });
    assert.match(result[0].content, /Nino/);
    assert.equal(memory.health().semantic, 2);
  } finally { database.db.close(); await rm(directory, { recursive: true, force: true }); }
});

test('Context Engine V2 carrega apenas as fontes necessárias', async () => {
  const calls = { memory: 0, rag: 0, repository: 0 };
  const engine = createContextEngine({
    memory: { async search() { calls.memory += 1; return []; } }, rag: { async search() { calls.rag += 1; return []; } },
    repository: { async build() { calls.repository += 1; return { files: [], routes: [], stats: {}, manifest: null }; } },
    router: createModelRouter(config), maxTokens: 1000,
  });
  const casual = await engine.build({ objective: 'oi' });
  assert.deepEqual(calls, { memory: 0, rag: 0, repository: 0 });
  assert.equal(casual.selection.domain, 'chat');
  await engine.build({ objective: 'Corrija o bug da API neste projeto e rode os testes.' });
  assert.equal(calls.repository, 1);
});

test('Critic exige nova evidência quando o verificador retorna UNCERTAIN', async () => {
  const critic = createCritic({ ollama: { async json() { throw new Error('offline'); } }, router: createModelRouter(config) });
  const review = await critic.review({ task: { objective: 'Corrija e teste' }, runs: [], validation: { verdict: 'UNCERTAIN', acceptanceCriteria: [{ criterion: 'Teste aprovado', met: false }], remainingRisks: [] } });
  assert.equal(review.decision, 'retry');
  assert.match(review.gap, /Teste aprovado/);
});
