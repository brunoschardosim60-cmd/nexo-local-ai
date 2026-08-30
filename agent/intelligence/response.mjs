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
