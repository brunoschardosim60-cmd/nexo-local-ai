import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export function createLogger(dataDir) {
  const logsDir = join(dataDir, 'logs');
  async function write(level, event, data = {}) {
    const entry = { at: new Date().toISOString(), level, event, ...data };
    try {
      await mkdir(logsDir, { recursive: true });
      await appendFile(join(logsDir, 'agent.jsonl'), `${JSON.stringify(entry)}\n`, 'utf8');
    } catch { /* logging never breaks a task */ }
    return entry;
  }
  return {
    info: (event, data) => write('info', event, data),
    warn: (event, data) => write('warn', event, data),
    error: (event, data) => write('error', event, data),
  };
}
