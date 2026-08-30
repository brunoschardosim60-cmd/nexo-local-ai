import { randomUUID } from 'node:crypto';

export function createTrace(taskId) {
  const traceId = randomUUID();
  return {
    traceId,
    taskId,
    span(name, attributes = {}) {
      const startedAt = performance.now();
      const spanId = randomUUID();
      return {
        spanId,
        name,
        attributes,
        finish(extra = {}) {
          return { traceId, spanId, taskId, name, durationMs: performance.now() - startedAt, ...attributes, ...extra };
        },
      };
    },
  };
}
