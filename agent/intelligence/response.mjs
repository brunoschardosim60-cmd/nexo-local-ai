export function normalizePortugueseOutput(content) {
  const normalized = String(content || '')
    .replace(/\b([\p{L}]{2,})\s+\1\b/giu, '$1')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
  return normalized;
}

const CORPORATE_SENTENCE = /(?:como posso (?:eu )?(?:te |lhe |me |)ajudar(?: você)?(?: hoje)?|como posso (?:eu )?ajud[aá]-(?:lo|la)(?: hoje)?|como posso [^.!?]{0,60}(?:hoje|agora)|o que posso (?:te |lhe |)ajudar(?: hoje)?|em que posso ajudar|estou (?:aqui|pronto) (?:pra|para) ajudar)/i;
const GENERIC_GREETING_SENTENCE = /tudo (?:ótimo|bem)[,!]?\s*(?:e você|e contigo|e com você(?: também)?)/i;

export function sanitizeConversationDraft(content, context = 'casual') {
  const normalized = normalizePortugueseOutput(content);
  if (!['casual', 'playful'].includes(context) || !normalized) return normalized;
  const sentences = normalized.match(/[^.!?]+[.!?]?/g) || [normalized];
  const kept = sentences.map(item => item.trim()).filter(item => item && !CORPORATE_SENTENCE.test(item) && !GENERIC_GREETING_SENTENCE.test(item));
  return normalizePortugueseOutput(kept.join(' '));
}

function responseTerms(value) {
  return new Set(String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[a-z0-9]{2,}/g) || []);
}

function includesFact(text, fact) {
  const haystack = ` ${String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9_-]+/g, ' ')} `;
  const needle = String(fact || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9_-]+/g, ' ').trim();
  return Boolean(needle) && haystack.includes(` ${needle} `);
}

export function responseSimilarity(left, right) {
  const a = responseTerms(left); const b = responseTerms(right);
  if (!a.size || !b.size) return 0;
  let shared = 0; for (const term of a) if (b.has(term)) shared += 1;
  return shared / Math.max(a.size, b.size);
}

