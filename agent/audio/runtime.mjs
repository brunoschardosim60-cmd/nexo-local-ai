export function createAudioRuntime({ provider, artifacts, enabled = false }) {
  return {
    async transcribe(input, options) { if (!enabled) throw new Error('STT de servidor não configurado; use o reconhecimento de voz do navegador.'); return provider.transcribe(input, options); },
    async synthesize(input, options) { if (!enabled) throw new Error('TTS de servidor não configurado; use a voz do navegador.'); const output = await provider.synthesize(input, options); const artifact = await artifacts.saveBuffer({ type: 'audio', mimeType: output.mimeType, provider: output.provider, buffer: output.buffer, metadata: { voice: input.voice || 'pt-BR', textChars: input.text.length } }); return { artifact }; },
    health: () => ({ enabled, identity: 'Nexo', interruption: 'browser-supported', provider: 'configurable-local-http', fallback: 'Web Speech API' }), availability: () => provider.health(),
  };
}
