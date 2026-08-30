import { freemem, totalmem, cpus, platform } from 'node:os';
import { spawnSync } from 'node:child_process';

function gpuSnapshot() {
  if (platform() !== 'win32') return [];
  const script = 'Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json -Compress';
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8', windowsHide: true, timeout: 5_000 });
  if (result.status !== 0 || !result.stdout.trim()) return [];
  try { const parsed = JSON.parse(result.stdout); return (Array.isArray(parsed) ? parsed : [parsed]).map(item => ({ name: item.Name, vramMB: item.AdapterRAM ? Math.round(Number(item.AdapterRAM) / 1_048_576) : null })); } catch { return []; }
}

export function createResourceManager({ profiles = null } = {}) {
  let activeHeavy = null; const gpu = gpuSnapshot();
  function snapshot() {
    return { cpu: { cores: cpus().length, model: cpus()[0]?.model || null }, ram: { totalMB: Math.round(totalmem() / 1_048_576), freeMB: Math.round(freemem() / 1_048_576) }, gpu, activeHeavy, loadedModels: profiles?.health?.().loaded || [] };
  }
  function decide({ requiredRamMB = 0, requiredVramMB = 0, priority = 5 } = {}) {
    const state = snapshot(); const maxVram = Math.max(0, ...gpu.map(item => item.vramMB || 0));
    if (requiredRamMB && requiredRamMB > state.ram.freeMB * 0.85) return { decision: 'reject', reason: 'RAM livre insuficiente.', state };
    if (requiredVramMB && maxVram && requiredVramMB > maxVram * 1.15) return { decision: 'fallback', reason: 'VRAM estimada excede o hardware; use CPU/provider alternativo.', state };
    if (activeHeavy && priority >= activeHeavy.priority) return { decision: 'queue', reason: `${activeHeavy.kind} já usa o orçamento pesado.`, state };
    return { decision: 'allow', reason: 'Recursos dentro do orçamento observado.', state };
  }
  function acquire(job) { activeHeavy = { ...job, at: new Date().toISOString() }; return activeHeavy; }
  function release(id) { if (!id || activeHeavy?.id === id) activeHeavy = null; }
  return { snapshot, decide, acquire, release, health: () => ({ ...snapshot(), policies: ['allow', 'queue', 'fallback', 'reject'] }) };
}
