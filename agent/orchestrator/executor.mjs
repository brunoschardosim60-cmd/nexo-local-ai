import { classifyFailure, ERROR_KIND, recoveryPolicy } from './errors.mjs';

export function createExecutor({ registry, database, logger, maxOutput }) {
  return {
    async execute({ taskId, stepIndex, action, maxRetries }) {
      let lastError = null;
      for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
        const startedAt = performance.now();
        try {
          const output = await registry.execute(action.tool, action.input, { taskId, stepIndex });
          const durationMs = performance.now() - startedAt;
          const serialized = JSON.stringify(output);
          const clipped = serialized.length <= maxOutput ? output : { truncated: true, preview: serialized.slice(0, maxOutput) };
          database.addToolRun({ taskId, stepIndex, tool: action.tool, input: action.input, output: clipped, status: 'completed', attempt, durationMs });
          await logger.info('tool.completed', { taskId, stepIndex, tool: action.tool, attempt, durationMs });
          return { ok: true, output: clipped, attempt, durationMs };
        } catch (error) {
          lastError = error instanceof Error ? error.message : 'Falha desconhecida.';
          const durationMs = performance.now() - startedAt;
          const errorKind = classifyFailure(lastError, { phase: 'tool' }); const recovery = recoveryPolicy(errorKind, attempt);
          database.addToolRun({ taskId, stepIndex, tool: action.tool, input: action.input, status: 'failed', attempt, durationMs, error: lastError, errorKind });
          await logger.warn('tool.failed', { taskId, stepIndex, tool: action.tool, attempt, error: lastError, errorKind, recovery: recovery.action });
          if (!recovery.retry || errorKind !== ERROR_KIND.TRANSIENT) break;
        }
      }
      return { ok: false, error: lastError || 'Ferramenta falhou.' };
    },
  };
}
