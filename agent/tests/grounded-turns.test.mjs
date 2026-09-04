import assert from 'node:assert/strict';
import test from 'node:test';
import { renderGroundedConversationTurn } from '../conversation/grounded-turns.mjs';

const base = {
  assistantCanonicalName: 'Nexo',
  assistantAlternativeName: 'Eco',
  assistantAlias: 'P1',
  userName: 'Bruno',
  referents: {},
};

test('fatos de identidade e pronomes são respondidos pelo estado confirmado', () => {
  assert.match(renderGroundedConversationTurn({ question: 'e qual o seu?', state: base, update: { referent: 'assistant.canonicalName' } }), /Nexo[\s\S]*P1/);
  assert.equal(renderGroundedConversationTurn({ question: 'qual meu nome?', state: base, update: { referent: 'user.name' } }), 'Seu nome é Bruno.');
});

test('apelido, correção e nome alternativo preservam os papéis', () => {
  assert.match(renderGroundedConversationTurn({ question: 'posso te chamar de P1?', state: base, update: { alias: 'P1' } }), /P1[\s\S]*apelido/);
  assert.match(renderGroundedConversationTurn({ question: 'mas Bruno é o meu', state: { ...base, lastCorrection: { correctedField: 'userName' } }, update: { correction: true } }), /Bruno é o seu nome/);
  assert.match(renderGroundedConversationTurn({ question: 'mas se tivesse qual seria', state: base, update: { referent: 'assistant.alternativeName' } }), /Eco[\s\S]*Nexo/);
});
