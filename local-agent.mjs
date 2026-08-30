import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { createNexoCore } from './agent/index.mjs';

const PORT = 7331; const ALLOWED_ORIGIN = 'http://localhost:3000'; const WORKSPACE = resolve(process.env.NEXO_WORKSPACE || '..');
const core = createNexoCore({ projectRoot: process.cwd(), workspace: WORKSPACE });
const SESSION_TOKEN = randomBytes(32).toString('hex'); const MAX_BODY = 2_000_000; const RATE_LIMIT = 60;
const rateWindow = { startedAt: Date.now(), requests: 0 }; const auditLog = [];

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Access-Control-Allow-Headers': 'Content-Type, X-Nexo-Token', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Cache-Control': 'no-store', Vary: 'Origin' };
}
function send(response, status, data) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() }); response.end(status === 204 ? undefined : JSON.stringify(data)); }
function verifyOrigin(request) { const origin = request.headers.origin; if (origin && origin !== ALLOWED_ORIGIN) throw new Error('Origem não autorizada.'); }
function verifySession(request) {
  verifyOrigin(request); if (request.headers['x-nexo-token'] !== SESSION_TOKEN) throw new Error('Sessão local não autorizada.');
  const now = Date.now(); if (now - rateWindow.startedAt >= 60_000) { rateWindow.startedAt = now; rateWindow.requests = 0; }
  rateWindow.requests += 1; if (rateWindow.requests > RATE_LIMIT) throw new Error('Limite de ações por minuto atingido.');
}
function audit(action, target, success, detail = '') { auditLog.unshift({ at: new Date().toISOString(), action, target, success, detail }); auditLog.splice(100); }
async function readBody(request) {
  let body = ''; for await (const chunk of request) { body += chunk; if (body.length > MAX_BODY) throw new Error('Conteúdo muito grande.'); }
  return body ? JSON.parse(body) : {};
}
function networkStatus() {
  const interfaces = Object.entries(networkInterfaces()).flatMap(([name, addresses]) => addresses?.some(address => !address.internal) ? [{ name, vpn: /wireguard|tailscale|vpn|tun|tap|nord|proton|wg/i.test(name) }] : []);
  return { interfaces, vpnDetected: interfaces.some(item => item.vpn) };
}

