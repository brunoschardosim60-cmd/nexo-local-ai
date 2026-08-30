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

test('UX 2.0 keeps the chat-first shell and progressive controls', () => {
  assert.match(page, /nexo-shell/);
  assert.match(page, /O que vamos fazer\?/);
  assert.match(page, /<summary[^>]*>[\s\S]*Auto/);
  assert.match(page, /Detalhes/);
  assert.match(page, /ArtifactPanel/);
});

test('UX 2.0 exposes accessible labels for compact icon controls', () => {
  assert.match(page, /aria-label="Abrir paleta de comandos"/);
  assert.match(page, /aria-label="Central de segurança"/);
  assert.match(page, /Tema atual:/);
  assert.match(page, /aria-label="Enviar mensagem"/);
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
});

test('Living Eye measures real microphone energy and applies smoothing', () => {
  assert.match(livingEye, /getUserMedia/);
  assert.match(livingEye, /createAnalyser/);
  assert.match(livingEye, /getFloatTimeDomainData/);
  assert.match(livingEye, /Math\.sqrt\(sum \/ samples\.length\)/);
  assert.match(livingEye, /echoCancellation: true/);
});
