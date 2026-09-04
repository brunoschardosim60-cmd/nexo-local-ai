import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineTool } from '../tools/contracts.mjs';
import { RISK } from '../safety/policies.mjs';

const PROTOCOL_VERSION = '2025-06-18';

function loadConfig(path) {
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, 'utf8')); const entries = Array.isArray(parsed) ? parsed : parsed.servers || [];
  return entries.filter(server => server && server.id && server.command).map(server => ({
    id: String(server.id), name: String(server.name || server.id), command: String(server.command), args: Array.isArray(server.args) ? server.args.map(String) : [],
    cwd: String(server.cwd || '.'), env: server.env && typeof server.env === 'object' ? server.env : {}, protocolVersion: String(server.protocolVersion || PROTOCOL_VERSION), skipInitialize: Boolean(server.skipInitialize), enabled: server.enabled !== false, permissions: server.permissions || {}, allowedTools: Array.isArray(server.allowedTools) ? server.allowedTools.map(String) : null, transport: 'stdio',
  }));
}

function resolveEnvironment(configured = {}, hostEnvironment = process.env) {
  return Object.fromEntries(Object.entries(configured).map(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const variable = String(value.fromEnv || '').trim();
      if (!variable) throw new Error(`Referência de ambiente inválida para ${key}.`);
      const resolved = hostEnvironment[variable];
      if ((resolved == null || resolved === '') && value.required !== false) throw new Error(`Variável de ambiente obrigatória ausente: ${variable}.`);
      return [key, resolved == null ? '' : String(resolved)];
    }
    return [key, String(value)];
  }));
}

function classifyRisk(name) {
  const value = String(name).toLowerCase();
  if (/delete|remove|drop|destroy/.test(value)) return 'high';
  if (/write|create|update|send|reply|share|modify|post|execute|run/.test(value)) return 'write';
  return 'read';
}

class StdioConnection {
  constructor(server, workspace) { this.server = server; this.workspace = workspace; this.child = null; this.pending = new Map(); this.nextId = 1; this.initialized = false; this.buffer = ''; }
  start() {
    if (this.child) return;
    const cwd = resolve(this.workspace, this.server.cwd); if (cwd !== this.workspace && !cwd.startsWith(`${this.workspace}\\`) && !cwd.startsWith(`${this.workspace}/`)) throw new Error('Diretório MCP fora do workspace.');
    const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP, ...resolveEnvironment(this.server.env) };
    this.child = spawn(this.server.command, this.server.args, { cwd, env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stdout.setEncoding('utf8'); this.child.stdout.on('data', chunk => this.onData(chunk));
    this.child.stderr.on('data', () => undefined); this.child.on('error', error => this.rejectAll(error)); this.child.on('close', code => this.rejectAll(new Error(`Servidor MCP ${this.server.id} encerrou com código ${code}.`)));
  }
  onData(chunk) {
    this.buffer += chunk;
    for (;;) {
      const end = this.buffer.indexOf('\n'); if (end < 0) break;
      const line = this.buffer.slice(0, end).trim(); this.buffer = this.buffer.slice(end + 1); if (!line) continue;
      let message; try { message = JSON.parse(line); } catch { continue; }
      if (message.id == null || !this.pending.has(String(message.id))) continue;
      const pending = this.pending.get(String(message.id)); this.pending.delete(String(message.id)); clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message || 'Erro MCP.')); else pending.resolve(message.result);
    }
  }
  rejectAll(error) { for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); } this.pending.clear(); this.child = null; this.initialized = false; }
  send(message) { this.start(); this.child.stdin.write(`${JSON.stringify(message)}\n`); }
  request(method, params = {}, timeoutMs = 30_000) {
    const id = this.nextId++; return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => { this.pending.delete(String(id)); reject(new Error(`Timeout MCP em ${method}.`)); }, timeoutMs);
      this.pending.set(String(id), { resolve: resolvePromise, reject, timer }); this.send({ jsonrpc: '2.0', id, method, params });
    });
  }
  async initialize() {
    if (this.initialized) return;
    this.start();
    if (!this.server.skipInitialize) {
      await this.request('initialize', { protocolVersion: this.server.protocolVersion, capabilities: {}, clientInfo: { name: 'nexo-local-ai', version: '2.0.0' } });
      this.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    }
    this.initialized = true;
  }
  close() {
    const child = this.child; if (!child) return Promise.resolve();
    return new Promise(resolvePromise => {
      const timer = setTimeout(resolvePromise, 2_000); child.once('close', () => { clearTimeout(timer); resolvePromise(); }); child.kill('SIGTERM');
    });
  }
}

