import { spawn } from 'node:child_process';
import { resolve, sep } from 'node:path';

const ALLOWED = {
  git: new Set(['status', 'diff', 'log', 'show']),
  npm: new Set(['test', 'run']),
  npx: new Set(['tsc', 'oxlint']),
  node: new Set(['--check']),
  rg: null,
};

function safeCwd(workspace, input = '.') {
  const target = resolve(workspace, input);
  if (target !== workspace && !target.startsWith(`${workspace}${sep}`)) throw new Error('Diretório fora da área permitida.');
  return target;
}

function validateCommand(command, args) {
  const base = String(command || '').toLowerCase().replace(/\.cmd$/i, '');
  if (!(base in ALLOWED)) throw new Error(`Comando não permitido: ${command}`);
  const allowedFirst = ALLOWED[base];
  if (allowedFirst && !allowedFirst.has(String(args[0] || ''))) throw new Error(`Subcomando não permitido: ${base} ${args[0] || ''}`);
  if (args.some(argument => /[;&|><`\r\n]/.test(String(argument)))) throw new Error('Caracteres de shell não são permitidos.');
  if (base === 'npm' && args[0] === 'run' && !['test', 'lint', 'build', 'typecheck'].includes(String(args[1] || ''))) throw new Error('Script npm não permitido.');
  return base;
}

export function createSandbox({ workspace, timeoutMs = 120_000, maxOutput = 24_000 }) {
  return {
    async run({ command, args = [], cwd = '.', timeout = timeoutMs }) {
      const base = validateCommand(command, args);
      const executable = process.platform === 'win32' && ['npm', 'npx'].includes(base) ? `${base}.cmd` : base;
      const workingDirectory = safeCwd(workspace, cwd);
      const safeEnv = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP, NODE_ENV: 'test', NO_COLOR: '1' };
      return new Promise((resolvePromise, reject) => {
        const startedAt = performance.now(); let stdout = ''; let stderr = ''; let timedOut = false;
        const child = spawn(executable, args.map(String), { cwd: workingDirectory, env: safeEnv, shell: false, windowsHide: true });
        const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, Math.min(timeout, timeoutMs));
        child.stdout.on('data', chunk => { stdout = `${stdout}${chunk}`.slice(-maxOutput); });
        child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-maxOutput); });
        child.on('error', error => { clearTimeout(timer); reject(error); });
        child.on('close', code => {
          clearTimeout(timer);
          resolvePromise({ command: `${base} ${args.join(' ')}`.trim(), cwd, exitCode: code ?? -1, stdout, stderr, timedOut, durationMs: performance.now() - startedAt });
        });
      });
    },
  };
}
