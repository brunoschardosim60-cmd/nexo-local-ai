import { EventEmitter } from 'node:events';

export function createMediaQueue({ database, resourceManager, handlers = {}, concurrency = 1 }) {
  const events = new EventEmitter(); const pending = []; const controllers = new Map(); let running = 0;
  function publish(job) { events.emit('job', job); return job; }
  function schedule() { queueMicrotask(drain); }
  async function drain() {
    while (running < concurrency && pending.length) {
      pending.sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt));
      const next = pending.shift(); const current = database.getMediaJob(next.id);
      if (!current || current.status === 'cancelled') continue;
      const handler = handlers[current.kind];
      if (!handler) { publish(database.updateMediaJob(current.id, { status: 'failed', error: `Provider ${current.kind} não configurado.`, completedAt: new Date().toISOString() })); continue; }
      const decision = resourceManager.decide({ kind: current.kind, priority: current.priority, ...handler.resources });
      if (decision.decision === 'reject') { publish(database.updateMediaJob(current.id, { status: 'failed', error: decision.reason, completedAt: new Date().toISOString() })); continue; }
      if (decision.decision === 'queue' && pending.length) { pending.push(next); break; }
      running += 1; const controller = new AbortController(); controllers.set(current.id, controller); resourceManager.acquire({ id: current.id, kind: current.kind, priority: current.priority });
      publish(database.updateMediaJob(current.id, { status: 'running', startedAt: new Date().toISOString(), error: null }));
      void Promise.resolve(handler.run(current.input, { signal: controller.signal, jobId: current.id })).then(result => {
        if (database.getMediaJob(current.id)?.status !== 'cancelled') publish(database.updateMediaJob(current.id, { status: 'completed', artifactId: result?.artifact?.id || result?.id || null, completedAt: new Date().toISOString() }));
      }).catch(error => {
        if (database.getMediaJob(current.id)?.status !== 'cancelled') publish(database.updateMediaJob(current.id, { status: 'failed', error: String(error?.message || error), completedAt: new Date().toISOString() }));
      }).finally(() => { controllers.delete(current.id); resourceManager.release(current.id); running -= 1; schedule(); });
    }
  }
  function enqueue(kind, input, { priority = 5 } = {}) { const job = database.createMediaJob({ kind, priority, input }); pending.push(job); publish(job); schedule(); return job; }
  function cancel(id) {
    const job = database.getMediaJob(id); if (!job) throw new Error('Job de mídia não encontrado.');
    if (['completed', 'failed', 'cancelled'].includes(job.status)) return job;
    controllers.get(id)?.abort(); const index = pending.findIndex(item => item.id === id); if (index >= 0) pending.splice(index, 1);
    return publish(database.updateMediaJob(id, { status: 'cancelled', cancelledAt: new Date().toISOString(), error: 'Cancelado pelo usuário.' }));
  }
  function setHandler(kind, handler) { handlers[kind] = handler; }
  return { enqueue, cancel, get: database.getMediaJob, list: database.listMediaJobs, setHandler, subscribe(listener) { events.on('job', listener); return () => events.off('job', listener); }, health: () => ({ concurrency, running, queued: pending.length, kinds: Object.keys(handlers) }) };
}
