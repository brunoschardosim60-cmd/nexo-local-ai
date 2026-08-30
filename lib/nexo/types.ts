export type MessageKind = 'text' | 'sheet' | 'image' | 'video' | 'audio' | 'action' | 'task' | 'unavailable';
export type LocalAttachment = { type: 'image' | 'audio' | 'video' | 'screen' | 'camera'; name: string; mimeType: string; dataUrl: string };
export type PresenceState = { active: boolean; listening: boolean; viewingScreen: boolean; cameraActive: boolean; thinking: boolean; speaking: boolean; mode: string; startedAt?: string | null };
export type MediaArtifact = { id: string; type: 'image' | 'video' | 'audio'; mimeType: string; provider: string; model?: string | null; metadata?: Record<string, unknown> };
export type Effort = 'Baixo' | 'Médio' | 'Alto' | 'Extra alto';
export type ChatMessage = {
  role: 'user' | 'assistant'; content: string; kind?: MessageKind;
  elapsedMs?: number; firstTokenMs?: number; effort?: Effort; model?: string; sourcePrompt?: string;
  artifact?: MediaArtifact; attachments?: Array<Omit<LocalAttachment, 'dataUrl'>>;
};
export type Chat = { id: string; title: string; messages: ChatMessage[]; updatedAt: number };
export type LocalDocument = { name: string; content: string };
export type UserProfile = { name: string; city: string; style: string; instructions: string };
export type PersonalGoalStatus = 'IDEA' | 'ACTIVE' | 'PAUSED' | 'BLOCKED' | 'COMPLETED' | 'CANCELLED';
export type PersonalTaskStatus = 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED';
export type PersonalGoal = { id: string; title: string; description: string; scope: string; priority: number; status: PersonalGoalStatus; deadline?: string | null; progress: number; milestones: Array<{ id: string; title: string; status: string; progress: number; evidence?: unknown[] }>; dependencies: string[]; evidence: unknown[]; createdAt: string; updatedAt: string; completedAt?: string | null };
export type PersonalTask = { id: string; goalId?: string | null; projectScope: string; title: string; description: string; priority: number; deadline?: string | null; estimatedMinutes?: number | null; dependencies: string[]; status: PersonalTaskStatus; evidence: unknown[]; createdAt: string; updatedAt: string; completedAt?: string | null; priorityEvaluation?: { score: number; reason: string; parts: Record<string, number> } };
export type PersonalSettings = { proactivityLevel: 'OFF' | 'LOW' | 'NORMAL' | 'HIGH'; notificationsEnabled: boolean; quietHours: { enabled: boolean; start: string; end: string }; interruptionBudget: { maxPerDay: number; minMinutesBetween: number }; dailyBriefEnabled: boolean; endOfDayReviewEnabled: boolean; learningHistoryEnabled: boolean; spacedRepetitionEnabled: boolean; tutorMode: 'GUIDE' | 'TEACH' | 'CHALLENGE' | 'EXAM'; dontSpoil: boolean; focusMode: boolean };
export type PersonalSuggestion = { id: string; kind: string; title: string; message: string; importance: number; confidence: number; reason: string; source: string; action: Record<string, unknown>; policy: 'SUGGEST' | 'ASK' | 'ACT'; status: string; createdAt: string };
export type LearningConcept = { id: string; scope: string; name: string; mastery: number; confidence: number; lastReviewedAt?: string | null; nextReviewAt?: string | null; mistakes: unknown[]; dependencies: string[]; enabled: boolean };
export type PersonalSearchResult = { kind: string; id: string; title: string; summary: string; scope: string; status?: string | null; updatedAt?: string | null; score: number };
export type PersonalDashboard = { today: { date: string; activeGoals: PersonalGoal[]; pendingTasks: PersonalTask[]; importantDeadlines: Array<(PersonalGoal | PersonalTask) & { risk: { level: string; reason: string; confidence: number } }>; unfinishedWork: PersonalTask[]; recentChanges: RuntimeEvent[]; recommendedFocus?: { taskId: string; title: string; reason: string } | null }; settings: PersonalSettings; goals: PersonalGoal[]; tasks: PersonalTask[]; learning: { due: Array<{ concept: LearningConcept; reason: string; recommendedActivity: string }>; tutorMode: string; spacedRepetition: boolean }; suggestions: PersonalSuggestion[]; projects: Array<{ id: string; name: string; root: string; updatedAt?: string; state?: Record<string, unknown> }>; recent: RuntimeEvent[]; triggers: Array<Record<string, unknown>> };
export type RuntimeRoute = 'instant' | 'fast' | 'deep' | 'agent';
export type RuntimeContextStats = {
  historyMessages: number; contextChars: number; memoryLoaded: boolean; ragLoaded: boolean; researchLoaded: boolean;
  cacheHits: Array<{ source: string; cached: boolean }>;
};
export type RuntimeStreamEvent =
  | { type: 'meta'; route: RuntimeRoute; model: string; context: RuntimeContextStats }
  | { type: 'token'; content: string }
  | { type: 'done'; content: string; route: RuntimeRoute; model: string; metrics?: Record<string, number>; context: RuntimeContextStats }
  | { type: 'error'; error: string };
