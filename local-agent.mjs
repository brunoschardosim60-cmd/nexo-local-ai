import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { createNexoCore } from './agent/index.mjs';

const PORT = 7331; const ALLOWED_ORIGIN = 'http://localhost:3000'; const WORKSPACE = resolve(process.env.NEXO_WORKSPACE || '..');
const core = createNexoCore({ projectRoot: process.cwd(), workspace: WORKSPACE });
const SESSION_TOKEN = randomBytes(32).toString('hex'); const MAX_BODY = 12_000_000; const RATE_LIMIT = 60;
const rateWindow = { startedAt: Date.now(), requests: 0 }; const auditLog = [];

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Access-Control-Allow-Headers': 'Content-Type, X-Nexo-Token', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Cache-Control': 'no-store', Vary: 'Origin' };
}
function send(response, status, data) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() }); response.end(status === 204 ? undefined : JSON.stringify(data)); }
async function streamRuntime(request, response, prepared) {
  const controller = new AbortController(); request.once('aborted', () => controller.abort());
  response.once('close', () => { if (!response.writableEnded) controller.abort(); });
  response.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Accel-Buffering': 'no', ...corsHeaders() });
  try {
    for await (const event of core.runtime.stream(prepared, { signal: controller.signal })) {
      if (response.destroyed) break;
      response.write(`${JSON.stringify(event)}\n`);
    }
  } catch (error) {
    if (!response.destroyed) response.write(`${JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : 'Falha no Runtime V4.' })}\n`);
  } finally { if (!response.destroyed) response.end(); }
}
function verifyOrigin(request) { const origin = request.headers.origin; if (origin && origin !== ALLOWED_ORIGIN) throw new Error('Origem não autorizada.'); }
function verifySession(request) {
  verifyOrigin(request); const requestUrl = new URL(request.url || '/', `http://localhost:${PORT}`); if (request.headers['x-nexo-token'] !== SESSION_TOKEN && requestUrl.searchParams.get('token') !== SESSION_TOKEN) throw new Error('Sessão local não autorizada.');
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
function mediaUnavailable(kind, availability) {
  const labels = { image: 'geração de imagens', video: 'geração de vídeos', audio: 'voz local de servidor' };
  return { ok: true, kind: 'unavailable', route: 'media', mediaKind: kind, model: 'Nexo Media', content: `O módulo de ${labels[kind]} está instalado, mas o provider local ainda não está disponível. ${availability?.error || 'Configure e inicie um provider compatível.'}`, availability };
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
    if (request.method === 'GET' && url.pathname === '/agent/memory/search') return send(response, 200, { ok: true, memories: await core.memory.search(url.searchParams.get('q') || '', { limit: Math.min(Number(url.searchParams.get('limit')) || 8, 30) }) });
    if (request.method === 'GET' && url.pathname === '/agent/rag/search') return send(response, 200, { ok: true, chunks: await core.rag.search(url.searchParams.get('q') || '', Math.min(Number(url.searchParams.get('limit')) || 8, 30)) });
    if (request.method === 'GET' && url.pathname === '/agent/repository/map') return send(response, 200, { ok: true, repository: await core.repository.build(url.searchParams.get('path') || '.') });
    if (request.method === 'GET' && url.pathname === '/agent/repository/symbols') return send(response, 200, { ok: true, symbols: await core.repository.findSymbol(url.searchParams.get('q') || '', url.searchParams.get('path') || '.') });
    if (request.method === 'GET' && url.pathname === '/agent/events') return send(response, 200, { ok: true, events: core.eventBus.list({ after: Number(url.searchParams.get('after')) || 0, limit: Math.min(Number(url.searchParams.get('limit')) || 100, 500), type: url.searchParams.get('type') || null }) });
    if (request.method === 'GET' && url.pathname === '/agent/skills') { await core.skills.ready(); return send(response, 200, { ok: true, skills: core.skills.list() }); }
    if (request.method === 'GET' && url.pathname === '/agent/background/jobs') return send(response, 200, { ok: true, jobs: core.scheduler.list(Math.min(Number(url.searchParams.get('limit')) || 30, 100)) });
    if (request.method === 'GET' && url.pathname === '/agent/browser/sessions') return send(response, 200, { ok: true, sessions: core.browser.sessions(Math.min(Number(url.searchParams.get('limit')) || 30, 100)) });
    if (request.method === 'GET' && url.pathname === '/agent/mcp/servers') return send(response, 200, { ok: true, servers: core.mcp.servers() });
    if (request.method === 'GET' && url.pathname === '/agent/specialists') return send(response, 200, { ok: true, specialists: core.specialists.list() });
    if (request.method === 'GET' && url.pathname === '/agent/subtasks') return send(response, 200, { ok: true, subtasks: core.database.listChildTasks(url.searchParams.get('parentTaskId') || '') });
    if (request.method === 'GET' && url.pathname === '/agent/personality') return send(response, 200, { ok: true, personality: core.personality.snapshot('casual') });
    if (request.method === 'GET' && url.pathname === '/agent/models/route') return send(response, 200, { ok: true, route: core.router.route({ objective: url.searchParams.get('q') || '', purpose: url.searchParams.get('purpose') || 'response' }) });
    if (request.method === 'GET' && url.pathname === '/agent/models/benchmarks') return send(response, 200, { ok: true, benchmarks: core.database.listModelBenchmarks(url.searchParams.get('domain') || null) });
    if (request.method === 'GET' && url.pathname === '/agent/models/profiles') return send(response, 200, { ok: true, profiles: await core.profiles.refresh(), resources: core.resources.snapshot() });
    if (request.method === 'GET' && url.pathname === '/agent/media/jobs') return send(response, 200, { ok: true, jobs: core.mediaQueue.list(Math.min(Number(url.searchParams.get('limit')) || 30, 100)) });
    if (request.method === 'GET' && url.pathname === '/agent/artifacts') return send(response, 200, { ok: true, artifacts: core.artifacts.list(Math.min(Number(url.searchParams.get('limit')) || 30, 100)) });

    const artifactContentMatch = url.pathname.match(/^\/agent\/artifacts\/([^/]+)\/content$/);
    if (request.method === 'GET' && artifactContentMatch) {
      const artifact = core.artifacts.get(artifactContentMatch[1]); if (!artifact) return send(response, 404, { error: 'Artefato não encontrado.' });
      const info = await stat(artifact.location); response.writeHead(200, { 'Content-Type': artifact.mimeType, 'Content-Length': info.size, 'Content-Disposition': `inline; filename="nexo-${artifact.id}"`, ...corsHeaders() }); return createReadStream(artifact.location).pipe(response);
    }
    const mediaMatch = url.pathname.match(/^\/agent\/media\/jobs\/([^/]+)$/);
    if (request.method === 'GET' && mediaMatch) { const job = core.mediaQueue.get(mediaMatch[1]); return job ? send(response, 200, { ok: true, job }) : send(response, 404, { error: 'Job não encontrado.' }); }

    const sessionMatch = url.pathname.match(/^\/agent\/sessions\/([^/]+)$/);
    if (request.method === 'GET' && sessionMatch) return send(response, 200, { ok: true, session: core.database.getSession(sessionMatch[1]) });
    const checkpointsMatch = url.pathname.match(/^\/agent\/tasks\/([^/]+)\/checkpoints$/);
    if (request.method === 'GET' && checkpointsMatch) return send(response, 200, { ok: true, checkpoints: core.checkpoints.list(checkpointsMatch[1], 30) });
    const taskMatch = url.pathname.match(/^\/agent\/tasks\/([^/]+)$/);
    if (request.method === 'GET' && taskMatch) { const task = core.loop.getTask(taskMatch[1]); return task ? send(response, 200, { ok: true, task }) : send(response, 404, { error: 'Tarefa não encontrada.' }); }
    if (request.method !== 'POST') return send(response, 404, { error: 'Rota não encontrada.' });

    const input = await readBody(request);
    if (url.pathname === '/chat') {
      const attachments = Array.isArray(input.attachments) ? input.attachments.slice(0, 4) : [];
      const requestedImage = input.mode === 'Imagens';
      const requestedVideo = input.mode === 'Vídeos';
      if (requestedImage) { const availability = await core.image.availability(); if (!availability.available) return send(response, 200, mediaUnavailable('image', availability)); const job = core.mediaQueue.enqueue('image', { prompt: input.question, aspectRatio: input.aspectRatio, verify: true }, { priority: 3 }); return send(response, 202, { ok: true, kind: 'media', route: 'media', mediaKind: 'image', job, content: 'Imagem adicionada à fila local.', model: 'Nexo Image' }); }
      if (requestedVideo) { const availability = await core.video.availability(); if (!availability.available) return send(response, 200, mediaUnavailable('video', availability)); const job = core.mediaQueue.enqueue('video', { prompt: input.question, durationSeconds: input.durationSeconds }, { priority: 5 }); return send(response, 202, { ok: true, kind: 'media', route: 'media', mediaKind: 'video', job, content: 'Vídeo adicionado à fila local.', model: 'Nexo Video' }); }
      if (attachments.some(item => item.type === 'image')) {
        const analyses = [];
        for (const attachment of attachments.filter(item => item.type === 'image')) { const result = await core.vision.analyzeImage({ dataUrl: attachment.dataUrl }, `Analise a imagem anexada para responder à pergunta do usuário: ${String(input.question).slice(0, 2000)}. Separe fatos visíveis de inferências.`); analyses.push({ name: attachment.name || 'imagem', content: result.content }); }
        input.documents = [...(Array.isArray(input.documents) ? input.documents : []), ...analyses.map(item => ({ name: `Análise visual: ${item.name}`, content: item.content }))];
        input.attachments = [];
      }
      const prepared = await core.runtime.prepare(input); audit('runtime_chat', prepared.route, true, prepared.kind);
      if (prepared.kind === 'instant') return send(response, 200, { ok: true, ...prepared });
      if (prepared.kind === 'task') return send(response, 202, { ok: true, ...prepared });
      return streamRuntime(request, response, prepared);
    }
    if (url.pathname === '/agent/runtime/warm') return send(response, 200, { ok: true, ...(await core.runtime.warm(input.effort)) });
    if (url.pathname === '/agent/vision/analyze') { const result = await core.vision.analyzeImage(input.image, input.instruction); audit('vision_analyze', input.image?.name || 'upload', true, result.model); return send(response, 200, { ok: true, result }); }
    if (url.pathname === '/agent/tasks') {
      const task = core.loop.enqueueTask(input.objective, { maxSteps: input.maxSteps, maxRetries: input.maxRetries }); audit('agent_task', task.id, true, task.status); return send(response, 202, { ok: true, task });
    }
    const permissionMatch = url.pathname.match(/^\/agent\/tasks\/([^/]+)\/permissions\/([^/]+)$/);
    if (permissionMatch) {
      const task = core.loop.enqueuePermissionDecision(permissionMatch[1], permissionMatch[2], input.decision); audit('agent_permission', permissionMatch[2], true, input.decision); return send(response, 200, { ok: true, task });
    }
    const controlMatch = url.pathname.match(/^\/agent\/tasks\/([^/]+)\/control$/);
    if (controlMatch) { const task = core.loop.control(controlMatch[1], input.action); audit(`agent_${input.action}`, controlMatch[1], true, task.status); return send(response, 200, { ok: true, task }); }
    const cancelMediaMatch = url.pathname.match(/^\/agent\/media\/jobs\/([^/]+)\/cancel$/);
    if (cancelMediaMatch) { const job = core.mediaQueue.cancel(cancelMediaMatch[1]); audit('media_cancel', job.id, true, job.kind); return send(response, 200, { ok: true, job }); }
    if (url.pathname === '/agent/memory') {
      const id = await core.memory.remember(input.content, { kind: input.kind, importance: input.importance, confidence: input.confidence, source: input.source || 'user-session', metadata: input.metadata }); return send(response, 200, { ok: true, id });
    }
    if (url.pathname === '/agent/rag/index') {
      const indexed = await core.rag.indexFiles(Array.isArray(input.paths) ? input.paths : []); audit('rag_index', indexed.map(item => item.source).join(', '), true); return send(response, 200, { ok: true, indexed });
    }
    if (url.pathname === '/agent/rag/text') {
      const indexed = await core.rag.indexText(input.source, input.content, input.metadata); audit('rag_text', indexed.source, true, `${indexed.chunks} chunks`); return send(response, 200, { ok: true, indexed });
    }
    if (url.pathname === '/agent/intelligence/migrate') {
      const [memory, rag] = await Promise.all([core.memory.migrate(Math.min(Number(input.memoryLimit) || 800, 2000)), core.rag.migrate(Math.min(Number(input.ragLimit) || 2000, 5000))]);
      audit('semantic_migration', 'memory+rag', true, `${memory.migrated + rag.migrated} vetores`); return send(response, 200, { ok: true, memory, rag });
    }
    if (url.pathname === '/agent/models/benchmarks') {
      if (!input.model || !input.domain || !Number.isFinite(Number(input.score)) || Number(input.sampleCount) < 10) throw new Error('Benchmark inválido ou com menos de 10 amostras.');
      const benchmark = core.database.upsertModelBenchmark({ model: String(input.model), domain: String(input.domain), score: Math.max(0, Math.min(1, Number(input.score))), sampleCount: Number(input.sampleCount), medianLatencyMs: input.medianLatencyMs == null ? null : Number(input.medianLatencyMs), metadata: input.metadata || {} });
      return send(response, 200, { ok: true, benchmark });
    }
    if (url.pathname === '/agent/personality/reset') {
      if (input.confirmation !== 'RESET') throw new Error('Confirmação necessária para apagar a adaptação.');
      const result = core.personality.reset(); core.runtime.clearCache(); audit('personality_reset', 'adaptive-style', true); return send(response, 200, { ok: true, result });
    }
    if (sessionMatch) return send(response, 200, { ok: true, session: core.database.putSession(sessionMatch[1], input.state || {}) });

    const legacy = legacyRoutes[url.pathname];
    if (legacy) {
      if (legacy.risk !== 'read' && input.confirmation !== 'APPROVED') throw new Error('Aprovação obrigatória.');
      const toolInput = { ...input }; delete toolInput.confirmation;
      const result = await core.registry.execute(legacy.tool, toolInput); audit(legacy.tool, input.path || '.', true); return send(response, 200, { ok: true, result });
    }
    return send(response, 404, { error: 'Rota não encontrada.' });
  } catch (error) {
    audit(request.url || 'unknown', '', false, error instanceof Error ? error.message : 'Falha desconhecida.'); return send(response, 400, { error: error instanceof Error ? error.message : 'Falha desconhecida.' });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Nexo Core ativo em http://127.0.0.1:${PORT}`); console.log(`Área permitida: ${WORKSPACE}`);
  console.log('Proteções: loopback, token, contratos, aprovação, executor restrito, SSRF guard, checkpoints e auditoria.');
});

function shutdown() { server.close(() => { core.close(); process.exit(0); }); }
process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
