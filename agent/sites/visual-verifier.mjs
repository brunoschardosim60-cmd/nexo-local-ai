import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';
import { defineTool } from '../tools/contracts.mjs';
import { RISK } from '../safety/policies.mjs';

const VIEWPORTS = Object.freeze({ desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } });
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

async function staticServer(root) {
  const base = resolve(root);
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
      const requested = resolve(base, `.${normalize(pathname === '/' ? '/index.html' : pathname)}`);
      if (requested !== base && !requested.startsWith(`${base}${sep}`)) throw new Error('Path inválido.');
      const file = (await stat(requested)).isDirectory() ? join(requested, 'index.html') : requested;
      const body = await readFile(file); response.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' }); response.end(body);
    } catch { response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); response.end('Not found'); }
  });
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  const address = server.address();
  return { url: `http://127.0.0.1:${address.port}/`, close: () => new Promise(resolveClose => server.close(resolveClose)) };
}

function combine(reports) {
  const structuralProblems = reports.flatMap(report => {
    const diagnostics = report.observation.layoutDiagnostics || {};
    return [
      ...(diagnostics.horizontalOverflow ? [`${report.viewport}: overflow horizontal de ${diagnostics.documentWidth - diagnostics.viewportWidth}px.`] : []),
      ...(diagnostics.overlaps || []).slice(0, 8).map(item => `${report.viewport}: possível sobreposição entre ${item.first} e ${item.second}.`),
      ...report.observation.console.filter(item => ['error', 'pageerror'].includes(item.type) && !/^Failed to load resource/i.test(item.text)).map(item => `${report.viewport}: console ${item.text}`),
      ...report.observation.network.filter(item => item.status >= 400 && !/favicon/i.test(item.url)).map(item => `${report.viewport}: HTTP ${item.status} em ${item.url}`),
    ];
  });
  const modelProblems = reports.flatMap(report => (report.evaluation?.result?.problems || []).map(item => `${report.viewport}: ${item}`));
  const verdicts = reports.map(report => report.evaluation?.result?.verdict || 'UNCERTAIN');
  const verdict = structuralProblems.length || verdicts.includes('FAIL') ? 'FAIL' : verdicts.includes('UNCERTAIN') ? 'UNCERTAIN' : 'PASS';
  const feedback = [...new Set([...structuralProblems, ...modelProblems])].slice(0, 20);
  return { verdict, passed: verdict === 'PASS', feedback, autoCorrection: verdict === 'PASS' ? { eligible: false } : { eligible: true, instruction: `Corrija somente problemas observados e repita build + verificação visual. ${feedback.join(' ')}`.slice(0, 4000) } };
}

export function createSiteVisualVerifier({ browser, vision, filesystem }) {
  async function verify(input, context = {}) {
    if (!input.url && !input.path) throw new Error('Informe url ou path do site estático.');
    let local = null; const sessions = [];
    try {
      if (input.path) local = await staticServer(filesystem.safePath(input.path));
      const url = input.url || local.url; const selected = input.viewports?.length ? input.viewports : ['desktop', 'mobile']; const reports = [];
      for (const viewport of selected) {
        if (context.signal?.aborted) throw new Error('Operação cancelada.');
        const dimensions = VIEWPORTS[viewport]; const opened = await browser.createSession({ url, ...dimensions, disposable: true }); sessions.push(opened.sessionId);
        const observation = await browser.observe({ sessionId: opened.sessionId });
        const shot = await browser.screenshot({ sessionId: opened.sessionId, path: `.nexo-artifacts/sites/${context.taskId || Date.now()}-${viewport}.png`, fullPage: Boolean(input.fullPage) }, context);
        const evaluation = await vision.evaluateGeneration({ path: shot.artifact.location }, input.objective || 'site profissional, responsivo, claro e acessível', ['hierarquia visual', 'contraste', 'tipografia', 'espaçamento', 'responsividade', 'elementos quebrados', 'sobreposição', 'consistência', 'qualidade do CTA']);
        reports.push({ viewport, dimensions, screenshot: { path: shot.path, artifactId: shot.artifact.id, bytes: shot.bytes }, observation: { url: observation.url, title: observation.title, interactive: observation.interactive.length, accessibility: observation.accessibility, console: observation.console, network: observation.network, layoutDiagnostics: observation.layoutDiagnostics }, evaluation });
      }
      return { url, source: input.path ? relative(filesystem.safePath('.'), filesystem.safePath(input.path)) : url, reports, ...combine(reports) };
    } finally {
      for (const sessionId of sessions) await browser.close({ sessionId }).catch(() => undefined);
      await local?.close().catch(() => undefined);
    }
  }
  const definitions = [defineTool({
    name: 'site.visual_verify', description: 'Abre um site real, captura desktop e mobile, inspeciona layout/console/rede e usa visão local para avaliar UX visual. Retorna feedback elegível para correção.', risk: RISK.EXECUTE,
    inputSchema: { type: 'object', additionalProperties: false, required: ['objective'], properties: { objective: { type: 'string', minLength: 5, maxLength: 4000 }, url: { type: 'string', minLength: 8, maxLength: 2000 }, path: { type: 'string', minLength: 1, maxLength: 1000 }, viewports: { type: 'array', minItems: 1, maxItems: 2, items: { type: 'string', enum: ['desktop', 'mobile'] } }, fullPage: { type: 'boolean' } } }, execute: verify,
  })];
  return { definitions, verify, health: () => ({ available: browser.health().available && vision.health().enabled, viewports: VIEWPORTS, semanticVision: true, structuralDiagnostics: true, autoCorrectionFeedback: true }) };
}
