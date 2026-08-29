import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';

const PORT = 7331;
const ALLOWED_ORIGIN = 'http://localhost:3000';
const WORKSPACE = resolve(process.env.NEXO_WORKSPACE || '..');
const SESSION_TOKEN = randomBytes(32).toString('hex');
const MAX_BODY = 2_000_000;
const RATE_LIMIT = 60;
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.csv', '.js', '.jsx', '.ts', '.tsx', '.py', '.html',
  '.css', '.scss', '.xml', '.yaml', '.yml', '.toml', '.ini', '.env', '.sql', '.sh', '.ps1',
]);
const rateWindow = { startedAt: Date.now(), requests: 0 };
const auditLog = [];

function safePath(input = '.') {
  const target = resolve(WORKSPACE, input);
  if (target !== WORKSPACE && !target.startsWith(`${WORKSPACE}${sep}`)) throw new Error('Caminho fora da área permitida.');
  return target;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type, X-Nexo-Token',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

function send(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() });
  response.end(JSON.stringify(data));
}

function verifyOrigin(request) {
  const origin = request.headers.origin;
  if (origin && origin !== ALLOWED_ORIGIN) throw new Error('Origem não autorizada.');
}

function verifySession(request) {
  verifyOrigin(request);
  if (request.headers['x-nexo-token'] !== SESSION_TOKEN) throw new Error('Sessão local não autorizada.');
  const now = Date.now();
  if (now - rateWindow.startedAt >= 60_000) { rateWindow.startedAt = now; rateWindow.requests = 0; }
  rateWindow.requests += 1;
  if (rateWindow.requests > RATE_LIMIT) throw new Error('Limite de ações por minuto atingido.');
}

function audit(action, target, success, detail = '') {
  auditLog.unshift({ at: new Date().toISOString(), action, target, success, detail });
  auditLog.splice(100);
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > MAX_BODY) throw new Error('Conteúdo muito grande.');
  }
  return body ? JSON.parse(body) : {};
}

async function listFiles(input) {
  const target = safePath(input.path || '.');
  const entries = await readdir(target, { withFileTypes: true });
  return Promise.all(entries.slice(0, 200).map(async entry => {
    const absolute = join(target, entry.name);
    const info = entry.isFile() ? await stat(absolute) : null;
    return { name: entry.name, path: relative(WORKSPACE, absolute), type: entry.isDirectory() ? 'folder' : 'file', size: info?.size ?? null };
  }));
}

async function readText(input) {
  const target = safePath(input.path);
  const info = await stat(target);
  if (!info.isFile() || info.size > 1_000_000) throw new Error('Arquivo inválido ou maior que 1 MB.');
  if (!TEXT_EXTENSIONS.has(extname(target).toLowerCase())) throw new Error('Somente arquivos de texto e código podem ser lidos.');
  return { path: relative(WORKSPACE, target), content: await readFile(target, 'utf8') };
}

async function writeText(input) {
  if (input.confirmation !== 'APPROVED') throw new Error('Aprovação obrigatória.');
  if (typeof input.content !== 'string' || input.content.length > 1_000_000) throw new Error('Conteúdo inválido ou muito grande.');
  const target = safePath(input.path);
  if (!TEXT_EXTENSIONS.has(extname(target).toLowerCase())) throw new Error('Extensão não permitida para escrita.');
  await mkdir(dirname(target), { recursive: true });
  let backupCreated = false;
  try {
    const info = await stat(target);
    if (info.isFile()) {
      const backup = safePath(join('.nexo-backups', String(Date.now()), relative(WORKSPACE, target)));
      await mkdir(dirname(backup), { recursive: true });
      await copyFile(target, backup);
      backupCreated = true;
    }
  } catch { /* arquivo novo */ }
  await writeFile(target, input.content, 'utf8');
  return { path: relative(WORKSPACE, target), bytes: Buffer.byteLength(input.content), backupCreated };
}

async function createFolder(input) {
  if (input.confirmation !== 'APPROVED') throw new Error('Aprovação obrigatória.');
  const target = safePath(input.path);
  await mkdir(target, { recursive: true });
  return { path: relative(WORKSPACE, target) };
}