export function evaluateConversationResponse(content, { context = 'casual', state = {}, question = '' } = {}) {
  const text = String(content || '').trim();
  const recent = Array.isArray(state.recentResponses) ? state.recentResponses.slice(-3) : [];
  const similarity = recent.reduce((maximum, item) => Math.max(maximum, responseSimilarity(text, item)), 0);
  const casual = ['casual', 'playful'].includes(context);
  const asksIdentity = state.currentTopic === 'names' || /\b(?:seu|teu) nome\b|\be (?:qual )?o seu\b/i.test(question);
  const directIdentityQuestion = /\b(?:qual|como) (?:é |e )?(?:o )?(?:seu|teu) nome\b|\be (?:qual )?o seu\b/i.test(question);
  const directUserNameQuestion = /\b(?:qual|como) (?:é |e )?(?:o )?meu nome\b/i.test(question);
  const asksPersonaPreference = /\b(?:gosta|curte|prefere|acha)\b/i.test(question);
  const assignsAssistantAlias = /\b(?:posso|pode|vou) (?:te|lhe) chamar de\b|\b(?:teu|seu) (?:nome|apelido) agora (?:é|e|vai ser)(?:\s|$)/i.test(question);
  const asksAlias = state.referents?.current === 'assistant.alias' || /\b(?:qual|como) (?:é |e )?(?:seu|teu) apelido\b|^(?:e\s+)?apelido\??$/i.test(question.trim());
  const asksResponsePreference = Boolean(state.responseLength) && /\b(?:lembra|recorda)\b[\s\S]*\b(?:prefiro|preferência|jeito)\b/i.test(question);
  const asksSelectedIdea = Boolean(state.selectedIdea) && /\b(?:qual|o que)\b[\s\S]*\b(?:escolhid\w*|escolhemos|ficou)\b/i.test(question);
  const introducesUserName = Boolean(state.userName) && /\b(?:meu nome (?:é|e)(?:\s|$)|eu me chamo\b|me chamo\b)/i.test(question);
  const introducesPetName = Boolean(state.petName) && /\bmeu\s+(?:cachorro|cão|cao|gata?|pet)\b/i.test(question);
  const asksProject = Boolean(state.projectDescription) && /\b(?:qual|como|o que)\b[\s\S]*\bprojeto\b/i.test(question);
  const aliasPattern = state.assistantAlias ? String(state.assistantAlias).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
  const canonicalPattern = String(state.assistantCanonicalName || 'Nexo').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const greetingTurn = /^\s*(?:o+i+e*|ol+a+|i+a+i+|e+a+e+|opa+|bom dia|boa tarde|boa noite)(?:\s+(?:nexo|bb|beb[eê]|mano|cara))?[!?., ]*$/iu.test(question);
  const presenceTurn = /\b(?:t[aá]|est[aá]|voc[eê] est[aá])\s+(?:por )?a[ií]\b/iu.test(question);
  const flags = {
    empty: !text,
    templateRepetition: casual && similarity >= 0.82 && !directIdentityQuestion && !directUserNameQuestion,
    corporateClosing: casual && CORPORATE_SENTENCE.test(text),
    genericGreetingTemplate: casual && GENERIC_GREETING_SENTENCE.test(text),
    genericAiDisclaimer: casual && /\b(?:como (?:uma|um) (?:ia|assistente de ia|modelo de linguagem)|não (?:tenho|possuo) preferências?|não tenho (?:a )?capacidade de (?:curt|gost|prefer)|não (?:tenho|possuo) sentimentos|minha função é)\b/i.test(text),
    identityContradiction: asksIdentity && /\b(?:não tenho|não possuo|sem) (?:um )?nome\b/i.test(text),
    canonicalNameMissing: directIdentityQuestion && !/\bnexo\b/i.test(text),
    activeAliasMissing: directIdentityQuestion && Boolean(state.assistantAlias) && !includesFact(text, state.assistantAlias),
    alternativeNameLeak: directIdentityQuestion && !state.assistantAlias && includesFact(text, state.assistantAlternativeName || 'Eco'),
    personaPreferenceDenied: casual && asksPersonaPreference && /\bnão (?:tenho|possuo) preferências\b/i.test(text),
    topicDrift: state.referents?.current === 'assistant.alternativeName' && Boolean(state.userName) && new RegExp(`^${String(state.userName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[.! ]*$`, 'i').test(text),
    alternativeNameMissing: state.referents?.current === 'assistant.alternativeName' && !includesFact(text, state.assistantAlternativeName || 'Eco'),
    alternativeRoleConfusion: state.referents?.current === 'assistant.alternativeName' && new RegExp(`(?:chamar (?:você|voce|te) de|seu nome (?:seria|é|e))\\s+${String(state.assistantAlternativeName || 'Eco').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(text),
    correctionRoleConfusion: state.lastCorrection?.correctedField === 'userName' && String(state.lastCorrection?.message || '').trim().toLowerCase() === String(question || '').trim().toLowerCase() && Boolean(state.userName) && new RegExp(`(?:meu nome (?:é|e)\\s+${String(state.userName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|${String(state.userName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (?:é|e) o meu nome)`, 'i').test(text),
    aliasAssignmentRoleConfusion: assignsAssistantAlias && Boolean(state.assistantAlias) && new RegExp(`(?:posso|vou) (?:te|lhe) chamar de\\s+${String(state.assistantAlias).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(text),
    aliasAssignmentReciprocalConfusion: assignsAssistantAlias && /\bposso te chamar (?:assim|também|de)\b/i.test(text),
    aliasUsedAsUserName: assignsAssistantAlias && Boolean(aliasPattern) && new RegExp(`^(?:ol[aá]|oi|e a[ií]|eae)[,! ]+${aliasPattern}\\b`, 'i').test(text),
    canonicalUsedAsUserName: assignsAssistantAlias && new RegExp(`[,—-]\\s*${canonicalPattern}[.! ]*$`, 'i').test(text),
    aliasAssignmentRejected: assignsAssistantAlias && Boolean(aliasPattern) && /\b(?:mas|porém|porem)\s+(?:eu\s+)?prefiro\s+(?:ser chamado de\s+)?nexo\b/i.test(text),
    aliasAnswerMismatch: asksAlias && (state.assistantAlias ? !includesFact(text, state.assistantAlias) : /\beco\b/i.test(text)),
    aliasPreferenceRoleConfusion: Boolean(aliasPattern) && asksPersonaPreference && includesFact(question, state.assistantAlias) && (!/\b(?:curto|gosto|acho|prefiro|combina)\b/i.test(text) || new RegExp(`^(?:e a[ií]|eae|ol[aá]|oi)[,! ]+${aliasPattern}\\b`, 'i').test(text)),
    responsePreferenceMissing: asksResponsePreference && !/\b(?:curt|diret|r[aá]pid)\w*\b/i.test(text),
    selectedIdeaMissing: asksSelectedIdea && !includesFact(text, state.selectedIdea),
    userNameAcknowledgementMissing: introducesUserName && !includesFact(text, state.userName),
    petRoleConfusion: introducesPetName && (!includesFact(text, state.petName) || /\b(?:meu nome|o meu nome)\b/i.test(text)),
    projectFactMissing: asksProject && !includesFact(text, state.projectDescription),
    promptLeak: text.includes(' | ') || recent.filter(item => item.length >= 12 && text.includes(item)).length >= 2,
    greetingSupportClosing: greetingTurn && /\b(?:ajud|precisa|quer|necessita)\w*\b/iu.test(text),
    sociallyUnderdeveloped: casual && (greetingTurn || presenceTurn) && (text.match(/[\p{L}\p{N}]+/gu) || []).length < 7,
    greetingTimeMismatch: /^\s*bom dia\b/iu.test(question) && /^\s*boa noite\b/iu.test(text),
    presenceRoleConfusion: presenceTurn && !/\b(?:estou|t[oô]|aqui|sim)\b/iu.test(text),
    forgottenAliasFabricated: /\b(?:esquece|esqueça|não use mais|remove|tira)\b/iu.test(question) && /\b(?:vou me chamar|meu apelido (?:é|e)|eco)\b/iu.test(text),
    obviousCasualIntentDodged: /\b(?:o que|oq)\s+(?:podemos|dá para|da pra)\b/iu.test(question) && /\?\s*$/.test(text) && !/\b(?:projeto|criar|estudar|pesquisar|conversar|programar|ideia)\b/iu.test(text),
    unsupportedCasualDomain: !state.currentTopic && /\b(?:o que|oq)\s+(?:podemos|dá para|da pra)\b/iu.test(question) && /\b(?:marketing|empresa|clientes?|reunião|marca)\b/iu.test(text),
    malformedAssembly: /\b(?:soumigo|souve|estouando|podeu|posso\s+posso|eu\s+eu)\b/i.test(text),
  };
  const failures = Object.entries(flags).filter(([, failed]) => failed).map(([name]) => name);
  return { pass: failures.length === 0, failures, similarity: Number(similarity.toFixed(3)) };
}

export function createResponseIntelligence({ personality }) {
  function plan({ question, complexity, context, epistemic }) {
    const technical = ['coding', 'technical', 'security', 'study'].includes(
      context,
    );
    const social = ['casual', 'playful'].includes(context);
    const depth =
      complexity?.level === 'trivial'
        ? social ? 'social' : 'one-line'
        : complexity?.level === 'simple'
          ? 'compact'
          : ['complex', 'agentic'].includes(complexity?.level)
            ? 'deep'
            : 'balanced';
    return {
      depth,
      technical,
      lead: technical
        ? 'answer-first'
        : context === 'casual' || context === 'playful'
          ? 'natural'
          : 'answer-first',
      uncertainty: epistemic?.state || 'INFERRED',
      avoid: [
        'generic-enthusiasm',
        'question-repetition',
        'forced-summary',
        'unnecessary-list',
      ],
      questionLength: String(question || '').length,
    };
  }
  function instruction(input) {
    const answerPlan = plan(input);
    const style = personality.prompt(input.context, input.profile, {
      compact: answerPlan.depth !== 'deep',
    });
    const depth =
      answerPlan.depth === 'one-line'
        ? 'Responda em uma linha, sem introdução nem pergunta final.'
        : answerPlan.depth === 'social'
          ? 'Responda em uma a três frases curtas. Seja vivo e conversador, não monossilábico.'
        : answerPlan.depth === 'compact'
          ? 'Seja curto e completo; use lista somente se melhorar a leitura.'
          : answerPlan.depth === 'deep'
            ? 'Estruture apenas quando necessário, comece pela conclusão e sustente cada ponto importante.'
            : 'Dê a resposta diretamente e explique na medida certa.';
    const conversation = ['casual', 'playful'].includes(input.context)
      ? 'Trate isto como continuação de uma relação, não como atendimento. Seja extrovertido, interessado e presente: reaja ao que a pessoa disse, compartilhe uma ideia útil e demonstre curiosidade real pelo assunto. Espelhe de leve ritmo e informalidade sem copiar erros. Em conversa aberta, uma pergunta contextual ou uma sugestão concreta é bem-vinda; não use pergunta automática nem fechamento de suporte. Não responda só uma palavra, exceto quando a pessoa pedir um fato direto. Pode brincar e expressar preferências da persona sem alegar emoções biológicas. Varie a formulação em relação às respostas recentes.'
      : 'Não encerre oferecendo ajuda de forma genérica; só faça uma pergunta final quando ela destravar o próximo passo.';
    return {
      plan: answerPlan,
      prompt: `${depth} ${conversation} Evite entusiasmo genérico, repetir a pergunta, bordões e conclusões redundantes. ${style}`,
    };
  }
  return {
    plan, instruction, evaluate: evaluateConversationResponse,
    health: () => ({
      separated: ['reasoning', 'answer-planning', 'personality-rendering'],
      antiPatterns: 6,
      structuralConversationSanity: true,
    }),
  };
}
