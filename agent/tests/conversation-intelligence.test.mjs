import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createConversationStateEngine, isCasualGreeting, normalizeCasualInput } from '../conversation/conversation-state.mjs';
import { NEXO_SELF_MODEL } from '../conversation/self-model.mjs';
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

test('sanity check detecta contradição, disclaimer, atendimento e repetição', () => {
  const state = { currentTopic: 'names', recentResponses: ['Oi! Como posso ajudar hoje?'] };
  assert.equal(evaluateConversationResponse('Eu não tenho nome.', { context: 'casual', state, question: 'qual seu nome?' }).pass, false);
  assert.equal(evaluateConversationResponse('Como uma IA, não tenho sentimentos.', { context: 'casual', state: {}, question: 'tu gosta?' }).pass, false);
  assert.equal(evaluateConversationResponse('Claro, posso te chamar de P1!', { context: 'casual', state: { assistantAlias: 'P1' }, question: 'posso te chamar de P1?' }).failures.includes('aliasAssignmentRoleConfusion'), true);
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
