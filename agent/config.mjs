import { resolve } from 'node:path';

export function createAgentConfig(overrides = {}) {
  const projectRoot = resolve(overrides.projectRoot || process.cwd());
  return {
    projectRoot,
    workspace: resolve(overrides.workspace || process.env.NEXO_WORKSPACE || '..'),
    dataDir: resolve(overrides.dataDir || process.env.NEXO_DATA_DIR || projectRoot, 'data'),
    ollamaUrl: overrides.ollamaUrl || process.env.NEXO_OLLAMA_URL || 'http://127.0.0.1:11434',
    fastModel: overrides.fastModel || process.env.NEXO_FAST_MODEL || 'qwen2.5:3b-instruct',
    capableModel: overrides.capableModel || process.env.NEXO_CAPABLE_MODEL || 'qwen2.5-coder:3b',
    coderModel: overrides.coderModel || process.env.NEXO_CODER_MODEL || overrides.capableModel || process.env.NEXO_CAPABLE_MODEL || 'qwen2.5-coder:3b',
    reasoningModel: overrides.reasoningModel || process.env.NEXO_REASONING_MODEL || overrides.capableModel || process.env.NEXO_CAPABLE_MODEL || 'qwen2.5-coder:3b',
    expertModel: overrides.expertModel || process.env.NEXO_EXPERT_MODEL || 'qwen2.5-coder:7b-instruct-q3_K_S',
    visionModel: overrides.visionModel || process.env.NEXO_VISION_MODEL || 'qwen2.5vl:3b',
    embeddingModel: overrides.embeddingModel || process.env.NEXO_EMBEDDING_MODEL || 'embeddinggemma',
    modelKeepAlive: overrides.modelKeepAlive || process.env.NEXO_MODEL_KEEP_ALIVE || '8m',
    expertModelKeepAlive: overrides.expertModelKeepAlive || process.env.NEXO_EXPERT_KEEP_ALIVE || '2m',
    imageProviderUrl: overrides.imageProviderUrl || process.env.NEXO_IMAGE_PROVIDER_URL || 'http://127.0.0.1:7860',
    videoProviderUrl: overrides.videoProviderUrl || process.env.NEXO_VIDEO_PROVIDER_URL || null,
    speechToTextUrl: overrides.speechToTextUrl || process.env.NEXO_STT_PROVIDER_URL || null,
    textToSpeechUrl: overrides.textToSpeechUrl || process.env.NEXO_TTS_PROVIDER_URL || null,
    featureFlags: {
      vision: process.env.NEXO_VISION !== '0',
      imageGeneration: process.env.NEXO_IMAGE_GENERATION !== '0',
      videoGeneration: process.env.NEXO_VIDEO_GENERATION === '1',
      realtimeVoice: process.env.NEXO_REALTIME_VOICE === '1',
      critic: process.env.NEXO_CRITIC !== '0',
      autoRegeneration: process.env.NEXO_AUTO_REGENERATION === '1',
      ...overrides.featureFlags,
    },
    limits: {
      maxSteps: 60,
      maxRetries: 2,
      maxRetryLimit: 4,
      maxToolCalls: 120,
      maxModelCalls: 90,
      maxCost: 0,
      maxSelfCorrections: 3,
      maxSelfCorrectionLimit: 5,
      maxToolOutput: 24_000,
      contextTokens: Number(process.env.NEXO_CONTEXT_TOKENS) || 12_000,
      maxTaskMinutes: 20,
      commandTimeoutMs: 120_000,
      ...overrides.limits,
    },
  };
}
