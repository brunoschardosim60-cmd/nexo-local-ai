# Nexo Local AI

> V9: plataforma extensível local-first com Capability Registry, Skills V3, MCP V2, connectors, workflows persistentes e vault de referências secretas.

Runtime local-first para agentes pessoais, com interface web, memória persistente e modelos executados pelo Ollama. O Nexo oferece chat, programação, documentos, planilhas CSV, visão real, arquitetura de mídia com artefatos persistentes, voz pelo navegador, pesquisa com fontes, navegação segura e tarefas autônomas com ferramentas protegidas.

## Arquitetura do agente

O `Nexo Core` fica em `agent/`, separado da interface:

- `core/` e `goals/`: fachada do runtime, Goal Engine, Task Graph persistente e checkpoints.
- `runtime/`: roteamento `INSTANT`/`FAST`/`DEEP`/`AGENT`, streaming, cache e carregamento progressivo de contexto.
- `personality/`: identidade-base, adaptação gradual por confiança/contradição e limites por contexto.
- `orchestrator/`: Agent Loop, planejamento, execução, verifier, Critic, autocorreção com orçamento, retries e replanejamento.
- `tools/`: contratos JSON validados, filesystem, patch com hash, Git, projetos e shell restrito.
- `safety/`: `ALLOW`/`ASK`/`DENY`, capability tokens temporários, limites e executor de processos sem shell com allowlist. Ele reduz a superfície de ataque, mas não substitui isolamento de SO por contêiner ou VM.
- `memory/`: Personal Memory V3 em SQLite, FTS + embeddings locais pelo `embeddinggemma`, escopos global/projeto/sessão, proveniência, temporalidade, contradições auditáveis, esquecimento, continuidade e grafo de conhecimento.
- `context/`: Context Engine V2 seletivo com orçamento, RAG semântico, proteção contra prompt injection, mapa de repositório e busca de símbolos.
- `models/`: cliente Ollama e Model Router V2 por domínio, dificuldade, necessidade de tools e benchmarks do hardware local.
- `multimodal/`, `vision/`, `image/`, `audio/` e `video/`: schema comum, visão local pelo Ollama, providers de mídia substituíveis e fallbacks explícitos.
- `artifacts/`, `media/` e `resources/`: arquivos persistentes, fila cancelável e orçamento observado de CPU/RAM/VRAM.
- `observability/`: eventos persistentes, métricas e tracing em JSONL.
- `research/` e `browser/`: busca multi-fonte e Playwright real sobre Edge/Chrome com DOM, acessibilidade, console, rede, navegação, clique, texto, seleção, teclado, abas, upload, download e screenshots verificados.
- `workspace/`: estado persistente do projeto, baseline Git, arquitetura, scripts e `NEXO.md` sempre marcado como instrução não confiável.
- `skills/` e `specialists/`: instruções locais recuperadas por intenção e perfis de programação, pesquisa, navegador, documentos e dados.
- `background/` e `events/`: scheduler persistente e event bus local.
- `personal/`: objetivos e tarefas pessoais persistentes, prioridade por evidências, contexto diário, retomada inteligente, busca unificada, estudo adaptativo, proatividade opt-in e triggers controlados.
- `mcp/`: cliente MCP stdio JSON-RPC para servidores explicitamente configurados.

A interface usa `lib/nexo` como SDK e `hooks/use-nexo-task-sync.ts` para acompanhar execuções. Chat, aquecimento de modelos, pesquisa, memória e ações passam pelo Runtime; a interface não mantém um segundo cérebro.

No modo **Agente**, o Nexo devolve o controle da interface imediatamente, cria um objetivo estável e um Task Graph em segundo plano, executa nós independentes em paralelo, pausa antes de escrita ou terminal, retoma após aprovação e valida evidências antes de concluir. Cada tarefa possui orçamento de passos, tools, chamadas de modelo e duração; o botão cancelar propaga um `AbortSignal` às execuções ativas. A interface mostra objetivo, operação atual, consumo, critérios `PASS`/`FAIL`/`UNCERTAIN`/`NOT_CHECKED`, progresso e permissões.

Perguntas determinísticas não acionam modelo. Conversa simples usa o 3B com prompt mínimo; memória, RAG e pesquisa só entram quando a intenção exige. O Router escolhe automaticamente entre chat, código, raciocínio, pesquisa, documentos, dados e visão, respeitando uma seleção explícita de esforço alto. O verificador confronta objetivo, critérios e evidências e termina em `PASS`, `FAIL` ou `UNCERTAIN`; `FAIL` e `UNCERTAIN` acionam o Critic e até três estratégias diferentes antes da conclusão.

O Core 7 registra as tools dinamicamente. A inteligência de código usa AST TypeScript/JavaScript, declarações, chamadas e referências; debugging mantém hipóteses e experimentos persistentes. A pesquisa pode decompor perguntas e construir uma matriz multi-fonte de evidências, cobertura, datas e lacunas. Wikipedia, OpenAlex e Stack Overflow não exigem chave paga; toda chamada externa continua dependendo de aprovação. O modelo `qwen2.5vl:3b` interpreta imagens localmente. Geração raster usa Stable Diffusion WebUI/Forge quando esse provider estiver instalado e ativo; se não estiver, a UI informa a indisponibilidade e não fabrica um SVG como resultado.

