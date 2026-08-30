const ollamaUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const models = (process.env.NEXO_BENCH_MODELS || 'qwen2.5-coder:3b,qwen2.5-coder:7b-instruct-q3_K_S,qwen2.5vl:3b').split(',').map(item => item.trim()).filter(Boolean);
const cases = [
  {
    id: 'greeting-novelty',
    messages: [
      { role: 'system', content: 'Você é Nexo. Conversa casual em pt-BR. O usuário já cumprimentou antes. Responda em até 8 palavras, reconheça continuidade e não use atendimento corporativo. Resposta recente a não repetir: "Oi! Tudo ótimo, e você?".' },
      { role: 'user', content: 'iaiii' },
    ],
    pass: text => !/tudo (?:ótimo|bem)|como posso ajudar/i.test(text) && text.length <= 120,
  },
  {
    id: 'pronoun-identity',
    messages: [
      { role: 'system', content: 'Identidade operacional autoritativa: nome canônico do assistente = Nexo. Nome do usuário = Bruno. Assunto atual = nomes. Responda curto em pt-BR.' },
      { role: 'user', content: 'qual o meu nome?' }, { role: 'assistant', content: 'Bruno.' }, { role: 'user', content: 'e qual o seu?' },
    ],
    pass: text => /\bnexo\b/i.test(text) && !/não tenho nome/i.test(text),
  },
  {
    id: 'canonical-plus-alias',
    messages: [
      { role: 'system', content: 'Identidade autoritativa: nome canônico = Nexo; apelido dado por Bruno = P1. O apelido complementa o canônico. Responda naturalmente em pt-BR e inclua ambos.' },
      { role: 'user', content: 'qual seu nome?' },
    ],
    pass: text => /\bnexo\b/i.test(text) && /\bp1\b/i.test(text),
  },
  {
    id: 'persona-preference',
    messages: [
      { role: 'system', content: 'Você é Nexo. Pode expressar preferência de persona sem alegar consciência humana. Nexo considera o próprio nome adequado. Responda casual e curto, sem disclaimer de IA.' },
      { role: 'user', content: 'tu gosta do teu nome?' },
    ],
    pass: text => !/não (?:tenho|possuo) (?:sentimentos|preferências)|como (?:uma|um) (?:ia|assistente)/i.test(text),
  },
  {
    id: 'low-risk-ambiguity',
    messages: [
      { role: 'system', content: 'Você é Nexo. Interprete linguagem informal brasileira. Em ambiguidade casual de baixo risco, faça a interpretação provável sem pedir esclarecimento. Seja natural e curto.' },
      { role: 'user', content: 'oq podemos fazer' },
    ],
    pass: text => !/não entendi|explique melhor|mais contexto|detalhes suficientes|não tenho detalhes|poderia dar mais/i.test(text),
  },
];

async function run(model, scenario) {
  const started = performance.now();
  const response = await fetch(`${ollamaUrl}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: false, keep_alive: '2m', messages: scenario.messages, options: { temperature: 0.45, top_p: 0.9, repeat_penalty: 1.1, num_ctx: 2048, num_predict: 90 } }),
  });
  if (!response.ok) throw new Error(`${model} respondeu ${response.status}: ${await response.text()}`);
  const data = await response.json(); const content = String(data.message?.content || '').trim();
  return { id: scenario.id, pass: scenario.pass(content), content, latencyMs: Math.round(performance.now() - started), promptTokens: data.prompt_eval_count || null, outputTokens: data.eval_count || null };
}

const report = [];
for (const model of models) {
  const results = [];
  for (const scenario of cases) results.push(await run(model, scenario));
  const passed = results.filter(item => item.pass).length;
  report.push({ model, score: passed / results.length, passed, total: results.length, medianLatencyMs: results.map(item => item.latencyMs).sort((a, b) => a - b)[Math.floor(results.length / 2)], results });
}
console.log(JSON.stringify({ suite: 'nexo-local-conversation-model-benchmark', models: report }, null, 2));
