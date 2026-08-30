export function normalizePortugueseOutput(content) {
  const normalized = String(content || '')
    .replace(/Como posso eu ajudar/gi, 'Como posso ajudar')
    .replace(
      /\s*(?:Como posso (?:ajudar você|assisti-lo)(?: hoje)?|Como posso (?:te|lhe) ajudar hoje|Como posso ajudá-lo mais|Como posso ajudar hoje|Em que posso ajudar hoje)\??/gi,
      '',
    )
    .replace(/Tudo (?:ótimo|bem)[,!]?\s*(?:e você|e contigo)\??/gi, 'Tô por aqui.')
    .replace(/\s*O que está passando pela sua cabeça hoje\??/gi, '')
    .replace(/\s*Estou aqui para (?:te |lhe )?ajudar[^.!?]*[.!?]?/gi, '')
    .replace(/\s*Se precisar de (?:alguma|qualquer) coisa,?\s*estou aqui para ajudar[.!?]?/gi, '')
    .replace(/Posso respondo/gi, 'Posso responder')
    .replace(/\bPosso posso\b/gi, 'Posso')
    .replace(/\bEstouando\b/gi, 'Estou')
    .replace(/\bPodeu\b/gi, 'Podemos')
    .replace(/\bEu soumigo\b/gi, 'Eu sou o')
    .replace(/\bSou informações\b/gi, 'Tenho informações')
    .replace(/\bSou capacidade\b/gi, 'Tenho capacidade')
    .replace(/\bSou habilidade\b/gi, 'Tenho habilidade')
    .replace(/aprendizado continuo/gi, 'aprendizado contínuo')
    .replace(/conforme você me interage/gi, 'conforme interagimos')
    .replace(/Como vai as coisas\?/gi, 'Como vão as coisas?')
    .replace(
      /\s*Se (?:você )?tiver mais alguma (?:pergunta|dúvida)[\s\S]*?sinta-se à vontade para perguntar!?/gi,
      '',
    )
    .replace(/\s*Fique à vontade para (?:perguntar|pedir)[^.!?]*[.!?]?/gi, '')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
  return normalized || 'Tô por aqui.';
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
      ? 'Trate isto como continuação de uma relação, não como atendimento. Espelhe de leve o ritmo, a informalidade e o tamanho da mensagem do usuário. Uma saudação pode ser espontânea e terminar sem oferecer ajuda. Nunca use “Como posso ajudar hoje?”, “Tudo ótimo, e você?”, “Estou aqui para ajudar” ou “O que está passando pela sua cabeça?”. Não force pergunta final.'
      : 'Não encerre oferecendo ajuda de forma genérica; só faça uma pergunta final quando ela destravar o próximo passo.';
    return {
      plan: answerPlan,
      prompt: `${depth} ${conversation} Evite entusiasmo genérico, repetir a pergunta, bordões e conclusões redundantes. ${style}`,
    };
  }
  return {
    plan,
    instruction,
    health: () => ({
      separated: ['reasoning', 'answer-planning', 'personality-rendering'],
      antiPatterns: 4,
    }),
  };
}
