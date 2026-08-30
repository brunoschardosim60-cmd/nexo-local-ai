import { createTrace } from '../observability/tracing.mjs';
import { validateTaskLimits } from '../safety/policies.mjs';

const TERMINAL = new Set(['completed', 'completed_with_warnings', 'failed', 'cancelled']);
function completedPrefix(plan, index) { return plan.slice(0, index).filter(step => step.status === 'completed'); }

export function createAgentLoop({ config, database, registry, permissionManager, planner, executor, evaluator, memory, rag, logger, taskGraph, checkpoints, contextEngine, eventBus = null }) {
  const backgroundRuns = new Map();
  const graph = taskGraph || { sync: () => [], get: () => [], validate: () => ({ valid: true, errors: [], nodeCount: 0 }) };
  const checkpointStore = checkpoints || { capture: () => null, list: () => [] };
  const contexts = contextEngine || { build: async ({ objective }) => ({ memories: memory.search(objective, { limit: 6 }), documents: rag.search(objective, 8), repository: null, trusted: [], untrusted: [], budget: {} }) };

  function snapshot(taskId) {
    const task = database.getTask(taskId); if (!task) return null;
    return { ...task, children: database.listChildTasks?.(taskId) || [], graph: graph.get(taskId), checkpoints: checkpointStore.list(taskId, 10), events: database.getEvents(taskId), toolRuns: database.getToolRuns(taskId), permissions: permissionManager.list(taskId) };
  }

  function enqueue(taskId, operation) {
    if (backgroundRuns.has(taskId)) return;
    const promise = Promise.resolve().then(operation).catch(async error => {
      await fail(taskId, error instanceof Error ? error.message : 'Falha inesperada na tarefa.');
    }).finally(() => backgroundRuns.delete(taskId)).catch(() => undefined);
    backgroundRuns.set(taskId, promise);
  }

  function initializeTask(objective, options = {}) {
    if (typeof objective !== 'string' || objective.trim().length < 5 || objective.length > 4000) throw new Error('Objetivo inválido.');
    const limits = validateTaskLimits(options, config.limits);
    const assignedAgent = options.assignedAgent || 'general';
    const task = database.createTask({ objective: objective.trim(), ...limits, parentTaskId: options.parentTaskId || null, assignedAgent });
    database.addEvent(task.id, 'run.started', 'Execução autônoma iniciada.', { runtime: 'nexo-core-v1' });
    database.addEvent(task.id, 'task.created', 'Tarefa criada e salva localmente.', limits);
    void eventBus?.publish('task.created', { objective: task.objective, limits, parentTaskId: task.parentTaskId, assignedAgent }, { taskId: task.id, source: 'agent-loop' });
    checkpointStore.capture(task.id, 'initial', 'Objetivo recebido');
    void logger.info('task.created', { taskId: task.id, objective: task.objective, ...limits }).catch(() => undefined);
    return task;
  }

  async function prepareAndRun(taskId) {
    try {
      let task = database.getTask(taskId); if (!task) throw new Error('Tarefa não encontrada.');
      if (task.plan.length) return run(taskId);
      const context = await contexts.build({ objective: task.objective, task, events: database.getEvents(taskId), runs: database.getToolRuns(taskId) });
      const plan = await planner.createPlan({ objective: task.objective, preferredSpecialist: task.assignedAgent, tools: registry.describe(), memories: context.memories, documents: context.documents, context });
      task = database.updateTask(task.id, { plan, status: 'running' }); graph.sync(task.id, plan);
      const graphValidation = graph.validate(task.id); if (!graphValidation.valid) throw new Error(`Grafo de tarefas inválido: ${graphValidation.errors.join(' ')}`);
      database.addEvent(task.id, 'plan.created', `Plano criado com ${plan.length} etapas.`, { steps: plan.map(step => step.title), graph: graphValidation });
      checkpointStore.capture(task.id, 'plan', 'Plano persistido'); return run(task.id);
    } catch (error) { return fail(taskId, error instanceof Error ? error.message : 'Falha inesperada ao preparar a tarefa.'); }
  }

  async function finish(task) {
    const runs = database.getToolRuns(task.id); const validation = await evaluator.summarize(task, runs);
    const completedAt = new Date().toISOString(); const status = validation.validated ? 'completed' : 'completed_with_warnings';
    database.updateTask(task.id, { status, result: validation, completedAt });
    database.addEvent(task.id, 'run.completed', validation.summary || 'Tarefa concluída.', validation, validation.validated ? 'info' : 'warn');
    database.addEvent(task.id, 'task.completed', validation.summary || 'Tarefa concluída.', validation, validation.validated ? 'info' : 'warn');
    await eventBus?.publish('task.completed', validation, { taskId: task.id, source: 'agent-loop', level: validation.validated ? 'info' : 'warn' });
    checkpointStore.capture(task.id, 'final', validation.validated ? 'Resultado verificado' : 'Resultado com alertas');
    memory.remember(`Objetivo: ${task.objective}\nResultado: ${validation.summary}\nEvidências: ${validation.evidence.join('; ')}`, {
      kind: 'episodic', importance: validation.validated ? 0.78 : 0.55, confidence: validation.validated ? 0.9 : 0.55,
      source: 'task-verifier', lastConfirmedAt: validation.validated ? completedAt : null, metadata: { taskId: task.id, validated: validation.validated },
    });
    await logger.info('task.completed', { taskId: task.id, validated: validation.validated }); return snapshot(task.id);
  }

  async function fail(taskId, error) {
    const task = database.getTask(taskId); if (!task || TERMINAL.has(task.status)) return snapshot(taskId);
    database.updateTask(taskId, { status: 'failed', error, completedAt: new Date().toISOString() });
    database.addEvent(taskId, 'task.failed', error, null, 'error'); checkpointStore.capture(taskId, 'failure', 'Falha persistida');
    await eventBus?.publish('task.failed', { error }, { taskId, source: 'agent-loop', level: 'error' });
    await logger.error('task.failed', { taskId, error }); return snapshot(taskId);
  }

  async function run(taskId) {
    const trace = createTrace(taskId);
    while (true) {
      let task = database.getTask(taskId); if (!task) throw new Error('Tarefa não encontrada.');
      if (TERMINAL.has(task.status) || task.status === 'paused' || task.status === 'awaiting_approval') return snapshot(taskId);
      if (task.stepsUsed >= task.maxSteps) return fail(taskId, `Limite seguro de ${task.maxSteps} passos atingido.`);
      if (Date.now() - new Date(task.createdAt).getTime() > config.limits.maxTaskMinutes * 60_000) return fail(taskId, 'Tempo máximo da tarefa atingido.');
      if (task.currentStep >= task.plan.length) return finish(task);

      const stepIndex = task.currentStep; let step = task.plan[stepIndex]; if (!step) return finish(task);
      const completedRun = database.getToolRuns(taskId).filter(item => item.stepIndex === stepIndex && item.status === 'completed').at(-1);
      if (completedRun && step.status !== 'completed') {
        const plan = [...task.plan]; plan[stepIndex] = { ...step, status: 'completed', output: completedRun.output, observations: [...(step.observations || []), 'Recuperado de uma execução persistida.'] };
        database.updateTask(taskId, { plan, currentStep: stepIndex + 1, stepsUsed: task.stepsUsed + 1, status: 'running' }); graph.sync(taskId, plan);
        database.addEvent(taskId, 'step.recovered', `${step.title} recuperada do checkpoint.`, { toolRunId: completedRun.id }); checkpointStore.capture(taskId, 'recovery', `Etapa ${stepIndex + 1} recuperada`); continue;
      }
      const span = trace.span('agent.step', { stepIndex, title: step.title });

      if (!step.action) {
        database.addEvent(taskId, 'step.selecting_tool', `Selecionando ferramenta para: ${step.title}`);
        try {
          const context = await contexts.build({ objective: `${task.objective}\n${step.description}`, task, events: database.getEvents(taskId), runs: database.getToolRuns(taskId) });
          const action = await planner.selectAction({ task, step, tools: registry.describe(), events: database.getEvents(taskId), runs: database.getToolRuns(taskId), memories: context.memories, documents: context.documents, context });
          registry.get(action.tool); task = database.getTask(taskId);
          if (TERMINAL.has(task.status) || task.status === 'paused') return snapshot(taskId);
          const plan = [...task.plan]; plan[stepIndex] = { ...step, action, status: 'ready', model: action.model || null, successCriteria: [action.successCriteria] };
          task = database.updateTask(taskId, { plan, status: 'running' }); graph.sync(taskId, plan); step = task.plan[stepIndex];
          database.addEvent(taskId, 'tool.selected', `${action.tool}: ${action.reason}`, { tool: action.tool, input: action.input, successCriteria: action.successCriteria });
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'Falha ao selecionar ferramenta.'; database.addEvent(taskId, 'planner.failed', reason, null, 'warn');
          const recovery = await planner.replan({ task, failedStep: step, error: reason, completedSteps: completedPrefix(task.plan, stepIndex) });
          const plan = [...completedPrefix(task.plan, stepIndex), ...recovery]; const nextIndex = completedPrefix(task.plan, stepIndex).length;
          database.updateTask(taskId, { plan, currentStep: nextIndex, stepsUsed: task.stepsUsed + 1, status: 'running' }); graph.sync(taskId, plan); checkpointStore.capture(taskId, 'replan', reason); continue;
        }
      }

      const tool = registry.get(step.action.tool); const policy = permissionManager.inspect(tool, step.action.input);
      if (policy.decision === 'deny') {
        database.addEvent(taskId, 'policy.denied', policy.reason, { tool: tool.name, scope: policy.scope }, 'error');
        return fail(taskId, policy.reason);
      }
      if (policy.required) {
        let permission = step.permissionId ? database.getPermission(step.permissionId) : null;
        if (!permission) {
          permission = permissionManager.request(taskId, tool, step.action.input);
          const plan = [...task.plan]; plan[stepIndex] = { ...step, permissionId: permission.id, status: 'awaiting_approval' };
          database.updateTask(taskId, { plan, status: 'awaiting_approval' }); graph.sync(taskId, plan);
          database.addEvent(taskId, 'permission.requested', `${policy.reason} Escopo: ${policy.scope}`, { permissionId: permission.id, tool: tool.name, input: step.action.input }, 'warn');
          void eventBus?.publish('permission.requested', { permissionId: permission.id, tool: tool.name, scope: policy.scope }, { taskId, source: 'agent-loop', level: 'warn' });
          checkpointStore.capture(taskId, 'permission', `Aguardando aprovação para ${tool.name}`);
          await logger.warn('permission.requested', { taskId, permissionId: permission.id, tool: tool.name, scope: policy.scope }); return snapshot(taskId);
        }
        if (permission.status === 'pending') return snapshot(taskId);
        if (permission.status === 'denied') return fail(taskId, `Permissão negada para ${tool.name}.`);
      }

      checkpointStore.capture(taskId, 'before-tool', `Antes de ${tool.name}`);
      database.addEvent(taskId, 'tool.started', `Executando ${tool.name}.`, { input: step.action.input });
      const execution = await executor.execute({ taskId, stepIndex, action: step.action, maxRetries: task.maxRetries });
      const evaluation = evaluator.evaluateTool(step.action, execution); task = database.getTask(taskId);
      if (task.status === 'cancelled') { database.addEvent(taskId, 'tool.observed_after_cancel', `${tool.name} terminou após o cancelamento.`, { ok: execution.ok }, 'warn'); return snapshot(taskId); }
      if (evaluation.success) {
        const plan = [...task.plan]; plan[stepIndex] = { ...plan[stepIndex], status: 'completed', output: execution.output, attempts: execution.attempt, observations: [...(plan[stepIndex].observations || []), evaluation.reason], completedAt: new Date().toISOString() };
        database.updateTask(taskId, { plan, currentStep: stepIndex + 1, stepsUsed: task.stepsUsed + 1, status: task.status === 'paused' ? 'paused' : 'running' }); graph.sync(taskId, plan);
        database.addEvent(taskId, 'step.completed', `${step.title} concluída.`, { tool: tool.name, evaluation: evaluation.reason, trace: span.finish({ ok: true }) }); checkpointStore.capture(taskId, 'after-step', `Etapa ${stepIndex + 1} concluída`); continue;
      }

      database.addEvent(taskId, 'step.failed', `${step.title}: ${evaluation.reason}`, { tool: tool.name, trace: span.finish({ ok: false }) }, 'warn');
      const completed = completedPrefix(task.plan, stepIndex); const recovery = await planner.replan({ task, failedStep: step, error: evaluation.reason, completedSteps: completed });
      const failedStep = { ...step, status: 'failed', error: evaluation.reason, attempts: execution.attempt }; const plan = [...completed, failedStep, ...recovery];
      database.updateTask(taskId, { plan, currentStep: completed.length + 1, stepsUsed: task.stepsUsed + 1, status: 'running' }); graph.sync(taskId, plan);
      database.addEvent(taskId, 'task.replanned', 'O plano foi ajustado após a falha.', { recoverySteps: recovery.map(item => item.title) }); checkpointStore.capture(taskId, 'replan', evaluation.reason);
    }
  }

  function resolvePermission(taskId, permissionId, decision) {
    const permission = database.getPermission(permissionId); if (!permission || permission.taskId !== taskId) throw new Error('Permissão não encontrada.');
    const resolved = permissionManager.resolve(permissionId, decision);
    database.addEvent(taskId, `permission.${resolved.status}`, resolved.status === 'approved' ? `Ação ${resolved.tool} aprovada pelo usuário.` : `Ação ${resolved.tool} negada pelo usuário.`, { permissionId, tool: resolved.tool }); return resolved;
  }

  return {
    async createTask(objective, options = {}) { const task = initializeTask(objective, options); return prepareAndRun(task.id); },
    enqueueTask(objective, options = {}) { const task = initializeTask(objective, options); enqueue(task.id, () => prepareAndRun(task.id)); return snapshot(task.id); },
    run, getTask: snapshot,
    listTasks(limit) { return database.listTasks(limit).map(task => snapshot(task.id)); },
    async decidePermission(taskId, permissionId, decision) {
      const resolved = resolvePermission(taskId, permissionId, decision); if (resolved.status === 'denied') return fail(taskId, `Permissão negada para ${resolved.tool}.`);
      database.updateTask(taskId, { status: 'running' }); return run(taskId);
    },
    enqueuePermissionDecision(taskId, permissionId, decision) {
      const resolved = resolvePermission(taskId, permissionId, decision);
      if (resolved.status === 'denied') enqueue(taskId, () => fail(taskId, `Permissão negada para ${resolved.tool}.`));
      else { database.updateTask(taskId, { status: 'running' }); enqueue(taskId, () => run(taskId)); }
      return snapshot(taskId);
    },
    control(taskId, action) {
      const task = database.getTask(taskId); if (!task) throw new Error('Tarefa não encontrada.');
      if (action === 'pause' && ['planning', 'running'].includes(task.status)) {
        database.updateTask(taskId, { status: 'paused' }); database.addEvent(taskId, 'task.paused', 'Tarefa pausada pelo usuário.'); checkpointStore.capture(taskId, 'pause', 'Pausa solicitada');
      } else if (action === 'cancel' && !TERMINAL.has(task.status)) {
        database.updateTask(taskId, { status: 'cancelled', completedAt: new Date().toISOString() }); database.addEvent(taskId, 'task.cancelled', 'Tarefa cancelada pelo usuário.', null, 'warn'); checkpointStore.capture(taskId, 'cancel', 'Cancelamento solicitado');
      } else if (action === 'resume' && task.status === 'paused') {
        database.updateTask(taskId, { status: task.plan.length ? 'running' : 'planning' }); database.addEvent(taskId, 'task.resumed', 'Tarefa retomada pelo usuário.'); enqueue(taskId, () => task.plan.length ? run(taskId) : prepareAndRun(taskId));
      } else if (!['pause', 'cancel', 'resume'].includes(action)) throw new Error('Ação de controle inválida.');
      return snapshot(taskId);
    },
    resumeInterrupted() {
      const tasks = database.listInterruptedTasks();
      for (const task of tasks) {
        database.addEvent(task.id, 'task.resumed_after_restart', 'Tarefa interrompida encontrada; retomada a partir do estado persistido.', null, 'warn');
        checkpointStore.capture(task.id, 'resume', 'Retomada após reinício'); enqueue(task.id, () => task.plan.length ? run(task.id) : prepareAndRun(task.id));
      }
      return tasks.length;
    },
  };
}
