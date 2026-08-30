import { randomUUID } from 'node:crypto';

const GOAL_STATES = new Set(['IDEA', 'ACTIVE', 'PAUSED', 'BLOCKED', 'COMPLETED', 'CANCELLED']);
const TASK_STATES = new Set(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED']);
const SUGGESTION_STATES = new Set(['PENDING', 'SEEN', 'DISMISSED', 'ACTED', 'EXPIRED']);
const MODES = new Set(['GUIDE', 'TEACH', 'CHALLENGE', 'EXAM']);

function parse(value, fallback) { try { return value == null ? fallback : JSON.parse(value); } catch { return fallback; } }
function priority(value) { return Math.max(1, Math.min(5, Number(value) || 3)); }
function progress(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
function iso(value) { if (!value) return null; const date = new Date(value); if (Number.isNaN(date.getTime())) throw new Error('Data inválida.'); return date.toISOString(); }

export function createPersonalStore(database) {
  const db = database.db;
  const schema = [
    `CREATE TABLE IF NOT EXISTS personal_goals (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', scope TEXT NOT NULL DEFAULT 'global',
      priority INTEGER NOT NULL DEFAULT 3, status TEXT NOT NULL DEFAULT 'IDEA', deadline TEXT,
      milestones_json TEXT NOT NULL DEFAULT '[]', dependencies_json TEXT NOT NULL DEFAULT '[]',
      progress REAL NOT NULL DEFAULT 0, evidence_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS personal_tasks (
      id TEXT PRIMARY KEY, goal_id TEXT, project_scope TEXT NOT NULL DEFAULT 'global', title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '', priority INTEGER NOT NULL DEFAULT 3, deadline TEXT, estimated_minutes INTEGER,
      dependencies_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'TODO', evidence_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT,
      FOREIGN KEY(goal_id) REFERENCES personal_goals(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS personal_settings (
      key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS daily_snapshots (
      id TEXT PRIMARY KEY, local_date TEXT NOT NULL, kind TEXT NOT NULL, snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL, UNIQUE(local_date, kind)
    )`,
    `CREATE TABLE IF NOT EXISTS proactivity_items (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL,
      importance REAL NOT NULL, confidence REAL NOT NULL, reason TEXT NOT NULL, source TEXT NOT NULL,
      source_event_id TEXT, action_json TEXT NOT NULL DEFAULT '{}', policy TEXT NOT NULL DEFAULT 'SUGGEST',
      status TEXT NOT NULL DEFAULT 'PENDING', dedupe_key TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL, seen_at TEXT, expires_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS personal_triggers (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, event_pattern TEXT NOT NULL, conditions_json TEXT NOT NULL DEFAULT '{}',
      action_json TEXT NOT NULL, policy TEXT NOT NULL DEFAULT 'SUGGEST', capabilities_json TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1, cooldown_minutes INTEGER NOT NULL DEFAULT 60,
      last_fired_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS learning_concepts (
      id TEXT PRIMARY KEY, scope TEXT NOT NULL DEFAULT 'learning:global', name TEXT NOT NULL,
      mastery REAL NOT NULL DEFAULT 0, confidence REAL NOT NULL DEFAULT 0.5, last_reviewed_at TEXT, next_review_at TEXT,
      mistakes_json TEXT NOT NULL DEFAULT '[]', dependencies_json TEXT NOT NULL DEFAULT '[]', enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(scope, name)
    )`,
    `CREATE TABLE IF NOT EXISTS study_sessions (
      id TEXT PRIMARY KEY, concept_id TEXT, scope TEXT NOT NULL, tutor_mode TEXT NOT NULL,
      score REAL, result TEXT NOT NULL, questions_json TEXT NOT NULL DEFAULT '[]', mistakes_json TEXT NOT NULL DEFAULT '[]',
      started_at TEXT NOT NULL, completed_at TEXT NOT NULL,
      FOREIGN KEY(concept_id) REFERENCES learning_concepts(id) ON DELETE SET NULL
    )`,
    'CREATE INDEX IF NOT EXISTS idx_personal_goals_status_deadline ON personal_goals(status, deadline)',
    'CREATE INDEX IF NOT EXISTS idx_personal_goals_scope_updated ON personal_goals(scope, updated_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_personal_tasks_status_deadline ON personal_tasks(status, deadline)',
    'CREATE INDEX IF NOT EXISTS idx_personal_tasks_project_status ON personal_tasks(project_scope, status, priority DESC)',
    "CREATE INDEX IF NOT EXISTS idx_proactivity_pending ON proactivity_items(status, importance DESC, created_at DESC) WHERE status = 'PENDING'",
    'CREATE INDEX IF NOT EXISTS idx_triggers_event_enabled ON personal_triggers(event_pattern, enabled)',
    'CREATE INDEX IF NOT EXISTS idx_learning_review_due ON learning_concepts(enabled, next_review_at)',
  ];
  for (const statement of schema) db.prepare(statement).run();
  db.exec('PRAGMA optimize');

  const defaultSettings = {
    proactivityLevel: 'OFF', notificationsEnabled: false, quietHours: { enabled: false, start: '22:00', end: '08:00' },
    interruptionBudget: { maxPerDay: 3, minMinutesBetween: 90 }, dailyBriefEnabled: false, endOfDayReviewEnabled: false,
    learningHistoryEnabled: true, spacedRepetitionEnabled: false, tutorMode: 'GUIDE', dontSpoil: true, focusMode: false,
  };

  function hydrateGoal(row) { return row ? { id: row.id, title: row.title, description: row.description, scope: row.scope, priority: row.priority, status: row.status, deadline: row.deadline, milestones: parse(row.milestones_json, []), dependencies: parse(row.dependencies_json, []), progress: row.progress, evidence: parse(row.evidence_json, []), createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at } : null; }
  function getGoal(id) { return hydrateGoal(db.prepare('SELECT * FROM personal_goals WHERE id=?').get(id)); }
  function createGoal(input) { const now = new Date().toISOString(); const record = { id: randomUUID(), title: String(input.title || '').trim().slice(0, 240), description: String(input.description || '').trim().slice(0, 5000), scope: String(input.scope || 'global').slice(0, 300), priority: priority(input.priority), status: GOAL_STATES.has(input.status) ? input.status : 'IDEA', deadline: iso(input.deadline), milestones: Array.isArray(input.milestones) ? input.milestones.slice(0, 40) : [], dependencies: Array.isArray(input.dependencies) ? input.dependencies.slice(0, 40) : [], progress: progress(input.progress), evidence: Array.isArray(input.evidence) ? input.evidence.slice(0, 100) : [], createdAt: now, updatedAt: now }; if (record.title.length < 2) throw new Error('Objetivo sem título.'); db.prepare('INSERT INTO personal_goals (id,title,description,scope,priority,status,deadline,milestones_json,dependencies_json,progress,evidence_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(record.id, record.title, record.description, record.scope, record.priority, record.status, record.deadline, JSON.stringify(record.milestones), JSON.stringify(record.dependencies), record.progress, JSON.stringify(record.evidence), now, now); return getGoal(record.id); }
  function updateGoal(id, patch = {}) { const current = getGoal(id); if (!current) throw new Error('Objetivo não encontrado.'); const next = { ...current, ...patch, priority: patch.priority == null ? current.priority : priority(patch.priority), progress: patch.progress == null ? current.progress : progress(patch.progress), deadline: patch.deadline === undefined ? current.deadline : iso(patch.deadline), updatedAt: new Date().toISOString() }; if (!GOAL_STATES.has(next.status)) throw new Error('Estado de objetivo inválido.'); if (next.progress >= 1 && patch.status == null) next.status = 'COMPLETED'; next.completedAt = next.status === 'COMPLETED' ? next.completedAt || next.updatedAt : null; db.prepare('UPDATE personal_goals SET title=?,description=?,scope=?,priority=?,status=?,deadline=?,milestones_json=?,dependencies_json=?,progress=?,evidence_json=?,updated_at=?,completed_at=? WHERE id=?').run(String(next.title).slice(0,240), String(next.description).slice(0,5000), String(next.scope).slice(0,300), next.priority, next.status, next.deadline, JSON.stringify(next.milestones || []), JSON.stringify(next.dependencies || []), next.progress, JSON.stringify(next.evidence || []), next.updatedAt, next.completedAt, id); return getGoal(id); }
  function listGoals({ scope = null, status = null, limit = 100 } = {}) { const clauses = []; const params = []; if (scope) { clauses.push('scope=?'); params.push(scope); } if (status?.length) { const states = Array.isArray(status) ? status : [status]; clauses.push(`status IN (${states.map(() => '?').join(',')})`); params.push(...states); } params.push(Math.max(1, Math.min(Number(limit) || 100, 1000))); return db.prepare(`SELECT * FROM personal_goals ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY priority DESC, CASE WHEN deadline IS NULL THEN 1 ELSE 0 END, deadline, updated_at DESC LIMIT ?`).all(...params).map(hydrateGoal); }
  function clearGoals() { const changes = Number(db.prepare('DELETE FROM personal_goals').run().changes); return { cleared: changes }; }

  function hydrateTask(row) { return row ? { id: row.id, goalId: row.goal_id, projectScope: row.project_scope, title: row.title, description: row.description, priority: row.priority, deadline: row.deadline, estimatedMinutes: row.estimated_minutes, dependencies: parse(row.dependencies_json, []), status: row.status, evidence: parse(row.evidence_json, []), createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at } : null; }
  function getTask(id) { return hydrateTask(db.prepare('SELECT * FROM personal_tasks WHERE id=?').get(id)); }
  function createTask(input) { const now = new Date().toISOString(); const title = String(input.title || '').trim().slice(0,240); if (title.length < 2) throw new Error('Tarefa sem título.'); const id = randomUUID(); const status = TASK_STATES.has(input.status) ? input.status : 'TODO'; db.prepare('INSERT INTO personal_tasks (id,goal_id,project_scope,title,description,priority,deadline,estimated_minutes,dependencies_json,status,evidence_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, input.goalId || null, String(input.projectScope || 'global').slice(0,300), title, String(input.description || '').slice(0,5000), priority(input.priority), iso(input.deadline), input.estimatedMinutes == null ? null : Math.max(1, Math.min(100_000, Number(input.estimatedMinutes) || 1)), JSON.stringify(Array.isArray(input.dependencies) ? input.dependencies.slice(0,40) : []), status, JSON.stringify(Array.isArray(input.evidence) ? input.evidence.slice(0,100) : []), now, now); return getTask(id); }
  function updateTask(id, patch = {}) { const current = getTask(id); if (!current) throw new Error('Tarefa pessoal não encontrada.'); const next = { ...current, ...patch, priority: patch.priority == null ? current.priority : priority(patch.priority), deadline: patch.deadline === undefined ? current.deadline : iso(patch.deadline), updatedAt: new Date().toISOString() }; if (!TASK_STATES.has(next.status)) throw new Error('Estado de tarefa inválido.'); next.completedAt = next.status === 'DONE' ? next.completedAt || next.updatedAt : null; db.prepare('UPDATE personal_tasks SET goal_id=?,project_scope=?,title=?,description=?,priority=?,deadline=?,estimated_minutes=?,dependencies_json=?,status=?,evidence_json=?,updated_at=?,completed_at=? WHERE id=?').run(next.goalId || null, String(next.projectScope).slice(0,300), String(next.title).slice(0,240), String(next.description).slice(0,5000), next.priority, next.deadline, next.estimatedMinutes, JSON.stringify(next.dependencies || []), next.status, JSON.stringify(next.evidence || []), next.updatedAt, next.completedAt, id); return getTask(id); }
  function listTasks({ projectScope = null, goalId = null, status = null, limit = 200 } = {}) { const clauses = []; const params = []; if (projectScope) { clauses.push('project_scope=?'); params.push(projectScope); } if (goalId) { clauses.push('goal_id=?'); params.push(goalId); } if (status?.length) { const states = Array.isArray(status) ? status : [status]; clauses.push(`status IN (${states.map(() => '?').join(',')})`); params.push(...states); } params.push(Math.max(1, Math.min(Number(limit) || 200, 2000))); return db.prepare(`SELECT * FROM personal_tasks ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY priority DESC, CASE WHEN deadline IS NULL THEN 1 ELSE 0 END, deadline, updated_at DESC LIMIT ?`).all(...params).map(hydrateTask); }

  function getSettings() { const rows = db.prepare('SELECT key,value_json FROM personal_settings').all(); return { ...defaultSettings, ...Object.fromEntries(rows.map(row => [row.key, parse(row.value_json, null)])) }; }
  function updateSettings(patch = {}) { const allowed = new Set(Object.keys(defaultSettings)); const entries = Object.entries(patch).filter(([key]) => allowed.has(key)); const candidate = { ...getSettings(), ...Object.fromEntries(entries) }; if (!['OFF','LOW','NORMAL','HIGH'].includes(candidate.proactivityLevel)) throw new Error('Nível de proatividade inválido.'); if (!MODES.has(candidate.tutorMode)) throw new Error('Modo tutor inválido.'); const statement = db.prepare('INSERT INTO personal_settings (key,value_json,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at'); const now = new Date().toISOString(); db.exec('BEGIN'); try { for (const [key, value] of entries) statement.run(key, JSON.stringify(value), now); db.exec('COMMIT'); } catch (error) { db.exec('ROLLBACK'); throw error; } return getSettings(); }

  function putSnapshot({ localDate, kind = 'daily', snapshot }) { const id = randomUUID(); const now = new Date().toISOString(); db.prepare('INSERT INTO daily_snapshots (id,local_date,kind,snapshot_json,created_at) VALUES (?,?,?,?,?) ON CONFLICT(local_date,kind) DO UPDATE SET snapshot_json=excluded.snapshot_json,created_at=excluded.created_at').run(id, localDate, kind, JSON.stringify(snapshot), now); return getSnapshot(localDate, kind); }
  function getSnapshot(localDate, kind = 'daily') { const row = db.prepare('SELECT * FROM daily_snapshots WHERE local_date=? AND kind=?').get(localDate, kind); return row ? { id: row.id, localDate: row.local_date, kind: row.kind, snapshot: parse(row.snapshot_json, {}), createdAt: row.created_at } : null; }

  function hydrateSuggestion(row) { return row ? { id: row.id, kind: row.kind, title: row.title, message: row.message, importance: row.importance, confidence: row.confidence, reason: row.reason, source: row.source, sourceEventId: row.source_event_id, action: parse(row.action_json, {}), policy: row.policy, status: row.status, dedupeKey: row.dedupe_key, createdAt: row.created_at, seenAt: row.seen_at, expiresAt: row.expires_at } : null; }
  function putSuggestion(input) { const existing = db.prepare('SELECT * FROM proactivity_items WHERE dedupe_key=?').get(input.dedupeKey); if (existing) return { ...hydrateSuggestion(existing), duplicate: true }; const now = new Date().toISOString(); const id = randomUUID(); db.prepare('INSERT INTO proactivity_items (id,kind,title,message,importance,confidence,reason,source,source_event_id,action_json,policy,status,dedupe_key,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, input.kind, input.title, input.message, progress(input.importance), progress(input.confidence), input.reason, input.source, input.sourceEventId || null, JSON.stringify(input.action || {}), ['SUGGEST','ASK','ACT'].includes(input.policy) ? input.policy : 'SUGGEST', 'PENDING', input.dedupeKey, now, iso(input.expiresAt)); return hydrateSuggestion(db.prepare('SELECT * FROM proactivity_items WHERE id=?').get(id)); }
  function listSuggestions({ status = 'PENDING', limit = 50 } = {}) { const rows = status ? db.prepare('SELECT * FROM proactivity_items WHERE status=? ORDER BY importance DESC,created_at DESC LIMIT ?').all(status, Math.max(1,Math.min(Number(limit)||50,500))) : db.prepare('SELECT * FROM proactivity_items ORDER BY created_at DESC LIMIT ?').all(Math.max(1,Math.min(Number(limit)||50,500))); return rows.map(hydrateSuggestion); }
  function updateSuggestion(id, status) { if (!SUGGESTION_STATES.has(status)) throw new Error('Estado de sugestão inválido.'); db.prepare('UPDATE proactivity_items SET status=?,seen_at=CASE WHEN ? IN (\'SEEN\',\'DISMISSED\',\'ACTED\') THEN ? ELSE seen_at END WHERE id=?').run(status,status,new Date().toISOString(),id); return hydrateSuggestion(db.prepare('SELECT * FROM proactivity_items WHERE id=?').get(id)); }
  function deliveredToday(localDate) { return Number(db.prepare("SELECT COUNT(*) AS count FROM proactivity_items WHERE status IN ('SEEN','ACTED') AND substr(COALESCE(seen_at,created_at),1,10)=?").get(localDate).count); }
  function lastDelivered() { return hydrateSuggestion(db.prepare("SELECT * FROM proactivity_items WHERE status IN ('SEEN','ACTED') ORDER BY seen_at DESC LIMIT 1").get()); }

  function hydrateTrigger(row) { return row ? { id: row.id, name: row.name, eventPattern: row.event_pattern, conditions: parse(row.conditions_json, {}), action: parse(row.action_json, {}), policy: row.policy, capabilities: parse(row.capabilities_json, []), enabled: Boolean(row.enabled), cooldownMinutes: row.cooldown_minutes, lastFiredAt: row.last_fired_at, createdAt: row.created_at, updatedAt: row.updated_at } : null; }
  function createTrigger(input) { const now = new Date().toISOString(); const id = randomUUID(); const policy = ['SUGGEST','ASK','ACT'].includes(input.policy) ? input.policy : 'SUGGEST'; db.prepare('INSERT INTO personal_triggers (id,name,event_pattern,conditions_json,action_json,policy,capabilities_json,enabled,cooldown_minutes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,String(input.name||'Trigger').slice(0,120),String(input.eventPattern||'').slice(0,120),JSON.stringify(input.conditions||{}),JSON.stringify(input.action||{}),policy,JSON.stringify(Array.isArray(input.capabilities)?input.capabilities:[]),input.enabled===false?0:1,Math.max(1,Math.min(10080,Number(input.cooldownMinutes)||60)),now,now); return getTrigger(id); }
  function getTrigger(id) { return hydrateTrigger(db.prepare('SELECT * FROM personal_triggers WHERE id=?').get(id)); }
  function listTriggers(enabled = null) { const rows = enabled == null ? db.prepare('SELECT * FROM personal_triggers ORDER BY created_at DESC').all() : db.prepare('SELECT * FROM personal_triggers WHERE enabled=? ORDER BY created_at DESC').all(enabled?1:0); return rows.map(hydrateTrigger); }
  function markTriggerFired(id) { db.prepare('UPDATE personal_triggers SET last_fired_at=?,updated_at=? WHERE id=?').run(new Date().toISOString(),new Date().toISOString(),id); return getTrigger(id); }

  function hydrateConcept(row) { return row ? { id: row.id, scope: row.scope, name: row.name, mastery: row.mastery, confidence: row.confidence, lastReviewedAt: row.last_reviewed_at, nextReviewAt: row.next_review_at, mistakes: parse(row.mistakes_json, []), dependencies: parse(row.dependencies_json, []), enabled: Boolean(row.enabled), createdAt: row.created_at, updatedAt: row.updated_at } : null; }
  function upsertConcept(input) { const scope = String(input.scope||'learning:global').slice(0,300); const name = String(input.name||'').trim().slice(0,240); if(name.length<2) throw new Error('Conceito sem nome.'); const existing = db.prepare('SELECT * FROM learning_concepts WHERE scope=? AND name=?').get(scope,name); const now = new Date().toISOString(); const id=existing?.id||randomUUID(); db.prepare(`INSERT INTO learning_concepts (id,scope,name,mastery,confidence,last_reviewed_at,next_review_at,mistakes_json,dependencies_json,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(scope,name) DO UPDATE SET mastery=excluded.mastery,confidence=excluded.confidence,last_reviewed_at=excluded.last_reviewed_at,next_review_at=excluded.next_review_at,mistakes_json=excluded.mistakes_json,dependencies_json=excluded.dependencies_json,enabled=excluded.enabled,updated_at=excluded.updated_at`).run(id,scope,name,progress(input.mastery??existing?.mastery),progress(input.confidence??existing?.confidence??0.5),input.lastReviewedAt??existing?.last_reviewed_at??null,input.nextReviewAt===undefined?existing?.next_review_at??null:iso(input.nextReviewAt),JSON.stringify(input.mistakes??parse(existing?.mistakes_json,[])),JSON.stringify(input.dependencies??parse(existing?.dependencies_json,[])),input.enabled===false?0:1,existing?.created_at||now,now); return getConcept(id); }
  function getConcept(id) { return hydrateConcept(db.prepare('SELECT * FROM learning_concepts WHERE id=?').get(id)); }
  function listConcepts({ scope=null,dueBefore=null,limit=200 }={}) { const clauses=['enabled=1']; const params=[]; if(scope){clauses.push('scope=?');params.push(scope);} if(dueBefore){clauses.push('(next_review_at IS NULL OR next_review_at<=?)');params.push(iso(dueBefore));} params.push(Math.max(1,Math.min(Number(limit)||200,2000))); return db.prepare(`SELECT * FROM learning_concepts WHERE ${clauses.join(' AND ')} ORDER BY CASE WHEN next_review_at IS NULL THEN 1 ELSE 0 END,next_review_at,mastery ASC LIMIT ?`).all(...params).map(hydrateConcept); }
  function addStudySession(input) { const now=new Date().toISOString(); const id=randomUUID(); const mode=MODES.has(input.tutorMode)?input.tutorMode:'GUIDE'; db.prepare('INSERT INTO study_sessions (id,concept_id,scope,tutor_mode,score,result,questions_json,mistakes_json,started_at,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,input.conceptId||null,String(input.scope||'learning:global').slice(0,300),mode,input.score==null?null:progress(input.score),String(input.result||'').slice(0,4000),JSON.stringify(input.questions||[]),JSON.stringify(input.mistakes||[]),input.startedAt||now,now); return {id,...input,tutorMode:mode,completedAt:now}; }
  function listStudySessions(scope='learning:global',limit=100){return db.prepare('SELECT * FROM study_sessions WHERE scope=? ORDER BY completed_at DESC LIMIT ?').all(scope,Math.max(1,Math.min(Number(limit)||100,1000))).map(row=>({id:row.id,conceptId:row.concept_id,scope:row.scope,tutorMode:row.tutor_mode,score:row.score,result:row.result,questions:parse(row.questions_json,[]),mistakes:parse(row.mistakes_json,[]),startedAt:row.started_at,completedAt:row.completed_at}));}
  function clearLearning() { const sessions=Number(db.prepare('DELETE FROM study_sessions').run().changes); const concepts=Number(db.prepare('DELETE FROM learning_concepts').run().changes); return {concepts,sessions}; }
  function clearActivity() { const suggestions=Number(db.prepare('DELETE FROM proactivity_items').run().changes); const snapshots=Number(db.prepare('DELETE FROM daily_snapshots').run().changes); return {suggestions,snapshots}; }

  return { createGoal,getGoal,updateGoal,listGoals,clearGoals,createTask,getTask,updateTask,listTasks,getSettings,updateSettings,putSnapshot,getSnapshot,putSuggestion,listSuggestions,updateSuggestion,deliveredToday,lastDelivered,createTrigger,getTrigger,listTriggers,markTriggerFired,upsertConcept,getConcept,listConcepts,addStudySession,listStudySessions,clearLearning,clearActivity,health:()=>({version:'1.0.0',goals:listGoals({limit:10000}).length,tasks:listTasks({limit:10000}).length,suggestions:listSuggestions({status:null,limit:10000}).length,concepts:listConcepts({limit:10000}).length,proactivity:getSettings().proactivityLevel})};
}
