export function planImagePrompt(input = {}) {
  const raw = String(input.prompt || input.objective || '').trim(); if (!raw) throw new Error('Descreva a imagem que deseja criar.');
  const aspect = input.aspectRatio || '1:1'; const [w, h] = ({ '1:1': [768, 768], '16:9': [1024, 576], '9:16': [576, 1024], '4:3': [896, 672], '3:2': [960, 640] })[aspect] || [768, 768];
  const style = String(input.style || 'detalhado, composição limpa, iluminação coerente');
  return { prompt: `${raw}. ${style}`, negativePrompt: String(input.negativePrompt || 'texto ilegível, marca d\'água, baixa qualidade, anatomia ruim, objetos duplicados'), width: Math.min(1536, Number(input.width) || w), height: Math.min(1536, Number(input.height) || h), steps: Math.max(8, Math.min(50, Number(input.steps) || 24)), cfgScale: Math.max(1, Math.min(20, Number(input.cfgScale) || 7)), seed: Number.isInteger(input.seed) ? input.seed : -1, aspectRatio: aspect, sourcePrompt: raw };
}
