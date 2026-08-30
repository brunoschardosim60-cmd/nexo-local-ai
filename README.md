# Nexo Local AI

Runtime local-first para agentes pessoais, com interface web, memória persistente e modelos executados pelo Ollama. O Nexo oferece chat, programação, documentos, planilhas CSV, imagens vetoriais simples, voz, pesquisa com fontes, navegação segura e tarefas autônomas com ferramentas protegidas.

## Arquitetura do agente

O `Nexo Core` fica em `agent/`, separado da interface:

- `core/`: fachada do runtime, Task Graph persistente e checkpoints.
- `orchestrator/`: Agent Loop, planejamento, execução, verifier, retries e replanejamento.
- `tools/`: contratos JSON validados, filesystem, patch com hash, Git, projetos e shell restrito.
- `safety/`: permissões por risco, limites e sandbox de processos.
- `memory/`: SQLite, FTS, memória working/episódica/semântica/procedural/user e recuperação vetorial local.
- `context/`: Context Engine com orçamento, RAG, proteção contra prompt injection, mapa de repositório e busca de símbolos.
- `models/`: cliente Ollama e roteamento entre os modelos 3B e 7B.
- `observability/`: eventos persistentes, métricas e tracing em JSONL.
- `research/` e `browser/`: busca multi-fonte, leitura HTTP com bloqueio de SSRF, sessões, screenshots e verificação estrutural.
- `skills/` e `specialists/`: instruções locais recuperadas por intenção e perfis de programação, pesquisa, navegador, documentos e dados.
- `background/` e `events/`: scheduler persistente e event bus local.
- `mcp/`: cliente MCP stdio JSON-RPC para servidores explicitamente configurados.

A interface usa `lib/nexo` como SDK e `hooks/use-nexo-task-sync.ts` para acompanhar execuções. Ela não implementa o raciocínio do agente.

No modo **Agente**, o Nexo devolve o controle da interface imediatamente, cria um Task Graph em segundo plano, executa leituras automaticamente, pausa antes de escrita ou terminal, retoma após aprovação e valida o resultado antes de concluir. A interface acompanha o progresso sem precisar recarregar. Cada tarefa possui limites, retries, grafo, eventos e checkpoints recuperáveis após reinício.

Tarefas simples usam o modelo 3B para reduzir latência e RAM; planejamento e programação complexos usam o 7B. O resultado final é montado a partir das saídas reais das ferramentas. Uma alteração de arquivo só é marcada como validada quando há teste, lint, typecheck ou build bem-sucedido registrado.

O Core 2.0 registra 34 tools. Pesquisa usa Wikipedia, OpenAlex e Stack Overflow sem exigir chave paga; toda chamada externa continua dependendo de aprovação. O Browser Agent mantém sessões persistentes, bloqueia protocolos e redes privadas indevidas e pode usar Chrome ou Edge headless para gerar screenshots no workspace. O verificador visual atual confirma integridade, peso e dimensões; interpretação semântica da imagem exigirá um modelo local com visão.

Quando o trabalho realmente pode ser dividido, `agents.delegate` cria de duas a quatro subtarefas vinculadas à tarefa principal. Elas são executadas em paralelo pelo runtime e cada especialista mantém seus próprios passos, limites, eventos, checkpoints e pedidos de permissão.

Veja a arquitetura, garantias e sequência de evolução em [`docs/NEXO-CORE.md`](docs/NEXO-CORE.md).

## Requisitos

- Windows
- Node.js 22 ou mais recente
- [Ollama](https://ollama.com/) instalado
- Modelos locais:

```powershell
ollama pull qwen2.5-coder:3b
ollama pull qwen2.5-coder:7b-instruct-q3_K_S
```

## Executar

A forma mais simples é abrir `start-nexo.cmd`. Também é possível iniciar manualmente:

```powershell
npm install
npm run agent
npm run dev
```

Depois, acesse [http://localhost:3000](http://localhost:3000).

Validação do runtime:

```powershell
npm run test:agent
npm run eval:agent
```

## Skills e MCP

As skills versionadas ficam em `skills/*/SKILL.md`; skills pessoais podem ser adicionadas em `data/skills/` e não são enviadas ao Git. Cada skill tem `name`, `description` e instruções, pode ser ativada ou desativada e só entra no contexto quando combina com o objetivo.

Para MCP, copie `mcp-servers.example.json` para `data/mcp-servers.json` e configure somente processos locais confiáveis. O Nexo inicia o servidor por stdio, negocia capacidades, lista tools e exige aprovação antes de conectar ou chamar uma tool MCP. Variáveis de ambiente não aparecem na API de status.

## Privacidade

O SQLite em `data/nexo.db` guarda localmente tarefas, planos, permissões, eventos, jobs, sessões de navegador, memória recuperável, skills e índices de documentos. O navegador mantém uma cópia de conveniência dos chats e preferências da interface. Os modelos são executados pelo Ollama localmente. Pesquisa, navegação e MCP só saem do computador após uma ação autorizada; nesses casos, a consulta ou requisição necessária é enviada à fonte escolhida.

O banco, logs, sessões, backups e índices locais são ignorados pelo Git e não são enviados ao GitHub.
