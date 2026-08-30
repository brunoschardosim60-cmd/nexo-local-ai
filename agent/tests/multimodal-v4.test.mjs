import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createDatabase } from '../memory/database.mjs';
import { createMediaQueue } from '../media/queue.mjs';
import { createResourceManager } from '../resources/manager.mjs';
import { createImageRuntime } from '../image/runtime.mjs';
import { createOllamaVisionProvider } from '../vision/ollama-provider.mjs';
import { normalizeMultimodalMessage, mediaFromMessage, textFromMessage } from '../multimodal/schema.mjs';
import { assessKnowledge, EPISTEMIC } from '../intelligence/epistemic.mjs';
import { classifyFailure, ERROR_KIND } from '../orchestrator/errors.mjs';

test('schema multimodal preserva texto e mídia com limites', () => {
  const message = normalizeMultimodalMessage({ role: 'user', parts: [{ type: 'text', text: 'analise' }, { type: 'image', name: 'foto.png', dataUrl: 'data:image/png;base64,AA==' }] });
  assert.equal(textFromMessage(message), 'analise'); assert.equal(mediaFromMessage(message)[0].type, 'image'); assert.throws(() => normalizeMultimodalMessage({ parts: [{ type: 'binary' }] }), /inválida/);
});

test('estado epistêmico e erros classificam incerteza e recuperação', () => {
  assert.equal(assessKnowledge({ contradictions: ['a', 'b'] }).state, EPISTEMIC.UNCERTAIN);
  assert.equal(classifyFailure('timeout temporário'), ERROR_KIND.TRANSIENT);
  assert.equal(classifyFailure('permissão negada'), ERROR_KIND.PERMISSION);
});

test('provider de visão envia imagem ao Ollama sem chamar nuvem', async () => {
  const calls = []; const fetchImpl = async (url, options = {}) => { calls.push({ url, options }); if (url.endsWith('/api/tags')) return { ok: true, json: async () => ({ models: [{ name: 'qwen2.5vl:3b' }] }) }; return { ok: true, json: async () => ({ message: { content: 'Um quadrado branco.' } }) }; };
  const provider = createOllamaVisionProvider({ config: { ollamaUrl: 'http://127.0.0.1:11434', visionModel: 'qwen2.5vl:3b' }, filesystem: { safePath: value => value }, fetchImpl });
  const output = await provider.describeImage({ dataUrl: 'data:image/png;base64,AA==' }); assert.match(output.content, /quadrado/); assert.equal(JSON.parse(calls[1].options.body).messages[0].images.length, 1); assert.ok(calls.every(call => call.url.startsWith('http://127.0.0.1:11434')));
});

test('geração de imagem persiste artefato e registra verificação', async () => {
  const saved = []; const runtime = createImageRuntime({ enabled: true, provider: { generate: async plan => ({ base64: 'AA==', mimeType: 'image/png', provider: 'fake-local', metadata: plan }), probe: async () => ({ available: true }), health: () => ({ provider: 'fake-local' }) }, artifacts: { saveBase64: async input => { saved.push(input); return { id: 'artifact-1', location: 'image.png', ...input }; } }, vision: { evaluateGeneration: async () => ({ result: { verdict: 'PASS' } }) } });
  const result = await runtime.generate({ prompt: 'uma floresta', aspectRatio: '16:9' }); assert.equal(result.artifact.id, 'artifact-1'); assert.equal(saved[0].provider, 'fake-local'); assert.equal(result.verification.result.verdict, 'PASS');
});

test('fila de mídia persiste, executa e pode cancelar', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nexo-media-')); const database = createDatabase(directory); const resources = createResourceManager();
  const queue = createMediaQueue({ database, resourceManager: resources, handlers: { image: { run: async () => ({ artifact: { id: 'generated-1' } }) } } });
  try { const job = queue.enqueue('image', { prompt: 'teste' }); await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(queue.get(job.id).status, 'completed'); assert.equal(queue.get(job.id).artifactId, 'generated-1'); const pending = queue.enqueue('unknown', {}); await new Promise(resolve => setTimeout(resolve, 20)); assert.equal(queue.get(pending.id).status, 'failed'); } finally { database.db.close(); await rm(directory, { recursive: true, force: true }); }
});
