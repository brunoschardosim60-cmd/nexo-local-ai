import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const page = await readFile(
  new URL('../../app/page.tsx', import.meta.url),
  'utf8',
);
const styles = await readFile(
  new URL('../../app/globals.css', import.meta.url),
  'utf8',
);
const livingEye = await readFile(
  new URL('../../components/nexo/nexo-living-eye.tsx', import.meta.url),
  'utf8',
);
const voiceMode = await readFile(
  new URL('../../hooks/use-voice-mode.ts', import.meta.url),
  'utf8',
);
const speechOutput = await readFile(
  new URL('../../hooks/use-speech-output.ts', import.meta.url),
  'utf8',
);
const pageView = await readFile(
  new URL('../../components/nexo/nexo-page-view.tsx', import.meta.url),
  'utf8',
);
const overlays = await readFile(
  new URL('../../components/nexo/nexo-overlays.tsx', import.meta.url),
  'utf8',
);
const composer = await readFile(
  new URL('../../components/nexo/composer.tsx', import.meta.url),
  'utf8',
);
const topBar = await readFile(
  new URL('../../components/nexo/top-bar.tsx', import.meta.url),
  'utf8',
);
const messageBubble = await readFile(
  new URL('../../components/nexo/message-bubble.tsx', import.meta.url),
  'utf8',
);
const messageList = await readFile(
  new URL('../../components/nexo/message-list.tsx', import.meta.url),
  'utf8',
);
const chatSubmit = await readFile(
  new URL('../../lib/nexo/chat-submit.ts', import.meta.url),
  'utf8',
);
const voiceSources = `${voiceMode}\n${speechOutput}`;
const pageSources = `${page}\n${pageView}\n${overlays}\n${composer}\n${topBar}\n${messageList}\n${messageBubble}`;

test('UX 2.0 keeps the chat-first shell and progressive controls', () => {
  assert.match(pageSources, /nexo-shell/);
  assert.match(pageSources, /O que vamos fazer\?/);
  assert.match(pageSources, /<summary[^>]*>[\s\S]*Auto/);
  assert.match(pageSources, /Detalhes/);
  assert.match(pageSources, /ArtifactPanel/);
});

test('UX 2.0 exposes accessible labels for compact icon controls', () => {
  assert.match(pageSources, /aria-label="Abrir paleta de comandos"/);
  assert.match(pageSources, /aria-label="Central de segurança"/);
  assert.match(pageSources, /Tema atual:/);
  assert.match(pageSources, /aria-label="Enviar mensagem"/);
});

test('UX 2.0 has semantic design tokens and reduced-motion support', () => {
  for (const token of [
    '--surface:',
    '--surface-raised:',
    '--text-secondary:',
    '--status-success:',
    '--motion-fast:',
  ]) {
    assert.match(styles, new RegExp(token));
  }
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
  assert.match(styles, /\.nexo-orb/);
});

test('Living Eye exposes its complete state machine and biological motion', () => {
  for (const state of [
    'idle',
    'listening',
    'understanding',
    'thinking',
    'speaking',
    'working',
    'success',
    'error',
    'offline',
    'resting',
  ]) {
    assert.match(livingEye, new RegExp(`'${state}'`));
  }
  assert.match(livingEye, /LIVING_EYE_TRANSITIONS/);
  assert.match(styles, /nexo-living-eye-blink-double/);
  assert.match(livingEye, /requestAnimationFrame/);
  assert.match(livingEye, /nexo-living-eye-lid-upper/);
  assert.match(livingEye, /bezierCurveTo/);
  assert.match(livingEye, /STATE_ENERGY/);
  assert.match(styles, /living-eye-wake/);
});

test('Living Eye measures real microphone energy and applies smoothing', () => {
  assert.match(livingEye, /getUserMedia/);
  assert.match(livingEye, /createAnalyser/);
  assert.match(livingEye, /getFloatTimeDomainData/);
  assert.match(livingEye, /Math\.sqrt\(sum \/ samples\.length\)/);
  assert.match(livingEye, /echoCancellation: true/);
  assert.match(livingEye, /noiseFloor/);
  assert.match(livingEye, /rawEnergy < 0\.025/);
  assert.match(voiceSources, /event\.elapsedTime/);
  assert.match(voiceSources, /boundaryRef/);
  assert.match(voiceSources, /voice-eye-level/);
});

test('Voice Presence supports partial speech, endpointing, streaming TTS and barge-in', () => {
  assert.match(voiceSources, /recognition\.interimResults = true/);
  assert.match(chatSubmit, /voice\.streamSpeech\(responseText/);
  assert.match(chatSubmit, /input: options\.inputSource/);
  assert.match(voiceSources, /speech\.interrupt/);
  assert.match(livingEye, /silenceFrames >= 42/);
  assert.match(livingEye, /voiceFrames >= 11/);
  assert.match(livingEye, /Conversa contínua/);
});
