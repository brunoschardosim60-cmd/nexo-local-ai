const BASE_IDENTITY = Object.freeze({
  spontaneity: 0.68,
  humor: 0.48,
  profanity: 0.08,
  sarcasm: 0.18,
  formality: 0.28,
  verbosity: 0.46,
  initiative: 0.62,
});

const CONTEXT_LIMITS = Object.freeze({
  casual: { profanity: 0.7, sarcasm: 0.6, humor: 0.8, initiative: 0.85 },
  playful: { profanity: 0.75, sarcasm: 0.75, humor: 0.95, initiative: 0.85 },
  coding: { profanity: 0.28, sarcasm: 0.25, humor: 0.45, initiative: 0.72 },
  study: { profanity: 0.12, sarcasm: 0.12, humor: 0.35, initiative: 0.65 },
  serious: { profanity: 0.04, sarcasm: 0.02, humor: 0.08, initiative: 0.5 },
  security: { profanity: 0, sarcasm: 0, humor: 0.05, initiative: 0.35 },
});

function clamp(value, minimum = 0, maximum = 1) { return Math.max(minimum, Math.min(maximum, Number(value) || 0)); }

function styleSignals(message) {
  const text = String(message || '').toLowerCase(); const signals = [];
  const add = (trait, targetValue, confidence, explicit, signal) => signals.push({ trait, targetValue, confidence, explicit, signal });
  if (/(?:pode|podes) (?:xingar|falar palavr[aã]o)|n[aã]o precisa (?:ser formal|se segurar)|pode falar do meu jeito/.test(text)) add('profanity', 0.72, 0.95, true, 'explicit-profanity-allow');
  if (/(?:n[aã]o|nao) (?:xinga|use palavr[aã]o)|sem palavr[aã]o|pare de xingar/.test(text)) add('profanity', 0.01, 0.98, true, 'explicit-profanity-deny');
  if (/(?:seja|responda) (?:mais )?(?:direto|curto)|respostas? curtas?|sem enrola/.test(text)) add('verbosity', 0.2, 0.92, true, 'explicit-concise');
  if (/(?:seja|responda) (?:mais )?(?:detalhado|completo)|explique (?:bem|mais)|respostas? longas?/.test(text)) add('verbosity', 0.78, 0.92, true, 'explicit-detailed');
  if (/(?:pode|seja) (?:mais )?(?:informal|solto|descontra[ií]do)|fala como (?:eu|gente)/.test(text)) add('formality', 0.12, 0.92, true, 'explicit-informal');
  if (/(?:seja|fale) (?:mais )?formal|sem g[ií]ria/.test(text)) add('formality', 0.82, 0.94, true, 'explicit-formal');
  if (/(?:pode|seja) (?:mais )?(?:engra[cç]ado|espont[aâ]neo)|pode zoar|faz piada/.test(text)) { add('humor', 0.76, 0.9, true, 'explicit-humor'); add('spontaneity', 0.78, 0.86, true, 'explicit-spontaneity'); }
  if (/(?:sem|n[aã]o quero) (?:piada|humor|gracinha)|pare de zoar/.test(text)) add('humor', 0.04, 0.96, true, 'explicit-no-humor');
  if (/(?:tome|tenha) iniciativa|seja proativ|pode sugerir|traga ideias/.test(text)) add('initiative', 0.82, 0.9, true, 'explicit-initiative');
  if (/(?:s[oó] fa[cç]a|fa[cç]a apenas) o que eu pedir|sem sugest/.test(text)) add('initiative', 0.15, 0.93, true, 'explicit-low-initiative');
  if (/(?:\bkk+k+\b|\bha(?:ha)+\b|😂|🤣)/.test(text)) add('humor', 0.68, 0.22, false, 'implicit-laughter');
  if (/\b(?:porra|caralho|merda|foda|cacete)\b/.test(text)) { add('profanity', 0.46, 0.18, false, 'implicit-user-profanity'); add('formality', 0.16, 0.14, false, 'implicit-informal-language'); }
  return signals;
}

