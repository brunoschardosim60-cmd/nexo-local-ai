import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, resolve, sep } from 'node:path';
import { defineTool } from '../tools/contracts.mjs';
import { RISK } from '../safety/policies.mjs';

function safePath(workspace, value) {
  const output = resolve(workspace, value);
  if (output !== workspace && !output.startsWith(`${workspace}${sep}`)) throw new Error('Arquivo de saída fora da área permitida.');
  return output;
}

function browserCandidates() {
  return [process.env.NEXO_BROWSER_PATH,
    process.platform === 'win32' && `${process.env['PROGRAMFILES(X86)'] || ''}\\Microsoft\\Edge\\Application\\msedge.exe`,
    process.platform === 'win32' && `${process.env.PROGRAMFILES || ''}\\Google\\Chrome\\Application\\chrome.exe`,
    process.platform === 'win32' && `${process.env.LOCALAPPDATA || ''}\\Microsoft\\Edge\\Application\\msedge.exe`,
    process.platform === 'darwin' && '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    process.platform === 'linux' && '/usr/bin/google-chrome', process.platform === 'linux' && '/usr/bin/chromium',
  ].filter(Boolean);
}

function findBrowser() { return browserCandidates().find(candidate => existsSync(candidate)) || null; }

function pngSize(bytes) {
  if (bytes.length < 24 || bytes.subarray(1, 4).toString('ascii') !== 'PNG') throw new Error('O arquivo não é um PNG válido.');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

export function createBrowserAgent({ workspace, database, research, browserPath = findBrowser() }) {
  async function openPage({ url, sessionId = null }) {
    const page = await research.fetchPage(url, { allowLocalhost: true, maxBytes: 2_000_000 });
    const previous = sessionId ? database.getBrowserSession(sessionId) : null;
    const session = database.putBrowserSession({
      id: previous?.id, currentUrl: page.url, title: page.title,
      history: [...(previous?.history || []), { url: page.url, title: page.title, visitedAt: new Date().toISOString() }].slice(-50),
      snapshot: { excerpt: page.excerpt, textLength: page.text.length, links: page.links },
    });
    return { sessionId: session.id, url: page.url, title: page.title, excerpt: page.excerpt, textLength: page.text.length, links: page.links };
  }

  async function follow({ sessionId, linkIndex }) {
    const session = database.getBrowserSession(sessionId); if (!session) throw new Error('Sessão de navegador não encontrada.');
    const link = session.snapshot.links?.[linkIndex]; if (!link) throw new Error('Link não encontrado na página atual.');
    return openPage({ url: link.url, sessionId });
  }

  async function screenshot({ url, path = `artifacts/previews/nexo-${Date.now()}.png`, width = 1440, height = 900 }) {
    if (!browserPath) throw new Error('Chrome ou Edge headless não foi encontrado. Defina NEXO_BROWSER_PATH.');
    await research.fetchPage(url, { allowLocalhost: true, maxBytes: 100_000 });
    const output = safePath(workspace, path); await mkdir(dirname(output), { recursive: true });
    const args = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--disable-extensions', `--window-size=${width},${height}`, `--screenshot=${output}`, url];
    await new Promise((resolvePromise, reject) => {
      const child = spawn(browserPath, args, { shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] }); let stderr = '';
      const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Tempo limite da captura atingido.')); }, 30_000);
      child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-4_000); }); child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', code => { clearTimeout(timer); code === 0 ? resolvePromise() : reject(new Error(stderr || `Navegador terminou com código ${code}.`)); });
    });
    const bytes = await readFile(output); const dimensions = pngSize(bytes); const info = await stat(output);
    return { url, path: output.slice(workspace.length + 1), fileName: basename(output), bytes: info.size, ...dimensions, capturedAt: new Date().toISOString() };
  }

  async function inspectScreenshot({ path, expectedWidth = null, expectedHeight = null, minimumBytes = 2_000 }) {
    const target = safePath(workspace, path); const bytes = await readFile(target); const dimensions = pngSize(bytes); const checks = [
      { name: 'png-readable', passed: true, detail: 'Assinatura PNG e cabeçalho válidos.' },
      { name: 'minimum-bytes', passed: bytes.length >= minimumBytes, detail: `${bytes.length} bytes; mínimo ${minimumBytes}.` },
    ];
    if (expectedWidth != null) checks.push({ name: 'expected-width', passed: dimensions.width === expectedWidth, detail: `${dimensions.width}px; esperado ${expectedWidth}px.` });
    if (expectedHeight != null) checks.push({ name: 'expected-height', passed: dimensions.height === expectedHeight, detail: `${dimensions.height}px; esperado ${expectedHeight}px.` });
    return { path, ...dimensions, bytes: bytes.length, valid: checks.every(check => check.passed), checks, inspectedAt: new Date().toISOString(), limitation: 'Verificação estrutural. Análise visual semântica exige um modelo local com visão.' };
  }

  const definitions = [
    defineTool({
      name: 'browser.open', description: 'Abre uma página HTTP(S) em uma sessão persistente e extrai conteúdo e links sem executar scripts.', risk: RISK.NETWORK,
      inputSchema: { type: 'object', required: ['url'], additionalProperties: false, properties: { url: { type: 'string', minLength: 8, maxLength: 2000 }, sessionId: { type: 'string', maxLength: 100 } } }, execute: openPage,
    }),
    defineTool({
      name: 'browser.follow', description: 'Segue um link observado na sessão atual do navegador seguro.', risk: RISK.NETWORK,
      inputSchema: { type: 'object', required: ['sessionId', 'linkIndex'], additionalProperties: false, properties: { sessionId: { type: 'string', minLength: 10, maxLength: 100 }, linkIndex: { type: 'integer', minimum: 0, maximum: 59 } } }, execute: follow,
    }),
    defineTool({
      name: 'browser.screenshot', description: 'Captura uma página com Chrome/Edge headless em um PNG dentro do workspace.', risk: RISK.EXECUTE,
      inputSchema: { type: 'object', required: ['url'], additionalProperties: false, properties: { url: { type: 'string', minLength: 8, maxLength: 2000 }, path: { type: 'string', maxLength: 500 }, width: { type: 'integer', minimum: 320, maximum: 3840, default: 1440 }, height: { type: 'integer', minimum: 320, maximum: 2160, default: 900 } } }, execute: screenshot,
    }),
    defineTool({
      name: 'visual.verify', description: 'Valida integridade, dimensões e peso de um screenshot PNG local.', risk: RISK.READ,
      inputSchema: { type: 'object', required: ['path'], additionalProperties: false, properties: { path: { type: 'string', minLength: 5, maxLength: 500 }, expectedWidth: { type: 'integer', minimum: 1, maximum: 10000 }, expectedHeight: { type: 'integer', minimum: 1, maximum: 10000 }, minimumBytes: { type: 'integer', minimum: 100, maximum: 10_000_000, default: 2000 } } }, execute: inspectScreenshot,
    }),
  ];

  return { definitions, openPage, follow, screenshot, inspectScreenshot, sessions: limit => database.listBrowserSessions(limit), health: () => ({ available: true, engine: browserPath ? basename(browserPath) : null, screenshots: Boolean(browserPath), persistentSessions: true }) };
}

export { findBrowser, pngSize };
