import { readFile } from 'node:fs/promises';
export function createA1111ImageProvider({ baseUrl, fetchImpl = globalThis.fetch }) {
  let state = { available: null, checkedAt: null, error: null };
  async function probe() {
    try { const response = await fetchImpl(`${baseUrl}/sdapi/v1/options`, { signal: AbortSignal.timeout(2500) }); if (!response.ok) throw new Error(`HTTP ${response.status}`); state = { available: true, checkedAt: new Date().toISOString(), error: null }; }
    catch (error) { state = { available: false, checkedAt: new Date().toISOString(), error: `Stable Diffusion WebUI/Forge não respondeu em ${baseUrl}: ${String(error?.message || error)}` }; }
    return state;
  }
  async function generate(plan, { signal } = {}) {
    const available = await probe(); if (!available.available) throw new Error(available.error);
    const response = await fetchImpl(`${baseUrl}/sdapi/v1/txt2img`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: signal || AbortSignal.timeout(300_000), body: JSON.stringify({ prompt: plan.prompt, negative_prompt: plan.negativePrompt, width: plan.width, height: plan.height, steps: plan.steps, cfg_scale: plan.cfgScale, seed: plan.seed, batch_size: 1, n_iter: 1 }) });
    if (!response.ok) throw new Error(`Gerador local respondeu ${response.status}.`); const payload = await response.json(); const base64 = payload.images?.[0]; if (!base64) throw new Error('Gerador local não retornou imagem.');
    let info = {}; try { info = typeof payload.info === 'string' ? JSON.parse(payload.info) : payload.info || {}; } catch {}
    return { base64, mimeType: 'image/png', provider: 'automatic1111-forge', model: info.sd_model_name || null, metadata: { ...plan, generation: info } };
  }
  async function edit(plan,{signal}={}){const available=await probe();if(!available.available)throw new Error(available.error);if(!plan.sourceImage)throw new Error('Edição exige imagem de origem.');const raw=plan.sourceImage.path?(await readFile(plan.sourceImage.path)).toString('base64'):String(plan.sourceImage.dataUrl||plan.sourceImage.base64||'').replace(/^data:[^;]+;base64,/,'');if(!raw)throw new Error('Imagem de origem inválida.');const payload={init_images:[raw],prompt:plan.prompt,negative_prompt:plan.negativePrompt,width:plan.width,height:plan.height,steps:plan.steps,cfg_scale:plan.cfgScale,denoising_strength:plan.denoisingStrength,seed:plan.seed,...(plan.mask?{mask:String(plan.mask.dataUrl||plan.mask.base64||'').replace(/^data:[^;]+;base64,/,''),inpainting_fill:1,inpaint_full_res:true}:{})};const response=await fetchImpl(`${baseUrl}/sdapi/v1/img2img`,{method:'POST',headers:{'content-type':'application/json'},signal:signal||AbortSignal.timeout(300_000),body:JSON.stringify(payload)});if(!response.ok)throw new Error(`Editor local respondeu ${response.status}.`);const result=await response.json();if(!result.images?.[0])throw new Error('Editor local não retornou imagem.');return{base64:result.images[0],mimeType:'image/png',provider:'automatic1111-forge',model:null,metadata:{...plan,mode:plan.mask?'inpainting':'image-to-image'}};}
  return { id: 'automatic1111-forge', capabilities:['image-generation','text-to-image','image-to-image','inpainting','variations','upscale'], probe, generate, edit, health: () => ({ provider: 'Stable Diffusion WebUI/Forge', baseUrl, ...state, supports: ['text-to-image','image-to-image','inpainting','variations','upscale'] }) };
}
