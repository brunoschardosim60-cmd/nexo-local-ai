# Master audit — arquitetura inicial

## Fluxo real

```text
Usuário
  ↓
UI React (`app/page.tsx`)
  ↓ HTTP/NDJSON + token de sessão
`local-agent.mjs` — façade loopback
  ↓
Nexo Core (`agent/core/nexo-core.mjs`)
  ├─ Runtime: intent → complexity → context → router → model
  ├─ Agent: goal → planner → DAG → executor → evaluator → critic
  ├─ Knowledge: memory → embeddings → RAG → graph → continuity
  ├─ Personal: personality → goals/tasks/study → proactivity
  ├─ Media: modality router → provider registry → queue → artifacts
  └─ Extensions: capability registry → tools/skills/MCP/connectors/workflows
         ↓
     Safety: contracts → scopes → permission → restricted spawn
         ↓
     Ollama / filesystem / Git / Edge / optional local providers
```

## Sources of truth

- Composição: `createNexoCore` é única.
- Chat/routing: `createNexoRuntime` é único.
- Agent loop: `createAgentLoop` é único.
- Model router: `createModelRouter` é único.
- Context engine: `createContextEngine` é único.
- Descoberta: `capabilityRegistry` centraliza tools, skills, MCP, providers, connectors e workflows.
- Persistência: uma conexão SQLite central; stores de domínio compartilham o mesmo banco.

## Duplicações e acoplamentos encontrados

1. `agent/orchestrator/errors.mjs` e `agent/extensions/contracts.mjs` definem categorias de erro incompatíveis.
2. A UI contém fallback SVG e decide se uma resposta visual “parece detalhada”; isso é lógica de capability fora do Runtime e pode criar falso sucesso.
3. A UI contém polimento gramatical por substituição; é uma segunda camada de comportamento textual.
4. Ações legadas JSON são interpretadas pela UI e chamam rotas `/files/*` e `/projects/*`, paralelas ao agent loop tipado.
5. `app/page.tsx` e `agent/memory/database.mjs` são god objects; refatorar só os limites que afetam correção agora.
6. Brand strings aparecem em dezenas de arquivos; ainda não existe contrato central de `displayName`/assets.

## Dependências críticas

```text
UI → lib/nexo/client → local-agent → core
core → database (muitos domínios)
core → runtime + agent loop + capability registry
agent loop → planner/executor/evaluator/critic → Ollama/tools/database
memory/RAG → embeddings → Ollama optional + lexical fallback
browser → playwright-core → Edge local
media queue → resource manager → optional providers → artifact store
```

Não foi encontrada chamada direta ao Ollama na UI. A única chamada Ollama fora do core encontrada em `agent/tools/project.mjs` faz parte de um template que o usuário pode pedir para gerar, não do cérebro da interface.

