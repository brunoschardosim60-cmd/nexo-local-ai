const DIMENSIONS = 384;

function tokens(text) {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const words = normalized.match(/[a-z0-9_]{2,}/g) || [];
  return [...words, ...words.slice(0, -1).map((word, index) => `${word}_${words[index + 1]}`)];
}

function hash(value) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return result >>> 0;
}

export function embedText(text) {
  const vector = Array.from({ length: DIMENSIONS }, () => 0);
  for (const token of tokens(text)) {
    const value = hash(token); const index = value % DIMENSIONS;
    vector[index] += (value & 1) === 0 ? 1 : -1;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0)) || 1;
  return vector.map(item => item / magnitude);
}

export function cosineSimilarity(left, right) {
  const length = Math.min(left.length, right.length); let score = 0;
  for (let index = 0; index < length; index += 1) score += left[index] * right[index];
  return score;
}
