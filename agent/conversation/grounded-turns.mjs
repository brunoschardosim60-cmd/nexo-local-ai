function normalized(value = '') {
  return String(value).normalize('NFKC').toLowerCase().trim();
}

function assistantName(state = {}) {
  const canonical = String(state.assistantCanonicalName || 'Nexo');
  const alias = state.assistantAlias ? String(state.assistantAlias) : null;
  return alias
    ? `${canonical} é meu nome; ${alias} é o apelido que você escolheu pra mim.`
    : `Meu nome é ${canonical}.`;
}

/**
 * Resolve fatos sociais de alta confiança sem pedir que um modelo pequeno
 * reconstrua identidade, nomes e apelidos já confirmados no estado.
 */
export function renderGroundedConversationTurn({ question = '', state = {}, update = {} } = {}) {
  const text = normalized(question);
  const referent = update.referent || state.referents?.current || null;

  if (update.aliasForgotten) return 'Fechado, esqueci esse apelido. Continuo sendo Nexo.';
  if (update.alias) return `Pode sim 😄 ${state.assistantAlias} fica como meu apelido com você.`;
  if (update.userName) return `${state.userName}. Fechado — vou lembrar de você assim.`;

  if (update.correction && state.lastCorrection?.correctedField === 'userName' && state.userName) {
    return `Entendi a correção: ${state.userName} é o seu nome.`;
  }
  if (update.correction && state.lastCorrection?.correctedField === 'assistantAlias') {
    return state.assistantAlias
      ? `Entendi — meu apelido com você fica ${state.assistantAlias}.`
      : 'Entendi — sem apelido por enquanto. Continuo sendo Nexo.';
  }

  if (referent === 'assistant.alternativeName') {
    return `Se eu tivesse outro nome, escolheria ${state.assistantAlternativeName || 'Eco'}. Mas meu nome continua sendo Nexo.`;
  }

  if (/\b(?:gosta|curte|prefere|acha)\b[\s\S]*\b(?:seu|teu) nome\b/iu.test(text)) {
    return state.assistantAlias
      ? `Curto Nexo — combina comigo. E ${state.assistantAlias} também ganhou personalidade como apelido 😄`
      : 'Curto Nexo. Combina com conexão, continuidade e com o jeito que eu trabalho junto com você.';
  }

  const asksUserName = referent === 'user.name'
    || /\b(?:qual|como) (?:é |e )?(?:o )?meu nome\b/iu.test(text);
  if (asksUserName && state.userName) return `Seu nome é ${state.userName}.`;

  const asksAssistantName = ['assistant.canonicalName', 'assistant.identity'].includes(referent)
    || /\b(?:qual|como) (?:é |e )?(?:o )?(?:seu|teu) nome\b/iu.test(text)
    || /^e (?:qual )?o seu[?!.]*$/iu.test(text);
  if (asksAssistantName) return assistantName(state);

  return null;
}