function projectFiles(template) {
  if (template === 'static-site') return {
    'index.html': '<!doctype html>\n<html lang="pt-BR">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Novo site</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <main>\n    <p class="eyebrow">CRIADO PELO NEXO</p>\n    <h1>Seu novo site está pronto.</h1>\n    <p>Edite este projeto com o agente local.</p>\n    <button id="action">Começar</button>\n  </main>\n  <script src="app.js"></script>\n</body>\n</html>\n',
    'style.css': ':root{font-family:Inter,system-ui;color:#18181b;background:#f5f3ff}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center}main{width:min(680px,90vw);padding:56px;border:1px solid #ddd6fe;border-radius:28px;background:#fff;box-shadow:0 30px 80px #4c1d9520}h1{font-size:clamp(2.5rem,8vw,5rem);line-height:.95;letter-spacing:-.06em;margin:.3em 0}.eyebrow{font-size:.75rem;letter-spacing:.18em;color:#7c3aed}button{border:0;border-radius:12px;background:#7c3aed;color:white;padding:12px 20px;font-weight:700}\n',
    'app.js': "document.querySelector('#action').addEventListener('click',()=>alert('Projeto funcionando!'));\n",
    'README.md': '# Site estático\n\nAbra `index.html` no navegador ou use um servidor local.\n',
  };
  if (template === 'node-api') return {
    'package.json': '{"name":"nexo-node-api","private":true,"type":"module","scripts":{"start":"node server.js"}}\n',
    'server.js': "import { createServer } from 'node:http';\nconst port=8080;\ncreateServer((req,res)=>{\n  res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'http://localhost:3000'});\n  res.end(JSON.stringify({ok:true,message:'API local criada pelo Nexo'}));\n}).listen(port,'127.0.0.1',()=>console.log(`API em http://127.0.0.1:${port}`));\n",
    'README.md': '# API Node local\n\nExecute `npm start`. O servidor fica restrito a `127.0.0.1:8080`.\n',
  };
  if (template === 'python-api') return {
    'server.py': "from http.server import BaseHTTPRequestHandler, HTTPServer\nimport json\n\nclass Handler(BaseHTTPRequestHandler):\n    def do_GET(self):\n        body = json.dumps({'ok': True, 'message': 'API Python local criada pelo Nexo'}).encode()\n        self.send_response(200)\n        self.send_header('Content-Type', 'application/json')\n        self.send_header('Content-Length', str(len(body)))\n        self.end_headers()\n        self.wfile.write(body)\n\nHTTPServer(('127.0.0.1', 8080), Handler).serve_forever()\n",
    'README.md': '# API Python local\n\nExecute `python server.py`. O servidor fica restrito a `127.0.0.1:8080`.\n',
  };
  if (template === 'ai-service') return {
    'package.json': '{"name":"nexo-ai-service","private":true,"type":"module","scripts":{"start":"node server.js"}}\n',
    'server.js': "import { createServer } from 'node:http';\nconst port=8081;\ncreateServer(async(req,res)=>{\n  if(req.method!=='POST'){res.writeHead(405);return res.end();}\n  let body='';for await(const chunk of req)body+=chunk;\n  const input=JSON.parse(body||'{}');\n  const upstream=await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'qwen2.5-coder:7b-instruct-q3_K_S',stream:false,messages:[{role:'user',content:String(input.prompt||'')} ]})});\n  const data=await upstream.text();res.writeHead(upstream.status,{'Content-Type':'application/json'});res.end(data);\n}).listen(port,'127.0.0.1',()=>console.log(`IA local em http://127.0.0.1:${port}`));\n",
    'README.md': '# Serviço de IA local\n\nExecute `npm start` com o Ollama aberto. Envie POST JSON para `http://127.0.0.1:8081` no formato `{"prompt":"Olá"}`.\n',
  };
  throw new Error('Modelo de projeto não permitido.');
}

async function createProject(input) {
  if (input.confirmation !== 'APPROVED') throw new Error('Aprovação obrigatória.');
  const target = safePath(input.path);
  try { await stat(target); throw new Error('A pasta do projeto já existe.'); } catch (error) {
    if (error instanceof Error && error.message === 'A pasta do projeto já existe.') throw error;
  }
  const files = projectFiles(input.template);
  await mkdir(target, { recursive: false });
  await Promise.all(Object.entries(files).map(async ([name, content]) => {
    const file = safePath(join(input.path, name));
    await writeFile(file, content, 'utf8');
  }));
  return { path: relative(WORKSPACE, target), template: input.template, files: Object.keys(files) };
}

function networkStatus() {
  const interfaces = Object.entries(networkInterfaces()).flatMap(([name, addresses]) => {
    if (!addresses?.some(address => !address.internal)) return [];
    return [{ name, vpn: /wireguard|tailscale|vpn|tun|tap|nord|proton|wg/i.test(name) }];
  });
  return { interfaces, vpnDetected: interfaces.some(item => item.vpn) };
}

createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    try { verifyOrigin(request); return send(response, 204, {}); } catch { return send(response, 403, { error: 'Origem não autorizada.' }); }
  }
  try {
    const url = new URL(request.url || '/', `http://localhost:${PORT}`);
    if (request.method === 'GET' && url.pathname === '/health') {
      verifyOrigin(request);
      return send(response, 200, {
        ok: true, workspace: WORKSPACE, sessionToken: SESSION_TOKEN,
        permissions: ['list', 'read', 'write-with-approval', 'mkdir-with-approval', 'project-with-approval'],
        security: { loopbackOnly: true, authenticatedSession: true, rateLimitPerMinute: RATE_LIMIT, auditEntries: auditLog.length },
        network: networkStatus(),
      });
    }
    verifySession(request);
    if (request.method === 'GET' && url.pathname === '/audit') return send(response, 200, { ok: true, entries: auditLog.slice(0, 30) });
    if (request.method !== 'POST') return send(response, 404, { error: 'Rota não encontrada.' });
    const input = await readBody(request);
    let action = '';
    let result;
    if (url.pathname === '/files/list') { action = 'list_files'; result = await listFiles(input); }
    else if (url.pathname === '/files/read') { action = 'read_file'; result = await readText(input); }
    else if (url.pathname === '/files/write') { action = 'write_file'; result = await writeText(input); }
    else if (url.pathname === '/folders/create') { action = 'create_folder'; result = await createFolder(input); }
    else if (url.pathname === '/projects/create') { action = 'create_project'; result = await createProject(input); }
    else return send(response, 404, { error: 'Rota não encontrada.' });
    audit(action, input.path || '.', true);
    return send(response, 200, { ok: true, result });
  } catch (error) {
    audit(request.url || 'unknown', '', false, error instanceof Error ? error.message : 'Falha desconhecida.');
    return send(response, 400, { error: error instanceof Error ? error.message : 'Falha desconhecida.' });
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Nexo Local Agent ativo em http://127.0.0.1:${PORT}`);
  console.log(`Área permitida: ${WORKSPACE}`);
  console.log('Proteções: loopback, token de sessão, aprovação, rate limit, backup e auditoria.');
});
