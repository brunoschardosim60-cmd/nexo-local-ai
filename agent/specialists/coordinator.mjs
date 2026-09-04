import { defineTool } from '../tools/contracts.mjs';
import { RISK } from '../safety/policies.mjs';

const SPECIALISTS = ['general', 'coding', 'research', 'browser', 'document', 'data', 'workspace'];

export function createMultiAgentCoordinator({ database, eventBus, maxParallel = 4 }) {
  let loop = null;
  function requireLoop() { if (!loop) throw new Error('Coordenador de agentes ainda não está conectado ao runtime.'); return loop; }

  function delegate({ tasks }, context = {}) {
    if (!Array.isArray(tasks) || tasks.length < 2) throw new Error('Delegação exige pelo menos duas subtarefas independentes.');
    const runtime = requireLoop(); const selected = tasks.slice(0, maxParallel);
    const children = selected.map(item => runtime.enqueueTask(item.objective, {
      assignedAgent: item.specialist || 'general', parentTaskId: context.taskId || null,
      maxSteps: item.maxSteps, maxRetries: item.maxRetries,
    }));
    void eventBus.publish('agents.delegated', { parentTaskId: context.taskId || null, children: children.map(task => ({ id: task.id, assignedAgent: task.assignedAgent, objective: task.objective })) }, { taskId: context.taskId || null, source: 'multi-agent' });
    return { parentTaskId: context.taskId || null, parallel: true, children: children.map(task => ({ id: task.id, objective: task.objective, assignedAgent: task.assignedAgent, status: task.status })) };
  }

  function status({ taskIds = [], parentTaskId = null }) {
    const runtime = requireLoop(); const ids = parentTaskId ? database.listChildTasks(parentTaskId).map(task => task.id) : taskIds;
    const tasks = ids.map(id => runtime.getTask(id)).filter(Boolean);
    return { parentTaskId, complete: tasks.length > 0 && tasks.every(task => ['completed', 'completed_with_warnings', 'failed', 'cancelled'].includes(task.status)), tasks: tasks.map(task => ({ id: task.id, objective: task.objective, assignedAgent: task.assignedAgent, status: task.status, result: task.result, error: task.error })) };
  }

  function message({ receiver, type = 'finding', content, evidence = [], artifactIds = [] }, context = {}) {
    return database.addAgentMessage({ taskId: context.taskId || null, sender: context.agent || 'general', receiver, type, content, evidence, artifactIds });
  }

  function collect({ parentTaskId }) {
    const summary = status({ parentTaskId }); const messages = database.listAgentMessages(parentTaskId);
    const artifactOwners = new Map(); const conflicts = [];
    for (const task of summary.tasks) for (const artifact of task.result?.artifacts || []) {
      const key = artifact.path || artifact.location || artifact.id; if (!key) continue;
      if (artifactOwners.has(key) && artifactOwners.get(key) !== task.id) conflicts.push({ resource: key, tasks: [artifactOwners.get(key), task.id], resolution: 'SUPERVISOR_REVIEW_REQUIRED' });
      else artifactOwners.set(key, task.id);
    }
    return { ...summary, messages, conflicts, verdict: conflicts.length ? 'UNCERTAIN' : summary.complete ? 'READY_FOR_VERIFICATION' : 'IN_PROGRESS' };
  }

  const definitions = [
    defineTool({
      name: 'agents.delegate', description: 'Delega de duas a quatro subtarefas independentes a especialistas que executam em paralelo e mantêm permissões próprias.', risk: RISK.WRITE,
      inputSchema: {
        type: 'object', required: ['tasks'], additionalProperties: false,
        properties: {
          tasks: {
            type: 'array', minItems: 2, maxItems: maxParallel,
            items: {
              type: 'object', required: ['objective', 'specialist'], additionalProperties: false,
              properties: {
                objective: { type: 'string', minLength: 5, maxLength: 2000 }, specialist: { type: 'string', enum: SPECIALISTS },
                maxSteps: { type: 'integer', minimum: 1, maximum: 14 }, maxRetries: { type: 'integer', minimum: 0, maximum: 2 },
              },
            },
          },
        },
      },
      execute: delegate,
    }),
    defineTool({
      name: 'agents.status', description: 'Consulta o estado e resultados observados de subtarefas delegadas.', risk: RISK.READ,
      inputSchema: { type: 'object', additionalProperties: false, properties: { taskIds: { type: 'array', maxItems: maxParallel, items: { type: 'string', minLength: 10, maxLength: 100 } }, parentTaskId: { type: 'string', minLength: 10, maxLength: 100 } } },
      execute: status,
    }),
    defineTool({ name: 'agents.message', description: 'Envia uma mensagem estruturada entre especialistas com evidências e artefatos rastreáveis.', risk: RISK.WRITE, inputSchema: { type: 'object', required: ['receiver', 'content'], additionalProperties: false, properties: { receiver: { type: 'string', enum: SPECIALISTS }, type: { type: 'string', enum: ['request', 'finding', 'blocker', 'review', 'handoff'] }, content: { type: 'object' }, evidence: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 2000 } }, artifactIds: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 100 } } } }, execute: message }),
    defineTool({ name: 'agents.collect', description: 'Supervisor coleta resultados, mensagens e conflitos de escrita antes da síntese.', risk: RISK.READ, inputSchema: { type: 'object', required: ['parentTaskId'], additionalProperties: false, properties: { parentTaskId: { type: 'string', minLength: 10, maxLength: 100 } } }, execute: collect }),
  ];

  return { definitions, delegate, status, message, collect, setLoop(value) { loop = value; }, health: () => ({ enabled: Boolean(loop), maxParallel, specialists: SPECIALISTS, structuredMessages: true, conflictDetection: true, leastPrivilege: true }) };
}
