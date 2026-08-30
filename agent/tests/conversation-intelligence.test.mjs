import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createConversationStateEngine, isCasualGreeting, normalizeCasualInput } from '../conversation/conversation-state.mjs';
import { NEXO_SELF_MODEL } from '../conversation/self-model.mjs';
import { createOperationalCapabilitySnapshot, isCapabilityQuestion, renderOperationalCapabilityAnswer } from '../conversation/operational-capabilities.mjs';
import { evaluateConversationResponse, responseSimilarity, sanitizeConversationDraft } from '../intelligence/response.mjs';
import { createDatabase } from '../memory/database.mjs';
import { assembleStreamChunks } from '../runtime/stream-assembly.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'nexo-conversation-'));
  const database = createDatabase(root);
  const engine = createConversationStateEngine(database);
  return { root, database, engine, async close() { database.db.close(); await rm(root, { recursive: true, force: true }); } };
}

test('SelfModel mantém a identidade canônica estável', () => {
  assert.equal(NEXO_SELF_MODEL.canonicalName, 'Nexo');
  assert.equal(NEXO_SELF_MODEL.identityKind, 'operational');
});

test('SelfModel operacional diferencia disponível, condicional e indisponível', () => {
  const snapshot = createOperationalCapabilitySnapshot({
    toolNames: ['filesystem.read', 'code.find_symbol', 'research.search', 'browser.open'],
    config: { featureFlags: { vision: true, imageGeneration: true, videoGeneration: false } },
    health: { vision: { enabled: true }, image: { enabled: true, available: null }, audio: { enabled: false }, video: { enabled: false }, browser: { available: true } },
  });
  assert.equal(snapshot.capabilities.find((item) => item.id === 'coding').status, 'AVAILABLE');
  assert.equal(snapshot.capabilities.find((item) => item.id === 'image').status, 'CONDITIONAL');
  assert.equal(snapshot.capabilities.find((item) => item.id === 'voice').status, 'UNAVAILABLE');
  assert.equal(isCapabilityQuestion('oq tu sabe fazer?'), true);
  assert.match(renderOperationalCapabilityAnswer(snapshot, 'consegue gerar imagem?'), /depende de configuração|Forge/i);
  assert.match(renderOperationalCapabilityAnswer(snapshot, 'consegue falar por voz?'), /não consigo/i);
});

test('estado reconhece nome, referente pronominal e contexto de nomes', async () => {
  const f = await fixture();
  try {
    f.engine.observeTurn({ sessionId: 'a', question: 'meu nome e bruno', history: [], profile: {} });
    const turn = f.engine.observeTurn({ sessionId: 'a', question: 'qual o meu nome?', history: [], profile: {} });
    assert.equal(turn.state.userName, 'Bruno');
    const reference = f.engine.observeTurn({ sessionId: 'a', question: 'e qual o seu?', history: [], profile: {} });
    assert.equal(reference.update.referent, 'assistant.canonicalName');
    assert.match(reference.prompt, /Nome canônico: Nexo/);
  } finally { await f.close(); }
});

test('apelido complementa o nome canônico e persiste na relação', async () => {
  const f = await fixture();
  try {
    const assigned = f.engine.observeTurn({ sessionId: 'chat-a', question: 'posso te chamar de P1?', history: [], profile: { name: 'Bruno' } });
    assert.equal(assigned.state.assistantAlias, 'P1');
    assert.equal(assigned.self.canonicalName, 'Nexo');
    assert.equal(assigned.state.aliasMetadata.source, 'USER_EXPLICIT');
    const otherChat = createConversationStateEngine(f.database).snapshot({ sessionId: 'chat-b', profile: { name: 'Bruno' } });
    assert.equal(otherChat.assistantAlias, 'P1');
  } finally { await f.close(); }
});

test('apelido pode ser corrigido e esquecido sem renomear a identidade', async () => {
  const f = await fixture();
  try {
    f.engine.observeTurn({ sessionId: 'a', question: 'teu nome agora é P2', profile: { name: 'Bruno' } });
    let turn = f.engine.observeTurn({ sessionId: 'a', question: 'não, melhor P1', profile: { name: 'Bruno' } });
    assert.equal(turn.state.assistantAlias, 'P1');
    assert.equal(turn.update.correction, true);
    turn = f.engine.observeTurn({ sessionId: 'a', question: 'esquece P1', profile: { name: 'Bruno' } });
    assert.equal(turn.update.aliasForgotten, true);
    assert.equal(turn.state.assistantAlias, null);
    assert.equal(turn.state.assistantCanonicalName, 'Nexo');
  } finally { await f.close(); }
});

test('comparação ambígua não sobrescreve identidade nem cria apelido', async () => {
  const f = await fixture();
  try {
    const turn = f.engine.observeTurn({ sessionId: 'a', question: 'você parece um João', profile: {} });
    assert.equal(turn.state.assistantAlias, null);
    assert.equal(turn.state.assistantCanonicalName, 'Nexo');
  } finally { await f.close(); }
});

