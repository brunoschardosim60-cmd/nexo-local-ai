export function normalizePortugueseOutput(content) {
  return String(content || '')
    .replace(/Como posso eu ajudar/gi, 'Como posso ajudar')
    .replace(/Como posso ajudar você hoje\??/gi, 'O que está passando pela sua cabeça hoje?')
    .replace(/Como posso assisti-lo hoje\??/gi, 'O que está passando pela sua cabeça hoje?')
    .replace(/Posso respondo/gi, 'Posso responder')
    .replace(/\bSou informações\b/gi, 'Tenho informações')
    .replace(/\bSou capacidade\b/gi, 'Tenho capacidade')
    .replace(/\bSou habilidade\b/gi, 'Tenho habilidade')
    .replace(/aprendizado continuo/gi, 'aprendizado contínuo')
    .replace(/conforme você me interage/gi, 'conforme interagimos')
    .replace(/Como vai as coisas\?/gi, 'Como vão as coisas?')
    .replace(/Se (?:você )?tiver mais alguma (?:pergunta|dúvida)[\s\S]*?sinta-se à vontade para perguntar!?/gi, 'Qual parte disso você gostaria de explorar primeiro?')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

export function createResponseIntelligence({ personality }) {
  function plan({ question, complexity, context, epistemic }) {
    const technical = ['coding', 'technical', 'security', 'study'].includes(context);
    const depth = complexity?.level === 'trivial' ? 'one-line' : complexity?.level === 'simple' ? 'compact' : ['complex', 'agentic'].includes(complexity?.level) ? 'deep' : 'balanced';
    return { depth, technical, lead: technical ? 'answer-first' : context === 'casual' || context === 'playful' ? 'natural' : 'answer-first', uncertainty: epistemic?.state || 'INFERRED', avoid: ['generic-enthusiasm', 'question-repetition', 'forced-summary', 'unnecessary-list'], questionLength: String(question || '').length };
  }
  function instruction(input) {
    const answerPlan = plan(input); const style = personality.prompt(input.context, input.profile, { compact: answerPlan.depth !== 'deep' });
    const depth = answerPlan.depth === 'one-line' ? 'Responda em uma linha, sem introdução nem pergunta final.' : answerPlan.depth === 'compact' ? 'Seja curto e completo; use lista somente se melhorar a leitura.' : answerPlan.depth === 'deep' ? 'Estruture apenas quando necessário, comece pela conclusão e sustente cada ponto importante.' : 'Dê a resposta diretamente e explique na medida certa.';
    return { plan: answerPlan, prompt: `${depth} Evite entusiasmo genérico, repetir a pergunta, bordões e conclusões redundantes. ${style}` };
  }
  return { plan, instruction, health: () => ({ separated: ['reasoning', 'answer-planning', 'personality-rendering'], antiPatterns: 4 }) };
}
