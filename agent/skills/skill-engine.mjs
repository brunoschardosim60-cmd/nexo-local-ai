import { readdir, readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { defineTool } from '../tools/contracts.mjs';
import { RISK } from '../safety/policies.mjs';

function parseSkill(content, path) {
  const frontmatter = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
  const fields = {};
  for (const line of (frontmatter?.[1] || '').split(/\r?\n/)) {
    const match = line.match(/^([\w-]+):\s*(.*)$/); if (match) fields[match[1]] = match[2].replace(/^['"]|['"]$/g, '').trim();
  }
  const body = content.slice(frontmatter?.[0]?.length || 0).trim();
  return { id: fields.name || path.replace(/[\\/]/g, ':'), name: fields.name || 'skill-local', description: fields.description || body.split(/\r?\n/).find(Boolean) || 'Skill local', path, instructions: body, size: content.length };
}

function tokens(value) { return new Set(String(value).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().match(/[a-z0-9_-]{3,}/g) || []); }

async function findSkillFiles(root, depth = 0) {
  if (depth > 4) return [];
  let entries; try { entries = await readdir(root, { withFileTypes: true }); } catch { return []; }
  const own = entries.filter(entry => entry.isFile() && entry.name.toLowerCase() === 'skill.md').map(entry => resolve(root, entry.name));
  const nested = await Promise.all(entries.filter(entry => entry.isDirectory() && !entry.name.startsWith('.')).map(entry => findSkillFiles(resolve(root, entry.name), depth + 1)));
  return [...own, ...nested.flat()];
}

export function createSkillEngine({ roots, database }) {
  let cache = [];

  async function refresh() {
    const files = (await Promise.all(roots.map(root => findSkillFiles(resolve(root))))).flat(); const states = database.getSkillStates(); const skills = [];
    for (const file of [...new Set(files)]) {
      const allowed = roots.some(root => file === resolve(root) || file.startsWith(`${resolve(root)}${sep}`)); if (!allowed) continue;
      const content = await readFile(file, 'utf8'); if (content.length > 50_000) continue;
      skills.push({ ...parseSkill(content, file), enabled: states.has(file) ? states.get(file) : true });
    }
    cache = skills.sort((left, right) => left.name.localeCompare(right.name)); return list();
  }

  function list() { return cache.map(({ instructions, ...skill }) => ({ ...skill, instructionChars: instructions.length })); }
  function read(id) { const skill = cache.find(item => item.id === id || item.name === id || item.path === id); if (!skill) throw new Error('Skill não encontrada.'); return { ...skill }; }
  function setEnabled(id, enabled) {
    const skill = cache.find(item => item.id === id || item.name === id || item.path === id); if (!skill) throw new Error('Skill não encontrada.');
    database.setSkillEnabled(skill.path, enabled); skill.enabled = Boolean(enabled); return { id: skill.id, name: skill.name, enabled: skill.enabled };
  }
  function match(objective, limit = 3) {
    const wanted = tokens(objective);
    return cache.filter(skill => skill.enabled).map(skill => {
      const catalog = tokens(`${skill.name} ${skill.description}`); let score = 0; for (const token of wanted) if (catalog.has(token)) score += token.length > 7 ? 2 : 1;
      return { skill, score };
    }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name)).slice(0, limit).map(({ skill, score }) => ({ ...skill, score }));
  }
  function contextFor(objective, limit = 3) { return match(objective, limit).map(skill => ({ name: skill.name, description: skill.description, instructions: skill.instructions.slice(0, 16_000), path: skill.path })); }

  const definitions = [
    defineTool({ name: 'skills.list', description: 'Lista skills locais disponíveis e seu estado.', risk: RISK.READ, inputSchema: { type: 'object', additionalProperties: false, properties: {} }, execute: () => list() }),
    defineTool({ name: 'skills.read', description: 'Lê integralmente as instruções de uma skill local.', risk: RISK.READ, inputSchema: { type: 'object', required: ['id'], additionalProperties: false, properties: { id: { type: 'string', minLength: 2, maxLength: 500 } } }, execute: ({ id }) => read(id) }),
    defineTool({ name: 'skills.set_enabled', description: 'Ativa ou desativa uma skill local de forma persistente.', risk: RISK.WRITE, inputSchema: { type: 'object', required: ['id', 'enabled'], additionalProperties: false, properties: { id: { type: 'string', minLength: 2, maxLength: 500 }, enabled: { type: 'boolean' } } }, execute: ({ id, enabled }) => setEnabled(id, enabled) }),
  ];

  const initialRefresh = refresh().catch(() => []);
  return { definitions, refresh, ready: () => initialRefresh, list, read, match, contextFor, setEnabled, health: () => ({ loaded: cache.length, enabled: cache.filter(skill => skill.enabled).length, roots }) };
}

export { parseSkill };
