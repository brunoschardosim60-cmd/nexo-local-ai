const ALLOWED_KINDS = new Set(['working', 'episodic', 'semantic', 'procedural', 'user', 'project', 'style']);
const TEMPORARY = /^(?:oi|ol[aá]|iai|obrigad|valeu|sim|n[aã]o|ok|beleza)[!.?\s]*$/i;
const FUTURE_VALUE = /\b(prefiro|gosto|n[aã]o gosto|sempre|nunca|lembre|meu nome|me chama|projeto|decidimos|padr[aã]o|procedimento|configura[cç][aã]o|estilo)\b/i;

function normalized(value) { return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
function words(value) { return new Set(normalized(value).split(' ').filter(word => word.length >= 3)); }
function overlap(left, right) {
  const a = words(left); const b = words(right); if (!a.size || !b.size) return 0;
  let common = 0; for (const word of a) if (b.has(word)) common += 1;
  return common / Math.max(a.size, b.size);
}

export function createMemoryGate(database) {
  function evaluate(content, options = {}) {
    const clean = String(content || '').trim(); const kind = ALLOWED_KINDS.has(options.kind) ? options.kind : 'episodic';
    if (clean.length < 8 || TEMPORARY.test(clean)) return { persist: false, reason: 'temporário ou sem valor futuro', kind };
    const explicit = options.explicit === true || FUTURE_VALUE.test(clean) || ['user', 'project', 'procedural', 'style', 'semantic'].includes(kind);
    if (!explicit && kind === 'episodic' && clean.length < 120) return { persist: false, reason: 'episódio curto sem sinal de valor futuro', kind };
    const existing = database.listMemories(300);
    const ranked = existing.map(item => ({ item, similarity: overlap(clean, item.content) })).sort((left, right) => right.similarity - left.similarity);
    const duplicate = ranked.find(candidate => candidate.similarity >= 0.88);
    const negated = /\b(n[aã]o|nunca|parei|deixei de)\b/i.test(clean);
    const contradiction = ranked.find(candidate => candidate.similarity >= 0.55 && negated !== /\b(n[aã]o|nunca|parei|deixei de)\b/i.test(candidate.item.content));
    return { persist: true, reason: explicit ? 'valor futuro explícito' : 'episódio relevante', kind, duplicateId: duplicate?.item.id || null, contradictionId: contradiction?.item.id || null };
  }
  return { evaluate, kinds: [...ALLOWED_KINDS], health: () => ({ enabled: true, kinds: [...ALLOWED_KINDS], rejectsTemporary: true, deduplicates: true, contradictions: true }) };
}
