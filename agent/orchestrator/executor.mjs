import { classifyFailure, ERROR_KIND, recoveryPolicy } from './errors.mjs';
import { compressToolResult } from '../context/tool-compression.mjs';

export function createExecutor({ registry, database, logger, maxOutput }) {
  const active = new Map();
  return {
    async execute({ taskId, stepIndex, action, maxRetries, context = {} }) {
      let lastError = null;
      for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
        const controller = new AbortController(); const key = `${taskId}:${stepIndex}:${attempt}`;
        active.set(key, controller);
        const startedAt = performance.now();
        try {
          if (context.signal?.aborted) controller.abort(context.signal.reason);
          const abort = () => controller.abort(context.signal?.reason || new Error('Tarefa cancelada.'));
          context.signal?.addEventListener('abort', abort, { once: true });
          const output = await registry.execute(action.tool, action.input, { ...context, taskId, stepIndex, signal: controller.signal });
          context.signal?.removeEventListener('abort', abort);
          if (controller.signal.aborted) throw new Error('Execução cancelada pelo usuário.');
          const durationMs = performance.now() - startedAt;
          const compressed = compressToolResult(output, { maxChars: maxOutput }); const clipped = compressed.summary;
          database.addToolRun({ taskId, stepIndex, tool: action.tool, input: action.input, output, summary: clipped, status: 'completed', attempt, durationMs });
          await logger.info('tool.completed', { taskId, stepIndex, tool: action.tool, attempt, durationMs });
          return { ok: true, output: clipped, attempt, durationMs };
        } catch (error) {
          lastError = error instanceof Error ? error.message : 'Falha desconhecida.';
          const durationMs = performance.now() - startedAt;
          const errorKind = classifyFailure(lastError, { phase: 'tool' }); const recovery = recoveryPolicy(errorKind, attempt);
          database.addToolRun({ taskId, stepIndex, tool: action.tool, input: action.input, status: 'failed', attempt, durationMs, error: lastError, errorKind });
          await logger.warn('tool.failed', { taskId, stepIndex, tool: action.tool, attempt, error: lastError, errorKind, recovery: recovery.action });
          if (!recovery.retry || errorKind !== ERROR_KIND.TRANSIENT) break;
        } finally {
          active.delete(key);
        }
      }
      return { ok: false, error: lastError || 'Ferramenta falhou.' };
    },
    cancel(taskId) {
      let count = 0;
      for (const [key, controller] of active) if (key.startsWith(`${taskId}:`)) { controller.abort(new Error('Tarefa cancelada pelo usuário.')); count += 1; }
      return count;
    },
    active(taskId = null) { return [...active.keys()].filter(key => !taskId || key.startsWith(`${String(taskId)}:`)); },
  };
}
