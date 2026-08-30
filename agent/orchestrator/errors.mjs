export const ERROR_KIND = Object.freeze({ TRANSIENT: 'TRANSIENT', INVALID_INPUT: 'INVALID_INPUT', PERMISSION: 'PERMISSION', TOOL_UNAVAILABLE: 'TOOL_UNAVAILABLE', MODEL_FAILURE: 'MODEL_FAILURE', CONTEXT_FAILURE: 'CONTEXT_FAILURE', LOGIC_FAILURE: 'LOGIC_FAILURE', VERIFICATION_FAILURE: 'VERIFICATION_FAILURE', FATAL: 'FATAL' });

export function classifyFailure(error, { phase = 'tool', status = null } = {}) {
  const message = String(error?.message || error || '').toLowerCase();
  if (/timeout|tempor|transit|busy|locked|econnreset|eai_again|fetch failed|429|503/.test(message)) return ERROR_KIND.TRANSIENT;
  if (/permiss|aprova|negad|unauthor|forbidden|401|403/.test(message)) return ERROR_KIND.PERMISSION;
  if (/inv[aá]lid|schema|obrigat[oó]ri|unknown field|n[aã]o faz parte/.test(message)) return ERROR_KIND.INVALID_INPUT;
  if (/n[aã]o encontrad|unavailable|indispon[ií]vel|not installed|econnrefused/.test(message)) return ERROR_KIND.TOOL_UNAVAILABLE;
  if (phase === 'model' || /ollama|modelo|model/.test(message)) return ERROR_KIND.MODEL_FAILURE;
  if (phase === 'context' || /context|rag|mem[oó]ria/.test(message)) return ERROR_KIND.CONTEXT_FAILURE;
  if (phase === 'verification' || status === 'UNCERTAIN') return ERROR_KIND.VERIFICATION_FAILURE;
  if (phase === 'logic') return ERROR_KIND.LOGIC_FAILURE;
  return ERROR_KIND.FATAL;
}

export function recoveryPolicy(kind, attempt) {
  if (kind === ERROR_KIND.PERMISSION) return { action: 'ask-user', retry: false };
  if ([ERROR_KIND.INVALID_INPUT, ERROR_KIND.CONTEXT_FAILURE].includes(kind)) return { action: 'correct-input-or-context', retry: attempt < 2 };
  if (kind === ERROR_KIND.TRANSIENT) return { action: 'retry-with-backoff', retry: attempt < 2 };
  if ([ERROR_KIND.MODEL_FAILURE, ERROR_KIND.TOOL_UNAVAILABLE].includes(kind)) return { action: 'fallback-provider-or-model', retry: attempt < 2 };
  if ([ERROR_KIND.LOGIC_FAILURE, ERROR_KIND.VERIFICATION_FAILURE].includes(kind)) return { action: 'replan-different-strategy', retry: attempt < 3 };
  return { action: 'stop', retry: false };
}
