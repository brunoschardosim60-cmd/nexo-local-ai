import { NEXO_SELF_MODEL, selfModelPrompt, selfSnapshot } from './self-model.mjs';

const MAX_RESPONSES = 4;
const MAX_ENTITIES = 8;

function clean(value, limit = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function titleCaseName(value) {
  return clean(value, 60)
    .split(/\s+/)
    .map(part => part ? `${part[0].toLocaleUpperCase('pt-BR')}${part.slice(1).toLocaleLowerCase('pt-BR')}` : '')
    .join(' ');
}

export function normalizeCasualInput(value = '') {
  let text = String(value).normalize('NFKC').toLowerCase().trim();
  const replacements = new Map([
    ['oq', 'o que'], ['pq', 'por que'], ['vc', 'você'], ['vcs', 'vocês'],
    ['agr', 'agora'], ['tbm', 'também'], ['qm', 'quem'], ['ns', 'não sei'],
    ['q', 'que'], ['ta', 'está'], ['tá', 'está'], ['bebe', 'bebê'],
  ]);
  text = text.replace(/[\p{L}\p{N}_]+/gu, token => replacements.get(token) || token);
  return text.replace(/\s+/g, ' ');
}

export function isCasualGreeting(value = '') {
  const text = normalizeCasualInput(value).replace(/[!?.,]+$/g, '').trim();
  return /^(?:o+i+e*|ol+a+|i+a+i+|e+a+e+|e+ai+|opa+)(?:\s+(?:nexo|bb|bebê|bebe|mano|cara))?$/iu.test(text);
}

function explicitUserName(value) {
  const text = normalizeCasualInput(value);
  const match = text.match(/\b(?:meu nome (?:é|e)|eu me chamo|me chamo|pode me chamar de)\s+([\p{L}][\p{L}'-]{1,39}(?:\s+[\p{L}][\p{L}'-]{1,39})?)/iu);
  return match ? titleCaseName(match[1]) : null;
}

function explicitAssistantAlias(value, state) {
  const text = clean(value, 12_000);
  const direct = text.match(/\b(?:posso|pode|vou) (?:te|lhe) chamar de\s+([\p{L}\p{N}_-]{1,30})(?=$|[\s?!.,])/iu)
    || text.match(/\b(?:teu|seu) (?:nome|apelido) agora (?:é|e|vai ser)\s+([\p{L}\p{N}_-]{1,30})(?=$|[\s?!.,])/iu);
  if (direct) return clean(direct[1], 30);
  const correction = text.match(/^(?:não|nao)[, ]+(?:melhor|prefiro|fica)\s+([\p{L}\p{N}_-]{1,30})(?=$|[\s?!.,])/iu);
  if (correction && (state.currentTopic === 'names' || state.assistantAlias)) return clean(correction[1], 30);
  return null;
}

function forgetsAlias(value, state) {
  const text = normalizeCasualInput(value);
  if (!/\b(?:esquece|esqueça|não use mais|tira|remove)\b/iu.test(text)) return false;
  return /\b(?:apelido|nome)\b/iu.test(text)
    || (state.assistantAlias && text.includes(String(state.assistantAlias).toLowerCase()));
}

function inferTopic(value, previous = null) {
  const text = normalizeCasualInput(value);
  if (/\b(?:nome|cham|apelido)\w*\b/iu.test(text)) return 'names';
  if (/\b(?:bug|erro|c[oó]digo|program|typescript|javascript|python|react|api)\w*\b/iu.test(text)) return 'coding';
  if (/\b(?:estud|prova|mat[eé]ria|aprender)\w*\b/iu.test(text)) return 'study';
  if (/\b(?:seguran[cç]a|senha|token|vulnerabilidade)\w*\b/iu.test(text)) return 'security';
  return previous;
}

function inferReferent(value, state) {
  const text = normalizeCasualInput(value).replace(/[?!.,]+$/g, '');
  if (state.currentTopic === 'names' && /\b(?:se tivesse|se tivesse outro|qual seria)\b/u.test(text)) return 'assistant.alternativeName';
  if (state.currentTopic === 'names' && state.userName && text.includes(state.userName.toLowerCase()) && /\b(?:meu|minha)\b/u.test(text)) return 'user.name';
  if (/^(?:e\s+)?(?:qual\s+)?(?:é\s+)?(?:o\s+)?seu(?:\s+nome)?$/u.test(text)) {
    return state.currentTopic === 'names' ? 'assistant.canonicalName' : 'assistant';
  }
  if (/^(?:e\s+)?(?:qual\s+)?(?:é\s+)?(?:o\s+)?meu(?:\s+nome)?$/u.test(text)) {
    return state.currentTopic === 'names' ? 'user.name' : 'user';
  }
  if (/^(?:e\s+)?(?:voc[eê]|tu)$/u.test(text)) return state.currentTopic === 'names' ? 'assistant.identity' : 'assistant';
  if (/\b(?:isso|esse|o mesmo)\b/u.test(text)) return state.referents?.lastSubject || state.currentTopic || null;
  return null;
}

