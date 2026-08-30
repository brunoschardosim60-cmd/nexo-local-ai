const ALLOWED_KINDS = new Set(['working', 'episodic', 'semantic', 'procedural', 'user', 'project', 'style', 'error', 'decision']);
const TEMPORARY = /^(?:oi|ol[aá]|iai|obrigad|valeu|sim|n[aã]o|ok|beleza)[!.?\s]*$/i;
const FUTURE_VALUE = /\b(prefiro|gosto|n[aã]o gosto|sempre|nunca|lembre|memorize|guarde|meu nome|me chama|projeto|decidimos|padr[aã]o|procedimento|configura[cç][aã]o|estilo|corrigimos|causa|solu[cç][aã]o)\b/i;
const SENSITIVE = /\b(senha|password|token|api[_ -]?key|chave privada|private key|cart[aã]o|cvv|cpf|rg|diagn[oó]stico|prontu[aá]rio)\b/i;

function normalized(value) { return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
function words(value) { return new Set(normalized(value).split(' ').filter(word => word.length >= 3)); }
function overlap(left, right) {
  const a = words(left); const b = words(right); if (!a.size || !b.size) return 0;
  let common = 0; for (const word of a) if (b.has(word)) common += 1;
  return common / Math.max(a.size, b.size);
}
function isNegated(value) { return /\b(n[aã]o|nunca|parei|deixei de|n[aã]o mais|agora uso|troquei)\b/i.test(value); }

export function createMemoryGate(database) {
  function evaluate(content, options = {}) {
    const clean = String(content || '').trim(); const kind = ALLOWED_KINDS.has(options.kind) ? options.kind : 'episodic';
    const scope = options.scope || 'global'; const explicit = options.explicit === true || FUTURE_VALUE.test(clean);
    const sensitivity = SENSITIVE.test(clean) ? 'RESTRICTED' : 'NORMAL';
    const scores = { useful: explicit || ['procedural', 'decision', 'error', 'project', 'semantic'].includes(kind) ? 1 : Math.min(1, clean.length / 220), novel: 1, stable: ['user', 'style', 'procedural', 'project', 'semantic', 'decision'].includes(kind) ? 0.9 : 0.55, confident: Math.max(0, Math.min(1, Number(options.confidence ?? 0.7))), scoped: scope === 'global' ? 0.7 : 1, sensitivity: sensitivity === 'RESTRICTED' ? 0.1 : 1 };
    if (clean.length < 8 || TEMPORARY.test(clean)) return { persist: false, reason: 'temporário ou sem valor futuro', kind, scope, sensitivity, scores };
    if (sensitivity === 'RESTRICTED' && !explicit) return { persist: false, reason: 'dado potencialmente sensível sem pedido explícito', kind, scope, sensitivity, scores };
    if (!explicit && kind === 'episodic' && clean.length < 120) return { persist: false, reason: 'episódio curto sem sinal de valor futuro', kind, scope, sensitivity, scores };
    const existing = database.listMemories({ limit: 500, scope, status: ['ACTIVE', 'UNCERTAIN'] });
    const ranked = existing.map(item => ({ item, similarity: overlap(clean, item.content) })).sort((left, right) => right.similarity - left.similarity);
    const duplicate = ranked.find(candidate => candidate.similarity >= 0.88 && isNegated(clean) === isNegated(candidate.item.content));
    const contradiction = ranked.find(candidate => candidate.similarity >= 0.5 && isNegated(clean) !== isNegated(candidate.item.content));
    scores.novel = 1 - (ranked[0]?.similarity || 0);
    const aggregate = scores.useful * 0.28 + scores.novel * 0.18 + scores.stable * 0.18 + scores.confident * 0.16 + scores.scoped * 0.10 + scores.sensitivity * 0.10;
    return { persist: explicit || aggregate >= 0.56, reason: explicit ? 'valor futuro explícito' : `gate-v2:${aggregate.toFixed(2)}`, kind, scope, sensitivity, scores: { ...scores, aggregate }, duplicateId: duplicate?.item.id || null, contradictionId: contradiction?.item.id || null };
  }
  return { evaluate, kinds: [...ALLOWED_KINDS], health: () => ({ enabled: true, version: '2.0.0', kinds: [...ALLOWED_KINDS], rejectsTemporary: true, detectsSensitivity: true, deduplicates: true, contradictions: true, scoredGate: true }) };
}
