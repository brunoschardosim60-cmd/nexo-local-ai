import assert from 'node:assert/strict';
import test from 'node:test';
import { createAudioProvider } from '../audio/http-provider.mjs';
import { createAudioRuntime } from '../audio/runtime.mjs';

test('provider HTTP envia personalidade completa e preserva WAV neural', async () => {
  let request = null;
  const provider = createAudioProvider({
    ttsUrl: 'http://127.0.0.1:7332/synthesize',
    fetchImpl: async (_url, options) => {
      request = JSON.parse(options.body);
      return new Response(Uint8Array.from([82, 73, 70, 70]), {
        status: 200,
        headers: { 'content-type': 'audio/wav', 'x-nexo-tts-provider': 'piper' },
      });
    },
  });
  const output = await provider.synthesize({ text: 'Olá', voice: 'nexo-pt-BR', speed: 1.08, energy: 'energetic', pauses: 'natural', emphasis: 'expressive' });
  assert.deepEqual(request, { text: 'Olá', voice: 'nexo-pt-BR', speed: 1.08, energy: 'energetic', pauses: 'natural', emphasis: 'expressive' });
  assert.equal(output.provider, 'piper');
  assert.equal(output.mimeType, 'audio/wav');
});

test('runtime persiste áudio e encaminha prosódia ao provider', async () => {
  let synthesized = null;
  const runtime = createAudioRuntime({
    enabled: true,
    provider: {
      async synthesize(input) { synthesized = input; return { buffer: Buffer.from('wav'), mimeType: 'audio/wav', provider: 'piper' }; },
      async health() { return { tts: { available: true } }; },
    },
    artifacts: { async saveBuffer(input) { return { id: 'audio-1', type: input.type, mimeType: input.mimeType, provider: input.provider, metadata: input.metadata }; } },
  });
  const result = await runtime.synthesize({ text: 'Teste natural', pace: 1.1, energy: 'energetic', pauses: 'short', emphasis: 'expressive' });
  assert.equal(synthesized.speed, 1.1);
  assert.equal(synthesized.energy, 'energetic');
  assert.equal(synthesized.pauses, 'short');
  assert.equal(synthesized.emphasis, 'expressive');
  assert.equal(result.artifact.provider, 'piper');
});

test('runtime separa disponibilidade de STT e TTS e preserva transcrição neural', async () => {
  const runtime = createAudioRuntime({
    enabled: true,
    sttEnabled: true,
    ttsEnabled: false,
    provider: {
      async transcribe(input, options) {
        assert.equal(input.mimeType, 'audio/webm');
        assert.equal(options.timestamps, true);
        assert.equal(options.languageDetection, true);
        return { text: 'Nexo está ouvindo.', language: 'pt', provider: 'faster-whisper-local' };
      },
      async health() { return { stt: { available: true }, tts: { available: false } }; },
    },
    artifacts: { async saveBuffer() { throw new Error('não deveria salvar áudio neste teste'); } },
  });

  const result = await runtime.transcribe({ base64: 'AA==', mimeType: 'audio/webm' });
  assert.equal(result.text, 'Nexo está ouvindo.');
  assert.equal(runtime.health().sttConfigured, true);
  assert.equal(runtime.health().ttsConfigured, false);
  await assert.rejects(() => runtime.synthesize({ text: 'não executar' }), /TTS de servidor não configurado/);
});
