import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);

export function createOllamaVisionProvider({ config, filesystem, fetchImpl = globalThis.fetch }) {
  let state = { available: null, checkedAt: null, error: null };
  async function probe() {
    try {
      const response = await fetchImpl(`${config.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(5_000) });
      if (!response.ok) throw new Error(`Ollama respondeu ${response.status}.`);
      const models = (await response.json()).models || []; const available = models.some(item => (item.name || item.model) === config.visionModel || String(item.name || item.model).startsWith(`${config.visionModel}:`));
      state = { available, checkedAt: new Date().toISOString(), error: available ? null : `Modelo ${config.visionModel} não instalado.` };
    } catch (error) { state = { available: false, checkedAt: new Date().toISOString(), error: String(error.message || error) }; }
    return state;
  }
  async function imageBase64(image) {
    if (image?.dataUrl) {
      const match = String(image.dataUrl).match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/i); if (!match) throw new Error('Imagem base64 inválida.');
      const buffer = Buffer.from(match[1], 'base64'); if (buffer.length > 8_000_000) throw new Error('Imagem excede 8 MB.'); return match[1];
    }
    if (image?.path) {
      const path = filesystem.safePath(String(image.path)); if (!IMAGE_EXTENSIONS.has(extname(path).toLowerCase())) throw new Error('Formato de imagem não suportado.');
      const buffer = await readFile(path); if (buffer.length > 8_000_000) throw new Error('Imagem excede 8 MB.'); return buffer.toString('base64');
    }
    throw new Error('Imagem ausente.');
  }
  async function unloadCompetingModels() {
    try {
      const response = await fetchImpl(`${config.ollamaUrl}/api/ps`, { signal: AbortSignal.timeout(5_000) });
      if (!response.ok) return;
      const models = (await response.json()).models || [];
      for (const item of models) {
        const model = item.name || item.model;
        if (!model || model === config.visionModel || String(model).startsWith(`${config.visionModel}:`)) continue;
        await fetchImpl(`${config.ollamaUrl}/api/generate`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(10_000),
          body: JSON.stringify({ model, prompt: '', stream: false, keep_alive: 0 }),
        }).catch(() => undefined);
      }
    } catch {
      // A análise ainda pode funcionar quando o provider não expõe /api/ps.
    }
  }
  async function chat(images, prompt, { json = false, numPredict = 900 } = {}) {
    const availability = state.available == null ? await probe() : state;
    if (!availability.available) throw new Error(`Vision indisponível: ${availability.error}`);
    await unloadCompetingModels();
    const encoded = await Promise.all(images.map(imageBase64)); const startedAt = performance.now();
    const response = await fetchImpl(`${config.ollamaUrl}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(120_000), body: JSON.stringify({ model: config.visionModel, stream: false, ...(json ? { format: 'json' } : {}), keep_alive: '45s', options: { temperature: 0.1, num_predict: numPredict, num_ctx: 2048 }, messages: [{ role: 'user', content: prompt, images: encoded }] }) });
    if (!response.ok) throw new Error(`Vision respondeu ${response.status}.`); const payload = await response.json(); const content = String(payload.message?.content || '').trim();
    if (!content) throw new Error('Vision não produziu análise.');
    if (!json) return { content, model: config.visionModel, provider: 'ollama-local', durationMs: performance.now() - startedAt };
    try { return { result: JSON.parse(content.replace(/^```json\s*|```$/g, '')), model: config.visionModel, provider: 'ollama-local', durationMs: performance.now() - startedAt }; } catch { throw new Error('Vision não retornou JSON válido.'); }
  }
  return {
    id: 'ollama-vision', capabilities: ['analyzeImage', 'compareImages', 'describeImage', 'extractVisualInformation', 'evaluateGeneration'], probe,
    analyzeImage(image, instruction = 'Analise esta imagem com precisão. Separe observações visíveis de inferências e informe incertezas.') { return chat([image], instruction, { numPredict: 220 }); },
    describeImage(image) { return chat([image], 'Descreva objetivamente tudo que é visível nesta imagem em português brasileiro. Não invente detalhes ocultos.', { numPredict: 420 }); },
    extractVisualInformation(image, schema = {}) { return chat([image], `Extraia informação visual segundo este schema e responda apenas JSON: ${JSON.stringify(schema).slice(0, 4000)}`, { json: true, numPredict: 600 }); },
    compareImages(left, right, criteria = []) { return chat([left, right], `Compare a primeira e a segunda imagem. Critérios: ${criteria.join(', ') || 'conteúdo, composição, texto, identidade e diferenças'}. Separe semelhanças, mudanças e incertezas.`, { numPredict: 600 }); },
    evaluateGeneration(image, prompt, criteria = []) { return chat([image], `Avalie a imagem contra o prompt: ${prompt}. Critérios: ${criteria.join(', ') || 'aderência, composição, artefatos, anatomia, texto e restrições'}. Responda JSON {"verdict":"PASS|FAIL|UNCERTAIN","scores":{"adherence":0,"composition":0,"artifacts":0,"text":0},"evidence":[],"problems":[]}.`, { json: true, numPredict: 600 }); },
    health: () => ({ provider: 'Ollama local', model: config.visionModel, ...state, capabilities: ['analyze', 'compare', 'describe', 'extract', 'evaluate'] }),
  };
}
