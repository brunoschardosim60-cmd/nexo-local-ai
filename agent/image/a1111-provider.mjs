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
  return { id: 'automatic1111-forge', probe, generate, health: () => ({ provider: 'Stable Diffusion WebUI/Forge', baseUrl, ...state, supports: ['txt2img'] }) };
}
