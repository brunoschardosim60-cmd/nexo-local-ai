export const ERROR_CATEGORY = Object.freeze({
  TRANSIENT: 'TRANSIENT',
  INVALID_INPUT: 'INVALID_INPUT',
  PERMISSION: 'PERMISSION',
  AUTH: 'AUTH',
  MISSING_CAPABILITY: 'MISSING_CAPABILITY',
  RESOURCE: 'RESOURCE',
  DEFINITIVE: 'DEFINITIVE',
  UNKNOWN: 'UNKNOWN',
});

export const ERROR_CATEGORIES = Object.freeze(Object.values(ERROR_CATEGORY));

const LEGACY_CATEGORY = Object.freeze({
  NOT_FOUND: ERROR_CATEGORY.MISSING_CAPABILITY,
  RATE_LIMIT: ERROR_CATEGORY.TRANSIENT,
  UNAVAILABLE: ERROR_CATEGORY.MISSING_CAPABILITY,
  TOOL_UNAVAILABLE: ERROR_CATEGORY.MISSING_CAPABILITY,
  MODEL_FAILURE: ERROR_CATEGORY.RESOURCE,
  CONTEXT_FAILURE: ERROR_CATEGORY.RESOURCE,
  LOGIC_FAILURE: ERROR_CATEGORY.UNKNOWN,
  VERIFICATION_FAILURE: ERROR_CATEGORY.UNKNOWN,
  FATAL: ERROR_CATEGORY.DEFINITIVE,
  INTERNAL: ERROR_CATEGORY.UNKNOWN,
});

export function normalizeErrorCategory(value) {
  const candidate = String(value || '').toUpperCase();
  return ERROR_CATEGORIES.includes(candidate)
    ? candidate
    : LEGACY_CATEGORY[candidate] || ERROR_CATEGORY.UNKNOWN;
}

export class NexoError extends Error {
  constructor({ code = 'NEXO_UNKNOWN', category = ERROR_CATEGORY.UNKNOWN, message, recoverable, retryAfter = null, details = {}, cause = null }) {
    super(String(message || 'Erro desconhecido.'), cause ? { cause } : undefined);
    this.name = 'NexoError';
    this.code = String(code || 'NEXO_UNKNOWN');
    this.category = normalizeErrorCategory(category);
    this.kind = this.category;
    this.recoverable = recoverable ?? ![ERROR_CATEGORY.AUTH, ERROR_CATEGORY.PERMISSION, ERROR_CATEGORY.DEFINITIVE].includes(this.category);
    this.retryAfter = Number.isFinite(retryAfter) ? Math.max(0, Number(retryAfter)) : null;
    this.details = details && typeof details === 'object' ? details : {};
  }

  toJSON() {
    return {
      code: this.code,
      category: this.category,
      message: this.message,
      recoverable: this.recoverable,
      retryAfter: this.retryAfter,
      details: this.details,
    };
  }
}

export function createNexoError(input) {
  return input instanceof NexoError ? input : new NexoError(input);
}

