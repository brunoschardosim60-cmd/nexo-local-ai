import { defineTool } from '../tools/contracts.mjs';
import { RISK } from '../safety/policies.mjs';

const CHECKS = Object.freeze({
  test: ['npm', ['test']], lint: ['npm', ['run', 'lint']], build: ['npm', ['run', 'build']], typecheck: ['npm', ['run', 'typecheck']], tsc: ['npx', ['tsc', '--noEmit']],
});

export function createCodingAgent({ repository, sandbox }) {
  async function inspect({ path = '.', symbol = null }) {
    const map = await repository.build(path); const symbols = symbol ? await repository.findSymbol(symbol, path) : [];
    return { root: map.root, stats: map.stats, manifest: map.manifest, routes: map.routes, symbols, recommendedChecks: Object.keys(map.manifest?.scripts || {}).filter(name => ['test', 'lint', 'build', 'typecheck'].includes(name)) };
  }
  async function validate({ cwd = '.', checks = ['test'] }) {
    const results = [];
    for (const check of new Set(checks)) {
      const command = CHECKS[check]; if (!command) throw new Error(`Validação desconhecida: ${check}.`);
      const result = await sandbox.run({ command: command[0], args: command[1], cwd }); results.push({ check, ...result });
      if (result.exitCode !== 0) break;
    }
    return { cwd, valid: results.length === checks.length && results.every(result => result.exitCode === 0), results };
  }
  return {
    definitions: [
      defineTool({ name: 'code.inspect', description: 'Resume arquitetura, scripts, rotas e símbolos relevantes antes de uma mudança.', risk: RISK.READ, inputSchema: { type: 'object', additionalProperties: false, properties: { path: { type: 'string', maxLength: 1000 }, symbol: { type: 'string', maxLength: 200 } } }, execute: inspect }),
      defineTool({ name: 'code.validate', description: 'Executa uma sequência restrita de testes, lint, typecheck ou build e interrompe na primeira falha.', risk: RISK.EXECUTE, inputSchema: { type: 'object', required: ['checks'], additionalProperties: false, properties: { cwd: { type: 'string', maxLength: 1000 }, checks: { type: 'array', maxItems: 5, items: { type: 'string', enum: Object.keys(CHECKS) } } } }, execute: validate }),
    ],
    inspect, validate, health: () => ({ checks: Object.keys(CHECKS), repositoryAware: true, astAware: true, symbolContext: true }),
  };
}
