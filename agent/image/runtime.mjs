import { planImagePrompt } from './prompt-planner.mjs';

export function createImageRuntime({ provider, artifacts, vision = null, enabled = true, autoRegeneration = false, beforeGenerate = null }) {
  async function generate(input, options = {}) {
    if (!enabled) throw new Error('Geração de imagem está desativada.'); if(beforeGenerate)await beforeGenerate();const plan = planImagePrompt(input); const editing=plan.mode!=='text-to-image'||Boolean(plan.sourceImage);const generated = editing&&provider.edit?await provider.edit(plan,options):await provider.generate(plan, options);
    const parents=[input.parentArtifactId,input.sourceImage?.artifactId].filter(Boolean);const artifact = await artifacts.saveBase64({ type: 'image', mimeType: generated.mimeType, provider: generated.provider, model: generated.model, base64: generated.base64, metadata: {...generated.metadata,quality:plan.quality,intent:plan.intent,generationId:options.jobId||null,conversationId:input.conversationId||null,projectId:input.projectId||null},parentArtifactIds:parents });
    let verification = { verdict: 'SKIPPED', reason: 'Vision não disponível ou verificação não solicitada.' };
    if (plan.verify && vision) { try { await provider.release?.();verification = editing&&plan.sourceImage?await vision.compareImages(plan.sourceImage,{path:artifact.location},['região solicitada','preservação do restante','identidade quando aplicável']):await vision.evaluateGeneration({ path: artifact.location }, plan.sourcePrompt, ['aderência','anatomia','composição','artefatos','iluminação','texto','identidade']); } catch (error) { verification = { verdict: 'SKIPPED', reason: String(error?.message || error) }; } }
    return { artifact, plan, verification, autoRegeneration: autoRegeneration && verification?.result?.verdict === 'FAIL' ? 'eligible-not-automatic-without-explicit-policy' : false };
  }
  return { generate,edit:(input,options)=>generate({...input,mode:input.mode||'image-to-image'},options),availability: () => enabled ? provider.probe() : Promise.resolve({ available: false, error: 'feature flag desativada' }), health: () => ({ enabled, version:'2.0.0',qualityPresets:['FAST','BALANCED','HIGH','MAX'],intents:['photo','illustration','diagram','UI','logo','concept art','educational visual'],autoRegeneration,...provider.health(),output:'persistent-versioned-artifact' }) };
}
