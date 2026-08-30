export function normalizePortugueseOutput(content) {
  const normalized = String(content || '')
    .replace(/\b([\p{L}]{2,})\s+\1\b/giu, '$1')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
  return normalized;
}

const CORPORATE_SENTENCE = /(?:como posso (?:eu )?(?:te |lhe |me |)ajudar(?: você)?(?: hoje)?|como posso (?:eu )?ajud[aá]-(?:lo|la)(?: hoje)?|como posso [^.!?]{0,60}(?:hoje|agora)|em que posso ajudar|estou aqui para ajudar)/i;
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
  const assignsAssistantAlias = /\b(?:posso|pode|vou) (?:te|lhe) chamar de\b/i.test(question);
  const flags = {
    empty: !text,
    templateRepetition: casual && similarity >= 0.82 && !directIdentityQuestion && !directUserNameQuestion,
    corporateClosing: casual && CORPORATE_SENTENCE.test(text),
    genericGreetingTemplate: casual && GENERIC_GREETING_SENTENCE.test(text),
    genericAiDisclaimer: casual && /\b(?:como (?:uma|um) (?:ia|assistente de ia|modelo de linguagem)|não (?:tenho|possuo) (?:sentimentos|preferências pessoais)|minha função é)\b/i.test(text),
    identityContradiction: asksIdentity && /\b(?:não tenho|não possuo|sem) (?:um )?nome\b/i.test(text),
    canonicalNameMissing: directIdentityQuestion && !/\bnexo\b/i.test(text),
    activeAliasMissing: directIdentityQuestion && Boolean(state.assistantAlias) && !includesFact(text, state.assistantAlias),
    personaPreferenceDenied: casual && asksPersonaPreference && /\bnão (?:tenho|possuo) preferências\b/i.test(text),
    topicDrift: state.referents?.current === 'assistant.alternativeName' && Boolean(state.userName) && new RegExp(`^${String(state.userName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[.! ]*$`, 'i').test(text),
    alternativeNameMissing: state.referents?.current === 'assistant.alternativeName' && !includesFact(text, state.assistantAlternativeName || 'Eco'),
    alternativeRoleConfusion: state.referents?.current === 'assistant.alternativeName' && new RegExp(`(?:chamar (?:você|voce|te) de|seu nome (?:seria|é|e))\\s+${String(state.assistantAlternativeName || 'Eco').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(text),
    correctionRoleConfusion: state.lastCorrection?.correctedField === 'userName' && String(state.lastCorrection?.message || '').trim().toLowerCase() === String(question || '').trim().toLowerCase() && Boolean(state.userName) && new RegExp(`(?:meu nome (?:é|e)\\s+${String(state.userName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|${String(state.userName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (?:é|e) o meu nome)`, 'i').test(text),
    aliasAssignmentRoleConfusion: assignsAssistantAlias && Boolean(state.assistantAlias) && new RegExp(`(?:posso|vou) (?:te|lhe) chamar de\\s+${String(state.assistantAlias).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(text),
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
    const depth =
      complexity?.level === 'trivial'
        ? 'one-line'
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
        : answerPlan.depth === 'compact'
          ? 'Seja curto e completo; use lista somente se melhorar a leitura.'
          : answerPlan.depth === 'deep'
            ? 'Estruture apenas quando necessário, comece pela conclusão e sustente cada ponto importante.'
            : 'Dê a resposta diretamente e explique na medida certa.';
    const conversation = ['casual', 'playful'].includes(input.context)
      ? 'Trate isto como continuação de uma relação, não como atendimento. Espelhe de leve ritmo, informalidade e tamanho sem copiar erros. Uma saudação pode ser curta e terminar sozinha. Não use fechamento de suporte, disclaimer genérico de IA nem pergunta automática. Pode brincar e expressar preferências da persona sem alegar emoções biológicas. Varie a formulação em relação às respostas recentes.'
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
