import type { AgentHealth, AgentTask, BackgroundJob, Chat, NexoSkill, RuntimeEvent, UserProfile } from './types';

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
  async indexText(source: string, content: string, metadata?: Record<string, unknown>) {
    return jsonResponse(await fetch(`${this.baseUrl}/agent/rag/text`, { method: 'POST', headers: this.headers(true), body: JSON.stringify({ source, content, metadata }) }));
  }
  async listSkills() { return (await jsonResponse<{ skills: NexoSkill[] }>(await fetch(`${this.baseUrl}/agent/skills`, { headers: this.headers() }))).skills; }
  async listBackgroundJobs(limit = 30) { return (await jsonResponse<{ jobs: BackgroundJob[] }>(await fetch(`${this.baseUrl}/agent/background/jobs?limit=${limit}`, { headers: this.headers() }))).jobs; }
  async listEvents(after = 0, limit = 100) { return (await jsonResponse<{ events: RuntimeEvent[] }>(await fetch(`${this.baseUrl}/agent/events?after=${after}&limit=${limit}`, { headers: this.headers() }))).events; }
  async listBrowserSessions() { return jsonResponse(await fetch(`${this.baseUrl}/agent/browser/sessions`, { headers: this.headers() })); }
  async listMcpServers() { return jsonResponse(await fetch(`${this.baseUrl}/agent/mcp/servers`, { headers: this.headers() })); }
}
