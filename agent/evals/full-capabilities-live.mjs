import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve, sep } from 'node:path';

const baseUrl = process.env.NEXO_URL || 'http://127.0.0.1:7331';
const startedAt = Date.now();
const results = [];
const only = new Set(String(process.env.NEXO_LIVE_ONLY || '').split(',').map(item => item.trim()).filter(Boolean));

function record(category, name, status, evidence = '', details = {}) {
  const item = { category, name, status, evidence: String(evidence).slice(0, 1_200), ...details };
  results.push(item);
  console.log(JSON.stringify({ event: 'case', ...item }));
  return item;
}

function passIf(category, name, condition, evidence, details = {}) {
  return record(category, name, condition ? 'PASS' : 'FAIL', evidence, details);
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json();
  if (!response.ok) throw new Error(`${path} respondeu ${response.status}: ${body.error || JSON.stringify(body)}`);
  return body;
}

const healthResponse = await fetch(`${baseUrl}/health`);
if (!healthResponse.ok) throw new Error(`Nexo indisponível: ${healthResponse.status}`);
const health = await healthResponse.json();
const token = health.sessionToken;
const headers = { 'Content-Type': 'application/json', 'X-Nexo-Token': token };
const profile = {
  name: 'Bruno',
  city: 'São Paulo',
  style: 'natural',
  instructions: 'Seja extrovertido, útil, curioso e honesto sobre o que executou.',
  personalityLearning: false,
};

async function ask({ question, sessionId, history = [], mode = 'Geral', effort = 'Baixo', documents = [], attachments = [], webSearch = false, weather = null }) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ question, sessionId, mode, effort, profile, history, documents, attachments, webSearch, weather, imageQuality: 'FAST' }),
  });
  if (!response.ok) throw new Error(`/chat respondeu ${response.status}: ${await response.text()}`);
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = await response.json();
    return { ...body, firstTokenMs: performance.now() - started, totalMs: performance.now() - started };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let streamBuffer = '';
  let firstTokenMs = null;
  const events = [];
  const consume = (line) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    events.push(event);
    if (event.type === 'token' && firstTokenMs === null) firstTokenMs = performance.now() - started;
  };
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    streamBuffer += decoder.decode(value, { stream: true });
    const lines = streamBuffer.split('\n');
    streamBuffer = lines.pop() || '';
    for (const line of lines) consume(line);
  }
  consume(streamBuffer);
  const failure = events.findLast((event) => event.type === 'error');
  if (failure) throw new Error(failure.error || 'O stream do Nexo falhou.');
  const done = events.findLast((event) => event.type === 'done');
  const content = done?.content || events.filter((event) => event.type === 'token').map((event) => event.content || '').join('');
  return { ok: true, kind: 'model', route: done?.route, model: done?.model, content, events, firstTokenMs: firstTokenMs ?? performance.now() - started, totalMs: performance.now() - started };
}

async function conversationScenario() {
  const sessionId = `full-live-conversation-${Date.now()}`;
  const history = [];
  const turns = [];
  const questions = [
    'iaiii Nexo, meu nome é Bruno',
    'qual é meu nome?',
    'e o seu?',
    'posso te chamar de P1?',
    'então qual é seu nome?',
    'oq podemos fazer juntos?',
  ];
  for (const question of questions) {
    const answer = await ask({ question, sessionId, history });
    turns.push({ question, answer: answer.content, firstTokenMs: Math.round(answer.firstTokenMs), totalMs: Math.round(answer.totalMs), model: answer.model });
    history.push({ role: 'user', content: question }, { role: 'assistant', content: answer.content });
  }
  passIf('basic', 'casual greeting', !/como posso ajudar hoje/i.test(turns[0].answer) && turns[0].answer.length < 260, turns[0].answer, turns[0]);
  passIf('basic', 'user name continuity', /bruno/i.test(turns[1].answer), turns[1].answer, turns[1]);
  passIf('basic', 'assistant identity', /nexo/i.test(turns[2].answer), turns[2].answer, turns[2]);
  passIf('basic', 'nickname retention', /nexo/i.test(turns[4].answer) && /p1/i.test(turns[4].answer), turns[4].answer, turns[4]);
  passIf('basic', 'informal intent understanding', !/não entend|explique|mais contexto/i.test(turns[5].answer), turns[5].answer, turns[5]);
}

async function instantScenario() {
  const sessionId = `full-live-instant-${Date.now()}`;
  const clock = await ask({ question: 'que horas são?', sessionId });
  passIf('basic', 'local time fast path', /\b\d{1,2}:\d{2}\b/.test(clock.content) && clock.totalMs < 1_000, clock.content, { totalMs: Math.round(clock.totalMs), model: clock.model });
  const weather = await ask({ question: 'qual o clima agora?', sessionId, weather: { label: 'São Paulo', temperature: 23, description: 'céu limpo' } });
  passIf('basic', 'weather fast path', /23.?°?C|23 graus/i.test(weather.content) && /são paulo/i.test(weather.content), weather.content, { totalMs: Math.round(weather.totalMs), model: weather.model });
}

