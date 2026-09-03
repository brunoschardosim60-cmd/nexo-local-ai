import { join } from 'node:path';
import { createArtifactStore } from '../artifacts/store.mjs';
import { createAudioProvider } from '../audio/http-provider.mjs';
import { createAudioRuntime } from '../audio/runtime.mjs';
import { createBackgroundScheduler } from '../background/scheduler.mjs';
import { createBrowserAgent, findBrowser } from '../browser/browser-agent.mjs';
import { createPlaywrightBrowserProvider } from '../browser/playwright-provider.mjs';
import { createCodingAgent } from '../coding/coding-agent.mjs';
import { createAgentConfig } from '../config.mjs';
import { createContextEngine } from '../context/context-engine.mjs';
import { createConversationStateEngine } from '../conversation/conversation-state.mjs';
import { createOperationalCapabilitySnapshot } from '../conversation/operational-capabilities.mjs';
import { createRag } from '../context/rag.mjs';
import { createRepositoryIntelligence } from '../context/repository-map.mjs';
import { createEventBus } from '../events/event-bus.mjs';
import { createCapabilityRegistry } from '../extensions/capability-registry.mjs';
import { createConnectorManager } from '../extensions/connectors.mjs';
import { createCredentialVault } from '../extensions/vault.mjs';
import { createExtensionManager } from '../extensions/manager.mjs';
import { createDebuggingEngine } from '../debugging/engine.mjs';
import { createGoalEngine } from '../goals/engine.mjs';
import { createA1111ImageProvider } from '../image/a1111-provider.mjs';
import { createImageRuntime } from '../image/runtime.mjs';
import { createComplexityEstimator } from '../intelligence/complexity.mjs';
import { createResponseIntelligence } from '../intelligence/response.mjs';
import { createMcpManager } from '../mcp/client.mjs';
import { createDatabase } from '../memory/database.mjs';
import { createMemoryGate } from '../memory/gate.mjs';
import { createLongTermMemory } from '../memory/long-term.mjs';
import {
  createKnowledgeEngine,
  createMemoryTools,
} from '../memory/knowledge-engine.mjs';
import { createContinuityEngine } from '../memory/continuity.mjs';
import { createSemanticEmbeddings } from '../memory/semantic-embeddings.mjs';
import { createMediaQueue } from '../media/queue.mjs';
import { createModalityRouter } from '../multimodal/router.mjs';
import { createMediaProviderRegistry } from '../multimodal/provider-registry.mjs';
import { createPerceptionEngine } from '../multimodal/perception.mjs';
import { createPresenceEngine } from '../multimodal/presence.mjs';
import { createVoiceActivityDetector } from '../audio/vad.mjs';
import { createOllamaClient } from '../models/ollama.mjs';
import { createModelProfiles } from '../models/profiles.mjs';
import { createModelRouter } from '../models/router.mjs';
import { createLogger } from '../observability/logger.mjs';
import { createAgentLoop } from '../orchestrator/agent-loop.mjs';
import { createCritic } from '../orchestrator/critic.mjs';
import { createEvaluator } from '../orchestrator/evaluator.mjs';
import { createExecutor } from '../orchestrator/executor.mjs';
import { createPlanner } from '../orchestrator/planner.mjs';
import { createPersonalityEngine } from '../personality/engine.mjs';
import { createPersonalStore } from '../personal/store.mjs';
import { createPersonalWorkEngine } from '../personal/work-engine.mjs';
import { createStudyEngine } from '../personal/study-engine.mjs';
import { createProactivityEngine } from '../personal/proactivity.mjs';
import { createPersonalSearch } from '../personal/search.mjs';
import { createPersonalTools } from '../personal/tools.mjs';
import { createResearchAgent } from '../research/research-agent.mjs';
import { createResourceManager } from '../resources/manager.mjs';
import { createNexoRuntime } from '../runtime/nexo-runtime.mjs';
import { createPermissionManager } from '../safety/permissions.mjs';
import { createCapabilityManager } from '../safety/capabilities.mjs';
import { createSandbox } from '../safety/sandbox.mjs';
import { createSkillEngine } from '../skills/skill-engine.mjs';
import { createMultiAgentCoordinator } from '../specialists/coordinator.mjs';
import { createSpecialistRegistry } from '../specialists/registry.mjs';
import { createSiteVisualVerifier } from '../sites/visual-verifier.mjs';
import { createFilesystemTools } from '../tools/filesystem.mjs';
import { createGitTools } from '../tools/git.mjs';
import { createProjectTools } from '../tools/project.mjs';
import { createToolRegistry } from '../tools/registry.mjs';
import { createTerminalTools } from '../tools/terminal.mjs';
import { createOllamaVisionProvider } from '../vision/ollama-provider.mjs';
import { createVisionRuntime } from '../vision/runtime.mjs';
import { createVideoProvider } from '../video/http-provider.mjs';
import { createVideoRuntime } from '../video/runtime.mjs';
import { createWorkflowEngine } from '../workflows/engine.mjs';
import { createProjectWorkspaceManager } from '../workspace/project-workspace.mjs';
import { createCheckpointManager } from './checkpoints.mjs';
import { createTaskGraph } from './task-graph.mjs';

