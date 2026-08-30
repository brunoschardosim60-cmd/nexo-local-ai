const AGENT_PATTERNS = /(?:\b(?:corrija|implemente|altere|modifique|edite|crie|rode|execute|publique)\b[\s\S]*\b(?:projeto|repositorio|repositório|arquivo|codigo|código|site|api|servidor|testes?)\b|\b(?:analise|investigue|teste)\b[\s\S]*\b(?:meu|minha|este|esta|o nosso|a nossa)\s+(?:projeto|repositorio|repositório|arquivo|codigo|código|site|api|servidor|testes?)\b)/i;
const DEEP_PATTERNS = /\b(?:explique em detalhes|analise|compare|pesquise|investigue|arquitetura|estrategia|estratégia|documento|planilha|programa|codigo|código|api|banco de dados)\b/i;
const MEMORY_PATTERNS = /\b(?:lembra|lembre|memoria|memória|conversamos|eu disse|eu falei|meu|minha|meus|minhas|prefiro|gosto|costumo)\b/i;
const DOCUMENT_PATTERNS = /\b(?:arquivo|documento|anexo|pdf|docx|xlsx|csv|texto enviado|planilha)\b/i;
const SERIOUS_PATTERNS = /\b(?:luto|morte|morreu|doença|doenca|depress|ansiedade|suic|violência|violencia|abuso|demitid|divórcio|divorcio|hospital)\b/i;
const SECURITY_PATTERNS = /\b(?:senha|credencial|token|segredo|vulnerabilidade|malware|ransomware|invas|hack|segurança|seguranca|firewall|vpn)\b/i;
const CODING_PATTERNS = /\b(?:codigo|código|bug|erro|typescript|javascript|python|react|node|api|função|funcao|classe|build|teste|program)\b/i;
const STUDY_PATTERNS = /\b(?:estud|prova|faculdade|escola|aprender|matéria|materia|exercício|exercicio|explica)\b/i;
const PLAYFUL_PATTERNS = /(?:\bkk+k+\b|\bha(?:ha)+\b|\brs+\b|😂|🤣|\bzoa|brincadeira|meme\b)/i;
const FRUSTRATED_PATTERNS = /\b(?:irritad|frustrad|cansad|de novo|n[aã]o funciona|que saco|puta merda|porra)\b/i;
const SENSITIVE_PATTERNS = /\b(?:trauma|luto|suic|abuso|viol[eê]ncia|depress|doen[cç]a grave|diagn[oó]stico)\b/i;

export function normalizeIntent(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[?!.,]+$/g, '');
}

export function classifyConversationContext(question = '') {
  if (SECURITY_PATTERNS.test(question)) return 'security';
  if (SENSITIVE_PATTERNS.test(question)) return 'sensitive';
  if (FRUSTRATED_PATTERNS.test(question)) return 'frustrated';
  if (SERIOUS_PATTERNS.test(question)) return 'serious';
  if (CODING_PATTERNS.test(question)) return 'technical';
  if (STUDY_PATTERNS.test(question)) return 'study';
  if (PLAYFUL_PATTERNS.test(question)) return 'playful';
  return 'casual';
}

export function instantAnswer(question, { now = new Date(), weather = null } = {}) {
  const normalized = normalizeIntent(question);
  const clock = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(now);
  const asksTime = /(que horas|qual.*horario|horas agora|hora agora|me diga.*hora)/.test(normalized)
    || /(?:(?:apenas|so|somente).*(?:hora|horario)|(?:perguntei|pedi|quero).*(?:hora|horario)|(?:hora|horario).*(?:apenas|so|somente))/.test(normalized);
  if (asksTime) return `Agora são **${clock}**.`;
  if (/(data de hoje|que dia e hoje|qual.*data|dia de hoje)/.test(normalized)) return `Hoje é **${date}**.`;
  if (/^(?:qual (?:e|é) )?(?:a )?(?:temperatura|clima|tempo)(?: agora| hoje)?$/.test(normalized) && weather) {
    return `Agora está **${weather.temperature}°C** em ${weather.label}${weather.description ? `, com ${String(weather.description).toLowerCase()}` : ''}.`;
  }
  return null;
}

export function routeIntent({ question, mode = 'Geral', effort = 'Médio', hasDocuments = false, webSearch = false, weather = null, now = new Date() }) {
  const immediate = instantAnswer(question, { now, weather });
  const context = classifyConversationContext(question);
  const presence = /^(?:(?:oi|ola|iai|e ai|eae|opa)(?:\s+nexo)?|(?:nexo[,]?\s*)?(?:ta|esta|voce esta) por ai)$/.test(normalizeIntent(question));
  if (mode === 'Agente' || AGENT_PATTERNS.test(question)) {
    return { route: 'agent', context, reason: mode === 'Agente' ? 'modo-agente' : 'ação-local-complexa', needs: { memory: true, rag: hasDocuments || DOCUMENT_PATTERNS.test(question), research: webSearch } };
  }
  if (immediate) return { route: 'instant', context, reason: 'resposta-determinística', answer: immediate, needs: { memory: false, rag: false, research: false } };
  const forcedDeep = ['Alto', 'Extra alto'].includes(effort);
  const deep = forcedDeep || webSearch || hasDocuments || ['Programar', 'Imagens', 'Planilhas'].includes(mode) || question.length > 420 || DEEP_PATTERNS.test(question);
  return {
    route: deep ? 'deep' : 'fast', context, reason: deep ? forcedDeep ? 'esforço-selecionado' : 'contexto-complexo' : presence ? 'presença-casual' : 'conversa-leve',
    needs: { memory: MEMORY_PATTERNS.test(question), rag: hasDocuments || DOCUMENT_PATTERNS.test(question), research: webSearch },
  };
}

export function compactHistory(messages = [], { maxMessages = 6, maxChars = 5_000 } = {}) {
  const candidates = messages.filter(item => ['user', 'assistant'].includes(item?.role) && typeof item.content === 'string' && item.kind !== 'task')
    .slice(-maxMessages).map(item => ({ role: item.role, content: item.content.slice(0, 2_500) }));
  const output = []; let used = 0;
  for (const item of candidates.reverse()) {
    const remaining = maxChars - used; if (remaining <= 0) break;
    const content = item.content.length <= remaining ? item.content : item.content.slice(-remaining);
    output.push({ role: item.role, content }); used += content.length;
  }
  return output.reverse();
}
