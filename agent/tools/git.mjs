import { defineTool } from './contracts.mjs';

function gitTool({ name, description, inputSchema, buildArgs }) {
  return defineTool({
    name, description, risk: 'read', inputSchema,
    execute: (input, context) => context.sandbox.run({ command: 'git', args: buildArgs(input), cwd: input.cwd || '.', timeout: 30_000 }, context),
  });
}

function gitWriteTool({ name, description, inputSchema, buildArgs }) { return { ...gitTool({ name, description, inputSchema, buildArgs }), risk: 'write' }; }
function safeBranch(value) { const branch = String(value || ''); if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/.test(branch) || branch.includes('..') || branch.endsWith('/') || branch.endsWith('.lock')) throw new Error('Nome de branch inválido.'); return branch; }

const cwdProperty = { cwd: { type: 'string', maxLength: 1000 } };

export function createGitTools(sandbox) {
  const withSandbox = tool => ({ ...tool, execute: (input, context = {}) => tool.execute(input, { ...context, sandbox }) });
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
    gitTool({ name: 'git.branch', description: 'Lista branches locais e mostra a branch ativa.', inputSchema: { type: 'object', properties: cwdProperty, additionalProperties: false }, buildArgs: () => ['branch', '--list', '--no-color'] }),
    gitTool({ name: 'git.blame', description: 'Mostra autoria e commit por linha de um arquivo observado.', inputSchema: { type: 'object', required: ['path'], properties: { ...cwdProperty, path: { type: 'string', minLength: 1, maxLength: 1000 } }, additionalProperties: false }, buildArgs: input => ['blame', '--', input.path] }),
    gitWriteTool({ name: 'git.create_branch', description: 'Cria e troca para uma branch nova após aprovação explícita.', inputSchema: { type: 'object', required: ['name'], properties: { ...cwdProperty, name: { type: 'string', minLength: 1, maxLength: 120 } }, additionalProperties: false }, buildArgs: input => ['switch', '-c', safeBranch(input.name)] }),
    gitWriteTool({ name: 'git.stage', description: 'Adiciona um caminho específico ao staging após aprovação explícita.', inputSchema: { type: 'object', required: ['path'], properties: { ...cwdProperty, path: { type: 'string', minLength: 1, maxLength: 1000 } }, additionalProperties: false }, buildArgs: input => ['add', '--', input.path] }),
    gitWriteTool({ name: 'git.commit', description: 'Cria commit apenas com o conteúdo já staged e mensagem fornecida, após aprovação.', inputSchema: { type: 'object', required: ['message'], properties: { ...cwdProperty, message: { type: 'string', minLength: 3, maxLength: 300 } }, additionalProperties: false }, buildArgs: input => ['commit', '-m', input.message] }),
  ].map(withSandbox);
}
