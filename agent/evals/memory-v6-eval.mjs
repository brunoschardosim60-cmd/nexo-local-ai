import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createContinuityEngine } from '../memory/continuity.mjs';
import { createDatabase } from '../memory/database.mjs';
import { cosineSimilarity, embedText } from '../memory/embeddings.mjs';
import { createMemoryGate } from '../memory/gate.mjs';
import { createKnowledgeEngine } from '../memory/knowledge-engine.mjs';
import { createLongTermMemory } from '../memory/long-term.mjs';

const mode = process.argv[2] || 'memory';
const directory = await mkdtemp(join(tmpdir(), `nexo-v6-${mode}-`));
const database = createDatabase(directory);
const embeddings = { model: 'lexical-hash-v1', async embed(text) { return { vector: embedText(text), model: this.model, semantic: false }; }, async embedMany(texts) { return Promise.all(texts.map(text => this.embed(text))); }, similarity: cosineSimilarity };
const memory = createLongTermMemory(database, embeddings, createMemoryGate(database)); const knowledge = createKnowledgeEngine(database, memory); const continuity = createContinuityEngine(database, memory);
const checks = []; function check(name, condition, detail = '') { assert.ok(condition, `${name}: ${detail}`); checks.push(name); }

try {
  if (mode === 'memory') {
    const id = await memory.remember('Bruno prefere explicações diretas com exemplos de código.', { kind: 'user', explicit: true, scope: 'global' });
    check('explicit-recall', (await memory.search('preferência por exemplos de código'))[0]?.id === id);
    check('record-schema', database.getMemory(id).privacy === 'LOCAL_ONLY' && database.getMemory(id).status === 'ACTIVE');
    const changed = await memory.remember('Bruno não prefere explicações diretas com exemplos de código.', { kind: 'user', explicit: true });
    check('contradiction-preserved', database.getMemory(id).status === 'SUPERSEDED' && changed !== id);
    check('conflict-auditable', database.listMemoryConflicts().length === 1);
    memory.forget(changed); check('forget-archive', database.getMemory(changed).status === 'FORGOTTEN'); memory.delete(changed); check('delete-real', database.getMemory(changed) === null);
    continuity.save({ sessionId: 'eval', objective: 'validar memória', completed: ['recall'], pending: ['graph'] }); check('session-handoff', continuity.get('eval').state.pending[0] === 'graph');
  } else if (mode === 'long') {
    for (let index = 0; index < 600; index += 1) database.putMemory({ type: index % 5 === 0 ? 'procedural' : 'semantic', content: `Registro histórico ${index}: componente modulo-${index} usa configuração porta-${7000 + index}.`, summary: `Registro ${index}`, embedding: embedText(`componente modulo-${index} porta-${7000 + index}`), vectorModel: 'lexical-hash-v1', scope: index % 2 ? 'project:alpha' : 'project:beta', importance: 0.4 + (index % 5) / 10, confidence: 0.8, source: 'DERIVED' });
    const result = await memory.search('modulo-431 porta-7431', { scope: 'project:alpha', includeGlobal: false, limit: 5 }); check('large-db-recall', result[0]?.content.includes('431'), result[0]?.content); check('project-isolation', result.every(item => item.scope === 'project:alpha')); check('database-size', memory.health().records === 600);
  } else if (mode === 'false') {
    await memory.remember('O Nexo usa SQLite como banco local.', { kind: 'semantic', explicit: true });
    check('unknown-is-empty', (await memory.search('qual o animal de estimação secreto do usuário?')).length === 0);
    check('no-sensitive-inference', await memory.remember('A senha bancária talvez seja nexo123456.', { kind: 'semantic', source: 'AGENT' }) === null);
    check('no-chat-noise', await memory.remember('oi', { kind: 'episodic' }) === null);
  } else if (mode === 'graph') {
    await knowledge.rememberStructured('Projeto Nexo usa React, TypeScript e SQLite.', { type: 'project', scope: 'project:nexo', explicit: true, relation: 'USES' });
    const entities = knowledge.entities({ scope: 'project:nexo' }); const root = entities.find(item => item.type === 'PROJECT'); const graph = knowledge.traverse(root.id, { depth: 3 });
    check('entity-extraction', entities.length >= 4); check('typed-relations', graph.relations.every(item => item.type === 'USES')); check('multi-hop-traversal', graph.entities.length >= 4); check('provenance-link', graph.relations.every(item => item.sourceMemoryId));
  } else if (mode === 'performance') {
    for (let index = 0; index < 2000; index += 1) database.putMemory({ type: 'semantic', content: `Memória desempenho ${index} serviço-${index} configuração-${index}.`, embedding: embedText(`serviço-${index} configuração-${index}`), vectorModel: 'lexical-hash-v1', scope: 'project:perf', importance: 0.5, confidence: 0.8, source: 'DERIVED' });
    const coldStart = performance.now(); await memory.search('serviço-1777 configuração-1777', { scope: 'project:perf' }); const coldMs = performance.now() - coldStart;
    const warmStart = performance.now(); await memory.search('serviço-1777 configuração-1777', { scope: 'project:perf' }); const warmMs = performance.now() - warmStart;
    check('cold-under-1500ms', coldMs < 1500, `${coldMs.toFixed(1)}ms`); check('warm-under-1000ms', warmMs < 1000, `${warmMs.toFixed(1)}ms`); console.log(JSON.stringify({ records: 2000, coldMs: Number(coldMs.toFixed(2)), warmMs: Number(warmMs.toFixed(2)) }, null, 2));
  } else throw new Error(`Modo desconhecido: ${mode}`);
  console.log(`Nexo V6 ${mode}: ${checks.length}/${checks.length} verificações aprovadas.`);
} finally { database.db.close(); await rm(directory, { recursive: true, force: true }); }
