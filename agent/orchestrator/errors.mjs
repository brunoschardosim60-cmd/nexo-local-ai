import { ERROR_CATEGORY, normalizeErrorCategory } from '../contracts/errors.mjs';

// Compatibilidade para consumidores antigos; todos os valores agora pertencem
// ao mesmo contrato canônico usado por orchestrator e extensions.
export const ERROR_KIND = Object.freeze({
  ...ERROR_CATEGORY,
  TOOL_UNAVAILABLE: ERROR_CATEGORY.MISSING_CAPABILITY,
  MODEL_FAILURE: ERROR_CATEGORY.RESOURCE,
  CONTEXT_FAILURE: ERROR_CATEGORY.RESOURCE,
  LOGIC_FAILURE: ERROR_CATEGORY.UNKNOWN,
  VERIFICATION_FAILURE: ERROR_CATEGORY.UNKNOWN,
  FATAL: ERROR_CATEGORY.DEFINITIVE,
});

export function classifyFailure(error, { phase = 'tool', status = null } = {}) {
  if (error?.category || error?.kind) return normalizeErrorCategory(error.category || error.kind);
  const message = String(error?.message || error || '').toLowerCase();
  if (/timeout|tempor|transit|busy|locked|econnreset|eai_again|fetch failed|429|503|rate.?limit/.test(message)) return ERROR_KIND.TRANSIENT;
  if (/unauthor|autentica|token|credential|401/.test(message)) return ERROR_KIND.AUTH;
  if (/permiss|aprova|negad|forbidden|403/.test(message)) return ERROR_KIND.PERMISSION;
  if (/inv[aá]lid|schema|obrigat[oó]ri|unknown field|n[aã]o faz parte/.test(message)) return ERROR_KIND.INVALID_INPUT;
  if (/n[aã]o encontrad|unavailable|indispon[ií]vel|not installed|econnrefused|ausente/.test(message)) return ERROR_KIND.MISSING_CAPABILITY;
  if (phase === 'model' || phase === 'context' || /ollama|modelo|model|context|rag|mem[oó]ria|ram|vram|resource/.test(message)) return ERROR_KIND.RESOURCE;
  if (phase === 'verification' || phase === 'logic' || status === 'UNCERTAIN') return ERROR_KIND.UNKNOWN;
  return ERROR_KIND.DEFINITIVE;
}

export function recoveryPolicy(kind, attempt) {
  const category = normalizeErrorCategory(kind);
  if ([ERROR_KIND.PERMISSION, ERROR_KIND.AUTH].includes(category)) return { action: 'ask-user', retry: false };
  if (category === ERROR_KIND.INVALID_INPUT) return { action: 'correct-input-or-context', retry: attempt < 2 };
  if (category === ERROR_KIND.TRANSIENT) return { action: 'retry-with-backoff', retry: attempt < 2 };
  if ([ERROR_KIND.RESOURCE, ERROR_KIND.MISSING_CAPABILITY].includes(category)) return { action: 'fallback-provider-or-model', retry: attempt < 2 };
  if (category === ERROR_KIND.UNKNOWN) return { action: 'replan-different-strategy', retry: attempt < 3 };
  return { action: 'stop', retry: false };
}