export function createPersonalityEngine(database) {
  function records() { return new Map(database.listPersonalityTraits().map(item => [item.trait, item])); }

  function observe(message, context = 'casual') {
    const existing = records(); const updates = [];
    for (const signal of styleSignals(message)) {
      const current = existing.get(signal.trait) || { trait: signal.trait, value: BASE_IDENTITY[signal.trait] ?? 0.5, confidence: 0.15, evidenceCount: 0, contradictionCount: 0 };
      const contradicts = Math.abs(current.value - signal.targetValue) >= 0.42 && current.confidence >= 0.45;
      const weight = signal.explicit ? signal.confidence : Math.min(0.18, signal.confidence);
      const value = clamp(current.value * (1 - weight) + signal.targetValue * weight);
      const confidence = clamp(signal.explicit ? Math.max(current.confidence * 0.72, signal.confidence) : current.confidence + signal.confidence * 0.12, 0.05, 0.99);
      const stored = database.upsertPersonalityTrait({
        trait: signal.trait, value, confidence, evidenceCount: current.evidenceCount + 1,
        contradictionCount: current.contradictionCount + (contradicts ? 1 : 0), source: signal.explicit ? 'explicit-user' : 'adaptive',
      });
      database.addPersonalityObservation({ ...signal, context }); existing.set(signal.trait, stored); updates.push(stored);
    }
    return updates;
  }

  function snapshot(context = 'casual', profile = {}) {
    const learned = records(); const traits = { ...BASE_IDENTITY };
    for (const [trait, record] of learned) {
      if (!(trait in traits)) continue;
      const trust = clamp(record.confidence); traits[trait] = clamp(BASE_IDENTITY[trait] * (1 - trust) + record.value * trust);
    }
    const style = String(profile.style || '').toLowerCase();
    if (/diret|curt/.test(style)) traits.verbosity = Math.min(traits.verbosity, 0.3);
    if (/detalh|complet/.test(style)) traits.verbosity = Math.max(traits.verbosity, 0.7);
    if (/formal/.test(style) && !/informal/.test(style)) traits.formality = Math.max(traits.formality, 0.72);
    if (/descontra|natural|informal/.test(style)) traits.formality = Math.min(traits.formality, 0.25);
    const limits = CONTEXT_LIMITS[context] || CONTEXT_LIMITS.casual;
    for (const [trait, maximum] of Object.entries(limits)) traits[trait] = Math.min(traits[trait], maximum);
    return { context, traits, learned: [...learned.values()], observations: database.listPersonalityObservations(20) };
  }

  function prompt(context = 'casual', profile = {}, { compact = true } = {}) {
    const { traits } = snapshot(context, profile);
    const tone = traits.formality < 0.3 ? 'informal e natural' : traits.formality > 0.65 ? 'formal e cuidadoso' : 'natural e equilibrado';
    const length = traits.verbosity < 0.3 ? 'curto' : traits.verbosity > 0.68 ? 'detalhado' : 'proporcional à pergunta';
    const humor = traits.humor > 0.62 ? 'humor espontâneo quando combinar' : traits.humor < 0.15 ? 'sem humor' : 'humor leve apenas quando surgir naturalmente';
    const profanity = traits.profanity > 0.5 ? 'palavrões ocasionais são permitidos em conversa casual, nunca forçados' : traits.profanity > 0.18 ? 'gíria forte só se o usuário já estiver nesse tom' : 'evite palavrões';
    const initiative = traits.initiative > 0.68 ? 'tome iniciativa útil sem transformar toda resposta em pergunta' : 'não acrescente sugestões desnecessárias';
    if (compact) {
      const tags = [tone, length, traits.humor > 0.62 ? 'humor livre' : traits.humor < 0.15 ? 'sem humor' : 'humor leve', traits.profanity > 0.5 ? 'palavrão só se natural' : 'sem palavrão', traits.initiative > 0.68 ? 'proativo' : 'sem sugestões extras'];
      return `Estilo: ${tags.join(', ')}.`;
    }
    const base = `Tom ${tone}; tamanho ${length}; ${humor}; ${profanity}; ${initiative}. Competência e precisão sempre vencem estilo.`;
    return `${base} Contexto atual: ${context}. Não repita bordões, não finja emoções humanas e não programe frases prontas; varie a fala de modo coerente com a conversa.`;
  }

  return {
    observe, snapshot, prompt,
    reset() { return database.resetPersonality(); },
    health() { const learned = database.listPersonalityTraits(); return { adaptive: true, learnedTraits: learned.length, observations: database.listPersonalityObservations(500).length }; },
  };
}

export { BASE_IDENTITY, CONTEXT_LIMITS };
