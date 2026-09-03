import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { findBrowser } from '../browser/browser-agent.mjs';
import { createPlaywrightBrowserProvider } from '../browser/playwright-provider.mjs';
import { createDatabase } from '../memory/database.mjs';
import { createSiteVisualVerifier } from '../sites/visual-verifier.mjs';
import { createFilesystemTools } from '../tools/filesystem.mjs';
import { createProjectTools } from '../tools/project.mjs';

function fakeBrowser({ overflow = false } = {}) {
  let sequence = 0;
  return {
    health: () => ({ available: true }),
    async createSession() { sequence += 1; return { sessionId: `session-site-${sequence}` }; },
    async observe({ sessionId }) { return { sessionId, url: 'http://site.test', title: 'Site', interactive: [{ name: 'CTA' }], accessibility: 'main\n heading', console: [], network: [], layoutDiagnostics: { viewportWidth: 390, documentWidth: overflow ? 460 : 390, horizontalOverflow: overflow, overlaps: [] } }; },
    async screenshot({ sessionId, path }) { return { sessionId, path, bytes: 2048, artifact: { id: `artifact-${sessionId}`, location: `${path}.png` } }; },
    async close() {},
  };
}

const vision = { health: () => ({ enabled: true }), async evaluateGeneration() { return { result: { verdict: 'PASS', scores: { adherence: .9, composition: .9, artifacts: .9, text: .9 }, evidence: ['hierarquia clara'], problems: [] }, provider: 'fake-vision' }; } };

test('verificação visual combina desktop, mobile, visão e diagnóstico estrutural', async () => {
  const verifier = createSiteVisualVerifier({ browser: fakeBrowser(), vision, filesystem: { safePath: value => value } });
  const result = await verifier.verify({ url: 'http://site.test', objective: 'landing profissional' });
  assert.equal(result.verdict, 'PASS'); assert.deepEqual(result.reports.map(item => item.viewport), ['desktop', 'mobile']); assert.equal(result.autoCorrection.eligible, false);
  const failed = await createSiteVisualVerifier({ browser: fakeBrowser({ overflow: true }), vision, filesystem: { safePath: value => value } }).verify({ url: 'http://site.test', objective: 'landing responsiva' });
  assert.equal(failed.verdict, 'FAIL'); assert.equal(failed.autoCorrection.eligible, true); assert.match(failed.feedback.join(' '), /overflow horizontal/);
});

test('templates profissionais cobrem landing, produto e contato', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nexo-sites-')); const filesystem = createFilesystemTools(directory); const create = createProjectTools(filesystem)[0];
  try {
    for (const template of ['landing-page', 'product-page', 'contact-page']) {
      const output = await create.execute({ path: template, template }); assert.equal(output.files.length, 4);
      const html = await readFile(join(directory, template, 'index.html'), 'utf8'); const css = await readFile(join(directory, template, 'style.css'), 'utf8');
      assert.match(html, /<main>|<form/); assert.match(css, /@media\(max-width:760px\)/); assert.match(css, /:focus-visible/);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

const browserPath = findBrowser();
test('site.visual_verify abre pasta estática real em desktop e mobile', { skip: !browserPath, timeout: 30_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nexo-site-live-')); const filesystem = createFilesystemTools(directory); const database = createDatabase(join(directory, 'data'));
  const browser = createPlaywrightBrowserProvider({ workspace: directory, database, research: { fetchPage: async url => ({ url }) }, browserPath });
  try {
    await createProjectTools(filesystem)[0].execute({ path: 'landing', template: 'landing-page' });
    const result = await createSiteVisualVerifier({ browser, vision, filesystem }).verify({ path: 'landing', objective: 'landing profissional responsiva' }, { taskId: 'site-live-test' });
    assert.equal(result.verdict, 'PASS'); assert.equal(result.reports.length, 2); assert.equal(result.reports.every(item => !item.observation.layoutDiagnostics.horizontalOverflow), true); assert.equal(result.reports.every(item => item.screenshot.bytes > 1_000), true);
  } finally { await browser.closeAll(); database.db.close(); await rm(directory, { recursive: true, force: true }); }
});
