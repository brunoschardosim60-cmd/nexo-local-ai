export function createContinuityEngine(database, memory) {
  async function build({ sessionId = 'default', scope = 'global', objective = '' } = {}) {
    const handoff = database.getSessionHandoff(sessionId, scope); const relevant = objective ? await memory.search(objective, { scope, includeGlobal: true, limit: 8 }) : memory.list({ scope, limit: 8 });
    const decisions = memory.list({ scope, kind: 'decision', limit: 6 }); const procedures = memory.list({ scope, kind: 'procedural', limit: 6 });
    return { sessionId, scope, previous: handoff?.state || null, relevant: relevant.map(item => ({ id: item.id, type: item.type, summary: item.summary, confidence: item.confidence, status: item.status })), decisions: decisions.map(item => ({ id: item.id, summary: item.summary })), procedures: procedures.map(item => ({ id: item.id, summary: item.summary })), generatedAt: new Date().toISOString() };
  }
  function save({ sessionId = 'default', scope = 'global', objective = '', completed = [], pending = [], decisions = [], artifacts = [], nextSteps = [] }) { return database.putSessionHandoff({ sessionId, scope, state: { objective, completed, pending, decisions, artifacts, nextSteps, savedAt: new Date().toISOString() } }); }
  return { build, save, get: (sessionId = 'default', scope = 'global') => database.getSessionHandoff(sessionId, scope), health: () => ({ engine: 'continuity-v1', persistentHandoffs: true, projectAware: true }) };
}