const legacyRoutes = Object.freeze({
  '/files/list': { tool: 'filesystem.list', risk: 'read' }, '/files/read': { tool: 'filesystem.read', risk: 'read' },
  '/files/write': { tool: 'filesystem.write', risk: 'write' }, '/folders/create': { tool: 'filesystem.mkdir', risk: 'write' }, '/projects/create': { tool: 'project.create', risk: 'write' },
});

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    try { verifyOrigin(request); return send(response, 204, {}); } catch { return send(response, 403, { error: 'Origem não autorizada.' }); }
  }
  try {
    const url = new URL(request.url || '/', `http://localhost:${PORT}`);
    if (request.method === 'GET' && url.pathname === '/health') {
      verifyOrigin(request); return send(response, 200, {
        ok: true, workspace: WORKSPACE, sessionToken: SESSION_TOKEN,
        permissions: ['read', 'write-with-approval', 'execute-with-approval', 'network-with-approval'],
        security: { loopbackOnly: true, authenticatedSession: true, rateLimitPerMinute: RATE_LIMIT, auditEntries: auditLog.length }, network: networkStatus(), agent: core.health(),
      });
    }
    verifySession(request);
    if (request.method === 'GET' && url.pathname === '/audit') return send(response, 200, { ok: true, entries: auditLog.slice(0, 30) });
    if (request.method === 'GET' && url.pathname === '/agent/tasks') return send(response, 200, { ok: true, tasks: core.loop.listTasks(Math.min(Number(url.searchParams.get('limit')) || 30, 100)) });
    if (request.method === 'GET' && url.pathname === '/agent/memory/search') return send(response, 200, { ok: true, memories: core.memory.search(url.searchParams.get('q') || '', { limit: Math.min(Number(url.searchParams.get('limit')) || 8, 30) }) });
    if (request.method === 'GET' && url.pathname === '/agent/rag/search') return send(response, 200, { ok: true, chunks: core.rag.search(url.searchParams.get('q') || '', Math.min(Number(url.searchParams.get('limit')) || 8, 30)) });
    if (request.method === 'GET' && url.pathname === '/agent/repository/map') return send(response, 200, { ok: true, repository: await core.repository.build(url.searchParams.get('path') || '.') });
    if (request.method === 'GET' && url.pathname === '/agent/repository/symbols') return send(response, 200, { ok: true, symbols: await core.repository.findSymbol(url.searchParams.get('q') || '', url.searchParams.get('path') || '.') });

    const sessionMatch = url.pathname.match(/^\/agent\/sessions\/([^/]+)$/);
    if (request.method === 'GET' && sessionMatch) return send(response, 200, { ok: true, session: core.database.getSession(sessionMatch[1]) });
    const checkpointsMatch = url.pathname.match(/^\/agent\/tasks\/([^/]+)\/checkpoints$/);
    if (request.method === 'GET' && checkpointsMatch) return send(response, 200, { ok: true, checkpoints: core.checkpoints.list(checkpointsMatch[1], 30) });
    const taskMatch = url.pathname.match(/^\/agent\/tasks\/([^/]+)$/);
    if (request.method === 'GET' && taskMatch) { const task = core.loop.getTask(taskMatch[1]); return task ? send(response, 200, { ok: true, task }) : send(response, 404, { error: 'Tarefa não encontrada.' }); }
    if (request.method !== 'POST') return send(response, 404, { error: 'Rota não encontrada.' });

    const input = await readBody(request);
    if (url.pathname === '/agent/tasks') {
      const task = core.loop.enqueueTask(input.objective, { maxSteps: input.maxSteps, maxRetries: input.maxRetries }); audit('agent_task', task.id, true, task.status); return send(response, 202, { ok: true, task });
    }
    const permissionMatch = url.pathname.match(/^\/agent\/tasks\/([^/]+)\/permissions\/([^/]+)$/);
    if (permissionMatch) {
      const task = core.loop.enqueuePermissionDecision(permissionMatch[1], permissionMatch[2], input.decision); audit('agent_permission', permissionMatch[2], true, input.decision); return send(response, 200, { ok: true, task });
    }
    const controlMatch = url.pathname.match(/^\/agent\/tasks\/([^/]+)\/control$/);
    if (controlMatch) { const task = core.loop.control(controlMatch[1], input.action); audit(`agent_${input.action}`, controlMatch[1], true, task.status); return send(response, 200, { ok: true, task }); }
    if (url.pathname === '/agent/memory') {
      const id = core.memory.remember(input.content, { kind: input.kind, importance: input.importance, confidence: input.confidence, source: input.source || 'user-session', metadata: input.metadata }); return send(response, 200, { ok: true, id });
    }
    if (url.pathname === '/agent/rag/index') {
      const indexed = await core.rag.indexFiles(Array.isArray(input.paths) ? input.paths : []); audit('rag_index', indexed.map(item => item.source).join(', '), true); return send(response, 200, { ok: true, indexed });
    }
    if (url.pathname === '/agent/rag/text') {
      const indexed = core.rag.indexText(input.source, input.content, input.metadata); audit('rag_text', indexed.source, true, `${indexed.chunks} chunks`); return send(response, 200, { ok: true, indexed });
    }
    if (sessionMatch) return send(response, 200, { ok: true, session: core.database.putSession(sessionMatch[1], input.state || {}) });

    const legacy = legacyRoutes[url.pathname];
    if (legacy) {
      if (legacy.risk !== 'read' && input.confirmation !== 'APPROVED') throw new Error('Aprovação obrigatória.');
      const { confirmation, ...toolInput } = input; const result = await core.registry.execute(legacy.tool, toolInput); audit(legacy.tool, input.path || '.', true); return send(response, 200, { ok: true, result });
    }
    return send(response, 404, { error: 'Rota não encontrada.' });
  } catch (error) {
    audit(request.url || 'unknown', '', false, error instanceof Error ? error.message : 'Falha desconhecida.'); return send(response, 400, { error: error instanceof Error ? error.message : 'Falha desconhecida.' });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Nexo Core ativo em http://127.0.0.1:${PORT}`); console.log(`Área permitida: ${WORKSPACE}`);
  console.log('Proteções: loopback, token, contratos de tools, aprovação, sandbox, checkpoints e auditoria.');
});

function shutdown() { server.close(() => { core.close(); process.exit(0); }); }
process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
