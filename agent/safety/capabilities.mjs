function pathScope(input = {}) { return String(input.path || input.cwd || input.url || input.root || '.').replace(/\\/g, '/'); }
export function createCapabilityManager(database) {
  function issue({ taskId, agent = 'general', namespaces = [], scopes = ['.'], ttlMs = 30 * 60_000 }) { return database.createCapabilityGrant({ taskId, agent, namespaces, scopes, expiresAt: new Date(Date.now() + Math.max(60_000, ttlMs)).toISOString() }); }
  function validate(id, tool, input = {}, { taskId = null, agent = null } = {}) {
    const grant = database.getCapabilityGrant(id); if (!grant || grant.revokedAt || Date.parse(grant.expiresAt) <= Date.now()) return { allowed: false, reason: 'Capability token ausente, expirado ou revogado.' };
    if (taskId && grant.taskId !== taskId) return { allowed: false, reason: 'Capability token pertence a outra tarefa.' };
    if (agent && grant.agent !== 'general' && grant.agent !== agent) return { allowed: false, reason: 'Capability token pertence a outro especialista.' };
    const namespaceAllowed = grant.namespaces.length === 0 || grant.namespaces.some(namespace => tool.name.startsWith(namespace));
    if (!namespaceAllowed) return { allowed: false, reason: `${grant.agent} não recebeu capacidade para ${tool.name}.` };
    const scope = pathScope(input); const scopeAllowed = grant.scopes.some(prefix => prefix === '.' || scope === prefix || scope.startsWith(`${prefix.replace(/\/$/, '')}/`));
    if (!scopeAllowed && !/^https?:\/\//i.test(scope)) return { allowed: false, reason: `Recurso ${scope} está fora do escopo temporário.` };
    return { allowed: true, grant, scope };
  }
  return { issue, validate, revoke: database.revokeCapabilityGrant, health: () => ({ persistent: true, temporary: true, leastPrivilege: true }) };
}