export type RuntimeImmediateResponse =
  | { ok: true; kind: 'instant'; route: 'instant'; content: string; model: string; context: string }
  | { ok: true; kind: 'task'; route: 'agent'; task: AgentTask; model: string; context: string }
  | { ok: true; kind: 'unavailable'; route: 'media'; mediaKind: 'image' | 'video' | 'audio'; content: string; model: string; availability?: { error?: string } }
  | { ok: true; kind: 'media'; route: 'media'; mediaKind: 'image' | 'video' | 'audio'; content: string; model: string; job: MediaJob };
export type MediaJob = { id: string; kind: 'image' | 'video' | 'tts'; status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'; artifactId?: string | null; error?: string | null };

export type NexoAction = {
  type: 'write_file' | 'create_folder' | 'read_file' | 'list_files' | 'create_project';
  path: string; content?: string; template?: 'static-site' | 'node-api' | 'python-api' | 'ai-service'; reason: string;
  status?: 'pending' | 'completed' | 'failed'; result?: string; output?: string;
};

export type AgentTaskStep = {
  id: string; title: string; description: string; status: 'pending' | 'ready' | 'awaiting_approval' | 'completed' | 'failed';
  dependencies?: string[]; assignedAgent?: string; observations?: string[]; successCriteria?: string[];
  action?: { tool: string; input: Record<string, unknown>; reason: string; successCriteria: string };
  permissionId?: string; error?: string;
};
export type AgentPermission = {
  id: string; taskId: string; tool: string; scope: string; risk: string;
  status: 'pending' | 'approved' | 'denied'; reason: string; input: Record<string, unknown>;
};
export type AgentTaskEvent = { id: string; sequence: number; type: string; level: string; message: string; createdAt: string };
export type AgentTaskNode = AgentTaskStep & { taskId: string; parentId?: string | null; attempts: number; confidence?: number | null; model?: string | null };
export type AgentCheckpoint = { id: string; taskId: string; sequence: number; kind: string; label: string; createdAt: string };
export type NexoSkill = { id: string; name: string; description: string; path: string; enabled: boolean; instructionChars: number };
export type BackgroundJob = { id: string; name: string; objective: string; scheduleType: 'once' | 'interval'; intervalSeconds?: number | null; nextRunAt: string; status: string; lastTaskId?: string | null; runCount: number };
export type RuntimeEvent = { sequence: number; id: string; type: string; level: string; taskId?: string | null; source: string; data?: unknown; createdAt: string };
export type AgentTask = {
  id: string; objective: string; status: string; plan: AgentTaskStep[]; graph?: AgentTaskNode[]; checkpoints?: AgentCheckpoint[];
  parentTaskId?: string | null; assignedAgent?: string; children?: Array<{ id: string; objective: string; status: string; assignedAgent?: string }>;
  currentStep: number; stepsUsed: number; maxSteps: number; maxRetries: number;
  goal?: { objective: string; completionState: 'OPEN' | 'VERIFIED' | 'FAILED' | 'UNCERTAIN'; constraints: string[]; acceptanceCriteria: Array<{ id: string; criterion: string; status: 'PASS' | 'FAIL' | 'UNCERTAIN' | 'NOT_CHECKED'; evidence: string[] }>; requiredEvidence: string[] };
  budgets?: { maxSteps?: number; maxRetries?: number; maxToolCalls?: number; maxModelCalls?: number; maxDurationMs?: number; maxCost?: number };
  usage?: { modelCalls?: number; toolCalls?: number; tokens?: number; cost?: number };
  workingMemory?: { currentOperation?: string; lastObservation?: string; evidence?: Array<{ tool: string; ok: boolean; step: string; at: string }> };
  result?: {
    verdict?: 'PASS' | 'FAIL' | 'UNCERTAIN'; validated?: boolean; confidence?: number; summary?: string; evidence?: string[]; remainingRisks?: string[];
    completionState?: string; goal?: AgentTask['goal']; acceptanceCriteria?: Array<{ criterion: string; met: boolean }>;
  };
  error?: string; permissions: AgentPermission[]; events: AgentTaskEvent[];
};
export type AgentHealth = {
  sessionToken: string; workspace: string;
  security: { loopbackOnly: boolean; authenticatedSession: boolean; rateLimitPerMinute: number; auditEntries: number };
  network: { interfaces: Array<{ name: string; vpn: boolean }>; vpnDetected: boolean };
  agent?: {
    runtime?: string; version?: string; persistent: boolean; database: string; tools: Array<{ name: string; risk: string }>;
    tasks: { total: number; running: number }; limits: { maxSteps: number; maxRetries: number };
    taskGraph?: boolean; checkpoints?: boolean; contextEngine?: boolean; repositoryIntelligence?: boolean;
    capabilities?: {
      runtime?: { version: string; routes: RuntimeRoute[]; progressiveContext: boolean; streaming: boolean; cacheEntries: number };
      personality?: { adaptive: boolean; learnedTraits: number; observations: number };
      safety?: { processIsolation: string; osIsolation: boolean; shell: boolean };
      research?: { providers: string[]; paidKeysRequired: boolean };
      browser?: { legacy?: { available: boolean; engine?: string | null; screenshots: boolean; persistentSessions: boolean }; automation?: { available: boolean; engine?: string | null; activeSessions: number; actions: string[]; observations: string[] } };
      coding?: { checks: string[]; repositoryAware: boolean };
      skills?: { loaded: number; enabled: number; roots: string[] };
      specialists?: Array<{ id: string; label: string; purpose: string }>;
      multiAgent?: { enabled: boolean; maxParallel: number; specialists: string[] };
      mcp?: { configured: number; connected: number; transport: string };
      background?: { active: number; total: number; running: boolean };
      events?: { persistent: boolean; subscribers: number };
      memory?: { engine: string; records: number; memories: number; semantic: number; legacy: number; scopes: number; uncertain: number; hybridRetrieval: boolean; temporal: boolean; contradictions: boolean };
      knowledge?: { engine: string; entities: number; relations: number; maxTraversalDepth: number };
      continuity?: { engine: string; persistentHandoffs: boolean; projectAware: boolean };
      personal?: Record<string, unknown>; personalWork?: Record<string, unknown>; study?: Record<string, unknown>; proactivity?: Record<string, unknown>; personalSearch?: Record<string, unknown>;
      multimodal?: Record<string, unknown>; providers?: Record<string, unknown>; perception?: Record<string, unknown>; presence?: Record<string, unknown>; vad?: Record<string, unknown>;
      visualVerification?: boolean;
      vision?: Record<string, unknown>; image?: Record<string, unknown>; video?: Record<string, unknown>; audio?: Record<string, unknown>; mediaQueue?: Record<string, unknown>;
    };
  };
};

export type NexoMemory = {
  id: string; type: string; kind: string; content: string; summary: string; scope: string;
  privacy: 'LOCAL_ONLY' | 'SHAREABLE' | 'RESTRICTED'; status: 'ACTIVE' | 'UNCERTAIN' | 'SUPERSEDED' | 'FORGOTTEN' | 'DELETED';
  confidence: number; importance: number; source: string; topics: string[]; entities: Array<{ type: string; name: string }>;
  createdAt: string; updatedAt: string; observedAt: string; lastConfirmedAt?: string | null; supersededBy?: string | null;
};

export function parseAgentTask(content: string): AgentTask | null {
  try {
    const parsed = JSON.parse(content) as AgentTask;
    return parsed?.id && Array.isArray(parsed.plan) && Array.isArray(parsed.permissions) ? parsed : null;
  } catch { return null; }
}

export function taskStatusLabel(status: string) {
  return ({
    planning: 'Planejando', running: 'Executando', paused: 'Pausada', awaiting_approval: 'Aguardando aprovação',
    completed: 'Concluída', completed_with_warnings: 'Concluída com alertas', failed: 'Falhou', cancelled: 'Cancelada',
  })[status] || status;
}
