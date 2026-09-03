import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);

test('sessão local se recupera de reinício do Core sem exigir F5', async () => {
  const [hook, client, server] = await Promise.all([
    readFile(new URL('hooks/use-agent-connection.ts', root), 'utf8'),
    readFile(new URL('lib/nexo/client.ts', root), 'utf8'),
    readFile(new URL('local-agent.mjs', root), 'utf8'),
  ]);

  assert.match(hook, /setInterval\(\(\) => void refresh\(\), 3_000\)/);
  assert.match(hook, /visibilitychange/);
  assert.match(hook, /NEXO_SESSION_EXPIRED_EVENT/);
  assert.match(client, /response\.status === 401/);
  assert.match(client, /dispatchEvent/);
  assert.match(server, /Sessão local não autorizada\.['"] \? 401/);
});