O V7 adiciona o painel **Meu dia** e a paleta `Ctrl+K`. Objetivos, tarefas, prazos, projetos conhecidos, estudo e eventos observáveis ficam separados da personalidade. Proatividade e notificações começam desligadas; `SUGGEST`, `ASK` e `ACT` são políticas distintas, e `ACT` exige confirmação explícita mais capabilities limitadas. Modo foco, quiet hours, orçamento de interrupções, repetição espaçada e briefs são controlados pelo usuário. O Nexo não afirma ter “visto” algo sem evento, tool ou memória que sustente a afirmação.

O V8 formaliza mensagens com texto, imagens, áudio, vídeo, documentos, frames de tela/câmera e metadata. O Modality Router combina engines, enquanto o Perception Engine preserva origem, horário e confiança de cada observação. O botão de presença reúne voz, captura pontual de tela e câmera sob consentimento explícito, exibe indicadores ativos e oferece kill switch. Frames iguais são ignorados e frames brutos não entram automaticamente na memória. Image V2 possui presets `FAST/BALANCED/HIGH/MAX`, intenção visual, edição/variações/inpainting quando Forge suporta e histórico por proveniência. Video V2 possui storyboard e projeto estruturado, mas geração e compreensão temporal continuam indisponíveis sem provider local real. Web Speech permanece apenas fallback e não é apresentado como realtime voice completo.

O V6 não salva toda conversa indiscriminadamente. O Memory Gate V2 avalia utilidade, novidade, estabilidade, confiança, escopo, sensibilidade e duplicação. “Lembre que…” cria memória explícita; “esqueça…” exclui a correspondência encontrada. A central **Memória do Nexo** permite pesquisar, editar, confirmar, arquivar e apagar registros. Contradições preservam as duas evidências ou marcam a anterior como `SUPERSEDED`; nunca são sobrescritas silenciosamente. RAG usa hash de conteúdo e chunks guiados por estrutura para não reindexar arquivos inalterados.

Quando o trabalho realmente pode ser dividido, `agents.delegate` cria de duas a quatro subtarefas vinculadas à tarefa principal. Elas são executadas em paralelo pelo runtime e cada especialista mantém seus próprios passos, limites, eventos, checkpoints e pedidos de permissão.

Veja a arquitetura-base em [`docs/NEXO-CORE.md`](docs/NEXO-CORE.md) e os relatórios honestos em `docs/NEXO-V*-REPORT.md`, incluindo [`docs/NEXO-V8-REPORT.md`](docs/NEXO-V8-REPORT.md).

## Requisitos

- Windows
- Node.js 22 ou mais recente
- [Ollama](https://ollama.com/) instalado
- Modelos locais:

```powershell
ollama pull qwen2.5-coder:3b
ollama pull qwen2.5-coder:7b-instruct-q3_K_S
ollama pull embeddinggemma
ollama pull qwen2.5vl:3b
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
npm run eval:intelligence
npm run eval:media
npm run eval:autonomy
npm run eval:memory
npm run eval:memory-long
npm run eval:false-memory
npm run eval:knowledge
npm run eval:personal
npm run eval:multimodal
npm run benchmark:memory
npm run benchmark:v4
npm run benchmark:v5
```

`eval:intelligence` contém 200 casos de prontidão estrutural; ele não deve ser confundido com qualidade generativa. `eval:autonomy` executa 36 verificações de capacidade, incluindo um navegador Edge real com DOM, clique, console e screenshot. `eval:media` usa `SKIPPED` para providers realmente ausentes. `benchmark:v4` separa runtime, TTFT, total, cold/warm e modelo. O Router só usa um benchmark de qualidade persistido quando há pelo menos 10 amostras reais naquele domínio.

## Skills e MCP

As skills versionadas ficam em `skills/*/SKILL.md`; skills pessoais podem ser adicionadas em `data/skills/` e não são enviadas ao Git. Cada skill tem `name`, `description` e instruções, pode ser ativada ou desativada e só entra no contexto quando combina com o objetivo.

Para MCP, copie `mcp-servers.example.json` para `data/mcp-servers.json` e configure somente processos locais confiáveis. O Nexo inicia o servidor por stdio, negocia capacidades, lista tools e exige aprovação antes de conectar ou chamar uma tool MCP. Variáveis de ambiente não aparecem na API de status.

## Privacidade

O SQLite em `data/nexo.db` guarda localmente tarefas, planos, permissões, eventos, jobs, sessões de navegador, memórias, conflitos, entidades, relações, handoffs, skills, objetivos pessoais, tarefas pessoais, preferências de proatividade, conceitos de estudo e índices de documentos. O navegador mantém uma cópia de conveniência dos chats e preferências da interface. Os modelos e embeddings são executados pelo Ollama localmente. Registros `RESTRICTED` não entram em pesquisa ou navegação externa. Pesquisa, navegação e MCP só saem do computador após uma ação autorizada; nesses casos, apenas a consulta ou requisição necessária é enviada à fonte escolhida.

O banco, logs, sessões, backups e índices locais são ignorados pelo Git e não são enviados ao GitHub.
