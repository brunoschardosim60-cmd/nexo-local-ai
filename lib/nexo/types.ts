export type MessageKind = 'text' | 'sheet' | 'image' | 'action' | 'task';
export type Effort = 'Baixo' | 'Médio' | 'Alto' | 'Extra alto';
export type ChatMessage = {
  role: 'user' | 'assistant'; content: string; kind?: MessageKind;
  elapsedMs?: number; firstTokenMs?: number; effort?: Effort; model?: string; sourcePrompt?: string;
};
export type Chat = { id: string; title: string; messages: ChatMessage[]; updatedAt: number };
export type LocalDocument = { name: string; content: string };
export type UserProfile = { name: string; city: string; style: string; instructions: string };

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
export type AgentTask = {
  id: string; objective: string; status: string; plan: AgentTaskStep[]; graph?: AgentTaskNode[]; checkpoints?: AgentCheckpoint[];
  currentStep: number; stepsUsed: number; maxSteps: number; maxRetries: number;
  result?: { validated?: boolean; summary?: string; evidence?: string[]; remainingRisks?: string[] };
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
  };
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
