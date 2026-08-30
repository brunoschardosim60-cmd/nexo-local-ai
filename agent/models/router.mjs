const DOMAIN_PATTERNS = Object.freeze({
  vision: /\b(imagem|foto|screenshot|visual|ocr|video|camera)\b/i,
  coding: /\b(codigo|bug|typescript|javascript|python|react|node|api|classe|funcao|build|teste|git|lsp|ast|servidor|banco de dados|program|correc)\w*\b/i,
  research: /\b(pesquis|investig|fontes?|artigos?|estudos?|noticia|evidencia|internet|web|compare estudos)\w*\b/i,
  documents: /\b(documento|pdf|docx|texto|resumo|redig|contrato)\b/i,
  data: /\b(planilha|csv|xlsx|dados|grafico|estatistica|sql)\b/i,
  reasoning: /\b(demonstre|prove|deduza|raciocinio|logica|estrategia|arquitetura|hipotese|causa raiz)\w*\b/i,
});

const TOOL_PATTERN = /\b(crie|corrija|edite|altere|execute|rode|abra|acesse|publique|instale|mova|remova|pesquise)\b[\s\S]*\b(arquivo|projeto|site|api|teste|terminal|navegador|internet|git|servidor)\w*\b/i;
const MULTISTEP_PATTERN = /\b(e depois|em seguida|primeiro|por fim|todos?|inteiro|completo|multipl|planeje|implemente e|analise e)\b/i;

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function domainFor(text, purpose = '') {
  if (/vision|image|ocr/i.test(purpose) || DOMAIN_PATTERNS.vision.test(text)) return 'vision';
  for (const domain of ['coding', 'reasoning', 'research', 'documents', 'data']) {
    if (DOMAIN_PATTERNS[domain].test(text)) return domain;
  }
  return 'chat';
}

function difficultyFor(text, domain, purpose = '') {
  let score = 0.12;
  if (text.length > 180) score += 0.14;
  if (text.length > 600) score += 0.18;
  if (MULTISTEP_PATTERN.test(text)) score += 0.18;
  if (TOOL_PATTERN.test(text)) score += 0.16;
  if (['coding', 'reasoning', 'research'].includes(domain)) score += 0.16;
  if (domain === 'research' && MULTISTEP_PATTERN.test(text)) score += 0.15;
  if (/planning|replanning|critic|evaluation|verification/.test(purpose)) score += 0.18;
  if (/\b(complex|avancad|profund|causa raiz|otimiz|seguranca)\b/i.test(text)) score += 0.15;
  if (/\b(falh|erro|timeout)\w*\b/i.test(text)) score += 0.14;
  if (/\b(repet|tente|tentativa|recuper|replanej|outra estrategia|outra hipotese|checkpoint|repli)\w*\b/i.test(text)) score += 0.32;
  const bounded = Math.min(1, score);
  return { score: bounded, level: bounded >= 0.6 ? 'high' : bounded >= 0.34 ? 'medium' : 'low' };
}

