# Nexo Local AI

Runtime local-first para agentes pessoais, com interface web, memória persistente e modelos executados pelo Ollama. O Nexo oferece chat, programação, documentos, planilhas CSV, imagens vetoriais simples, voz, pesquisa opcional e tarefas autônomas com ferramentas protegidas.

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

A interface usa `lib/nexo` como SDK e `hooks/use-nexo-task-sync.ts` para acompanhar execuções. Ela não implementa o raciocínio do agente.

No modo **Agente**, o Nexo devolve o controle da interface imediatamente, cria um Task Graph em segundo plano, executa leituras automaticamente, pausa antes de escrita ou terminal, retoma após aprovação e valida o resultado antes de concluir. A interface acompanha o progresso sem precisar recarregar. Cada tarefa possui limites, retries, grafo, eventos e checkpoints recuperáveis após reinício.

Tarefas simples usam o modelo 3B para reduzir latência e RAM; planejamento e programação complexos usam o 7B. O resultado final é montado a partir das saídas reais das ferramentas. Uma alteração de arquivo só é marcada como validada quando há teste, lint, typecheck ou build bem-sucedido registrado.

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

## Privacidade

O SQLite em `data/nexo.db` guarda localmente tarefas, planos, permissões, eventos, memória recuperável, sessões e índices de documentos. O navegador mantém uma cópia de conveniência dos chats e preferências da interface. Os modelos são executados pelo Ollama localmente. Recursos de pesquisa online só são usados quando ativados na interface.

O banco, logs, sessões, backups e índices locais são ignorados pelo Git e não são enviados ao GitHub.
