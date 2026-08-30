import type { AgentHealth, AgentTask, BackgroundJob, Chat, ChatMessage, Effort, LocalAttachment, LocalDocument, MediaArtifact, MediaJob, NexoCapability, NexoMemory, NexoSkill, NexoWorkflow, PersonalDashboard, PersonalGoal, PersonalSearchResult, PersonalSettings, PersonalSuggestion, PersonalTask, PresenceState, RuntimeEvent, RuntimeImmediateResponse, RuntimeStreamEvent, UserProfile } from './types';

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
  async streamChat(input: { question: string; mode: string; effort: Effort; profile: UserProfile; history: ChatMessage[]; documents: LocalDocument[]; attachments?: LocalAttachment[]; weather?: Record<string, unknown> | null; webSearch: boolean; imageQuality?: 'FAST'|'BALANCED'|'HIGH'|'MAX' }, onEvent: (event: RuntimeStreamEvent) => void, signal?: AbortSignal) {
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
  async listCapabilities(type?:string){const query=type?`?type=${encodeURIComponent(type)}`:'';return (await jsonResponse<{capabilities:NexoCapability[]}>(await fetch(`${this.baseUrl}/agent/capabilities${query}`,{headers:this.headers()}))).capabilities;}
  async configureCapability(id:string,enabled:boolean){return (await jsonResponse<{capability:NexoCapability}>(await fetch(`${this.baseUrl}/agent/capabilities/configure`,{method:'POST',headers:this.headers(true),body:JSON.stringify({id,enabled})}))).capability;}
  async listWorkflows(){return (await jsonResponse<{workflows:NexoWorkflow[]}>(await fetch(`${this.baseUrl}/agent/workflows`,{headers:this.headers()}))).workflows;}
  async resetPersonality() { return jsonResponse(await fetch(`${this.baseUrl}/agent/personality/reset`, { method: 'POST', headers: this.headers(true), body: JSON.stringify({ confirmation: 'RESET' }) })); }
  async personalDashboard() { return (await jsonResponse<{ dashboard: PersonalDashboard }>(await fetch(`${this.baseUrl}/agent/personal/dashboard`, { headers: this.headers() }))).dashboard; }
  async createPersonalGoal(input: Pick<PersonalGoal, 'title'> & Partial<PersonalGoal>) { return (await jsonResponse<{ goal: PersonalGoal }>(await fetch(`${this.baseUrl}/agent/personal/goals`, { method: 'POST', headers: this.headers(true), body: JSON.stringify(input) }))).goal; }
  async updatePersonalGoal(id: string, patch: Partial<PersonalGoal>) { return (await jsonResponse<{ goal: PersonalGoal }>(await fetch(`${this.baseUrl}/agent/personal/goals/${id}`, { method: 'POST', headers: this.headers(true), body: JSON.stringify({ patch, recalculateProgress: true }) }))).goal; }
  async createPersonalTask(input: Pick<PersonalTask, 'title'> & Partial<PersonalTask>) { return (await jsonResponse<{ task: PersonalTask }>(await fetch(`${this.baseUrl}/agent/personal/tasks`, { method: 'POST', headers: this.headers(true), body: JSON.stringify(input) }))).task; }
  async updatePersonalTask(id: string, patch: Partial<PersonalTask>) { return (await jsonResponse<{ task: PersonalTask }>(await fetch(`${this.baseUrl}/agent/personal/tasks/${id}`, { method: 'POST', headers: this.headers(true), body: JSON.stringify({ patch }) }))).task; }
  async updatePersonalSettings(patch: Partial<PersonalSettings>) { return (await jsonResponse<{ settings: PersonalSettings }>(await fetch(`${this.baseUrl}/agent/personal/settings`, { method: 'POST', headers: this.headers(true), body: JSON.stringify({ patch }) }))).settings; }
  async updateSuggestion(id: string, status: 'SEEN' | 'DISMISSED' | 'ACTED') { return (await jsonResponse<{ suggestion: PersonalSuggestion }>(await fetch(`${this.baseUrl}/agent/personal/suggestions/${id}`, { method: 'POST', headers: this.headers(true), body: JSON.stringify({ status }) }))).suggestion; }
  async personalSearch(query: string, scope = 'global') { return (await jsonResponse<{ results: PersonalSearchResult[] }>(await fetch(`${this.baseUrl}/agent/personal/search?q=${encodeURIComponent(query)}&scope=${encodeURIComponent(scope)}`, { headers: this.headers() }))).results; }
  async personalScan() { return jsonResponse<{ events: RuntimeEvent[]; suggestions: PersonalSuggestion[] }>(await fetch(`${this.baseUrl}/agent/personal/scan`, { method: 'POST', headers: this.headers(true), body: '{}' })); }
  async presence() { return jsonResponse<{ presence: PresenceState }>(await fetch(`${this.baseUrl}/agent/presence`, { headers: this.headers() })); }
  async updatePresence(input: Record<string, unknown>) { return (await jsonResponse<{ presence: PresenceState }>(await fetch(`${this.baseUrl}/agent/presence`, { method: 'POST', headers: this.headers(true), body: JSON.stringify(input) }))).presence; }
  async killPresence() { return (await jsonResponse<{ presence: PresenceState }>(await fetch(`${this.baseUrl}/agent/presence/kill`, { method: 'POST', headers: this.headers(true), body: '{}' }))).presence; }
  async mediaProviders() { return jsonResponse(await fetch(`${this.baseUrl}/agent/multimodal/providers`, { headers: this.headers() })); }
  async clearPersonal(target: 'goals' | 'activity' | 'learning') { return jsonResponse(await fetch(`${this.baseUrl}/agent/personal/clear`, { method: 'POST', headers: this.headers(true), body: JSON.stringify({ target, confirmation: 'CLEAR' }) })); }
  async warmRuntime(effort: Effort) { return jsonResponse(await fetch(`${this.baseUrl}/agent/runtime/warm`, { method: 'POST', headers: this.headers(true), body: JSON.stringify({ effort }) })); }
  async getMediaJob(id: string) { return (await jsonResponse<{ job: MediaJob }>(await fetch(`${this.baseUrl}/agent/media/jobs/${id}`, { headers: this.headers() }))).job; }
  async getArtifact(id: string) { return (await jsonResponse<{ artifacts: MediaArtifact[] }>(await fetch(`${this.baseUrl}/agent/artifacts?limit=100`, { headers: this.headers() }))).artifacts.find(item => item.id === id) || null; }
  artifactUrl(id: string) { return `${this.baseUrl}/agent/artifacts/${id}/content?token=${encodeURIComponent(this.token)}`; }
}
