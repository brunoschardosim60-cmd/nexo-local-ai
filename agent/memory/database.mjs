import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function json(value, fallback = null) {
  try { return value == null ? fallback : JSON.parse(value); } catch { return fallback; }
}

export function createDatabase(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, 'nexo.db'));
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  const statements = [
    `CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY, objective TEXT NOT NULL, status TEXT NOT NULL,
      plan_json TEXT NOT NULL DEFAULT '[]', current_step INTEGER NOT NULL DEFAULT 0,
      steps_used INTEGER NOT NULL DEFAULT 0, max_steps INTEGER NOT NULL,
      max_retries INTEGER NOT NULL, parent_task_id TEXT, assigned_agent TEXT NOT NULL DEFAULT 'general', result_json TEXT, error TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS task_events (
      id TEXT PRIMARY KEY, task_id TEXT NOT NULL, sequence INTEGER NOT NULL,
      type TEXT NOT NULL, level TEXT NOT NULL, message TEXT NOT NULL,
      data_json TEXT, created_at TEXT NOT NULL,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS permissions (
      id TEXT PRIMARY KEY, task_id TEXT NOT NULL, tool TEXT NOT NULL,
      scope TEXT NOT NULL, risk TEXT NOT NULL, status TEXT NOT NULL,
      reason TEXT NOT NULL, input_json TEXT NOT NULL,
      created_at TEXT NOT NULL, resolved_at TEXT,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS tool_runs (
      id TEXT PRIMARY KEY, task_id TEXT NOT NULL, step_index INTEGER NOT NULL,
      tool TEXT NOT NULL, input_json TEXT NOT NULL, output_json TEXT, output_summary_json TEXT,
      status TEXT NOT NULL, attempt INTEGER NOT NULL, duration_ms REAL,
      error TEXT, created_at TEXT NOT NULL,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, content TEXT NOT NULL,
      vector_json TEXT NOT NULL, metadata_json TEXT, importance REAL NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.7, source TEXT NOT NULL DEFAULT 'agent',
      created_at TEXT NOT NULL, last_accessed_at TEXT NOT NULL, last_confirmed_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS document_chunks (
      id TEXT PRIMARY KEY, source TEXT NOT NULL, chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL, vector_json TEXT NOT NULL, metadata_json TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, state_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS task_nodes (
      task_id TEXT NOT NULL, id TEXT NOT NULL, parent_id TEXT, position INTEGER NOT NULL,
      title TEXT NOT NULL, objective TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL,
      dependencies_json TEXT NOT NULL DEFAULT '[]', attempts INTEGER NOT NULL DEFAULT 0,
      observations_json TEXT NOT NULL DEFAULT '[]', artifacts_json TEXT NOT NULL DEFAULT '[]',
      assigned_agent TEXT NOT NULL DEFAULT 'general', model TEXT, confidence REAL,
      success_criteria_json TEXT NOT NULL DEFAULT '[]', action_json TEXT, output_json TEXT, error TEXT,
      started_at TEXT, completed_at TEXT,
      PRIMARY KEY(task_id, id), FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS checkpoints (
      id TEXT PRIMARY KEY, task_id TEXT NOT NULL, sequence INTEGER NOT NULL,
      kind TEXT NOT NULL, label TEXT NOT NULL, state_json TEXT NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS repository_maps (
      root TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, map_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS runtime_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL, level TEXT NOT NULL, task_id TEXT, source TEXT NOT NULL,
      data_json TEXT, created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS background_jobs (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, objective TEXT NOT NULL,
      schedule_type TEXT NOT NULL, interval_seconds INTEGER, next_run_at TEXT NOT NULL,
      status TEXT NOT NULL, last_run_at TEXT, last_task_id TEXT, run_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS skill_states (
      path TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS extension_state (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, version TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'AVAILABLE', config_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, version TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0,
      definition_json TEXT NOT NULL, state_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS workflow_runs (
      id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, status TEXT NOT NULL, input_json TEXT NOT NULL DEFAULT '{}',
      state_json TEXT NOT NULL DEFAULT '{}', error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY(workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS browser_sessions (
      id TEXT PRIMARY KEY, current_url TEXT NOT NULL, title TEXT NOT NULL,
      history_json TEXT NOT NULL DEFAULT '[]', snapshot_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS personality_traits (
      trait TEXT PRIMARY KEY, value REAL NOT NULL, confidence REAL NOT NULL,
      evidence_count INTEGER NOT NULL DEFAULT 0, contradiction_count INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'adaptive', updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS personality_observations (
      id TEXT PRIMARY KEY, trait TEXT NOT NULL, target_value REAL NOT NULL,
      confidence REAL NOT NULL, explicit INTEGER NOT NULL DEFAULT 0,
      context TEXT NOT NULL, signal TEXT NOT NULL, created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS model_benchmarks (
      model TEXT NOT NULL, domain TEXT NOT NULL, score REAL NOT NULL,
      sample_count INTEGER NOT NULL DEFAULT 0, median_latency_ms REAL,
      metadata_json TEXT, updated_at TEXT NOT NULL,
      PRIMARY KEY(model, domain)
    )`,
    `CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, mime_type TEXT NOT NULL, provider TEXT NOT NULL,
      model TEXT, location TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}', source_task TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS artifact_edges (
      parent_id TEXT NOT NULL, child_id TEXT NOT NULL, relation TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL,
      PRIMARY KEY(parent_id, child_id, relation), FOREIGN KEY(parent_id) REFERENCES artifacts(id) ON DELETE CASCADE, FOREIGN KEY(child_id) REFERENCES artifacts(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS media_jobs (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL, priority INTEGER NOT NULL,
      input_json TEXT NOT NULL, artifact_id TEXT, error TEXT, created_at TEXT NOT NULL,
      started_at TEXT, completed_at TEXT, cancelled_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS performance_samples (
      id TEXT PRIMARY KEY, route TEXT NOT NULL, cold INTEGER NOT NULL DEFAULT 0,
      runtime_overhead_ms REAL, ttft_ms REAL, total_ms REAL, prompt_tokens INTEGER,
      completion_tokens INTEGER, ram_mb REAL, vram_mb REAL, tool_calls INTEGER NOT NULL DEFAULT 0,
      model_calls INTEGER NOT NULL DEFAULT 0, metadata_json TEXT, created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS task_hypotheses (
      id TEXT PRIMARY KEY, task_id TEXT NOT NULL, hypothesis TEXT NOT NULL, evidence_for_json TEXT NOT NULL DEFAULT '[]',
      evidence_against_json TEXT NOT NULL DEFAULT '[]', experiment TEXT NOT NULL, outcome TEXT, confidence REAL NOT NULL,
      status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS capability_grants (
      id TEXT PRIMARY KEY, task_id TEXT NOT NULL, agent TEXT NOT NULL, namespaces_json TEXT NOT NULL, scopes_json TEXT NOT NULL,
      expires_at TEXT NOT NULL, revoked_at TEXT, created_at TEXT NOT NULL,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS agent_messages (
      id TEXT PRIMARY KEY, task_id TEXT, sender TEXT NOT NULL, receiver TEXT NOT NULL, type TEXT NOT NULL,
      content_json TEXT NOT NULL, evidence_json TEXT NOT NULL DEFAULT '[]', artifact_ids_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS project_workspaces (
      id TEXT PRIMARY KEY, root TEXT NOT NULL UNIQUE, name TEXT NOT NULL, state_json TEXT NOT NULL DEFAULT '{}',
      instructions_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS memory_conflicts (
      id TEXT PRIMARY KEY, old_memory_id TEXT, new_memory_id TEXT, resolution TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN', reason TEXT NOT NULL, evidence_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL, resolved_at TEXT,
      FOREIGN KEY(old_memory_id) REFERENCES memories(id) ON DELETE SET NULL,
      FOREIGN KEY(new_memory_id) REFERENCES memories(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS knowledge_entities (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, normalized TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'global', metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(type, normalized, scope)
    )`,
    `CREATE TABLE IF NOT EXISTS knowledge_relations (
      id TEXT PRIMARY KEY, from_entity_id TEXT NOT NULL, to_entity_id TEXT NOT NULL, type TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.7, source_memory_id TEXT, status TEXT NOT NULL DEFAULT 'ACTIVE',
      metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(from_entity_id, to_entity_id, type, source_memory_id),
      FOREIGN KEY(from_entity_id) REFERENCES knowledge_entities(id) ON DELETE CASCADE,
      FOREIGN KEY(to_entity_id) REFERENCES knowledge_entities(id) ON DELETE CASCADE,
      FOREIGN KEY(source_memory_id) REFERENCES memories(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS document_sources (
      source TEXT PRIMARY KEY, content_hash TEXT NOT NULL, mtime_ms REAL, size INTEGER,
      source_version TEXT, embedding_model TEXT NOT NULL, last_verified_at TEXT NOT NULL,
      indexed_at TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}'
    )`,
    `CREATE TABLE IF NOT EXISTS session_handoffs (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, scope TEXT NOT NULL DEFAULT 'global',
      state_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS embedding_spaces (
      model TEXT PRIMARY KEY, dimensions INTEGER NOT NULL, version TEXT NOT NULL,
      compatible INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
    )`,
    `CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      id UNINDEXED, kind UNINDEXED, content, tokenize='unicode61 remove_diacritics 2'
    )`,
    `CREATE VIRTUAL TABLE IF NOT EXISTS document_chunks_fts USING fts5(
      id UNINDEXED, source UNINDEXED, content, tokenize='unicode61 remove_diacritics 2'
    )`,
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_task_events_task_sequence ON task_events(task_id, sequence)',
    'CREATE INDEX IF NOT EXISTS idx_tasks_status_updated ON tasks(status, updated_at)',
    'CREATE INDEX IF NOT EXISTS idx_permissions_task_status ON permissions(task_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_tool_runs_task_step ON tool_runs(task_id, step_index)',
    'CREATE INDEX IF NOT EXISTS idx_memories_kind_accessed ON memories(kind, last_accessed_at)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_document_chunks_source_index ON document_chunks(source, chunk_index)',
    'CREATE INDEX IF NOT EXISTS idx_task_nodes_ready ON task_nodes(task_id, status, position)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_checkpoints_task_sequence ON checkpoints(task_id, sequence)',
    'CREATE INDEX IF NOT EXISTS idx_runtime_events_type_sequence ON runtime_events(type, sequence DESC)',
    'CREATE INDEX IF NOT EXISTS idx_extension_state_kind_enabled ON extension_state(kind, enabled)',
    'CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_status ON workflow_runs(workflow_id, status, updated_at DESC)',
    "CREATE INDEX IF NOT EXISTS idx_background_jobs_due ON background_jobs(status, next_run_at) WHERE status = 'active'",
    'CREATE INDEX IF NOT EXISTS idx_browser_sessions_updated ON browser_sessions(updated_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_personality_observations_trait_created ON personality_observations(trait, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_memory_conflicts_status_created ON memory_conflicts(status, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_entities_scope_name ON knowledge_entities(scope, normalized)',
    'CREATE INDEX IF NOT EXISTS idx_relations_from_type ON knowledge_relations(from_entity_id, type, status)',
    'CREATE INDEX IF NOT EXISTS idx_relations_to_type ON knowledge_relations(to_entity_id, type, status)',
    'CREATE INDEX IF NOT EXISTS idx_handoffs_session_updated ON session_handoffs(session_id, updated_at DESC)',
  ];
  for (const statement of statements) db.prepare(statement).run();
  const memoryColumns = new Set(db.prepare('PRAGMA table_info(memories)').all().map(column => column.name));
  if (!memoryColumns.has('confidence')) db.prepare('ALTER TABLE memories ADD COLUMN confidence REAL NOT NULL DEFAULT 0.7').run();
  if (!memoryColumns.has('source')) db.prepare("ALTER TABLE memories ADD COLUMN source TEXT NOT NULL DEFAULT 'agent'").run();
  if (!memoryColumns.has('last_confirmed_at')) db.prepare('ALTER TABLE memories ADD COLUMN last_confirmed_at TEXT').run();
  if (!memoryColumns.has('vector_model')) db.prepare("ALTER TABLE memories ADD COLUMN vector_model TEXT NOT NULL DEFAULT 'lexical-hash-v1'").run();
  if (!memoryColumns.has('access_count')) db.prepare('ALTER TABLE memories ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0').run();
  if (!memoryColumns.has('forgotten_at')) db.prepare('ALTER TABLE memories ADD COLUMN forgotten_at TEXT').run();
  if (!memoryColumns.has('reinforcement_count')) db.prepare('ALTER TABLE memories ADD COLUMN reinforcement_count INTEGER NOT NULL DEFAULT 0').run();
  if (!memoryColumns.has('contradiction_count')) db.prepare('ALTER TABLE memories ADD COLUMN contradiction_count INTEGER NOT NULL DEFAULT 0').run();
  const memoryV3Columns = [
    ['summary', "TEXT NOT NULL DEFAULT ''"], ['entities_json', "TEXT NOT NULL DEFAULT '[]'"],
    ['topics_json', "TEXT NOT NULL DEFAULT '[]'"], ['scope', "TEXT NOT NULL DEFAULT 'global'"],
    ['privacy', "TEXT NOT NULL DEFAULT 'LOCAL_ONLY'"], ['status', "TEXT NOT NULL DEFAULT 'ACTIVE'"],
    ['updated_at', 'TEXT'], ['expires_at', 'TEXT'], ['valid_from', 'TEXT'], ['valid_until', 'TEXT'],
    ['observed_at', 'TEXT'], ['superseded_by', 'TEXT'],
  ];
  for (const [name, definition] of memoryV3Columns) if (!memoryColumns.has(name)) db.prepare(`ALTER TABLE memories ADD COLUMN ${name} ${definition}`).run();
  db.prepare("UPDATE memories SET updated_at = COALESCE(updated_at, created_at), observed_at = COALESCE(observed_at, created_at), status = CASE WHEN forgotten_at IS NOT NULL THEN 'FORGOTTEN' ELSE COALESCE(status, 'ACTIVE') END").run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_memories_scope_status_kind ON memories(scope, status, kind, last_accessed_at DESC)').run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_memories_active_importance ON memories(importance DESC, confidence DESC) WHERE status = 'ACTIVE'").run();
  const documentColumns = new Set(db.prepare('PRAGMA table_info(document_chunks)').all().map(column => column.name));
  if (!documentColumns.has('vector_model')) db.prepare("ALTER TABLE document_chunks ADD COLUMN vector_model TEXT NOT NULL DEFAULT 'lexical-hash-v1'").run();
  const taskColumns = new Set(db.prepare('PRAGMA table_info(tasks)').all().map(column => column.name));
  if (!taskColumns.has('parent_task_id')) db.prepare('ALTER TABLE tasks ADD COLUMN parent_task_id TEXT').run();
  if (!taskColumns.has('assigned_agent')) db.prepare("ALTER TABLE tasks ADD COLUMN assigned_agent TEXT NOT NULL DEFAULT 'general'").run();
  if (!taskColumns.has('goal_json')) db.prepare("ALTER TABLE tasks ADD COLUMN goal_json TEXT NOT NULL DEFAULT '{}'").run();
  if (!taskColumns.has('budgets_json')) db.prepare("ALTER TABLE tasks ADD COLUMN budgets_json TEXT NOT NULL DEFAULT '{}'").run();
  if (!taskColumns.has('usage_json')) db.prepare("ALTER TABLE tasks ADD COLUMN usage_json TEXT NOT NULL DEFAULT '{}'").run();
  if (!taskColumns.has('working_memory_json')) db.prepare("ALTER TABLE tasks ADD COLUMN working_memory_json TEXT NOT NULL DEFAULT '{}'").run();
  if (!taskColumns.has('capability_id')) db.prepare('ALTER TABLE tasks ADD COLUMN capability_id TEXT').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_tasks_parent_updated ON tasks(parent_task_id, updated_at)').run();
  const toolRunColumns = new Set(db.prepare('PRAGMA table_info(tool_runs)').all().map(column => column.name));
  if (!toolRunColumns.has('error_kind')) db.prepare('ALTER TABLE tool_runs ADD COLUMN error_kind TEXT').run();
  if (!toolRunColumns.has('output_summary_json')) db.prepare('ALTER TABLE tool_runs ADD COLUMN output_summary_json TEXT').run();
  const runtimeEventColumns = new Set(db.prepare('PRAGMA table_info(runtime_events)').all().map(column => column.name));
  if (!runtimeEventColumns.has('trust')) db.prepare("ALTER TABLE runtime_events ADD COLUMN trust TEXT NOT NULL DEFAULT 'TRUSTED'").run();
  db.prepare('INSERT INTO memories_fts (id, kind, content) SELECT m.id, m.kind, m.content FROM memories m WHERE NOT EXISTS (SELECT 1 FROM memories_fts f WHERE f.id = m.id)').run();
  db.prepare('INSERT INTO document_chunks_fts (id, source, content) SELECT d.id, d.source, d.content FROM document_chunks d WHERE NOT EXISTS (SELECT 1 FROM document_chunks_fts f WHERE f.id = d.id)').run();
  db.exec('PRAGMA optimize');

  function ftsQuery(query) {
    const tokens = String(query).normalize('NFKC').match(/[\p{L}\p{N}_-]{2,}/gu)?.slice(0, 12) || [];
    return tokens.map(token => `"${token.replace(/"/g, '""')}"*`).join(' OR ');
  }

  function hydrateTask(row) {
    if (!row) return null;
    return {
      id: row.id, objective: row.objective, status: row.status,
      plan: json(row.plan_json, []), currentStep: row.current_step, stepsUsed: row.steps_used,
      maxSteps: row.max_steps, maxRetries: row.max_retries,
      parentTaskId: row.parent_task_id, assignedAgent: row.assigned_agent || 'general',
      goal: json(row.goal_json, {}), budgets: json(row.budgets_json, {}), usage: json(row.usage_json, {}), workingMemory: json(row.working_memory_json, {}), capabilityId: row.capability_id,
      result: json(row.result_json), error: row.error,
      createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at,
    };
  }

  function createTask({ objective, maxSteps, maxRetries, parentTaskId = null, assignedAgent = 'general', goal = {}, budgets = {}, usage = {}, workingMemory = {}, capabilityId = null }) {
    const id = randomUUID(); const now = new Date().toISOString();
    db.prepare('INSERT INTO tasks (id, objective, status, max_steps, max_retries, parent_task_id, assigned_agent, goal_json, budgets_json, usage_json, working_memory_json, capability_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, objective, 'planning', maxSteps, maxRetries, parentTaskId, assignedAgent, JSON.stringify(goal), JSON.stringify(budgets), JSON.stringify(usage), JSON.stringify(workingMemory), capabilityId, now, now);
    return getTask(id);
  }
  function getTask(id) { return hydrateTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)); }
  function listTasks(limit = 30) { return db.prepare('SELECT * FROM tasks ORDER BY updated_at DESC LIMIT ?').all(limit).map(hydrateTask); }
  function listChildTasks(parentTaskId) { return db.prepare('SELECT * FROM tasks WHERE parent_task_id = ? ORDER BY created_at ASC').all(parentTaskId).map(hydrateTask); }
  function updateTask(id, patch) {
    const current = getTask(id); if (!current) throw new Error('Tarefa não encontrada.');
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    db.prepare(`UPDATE tasks SET status=?, plan_json=?, current_step=?, steps_used=?, result_json=?, error=?, goal_json=?, budgets_json=?, usage_json=?, working_memory_json=?, capability_id=?, updated_at=?, completed_at=? WHERE id=?`)
      .run(next.status, JSON.stringify(next.plan || []), next.currentStep, next.stepsUsed, next.result == null ? null : JSON.stringify(next.result), next.error || null, JSON.stringify(next.goal || {}), JSON.stringify(next.budgets || {}), JSON.stringify(next.usage || {}), JSON.stringify(next.workingMemory || {}), next.capabilityId || null, next.updatedAt, next.completedAt || null, id);
    return getTask(id);
  }
  function incrementTaskUsage(id, patch = {}) { const task = getTask(id); if (!task) throw new Error('Tarefa não encontrada.'); const usage = { modelCalls: 0, toolCalls: 0, tokens: 0, cost: 0, ...task.usage }; for (const [key, value] of Object.entries(patch)) usage[key] = Number(usage[key] || 0) + Number(value || 0); return updateTask(id, { usage }); }
  function mergeWorkingMemory(id, patch = {}) { const task = getTask(id); if (!task) throw new Error('Tarefa não encontrada.'); return updateTask(id, { workingMemory: { ...task.workingMemory, ...patch, updatedAt: new Date().toISOString() } }); }
  function addEvent(taskId, type, message, data = null, level = 'info') {
    const sequence = Number(db.prepare('SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM task_events WHERE task_id = ?').get(taskId).next);
    const event = { id: randomUUID(), taskId, sequence, type, level, message, data, createdAt: new Date().toISOString() };
    db.prepare('INSERT INTO task_events (id, task_id, sequence, type, level, message, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(event.id, taskId, sequence, type, level, message, data == null ? null : JSON.stringify(data), event.createdAt);
    return event;
  }
  function getEvents(taskId, limit = 100) {
    return db.prepare('SELECT * FROM task_events WHERE task_id = ? ORDER BY sequence ASC LIMIT ?').all(taskId, limit).map(row => ({
      id: row.id, taskId: row.task_id, sequence: row.sequence, type: row.type, level: row.level,
      message: row.message, data: json(row.data_json), createdAt: row.created_at,
    }));
  }
  function addToolRun(run) {
    const id = randomUUID(); const createdAt = new Date().toISOString();
    db.prepare('INSERT INTO tool_runs (id, task_id, step_index, tool, input_json, output_json, output_summary_json, status, attempt, duration_ms, error, error_kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, run.taskId, run.stepIndex, run.tool, JSON.stringify(run.input || {}), run.output == null ? null : JSON.stringify(run.output), run.summary == null ? null : JSON.stringify(run.summary), run.status, run.attempt, run.durationMs ?? null, run.error || null, run.errorKind || null, createdAt);
    return { id, ...run, createdAt };
  }
  function getToolRuns(taskId) {
    return db.prepare('SELECT * FROM tool_runs WHERE task_id = ? ORDER BY created_at ASC').all(taskId).map(row => ({
      id: row.id, taskId: row.task_id, stepIndex: row.step_index, tool: row.tool,
      input: json(row.input_json, {}), output: json(row.output_summary_json, json(row.output_json)), status: row.status,
      attempt: row.attempt, durationMs: row.duration_ms, error: row.error, errorKind: row.error_kind, createdAt: row.created_at,
    }));
  }
  function getToolRunFull(id) { const row = db.prepare('SELECT * FROM tool_runs WHERE id=?').get(id); if (!row) return null; return { id: row.id, taskId: row.task_id, stepIndex: row.step_index, tool: row.tool, input: json(row.input_json, {}), output: json(row.output_json), summary: json(row.output_summary_json, json(row.output_json)), status: row.status, attempt: row.attempt, durationMs: row.duration_ms, error: row.error, errorKind: row.error_kind, createdAt: row.created_at }; }
  function createPermission(permission) {
    const record = { id: randomUUID(), status: 'pending', createdAt: new Date().toISOString(), ...permission };
    db.prepare('INSERT INTO permissions (id, task_id, tool, scope, risk, status, reason, input_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(record.id, record.taskId, record.tool, record.scope, record.risk, record.status, record.reason, JSON.stringify(record.input || {}), record.createdAt);
    return record;
  }
  function resolvePermission(id, status) {
    if (!['approved', 'denied'].includes(status)) throw new Error('Decisão de permissão inválida.');
    db.prepare('UPDATE permissions SET status = ?, resolved_at = ? WHERE id = ? AND status = ?').run(status, new Date().toISOString(), id, 'pending');
    return getPermission(id);
  }
  function getPermission(id) {
    const row = db.prepare('SELECT * FROM permissions WHERE id = ?').get(id); if (!row) return null;
    return { id: row.id, taskId: row.task_id, tool: row.tool, scope: row.scope, risk: row.risk, status: row.status, reason: row.reason, input: json(row.input_json, {}), createdAt: row.created_at, resolvedAt: row.resolved_at };
  }
  function getPermissions(taskId) { return db.prepare('SELECT id FROM permissions WHERE task_id = ? ORDER BY created_at ASC').all(taskId).map(row => getPermission(row.id)); }
  function hydrateMemory(row) { return row ? ({
    id: row.id, type: row.kind, kind: row.kind, content: row.content, summary: row.summary || '',
    vector: json(row.vector_json, []), embedding: json(row.vector_json, []), vectorModel: row.vector_model,
    entities: json(row.entities_json, []), topics: json(row.topics_json, []), metadata: json(row.metadata_json, {}),
    scope: row.scope || 'global', privacy: row.privacy || 'LOCAL_ONLY', status: row.status || 'ACTIVE',
    importance: row.importance, confidence: row.confidence, source: row.source,
    accessCount: row.access_count, reinforcementCount: row.reinforcement_count, contradictionCount: row.contradiction_count,
    createdAt: row.created_at, updatedAt: row.updated_at || row.created_at, lastAccessedAt: row.last_accessed_at,
    lastConfirmedAt: row.last_confirmed_at, observedAt: row.observed_at || row.created_at,
    validFrom: row.valid_from, validUntil: row.valid_until, expiresAt: row.expires_at,
    supersededBy: row.superseded_by, forgottenAt: row.forgotten_at,
  }) : null; }
  function getMemory(id) { return hydrateMemory(db.prepare('SELECT * FROM memories WHERE id = ?').get(id)); }
  function putMemory(memory) {
    const id = memory.id || randomUUID(); const now = new Date().toISOString();
    db.prepare(`INSERT INTO memories (
      id, kind, content, summary, vector_json, vector_model, entities_json, topics_json, metadata_json,
      scope, privacy, status, importance, confidence, source, created_at, updated_at, last_accessed_at,
      last_confirmed_at, observed_at, valid_from, valid_until, expires_at, superseded_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, memory.type || memory.kind, memory.content, memory.summary || '', JSON.stringify(memory.embedding || memory.vector || []), memory.vectorModel || 'lexical-hash-v1',
        JSON.stringify(memory.entities || []), JSON.stringify(memory.topics || []), JSON.stringify(memory.metadata || {}), memory.scope || 'global',
        memory.privacy || 'LOCAL_ONLY', memory.status || 'ACTIVE', memory.importance ?? 0.5, memory.confidence ?? 0.7,
        memory.source || 'AGENT', memory.createdAt || now, now, now, memory.lastConfirmedAt || null, memory.observedAt || now,
        memory.validFrom || null, memory.validUntil || null, memory.expiresAt || null, memory.supersededBy || null);
    db.prepare('INSERT INTO memories_fts (id, kind, content) VALUES (?, ?, ?)').run(id, memory.type || memory.kind, `${memory.summary || ''} ${memory.content}`.trim());
    return id;
  }
  function listMemories(options = 500) {
    if (typeof options === 'number') options = { limit: options };
    const { limit = 500, scope = null, kind = null, status = ['ACTIVE', 'UNCERTAIN'], includeExpired = false } = options || {};
    const clauses = []; const parameters = [];
    if (scope) { clauses.push('scope = ?'); parameters.push(scope); }
    if (kind) { clauses.push('kind = ?'); parameters.push(kind); }
    if (status?.length) { clauses.push(`status IN (${status.map(() => '?').join(',')})`); parameters.push(...status); }
    if (!includeExpired) { clauses.push('(expires_at IS NULL OR expires_at > ?)'); parameters.push(new Date().toISOString()); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    parameters.push(Math.max(1, Math.min(Number(limit) || 500, 10_000)));
    return db.prepare(`SELECT * FROM memories ${where} ORDER BY importance DESC, confidence DESC, last_accessed_at DESC LIMIT ?`).all(...parameters).map(hydrateMemory);
  }
  function touchMemory(id) { db.prepare('UPDATE memories SET last_accessed_at = ?, access_count = access_count + 1 WHERE id = ?').run(new Date().toISOString(), id); }
  function updateMemoryVector(id, vector, vectorModel) { db.prepare('UPDATE memories SET vector_json = ?, vector_model = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(vector), vectorModel, new Date().toISOString(), id); }
  function updateMemory(id, patch = {}) {
    const current = getMemory(id); if (!current) return null;
    const next = { ...current, ...patch, metadata: { ...current.metadata, ...patch.metadata }, updatedAt: new Date().toISOString() };
    db.prepare(`UPDATE memories SET kind=?, content=?, summary=?, entities_json=?, topics_json=?, metadata_json=?, scope=?, privacy=?, status=?,
      importance=?, confidence=?, source=?, updated_at=?, last_confirmed_at=?, observed_at=?, valid_from=?, valid_until=?, expires_at=?, superseded_by=? WHERE id=?`)
      .run(next.type || next.kind, next.content, next.summary || '', JSON.stringify(next.entities || []), JSON.stringify(next.topics || []), JSON.stringify(next.metadata || {}),
        next.scope, next.privacy, next.status, next.importance, next.confidence, next.source, next.updatedAt, next.lastConfirmedAt || null,
        next.observedAt || next.createdAt, next.validFrom || null, next.validUntil || null, next.expiresAt || null, next.supersededBy || null, id);
    if (patch.content != null || patch.summary != null || patch.kind != null || patch.type != null) {
      db.prepare('DELETE FROM memories_fts WHERE id = ?').run(id);
      db.prepare('INSERT INTO memories_fts (id, kind, content) VALUES (?, ?, ?)').run(id, next.type || next.kind, `${next.summary || ''} ${next.content}`.trim());
    }
    return getMemory(id);
  }
  function setMemoryStatus(id, status, { supersededBy = null } = {}) {
    if (!['ACTIVE', 'UNCERTAIN', 'SUPERSEDED', 'FORGOTTEN', 'DELETED'].includes(status)) throw new Error('Status de memória inválido.');
    const now = new Date().toISOString();
    db.prepare('UPDATE memories SET status=?, superseded_by=COALESCE(?, superseded_by), forgotten_at=CASE WHEN ? = \'FORGOTTEN\' THEN ? ELSE forgotten_at END, updated_at=? WHERE id=?').run(status, supersededBy, status, now, now, id);
    return getMemory(id);
  }
  function deleteMemory(id) {
    const current = getMemory(id); if (!current) return false;
    db.prepare('DELETE FROM memories_fts WHERE id = ?').run(id);
    db.prepare('DELETE FROM memories WHERE id = ?').run(id);
    return true;
  }
  function reinforceMemory(id, { importance = 0.5, confidence = 0.7, confirmedAt = null } = {}) {
    db.prepare('UPDATE memories SET reinforcement_count = reinforcement_count + 1, importance = MIN(1, MAX(importance, ?)), confidence = MIN(0.99, MAX(confidence, ?)), last_confirmed_at = COALESCE(?, last_confirmed_at), last_accessed_at = ? WHERE id = ?').run(importance, confidence, confirmedAt, new Date().toISOString(), id);
    return getMemory(id);
  }
  function contradictMemory(id) { db.prepare('UPDATE memories SET contradiction_count = contradiction_count + 1, confidence = MAX(0.1, confidence - 0.18), updated_at = ? WHERE id = ?').run(new Date().toISOString(), id); }
  function forgetMemories(cutoffIso, maxImportance = 0.25, maxConfidence = 0.45) {
    const now = new Date().toISOString();
    return Number(db.prepare("UPDATE memories SET forgotten_at = ?, status = 'FORGOTTEN', updated_at = ? WHERE status IN ('ACTIVE','UNCERTAIN') AND created_at < ? AND importance <= ? AND confidence <= ? AND last_confirmed_at IS NULL").run(now, now, cutoffIso, maxImportance, maxConfidence).changes);
  }
  function searchMemoriesText(query, limit = 50) {
    const match = ftsQuery(query); if (!match) return [];
    return db.prepare('SELECT id, bm25(memories_fts) AS rank FROM memories_fts WHERE memories_fts MATCH ? ORDER BY rank LIMIT ?').all(match, limit).map(row => ({ id: row.id, rank: row.rank }));
  }
  function recordMemoryConflict({ oldMemoryId = null, newMemoryId = null, resolution = 'UNCERTAIN', status = 'OPEN', reason, evidence = [] }) {
    const record = { id: randomUUID(), oldMemoryId, newMemoryId, resolution, status, reason, evidence, createdAt: new Date().toISOString() };
    db.prepare('INSERT INTO memory_conflicts (id,old_memory_id,new_memory_id,resolution,status,reason,evidence_json,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(record.id, oldMemoryId, newMemoryId, resolution, status, reason, JSON.stringify(evidence), record.createdAt);
    return record;
  }
  function listMemoryConflicts(status = null, limit = 100) {
    const rows = status ? db.prepare('SELECT * FROM memory_conflicts WHERE status=? ORDER BY created_at DESC LIMIT ?').all(status, limit) : db.prepare('SELECT * FROM memory_conflicts ORDER BY created_at DESC LIMIT ?').all(limit);
    return rows.map(row => ({ id: row.id, oldMemoryId: row.old_memory_id, newMemoryId: row.new_memory_id, resolution: row.resolution, status: row.status, reason: row.reason, evidence: json(row.evidence_json, []), createdAt: row.created_at, resolvedAt: row.resolved_at }));
  }
  function resolveMemoryConflict(id, resolution) { db.prepare("UPDATE memory_conflicts SET resolution=?, status='RESOLVED', resolved_at=? WHERE id=?").run(resolution, new Date().toISOString(), id); return listMemoryConflicts(null, 1000).find(item => item.id === id) || null; }
  function replaceDocumentChunks(source, chunks) {
    db.prepare('DELETE FROM document_chunks_fts WHERE source = ?').run(source);
    db.prepare('DELETE FROM document_chunks WHERE source = ?').run(source);
    const insert = db.prepare('INSERT INTO document_chunks (id, source, chunk_index, content, vector_json, vector_model, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const now = new Date().toISOString();
    const insertFts = db.prepare('INSERT INTO document_chunks_fts (id, source, content) VALUES (?, ?, ?)');
    for (const chunk of chunks) { const id = randomUUID(); insert.run(id, source, chunk.index, chunk.content, JSON.stringify(chunk.vector), chunk.vectorModel || 'lexical-hash-v1', JSON.stringify(chunk.metadata || {}), now, now); insertFts.run(id, source, chunk.content); }
  }
  function listDocumentChunks(limit = 2000) { return db.prepare('SELECT * FROM document_chunks ORDER BY source, chunk_index LIMIT ?').all(limit).map(row => ({ id: row.id, source: row.source, index: row.chunk_index, content: row.content, vector: json(row.vector_json, []), vectorModel: row.vector_model, metadata: json(row.metadata_json, {}) })); }
  function updateDocumentChunkVector(id, vector, vectorModel) { db.prepare('UPDATE document_chunks SET vector_json = ?, vector_model = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(vector), vectorModel, new Date().toISOString(), id); }
  function searchDocumentChunksText(query, limit = 80) {
    const match = ftsQuery(query); if (!match) return [];
    return db.prepare('SELECT id, bm25(document_chunks_fts) AS rank FROM document_chunks_fts WHERE document_chunks_fts MATCH ? ORDER BY rank LIMIT ?').all(match, limit).map(row => ({ id: row.id, rank: row.rank }));
  }
  function putSession(id, state) {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO sessions (id, state_json, created_at, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json, updated_at=excluded.updated_at`)
      .run(id, JSON.stringify(state || {}), now, now);
    return getSession(id);
  }
  function getSession(id) {
    const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
    return row ? { id: row.id, state: json(row.state_json, {}), createdAt: row.created_at, updatedAt: row.updated_at } : null;
  }

  function replaceTaskGraph(taskId, nodes) {
    const insert = db.prepare(`INSERT INTO task_nodes (
      task_id,id,parent_id,position,title,objective,description,status,dependencies_json,attempts,
      observations_json,artifacts_json,assigned_agent,model,confidence,success_criteria_json,action_json,output_json,error,started_at,completed_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM task_nodes WHERE task_id = ?').run(taskId);
      nodes.forEach((node, position) => insert.run(
        taskId, node.id, node.parentId || null, position, node.title, node.objective || node.description, node.description,
        node.status || 'pending', JSON.stringify(node.dependencies || []), node.attempts || 0,
        JSON.stringify(node.observations || []), JSON.stringify(node.artifacts || []), node.assignedAgent || 'general',
        node.model || null, node.confidence ?? null, JSON.stringify(node.successCriteria || []),
        node.action ? JSON.stringify(node.action) : null, node.output == null ? null : JSON.stringify(node.output), node.error || null,
        node.startedAt || null, node.completedAt || null,
      ));
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return getTaskGraph(taskId);
  }
  function getTaskGraph(taskId) {
    return db.prepare('SELECT * FROM task_nodes WHERE task_id = ? ORDER BY position ASC').all(taskId).map(row => ({
      id: row.id, taskId: row.task_id, parentId: row.parent_id, title: row.title, objective: row.objective,
      description: row.description, status: row.status, dependencies: json(row.dependencies_json, []), attempts: row.attempts,
      observations: json(row.observations_json, []), artifacts: json(row.artifacts_json, []), assignedAgent: row.assigned_agent,
      model: row.model, confidence: row.confidence, successCriteria: json(row.success_criteria_json, []),
      action: json(row.action_json), output: json(row.output_json), error: row.error, startedAt: row.started_at, completedAt: row.completed_at,
    }));
  }
  function putCheckpoint(taskId, kind, label, state) {
    const sequence = Number(db.prepare('SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM checkpoints WHERE task_id = ?').get(taskId).next);
    const checkpoint = { id: randomUUID(), taskId, sequence, kind, label, state, createdAt: new Date().toISOString() };
    db.prepare('INSERT INTO checkpoints (id, task_id, sequence, kind, label, state_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(checkpoint.id, taskId, sequence, kind, label, JSON.stringify(state), checkpoint.createdAt);
    return checkpoint;
  }
  function listCheckpoints(taskId, limit = 30) {
    return db.prepare('SELECT * FROM checkpoints WHERE task_id = ? ORDER BY sequence DESC LIMIT ?').all(taskId, limit).map(row => ({
      id: row.id, taskId: row.task_id, sequence: row.sequence, kind: row.kind, label: row.label, state: json(row.state_json, {}), createdAt: row.created_at,
    }));
  }
  function pruneCheckpoints(taskId, keep = 30) {
    db.prepare('DELETE FROM checkpoints WHERE task_id = ? AND sequence NOT IN (SELECT sequence FROM checkpoints WHERE task_id = ? ORDER BY sequence DESC LIMIT ?)').run(taskId, taskId, keep);
  }
  function putRepositoryMap(root, fingerprint, map) {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO repository_maps (root, fingerprint, map_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(root) DO UPDATE SET fingerprint=excluded.fingerprint, map_json=excluded.map_json, updated_at=excluded.updated_at`)
      .run(root, fingerprint, JSON.stringify(map), now, now);
    return getRepositoryMap(root);
  }
  function getRepositoryMap(root) {
    const row = db.prepare('SELECT * FROM repository_maps WHERE root = ?').get(root);
    return row ? { root: row.root, fingerprint: row.fingerprint, map: json(row.map_json, {}), createdAt: row.created_at, updatedAt: row.updated_at } : null;
  }
  function listInterruptedTasks(limit = 50) {
    return db.prepare("SELECT * FROM tasks WHERE status IN ('planning','running') ORDER BY updated_at ASC LIMIT ?").all(limit).map(hydrateTask);
  }

  function addRuntimeEvent(type, data = null, { level = 'info', taskId = null, source = 'core', trust = 'TRUSTED' } = {}) {
    const event = { id: randomUUID(), type, level, taskId, source, trust, data, createdAt: new Date().toISOString() };
    const result = db.prepare('INSERT INTO runtime_events (id, type, level, task_id, source, trust, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(event.id, event.type, event.level, event.taskId, event.source, event.trust, data == null ? null : JSON.stringify(data), event.createdAt);
    return { sequence: Number(result.lastInsertRowid), ...event };
  }
  function listRuntimeEvents({ after = 0, limit = 100, type = null } = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
    const rows = type
      ? db.prepare('SELECT * FROM runtime_events WHERE sequence > ? AND type = ? ORDER BY sequence ASC LIMIT ?').all(Number(after) || 0, type, safeLimit)
      : db.prepare('SELECT * FROM runtime_events WHERE sequence > ? ORDER BY sequence ASC LIMIT ?').all(Number(after) || 0, safeLimit);
    return rows.map(row => ({ sequence: row.sequence, id: row.id, type: row.type, level: row.level, taskId: row.task_id, source: row.source, trust: row.trust, data: json(row.data_json), createdAt: row.created_at }));
  }

  function hydrateJob(row) {
    return row ? { id: row.id, name: row.name, objective: row.objective, scheduleType: row.schedule_type, intervalSeconds: row.interval_seconds, nextRunAt: row.next_run_at, status: row.status, lastRunAt: row.last_run_at, lastTaskId: row.last_task_id, runCount: row.run_count, createdAt: row.created_at, updatedAt: row.updated_at } : null;
  }
  function createBackgroundJob({ name, objective, scheduleType = 'once', intervalSeconds = null, nextRunAt }) {
    const id = randomUUID(); const now = new Date().toISOString();
    db.prepare('INSERT INTO background_jobs (id, name, objective, schedule_type, interval_seconds, next_run_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, name, objective, scheduleType, intervalSeconds, nextRunAt, 'active', now, now);
    return getBackgroundJob(id);
  }
  function getBackgroundJob(id) { return hydrateJob(db.prepare('SELECT * FROM background_jobs WHERE id = ?').get(id)); }
  function listBackgroundJobs(limit = 100) { return db.prepare('SELECT * FROM background_jobs ORDER BY created_at DESC LIMIT ?').all(Math.max(1, Math.min(Number(limit) || 100, 500))).map(hydrateJob); }
  function listDueBackgroundJobs(now = new Date().toISOString(), limit = 20) { return db.prepare("SELECT * FROM background_jobs WHERE status = 'active' AND next_run_at <= ? ORDER BY next_run_at ASC LIMIT ?").all(now, Math.max(1, Math.min(Number(limit) || 20, 100))).map(hydrateJob); }
  function updateBackgroundJob(id, patch = {}) {
    const current = getBackgroundJob(id); if (!current) throw new Error('Agendamento não encontrado.');
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    db.prepare('UPDATE background_jobs SET name=?, objective=?, schedule_type=?, interval_seconds=?, next_run_at=?, status=?, last_run_at=?, last_task_id=?, run_count=?, updated_at=? WHERE id=?')
      .run(next.name, next.objective, next.scheduleType, next.intervalSeconds, next.nextRunAt, next.status, next.lastRunAt, next.lastTaskId, next.runCount, next.updatedAt, id);
    return getBackgroundJob(id);
  }

  function setSkillEnabled(path, enabled) {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO skill_states (path, enabled, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET enabled=excluded.enabled, updated_at=excluded.updated_at`).run(path, enabled ? 1 : 0, now);
    return { path, enabled: Boolean(enabled), updatedAt: now };
  }
  function getSkillStates() { return new Map(db.prepare('SELECT path, enabled FROM skill_states').all().map(row => [row.path, Boolean(row.enabled)])); }
  function putExtensionState(record) { const now=new Date().toISOString();db.prepare(`INSERT INTO extension_state(id,kind,version,enabled,status,config_json,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,version=excluded.version,enabled=excluded.enabled,status=excluded.status,config_json=excluded.config_json,updated_at=excluded.updated_at`).run(record.id,record.kind,record.version||'1.0.0',record.enabled===false?0:1,record.status||'AVAILABLE',JSON.stringify(record.config||{}),now);return getExtensionState(record.id); }
  function getExtensionState(id) { const row=db.prepare('SELECT * FROM extension_state WHERE id=?').get(id);return row?{id:row.id,kind:row.kind,version:row.version,enabled:Boolean(row.enabled),status:row.status,config:json(row.config_json,{}),updatedAt:row.updated_at}:null; }
  function listExtensionStates(kind=null) { return (kind?db.prepare('SELECT id FROM extension_state WHERE kind=? ORDER BY id').all(kind):db.prepare('SELECT id FROM extension_state ORDER BY kind,id').all()).map(row=>getExtensionState(row.id)); }
  function putWorkflow(record) { const now=new Date().toISOString();const current=getWorkflow(record.id);db.prepare(`INSERT INTO workflows(id,name,version,enabled,definition_json,state_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,version=excluded.version,enabled=excluded.enabled,definition_json=excluded.definition_json,state_json=excluded.state_json,updated_at=excluded.updated_at`).run(record.id,record.name,record.version||'1.0.0',record.enabled?1:0,JSON.stringify(record.definition||{}),JSON.stringify(record.state||{}),current?.createdAt||now,now);return getWorkflow(record.id); }
  function getWorkflow(id) { const row=db.prepare('SELECT * FROM workflows WHERE id=?').get(id);return row?{id:row.id,name:row.name,version:row.version,enabled:Boolean(row.enabled),definition:json(row.definition_json,{}),state:json(row.state_json,{}),createdAt:row.created_at,updatedAt:row.updated_at}:null; }
  function listWorkflows() { return db.prepare('SELECT id FROM workflows ORDER BY updated_at DESC').all().map(row=>getWorkflow(row.id)); }
  function putWorkflowRun(record) { const now=new Date().toISOString();const current=getWorkflowRun(record.id);db.prepare(`INSERT INTO workflow_runs(id,workflow_id,status,input_json,state_json,error,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,state_json=excluded.state_json,error=excluded.error,updated_at=excluded.updated_at`).run(record.id,record.workflowId,record.status,JSON.stringify(record.input||current?.input||{}),JSON.stringify(record.state||{}),record.error||null,current?.createdAt||now,now);return getWorkflowRun(record.id); }
  function getWorkflowRun(id) { const row=db.prepare('SELECT * FROM workflow_runs WHERE id=?').get(id);return row?{id:row.id,workflowId:row.workflow_id,status:row.status,input:json(row.input_json,{}),state:json(row.state_json,{}),error:row.error,createdAt:row.created_at,updatedAt:row.updated_at}:null; }
  function listWorkflowRuns(workflowId=null) { return (workflowId?db.prepare('SELECT id FROM workflow_runs WHERE workflow_id=? ORDER BY updated_at DESC').all(workflowId):db.prepare('SELECT id FROM workflow_runs ORDER BY updated_at DESC LIMIT 100').all()).map(row=>getWorkflowRun(row.id)); }

  function putBrowserSession({ id = randomUUID(), currentUrl, title = '', history = [], snapshot = {} }) {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO browser_sessions (id, current_url, title, history_json, snapshot_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET current_url=excluded.current_url, title=excluded.title, history_json=excluded.history_json, snapshot_json=excluded.snapshot_json, updated_at=excluded.updated_at`)
      .run(id, currentUrl, title, JSON.stringify(history), JSON.stringify(snapshot), now, now);
    return getBrowserSession(id);
  }
  function getBrowserSession(id) {
    const row = db.prepare('SELECT * FROM browser_sessions WHERE id = ?').get(id);
    return row ? { id: row.id, currentUrl: row.current_url, title: row.title, history: json(row.history_json, []), snapshot: json(row.snapshot_json, {}), createdAt: row.created_at, updatedAt: row.updated_at } : null;
  }
  function listBrowserSessions(limit = 30) { return db.prepare('SELECT id FROM browser_sessions ORDER BY updated_at DESC LIMIT ?').all(Math.max(1, Math.min(Number(limit) || 30, 100))).map(row => getBrowserSession(row.id)); }

  function listPersonalityTraits() {
    return db.prepare('SELECT * FROM personality_traits ORDER BY trait ASC').all().map(row => ({
      trait: row.trait, value: row.value, confidence: row.confidence, evidenceCount: row.evidence_count,
      contradictionCount: row.contradiction_count, source: row.source, updatedAt: row.updated_at,
    }));
  }
  function upsertPersonalityTrait({ trait, value, confidence, evidenceCount = 1, contradictionCount = 0, source = 'adaptive' }) {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO personality_traits (trait, value, confidence, evidence_count, contradiction_count, source, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(trait) DO UPDATE SET value=excluded.value, confidence=excluded.confidence,
      evidence_count=excluded.evidence_count, contradiction_count=excluded.contradiction_count,
      source=excluded.source, updated_at=excluded.updated_at`)
      .run(trait, value, confidence, evidenceCount, contradictionCount, source, now);
    return listPersonalityTraits().find(item => item.trait === trait) || null;
  }
  function addPersonalityObservation({ trait, targetValue, confidence, explicit = false, context = 'casual', signal }) {
    const record = { id: randomUUID(), trait, targetValue, confidence, explicit: Boolean(explicit), context, signal, createdAt: new Date().toISOString() };
    db.prepare('INSERT INTO personality_observations (id, trait, target_value, confidence, explicit, context, signal, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(record.id, record.trait, record.targetValue, record.confidence, record.explicit ? 1 : 0, record.context, record.signal, record.createdAt);
    db.prepare('DELETE FROM personality_observations WHERE id IN (SELECT id FROM personality_observations ORDER BY created_at DESC LIMIT -1 OFFSET 500)').run();
    return record;
  }
  function listPersonalityObservations(limit = 100) {
    return db.prepare('SELECT * FROM personality_observations ORDER BY created_at DESC LIMIT ?').all(Math.max(1, Math.min(Number(limit) || 100, 500))).map(row => ({
      id: row.id, trait: row.trait, targetValue: row.target_value, confidence: row.confidence,
      explicit: Boolean(row.explicit), context: row.context, signal: row.signal, createdAt: row.created_at,
    }));
  }
  function resetPersonality() {
    db.exec('BEGIN IMMEDIATE');
    try { db.prepare('DELETE FROM personality_observations').run(); db.prepare('DELETE FROM personality_traits').run(); db.exec('COMMIT'); }
    catch (error) { db.exec('ROLLBACK'); throw error; }
    return { reset: true, at: new Date().toISOString() };
  }

  function upsertModelBenchmark({ model, domain, score, sampleCount = 0, medianLatencyMs = null, metadata = {} }) {
    const updatedAt = new Date().toISOString();
    db.prepare(`INSERT INTO model_benchmarks (model, domain, score, sample_count, median_latency_ms, metadata_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(model, domain) DO UPDATE SET score=excluded.score, sample_count=excluded.sample_count,
      median_latency_ms=excluded.median_latency_ms, metadata_json=excluded.metadata_json, updated_at=excluded.updated_at`)
      .run(model, domain, score, sampleCount, medianLatencyMs, JSON.stringify(metadata), updatedAt);
    return listModelBenchmarks(domain).find(item => item.model === model) || null;
  }
  function listModelBenchmarks(domain = null) {
    const rows = domain
      ? db.prepare('SELECT * FROM model_benchmarks WHERE domain = ? ORDER BY score DESC').all(domain)
      : db.prepare('SELECT * FROM model_benchmarks ORDER BY domain, score DESC').all();
    return rows.map(row => ({ model: row.model, domain: row.domain, score: row.score, sampleCount: row.sample_count, medianLatencyMs: row.median_latency_ms, metadata: json(row.metadata_json, {}), updatedAt: row.updated_at }));
  }

  function putArtifact({ id = randomUUID(), type, mimeType, provider, model = null, location, metadata = {}, sourceTask = null }) {
    const createdAt = new Date().toISOString();
    db.prepare('INSERT INTO artifacts (id, type, mime_type, provider, model, location, metadata_json, source_task, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, type, mimeType, provider, model, location, JSON.stringify(metadata), sourceTask, createdAt);
    return getArtifact(id);
  }
  function linkArtifacts({ parentId, childId, relation = 'derived-from', metadata = {} }) { const createdAt = new Date().toISOString(); db.prepare('INSERT OR REPLACE INTO artifact_edges (parent_id,child_id,relation,metadata_json,created_at) VALUES (?,?,?,?,?)').run(parentId, childId, relation, JSON.stringify(metadata), createdAt); return { parentId, childId, relation, metadata, createdAt }; }
  function getArtifactProvenance(id) { const artifact = getArtifact(id); if (!artifact) return null; const hydrate = row => ({ parentId: row.parent_id, childId: row.child_id, relation: row.relation, metadata: json(row.metadata_json, {}), createdAt: row.created_at }); return { artifact, parents: db.prepare('SELECT * FROM artifact_edges WHERE child_id=? ORDER BY created_at').all(id).map(hydrate), children: db.prepare('SELECT * FROM artifact_edges WHERE parent_id=? ORDER BY created_at').all(id).map(hydrate) }; }
  function getArtifact(id) { const row = db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id); return row ? { id: row.id, type: row.type, mimeType: row.mime_type, provider: row.provider, model: row.model, location: row.location, metadata: json(row.metadata_json, {}), sourceTask: row.source_task, createdAt: row.created_at } : null; }
  function listArtifacts(limit = 100) { return db.prepare('SELECT id FROM artifacts ORDER BY created_at DESC LIMIT ?').all(Math.max(1, Math.min(Number(limit) || 100, 500))).map(row => getArtifact(row.id)); }
  function createMediaJob({ kind, priority = 5, input = {} }) {
    const record = { id: randomUUID(), kind, status: 'queued', priority, input, createdAt: new Date().toISOString() };
    db.prepare('INSERT INTO media_jobs (id, kind, status, priority, input_json, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(record.id, kind, record.status, priority, JSON.stringify(input), record.createdAt); return getMediaJob(record.id);
  }
  function getMediaJob(id) { const row = db.prepare('SELECT * FROM media_jobs WHERE id = ?').get(id); return row ? { id: row.id, kind: row.kind, status: row.status, priority: row.priority, input: json(row.input_json, {}), artifactId: row.artifact_id, error: row.error, createdAt: row.created_at, startedAt: row.started_at, completedAt: row.completed_at, cancelledAt: row.cancelled_at } : null; }
  function updateMediaJob(id, patch = {}) {
    const current = getMediaJob(id); if (!current) throw new Error('Job de mídia não encontrado.'); const next = { ...current, ...patch };
    db.prepare('UPDATE media_jobs SET status=?, artifact_id=?, error=?, started_at=?, completed_at=?, cancelled_at=? WHERE id=?').run(next.status, next.artifactId || null, next.error || null, next.startedAt || null, next.completedAt || null, next.cancelledAt || null, id); return getMediaJob(id);
  }
  function listMediaJobs(limit = 100) { return db.prepare('SELECT id FROM media_jobs ORDER BY priority ASC, created_at DESC LIMIT ?').all(Math.max(1, Math.min(Number(limit) || 100, 500))).map(row => getMediaJob(row.id)); }
  function addPerformanceSample(sample) {
    const id = randomUUID(); const createdAt = new Date().toISOString();
    db.prepare('INSERT INTO performance_samples (id, route, cold, runtime_overhead_ms, ttft_ms, total_ms, prompt_tokens, completion_tokens, ram_mb, vram_mb, tool_calls, model_calls, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, sample.route, sample.cold ? 1 : 0, sample.runtimeOverheadMs ?? null, sample.ttftMs ?? null, sample.totalMs ?? null, sample.promptTokens ?? null, sample.completionTokens ?? null, sample.ramMB ?? null, sample.vramMB ?? null, sample.toolCalls || 0, sample.modelCalls || 0, JSON.stringify(sample.metadata || {}), createdAt);
    return { id, ...sample, createdAt };
  }
  function listPerformanceSamples(limit = 500) { return db.prepare('SELECT * FROM performance_samples ORDER BY created_at DESC LIMIT ?').all(Math.max(1, Math.min(Number(limit) || 500, 5000))).map(row => ({ id: row.id, route: row.route, cold: Boolean(row.cold), runtimeOverheadMs: row.runtime_overhead_ms, ttftMs: row.ttft_ms, totalMs: row.total_ms, promptTokens: row.prompt_tokens, completionTokens: row.completion_tokens, ramMB: row.ram_mb, vramMB: row.vram_mb, toolCalls: row.tool_calls, modelCalls: row.model_calls, metadata: json(row.metadata_json, {}), createdAt: row.created_at })); }

  function putHypothesis(value) { const now = new Date().toISOString(); const record = { id: randomUUID(), ...value, createdAt: now, updatedAt: now }; db.prepare('INSERT INTO task_hypotheses (id, task_id, hypothesis, evidence_for_json, evidence_against_json, experiment, outcome, confidence, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(record.id, record.taskId, record.hypothesis, JSON.stringify(record.evidenceFor || []), JSON.stringify(record.evidenceAgainst || []), record.experiment, record.outcome || null, record.confidence ?? 0.5, record.status || 'OPEN', now, now); return getHypothesis(record.id); }
  function getHypothesis(id) { const row = db.prepare('SELECT * FROM task_hypotheses WHERE id=?').get(id); return row ? { id: row.id, taskId: row.task_id, hypothesis: row.hypothesis, evidenceFor: json(row.evidence_for_json, []), evidenceAgainst: json(row.evidence_against_json, []), experiment: row.experiment, outcome: row.outcome, confidence: row.confidence, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at } : null; }
  function updateHypothesis(id, patch = {}) { const current = getHypothesis(id); if (!current) throw new Error('Hipótese não encontrada.'); const next = { ...current, ...patch, updatedAt: new Date().toISOString() }; db.prepare('UPDATE task_hypotheses SET evidence_for_json=?, evidence_against_json=?, experiment=?, outcome=?, confidence=?, status=?, updated_at=? WHERE id=?').run(JSON.stringify(next.evidenceFor), JSON.stringify(next.evidenceAgainst), next.experiment, next.outcome || null, next.confidence, next.status, next.updatedAt, id); return getHypothesis(id); }
  function listHypotheses(taskId) { return db.prepare('SELECT id FROM task_hypotheses WHERE task_id=? ORDER BY created_at').all(taskId).map(row => getHypothesis(row.id)); }
  function createCapabilityGrant({ taskId, agent, namespaces = [], scopes = [], expiresAt }) { const record = { id: randomUUID(), taskId, agent, namespaces, scopes, expiresAt, createdAt: new Date().toISOString() }; db.prepare('INSERT INTO capability_grants (id, task_id, agent, namespaces_json, scopes_json, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(record.id, taskId, agent, JSON.stringify(namespaces), JSON.stringify(scopes), expiresAt, record.createdAt); return getCapabilityGrant(record.id); }
  function getCapabilityGrant(id) { const row = db.prepare('SELECT * FROM capability_grants WHERE id=?').get(id); return row ? { id: row.id, taskId: row.task_id, agent: row.agent, namespaces: json(row.namespaces_json, []), scopes: json(row.scopes_json, []), expiresAt: row.expires_at, revokedAt: row.revoked_at, createdAt: row.created_at } : null; }
  function revokeCapabilityGrant(id) { db.prepare('UPDATE capability_grants SET revoked_at=? WHERE id=?').run(new Date().toISOString(), id); return getCapabilityGrant(id); }
  function addAgentMessage(message) { const record = { id: randomUUID(), ...message, createdAt: new Date().toISOString() }; db.prepare('INSERT INTO agent_messages (id, task_id, sender, receiver, type, content_json, evidence_json, artifact_ids_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(record.id, record.taskId || null, record.sender, record.receiver, record.type, JSON.stringify(record.content || {}), JSON.stringify(record.evidence || []), JSON.stringify(record.artifactIds || []), record.createdAt); return record; }
  function listAgentMessages(taskId, limit = 100) { return db.prepare('SELECT * FROM agent_messages WHERE task_id=? ORDER BY created_at LIMIT ?').all(taskId, limit).map(row => ({ id: row.id, taskId: row.task_id, sender: row.sender, receiver: row.receiver, type: row.type, content: json(row.content_json, {}), evidence: json(row.evidence_json, []), artifactIds: json(row.artifact_ids_json, []), createdAt: row.created_at })); }
  function putProjectWorkspace({ root, name, state = {}, instructions = {} }) { const now = new Date().toISOString(); const current = getProjectWorkspace(root); const id = current?.id || randomUUID(); db.prepare(`INSERT INTO project_workspaces (id,root,name,state_json,instructions_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(root) DO UPDATE SET name=excluded.name,state_json=excluded.state_json,instructions_json=excluded.instructions_json,updated_at=excluded.updated_at`).run(id, root, name, JSON.stringify(state), JSON.stringify(instructions), current?.createdAt || now, now); return getProjectWorkspace(root); }
  function getProjectWorkspace(root) { const row = db.prepare('SELECT * FROM project_workspaces WHERE root=?').get(root); return row ? { id: row.id, root: row.root, name: row.name, state: json(row.state_json, {}), instructions: json(row.instructions_json, {}), createdAt: row.created_at, updatedAt: row.updated_at } : null; }
  function listProjectWorkspaces(limit = 50) { return db.prepare('SELECT root FROM project_workspaces ORDER BY updated_at DESC LIMIT ?').all(limit).map(row => getProjectWorkspace(row.root)); }

  function upsertEntity({ type = 'CONCEPT', name, scope = 'global', metadata = {} }) {
    const normalized = String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!normalized) throw new Error('Entidade sem nome.');
    const now = new Date().toISOString(); const existing = db.prepare('SELECT * FROM knowledge_entities WHERE type=? AND normalized=? AND scope=?').get(type, normalized, scope);
    const id = existing?.id || randomUUID();
    db.prepare(`INSERT INTO knowledge_entities (id,type,name,normalized,scope,metadata_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(type,normalized,scope) DO UPDATE SET name=excluded.name,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`)
      .run(id, type, name, normalized, scope, JSON.stringify({ ...json(existing?.metadata_json, {}), ...metadata }), existing?.created_at || now, now);
    return getEntity(id);
  }
  function getEntity(id) { const row = db.prepare('SELECT * FROM knowledge_entities WHERE id=?').get(id); return row ? { id: row.id, type: row.type, name: row.name, normalized: row.normalized, scope: row.scope, metadata: json(row.metadata_json, {}), createdAt: row.created_at, updatedAt: row.updated_at } : null; }
  function listEntities({ scope = null, query = null, limit = 100 } = {}) {
    const clauses = []; const params = []; if (scope) { clauses.push('scope=?'); params.push(scope); } if (query) { clauses.push('(normalized LIKE ? OR name LIKE ?)'); params.push(`%${String(query).toLowerCase()}%`, `%${String(query)}%`); }
    params.push(Math.max(1, Math.min(Number(limit) || 100, 1000)));
    return db.prepare(`SELECT id FROM knowledge_entities ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY updated_at DESC LIMIT ?`).all(...params).map(row => getEntity(row.id));
  }
  function linkEntities({ fromEntityId, toEntityId, type = 'RELATED_TO', confidence = 0.7, sourceMemoryId = null, metadata = {} }) {
    const allowed = new Set(['USES','DEPENDS_ON','RELATED_TO','CAUSED_BY','FIXED_BY','DECIDED','PREFERS','PART_OF','SUPERSEDES','CONTRADICTS','VERIFIED_BY']);
    const relationType = allowed.has(type) || /^CUSTOM_[A-Z0-9_]{2,40}$/.test(type) ? type : 'RELATED_TO';
    const now = new Date().toISOString(); const id = randomUUID();
    db.prepare(`INSERT INTO knowledge_relations (id,from_entity_id,to_entity_id,type,confidence,source_memory_id,status,metadata_json,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(from_entity_id,to_entity_id,type,source_memory_id) DO UPDATE SET confidence=MAX(confidence,excluded.confidence),status='ACTIVE',metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`)
      .run(id, fromEntityId, toEntityId, relationType, confidence, sourceMemoryId, 'ACTIVE', JSON.stringify(metadata), now, now);
    return db.prepare('SELECT id FROM knowledge_relations WHERE from_entity_id=? AND to_entity_id=? AND type=? AND source_memory_id IS ?').get(fromEntityId, toEntityId, relationType, sourceMemoryId)?.id || id;
  }
  function listRelations({ entityId = null, type = null, scope = null, limit = 200 } = {}) {
    const clauses = ["r.status='ACTIVE'"]; const params = [];
    if (entityId) { clauses.push('(r.from_entity_id=? OR r.to_entity_id=?)'); params.push(entityId, entityId); }
    if (type) { clauses.push('r.type=?'); params.push(type); }
    if (scope) { clauses.push('(f.scope=? AND t.scope=?)'); params.push(scope, scope); }
    params.push(Math.max(1, Math.min(Number(limit) || 200, 2000)));
    return db.prepare(`SELECT r.*, f.name AS from_name, t.name AS to_name FROM knowledge_relations r JOIN knowledge_entities f ON f.id=r.from_entity_id JOIN knowledge_entities t ON t.id=r.to_entity_id WHERE ${clauses.join(' AND ')} ORDER BY r.confidence DESC,r.updated_at DESC LIMIT ?`).all(...params).map(row => ({ id: row.id, fromEntityId: row.from_entity_id, from: row.from_name, toEntityId: row.to_entity_id, to: row.to_name, type: row.type, confidence: row.confidence, sourceMemoryId: row.source_memory_id, status: row.status, metadata: json(row.metadata_json, {}), createdAt: row.created_at, updatedAt: row.updated_at }));
  }
  function putDocumentSource(record) { const now = new Date().toISOString(); db.prepare(`INSERT INTO document_sources (source,content_hash,mtime_ms,size,source_version,embedding_model,last_verified_at,indexed_at,metadata_json) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(source) DO UPDATE SET content_hash=excluded.content_hash,mtime_ms=excluded.mtime_ms,size=excluded.size,source_version=excluded.source_version,embedding_model=excluded.embedding_model,last_verified_at=excluded.last_verified_at,indexed_at=excluded.indexed_at,metadata_json=excluded.metadata_json`).run(record.source, record.contentHash, record.mtimeMs ?? null, record.size ?? null, record.sourceVersion || null, record.embeddingModel, now, now, JSON.stringify(record.metadata || {})); return getDocumentSource(record.source); }
  function getDocumentSource(source) { const row = db.prepare('SELECT * FROM document_sources WHERE source=?').get(source); return row ? { source: row.source, contentHash: row.content_hash, mtimeMs: row.mtime_ms, size: row.size, sourceVersion: row.source_version, embeddingModel: row.embedding_model, lastVerifiedAt: row.last_verified_at, indexedAt: row.indexed_at, metadata: json(row.metadata_json, {}) } : null; }
  function putSessionHandoff({ id = randomUUID(), sessionId, scope = 'global', state }) { const now = new Date().toISOString(); db.prepare(`INSERT INTO session_handoffs (id,session_id,scope,state_json,created_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at`).run(id, sessionId, scope, JSON.stringify(state || {}), now, now); return getSessionHandoff(sessionId, scope); }
  function getSessionHandoff(sessionId, scope = 'global') { const row = db.prepare('SELECT * FROM session_handoffs WHERE session_id=? AND scope=? ORDER BY updated_at DESC LIMIT 1').get(sessionId, scope); return row ? { id: row.id, sessionId: row.session_id, scope: row.scope, state: json(row.state_json, {}), createdAt: row.created_at, updatedAt: row.updated_at } : null; }
  function upsertEmbeddingSpace({ model, dimensions, version = '1', compatible = true }) { db.prepare(`INSERT INTO embedding_spaces (model,dimensions,version,compatible,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(model) DO UPDATE SET dimensions=excluded.dimensions,version=excluded.version,compatible=excluded.compatible,updated_at=excluded.updated_at`).run(model, dimensions, version, compatible ? 1 : 0, new Date().toISOString()); return { model, dimensions, version, compatible }; }

  return {
    db, createTask, getTask, listTasks, listChildTasks, updateTask, incrementTaskUsage, mergeWorkingMemory, addEvent, getEvents, addToolRun, getToolRuns, getToolRunFull,
    createPermission, resolvePermission, getPermission, getPermissions, putMemory, getMemory, listMemories, updateMemory, setMemoryStatus, deleteMemory, touchMemory, updateMemoryVector, reinforceMemory, contradictMemory, forgetMemories, searchMemoriesText,
    recordMemoryConflict, listMemoryConflicts, resolveMemoryConflict,
    replaceDocumentChunks, listDocumentChunks, updateDocumentChunkVector, searchDocumentChunksText, putSession, getSession, replaceTaskGraph, getTaskGraph,
    putCheckpoint, listCheckpoints, pruneCheckpoints, putRepositoryMap, getRepositoryMap, listInterruptedTasks,
    addRuntimeEvent, listRuntimeEvents, createBackgroundJob, getBackgroundJob, listBackgroundJobs, listDueBackgroundJobs, updateBackgroundJob,
    setSkillEnabled, getSkillStates, putExtensionState, getExtensionState, listExtensionStates, putWorkflow, getWorkflow, listWorkflows, putWorkflowRun, getWorkflowRun, listWorkflowRuns, putBrowserSession, getBrowserSession, listBrowserSessions,
    listPersonalityTraits, upsertPersonalityTrait, addPersonalityObservation, listPersonalityObservations, resetPersonality,
    upsertModelBenchmark, listModelBenchmarks,
    putArtifact, getArtifact, listArtifacts, linkArtifacts, getArtifactProvenance, createMediaJob, getMediaJob, updateMediaJob, listMediaJobs, addPerformanceSample, listPerformanceSamples,
    putHypothesis, getHypothesis, updateHypothesis, listHypotheses, createCapabilityGrant, getCapabilityGrant, revokeCapabilityGrant,
    addAgentMessage, listAgentMessages, putProjectWorkspace, getProjectWorkspace, listProjectWorkspaces,
    upsertEntity, getEntity, listEntities, linkEntities, listRelations, putDocumentSource, getDocumentSource, putSessionHandoff, getSessionHandoff, upsertEmbeddingSpace,
  };
}