test('normalização entende abreviações sem alterar a mensagem original', () => {
  assert.equal(normalizeCasualInput('oq vc ta fazendo agr?'), 'o que você está fazendo agora?');
  assert.equal(isCasualGreeting('iaiii bebe'), true);
  assert.equal(isCasualGreeting('oiee'), true);
});

test('saudações repetidas ficam registradas para evitar loop de template', async () => {
  const f = await fixture();
  try {
    f.engine.observeTurn({ sessionId: 'a', question: 'iaiii', profile: {} });
    const second = f.engine.observeTurn({ sessionId: 'a', question: 'oi', profile: {} });
    assert.equal(second.state.greetingCount, 2);
    assert.match(second.prompt, /já cumprimentou 2 vezes/);
  } finally { await f.close(); }
});

test('working state preserva escolha criativa, projeto, pet e preferência de tamanho', async () => {
  const f = await fixture();
  try {
    f.engine.observeTurn({ sessionId: 'a', question: 'quero um nome para um app', profile: {} });
    let turn = f.engine.observeTurn({ sessionId: 'a', question: 'gostei de Abissal', profile: {} });
    assert.equal(turn.state.selectedIdea, 'Abissal');
    f.engine.observeTurn({ sessionId: 'a', question: 'vamos falar do meu projeto', profile: {} });
    turn = f.engine.observeTurn({ sessionId: 'a', question: 'ele é uma IA local', profile: {} });
    assert.equal(turn.state.projectDescription, 'uma IA local');
    turn = f.engine.observeTurn({ sessionId: 'a', question: 'meu cachorro chama Nexo', profile: {} });
    assert.equal(turn.state.petName, 'Nexo');
    turn = f.engine.observeTurn({ sessionId: 'a', question: 'prefiro respostas curtas', profile: {} });
    assert.equal(turn.state.responseLength, 'short');
    assert.equal(evaluateConversationResponse('Abaixo do Mar.', { context: 'casual', state: turn.state, question: 'qual foi o escolhido?' }).failures.includes('selectedIdeaMissing'), true);
  } finally { await f.close(); }
});

test('negação séria não é confundida com correção factual', async () => {
  const f = await fixture();
  try {
    const turn = f.engine.observeTurn({ sessionId: 'a', question: 'não brinca agora', profile: {} });
    assert.equal(turn.update.correction, false);
  } finally { await f.close(); }
});

test('sanity check detecta contradição, disclaimer, atendimento e repetição', () => {
  const state = { currentTopic: 'names', recentResponses: ['Oi! Como posso ajudar hoje?'] };
  assert.equal(evaluateConversationResponse('Eu não tenho nome.', { context: 'casual', state, question: 'qual seu nome?' }).pass, false);
  assert.equal(evaluateConversationResponse('Como uma IA, não tenho sentimentos.', { context: 'casual', state: {}, question: 'tu gosta?' }).pass, false);
  assert.equal(evaluateConversationResponse('Claro, posso te chamar de P1!', { context: 'casual', state: { assistantAlias: 'P1' }, question: 'posso te chamar de P1?' }).failures.includes('aliasAssignmentRoleConfusion'), true);
  assert.equal(evaluateConversationResponse('Pode perguntar algo?', { context: 'casual', state: {}, question: 'oq podemos fazer' }).failures.includes('obviousCasualIntentDodged'), true);
  assert.equal(evaluateConversationResponse('Oi!', { context: 'casual', state: {}, question: 'iaiii' }).failures.includes('sociallyUnderdeveloped'), true);
  assert.equal(evaluateConversationResponse('Oi! Como posso ajudar hoje?', { context: 'casual', state, question: 'oi' }).failures.includes('templateRepetition'), true);
  assert.equal(responseSimilarity('oi, tô aqui', 'oi! tô aqui'), 1);
});

test('sanitização social remove fechamento corporativo sem reescrever a resposta útil', () => {
  assert.equal(sanitizeConversationDraft('Temos várias opções. Como posso ajudar hoje?', 'casual'), 'Temos várias opções.');
  assert.equal(sanitizeConversationDraft('Oi! Tudo ótimo, e você?', 'playful'), 'Oi!');
  assert.equal(sanitizeConversationDraft('Use npm test. Como posso ajudar hoje?', 'technical'), 'Use npm test. Como posso ajudar hoje?');
});

test('assembly trata deltas, cumulativos e sequência duplicada sem corromper texto', () => {
  assert.equal(assembleStreamChunks(['Eu sou', ' Nexo']), 'Eu sou Nexo');
  assert.equal(assembleStreamChunks(['Eu sou', 'Eu sou Nexo']), 'Eu sou Nexo');
  assert.equal(assembleStreamChunks([{ content: 'Eu sou', sequence: 1 }, { content: ' Nexo', sequence: 2 }, { content: ' Nexo', sequence: 2 }]), 'Eu sou Nexo');
});
