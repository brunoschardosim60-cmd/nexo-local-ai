# Nexo Local AI

> Produto local-first em consolidação. A auditoria master separa capacidade comprovada, parcial, scaffold e indisponível — sem transformar nomes de módulos em promessa.

Runtime local-first para agentes pessoais, com interface web, memória persistente e modelos executados pelo Ollama. O Nexo oferece chat, programação, documentos, planilhas CSV, visão real, arquitetura de mídia com artefatos persistentes, voz neural local pelo Piper, pesquisa com fontes, navegação segura e tarefas autônomas com ferramentas protegidas.

## Arquitetura do agente

O `Nexo Core` fica em `agent/`, separado da interface:

- `core/` e `goals/`: fachada do runtime, Goal Engine, Task Graph persistente e checkpoints.
- `runtime/`: roteamento `INSTANT`/`FAST`/`DEEP`/`AGENT`, streaming, cache e carregamento progressivo de contexto.
- `conversation/`: SelfModel canônico, estado conversacional compacto por chat, resolução de referentes, correções e apelidos com escopo de relação.
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

A interface usa `lib/nexo` como SDK e `hooks/use-nexo-task-sync.ts` para acompanhar execuções. Chat, aquecimento de modelos, pesquisa, memória e ações passam pelo Runtime; a interface não chama o Ollama diretamente. Rotas JSON legadas ainda são mantidas apenas para compatibilidade e estão registradas como dívida técnica.

No modo **Agente**, o Nexo devolve o controle da interface imediatamente, cria um objetivo estável e um Task Graph em segundo plano, executa nós independentes em paralelo, pausa antes de escrita ou terminal, retoma após aprovação e valida evidências antes de concluir. Cada tarefa possui orçamento de passos, tools, chamadas de modelo e duração; o botão cancelar propaga um `AbortSignal` às execuções ativas. A interface mostra objetivo, operação atual, consumo, critérios `PASS`/`FAIL`/`UNCERTAIN`/`NOT_CHECKED`, progresso e permissões.

Perguntas determinísticas não acionam modelo. Conversa simples usa o 3B com prompt mínimo; memória, RAG e pesquisa só entram quando a intenção exige. O Router escolhe automaticamente entre chat, código, raciocínio, pesquisa, documentos, dados e visão, respeitando uma seleção explícita de esforço alto. O verificador confronta objetivo, critérios e evidências e termina em `PASS`, `FAIL` ou `UNCERTAIN`; `FAIL` e `UNCERTAIN` acionam o Critic e até três estratégias diferentes antes da conclusão.

O chat rápido preserva seis mensagens recentes e um `ConversationState` pequeno, persistido no SQLite e separado da memória semântica. O estado mantém o nome do usuário, nome canônico `Nexo`, apelido escolhido pelo usuário, tópico, referente atual, tom, correção recente e respostas sociais recentes. Perguntas como `e o seu?` são resolvidas nesse estado antes de qualquer RAG; por isso fatos locais simples não pagam a latência da busca semântica. Respostas sociais passam por verificação de identidade, papéis, repetição e sanidade. O fallback grounded só entra quando a geração contradiz os fatos autoritativos.

O Core registra as tools dinamicamente. A inteligência de código usa AST TypeScript/JavaScript, declarações, chamadas e referências textuais; ainda não possui Tree-sitter, LSP ou call graph semântico completo. Debugging mantém hipóteses e experimentos persistentes. A pesquisa pode decompor perguntas e construir uma matriz multi-fonte de evidências, cobertura, datas e lacunas. Wikipedia, OpenAlex e Stack Overflow não exigem chave paga; toda chamada externa continua dependendo de aprovação. O modelo `qwen2.5vl:3b` interpreta imagens localmente. Geração raster usa a API Stable Diffusion WebUI/Forge/A1111; neste PC, o setup recomendado instala o fork AMD/DirectML e DreamShaper 8 no disco `D:`. Se o provider não estiver ativo, a UI informa a indisponibilidade e não fabrica um SVG como resultado.

