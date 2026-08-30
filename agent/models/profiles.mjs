function capabilitiesFor(name) {
  const lower = String(name).toLowerCase();
  if (/embed/.test(lower)) return { chat: false, reasoning: false, coding: false, vision: false, toolCalling: false, structuredOutput: false, embeddings: true, image: false, video: false, speech: false };
  const vision = /(?:vl|vision|llava|gemma3:4b|gemma3:12b|gemma3:27b)/.test(lower);
  return { chat: true, reasoning: !/270m|1b/.test(lower), coding: /coder|code|qwen/.test(lower), vision, toolCalling: /qwen|llama|gemma/.test(lower), structuredOutput: true, embeddings: false, image: false, video: false, speech: false };
}

export function createModelProfiles({ config, database, fetchImpl = globalThis.fetch }) {
  const profiles = new Map(); let loaded = [];
  for (const model of new Set([config.fastModel, config.capableModel, config.coderModel, config.reasoningModel, config.visionModel, config.embeddingModel].filter(Boolean))) {
    profiles.set(model, { provider: 'ollama-local', model, contextWindow: null, installed: null, sizeBytes: null, loaded: false, capabilities: capabilitiesFor(model), performance: { ttftMs: null, tokensPerSecond: null, ramMB: null, vramMB: null }, quality: {} });
  }
  function hydrateQuality(profile) {
    const benchmarks = database.listModelBenchmarks?.() || [];
    return { ...profile, quality: Object.fromEntries(benchmarks.filter(item => item.model === profile.model).map(item => [item.domain, { score: item.score, sampleCount: item.sampleCount, measuredAt: item.updatedAt }])) };
  }
  async function refresh() {
    try {
      const [tagsResponse, psResponse] = await Promise.all([fetchImpl(`${config.ollamaUrl}/api/tags`), fetchImpl(`${config.ollamaUrl}/api/ps`)]);
      const tags = tagsResponse.ok ? (await tagsResponse.json()).models || [] : [];
      loaded = psResponse.ok ? (await psResponse.json()).models || [] : [];
      for (const item of tags) {
        const name = item.name || item.model; const current = profiles.get(name) || { provider: 'ollama-local', model: name, contextWindow: null, performance: {}, quality: {}, capabilities: capabilitiesFor(name) };
        profiles.set(name, { ...current, installed: true, sizeBytes: item.size || null, modifiedAt: item.modified_at || null, loaded: loaded.some(active => (active.name || active.model) === name) });
      }
      for (const profile of profiles.values()) if (!tags.some(item => (item.name || item.model) === profile.model)) profile.installed = false;
    } catch { /* Ollama indisponível é refletido por installed:null/false */ }
    return list();
  }
  function list() { return [...profiles.values()].map(hydrateQuality); }
  function get(model) { const profile = profiles.get(model); return profile ? hydrateQuality(profile) : null; }
  return { refresh, list, get, isInstalled: model => profiles.get(model)?.installed === true, isLoaded: model => loaded.some(item => (item.name || item.model) === model), health: () => ({ provider: 'Ollama local', profiles: list(), loaded: loaded.map(item => item.name || item.model) }) };
}
