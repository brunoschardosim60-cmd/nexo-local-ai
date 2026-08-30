import { defineTool } from '../tools/contracts.mjs';
import { RISK } from '../safety/policies.mjs';

const MIN_INTERVAL_SECONDS = 60;

function nextDate({ delaySeconds = 0, runAt = null }) {
  const parsed = runAt ? new Date(runAt) : new Date(Date.now() + Math.max(0, Number(delaySeconds) || 0) * 1000);
  if (Number.isNaN(parsed.getTime())) throw new Error('Data do agendamento inválida.');
  if (parsed.getTime() < Date.now() - 1000) throw new Error('O agendamento não pode começar no passado.');
  return parsed.toISOString();
}

export function createBackgroundScheduler({ database, eventBus, tickMs = 5_000, autoStart = true }) {
  let timer = null; let executor = null; let ticking = false;

  function schedule({ name, objective, scheduleType = 'once', delaySeconds = 0, runAt = null, intervalSeconds = null }) {
    if (!['once', 'interval'].includes(scheduleType)) throw new Error('Tipo de agendamento inválido.');
    const interval = scheduleType === 'interval' ? Math.max(MIN_INTERVAL_SECONDS, Number(intervalSeconds) || 0) : null;
    if (scheduleType === 'interval' && !intervalSeconds) throw new Error('Informe intervalSeconds para um agendamento recorrente.');
    const job = database.createBackgroundJob({
      name: String(name || objective).trim().slice(0, 120), objective: String(objective).trim().slice(0, 4000),
      scheduleType, intervalSeconds: interval, nextRunAt: nextDate({ delaySeconds, runAt }),
    });
    void eventBus.publish('background.scheduled', { jobId: job.id, name: job.name, nextRunAt: job.nextRunAt, scheduleType });
    return job;
  }

  async function tick(now = new Date()) {
    if (ticking || !executor) return [];
    ticking = true; const executed = [];
    try {
      for (const job of database.listDueBackgroundJobs(now.toISOString())) {
        const claimed = database.updateBackgroundJob(job.id, { status: 'running', lastRunAt: now.toISOString() });
        try {
          const task = await executor(claimed.objective, { source: 'background', jobId: claimed.id });
          const nextRunAt = claimed.scheduleType === 'interval' ? new Date(now.getTime() + claimed.intervalSeconds * 1000).toISOString() : claimed.nextRunAt;
          const updated = database.updateBackgroundJob(claimed.id, {
            status: claimed.scheduleType === 'interval' ? 'active' : 'completed', nextRunAt,
            lastTaskId: task?.id || null, runCount: claimed.runCount + 1,
          });
          await eventBus.publish('background.dispatched', { jobId: updated.id, taskId: updated.lastTaskId, runCount: updated.runCount });
          executed.push(updated);
        } catch (error) {
          const updated = database.updateBackgroundJob(claimed.id, { status: 'failed' });
          await eventBus.publish('background.failed', { jobId: updated.id, error: error instanceof Error ? error.message : 'Falha desconhecida.' }, { level: 'error' });
        }
      }
      return executed;
    } finally { ticking = false; }
  }

  function start() {
    if (timer) return;
    timer = setInterval(() => void tick(), Math.max(1_000, tickMs)); timer.unref?.();
  }

  const definitions = [
    defineTool({
      name: 'background.schedule', description: 'Agenda uma tarefa autônoma local para uma data ou intervalo.', risk: RISK.WRITE,
      inputSchema: { type: 'object', required: ['name', 'objective'], additionalProperties: false, properties: {
        name: { type: 'string', minLength: 2, maxLength: 120 }, objective: { type: 'string', minLength: 5, maxLength: 4000 },
        scheduleType: { type: 'string', enum: ['once', 'interval'], default: 'once' }, delaySeconds: { type: 'number', minimum: 0, maximum: 31_536_000, default: 0 },
        runAt: { type: 'string', maxLength: 40 }, intervalSeconds: { type: 'integer', minimum: MIN_INTERVAL_SECONDS, maximum: 31_536_000 },
      } }, execute: schedule,
    }),
    defineTool({
      name: 'background.list', description: 'Lista agendamentos locais e seus últimos resultados.', risk: RISK.READ,
      inputSchema: { type: 'object', additionalProperties: false, properties: { limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 } } },
      execute: ({ limit = 30 }) => database.listBackgroundJobs(limit),
    }),
    defineTool({
      name: 'background.cancel', description: 'Cancela um agendamento futuro sem apagar seu histórico.', risk: RISK.WRITE,
      inputSchema: { type: 'object', required: ['jobId'], additionalProperties: false, properties: { jobId: { type: 'string', minLength: 10, maxLength: 100 } } },
      execute: ({ jobId }) => {
        const job = database.getBackgroundJob(jobId); if (!job) throw new Error('Agendamento não encontrado.');
        const updated = database.updateBackgroundJob(jobId, { status: 'cancelled' }); void eventBus.publish('background.cancelled', { jobId }); return updated;
      },
    }),
  ];

  if (autoStart) start();
  return {
    definitions, schedule, tick, start, setExecutor(value) { executor = value; },
    list(limit) { return database.listBackgroundJobs(limit); }, cancel(id) { return database.updateBackgroundJob(id, { status: 'cancelled' }); },
    close() { if (timer) clearInterval(timer); timer = null; },
    health() { const jobs = database.listBackgroundJobs(500); return { active: jobs.filter(job => job.status === 'active').length, total: jobs.length, running: Boolean(timer) }; },
  };
}
