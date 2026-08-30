import { createNexoCore } from '../index.mjs';

const core = createNexoCore({ autoStartScheduler: false, autoResume: false });
const results = [];
async function evaluate(name, capability, test) { try { const availability = await capability(); if (!availability.available) { results.push({ name, status: 'SKIPPED', reason: availability.error || 'provider indisponível' }); return; } await test(); results.push({ name, status: 'PASS' }); } catch (error) { results.push({ name, status: 'FAIL', reason: String(error?.message || error) }); } }
try {
  await evaluate('vision-provider', () => core.vision.availability(), async () => { const output = await core.vision.describeImage({ dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n9sAAAAASUVORK5CYII=' }); if (!output.content) throw new Error('sem descrição'); });
  await evaluate('image-provider', () => core.image.availability(), async () => {});
  await evaluate('video-provider', () => core.video.availability(), async () => {});
  const audio = await core.audio.availability(); for (const kind of ['stt', 'tts']) results.push({ name: `audio-${kind}`, status: audio[kind]?.available ? 'PASS' : 'SKIPPED', reason: audio[kind]?.error || null });
  results.push({ name: 'artifact-persistence', status: core.artifacts.health().persistent ? 'PASS' : 'FAIL' }, { name: 'media-queue', status: core.mediaQueue.health().concurrency === 1 ? 'PASS' : 'FAIL' }, { name: 'resource-manager', status: core.resources.health().policies.includes('queue') ? 'PASS' : 'FAIL' });
  const counts = Object.fromEntries(['PASS', 'FAIL', 'SKIPPED'].map(status => [status, results.filter(item => item.status === status).length])); console.log(JSON.stringify({ suite: 'Nexo V4 Media', counts, results }, null, 2)); if (counts.FAIL) process.exitCode = 1;
} finally { core.close(); }