export function createModelRouter(config, database = null, estimator = null, profiles = null, resources = null) {
  function analyze(input = {}) {
    const objective = typeof input === 'string' ? input : input.objective || input.question || '';
    const purpose = typeof input === 'string' ? '' : String(input.purpose || 'response');
    const text = normalize(objective);
    const domain = domainFor(text, purpose);
    const difficulty = difficultyFor(text, domain, purpose);
    const intelligence = estimator?.estimate?.({ objective, mode: input.mode, attachments: input.attachments, webSearch: input.webSearch }) || null;
    const needsTools = TOOL_PATTERN.test(text) || purpose === 'tool-selection' || Boolean(intelligence?.needs.tools);
    return {
      objective, purpose, domain, difficulty, needsTools,
      complexity: intelligence, privacy: intelligence?.privacy || 'normal', confidenceRequired: intelligence?.confidenceRequired || 'normal', computeBudget: intelligence?.computeBudget || 'medium',
      needsVision: domain === 'vision' || Boolean(intelligence?.needs.vision), needsResearch: domain === 'research' || Boolean(intelligence?.needs.research), media: intelligence?.needs.media || null,
      needsLongContext: text.length > 600 || MULTISTEP_PATTERN.test(text),
      reasons: [domain !== 'chat' ? `dominio:${domain}` : 'dominio:conversa', `dificuldade:${difficulty.level}`, needsTools ? 'ferramentas' : null].filter(Boolean),
    };
  }

  function candidates(analysis) {
    if (analysis.needsVision && config.visionModel) return [{ model: config.visionModel, role: 'vision' }];
    if (analysis.domain === 'coding') return [{ model: config.coderModel, role: 'coder' }, { model: config.fastModel, role: 'fast' }];
    if (analysis.domain === 'reasoning' || analysis.difficulty.level === 'high') return [{ model: config.reasoningModel, role: 'reasoning' }, { model: config.capableModel, role: 'capable' }];
    return [{ model: config.fastModel, role: 'fast' }, { model: config.capableModel, role: 'capable' }];
  }

  function route(input = {}) {
    const analysis = analyze(input);
    const options = candidates(analysis).filter((item, index, list) => item.model && list.findIndex(other => other.model === item.model) === index && profiles?.get?.(item.model)?.installed !== false);
    const benchmarks = database?.listModelBenchmarks?.(analysis.domain) || [];
    const measured = options.map(option => ({ ...option, benchmark: benchmarks.find(item => item.model === option.model) || null }))
      .filter(option => option.benchmark?.sampleCount >= 10)
      .sort((left, right) => right.benchmark.score - left.benchmark.score || (left.benchmark.medianLatencyMs || Infinity) - (right.benchmark.medianLatencyMs || Infinity));
    const requiresCapable = analysis.difficulty.level === 'high' || ['complex', 'agentic'].includes(analysis.complexity?.level) || ['coding', 'reasoning'].includes(analysis.domain) || ['planning', 'replanning', 'critic', 'verification'].includes(analysis.purpose);
    const loaded = options.find(option => profiles?.isLoaded?.(option.model)); let selected = measured[0] || (!requiresCapable && loaded) || (requiresCapable ? options.find(option => option.role !== 'fast') : options[0]) || { model: config.capableModel, role: 'capable' };
    const profile = profiles?.get?.(selected.model); const resourceDecision = resources?.decide?.({ kind: 'model', requiredRamMB: profile?.sizeBytes ? Math.ceil(profile.sizeBytes / 1_048_576) : 0, priority: analysis.computeBudget === 'high' ? 2 : 5 });
    if (resourceDecision?.decision === 'reject') selected = options.find(option => option.role === 'fast') || selected;
    return { ...selected, analysis, source: measured[0] ? 'benchmarks' : loaded && selected.model === loaded.model ? 'loaded-model' : 'heuristic', benchmark: selected.benchmark || null, profile: profiles?.get?.(selected.model) || null, resourceDecision: resourceDecision?.decision || null, fallback: options.find(option => option.model !== selected.model)?.model || null };
  }

  return {
    analyze,
    route,
    complexity(objective = '') { return analyze({ objective }).difficulty.level; },
    choose(purpose, complexityOrInput = 'medium') {
      if (typeof complexityOrInput === 'object') return route({ ...complexityOrInput, purpose }).model;
      const forced = String(complexityOrInput);
      const objective = forced === 'high' ? 'tarefa complexa com raciocinio profundo' : forced === 'medium' ? 'analise uma tarefa' : 'resposta simples';
      return route({ objective, purpose }).model;
    },
    capabilities() {
      return {
        version: '2.2.0', adaptive: true, benchmarkDriven: true, profileAware: Boolean(profiles), resourceAware: Boolean(resources), complexityEstimator: Boolean(estimator),
        models: { fast: config.fastModel, coder: config.coderModel, reasoning: config.reasoningModel, vision: config.visionModel, embedding: config.embeddingModel },
        domains: ['chat', 'coding', 'reasoning', 'research', 'documents', 'data', 'vision'],
        benchmarks: database?.listModelBenchmarks?.() || [],
      };
    },
  };
}
