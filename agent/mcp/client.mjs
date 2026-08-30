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
    cwd: String(server.cwd || '.'), env: server.env && typeof server.env === 'object' ? server.env : {}, protocolVersion: String(server.protocolVersion || PROTOCOL_VERSION), skipInitialize: Boolean(server.skipInitialize),
  }));
}

class StdioConnection {
  constructor(server, workspace) { this.server = server; this.workspace = workspace; this.child = null; this.pending = new Map(); this.nextId = 1; this.initialized = false; this.buffer = ''; }
  start() {
    if (this.child) return;
    const cwd = resolve(this.workspace, this.server.cwd); if (cwd !== this.workspace && !cwd.startsWith(`${this.workspace}\\`) && !cwd.startsWith(`${this.workspace}/`)) throw new Error('Diretório MCP fora do workspace.');
    const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP, ...Object.fromEntries(Object.entries(this.server.env).map(([key, value]) => [key, String(value)])) };
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
  async function listTools(serverId) {
    const client = connection(serverId); await client.initialize(); const tools = []; let cursor;
    for (let page = 0; page < 10; page += 1) { const result = await client.request('tools/list', cursor ? { cursor } : {}); tools.push(...(result?.tools || [])); cursor = result?.nextCursor; if (!cursor) break; }
    return { serverId, tools };
  }
  async function callTool({ serverId, tool, arguments: args = {} }) {
    const client = connection(serverId); await client.initialize(); const result = await client.request('tools/call', { name: tool, arguments: args });
    if (result?.isError) throw new Error((result.content || []).map(item => item.text).filter(Boolean).join('\n') || `A tool MCP ${tool} falhou.`);
    return { serverId, tool, ...result };
  }
  const definitions = [
    defineTool({ name: 'mcp.servers', description: 'Lista servidores MCP locais explicitamente configurados.', risk: RISK.READ, inputSchema: { type: 'object', additionalProperties: false, properties: {} }, execute: () => servers.map(({ env, ...item }) => ({ ...item, envKeys: Object.keys(env) })) }),
    defineTool({ name: 'mcp.tools', description: 'Inicializa um servidor MCP configurado e descobre suas ferramentas.', risk: RISK.EXECUTE, inputSchema: { type: 'object', required: ['serverId'], additionalProperties: false, properties: { serverId: { type: 'string', minLength: 1, maxLength: 100 } } }, execute: ({ serverId }) => listTools(serverId) }),
    defineTool({ name: 'mcp.call', description: 'Chama uma ferramenta de um servidor MCP local configurado.', risk: RISK.EXECUTE, inputSchema: { type: 'object', required: ['serverId', 'tool'], additionalProperties: false, properties: { serverId: { type: 'string', minLength: 1, maxLength: 100 }, tool: { type: 'string', minLength: 1, maxLength: 200 }, arguments: { type: 'object' } } }, execute: callTool }),
  ];
  return { definitions, listTools, callTool, servers: () => servers.map(({ env, ...item }) => ({ ...item, envKeys: Object.keys(env) })), async close() { await Promise.all([...connections.values()].map(client => client.close())); connections.clear(); }, health: () => ({ configured: servers.length, connected: [...connections.values()].filter(item => item.initialized).length, transport: 'stdio-jsonrpc' }) };
}

export { loadConfig, StdioConnection };