export function createNexoCore(overrides = {}) {
  const config = createAgentConfig(overrides);
  const database = createDatabase(config.dataDir);
  const logger = createLogger(config.dataDir);
  const eventBus = createEventBus({ database, logger });
  const personalStore = createPersonalStore(database);
  const filesystem = createFilesystemTools(config.workspace);
  const sandbox = createSandbox({
    workspace: config.workspace,
    timeoutMs: config.limits.commandTimeoutMs,
    maxOutput: config.limits.maxToolOutput,
  });
  const repository = createRepositoryIntelligence({
    workspace: config.workspace,
    database,
  });
  const research = createResearchAgent(overrides.research || {});
  const skills = createSkillEngine({
    roots: [join(config.projectRoot, 'skills'), join(config.dataDir, 'skills')],
    database,
  });
  const specialists = createSpecialistRegistry();
  const coordinator = createMultiAgentCoordinator({
    database,
    eventBus,
    maxParallel: 4,
  });
  const resolvedBrowserPath =
    overrides.browserPath === undefined ? findBrowser() : overrides.browserPath;
  const browser = createBrowserAgent({
    workspace: config.workspace,
    database,
    research,
    browserPath: resolvedBrowserPath,
  });
  const browserAutomation = createPlaywrightBrowserProvider({
    workspace: config.workspace,
    database,
    research,
    browserPath: resolvedBrowserPath,
  });
  const coding = createCodingAgent({ repository, sandbox });
  const debugging = createDebuggingEngine({ database });
  const goals = createGoalEngine();
  const capabilities = createCapabilityManager(database);
  const projectWorkspaces = createProjectWorkspaceManager({
    workspace: config.workspace,
    database,
    repository,
    sandbox,
  });
  const mcp = createMcpManager({
    workspace: config.workspace,
    configPath:
      overrides.mcpConfigPath || join(config.dataDir, 'mcp-servers.json'),
  });
  const scheduler = createBackgroundScheduler({
    database,
    eventBus,
    tickMs: overrides.schedulerTickMs,
    autoStart: overrides.autoStartScheduler !== false,
  });
  const estimator = createComplexityEstimator();
  const embeddings = createSemanticEmbeddings({
    ollamaUrl: config.ollamaUrl,
    model: config.embeddingModel,
    fetchImpl: overrides.fetchImpl,
  });
  const memoryGate = createMemoryGate(database);
  const permissionManager = createPermissionManager(database);
  const memory = createLongTermMemory(database, embeddings, memoryGate);
  const personality = createPersonalityEngine(database);
  const conversation = createConversationStateEngine(database, {
    capabilityResolver: () => createOperationalCapabilitySnapshot({
      toolNames: registry.describe().map((tool) => tool.name),
      config,
      health: {
        image: image.health(),
        audio: audio.health(),
        video: video.health(),
        vision: vision.health(),
        browser: browserAutomation.health(),
      },
    }),
  });
  const rag = createRag({
    database,
    workspace: config.workspace,
    filesystem,
    embeddings,
  });
  const knowledge = createKnowledgeEngine(database, memory);
  const continuity = createContinuityEngine(database, memory);
  const personalWork = createPersonalWorkEngine({
    store: personalStore,
    database,
    continuity,
    eventBus,
    projectWorkspaces,
  });
  const study = createStudyEngine({ store: personalStore, memory, eventBus });
  const personalSearch = createPersonalSearch({
    store: personalStore,
    memory,
    rag,
    database,
    projectWorkspaces,
  });
  const proactivity = createProactivityEngine({
    store: personalStore,
    eventBus,
  });
  const registry = createToolRegistry([
    ...filesystem.definitions,
    ...createProjectTools(filesystem),
    ...createGitTools(sandbox),
    ...createTerminalTools(sandbox),
    ...repository.tools,
    ...projectWorkspaces.definitions,
    ...research.definitions,
    ...browser.definitions,
    ...browserAutomation.definitions,
    ...coding.definitions,
    ...debugging.definitions,
    ...skills.definitions,
    ...mcp.definitions,
    ...scheduler.definitions,
    ...coordinator.definitions,
    ...createMemoryTools(memory, knowledge),
    ...createPersonalTools({
      store: personalStore,
      work: personalWork,
      study,
      search: personalSearch,
      proactivity,
    }),
  ]);
  const capabilityRegistry = createCapabilityRegistry({
    database,
    permissionManager,
    eventBus,
  });
  const vault = createCredentialVault({ database });
  const connectors = createConnectorManager({
    registry: capabilityRegistry,
    vault,
  });
  const extensions = createExtensionManager({
    workspace: config.workspace,
    database,
    registry: capabilityRegistry,
  });
  for (const tool of registry.describe())
    capabilityRegistry.register({
      id: `tool:${tool.name}`,
      type: 'TOOL',
      name: tool.name,
      version: `${tool.version || 1}.0.0`,
      description: tool.description,
      inputs: tool.schema,
      outputs: { type: 'object' },
      permissions: [tool.risk],
      risk: tool.risk,
      trust: 'BUILT_IN',
      quality: 0.8,
      latency: 0.2,
      execute: (input, context) => registry.execute(tool.name, input, context),
    });
  void skills.ready().then(() => {
    for (const skill of skills.list())
      try {
        capabilityRegistry.register({
          id: `skill:${skill.id}`,
          type: 'SKILL',
          name: skill.name,
          version: skill.version || '1.0.0',
          description: skill.description,
          inputs: { type: 'object' },
          outputs: { type: 'object' },
          permissions: skill.permissions || [],
          risk: skill.risk || 'read',
          trust: skill.trust || 'LOCAL',
          enabled: skill.enabled,
          tags: skill.triggers || [],
        });
      } catch {}
  });
  const profiles = createModelProfiles({
    config,
    database,
    fetchImpl: overrides.fetchImpl,
  });
  const resources = createResourceManager({ profiles });
  const ollama = createOllamaClient(config);
  const router = createModelRouter(
    config,
    database,
    estimator,
    profiles,
    resources,
    ollama,
  );
  const responseIntelligence = createResponseIntelligence({ personality });
  const artifacts = createArtifactStore({ dataDir: config.dataDir, database });
  proactivity.setResourceManager(resources);
  scheduler.setResourceManager(resources);
  scheduler.setTriggerFactory((input) => proactivity.createTrigger(input));
  const visionProvider = createOllamaVisionProvider({
    config,
    filesystem,
    fetchImpl: overrides.fetchImpl,
  });
  const imageProvider = createA1111ImageProvider({
    baseUrl: config.imageProviderUrl,
    fetchImpl: overrides.fetchImpl,
  });
  const audioProvider = createAudioProvider({
    sttUrl: config.speechToTextUrl,
    ttsUrl: config.textToSpeechUrl,
    fetchImpl: overrides.fetchImpl,
  });
  const videoProvider = createVideoProvider({
    baseUrl: config.videoProviderUrl,
    fetchImpl: overrides.fetchImpl,
  });
  const providerRegistry = createMediaProviderRegistry();
  providerRegistry.register({
    id: 'ollama-vision',
    label: 'Ollama Vision',
    local: true,
    maturity: 'BETA',
    capabilities: ['vision', 'screen', 'camera', 'document-vision', 'ocr'],
  });
  providerRegistry.register({
    id: 'automatic1111-forge',
    label: 'Stable Diffusion WebUI/Forge',
    local: true,
    maturity: 'BETA',
    capabilities: imageProvider.capabilities,
  });
  providerRegistry.register({
    id: 'local-http-audio',
    label: 'STT/TTS local HTTP',
    local: true,
    maturity:
      config.speechToTextUrl || config.textToSpeechUrl ? 'BETA' : 'UNAVAILABLE',
    capabilities: ['speech', 'stt', 'tts', 'voice'],
  });
  providerRegistry.register({
    id: 'local-http-video',
    label: 'Vídeo local HTTP',
    local: true,
    maturity: config.featureFlags.videoGeneration
      ? 'EXPERIMENTAL'
      : 'UNAVAILABLE',
    capabilities: videoProvider.capabilities,
  });
  for (const provider of providerRegistry.list())
    capabilityRegistry.register({
      id: `provider:${provider.id}`,
      type: 'PROVIDER',
      name: provider.label,
      version: '1.0.0',
      description: `Provider ${provider.capabilities.join(', ')}`,
      inputs: { type: 'object' },
      outputs: { type: 'object' },
      permissions: provider.local ? [] : ['network'],
      risk: provider.local ? 'read' : 'network',
      status: provider.maturity === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'AVAILABLE',
      trust: 'BUILT_IN',
      tags: provider.capabilities,
    });
  const modalityRouter = createModalityRouter({ providerRegistry });
  const vision = createVisionRuntime({
    provider: visionProvider,
    enabled: config.featureFlags.vision,
  });
  const siteVisualVerifier = createSiteVisualVerifier({ browser: browserAutomation, vision, filesystem });
  for (const definition of siteVisualVerifier.definitions) registry.register(definition);
  const image = createImageRuntime({
    provider: imageProvider,
    artifacts,
    vision,
    enabled: config.featureFlags.imageGeneration,
    autoRegeneration: config.featureFlags.autoRegeneration,
    beforeGenerate: async () => {
      try {
        await (overrides.fetchImpl || globalThis.fetch)(`${config.ollamaUrl}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: config.visionModel, keep_alive: 0 }) });
      } catch {}
    },
  });
  const audio = createAudioRuntime({
    provider: audioProvider,
    artifacts,
    enabled: Boolean(config.speechToTextUrl || config.textToSpeechUrl),
  });
  const video = createVideoRuntime({
    provider: videoProvider,
    artifacts,
    vision,
    audio,
    enabled: config.featureFlags.videoGeneration,
  });
  const vad = createVoiceActivityDetector();
  const perception = createPerceptionEngine({
    database,
    vision,
    audio,
    router: modalityRouter,
    memoryGate,
  });
  const presence = createPresenceEngine({ perception, eventBus });
  const mediaQueue = createMediaQueue({
    database,
    resourceManager: resources,
    handlers: {
      image: {
        resources: { requiredRamMB: 512, requiredVramMB: 3000 },
        run: (input, options) => image.generate(input, options),
      },
      video: {
        resources: { requiredRamMB: 6000, requiredVramMB: 6000 },
        run: (input, options) => video.generate(input, options),
      },
      tts: {
        resources: { requiredRamMB: 500 },
        run: (input, options) => audio.synthesize(input, options),
      },
    },
  });
  void profiles.refresh().catch(() => undefined);
  const contextEngine = createContextEngine({
    memory,
    rag,
    repository,
    knowledge,
    skills,
    router,
    maxTokens: config.limits.contextTokens || 6000,
  });
  const planner = createPlanner({ ollama, router, specialists });
  const executor = createExecutor({
    registry,
    database,
    logger,
    maxOutput: config.limits.maxToolOutput,
  });
  const evaluator = createEvaluator();
  const critic = createCritic({ ollama, router });
  const taskGraph = createTaskGraph(database);
  const checkpoints = createCheckpointManager(database, taskGraph);
  const personal = {
    store: personalStore,
    work: personalWork,
    study,
    search: personalSearch,
    proactivity,
  };
  const workflows = createWorkflowEngine({
    database,
    capabilities: capabilityRegistry,
    eventBus,
  });
  for (const template of workflows.templates()) {
    const id = `workflow:${template.id}`;
    if (!database.getWorkflow(id))
      workflows.create({ ...template, id, version: '1.0.0' });
  }
  for (const workflow of workflows.list())
    capabilityRegistry.register({
      id: workflow.id,
      type: 'WORKFLOW',
      name: workflow.name,
      version: workflow.version,
      description: `Workflow persistente com ${workflow.definition.steps.length} etapas`,
      inputs: { type: 'object' },
      outputs: { type: 'object' },
      permissions: [],
      risk: 'write',
      trust: 'BUILT_IN',
      execute: (input, context) => workflows.run(workflow.id, input, context),
    });
  const loop = createAgentLoop({
    config,
    database,
    registry,
    permissionManager,
    planner,
    executor,
    evaluator,
    critic,
    memory,
    rag,
    logger,
    taskGraph,
    checkpoints,
    contextEngine,
    eventBus,
    goalEngine: goals,
    specialistRegistry: specialists,
    capabilityManager: capabilities,
  });
  const runtime = createNexoRuntime({
    config,
    memory,
    rag,
    ollama,
    research,
    loop,
    personality,
    conversation,
    router,
    estimator,
    responseIntelligence,
    eventBus,
    personal,
    database,
  });
  scheduler.setExecutor((objective) => loop.enqueueTask(objective));
  proactivity.setAutomationExecutor((action, context) => {
    if (!action?.objective)
      throw new Error('Automação sem objetivo executável.');
    return loop.enqueueTask(String(action.objective), {
      scopes: context.capabilities,
      maxSteps: 12,
      maxRetries: 2,
      maxToolCalls: 20,
      maxModelCalls: 16,
    });
  });
  coordinator.setLoop(loop);
  const resumedTasks =
    overrides.autoResume === false ? 0 : loop.resumeInterrupted();
  return {
    version: '9.0.0',
    config,
    database,
    registry,
    capabilityRegistry,
    vault,
    connectors,
    extensions,
    workflows,
    goals,
    capabilities,
    debugging,
    projectWorkspaces,
    estimator,
    responseIntelligence,
    embeddings,
    memoryGate,
    memory,
    knowledge,
    continuity,
    conversation,
    personal,
    rag,
    router,
    profiles,
    resources,
    artifacts,
    vision,
    image,
    audio,
    video,
    mediaQueue,
    providerRegistry,
    modalityRouter,
    perception,
    presence,
    vad,
    loop,
    runtime,
    personality,
    repository,
    contextEngine,
    taskGraph,
    checkpoints,
    research,
    browser,
    browserAutomation,
    siteVisualVerifier,
    coding,
    skills,
    specialists,
    coordinator,
    mcp,
    scheduler,
    eventBus,
    critic,
    health() {
      const tasks = database.listTasks(100);
      return {
        runtime: 'Nexo Core',
        version: '9.0.0',
        persistent: true,
        database: 'SQLite local',
        tools: registry.describe(),
        models: router.capabilities(),
        taskGraph: true,
        checkpoints: true,
        contextEngine: true,
        repositoryIntelligence: true,
        critic: critic.health(),
        resumedTasks,
        capabilities: {
          registry: capabilityRegistry.health(),
          vault: vault.health(),
          connectors: connectors.health(),
          extensions: extensions.health(),
          workflows: workflows.health(),
          multimodal: modalityRouter.health(),
          providers: providerRegistry.health(),
          perception: perception.health(),
          presence: presence.health(),
          vad: vad.health(),
          goals: goals.health(),
          personal: personalStore.health(),
          personalWork: personalWork.health(),
          study: study.health(),
          proactivity: proactivity.health(),
          personalSearch: personalSearch.health(),
          capabilityTokens: capabilities.health(),
          debugging: debugging.health(),
          workspace: projectWorkspaces.health(),
          intelligence: estimator.health(),
          response: responseIntelligence.health(),
          runtime: runtime.health(),
          personality: personality.health(),
          conversation: conversation.health(),
          embeddings: embeddings.health(),
          memory: memory.health(),
          knowledge: knowledge.health(),
          continuity: continuity.health(),
          rag: rag.health(),
          profiles: profiles.health(),
          resources: resources.health(),
          artifacts: artifacts.health(),
          vision: vision.health(),
          image: image.health(),
          audio: audio.health(),
          video: video.health(),
          mediaQueue: mediaQueue.health(),
          safety: {
            processIsolation: 'allowlisted-spawn',
            osIsolation: false,
            shell: false,
          },
          research: research.health(),
          browser: {
            legacy: browser.health(),
            automation: browserAutomation.health(),
          },
          siteVisualVerifier: siteVisualVerifier.health(),
          coding: coding.health(),
          skills: skills.health(),
          specialists: specialists.list(),
          multiAgent: coordinator.health(),
          mcp: mcp.health(),
          background: scheduler.health(),
          events: eventBus.health(),
          visualVerification: true,
          featureFlags: config.featureFlags,
        },
        tasks: {
          total: tasks.length,
          running: tasks.filter((task) =>
            ['planning', 'running', 'awaiting_approval', 'paused'].includes(
              task.status,
            ),
          ).length,
        },
        limits: config.limits,
      };
    },
    close() {
      presence.stop();
      proactivity.close();
      scheduler.close();
      void browserAutomation.closeAll();
      void mcp.close();
      database.db.close();
    },
  };
}