Criação de sites é roteada ao especialista de programação, que recebe direção de design somente quando o objetivo é web. Os templates `landing-page`, `product-page` e `contact-page` oferecem pontos de partida locais. A tool `site.visual_verify` abre uma URL ou pasta estática, captura desktop e mobile, inspeciona overflow/console/rede e usa visão local. Um veredito diferente de `PASS` alimenta o replanejamento com problemas observados; build/testes continuam obrigatórios e independentes da avaliação visual.

O V7 adiciona o painel **Meu dia** e a paleta `Ctrl+K`. Objetivos, tarefas, prazos, projetos conhecidos, estudo e eventos observáveis ficam separados da personalidade. Proatividade e notificações começam desligadas; `SUGGEST`, `ASK` e `ACT` são políticas distintas, e `ACT` exige confirmação explícita mais capabilities limitadas. Modo foco, quiet hours, orçamento de interrupções, repetição espaçada e briefs são controlados pelo usuário. O Nexo não afirma ter “visto” algo sem evento, tool ou memória que sustente a afirmação.

O V8 formaliza mensagens com texto, imagens, áudio, vídeo, documentos, frames de tela/câmera e metadata. O Modality Router combina engines, enquanto o Perception Engine preserva origem, horário e confiança de cada observação. O botão de presença reúne voz, captura pontual de tela e câmera sob consentimento explícito, exibe indicadores ativos e oferece kill switch. Frames iguais são ignorados e frames brutos não entram automaticamente na memória. Image V2 possui presets `FAST/BALANCED/HIGH/MAX`, intenção visual, edição/variações/inpainting quando Forge suporta e histórico por proveniência. Video V2 possui storyboard e projeto estruturado, mas geração e compreensão temporal continuam indisponíveis sem provider local real.

O **Living Eye 3.0** conecta a presença visual a uma conversa contínua: reconhecimento parcial, endpoint por silêncio, envio automático da fala final, TTS iniciado por frases durante o streaming e barge-in que interrompe a voz e devolve a escuta. Mensagens faladas entram no mesmo chat persistente. A saída usa Piper neural local via HTTP, toca o WAV pelo Web Audio e calcula RMS real com `AnalyserNode`, fazendo o olho pulsar com o sinal de áudio. Se o provider estiver indisponível, Web Speech continua como fallback explícito e usa somente eventos de `boundary`. A personalidade casual ganhou regras anti-template, e o workspace pessoal passou a interpretar o estado em linguagem natural. Artefatos HTML/SVG abrem em preview isolado com fonte, cópia e download.

O V6 não salva toda conversa indiscriminadamente. O Memory Gate V2 avalia utilidade, novidade, estabilidade, confiança, escopo, sensibilidade e duplicação. “Lembre que…” cria memória explícita; “esqueça…” exclui a correspondência encontrada. A central **Memória do Nexo** permite pesquisar, editar, confirmar, arquivar e apagar registros. Contradições preservam as duas evidências ou marcam a anterior como `SUPERSEDED`; nunca são sobrescritas silenciosamente. RAG usa hash de conteúdo e chunks guiados por estrutura para não reindexar arquivos inalterados.

Quando o trabalho realmente pode ser dividido, `agents.delegate` cria de duas a quatro subtarefas vinculadas à tarefa principal. Elas são executadas em paralelo pelo runtime e cada especialista mantém seus próprios passos, limites, eventos, checkpoints e pedidos de permissão.

Veja a arquitetura-base em [`docs/NEXO-CORE.md`](docs/NEXO-CORE.md) e os relatórios honestos em `docs/NEXO-V*-REPORT.md`, incluindo [`docs/NEXO-V8-REPORT.md`](docs/NEXO-V8-REPORT.md).

## Estado real das capacidades

| Classe | Capacidades principais |
|---|---|
| Stable | Core único, SQLite, INSTANT, filesystem protegido, capability registry, chat local |
| Functional | FAST/DEEP, agent loop/DAG, browser, RAG, memória híbrida, visão condicionada ao modelo, skills/MCP sem servidor conectado |
| Partial | sandbox sem isolamento de SO, debugging avançado, multi-agent, knowledge graph, acessibilidade auditada parcialmente, STT ainda dependente do navegador |
| Funcional local | imagem SD 1.5 por WebUI AMD/DirectML, visão Qwen separada |
| Scaffold/unavailable | vídeo desativado; edição depende do suporte do checkpoint/provider |

