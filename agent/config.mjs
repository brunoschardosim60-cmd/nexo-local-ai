import { resolve } from 'node:path';

export function createAgentConfig(overrides = {}) {
  const projectRoot = resolve(overrides.projectRoot || process.cwd());
  return {
    projectRoot,
    workspace: resolve(overrides.workspace || process.env.NEXO_WORKSPACE || '..'),
    dataDir: resolve(overrides.dataDir || process.env.NEXO_DATA_DIR || projectRoot, 'data'),
    ollamaUrl: process.env.NEXO_OLLAMA_URL || 'http://127.0.0.1:11434',
    fastModel: process.env.NEXO_FAST_MODEL || 'qwen2.5-coder:3b',
    capableModel: process.env.NEXO_CAPABLE_MODEL || 'qwen2.5-coder:7b-instruct-q3_K_S',
    limits: {
      maxSteps: 14,
      maxRetries: 2,
      maxToolOutput: 24_000,
      contextTokens: 6_000,
      maxTaskMinutes: 20,
      commandTimeoutMs: 120_000,
      ...overrides.limits,
    },
  };
}
