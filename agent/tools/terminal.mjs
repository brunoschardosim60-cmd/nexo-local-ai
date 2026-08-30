import { defineTool } from './contracts.mjs';

export function createTerminalTools(sandbox) {
  return [defineTool({
    name: 'shell.run', aliases: ['run_command'], description: 'Executa um comando local restrito para testes, build, lint ou inspeção.', risk: 'execute',
    inputSchema: { type: 'object', properties: {
      command: { type: 'string', enum: ['git', 'npm', 'npx', 'node', 'rg'] }, args: { type: 'array', items: { type: 'string', maxLength: 1000 }, maxItems: 40 },
      cwd: { type: 'string', maxLength: 1000 }, timeout: { type: 'integer', minimum: 1000, maximum: 120000 },
    }, required: ['command'], additionalProperties: false },
    execute: (input, context) => sandbox.run(input, context),
  })];
}
