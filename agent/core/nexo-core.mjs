import { createAgentConfig } from '../config.mjs';
import { createContextEngine } from '../context/context-engine.mjs';
import { createRag } from '../context/rag.mjs';
import { createRepositoryIntelligence } from '../context/repository-map.mjs';
import { createDatabase } from '../memory/database.mjs';
import { createLongTermMemory } from '../memory/long-term.mjs';
import { createModelRouter } from '../models/router.mjs';
import { createOllamaClient } from '../models/ollama.mjs';
import { createPersonalityEngine } from '../personality/engine.mjs';
import { createNexoRuntime } from '../runtime/nexo-runtime.mjs';
import { createLogger } from '../observability/logger.mjs';
import { createEventBus } from '../events/event-bus.mjs';
import { createMcpManager } from '../mcp/client.mjs';
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
import { createResearchAgent } from '../research/research-agent.mjs';
import { createSkillEngine } from '../skills/skill-engine.mjs';
import { createMultiAgentCoordinator } from '../specialists/coordinator.mjs';
import { createSpecialistRegistry } from '../specialists/registry.mjs';
import { createCheckpointManager } from './checkpoints.mjs';
import { createTaskGraph } from './task-graph.mjs';

export function createNexoCore(overrides = {}) {
  const config = createAgentConfig(overrides); const database = createDatabase(config.dataDir); const logger = createLogger(config.dataDir);
  const eventBus = createEventBus({ database, logger });
  const filesystem = createFilesystemTools(config.workspace);
  const sandbox = createSandbox({ workspace: config.workspace, timeoutMs: config.limits.commandTimeoutMs, maxOutput: config.limits.maxToolOutput });
  const repository = createRepositoryIntelligence({ workspace: config.workspace, database });
  const research = createResearchAgent(overrides.research || {});
  const skills = createSkillEngine({ roots: [join(config.projectRoot, 'skills'), join(config.dataDir, 'skills')], database });
  const specialists = createSpecialistRegistry();
  const coordinator = createMultiAgentCoordinator({ database, eventBus, maxParallel: 4 });
  const browser = createBrowserAgent({ workspace: config.workspace, database, research, browserPath: overrides.browserPath });
  const coding = createCodingAgent({ repository, sandbox });
  const mcp = createMcpManager({ workspace: config.workspace, configPath: overrides.mcpConfigPath || join(config.dataDir, 'mcp-servers.json') });
  const scheduler = createBackgroundScheduler({ database, eventBus, tickMs: overrides.schedulerTickMs, autoStart: overrides.autoStartScheduler !== false });
  const registry = createToolRegistry([
    ...filesystem.definitions, ...createProjectTools(filesystem), ...createGitTools(sandbox), ...createTerminalTools(sandbox), ...repository.tools,
    ...research.definitions, ...browser.definitions, ...coding.definitions, ...skills.definitions, ...mcp.definitions, ...scheduler.definitions, ...coordinator.definitions,
  ]);
  const permissionManager = createPermissionManager(database); const memory = createLongTermMemory(database); const personality = createPersonalityEngine(database);
  const rag = createRag({ database, workspace: config.workspace, filesystem }); const router = createModelRouter(config); const ollama = createOllamaClient(config);
  const contextEngine = createContextEngine({ memory, rag, repository, skills, maxTokens: config.limits.contextTokens || 6000 });
  const planner = createPlanner({ ollama, router, specialists }); const executor = createExecutor({ registry, database, logger, maxOutput: config.limits.maxToolOutput });
  const evaluator = createEvaluator(); const taskGraph = createTaskGraph(database); const checkpoints = createCheckpointManager(database, taskGraph);
  const loop = createAgentLoop({ config, database, registry, permissionManager, planner, executor, evaluator, memory, rag, logger, taskGraph, checkpoints, contextEngine, eventBus });
  const runtime = createNexoRuntime({ config, memory, rag, ollama, research, loop, personality, eventBus });
  scheduler.setExecutor(objective => loop.enqueueTask(objective));
  coordinator.setLoop(loop);
  const resumedTasks = overrides.autoResume === false ? 0 : loop.resumeInterrupted();

  return {
    version: '3.0.0', config, database, registry, memory, rag, router, loop, runtime, personality, repository, contextEngine, taskGraph, checkpoints,
    research, browser, coding, skills, specialists, coordinator, mcp, scheduler, eventBus,
    health() {
      const tasks = database.listTasks(100);
      return {
        runtime: 'Nexo Core', version: '3.0.0', persistent: true, database: 'SQLite local', tools: registry.describe(), models: router.capabilities(),
        taskGraph: true, checkpoints: true, contextEngine: true, repositoryIntelligence: true, resumedTasks,
        capabilities: { runtime: runtime.health(), personality: personality.health(), safety: { processIsolation: 'allowlisted-spawn', osIsolation: false, shell: false }, research: research.health(), browser: browser.health(), coding: coding.health(), skills: skills.health(), specialists: specialists.list(), multiAgent: coordinator.health(), mcp: mcp.health(), background: scheduler.health(), events: eventBus.health(), visualVerification: true },
        tasks: { total: tasks.length, running: tasks.filter(task => ['planning', 'running', 'awaiting_approval', 'paused'].includes(task.status)).length }, limits: config.limits,
      };
    },
    close() { scheduler.close(); void mcp.close(); database.db.close(); },
  };
}
import { join } from 'node:path';
import { createBackgroundScheduler } from '../background/scheduler.mjs';
import { createBrowserAgent } from '../browser/browser-agent.mjs';
import { createCodingAgent } from '../coding/coding-agent.mjs';
