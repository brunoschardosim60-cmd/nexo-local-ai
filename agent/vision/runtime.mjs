export function createVisionRuntime({ provider, enabled = true }) {
  async function ensure() { if (!enabled) throw new Error('Vision está desativado por feature flag.'); const state = await provider.probe(); if (!state.available) throw new Error(`Vision indisponível: ${state.error}`); }
  return {
    async analyzeImage(image, instruction) { await ensure(); return provider.analyzeImage(image, instruction); },
    async compareImages(left, right, criteria) { await ensure(); return provider.compareImages(left, right, criteria); },
    async describeImage(image) { await ensure(); return provider.describeImage(image); },
    async extractVisualInformation(image, schema) { await ensure(); return provider.extractVisualInformation(image, schema); },
    async evaluateGeneration(image, prompt, criteria) { await ensure(); return provider.evaluateGeneration(image, prompt, criteria); },
    async availability() { return enabled ? provider.probe() : { available: false, error: 'feature flag desativada' }; },
    health: () => ({ enabled, ...provider.health() }),
  };
}
