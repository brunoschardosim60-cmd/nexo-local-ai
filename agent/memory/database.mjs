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
      max_retries INTEGER NOT NULL, result_json TEXT, error TEXT,
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
      tool TEXT NOT NULL, input_json TEXT NOT NULL, output_json TEXT,
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
  ];
  for (const statement of statements) db.prepare(statement).run();
  const memoryColumns = new Set(db.prepare('PRAGMA table_info(memories)').all().map(column => column.name));
  if (!memoryColumns.has('confidence')) db.prepare('ALTER TABLE memories ADD COLUMN confidence REAL NOT NULL DEFAULT 0.7').run();
  if (!memoryColumns.has('source')) db.prepare("ALTER TABLE memories ADD COLUMN source TEXT NOT NULL DEFAULT 'agent'").run();
  if (!memoryColumns.has('last_confirmed_at')) db.prepare('ALTER TABLE memories ADD COLUMN last_confirmed_at TEXT').run();
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
      result: json(row.result_json), error: row.error,
      createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at,
    };
  }

  function createTask({ objective, maxSteps, maxRetries }) {
    const id = randomUUID(); const now = new Date().toISOString();
    db.prepare('INSERT INTO tasks (id, objective, status, max_steps, max_retries, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, objective, 'planning', maxSteps, maxRetries, now, now);
    return getTask(id);
  }
  function getTask(id) { return hydrateTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)); }
  function listTasks(limit = 30) { return db.prepare('SELECT * FROM tasks ORDER BY updated_at DESC LIMIT ?').all(limit).map(hydrateTask); }
  function updateTask(id, patch) {
    const current = getTask(id); if (!current) throw new Error('Tarefa não encontrada.');
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    db.prepare(`UPDATE tasks SET status=?, plan_json=?, current_step=?, steps_used=?, result_json=?, error=?, updated_at=?, completed_at=? WHERE id=?`)
      .run(next.status, JSON.stringify(next.plan || []), next.currentStep, next.stepsUsed, next.result == null ? null : JSON.stringify(next.result), next.error || null, next.updatedAt, next.completedAt || null, id);
    return getTask(id);
  }
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
    db.prepare('INSERT INTO tool_runs (id, task_id, step_index, tool, input_json, output_json, status, attempt, duration_ms, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, run.taskId, run.stepIndex, run.tool, JSON.stringify(run.input || {}), run.output == null ? null : JSON.stringify(run.output), run.status, run.attempt, run.durationMs ?? null, run.error || null, createdAt);
    return { id, ...run, createdAt };
  }
  function getToolRuns(taskId) {
    return db.prepare('SELECT * FROM tool_runs WHERE task_id = ? ORDER BY created_at ASC').all(taskId).map(row => ({
      id: row.id, taskId: row.task_id, stepIndex: row.step_index, tool: row.tool,
      input: json(row.input_json, {}), output: json(row.output_json), status: row.status,
      attempt: row.attempt, durationMs: row.duration_ms, error: row.error, createdAt: row.created_at,
    }));
  }
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
  function putMemory(memory) {
    const id = randomUUID(); const now = new Date().toISOString();
    db.prepare('INSERT INTO memories (id, kind, content, vector_json, metadata_json, importance, confidence, source, created_at, last_accessed_at, last_confirmed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, memory.kind, memory.content, JSON.stringify(memory.vector), JSON.stringify(memory.metadata || {}), memory.importance ?? 0.5, memory.confidence ?? 0.7, memory.source || 'agent', now, now, memory.lastConfirmedAt || null);
    db.prepare('INSERT INTO memories_fts (id, kind, content) VALUES (?, ?, ?)').run(id, memory.kind, memory.content);
    return id;
  }
  function listMemories(limit = 500) { return db.prepare('SELECT * FROM memories ORDER BY importance DESC, last_accessed_at DESC LIMIT ?').all(limit).map(row => ({ id: row.id, kind: row.kind, content: row.content, vector: json(row.vector_json, []), metadata: json(row.metadata_json, {}), importance: row.importance, confidence: row.confidence, source: row.source, createdAt: row.created_at, lastAccessedAt: row.last_accessed_at, lastConfirmedAt: row.last_confirmed_at })); }
  function touchMemory(id) { db.prepare('UPDATE memories SET last_accessed_at = ? WHERE id = ?').run(new Date().toISOString(), id); }
  function searchMemoriesText(query, limit = 50) {
    const match = ftsQuery(query); if (!match) return [];
    return db.prepare('SELECT id, bm25(memories_fts) AS rank FROM memories_fts WHERE memories_fts MATCH ? ORDER BY rank LIMIT ?').all(match, limit).map(row => ({ id: row.id, rank: row.rank }));
  }
  function replaceDocumentChunks(source, chunks) {
    db.prepare('DELETE FROM document_chunks_fts WHERE source = ?').run(source);
    db.prepare('DELETE FROM document_chunks WHERE source = ?').run(source);
    const insert = db.prepare('INSERT INTO document_chunks (id, source, chunk_index, content, vector_json, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const now = new Date().toISOString();
    const insertFts = db.prepare('INSERT INTO document_chunks_fts (id, source, content) VALUES (?, ?, ?)');
    for (const chunk of chunks) { const id = randomUUID(); insert.run(id, source, chunk.index, chunk.content, JSON.stringify(chunk.vector), JSON.stringify(chunk.metadata || {}), now, now); insertFts.run(id, source, chunk.content); }
  }
  function listDocumentChunks(limit = 2000) { return db.prepare('SELECT * FROM document_chunks ORDER BY source, chunk_index LIMIT ?').all(limit).map(row => ({ id: row.id, source: row.source, index: row.chunk_index, content: row.content, vector: json(row.vector_json, []), metadata: json(row.metadata_json, {}) })); }
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

  return {
    db, createTask, getTask, listTasks, updateTask, addEvent, getEvents, addToolRun, getToolRuns,
    createPermission, resolvePermission, getPermission, getPermissions, putMemory, listMemories, touchMemory, searchMemoriesText,
    replaceDocumentChunks, listDocumentChunks, searchDocumentChunksText, putSession, getSession, replaceTaskGraph, getTaskGraph,
    putCheckpoint, listCheckpoints, pruneCheckpoints, putRepositoryMap, getRepositoryMap, listInterruptedTasks,
  };
}