function defaultState(sessionId, profile = {}, relationship = null) {
  const now = new Date().toISOString();
  return {
    version: 1,
    sessionId,
    userName: clean(profile.name, 60) || relationship?.userName || null,
    assistantCanonicalName: NEXO_SELF_MODEL.canonicalName,
    assistantAlternativeName: NEXO_SELF_MODEL.personalityProfile.alternativeName,
    assistantAlias: relationship?.assistantAlias || null,
    aliasMetadata: relationship?.aliasMetadata || null,
    currentTopic: null,
    recentEntities: [],
    referents: {},
    tone: 'casual',
    socialMode: 'CASUAL',
    ongoingJokes: [],
    pendingQuestion: null,
    lastCorrection: null,
    recentResponses: [],
    greetingCount: 0,
    historySeenCount: 0,
    turnCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function relationshipId(profile, state) {
  const name = clean(profile?.relationshipId || profile?.name || state?.userName || 'anonymous', 80)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  return `conversation:relationship:${name || 'anonymous'}`;
}

function boundedState(state) {
  return {
    ...state,
    assistantCanonicalName: NEXO_SELF_MODEL.canonicalName,
    assistantAlternativeName: NEXO_SELF_MODEL.personalityProfile.alternativeName,
    recentEntities: [...new Set((state.recentEntities || []).map(item => clean(item, 60)).filter(Boolean))].slice(-MAX_ENTITIES),
    ongoingJokes: (state.ongoingJokes || []).slice(-3),
    recentResponses: (state.recentResponses || []).map(item => clean(item, 500)).filter(Boolean).slice(-MAX_RESPONSES),
    updatedAt: new Date().toISOString(),
  };
}

function applyUserMessage(state, message, { context = 'casual', profile = {} } = {}) {
  const question = clean(message, 12_000);
  const previousTopic = state.currentTopic;
  const correction = /^(?:mas|não|nao|na verdade|quis dizer|correção|correcao)\b/iu.test(normalizeCasualInput(question));
  const userName = explicitUserName(question);
  const alias = explicitAssistantAlias(question, state);
  const aliasForgotten = forgetsAlias(question, state);
  const topic = inferTopic(question, previousTopic);
  const referent = inferReferent(question, { ...state, currentTopic: topic });

  if (userName) {
    state.userName = userName;
    state.recentEntities.push(userName);
  }
  if (aliasForgotten) {
    state.assistantAlias = null;
    state.aliasMetadata = null;
  } else if (alias && alias.toLowerCase() !== NEXO_SELF_MODEL.canonicalName.toLowerCase()) {
    state.assistantAlias = alias;
    state.aliasMetadata = {
      alias,
      whoAssignedIt: state.userName || clean(profile.name, 60) || 'user',
      scope: 'user-relationship',
      confidence: 1,
      source: 'USER_EXPLICIT',
      createdAt: new Date().toISOString(),
    };
    state.recentEntities.push(alias);
  }
  state.currentTopic = topic;
  state.tone = context;
  state.socialMode = String(context || 'casual').toUpperCase();
  state.referents = {
    ...state.referents,
    user: state.userName || 'user',
    assistant: NEXO_SELF_MODEL.canonicalName,
    current: referent,
    ...(topic ? { lastSubject: topic } : {}),
  };
  state.lastCorrection = correction
    ? { message: question, correctedField: userName || referent === 'user.name' ? 'userName' : alias || aliasForgotten ? 'assistantAlias' : topic || 'interpretation', at: new Date().toISOString() }
    : state.lastCorrection;
  if (isCasualGreeting(question)) state.greetingCount += 1;
  state.pendingQuestion = /\?\s*$/.test(question) ? question : null;
  state.turnCount += 1;
  return { userName, alias, aliasForgotten, correction, referent, normalized: normalizeCasualInput(question) };
}

function compactPrompt(state) {
  const lines = [selfModelPrompt(state), 'ESTADO CONVERSACIONAL ATUAL (fatos confirmados e contexto de trabalho):'];
  if (state.userName) lines.push(`Nome do usuário: ${state.userName}.`);
  lines.push(`Tom/modo social: ${state.tone}/${state.socialMode}.`);
  if (state.currentTopic) lines.push(`Assunto atual: ${state.currentTopic}.`);
  if (state.referents?.current) lines.push(`Referente da mensagem atual: ${state.referents.current}.`);
  if (state.lastCorrection) lines.push(`Correção recente do usuário: ${state.lastCorrection.message}. A interpretação corrigida vence a anterior.`);
  if (state.greetingCount > 1) lines.push(`O usuário já cumprimentou ${state.greetingCount} vezes nesta conversa; reconheça continuidade e não repita a mesma saudação.`);
  if (state.recentResponses.length) lines.push(`Aberturas/respostas recentes do Nexo a não repetir literalmente: ${state.recentResponses.slice(-3).map(item => JSON.stringify(item.slice(0, 160))).join('; ')}.`);
  lines.push('Resolva referências pelos turnos recentes antes de buscar memória longa. Em ambiguidades casuais, prováveis e reversíveis, faça a melhor interpretação sem pedir contexto desnecessário.');
  return lines.join('\n');
}

export function createConversationStateEngine(database) {
  const live = new Map();

  function load({ sessionId = 'main', profile = {} } = {}) {
    const safeId = clean(sessionId, 160) || 'main';
    if (live.has(safeId)) return live.get(safeId);
    const relationship = database.getSession(relationshipId(profile, { userName: profile.name }))?.state || null;
    const saved = database.getSession(`conversation:state:${safeId}`)?.state || null;
    const state = boundedState({ ...defaultState(safeId, profile, relationship), ...saved });
    if (!state.userName && profile.name) state.userName = clean(profile.name, 60);
    live.set(safeId, state);
    return state;
  }

  function persist(state, profile = {}) {
    const bounded = boundedState(state);
    live.set(bounded.sessionId, bounded);
    database.putSession(`conversation:state:${bounded.sessionId}`, bounded);
    if (bounded.userName || bounded.assistantAlias || bounded.aliasMetadata) {
      database.putSession(relationshipId(profile, bounded), {
        userName: bounded.userName,
        assistantAlias: bounded.assistantAlias,
        aliasMetadata: bounded.aliasMetadata,
        updatedAt: bounded.updatedAt,
      });
    }
    return bounded;
  }

  function observeTurn({ sessionId = 'main', question, history = [], profile = {}, context = 'casual' }) {
    let state = load({ sessionId, profile });
    const safeHistory = Array.isArray(history) ? history.filter(item => ['user', 'assistant'].includes(item?.role) && typeof item.content === 'string') : [];
    if (safeHistory.length < state.historySeenCount) {
      const relationship = database.getSession(relationshipId(profile, state))?.state || null;
      state = defaultState(state.sessionId, profile, relationship);
    }
    for (const item of safeHistory.slice(state.historySeenCount)) {
      if (item.role === 'user') applyUserMessage(state, item.content, { context, profile });
      else state.recentResponses.push(clean(item.content, 500));
    }
    state.historySeenCount = safeHistory.length;
    const update = applyUserMessage(state, question, { context, profile });
    state = persist(state, profile);
    return {
      state,
      update,
      self: selfSnapshot(state),
      prompt: compactPrompt(state),
      workingSatisfiesMemory: Boolean(update.userName || update.alias || update.aliasForgotten || state.currentTopic === 'names' || update.referent),
      requiresEscalation: Boolean(update.referent && !state.currentTopic && !state.userName),
    };
  }

  function completeTurn({ sessionId = 'main', content, profile = {}, historyLength = null }) {
    const state = load({ sessionId, profile });
    state.recentResponses.push(clean(content, 500));
    if (Number.isInteger(historyLength)) state.historySeenCount = Math.max(state.historySeenCount, historyLength + 2);
    state.pendingQuestion = null;
    return persist(state, profile);
  }

  function forgetAlias({ sessionId = 'main', profile = {} } = {}) {
    const state = load({ sessionId, profile });
    state.assistantAlias = null;
    state.aliasMetadata = null;
    return persist(state, profile);
  }

  function snapshot(input = {}) { return structuredClone(load(input)); }

  return {
    observeTurn,
    completeTurn,
    forgetAlias,
    snapshot,
    prompt: compactPrompt,
    self: state => selfSnapshot(state),
    health: () => ({ version: '1.0.0', canonicalName: NEXO_SELF_MODEL.canonicalName, activeConversations: live.size, persistent: true, longTermRelationshipAlias: true }),
  };
}

export const conversationStateInternals = {
  explicitUserName,
  explicitAssistantAlias,
  forgetsAlias,
  inferReferent,
  inferTopic,
  applyUserMessage,
  compactPrompt,
};