export function createMcpManager({ workspace, configPath }) {
  const servers = loadConfig(configPath); const connections = new Map();
  function server(id) { const found = servers.find(item => item.id === id); if (!found) throw new Error(`Servidor MCP não configurado: ${id}.`); return found; }
  function connection(id) { if (!connections.has(id)) connections.set(id, new StdioConnection(server(id), workspace)); return connections.get(id); }
  function assertEnabled(configured) { if (!configured.enabled) throw new Error(`Servidor MCP ${configured.id} está desabilitado.`); }
  function assertAllowed(configured, tool) { if (configured.allowedTools && !configured.allowedTools.includes(tool)) throw new Error(`Tool MCP não autorizada para ${configured.id}: ${tool}.`); }
  async function listTools(serverId) {
    const configured = server(serverId); assertEnabled(configured);
    const client = connection(serverId); await client.initialize(); const tools = []; let cursor;
    for (let page = 0; page < 10; page += 1) { const result = await client.request('tools/list', cursor ? { cursor } : {}); tools.push(...(result?.tools || [])); cursor = result?.nextCursor; if (!cursor) break; }
    return { serverId, tools: tools.filter(tool => !configured.allowedTools || configured.allowedTools.includes(tool.name)).map(tool => ({ ...tool, risk: classifyRisk(tool.name), trustedOutput: false })) };
  }
  async function listResourceKind(serverId,kind){const configured=server(serverId);assertEnabled(configured);const client=connection(serverId);await client.initialize();try{return await client.request(`${kind}/list`,{},10_000);}catch(error){return{[kind]:[],error:error.message};}}
  async function callTool({ serverId, tool, arguments: args = {} }) {
    const configured = server(serverId); assertEnabled(configured); assertAllowed(configured, tool); const risk = classifyRisk(tool);
    if (risk === 'high') throw new Error(`Ação destrutiva MCP bloqueada por padrão: ${serverId}/${tool}.`);
    if (risk !== 'read' && configured.permissions?.[tool] !== 'allow') throw new Error(`Permissão específica necessária para MCP ${serverId}/${tool}.`);
    const client = connection(serverId); await client.initialize(); const result = await client.request('tools/call', { name: tool, arguments: args });
    if (result?.isError) throw new Error((result.content || []).map(item => item.text).filter(Boolean).join('\n') || `A tool MCP ${tool} falhou.`);
    return { serverId, tool, risk,trust:'EXTERNAL_DATA',instructionAuthority:'NONE', ...result };
  }
  const definitions = [
    defineTool({ name: 'mcp.servers', description: 'Lista servidores MCP locais explicitamente configurados.', risk: RISK.READ, inputSchema: { type: 'object', additionalProperties: false, properties: {} }, execute: () => servers.map(({ env, permissions, ...item }) => ({ ...item, envKeys: Object.keys(env), permittedWriteTools: Object.entries(permissions).filter(([, decision]) => decision === 'allow').map(([tool]) => tool) })) }),
    defineTool({ name: 'mcp.tools', description: 'Inicializa um servidor MCP configurado e descobre suas ferramentas.', risk: RISK.EXECUTE, inputSchema: { type: 'object', required: ['serverId'], additionalProperties: false, properties: { serverId: { type: 'string', minLength: 1, maxLength: 100 } } }, execute: ({ serverId }) => listTools(serverId) }),
    defineTool({ name: 'mcp.call', description: 'Chama uma ferramenta de um servidor MCP local configurado.', risk: RISK.EXECUTE, inputSchema: { type: 'object', required: ['serverId', 'tool'], additionalProperties: false, properties: { serverId: { type: 'string', minLength: 1, maxLength: 100 }, tool: { type: 'string', minLength: 1, maxLength: 200 }, arguments: { type: 'object' } } }, execute: callTool }),
  ];
  async function checkHealth(serverId){const started=performance.now();try{const configured=server(serverId);assertEnabled(configured);await connection(serverId).initialize();return{serverId,status:'AVAILABLE',latencyMs:performance.now()-started};}catch(error){return{serverId,status:'UNAVAILABLE',latencyMs:performance.now()-started,error:error.message};}}
  return { definitions, listTools, callTool, resources:id=>listResourceKind(id,'resources'),prompts:id=>listResourceKind(id,'prompts'),checkHealth,servers: () => servers.map(({ env, permissions, ...item }) => ({ ...item, envKeys: Object.keys(env), env: Object.fromEntries(Object.keys(env).map(key => [key, 'secret-reference'])), permittedWriteTools: Object.entries(permissions).filter(([, decision]) => decision === 'allow').map(([tool]) => tool) })), async close() { await Promise.all([...connections.values()].map(client => client.close())); connections.clear(); }, health: () => ({ version:'2.1.0',protocolVersion:PROTOCOL_VERSION,configured: servers.length, connected: [...connections.values()].filter(item => item.initialized).length, transport: 'stdio-jsonrpc',resources:true,prompts:true,perToolRisk:true,toolAllowlist:true,environmentReferences:true,timeouts:true,externalOutputUntrusted:true }) };
}

export { classifyRisk, loadConfig, resolveEnvironment, StdioConnection };
