const DIFFICULTY_BUDGETS = Object.freeze({
  low: { maxRetries: 0, maxSelfCorrections: 1 },
  medium: { maxRetries: 1, maxSelfCorrections: 2 },
  high: { maxRetries: 2, maxSelfCorrections: 3 },
});

const EFFORT_BONUS = Object.freeze({
  Baixo: -1,
  Médio: 0,
  Alto: 1,
  'Extra alto': 2,
});

export function adaptiveCorrectionBudget({ difficulty = 'medium', effort = 'Médio' } = {}) {
  const level = DIFFICULTY_BUDGETS[difficulty] ? difficulty : 'medium';
  const base = DIFFICULTY_BUDGETS[level];
  const bonus = level === 'low' ? 0 : (EFFORT_BONUS[effort] ?? 0);
  return {
    difficulty: level,
    maxRetries: Math.max(0, Math.min(4, base.maxRetries + bonus)),
    maxSelfCorrections: Math.max(1, Math.min(5, base.maxSelfCorrections + bonus)),
  };
}
