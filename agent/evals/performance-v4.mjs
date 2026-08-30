import { createNexoCore } from '../index.mjs';

const core = createNexoCore({ autoStartScheduler: false, autoResume: false });
async function unload(model) { try { await fetch(`${core.config.ollamaUrl}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, keep_alive: 0 }) }); } catch {} }
async function measure(name, input, { cold = false } = {}) {
  const preparedStarted = performance.now(); const prepared = await core.runtime.prepare(input); const runtimeOverheadMs = performance.now() - preparedStarted;
  if (prepared.kind !== 'model') { const sample = { route: prepared.route, cold, runtimeOverheadMs, ttftMs: runtimeOverheadMs, totalMs: runtimeOverheadMs, toolCalls: 0, modelCalls: 0, metadata: { name, kind: prepared.kind } }; core.database.addPerformanceSample(sample); return sample; }
  if (cold) await unload(prepared.model);
  const started = performance.now(); let firstToken = null; let content = ''; let metrics = null;
  for await (const event of core.runtime.stream(prepared)) { if (event.type === 'token') { if (firstToken == null) firstToken = performance.now(); content += event.content; } if (event.type === 'done') metrics = event.metrics; }
  const totalMs = performance.now() - started; const sample = { route: prepared.route, cold, runtimeOverheadMs, ttftMs: firstToken == null ? totalMs : firstToken - started, totalMs, promptTokens: metrics?.promptEvalCount || null, completionTokens: metrics?.evalCount || null, toolCalls: 0, modelCalls: 1, metadata: { name, model: prepared.model, outputChars: content.length } }; core.database.addPerformanceSample(sample); return sample;
}

try {
  const profile = { name: 'Benchmark', style: 'Direto', instructions: 'Responda de forma curta.' }; const common = { mode: 'Geral', profile, history: [], documents: [], webSearch: false };
  const results = [];
  results.push(await measure('instant-time', { ...common, question: 'que horas são?', effort: 'Baixo' }));
  results.push(await measure('fast-cold', { ...common, question: 'Em uma frase curta, o que é JSON?', effort: 'Baixo' }, { cold: true }));
  results.push(await measure('fast-warm', { ...common, question: 'Em uma frase curta, o que é CSS?', effort: 'Baixo' }));
  results.push(await measure('deep-cold', { ...common, question: 'Analise brevemente duas causas possíveis para uma API Node apresentar vazamento de memória e como verificar cada hipótese.', effort: 'Extra alto' }, { cold: true }));
  results.push(await measure('deep-warm', { ...common, question: 'Compare brevemente teste unitário e teste de integração e diga quando usar cada um.', effort: 'Extra alto' }));
  const agentStarted = performance.now(); const agentRoute = core.runtime.route({ ...common, mode: 'Agente', question: 'Analise o projeto e aguarde aprovação antes de qualquer alteração.', effort: 'Médio' }); const agentMs = performance.now() - agentStarted; const agentSample = { route: agentRoute.route, cold: false, runtimeOverheadMs: agentMs, ttftMs: agentMs, totalMs: agentMs, toolCalls: 0, modelCalls: 0, metadata: { name: 'agent-routing-only', note: 'mede apenas classificação; execução é validada pela suíte de agente' } }; core.database.addPerformanceSample(agentSample); results.push(agentSample);
  console.log(JSON.stringify({ suite: 'Nexo V4 Performance', measuredAt: new Date().toISOString(), results: results.map(item => ({ ...item, runtimeOverheadMs: Math.round(item.runtimeOverheadMs), ttftMs: Math.round(item.ttftMs), totalMs: Math.round(item.totalMs) })) }, null, 2));
} finally { core.close(); }
