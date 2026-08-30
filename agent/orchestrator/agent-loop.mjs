import { createTrace } from '../observability/tracing.mjs';
import { validateTaskLimits } from '../safety/policies.mjs';

const TERMINAL = new Set(['completed', 'completed_with_warnings', 'failed', 'cancelled']);
function completedSteps(plan) { return plan.filter(step => step.status === 'completed'); }

export function createAgentLoop({ config, database, registry, permissionManager, planner, executor, evaluator, critic = null, memory, rag, logger, taskGraph, checkpoints, contextEngine, eventBus = null, goalEngine = null, specialistRegistry = null, capabilityManager = null }) {
  const backgroundRuns = new Map();
  const graph = taskGraph || { sync: () => [], get: () => [], validate: () => ({ valid: true, errors: [], nodeCount: 0 }) };
  const checkpointStore = checkpoints || { capture: () => null, list: () => [] };
  const contexts = contextEngine || { build: async ({ objective }) => { const [memories, documents] = await Promise.all([memory.search(objective, { limit: 6 }), rag.search(objective, 8)]); return { memories, documents, repository: null, trusted: [], untrusted: [], budget: {} }; } };
  const controllers = new Map();
  const specialist = id => specialistRegistry?.get?.(id) || { id: id || 'general', toolNamespaces: [] };
  const toolsFor = (objective, agent) => {
    const discovered = registry.discover?.({ objective, namespaces: specialist(agent).toolNamespaces, limit: agent === 'general' ? 20 : 16 }) || registry.describe();
    if (agent !== 'coding') return discovered;
    const essentialNames = new Set(['repository.map', 'code.validate', 'filesystem.list', 'filesystem.search', 'filesystem.read', 'filesystem.patch', 'filesystem.write', 'git.diff']);
    const essentials = registry.describe().filter(tool => essentialNames.has(tool.name));
    return [...discovered, ...essentials].filter((tool, index, all) => all.findIndex(item => item.name === tool.name) === index);
  };
  const taskRoot = task => String(task?.workingMemory?.memoryScope || 'project:.').replace(/^project:/, '') || '.';
  const stableJson = value => JSON.stringify(value || {}, Object.keys(value || {}).sort());
  const recordModelCall = taskId => database.incrementTaskUsage?.(taskId, { modelCalls: 1 });
  const executionContext = task => ({ allowedNamespaces: specialist(task.assignedAgent).toolNamespaces, capabilityManager, capabilityId: task.capabilityId, agent: task.assignedAgent, signal: controllers.get(task.id)?.signal });

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
    const assignedAgent = options.assignedAgent || specialistRegistry?.suggest?.(objective) || 'general';
    const goal = goalEngine?.create?.(objective, options) || { objective: objective.trim(), completionState: 'OPEN', acceptanceCriteria: [] };
    const budgets = { maxSteps: limits.maxSteps, maxRetries: limits.maxRetries, maxToolCalls: limits.maxToolCalls, maxModelCalls: limits.maxModelCalls, maxDurationMs: limits.maxDurationMs, maxCost: limits.maxCost };
    let task = database.createTask({ objective: objective.trim(), ...limits, parentTaskId: options.parentTaskId || null, assignedAgent, goal, budgets, usage: { modelCalls: 0, toolCalls: 0, tokens: 0, cost: 0 }, workingMemory: { objective: objective.trim(), memoryScope: options.memoryScope || `project:${options.scopes?.[0] || '.'}`, pending: [], evidence: [] } });
    controllers.set(task.id, new AbortController());
    if (capabilityManager) { const grant = capabilityManager.issue({ taskId: task.id, agent: assignedAgent, namespaces: specialist(assignedAgent).toolNamespaces, scopes: options.scopes || ['.'], ttlMs: limits.maxDurationMs }); task = database.updateTask(task.id, { capabilityId: grant.id }); }
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
      const context = await contexts.build({ objective: task.objective, task, events: database.getEvents(taskId), runs: database.getToolRuns(taskId), root: taskRoot(task) });
      recordModelCall(taskId);
      const plan = await planner.createPlan({ objective: task.objective, preferredSpecialist: task.assignedAgent, tools: toolsFor(task.objective, task.assignedAgent), memories: context.memories, documents: context.documents, context, signal: controllers.get(taskId)?.signal });
      task = database.updateTask(task.id, { plan, status: 'running' }); graph.sync(task.id, plan);
      const graphValidation = graph.validate(task.id); if (!graphValidation.valid) throw new Error(`Grafo de tarefas inválido: ${graphValidation.errors.join(' ')}`);
      database.addEvent(task.id, 'plan.created', `Plano criado com ${plan.length} etapas.`, { steps: plan.map(step => step.title), graph: graphValidation });
      checkpointStore.capture(task.id, 'plan', 'Plano persistido'); return run(task.id);
    } catch (error) { return fail(taskId, error instanceof Error ? error.message : 'Falha inesperada ao preparar a tarefa.'); }
  }

  async function finish(task) {
    const runs = database.getToolRuns(task.id); const validation = await evaluator.summarize(task, runs);
    const correctionRounds = database.getEvents(task.id).filter(event => event.type === 'critic.replan').length;
    if (validation.verdict !== 'PASS' && critic && correctionRounds < config.limits.maxSelfCorrections && task.stepsUsed < task.maxSteps) {
      recordModelCall(task.id);
      const review = await critic.review({ task, runs, validation, correctionRound: correctionRounds, signal: controllers.get(task.id)?.signal });
      database.addEvent(task.id, 'critic.reviewed', `Critic: ${validation.verdict} — ${review.gap}`, { validation, review, correctionRound: correctionRounds + 1 }, 'warn');
      if (review.decision === 'retry') {
        const completed = completedSteps(task.plan);
        const failedStep = { title: 'Verificação final', description: review.gap, action: null };
        recordModelCall(task.id);
        const recovery = await planner.replan({ task, failedStep, error: `${review.gap}\nNOVA ESTRATÉGIA OBRIGATÓRIA: ${review.strategy}`, completedSteps: completed, priorRuns: runs, signal: controllers.get(task.id)?.signal });
        if (recovery.length) {
          const plan = [...completed, ...recovery];
          database.updateTask(task.id, { plan, currentStep: completed.length, status: 'running', result: validation, completedAt: null }); graph.sync(task.id, plan);
          database.addEvent(task.id, 'critic.replan', `Autocorreção ${correctionRounds + 1}/${config.limits.maxSelfCorrections}: estratégia alterada.`, { review, recoverySteps: recovery.map(item => item.title) }, 'warn');
          checkpointStore.capture(task.id, 'critic-replan', review.gap);
          return run(task.id);
        }
      }
    }
    const evaluatedGoal = goalEngine?.evaluate?.(task.goal, { ...validation, runs, evidence: validation.evidence }) || task.goal;
    const completedAt = new Date().toISOString(); const passed = goalEngine ? evaluatedGoal?.completionState === 'VERIFIED' : validation.verdict ? validation.verdict === 'PASS' : Boolean(validation.validated); const status = passed ? 'completed' : validation.verdict === 'FAIL' || (goalEngine && evaluatedGoal?.completionState === 'FAILED') ? 'failed' : 'completed_with_warnings';
    const result = { ...validation, goal: evaluatedGoal, completionState: evaluatedGoal?.completionState || (passed ? 'VERIFIED' : 'UNCERTAIN'), usage: database.getTask(task.id)?.usage || task.usage };
    database.updateTask(task.id, { status, result, goal: evaluatedGoal, completedAt });
    capabilityManager?.revoke?.(task.capabilityId); controllers.delete(task.id);
    database.addEvent(task.id, 'run.completed', validation.summary || 'Tarefa concluída.', validation, validation.validated ? 'info' : 'warn');
    const finalEvent = status === 'failed' ? 'task.failed' : 'task.completed';
    database.addEvent(task.id, finalEvent, validation.summary || 'Tarefa concluída.', validation, validation.validated ? 'info' : status === 'failed' ? 'error' : 'warn');
    await eventBus?.publish(finalEvent, validation, { taskId: task.id, source: 'agent-loop', level: validation.validated ? 'info' : status === 'failed' ? 'error' : 'warn' });
    checkpointStore.capture(task.id, 'final', validation.validated ? 'Resultado verificado' : 'Resultado com alertas');
    await memory.remember(`Objetivo: ${task.objective}\nResultado: ${validation.summary}\nEvidências: ${validation.evidence.join('; ')}`, {
      kind: 'episodic', importance: validation.validated ? 0.78 : 0.55, confidence: validation.validated ? 0.9 : 0.55,
      source: 'TOOL', scope: task.workingMemory?.memoryScope || 'project:.', lastConfirmedAt: validation.validated ? completedAt : null, metadata: { taskId: task.id, validated: validation.validated, evidence: validation.evidence },
    });
    await logger.info('task.completed', { taskId: task.id, validated: validation.validated }); return snapshot(task.id);
  }

  async function fail(taskId, error) {
    const task = database.getTask(taskId); if (!task || TERMINAL.has(task.status)) return snapshot(taskId);
    executor.cancel?.(taskId); capabilityManager?.revoke?.(task.capabilityId); controllers.delete(taskId);
    database.updateTask(taskId, { status: 'failed', error, completedAt: new Date().toISOString() });
    database.addEvent(taskId, 'task.failed', error, null, 'error'); checkpointStore.capture(taskId, 'failure', 'Falha persistida');
    await eventBus?.publish('task.failed', { error }, { taskId, source: 'agent-loop', level: 'error' });
    await logger.error('task.failed', { taskId, error }); return snapshot(taskId);
  }

  async function run(taskId) {
    const trace = createTrace(taskId);
    if (!controllers.has(taskId)) controllers.set(taskId, new AbortController());
    while (true) {
      let task = database.getTask(taskId); if (!task) throw new Error('Tarefa não encontrada.');
      if (TERMINAL.has(task.status) || task.status === 'paused' || task.status === 'awaiting_approval') return snapshot(taskId);
      if (task.stepsUsed >= task.maxSteps) return fail(taskId, `Limite seguro de ${task.maxSteps} passos atingido.`);
      const budget = task.budgets || {}; const usage = task.usage || {};
      if ((usage.toolCalls || 0) >= (budget.maxToolCalls || Number.POSITIVE_INFINITY)) return fail(taskId, 'Orçamento de chamadas de ferramentas atingido.');
      if ((usage.modelCalls || 0) >= (budget.maxModelCalls || Number.POSITIVE_INFINITY)) return fail(taskId, 'Orçamento de chamadas de modelo atingido.');
      if (Date.now() - new Date(task.createdAt).getTime() > (budget.maxDurationMs || config.limits.maxTaskMinutes * 60_000)) return fail(taskId, 'Tempo máximo da tarefa atingido.');
      if (task.plan.length > 0 && task.plan.every(step => step.status === 'completed')) return finish(task);
      const readyNodes = graph.ready(taskId);
      if (!readyNodes.length) {
        const validation = graph.validate(taskId);
        if (validation.valid && task.plan.some(step => step.status === 'awaiting_approval')) {
          database.updateTask(taskId, { status: 'awaiting_approval' }); return snapshot(taskId);
        }
        return fail(taskId, validation.valid ? 'O grafo não possui etapas executáveis; alguma dependência não foi concluída.' : `Grafo de tarefas inválido: ${validation.errors.join(' ')}`);
      }
      if (readyNodes.length > 1) {
        let plan = [...task.plan];
        const selections = await Promise.allSettled(readyNodes.map(async node => {
          const index = plan.findIndex(item => item.id === node.id); const candidate = plan[index];
          if (candidate.action) return { index, action: candidate.action };
          const context = await contexts.build({ objective: `${task.objective}\n${candidate.description}`, task, events: database.getEvents(taskId), runs: database.getToolRuns(taskId), root: taskRoot(task) });
          recordModelCall(taskId);
          const action = await planner.selectAction({ task: { ...task, currentStep: index }, step: candidate, tools: toolsFor(`${task.objective}\n${candidate.description}`, candidate.assignedAgent || task.assignedAgent), events: database.getEvents(taskId), runs: database.getToolRuns(taskId), memories: context.memories, documents: context.documents, context, signal: controllers.get(taskId)?.signal });
          registry.get(action.tool); return { index, action };
        }));
        for (const selection of selections) {
          if (selection.status !== 'fulfilled') continue;
          const { index, action } = selection.value; const candidate = plan[index];
          plan[index] = { ...candidate, action, status: 'ready', model: action.model || null, successCriteria: [action.successCriteria] };
          database.addEvent(taskId, 'tool.selected', `${action.tool}: ${action.reason}`, { tool: action.tool, input: action.input, successCriteria: action.successCriteria, parallelCandidate: true });
        }
        task = database.updateTask(taskId, { plan }); graph.sync(taskId, plan);
        const batch = readyNodes.map(node => {
          const index = plan.findIndex(item => item.id === node.id); return { index, step: plan[index] };
        }).filter(item => item.index >= 0 && item.step?.action);
        const policies = batch.map(item => permissionManager.inspect(registry.get(item.step.action.tool), item.step.action.input));
        const denied = policies.find(policy => policy.decision === 'deny'); if (denied) return fail(taskId, denied.reason);
        const allSelected = batch.length === readyNodes.length; const safeParallel = allSelected && policies.every(policy => !policy.required);
        if (safeParallel) {
          if (task.stepsUsed + batch.length > task.maxSteps) return fail(taskId, `O lote paralelo ultrapassaria o limite seguro de ${task.maxSteps} passos.`);
          checkpointStore.capture(taskId, 'before-parallel-batch', `Antes de ${batch.length} etapas independentes`);
          for (const item of batch) database.addEvent(taskId, 'tool.started', `Executando ${item.step.action.tool} em lote paralelo.`, { input: item.step.action.input, stepId: item.step.id });
          database.incrementTaskUsage?.(taskId, { toolCalls: batch.length });
          const executions = await Promise.all(batch.map(item => executor.execute({ taskId, stepIndex: item.index, action: item.step.action, maxRetries: task.maxRetries, context: executionContext(task) })));
          const evaluations = executions.map((execution, index) => evaluator.evaluateTool(batch[index].step.action, execution)); task = database.getTask(taskId);
          if (task.status === 'cancelled') return snapshot(taskId);
          plan = [...task.plan];
          for (let index = 0; index < batch.length; index += 1) {
            const item = batch[index]; const execution = executions[index]; const evaluation = evaluations[index];
            if (!evaluation.success) continue;
            plan[item.index] = { ...plan[item.index], status: 'completed', output: execution.output, attempts: execution.attempt, observations: [...(plan[item.index].observations || []), evaluation.reason], completedAt: new Date().toISOString() };
            database.addEvent(taskId, 'step.completed', `${item.step.title} concluída em paralelo.`, { tool: item.step.action.tool, evaluation: evaluation.reason });
          }
          const failedIndex = evaluations.findIndex(evaluation => !evaluation.success);
          if (failedIndex >= 0) {
            const failed = batch[failedIndex]; const reason = evaluations[failedIndex].reason; const completed = completedSteps(plan);
            database.addEvent(taskId, 'step.failed', `${failed.step.title}: ${reason}`, { tool: failed.step.action.tool, parallelBatch: true }, 'warn');
            recordModelCall(taskId);
            const recovery = await planner.replan({ task: { ...task, plan }, failedStep: failed.step, error: reason, completedSteps: completed, priorRuns: database.getToolRuns(taskId), signal: controllers.get(taskId)?.signal });
            if (!recovery.length) return fail(taskId, `Não foi possível replanejar após a falha: ${reason}`);
            plan = [...completed, ...recovery]; database.updateTask(taskId, { plan, currentStep: completed.length, stepsUsed: task.stepsUsed + batch.length, status: 'running' }); graph.sync(taskId, plan);
            database.addEvent(taskId, 'task.replanned', 'O plano foi ajustado após falha em lote paralelo.', { recoverySteps: recovery.map(item => item.title) }); checkpointStore.capture(taskId, 'replan', reason); continue;
          }
          database.updateTask(taskId, { plan, stepsUsed: task.stepsUsed + batch.length, status: 'running' }); graph.sync(taskId, plan);
          database.addEvent(taskId, 'dag.parallel_batch_completed', `${batch.length} etapas independentes terminaram em paralelo.`, { stepIds: batch.map(item => item.step.id) });
          checkpointStore.capture(taskId, 'after-parallel-batch', `${batch.length} etapas independentes concluídas`); continue;
        }
      }
      const readyNode = readyNodes[0];
      const stepIndex = task.plan.findIndex(item => item.id === readyNode.id); let step = task.plan[stepIndex];
      if (!step || stepIndex < 0) return fail(taskId, 'O grafo divergiu do plano persistido.');
      if (task.currentStep !== stepIndex) task = database.updateTask(taskId, { currentStep: stepIndex });
      const completedRun = step.action ? database.getToolRuns(taskId).filter(item => item.stepIndex === stepIndex && item.status === 'completed' && item.tool === step.action.tool && stableJson(item.input) === stableJson(step.action.input)).at(-1) : null;
      if (completedRun && step.status !== 'completed') {
        const plan = [...task.plan]; plan[stepIndex] = { ...step, status: 'completed', output: completedRun.output, observations: [...(step.observations || []), 'Recuperado de uma execução persistida.'] };
        database.updateTask(taskId, { plan, currentStep: stepIndex + 1, stepsUsed: task.stepsUsed + 1, status: 'running' }); graph.sync(taskId, plan);
        database.addEvent(taskId, 'step.recovered', `${step.title} recuperada do checkpoint.`, { toolRunId: completedRun.id }); checkpointStore.capture(taskId, 'recovery', `Etapa ${stepIndex + 1} recuperada`); continue;
      }
      const span = trace.span('agent.step', { stepIndex, title: step.title });

      if (!step.action) {
        database.addEvent(taskId, 'step.selecting_tool', `Selecionando ferramenta para: ${step.title}`);
        try {
          const context = await contexts.build({ objective: `${task.objective}\n${step.description}`, task, events: database.getEvents(taskId), runs: database.getToolRuns(taskId), root: taskRoot(task) });
          recordModelCall(taskId);
          const action = await planner.selectAction({ task, step, tools: toolsFor(`${task.objective}\n${step.description}`, step.assignedAgent || task.assignedAgent), events: database.getEvents(taskId), runs: database.getToolRuns(taskId), memories: context.memories, documents: context.documents, context, signal: controllers.get(taskId)?.signal });
          registry.get(action.tool); task = database.getTask(taskId);
          if (TERMINAL.has(task.status) || task.status === 'paused') return snapshot(taskId);
          const plan = [...task.plan]; plan[stepIndex] = { ...step, action, status: 'ready', model: action.model || null, successCriteria: [action.successCriteria] };
          task = database.updateTask(taskId, { plan, status: 'running' }); graph.sync(taskId, plan); step = task.plan[stepIndex];
          database.addEvent(taskId, 'tool.selected', `${action.tool}: ${action.reason}`, { tool: action.tool, input: action.input, successCriteria: action.successCriteria });
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'Falha ao selecionar ferramenta.'; database.addEvent(taskId, 'planner.failed', reason, null, 'warn');
          recordModelCall(taskId);
          const completed = completedSteps(task.plan); const recovery = await planner.replan({ task, failedStep: step, error: reason, completedSteps: completed, priorRuns: database.getToolRuns(taskId), signal: controllers.get(taskId)?.signal });
          if (!recovery.length) return fail(taskId, `Não foi possível replanejar: ${reason}`);
          const plan = [...completed, ...recovery]; const nextIndex = completed.length;
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
      database.incrementTaskUsage?.(taskId, { toolCalls: 1 });
      const execution = await executor.execute({ taskId, stepIndex, action: step.action, maxRetries: task.maxRetries, context: executionContext(task) });
      const evaluation = evaluator.evaluateTool(step.action, execution); task = database.getTask(taskId);
      const priorEvidence = Array.isArray(task.workingMemory?.evidence) ? task.workingMemory.evidence : [];
      database.mergeWorkingMemory?.(taskId, { currentOperation: tool.name, evidence: [...priorEvidence, { tool: tool.name, ok: execution.ok, step: step.title, at: new Date().toISOString() }].slice(-24), lastObservation: evaluation.reason });
      task = database.getTask(taskId);
      if (task.status === 'cancelled') { database.addEvent(taskId, 'tool.observed_after_cancel', `${tool.name} terminou após o cancelamento.`, { ok: execution.ok }, 'warn'); return snapshot(taskId); }
      if (!evaluation.success && step.diagnostic) {
        const plan = [...task.plan]; plan[stepIndex] = { ...plan[stepIndex], status: 'completed', output: execution.output || { error: execution.error }, attempts: execution.attempt, observations: [...(plan[stepIndex].observations || []), `Falha diagnóstica esperada: ${evaluation.reason}`], completedAt: new Date().toISOString() };
        database.updateTask(taskId, { plan, currentStep: stepIndex + 1, stepsUsed: task.stepsUsed + 1, status: 'running' }); graph.sync(taskId, plan);
        database.addEvent(taskId, 'step.diagnostic_observed', `${step.title}: falha preservada como evidência para investigação.`, { tool: tool.name, evaluation: evaluation.reason }, 'warn'); checkpointStore.capture(taskId, 'after-diagnostic', `Etapa ${stepIndex + 1} registrou a falha`); continue;
      }
      if (evaluation.success) {
        const plan = [...task.plan]; plan[stepIndex] = { ...plan[stepIndex], status: 'completed', output: execution.output, attempts: execution.attempt, observations: [...(plan[stepIndex].observations || []), evaluation.reason], completedAt: new Date().toISOString() };
        database.updateTask(taskId, { plan, currentStep: stepIndex + 1, stepsUsed: task.stepsUsed + 1, status: task.status === 'paused' ? 'paused' : 'running' }); graph.sync(taskId, plan);
        database.addEvent(taskId, 'step.completed', `${step.title} concluída.`, { tool: tool.name, evaluation: evaluation.reason, trace: span.finish({ ok: true }) }); checkpointStore.capture(taskId, 'after-step', `Etapa ${stepIndex + 1} concluída`); continue;
      }

      database.addEvent(taskId, 'step.failed', `${step.title}: ${evaluation.reason}`, { tool: tool.name, trace: span.finish({ ok: false }) }, 'warn');
      recordModelCall(taskId);
      const completed = completedSteps(task.plan); const recovery = await planner.replan({ task, failedStep: step, error: evaluation.reason, completedSteps: completed, priorRuns: database.getToolRuns(taskId), signal: controllers.get(taskId)?.signal });
      if (!recovery.length) return fail(taskId, `Não foi possível replanejar após a falha: ${evaluation.reason}`);
      const plan = [...completed, ...recovery];
      database.updateTask(taskId, { plan, currentStep: completed.length, stepsUsed: task.stepsUsed + 1, status: 'running' }); graph.sync(taskId, plan);
      database.addEvent(taskId, 'task.replanned', 'O plano foi ajustado após a falha.', { recoverySteps: recovery.map(item => item.title) }); checkpointStore.capture(taskId, 'replan', evaluation.reason);
    }
  }

  function resolvePermission(taskId, permissionId, decision) {
    const permission = database.getPermission(permissionId); if (!permission || permission.taskId !== taskId) throw new Error('Permissão não encontrada.');
    const resolved = permissionManager.resolve(permissionId, decision);
    if (resolved.status === 'approved') {
      const task = database.getTask(taskId); const plan = task.plan.map(step => step.permissionId === permissionId ? { ...step, status: 'ready' } : step);
      database.updateTask(taskId, { plan }); graph.sync(taskId, plan);
    }
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
        controllers.get(taskId)?.abort(new Error('Tarefa cancelada pelo usuário.')); executor.cancel?.(taskId); capabilityManager?.revoke?.(task.capabilityId);
        database.updateTask(taskId, { status: 'cancelled', completedAt: new Date().toISOString() }); database.addEvent(taskId, 'task.cancelled', 'Tarefa cancelada pelo usuário.', null, 'warn'); checkpointStore.capture(taskId, 'cancel', 'Cancelamento solicitado');
      } else if (action === 'resume' && task.status === 'paused') {
        controllers.set(taskId, new AbortController());
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
