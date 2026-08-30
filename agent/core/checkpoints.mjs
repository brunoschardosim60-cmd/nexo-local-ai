export function createCheckpointManager(database, taskGraph, { keep = 30 } = {}) {
  return {
    capture(taskId, kind, label) {
      const task = database.getTask(taskId); if (!task) throw new Error('Tarefa não encontrada para checkpoint.');
      const checkpoint = database.putCheckpoint(taskId, kind, label, {
        task, graph: taskGraph.get(taskId), events: database.getEvents(taskId, 500), toolRuns: database.getToolRuns(taskId), permissions: database.getPermissions(taskId),
      });
      database.pruneCheckpoints(taskId, keep);
      return checkpoint;
    },
    list(taskId, limit = keep) { return database.listCheckpoints(taskId, limit); },
    latest(taskId) { return database.listCheckpoints(taskId, 1)[0] || null; },
  };
}
