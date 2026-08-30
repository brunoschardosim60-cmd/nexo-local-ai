import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';

const EXTENSIONS = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'video/mp4': '.mp4', 'audio/wav': '.wav', 'audio/mpeg': '.mp3', 'application/json': '.json', 'text/plain': '.txt' };

export function createArtifactStore({ dataDir, database }) {
  const root = resolve(dataDir, 'artifacts');
  async function saveBuffer({ type, mimeType, provider, model = null, buffer, metadata = {}, sourceTask = null, extension = null }) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('Artefato vazio.');
    const id = randomUUID(); const folder = join(root, type); await mkdir(folder, { recursive: true });
    const suffix = extension || EXTENSIONS[mimeType] || extname(metadata.name || '') || '.bin'; const path = join(folder, `${id}${suffix}`);
    if (!path.startsWith(`${root}${sep}`)) throw new Error('Destino de artefato inválido.');
    await writeFile(path, buffer);
    return database.putArtifact({ id, type, mimeType, provider, model, location: path, metadata: { ...metadata, bytes: buffer.length }, sourceTask });
  }
  async function saveBase64(input) { return saveBuffer({ ...input, buffer: Buffer.from(String(input.base64 || '').replace(/^data:[^;]+;base64,/, ''), 'base64') }); }
  function register(input) { return database.putArtifact(input); }
  return { root, saveBuffer, saveBase64, register, get: database.getArtifact, list: database.listArtifacts, health: () => ({ root, persistent: true, artifacts: database.listArtifacts(500).length }) };
}
