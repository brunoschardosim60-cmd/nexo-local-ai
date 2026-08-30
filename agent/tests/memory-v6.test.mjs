import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createRag } from '../context/rag.mjs';
import { createContinuityEngine } from '../memory/continuity.mjs';
import { createDatabase } from '../memory/database.mjs';
import { embedText, cosineSimilarity } from '../memory/embeddings.mjs';
import { createMemoryGate } from '../memory/gate.mjs';
import { createKnowledgeEngine } from '../memory/knowledge-engine.mjs';
import { createLongTermMemory } from '../memory/long-term.mjs';

const embeddings = { model: 'lexical-hash-v1', async embed(text) { return { vector: embedText(text), model: this.model, semantic: false }; }, async embedMany(texts) { return Promise.all(texts.map(text => this.embed(text))); }, similarity: cosineSimilarity };

async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), 'nexo-v6-')); const database = createDatabase(directory); const gate = createMemoryGate(database); const memory = createLongTermMemory(database, embeddings, gate); const knowledge = createKnowledgeEngine(database, memory); const continuity = createContinuityEngine(database, memory);
  try { await run({ directory, database, memory, knowledge, continuity }); } finally { database.db.close(); await rm(directory, { recursive: true, force: true }); }
}

test('MemoryRecord V3 preserva tipo, escopo, privacidade, proveniência e temporalidade', () => fixture(async ({ database, memory }) => {
  const id = await memory.remember('Bruno prefere respostas curtas e exemplos concretos.', { kind: 'user', explicit: true, source: 'USER_EXPLICIT', scope: 'project:nexo', privacy: 'LOCAL_ONLY', validFrom: '2026-01-01T00:00:00.000Z' });
  const item = database.getMemory(id); assert.equal(item.type, 'user'); assert.equal(item.scope, 'project:nexo'); assert.equal(item.privacy, 'LOCAL_ONLY'); assert.equal(item.source, 'USER_EXPLICIT'); assert.equal(item.status, 'ACTIVE'); assert.equal(item.validFrom, '2026-01-01T00:00:00.000Z');
}));

test('Gate V2 rejeita ruído e não persiste segredo inferido', () => fixture(async ({ memory }) => {
  assert.equal(await memory.remember('Olá!', { kind: 'episodic' }), null);
  assert.equal(await memory.remember('A senha do serviço é supersecreta123', { kind: 'semantic', source: 'AGENT' }), null);
}));

test('deduplicação reforça o registro sem criar cópia', () => fixture(async ({ memory }) => {
  const first = await memory.remember('Bruno prefere usar o tema escuro no Nexo.', { kind: 'user', explicit: true }); const second = await memory.remember('Bruno prefere usar o tema escuro no Nexo.', { kind: 'user', explicit: true });
  assert.equal(second, first); assert.equal(memory.list({ limit: 20 }).length, 1); assert.equal(memory.list({ limit: 20 })[0].reinforcementCount, 1);
}));

test('contradição explícita supersede sem sobrescrever silenciosamente', () => fixture(async ({ database, memory }) => {
  const oldId = await memory.remember('Bruno prefere tema escuro no aplicativo.', { kind: 'user', explicit: true }); const newId = await memory.remember('Bruno não prefere tema escuro no aplicativo.', { kind: 'user', explicit: true });
  assert.notEqual(oldId, newId); assert.equal(database.getMemory(oldId).status, 'SUPERSEDED'); assert.equal(database.getMemory(oldId).supersededBy, newId); assert.equal(database.listMemoryConflicts()[0].resolution, 'SUPERSEDE');
}));

test('recuperação respeita namespace de projeto e não inventa em consulta sem evidência', () => fixture(async ({ memory }) => {
  await memory.remember('O projeto Alfa usa autenticação JWT.', { kind: 'project', explicit: true, scope: 'project:alfa' }); await memory.remember('O projeto Beta usa sessão por cookie.', { kind: 'project', explicit: true, scope: 'project:beta' });
  const alfa = await memory.search('autenticação JWT', { scope: 'project:alfa', includeGlobal: false }); assert.equal(alfa.length, 1); assert.match(alfa[0].content, /Alfa/);
  assert.equal((await memory.search('qual é o planeta favorito de Bruno?', { scope: 'project:alfa', includeGlobal: false })).length, 0);
}));

test('validade temporal, arquivamento e exclusão física funcionam', () => fixture(async ({ database, memory }) => {
  const expired = await memory.remember('Configuração temporária antiga usa a porta 9999.', { kind: 'project', explicit: true, expiresAt: '2020-01-01T00:00:00.000Z' }); assert.equal((await memory.search('porta 9999')).length, 0);
  memory.forget(expired); assert.equal(database.getMemory(expired).status, 'FORGOTTEN'); assert.equal(memory.delete(expired), true); assert.equal(database.getMemory(expired), null);
}));

test('grafo local extrai entidades e percorre relações em múltiplos saltos', () => fixture(async ({ knowledge }) => {
  await knowledge.rememberStructured('Projeto Nexo usa SQLite, React e TypeScript.', { type: 'project', scope: 'project:nexo', explicit: true, source: 'USER_EXPLICIT', relation: 'USES' });
  const entities = knowledge.entities({ scope: 'project:nexo', limit: 20 }); assert.ok(entities.length >= 4); const start = entities.find(item => item.type === 'PROJECT'); const graph = knowledge.traverse(start.id, { depth: 2 }); assert.ok(graph.relations.length >= 3); assert.ok(graph.entities.some(item => item.name === 'SQLite'));
}));

test('memória procedural, decisão e erro ficam estruturados', () => fixture(async ({ memory, knowledge }) => {
  await knowledge.recordProcedure({ name: 'validar build', steps: ['executar lint', 'executar testes', 'executar build'], scope: 'project:nexo', outcome: 'aprovado' }); await knowledge.recordDecision({ decision: 'usar SQLite', rationale: 'persistência local', scope: 'project:nexo' }); await knowledge.recordError({ error: 'porta ocupada', cause: 'processo antigo', fix: 'encerrar processo', scope: 'project:nexo', evidence: ['EADDRINUSE'] });
  assert.equal(memory.list({ scope: 'project:nexo', kind: 'procedural' }).length, 1); assert.equal(memory.list({ scope: 'project:nexo', kind: 'decision' }).length, 1); assert.equal(memory.list({ scope: 'project:nexo', kind: 'error' }).length, 1);
}));

test('continuidade salva e restaura handoff de sessão', () => fixture(async ({ continuity }) => {
  continuity.save({ sessionId: 'chat-1', scope: 'project:nexo', objective: 'corrigir login', completed: ['diagnóstico'], pending: ['teste'], nextSteps: ['rodar npm test'] }); const state = await continuity.build({ sessionId: 'chat-1', scope: 'project:nexo', objective: 'login' }); assert.equal(state.previous.objective, 'corrigir login'); assert.deepEqual(state.previous.pending, ['teste']);
}));

test('RAG incremental usa hash e evita reindexar conteúdo igual', () => fixture(async ({ database }) => {
  const rag = createRag({ database, workspace: '.', filesystem: {}, embeddings }); const first = await rag.indexText('nota.md', '# Login\nO sistema usa JWT para autenticação.'); const second = await rag.indexText('nota.md', '# Login\nO sistema usa JWT para autenticação.'); assert.ok(first.chunks > 0); assert.equal(second.skipped, true); assert.equal(second.chunks, 0);
}));
