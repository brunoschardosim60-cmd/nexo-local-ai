import { planImagePrompt } from './prompt-planner.mjs';

export function createImageRuntime({ provider, artifacts, vision = null, enabled = true, autoRegeneration = false }) {
  async function generate(input, options = {}) {
    if (!enabled) throw new Error('Geração de imagem está desativada.'); const plan = planImagePrompt(input); const generated = await provider.generate(plan, options);
    const artifact = await artifacts.saveBase64({ type: 'image', mimeType: generated.mimeType, provider: generated.provider, model: generated.model, base64: generated.base64, metadata: generated.metadata });
    let verification = { verdict: 'SKIPPED', reason: 'Vision não disponível ou verificação não solicitada.' };
    if (input.verify !== false && vision) { try { verification = await vision.evaluateGeneration({ path: artifact.location }, plan.sourcePrompt, ['aderência', 'composição', 'artefatos', 'texto']); } catch (error) { verification = { verdict: 'SKIPPED', reason: String(error?.message || error) }; } }
    return { artifact, plan, verification, autoRegeneration: autoRegeneration && verification?.result?.verdict === 'FAIL' ? 'eligible-not-automatic-without-explicit-policy' : false };
  }
  return { generate, availability: () => enabled ? provider.probe() : Promise.resolve({ available: false, error: 'feature flag desativada' }), health: () => ({ enabled, autoRegeneration, ...provider.health(), output: 'persistent-artifact' }) };
}
