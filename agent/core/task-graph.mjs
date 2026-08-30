function normalizeNode(step, index, plan) {
  const previous = plan[index - 1];
  const dependencies = Array.isArray(step.dependencies) ? step.dependencies.filter(Boolean) : previous ? [previous.id] : [];
  return {
    id: step.id, parentId: step.parentId || null, title: step.title, objective: step.objective || step.description,
    description: step.description, status: step.status || 'pending', dependencies, attempts: step.attempts || 0,
    observations: step.observations || [], artifacts: step.artifacts || [], assignedAgent: step.assignedAgent || 'general',
    model: step.model || null, confidence: step.confidence ?? null,
    successCriteria: Array.isArray(step.successCriteria) ? step.successCriteria : step.action?.successCriteria ? [step.action.successCriteria] : [],
    action: step.action || null, output: step.output ?? null, error: step.error || null,
    startedAt: step.startedAt || null, completedAt: step.completedAt || null,
  };
}

export function createTaskGraph(database) {
  return {
    sync(taskId, plan) { return database.replaceTaskGraph(taskId, plan.map((step, index) => normalizeNode(step, index, plan))); },
    get(taskId) { return database.getTaskGraph(taskId); },
    ready(taskId) {
      const nodes = database.getTaskGraph(taskId); const completed = new Set(nodes.filter(node => node.status === 'completed').map(node => node.id));
      return nodes.filter(node => ['pending', 'ready'].includes(node.status) && node.dependencies.every(id => completed.has(id)));
    },
    validate(taskId) {
      const nodes = database.getTaskGraph(taskId); const ids = new Set(nodes.map(node => node.id)); const errors = [];
      for (const node of nodes) for (const dependency of node.dependencies) if (!ids.has(dependency)) errors.push(`${node.id} depende de ${dependency}, que não existe.`);
      const visiting = new Set(); const visited = new Set(); const byId = new Map(nodes.map(node => [node.id, node]));
      function visit(id) {
        if (visiting.has(id)) { errors.push(`Ciclo detectado em ${id}.`); return; }
        if (visited.has(id)) return; visiting.add(id);
        for (const dependency of byId.get(id)?.dependencies || []) visit(dependency);
        visiting.delete(id); visited.add(id);
      }
      nodes.forEach(node => visit(node.id));
      return { valid: errors.length === 0, errors, nodeCount: nodes.length };
    },
  };
}
