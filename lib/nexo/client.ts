import type { AgentHealth, AgentTask, BackgroundJob, Chat, ChatMessage, Effort, LocalAttachment, LocalDocument, MediaArtifact, MediaJob, NexoMemory, NexoSkill, RuntimeEvent, RuntimeImmediateResponse, RuntimeStreamEvent, UserProfile } from './types';

export const NEXO_AGENT_URL = 'http://127.0.0.1:7331';

async function jsonResponse<T>(response: Response): Promise<T> {
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `Nexo Core respondeu ${response.status}.`);
  return data;
}

export class NexoClient {
  constructor(readonly token = '', readonly baseUrl = NEXO_AGENT_URL) {}
  private headers(json = false) { return { ...(json ? { 'Content-Type': 'application/json' } : {}), ...(this.token ? { 'X-Nexo-Token': this.token } : {}) }; }
  async health() { return jsonResponse<AgentHealth>(await fetch(`${this.baseUrl}/health`)); }
  async getTask(taskId: string, signal?: AbortSignal) { return (await jsonResponse<{ task: AgentTask }>(await fetch(`${this.baseUrl}/agent/tasks/${taskId}`, { headers: this.headers(), signal }))).task; }
  async createTask(objective: string, options: { maxSteps: number; maxRetries: number }) {
    return (await jsonResponse<{ task: AgentTask }>(await fetch(`${this.baseUrl}/agent/tasks`, { method: 'POST', headers: this.headers(true), body: JSON.stringify({ objective, ...options }) }))).task;
  }
  async streamChat(input: { question: string; mode: string; effort: Effort; profile: UserProfile; history: ChatMessage[]; documents: LocalDocument[]; attachments?: LocalAttachment[]; weather?: Record<string, unknown> | null; webSearch: boolean }, onEvent: (event: RuntimeStreamEvent) => void, signal?: AbortSignal) {
    const response = await fetch(`${this.baseUrl}/chat`, { method: 'POST', headers: this.headers(true), body: JSON.stringify(input), signal });
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) return jsonResponse<RuntimeImmediateResponse>(response);
    if (!response.ok) throw new Error(`Nexo Runtime respondeu ${response.status}.`);
    if (!response.body) throw new Error('O Nexo Runtime não iniciou o streaming.');
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
    const emit = (line: string) => {
      if (!line.trim()) return;
      const event = JSON.parse(line) as RuntimeStreamEvent; onEvent(event);
      if (event.type === 'error') throw new Error(event.error);
    };
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop() || '';
      for (const line of lines) emit(line);
    }
    if (buffer.trim()) emit(buffer);
    return null;
  }
  async decidePermission(taskId: string, permissionId: string, decision: 'approved' | 'denied') {
    return (await jsonResponse<{ task: AgentTask }>(await fetch(`${this.baseUrl}/agent/tasks/${taskId}/permissions/${permissionId}`, { method: 'POST', headers: this.headers(true), body: JSON.stringify({ decision }) }))).task;
  }
  async controlTask(taskId: string, action: 'pause' | 'resume' | 'cancel') {
    return (await jsonResponse<{ task: AgentTask }>(await fetch(`${this.baseUrl}/agent/tasks/${taskId}/control`, { method: 'POST', headers: this.headers(true), body: JSON.stringify({ action }) }))).task;
  }
  async getSession(id = 'main') { return jsonResponse<{ session?: { state?: { chats?: Chat[]; profile?: UserProfile } } }>(await fetch(`${this.baseUrl}/agent/sessions/${id}`, { headers: this.headers() })); }
  async saveSession(chats: Chat[], profile: UserProfile, id = 'main') {
    return jsonResponse(await fetch(`${this.baseUrl}/agent/sessions/${id}`, { method: 'POST', headers: this.headers(true), body: JSON.stringify({ state: { chats: chats.slice(0, 30).map(chat => ({ ...chat, messages: chat.messages.slice(-50) })), profile } }) }));
  }
  async remember(content: string, options: { kind: string; importance: number; confidence?: number; source?: string; metadata?: Record<string, unknown> }) {
    return jsonResponse(await fetch(`${this.baseUrl}/agent/memory`, { method: 'POST', headers: this.headers(true), body: JSON.stringify({ content, ...options }) }));
  }
  async listMemories(options: { query?: string; scope?: string; limit?: number } = {}) {
    const parameters = new URLSearchParams({ limit: String(options.limit || 100) });
    if (options.scope) parameters.set('scope', options.scope);
    const path = options.query ? `/agent/memory/search?q=${encodeURIComponent(options.query)}&${parameters}` : `/agent/memory?${parameters}`;
    return (await jsonResponse<{ memories: NexoMemory[] }>(await fetch(`${this.baseUrl}${path}`, { headers: this.headers() }))).memories;
  }
  async manageMemory(id: string, action: 'update' | 'confirm' | 'forget' | 'delete', patch?: Partial<NexoMemory>) {
    return jsonResponse<{ memory?: NexoMemory; deleted?: boolean }>(await fetch(`${this.baseUrl}/agent/memory/${id}`, { method: 'POST', headers: this.headers(true), body: JSON.stringify({ action, patch, ...(action === 'delete' ? { confirmation: 'DELETE' } : {}) }) }));
  }
  async indexText(source: string, content: string, metadata?: Record<string, unknown>) {
    return jsonResponse(await fetch(`${this.baseUrl}/agent/rag/text`, { method: 'POST', headers: this.headers(true), body: JSON.stringify({ source, content, metadata }) }));
  }
  async listSkills() { return (await jsonResponse<{ skills: NexoSkill[] }>(await fetch(`${this.baseUrl}/agent/skills`, { headers: this.headers() }))).skills; }
  async listBackgroundJobs(limit = 30) { return (await jsonResponse<{ jobs: BackgroundJob[] }>(await fetch(`${this.baseUrl}/agent/background/jobs?limit=${limit}`, { headers: this.headers() }))).jobs; }
  async listEvents(after = 0, limit = 100) { return (await jsonResponse<{ events: RuntimeEvent[] }>(await fetch(`${this.baseUrl}/agent/events?after=${after}&limit=${limit}`, { headers: this.headers() }))).events; }
  async listBrowserSessions() { return jsonResponse(await fetch(`${this.baseUrl}/agent/browser/sessions`, { headers: this.headers() })); }
  async listMcpServers() { return jsonResponse(await fetch(`${this.baseUrl}/agent/mcp/servers`, { headers: this.headers() })); }
  async resetPersonality() { return jsonResponse(await fetch(`${this.baseUrl}/agent/personality/reset`, { method: 'POST', headers: this.headers(true), body: JSON.stringify({ confirmation: 'RESET' }) })); }
  async warmRuntime(effort: Effort) { return jsonResponse(await fetch(`${this.baseUrl}/agent/runtime/warm`, { method: 'POST', headers: this.headers(true), body: JSON.stringify({ effort }) })); }
  async getMediaJob(id: string) { return (await jsonResponse<{ job: MediaJob }>(await fetch(`${this.baseUrl}/agent/media/jobs/${id}`, { headers: this.headers() }))).job; }
  async getArtifact(id: string) { return (await jsonResponse<{ artifacts: MediaArtifact[] }>(await fetch(`${this.baseUrl}/agent/artifacts?limit=100`, { headers: this.headers() }))).artifacts.find(item => item.id === id) || null; }
  artifactUrl(id: string) { return `${this.baseUrl}/agent/artifacts/${id}/content?token=${encodeURIComponent(this.token)}`; }
}
