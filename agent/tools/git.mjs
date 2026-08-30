import { defineTool } from './contracts.mjs';

function gitTool({ name, description, inputSchema, buildArgs }) {
  return defineTool({
    name, description, risk: 'read', inputSchema,
    execute: (input, context) => context.sandbox.run({ command: 'git', args: buildArgs(input), cwd: input.cwd || '.', timeout: 30_000 }),
  });
}

const cwdProperty = { cwd: { type: 'string', maxLength: 1000 } };

export function createGitTools(sandbox) {
  const withSandbox = tool => ({ ...tool, execute: input => tool.execute(input, { sandbox }) });
  return [
    gitTool({
      name: 'git.status', description: 'Mostra o estado do repositório em formato curto e sem alterar o Git.',
      inputSchema: { type: 'object', properties: cwdProperty, additionalProperties: false },
      buildArgs: () => ['status', '--short', '--branch'],
    }),
    gitTool({
      name: 'git.diff', description: 'Mostra diferenças do working tree ou staging sem alterar arquivos.',
      inputSchema: { type: 'object', properties: { ...cwdProperty, staged: { type: 'boolean' }, path: { type: 'string', maxLength: 1000 } }, additionalProperties: false },
      buildArgs: input => ['diff', ...(input.staged ? ['--cached'] : []), '--', ...(input.path ? [input.path] : [])],
    }),
    gitTool({
      name: 'git.log', description: 'Lê o histórico recente do Git.',
      inputSchema: { type: 'object', properties: { ...cwdProperty, limit: { type: 'integer', minimum: 1, maximum: 50 } }, additionalProperties: false },
      buildArgs: input => ['log', '--oneline', '--decorate', `-${input.limit || 12}`],
    }),
    gitTool({
      name: 'git.show', description: 'Exibe um commit ou arquivo de um ref do Git sem alterar o repositório.',
      inputSchema: { type: 'object', properties: { ...cwdProperty, ref: { type: 'string', minLength: 1, maxLength: 200 }, path: { type: 'string', maxLength: 1000 } }, required: ['ref'], additionalProperties: false },
      buildArgs: input => ['show', '--stat', '--oneline', input.path ? `${input.ref}:${input.path}` : input.ref],
    }),
  ].map(withSandbox);
}
