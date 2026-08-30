import { spawn } from 'node:child_process';
import { dirname, join, resolve, sep } from 'node:path';

const ALLOWED = {
  git: new Set(['status', 'diff', 'log', 'show', 'branch', 'blame', 'add', 'switch', 'commit']),
  npm: new Set(['test', 'run']),
  npx: new Set(['tsc', 'oxlint']),
  node: new Set(['--check']),
  rg: null,
};
const FORBIDDEN_OPTIONS = new Set(['--pre', '--pre-glob', '--ext-diff', '--textconv', '--exec', '-exec']);
const MAX_ARGUMENTS = 120; const MAX_ARGUMENT_LENGTH = 4_000;

function safeCwd(workspace, input = '.') {
  const target = resolve(workspace, input);
  if (target !== workspace && !target.startsWith(`${workspace}${sep}`)) throw new Error('Diretório fora da área permitida.');
  return target;
}

function validateCommand(command, args) {
  const base = String(command || '').toLowerCase().replace(/\.cmd$/i, '');
  if (!(base in ALLOWED)) throw new Error(`Comando não permitido: ${command}`);
  if (!Array.isArray(args) || args.length > MAX_ARGUMENTS) throw new Error('Quantidade de argumentos não permitida.');
  const allowedFirst = ALLOWED[base];
  if (allowedFirst && !allowedFirst.has(String(args[0] || ''))) throw new Error(`Subcomando não permitido: ${base} ${args[0] || ''}`);
  for (const argument of args) {
    const value = String(argument); const option = value.split('=', 1)[0];
    if (value.length > MAX_ARGUMENT_LENGTH) throw new Error('Argumento grande demais.');
    if (/[;&|><`\r\n]/.test(value) || value.includes(String.fromCharCode(0))) throw new Error('Caracteres de shell não são permitidos.');
    if (FORBIDDEN_OPTIONS.has(option)) throw new Error(`Opção não permitida: ${option}`);
    if (/^(?:[a-z]:[\\/]|\\\\|\/)/i.test(value) || /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(value)) throw new Error('Caminhos absolutos ou com travessia não são permitidos.');
  }
  if (base === 'npm' && args[0] === 'run' && !['test', 'lint', 'build', 'typecheck'].includes(String(args[1] || ''))) throw new Error('Script npm não permitido.');
  return base;
}

export function createSandbox({ workspace, timeoutMs = 120_000, maxOutput = 24_000 }) {
  return {
    async run({ command, args = [], cwd = '.', timeout = timeoutMs }, context = {}) {
      const base = validateCommand(command, args);
      const npmCli = process.platform === 'win32' && ['npm', 'npx'].includes(base)
        ? join(dirname(process.execPath), 'node_modules', 'npm', 'bin', base === 'npm' ? 'npm-cli.js' : 'npx-cli.js')
        : null;
      const executable = npmCli ? process.execPath : base;
      const executableArgs = npmCli ? [npmCli, ...args.map(String)] : args.map(String);
      const workingDirectory = safeCwd(workspace, cwd);
      const safeEnv = {
        PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP,
        NODE_ENV: 'test', NO_COLOR: '1', CI: '1', npm_config_ignore_scripts: 'true', npm_config_audit: 'false', npm_config_fund: 'false',
        GIT_EXTERNAL_DIFF: '', GIT_CONFIG_NOSYSTEM: '1', RIPGREP_CONFIG_PATH: '',
      };
      return new Promise((resolvePromise, reject) => {
        const startedAt = performance.now(); let stdout = ''; let stderr = ''; let timedOut = false;
        const child = spawn(executable, executableArgs, { cwd: workingDirectory, env: safeEnv, shell: false, windowsHide: true });
        const abort = () => child.kill('SIGTERM');
        if (context.signal?.aborted) abort(); else context.signal?.addEventListener('abort', abort, { once: true });
        const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, Math.min(timeout, timeoutMs));
        child.stdout.on('data', chunk => { stdout = `${stdout}${chunk}`.slice(-maxOutput); });
        child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-maxOutput); });
        child.on('error', error => { clearTimeout(timer); reject(error); });
        child.on('close', code => {
          clearTimeout(timer); context.signal?.removeEventListener('abort', abort);
          resolvePromise({ command: `${base} ${args.join(' ')}`.trim(), cwd, exitCode: code ?? -1, stdout, stderr, timedOut, durationMs: performance.now() - startedAt });
        });
      });
    },
  };
}