A matriz completa, evidências e limitações ficam em [`docs/master-audit/CAPABILITY-MATRIX.md`](docs/master-audit/CAPABILITY-MATRIX.md). A marca exibida é centralizada em `lib/nexo/brand.ts`; `Nexo` continua sendo o nome atual e nenhum rebranding foi imposto.

## Requisitos

- Windows
- Node.js 22 ou mais recente
- [Ollama](https://ollama.com/) instalado
- [uv](https://docs.astral.sh/uv/) para instalar o Piper local na primeira execução
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
npm run tts:setup # somente na primeira vez
npm run tts:start
./scripts/tts/start-agent-with-voice.ps1
npm run dev
```

Depois, acesse [http://localhost:3000](http://localhost:3000).

O serviço neural usa `pt_BR-faber-medium`, roda em CPU e escuta somente em `127.0.0.1:7332`. O áudio não sai do computador e não consome tokens pagos. `start-nexo.cmd` inicia o Piper e injeta `NEXO_TTS_PROVIDER_URL` automaticamente; se o Piper não estiver instalado, execute `npm run tts:setup` uma vez.

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
npm run image:setup
npm run image:start
npm run eval:extensions
npm run eval:coding-browser
npm run eval:conversation
npm run eval:conversation-live
npm run eval:conversation-manual
npm run eval:master
npm run benchmark:conversation
npm run benchmark:memory
npm run benchmark:v4
npm run benchmark:v5
```

`eval:intelligence` contém 200 casos de prontidão estrutural; ele não deve ser confundido com qualidade generativa. `eval:conversation` executa 120 conversas de 6 turnos (720 turnos) para identidade, apelidos, pronomes, correções, informalidade, tom e contradições; `eval:conversation-live` reproduz o transcript real no modelo local e mede TTFT; `eval:conversation-manual` executa as 20 conversas da amostra de revisão (no PowerShell, use `$env:NEXO_MANUAL_CASES='2,4'` para filtrar). `benchmark:conversation` compara os modelos locais no mesmo conjunto social curto. `eval:autonomy` executa 36 verificações de capacidade, incluindo um navegador Edge real com DOM, clique, console e screenshot. `eval:coding-browser` mantém 20 gates determinísticos para objetivo, inspeção, validação, plano integrado e contratos de navegador; ele não substitui uma futura taxa de resolução com 20 projetos quebrados e o modelo local real. `eval:master` mantém golden tasks do control plane para routing, honestidade, segurança, linguagem e false-success; seu próprio relatório declara que não mede qualidade generativa. `eval:media` usa `SKIPPED` para providers realmente ausentes. `benchmark:v4` separa runtime, TTFT, total, cold/warm e modelo. O Router só usa um benchmark de qualidade persistido quando há pelo menos 10 amostras reais naquele domínio.

## Skills e MCP

As skills versionadas ficam em `skills/*/SKILL.md`; skills pessoais podem ser adicionadas em `data/skills/` e não são enviadas ao Git. Cada skill tem `name`, `description` e instruções, pode ser ativada ou desativada e só entra no contexto quando combina com o objetivo.

Para MCP, copie `mcp-servers.example.json` para `data/mcp-servers.json` e configure somente processos locais confiáveis. O Nexo inicia o servidor por stdio, negocia capacidades, lista tools e exige aprovação antes de conectar ou chamar uma tool MCP. Variáveis de ambiente não aparecem na API de status.

## Privacidade

O SQLite em `data/nexo.db` guarda localmente tarefas, planos, permissões, eventos, jobs, sessões de navegador, memórias, conflitos, entidades, relações, handoffs, skills, objetivos pessoais, tarefas pessoais, preferências de proatividade, conceitos de estudo e índices de documentos. O navegador mantém uma cópia de conveniência dos chats e preferências da interface. Os modelos e embeddings são executados pelo Ollama localmente. Registros `RESTRICTED` não entram em pesquisa ou navegação externa. Pesquisa, navegação e MCP só saem do computador após uma ação autorizada; nesses casos, apenas a consulta ou requisição necessária é enviada à fonte escolhida.

O banco, logs, sessões, backups e índices locais são ignorados pelo Git e não são enviados ao GitHub.