async function longTermMemoryScenario() {
  const marker = `NEBULA-${String(Date.now()).slice(-6)}`;
  const remember = await ask({ question: `Lembre que o código temporário desta avaliação é ${marker}.`, sessionId: `memory-write-${Date.now()}` });
  const recall = await ask({ question: 'Qual é o código temporário desta avaliação?', sessionId: `memory-read-${Date.now()}`, effort: 'Médio' });
  passIf('memory', 'explicit memory write', remember.route === 'memory' && Boolean(remember.memoryId), remember.content, { model: remember.model });
  passIf('memory', 'cross-session semantic recall', recall.content.includes(marker), recall.content, { totalMs: Math.round(recall.totalMs), model: recall.model });
  if (remember.memoryId) {
    const cleanup = await fetchJson(`/agent/memory/${remember.memoryId}`, { method: 'POST', headers, body: JSON.stringify({ action: 'delete', confirmation: 'DELETE' }) });
    record('memory', 'test memory cleanup', cleanup.deleted ? 'PASS' : 'FAIL', `memoryId ${remember.memoryId}`);
  }
}

async function documentAndSheetScenario() {
  const documentAnswer = await ask({
    question: 'Leia o documento e me diga o nome do projeto, a data limite e as duas prioridades.',
    sessionId: `document-${Date.now()}`,
    effort: 'Médio',
    documents: [{ name: 'brief-orquidea.txt', content: 'Projeto Orquídea. Data limite: 18 de setembro de 2026. Prioridades: corrigir autenticação e reduzir o tempo de carregamento.' }],
  });
  passIf('documents', 'grounded document Q&A', /orquídea/i.test(documentAnswer.content) && /18 de setembro/i.test(documentAnswer.content) && /autentica/i.test(documentAnswer.content) && /carregamento/i.test(documentAnswer.content), documentAnswer.content, { totalMs: Math.round(documentAnswer.totalMs), model: documentAnswer.model });

  const sheet = await ask({
    question: 'Crie uma planilha CSV com as colunas Produto, Quantidade e Preço. Dados: Teclado, quantidade 2, preço 150; Mouse, quantidade 3, preço 80; Monitor, quantidade 1, preço 900.',
    sessionId: `sheet-${Date.now()}`,
    mode: 'Planilhas',
    effort: 'Médio',
  });
  const lines = sheet.content.trim().split(/\r?\n/).filter(Boolean);
  passIf('spreadsheets', 'valid semicolon CSV', lines.length >= 4 && lines.every((line) => line.includes(';')) && /teclado/i.test(sheet.content) && /monitor/i.test(sheet.content) && !/```/.test(sheet.content), sheet.content, { totalMs: Math.round(sheet.totalMs), model: sheet.model });
}

async function codingScenario() {
  const code = await ask({
    question: 'Crie uma função TypeScript parsePort(value: unknown): number que aceite apenas inteiros entre 1 e 65535. Inclua testes Vitest para valores válidos, texto, decimal, zero e 65536.',
    sessionId: `coding-${Date.now()}`,
    mode: 'Programar',
    effort: 'Alto',
  });
  passIf('coding', 'advanced code generation', /parsePort/.test(code.content) && /65535/.test(code.content) && /vitest|describe\s*\(/i.test(code.content) && /```/.test(code.content), code.content, { totalMs: Math.round(code.totalMs), firstTokenMs: Math.round(code.firstTokenMs), model: code.model });
}

async function researchScenario() {
  const research = await ask({
    question: 'Pesquise em fontes públicas o que é WebAssembly e dê dois usos práticos, citando as fontes com links.',
    sessionId: `research-${Date.now()}`,
    effort: 'Médio',
    webSearch: true,
  });
  const links = [...research.content.matchAll(/https?:\/\/[^\s)]+/g)].map(match => match[0]);
  passIf('research', 'live multi-source research', /webassembly/i.test(research.content) && links.length >= 2 && links.every(link => /webassembly|stackoverflow|doi\.org|openalex/i.test(link)) && !/criado pela google|baseado no javascript/i.test(research.content), research.content, { totalMs: Math.round(research.totalMs), model: research.model });
}

