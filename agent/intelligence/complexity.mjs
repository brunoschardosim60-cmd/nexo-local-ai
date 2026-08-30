const LEVELS = Object.freeze(['trivial', 'simple', 'moderate', 'complex', 'agentic']);
const ACTION = /\b(crie|corrija|edite|altere|execute|rode|abra|acesse|publique|instale|mova|remova|pesquise|analise)\b[\s\S]*\b(arquivo|projeto|site|api|teste|terminal|navegador|internet|git|servidor)\w*\b/i;
const REASONING = /\b(por que|causa raiz|hip[oó]tese|deduz|prove|compare|arquitetura|estrat[eé]gia|racioc[ií]nio|investigue)\w*\b/i;
const RESEARCH = /\b(pesquis|fontes?|artigos?|estudos?|not[ií]cia|internet|web|evid[eê]ncia|atualizad)\w*\b/i;
const MEMORY = /\b(lembre|lembra|mem[oó]ria|eu disse|eu falei|prefiro|gosto|meu|minha|antes)\b/i;
const DOCUMENT = /\b(documento|arquivo|pdf|docx|xlsx|csv|anexo|base de conhecimento)\b/i;
const VISION = /\b(imagem|foto|screenshot|captura de tela|ocr|visual|gr[aá]fico nesta imagem)\b/i;
const IMAGE_GENERATION = /\b(crie|gere|fa[cç]a|desenhe|edite|modifique)\b[\s\S]*\b(imagem|foto|ilustra[cç][aã]o|poster|logo|avatar|capa)\b/i;
const VIDEO = /\b(crie|gere|edite|fa[cç]a)\b[\s\S]*\b(v[ií]deo|filme|anima[cç][aã]o|clipe|storyboard)\b/i;
const AUDIO = /\b(transcreva|narre|fale|voz|[aá]udio|m[uú]sica|efeito sonoro|tts|stt)\b/i;
const SENSITIVE = /\b(senha|credencial|token|segredo|chave privada|sa[uú]de|m[eé]dic|jur[ií]dic|financeir|dados pessoais|documento pessoal)\w*\b/i;
const MULTISTEP = /\b(e depois|em seguida|por fim|todos?|inteiro|completo|m[uú]ltipl|planeje|implemente e|analise e|valide)\b/i;

function levelFromScore(score, agentic) {
  if (agentic) return 'agentic';
  if (score >= 0.72) return 'complex';
  if (score >= 0.43) return 'moderate';
  if (score >= 0.18) return 'simple';
  return 'trivial';
}

export function createComplexityEstimator() {
  function estimate(input = {}) {
    const text = String(typeof input === 'string' ? input : input.text || input.objective || input.question || '').trim();
    const attachments = Array.isArray(input.attachments) ? input.attachments : [];
    const mode = String(input.mode || '');
    const has = pattern => pattern.test(text);
    const needs = {
      reasoning: has(REASONING), memory: has(MEMORY), rag: has(DOCUMENT) || attachments.some(item => item.type === 'document'),
      research: has(RESEARCH) || Boolean(input.webSearch), tools: has(ACTION) || mode === 'Agente',
      vision: has(VISION) || attachments.some(item => ['image', 'screen'].includes(item.type)),
      media: has(IMAGE_GENERATION) ? 'image' : has(VIDEO) ? 'video' : has(AUDIO) ? 'audio' : null,
    };
    let score = text.length > 900 ? 0.42 : text.length > 350 ? 0.27 : text.length > 120 ? 0.15 : 0.04;
    if (needs.reasoning) score += 0.22;
    if (needs.research) score += 0.18;
    if (MULTISTEP.test(text)) score += 0.22;
    if (attachments.length) score += 0.12;
    if (needs.media) score += 0.16;
    const agentic = needs.tools && (MULTISTEP.test(text) || mode === 'Agente');
    const level = levelFromScore(Math.min(1, score), agentic);
    const privacy = has(SENSITIVE) ? 'sensitive' : attachments.length ? 'private-local' : 'normal';
    const confidenceRequired = ['complex', 'agentic'].includes(level) || needs.research || needs.tools ? 'high' : level === 'moderate' ? 'medium' : 'normal';
    const computeBudget = level === 'trivial' ? 'minimal' : level === 'simple' ? 'low' : level === 'moderate' ? 'medium' : level === 'complex' ? 'high' : 'bounded-agent';
    return { level, score: Number(Math.min(1, score).toFixed(3)), needs, privacy, confidenceRequired, computeBudget, reasons: [needs.reasoning && 'reasoning', needs.memory && 'memory', needs.rag && 'rag', needs.research && 'research', needs.tools && 'tools', needs.vision && 'vision', needs.media && `media:${needs.media}`, privacy !== 'normal' && privacy].filter(Boolean) };
  }
  return { estimate, levels: LEVELS, health: () => ({ version: '1.0.0', llmCalls: 0, levels: LEVELS }) };
}
