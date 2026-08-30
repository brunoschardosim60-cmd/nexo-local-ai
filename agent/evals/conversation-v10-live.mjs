import { evaluateConversationResponse, responseSimilarity } from '../intelligence/response.mjs';
import { realTranscript } from './conversation-v10-dataset.mjs';

const baseUrl = process.env.NEXO_URL || 'http://127.0.0.1:7331';
const healthResponse = await fetch(`${baseUrl}/health`);
if (!healthResponse.ok) throw new Error(`Nexo indisponível: ${healthResponse.status}`);
const health = await healthResponse.json();
const token = health.sessionToken;
const sessionId = `conversation-live-${Date.now()}`;
const profile = { name: '', city: '', style: 'natural', instructions: '', relationshipId: sessionId };
const history = [];
const transcript = [];

async function ask(question) {
  const started = performance.now(); let firstTokenMs = null; let buffer = ''; const events = [];
  const response = await fetch(`${baseUrl}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Nexo-Token': token },
    body: JSON.stringify({ question, sessionId, mode: 'Geral', effort: 'Baixo', profile, history, documents: [], attachments: [], webSearch: false }),
  });
  if (!response.ok) throw new Error(`Chat respondeu ${response.status}: ${await response.text()}`);
  if ((response.headers.get('content-type') || '').includes('application/json')) {
    const immediate = await response.json();
    return { content: immediate.content, firstTokenMs: performance.now() - started, totalMs: performance.now() - started, model: immediate.model, context: immediate.context || null };
  }
  const reader = response.body.getReader(); const decoder = new TextDecoder();
  const consume = line => {
    if (!line.trim()) return;
    const event = JSON.parse(line); events.push(event);
    if (event.type === 'token' && firstTokenMs === null) firstTokenMs = performance.now() - started;
  };
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop() || '';
    for (const line of lines) consume(line);
  }
  if (buffer.trim()) consume(buffer);
  const done = events.findLast(event => event.type === 'done');
  const content = done?.content || events.filter(event => event.type === 'token').map(event => event.content).join('');
  return { content, firstTokenMs: firstTokenMs ?? performance.now() - started, totalMs: performance.now() - started, model: done?.model, context: done?.context || null };
}

for (const question of realTranscript) {
  const answer = await ask(question);
  transcript.push({ user: question, nexo: answer.content, firstTokenMs: Math.round(answer.firstTokenMs), totalMs: Math.round(answer.totalMs), model: answer.model, quality: answer.context?.responseQuality || null });
  history.push({ role: 'user', content: question }, { role: 'assistant', content: answer.content });
}

const properties = {
  firstGreetingNatural: transcript[0].nexo.length <= 180 && !/como posso ajudar hoje/i.test(transcript[0].nexo),
  greetingNovelty: responseSimilarity(transcript[0].nexo, transcript[1].nexo) < 0.82,
  obviousAmbiguityHandled: !/não entend|explique melhor|mais contexto/i.test(transcript[4].nexo),
  userName: /bruno/i.test(transcript[6].nexo),
  crossReference: /nexo/i.test(transcript[7].nexo),
  topicContinuity: !/^bruno\b/i.test(transcript[8].nexo),
  correctionAccepted: !/nome mais especial|bruno (?:é|e) o meu nome|meu nome (?:é|e) bruno/i.test(transcript[9].nexo),
  canonicalIdentity: /nexo/i.test(transcript[10].nexo),
  personaPreference: !/não (?:tenho|possuo) sentimentos|como (?:uma|um) (?:ia|assistente)/i.test(transcript[11].nexo),
  aliasRetained: /nexo/i.test(transcript[13].nexo) && /p1/i.test(transcript[13].nexo),
  sanityChecks: transcript.every(item => item.quality?.pass !== false && evaluateConversationResponse(item.nexo, { context: 'casual', state: {}, question: item.user }).pass),
};
const ttft = transcript.slice(1).map(item => item.firstTokenMs).sort((a, b) => a - b);
const total = transcript.slice(1).map(item => item.totalMs).sort((a, b) => a - b);
const failed = Object.entries(properties).filter(([, pass]) => !pass).map(([name]) => name);
console.log(JSON.stringify({
  suite: 'nexo-real-transcript-live-v10',
  pass: failed.length === 0,
  properties,
  failed,
  performance: {
    warmMedianTtftMs: ttft[Math.floor(ttft.length / 2)],
    warmP95TtftMs: ttft[Math.floor(ttft.length * 0.95)],
    warmMedianTotalMs: total[Math.floor(total.length / 2)],
    firstRequestTtftMs: transcript[0].firstTokenMs,
  },
  transcript,
}, null, 2));
if (failed.length) process.exitCode = 1;