async function visionScenario() {
  const imagePath = process.env.NEXO_TEST_IMAGE;
  if (!imagePath) return record('vision', 'real image understanding', 'SKIP', 'Defina NEXO_TEST_IMAGE para anexar uma imagem real.');
  const absolute = resolve(imagePath);
  const bytes = await readFile(absolute);
  const extension = extname(absolute).toLowerCase();
  const mimeType = extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : 'image/png';
  const answer = await ask({
    question: 'Analise esta imagem com cuidado. Descreva o elemento principal, as cores e a textura. Não invente texto que não esteja visível.',
    sessionId: `vision-${Date.now()}`,
    effort: 'Médio',
    attachments: [{ type: 'image', name: basename(absolute), mimeType, dataUrl: `data:${mimeType};base64,${bytes.toString('base64')}` }],
  });
  passIf('vision', 'real image understanding', /(olho|íris|pupila)/i.test(answer.content) && /(azul|ciano|escuro)/i.test(answer.content), answer.content, { totalMs: Math.round(answer.totalMs), model: answer.model });
}

async function imageGenerationScenario() {
  const answer = await ask({
    question: 'Gere uma imagem quadrada de um pequeno farol bioluminescente no fundo do oceano, sem texto.',
    sessionId: `image-${Date.now()}`,
    mode: 'Imagens',
    effort: 'Baixo',
  });
  if (answer.kind === 'unavailable') {
    return record('image', 'real raster generation', 'UNAVAILABLE', answer.content, { providerAvailable: answer.availability?.available ?? false });
  }
  if (answer.kind !== 'media' || !answer.job?.id) return record('image', 'real raster generation', 'FAIL', JSON.stringify(answer));
  let job = answer.job;
  for (let attempt = 0; attempt < 45 && !['completed', 'failed', 'cancelled'].includes(job.status); attempt += 1) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000));
    job = (await fetchJson(`/agent/media/jobs/${job.id}`, { headers })).job;
  }
  if (job.status !== 'completed' || !job.artifactId) return record('image', 'real raster generation', 'FAIL', job.error || `job ${job.status}`, { jobId: job.id });
  const artifact = (await fetchJson('/agent/artifacts?limit=100', { headers })).artifacts.find((item) => item.id === job.artifactId);
  const content = await fetch(`${baseUrl}/agent/artifacts/${job.artifactId}/content?token=${encodeURIComponent(token)}`);
  const bytes = new Uint8Array(await content.arrayBuffer());
  passIf('image', 'real raster generation', content.ok && (content.headers.get('content-type') || '').startsWith('image/') && bytes.byteLength > 1_000, `${artifact?.provider || 'provider'} · ${content.headers.get('content-type')} · ${bytes.byteLength} bytes`, { artifactId: job.artifactId, jobId: job.id });
}

function permissionIsScoped(permission, sandboxName) {
  const input = permission?.input || {};
  const serialized = JSON.stringify(input).toLowerCase();
  if (permission.tool?.startsWith('filesystem.') || permission.tool?.startsWith('git.') || permission.tool === 'shell.run' || permission.tool === 'code.validate') {
    return serialized.includes(sandboxName.toLowerCase());
  }
  return permission.risk === 'read';
}

