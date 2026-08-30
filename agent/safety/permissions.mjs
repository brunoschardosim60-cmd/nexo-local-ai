import { permissionPolicy } from './policies.mjs';

export function createPermissionManager(database) {
  return {
    inspect(tool, input) { return permissionPolicy(tool, input); },
    request(taskId, tool, input) {
      const policy = permissionPolicy(tool, input);
      if (policy.decision === 'deny') throw new Error(policy.reason);
      if (!policy.required) return null;
      return database.createPermission({ taskId, tool: tool.name, scope: policy.scope, risk: policy.risk, reason: policy.reason, input });
    },
    resolve(id, decision) { return database.resolvePermission(id, decision === 'approved' ? 'approved' : 'denied'); },
    list(taskId) { return database.getPermissions(taskId); },
  };
}
