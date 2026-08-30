import { randomUUID } from 'node:crypto';

export const INPUT_TYPES = Object.freeze(['text', 'image', 'audio', 'video', 'document', 'screen']);
export const ARTIFACT_TYPES = Object.freeze(['text', 'code', 'image', 'video', 'audio', 'document', 'dataset', 'web']);

export function normalizeMultimodalMessage(input = {}) {
  const parts = Array.isArray(input.parts) ? input.parts : typeof input.content === 'string' ? [{ type: 'text', text: input.content }] : [];
  const normalized = parts.slice(0, 12).map((part, index) => {
    const type = String(part?.type || ''); if (!INPUT_TYPES.includes(type)) throw new Error(`Parte multimodal inválida: ${type || index}.`);
    if (type === 'text') return { id: part.id || randomUUID(), type, text: String(part.text || '').slice(0, 12_000) };
    const source = part.path ? { path: String(part.path) } : part.dataUrl ? { dataUrl: String(part.dataUrl) } : part.url ? { url: String(part.url) } : null;
    if (!source) throw new Error(`Parte ${type} sem origem.`);
    return { id: part.id || randomUUID(), type, mimeType: part.mimeType ? String(part.mimeType) : null, name: part.name ? String(part.name).slice(0, 240) : null, ...source, metadata: part.metadata && typeof part.metadata === 'object' ? part.metadata : {} };
  });
  return { id: input.id || randomUUID(), role: ['user', 'assistant', 'tool'].includes(input.role) ? input.role : 'user', parts: normalized, createdAt: input.createdAt || new Date().toISOString() };
}

export function textFromMessage(message) { return normalizeMultimodalMessage(message).parts.filter(part => part.type === 'text').map(part => part.text).join('\n'); }
export function mediaFromMessage(message) { return normalizeMultimodalMessage(message).parts.filter(part => part.type !== 'text'); }