async function agentScenario() {
  const workspace = resolve(health.workspace);
  const sandbox = await mkdtemp(join(workspace, 'nexo-live-eval-'));
  if (!(sandbox === workspace || sandbox.startsWith(`${workspace}${sep}`))) throw new Error('Sandbox de avaliação fora do workspace.');
  const sandboxName = basename(sandbox);
  try {
    await mkdir(join(sandbox, 'src'), { recursive: true });
    await mkdir(join(sandbox, 'test'), { recursive: true });
    await writeFile(join(sandbox, 'package.json'), JSON.stringify({ name: sandboxName, private: true, type: 'module', scripts: { test: 'node --test' } }, null, 2));
    await writeFile(join(sandbox, 'src', 'math.js'), 'export function sum(a, b) { return a - b; }\n');
    await writeFile(join(sandbox, 'test', 'math.test.js'), "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { sum } from '../src/math.js';\ntest('sum', () => assert.equal(sum(2, 3), 5));\n");
    const objective = `Trabalhe exclusivamente no diretório ${sandboxName}. Encontre e corrija o bug que faz npm test falhar, rode os testes e comprove o resultado. Não altere nenhum arquivo fora de ${sandboxName}.`;
    const response = await ask({ question: objective, sessionId: `agent-${Date.now()}`, mode: 'Agente', effort: 'Médio' });
    if (response.kind !== 'task' || !response.task?.id) return record('agent', 'autonomous coding loop', 'FAIL', JSON.stringify(response));
    let task = response.task;
    for (let attempt = 0; attempt < 90 && !['completed', 'completed_with_warnings', 'failed', 'cancelled'].includes(task.status); attempt += 1) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 4_000));
      task = (await fetchJson(`/agent/tasks/${task.id}`, { headers })).task;
      if (task.status === 'awaiting_approval') {
        const pending = (task.permissions || []).find((item) => item.status === 'pending');
        if (!pending) continue;
        const safe = permissionIsScoped(pending, sandboxName);
        task = (await fetchJson(`/agent/tasks/${task.id}/permissions/${pending.id}`, { method: 'POST', headers, body: JSON.stringify({ decision: safe ? 'approved' : 'denied' }) })).task;
        if (!safe) {
          record('agent', 'permission boundary', 'FAIL', `Ação fora do sandbox recusada: ${pending.tool} ${JSON.stringify(pending.input)}`);
          break;
        }
      }
    }
    if (!['completed', 'completed_with_warnings', 'failed', 'cancelled'].includes(task.status)) {
      task = (await fetchJson(`/agent/tasks/${task.id}/control`, { method: 'POST', headers, body: JSON.stringify({ action: 'cancel' }) })).task;
      record('agent', 'bounded execution', 'FAIL', 'Tarefa cancelada após exceder seis minutos.', { taskId: task.id });
    }
    const source = await readFile(join(sandbox, 'src', 'math.js'), 'utf8');
    const { spawnSync } = await import('node:child_process');
    const validation = spawnSync(process.execPath, ['--test'], { cwd: sandbox, encoding: 'utf8', timeout: 30_000 });
    const toolRuns = task.toolRuns || [];
    passIf('agent', 'autonomous coding loop', validation.status === 0 && /a\s*\+\s*b/.test(source) && ['completed', 'completed_with_warnings'].includes(task.status), `status=${task.status}; exit=${validation.status}; ${task.result?.summary || task.error || ''}`, { taskId: task.id, tools: toolRuns.map((item) => item.tool), completionState: task.result?.completionState || null });
    passIf('agent', 'real tool execution evidence', toolRuns.some((item) => item.status === 'completed') && toolRuns.some((item) => /filesystem|code\.validate|shell/.test(item.tool)), JSON.stringify(toolRuns.map((item) => ({ tool: item.tool, status: item.status }))));
  } finally {
    const resolvedSandbox = resolve(sandbox);
    if (resolvedSandbox.startsWith(`${workspace}${sep}`) && basename(resolvedSandbox).startsWith('nexo-live-eval-')) await rm(resolvedSandbox, { recursive: true, force: true });
  }
}

async function capabilityStateScenario() {
  const providers = await fetchJson('/agent/multimodal/providers', { headers });
  const agentHealth = health.agent?.capabilities || {};
  passIf('system', 'tool registry', Number(health.agent?.tools?.length || 0) >= 50, `${health.agent?.tools?.length || 0} tools registradas`);
  passIf('system', 'browser automation installed', agentHealth.browser?.automation?.available === true || agentHealth.browser?.available === true, JSON.stringify(agentHealth.browser || {}));
  record('voice', 'realtime voice provider', providers.availability?.audio?.stt?.available || providers.availability?.audio?.tts?.available ? 'PASS' : 'CONDITIONAL', JSON.stringify(providers.availability?.audio || {}));
  record('video', 'video generation', providers.availability?.video?.available ? 'PASS' : 'UNAVAILABLE', JSON.stringify(providers.availability?.video || {}));
  record('mcp', 'configured MCP servers', Number(agentHealth.mcp?.configured || 0) > 0 ? 'PASS' : 'UNAVAILABLE', JSON.stringify(agentHealth.mcp || {}));
}

async function runScenario(name, action) {
  if (only.size && !only.has(name)) return;
  try {
    await action();
  } catch (error) {
    record(name, `${name} scenario completed`, 'FAIL', error instanceof Error ? error.message : String(error));
  }
}

await runScenario('system', capabilityStateScenario);
await runScenario('basic', instantScenario);
await runScenario('conversation', conversationScenario);
await runScenario('memory', longTermMemoryScenario);
await runScenario('documents', documentAndSheetScenario);
await runScenario('coding', codingScenario);
await runScenario('research', researchScenario);
await runScenario('vision', visionScenario);
await runScenario('image', imageGenerationScenario);
if (process.env.NEXO_SKIP_AGENT !== '1') await runScenario('agent', agentScenario);

const counts = results.reduce((accumulator, item) => ({ ...accumulator, [item.status]: (accumulator[item.status] || 0) + 1 }), {});
const report = {
  suite: 'Nexo full live capability audit',
  durationMs: Date.now() - startedAt,
  counts,
  passed: (counts.FAIL || 0) === 0,
  results,
};
console.log(JSON.stringify({ event: 'summary', ...report }, null, 2));
if (counts.FAIL) process.exitCode = 1;
