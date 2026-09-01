export const RISK = Object.freeze({ READ: 'read', WRITE: 'write', EXECUTE: 'execute', NETWORK: 'network', DESTRUCTIVE: 'destructive' });
export const DECISION = Object.freeze({ ALLOW: 'allow', ASK: 'ask', DENY: 'deny' });

const PROTECTED_PATH = /(^|[\\/])(?:\.ssh|\.aws|\.gnupg|AppData|System32|Windows)([\\/]|$)|(^|[\\/])(?:\.env(?:\.[^\\/]+)?|id_rsa|id_ed25519|credentials(?:\.[^\\/]+)?|secrets?(?:\.[^\\/]+)?)([\\/]|$)/i;
const DESTRUCTIVE_COMMAND = /(?:^|\s)(?:rm|rmdir|del|erase|format|shutdown|reboot|diskpart)(?:\s|$)|reset\s+--hard|clean\s+-fd/i;

export function permissionPolicy(tool, input = {}) {
  const risk = tool.risk || RISK.READ;
  const scope = String(input.path || input.url || input.serverId || input.jobId || input.cwd || input.command || input.objective || '.').slice(0, 500);
  if (PROTECTED_PATH.test(scope)) return { decision: DECISION.DENY, required: false, risk, scope, reason: 'A política bloqueou acesso a credenciais ou diretório protegido.' };
  if (DESTRUCTIVE_COMMAND.test(`${input.command || ''} ${(input.args || []).join(' ')}`)) return { decision: DECISION.DENY, required: false, risk: RISK.DESTRUCTIVE, scope, reason: 'Comando destrutivo bloqueado permanentemente.' };
  if (risk === RISK.DESTRUCTIVE) return { decision: DECISION.DENY, required: false, risk, scope, reason: `A ferramenta ${tool.name} foi classificada como destrutiva.` };
  if (risk === RISK.READ) return { decision: DECISION.ALLOW, required: false, risk, scope, reason: 'Leitura dentro da área autorizada.' };
  if (risk === RISK.WRITE) return { decision: DECISION.ASK, required: true, risk, scope, reason: `A ferramenta ${tool.name} pode alterar arquivos locais.` };
  if (risk === RISK.EXECUTE) return { decision: DECISION.ASK, required: true, risk, scope, reason: `A ferramenta ${tool.name} executará um processo local restrito.` };
  return { decision: DECISION.ASK, required: true, risk, scope, reason: `A ferramenta ${tool.name} acessará um recurso externo.` };
}

function numeric(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function validateTaskLimits({ maxSteps, maxRetries, maxSelfCorrections, maxToolCalls, maxModelCalls, maxDurationMs, maxCost }, defaults) {
  return {
    maxSteps: Math.max(1, Math.min(numeric(maxSteps, defaults.maxSteps), defaults.maxSteps)),
    maxRetries: Math.max(0, Math.min(numeric(maxRetries, defaults.maxRetries), defaults.maxRetryLimit ?? defaults.maxRetries)),
    maxSelfCorrections: Math.max(0, Math.min(numeric(maxSelfCorrections, defaults.maxSelfCorrections ?? 3), defaults.maxSelfCorrectionLimit ?? defaults.maxSelfCorrections ?? 3)),
    maxToolCalls: Math.max(1, Math.min(Number(maxToolCalls) || defaults.maxToolCalls || defaults.maxSteps * (defaults.maxRetries + 1), defaults.maxToolCalls || 100)),
    maxModelCalls: Math.max(1, Math.min(Number(maxModelCalls) || defaults.maxModelCalls || defaults.maxSteps * 2, defaults.maxModelCalls || 100)),
    maxDurationMs: Math.max(10_000, Math.min(Number(maxDurationMs) || defaults.maxTaskMinutes * 60_000, defaults.maxTaskMinutes * 60_000)),
    maxCost: Math.max(0, Math.min(Number(maxCost) || defaults.maxCost || 0, defaults.maxCost || 0)),
  };
}
