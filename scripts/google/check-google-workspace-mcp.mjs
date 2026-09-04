import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createMcpManager } from '../../agent/mcp/client.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..', '..');
const workspaceRoot = resolve(repositoryRoot, '..');
const configPath = join(repositoryRoot, 'data', 'mcp-servers.json');

if (!existsSync(configPath)) {
  console.error('Configuração ausente. Execute npm run google:setup.');
  process.exitCode = 1;
} else {
  const mcp = createMcpManager({ workspace: workspaceRoot, configPath });
  try {
    const health = await mcp.checkHealth('google-workspace');
    const tools = health.status === 'AVAILABLE' ? await mcp.listTools('google-workspace') : { tools: [] };
    console.log(JSON.stringify({ health, tools: tools.tools.map(({ name, risk }) => ({ name, risk })) }, null, 2));
    if (health.status !== 'AVAILABLE') process.exitCode = 1;
  } finally {
    await mcp.close();
  }
}
