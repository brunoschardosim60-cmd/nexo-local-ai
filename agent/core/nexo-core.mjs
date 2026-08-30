import { createAgentConfig } from '../config.mjs';
import { createContextEngine } from '../context/context-engine.mjs';
import { createRag } from '../context/rag.mjs';
import { createRepositoryIntelligence } from '../context/repository-map.mjs';
import { createDatabase } from '../memory/database.mjs';
import { createLongTermMemory } from '../memory/long-term.mjs';
import { createModelRouter } from '../models/router.mjs';
import { createOllamaClient } from '../models/ollama.mjs';
import { createLogger } from '../observability/logger.mjs';
import { createAgentLoop } from '../orchestrator/agent-loop.mjs';
import { createEvaluator } from '../orchestrator/evaluator.mjs';
import { createExecutor } from '../orchestrator/executor.mjs';
import { createPlanner } from '../orchestrator/planner.mjs';
import { createPermissionManager } from '../safety/permissions.mjs';
import { createSandbox } from '../safety/sandbox.mjs';
import { createFilesystemTools } from '../tools/filesystem.mjs';
import { createGitTools } from '../tools/git.mjs';
import { createProjectTools } from '../tools/project.mjs';
import { createToolRegistry } from '../tools/registry.mjs';
import { createTerminalTools } from '../tools/terminal.mjs';
import { createCheckpointManager } from './checkpoints.mjs';
import { createTaskGraph } from './task-graph.mjs';

export function createNexoCore(overrides = {}) {
  const config = createAgentConfig(overrides); const database = createDatabase(config.dataDir); const logger = createLogger(config.dataDir);
  const filesystem = createFilesystemTools(config.workspace);
  const sandbox = createSandbox({ workspace: config.workspace, timeoutMs: config.limits.commandTimeoutMs, maxOutput: config.limits.maxToolOutput });
  const repository = createRepositoryIntelligence({ workspace: config.workspace, database });
  const registry = createToolRegistry([...filesystem.definitions, ...createProjectTools(filesystem), ...createGitTools(sandbox), ...createTerminalTools(sandbox), ...repository.tools]);
  const permissionManager = createPermissionManager(database); const memory = createLongTermMemory(database);
  const rag = createRag({ database, workspace: config.workspace, filesystem }); const router = createModelRouter(config); const ollama = createOllamaClient(config);
  const contextEngine = createContextEngine({ memory, rag, repository, maxTokens: config.limits.contextTokens || 6000 });
  const planner = createPlanner({ ollama, router }); const executor = createExecutor({ registry, database, logger, maxOutput: config.limits.maxToolOutput });
  const evaluator = createEvaluator({ ollama, router }); const taskGraph = createTaskGraph(database); const checkpoints = createCheckpointManager(database, taskGraph);
  const loop = createAgentLoop({ config, database, registry, permissionManager, planner, executor, evaluator, memory, rag, logger, taskGraph, checkpoints, contextEngine });
  const resumedTasks = overrides.autoResume === false ? 0 : loop.resumeInterrupted();

  return {
    version: '1.0.0', config, database, registry, memory, rag, router, loop, repository, contextEngine, taskGraph, checkpoints,
    health() {
      const tasks = database.listTasks(100);
      return {
        runtime: 'Nexo Core', version: '1.0.0', persistent: true, database: 'SQLite local', tools: registry.describe(), models: router.capabilities(),
        taskGraph: true, checkpoints: true, contextEngine: true, repositoryIntelligence: true, resumedTasks,
        tasks: { total: tasks.length, running: tasks.filter(task => ['planning', 'running', 'awaiting_approval', 'paused'].includes(task.status)).length }, limits: config.limits,
      };
    },
    close() { database.db.close(); },
  };
}
