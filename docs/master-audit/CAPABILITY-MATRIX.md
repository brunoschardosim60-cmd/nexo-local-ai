# Master audit — capability matrix inicial

Classificação baseada em implementação, teste executado e comportamento observável. `STABLE` exige caminho utilizável e regressão coberta; `FUNCTIONAL` funciona com limites relevantes; `PARTIAL` só cobre parte do objetivo; `SCAFFOLD` possui contrato/estrutura sem provider ou profundidade suficiente.

| Capacidade | Status inicial | Evidência | Limitação principal |
|---|---|---|---|
| Nexo Core único | STABLE | `agent/core/nexo-core.mjs`, health, 80 testes | composição central ainda extensa |
| HTTP local/token/CORS | STABLE | `local-agent.mjs`, runtime eval | token vive somente no processo/console |
| INSTANT | STABLE | intent/runtime tests, 24 ms | conjunto determinístico pequeno |
| FAST streaming | FUNCTIONAL | runtime stream + benchmark | cold start 23,6 s |
| DEEP | FUNCTIONAL | router + benchmark | cold start 80 s; qualidade depende do 7B local |
| Complexity estimator | FUNCTIONAL | 200-case readiness eval | regras heurísticas; não aprende online |
| Model Router V2 | FUNCTIONAL | router tests/benchmarks | poucos benchmarks reais de competência |
| Model warming | FUNCTIONAL | endpoint e cold/warm benchmark | warming consome RAM; não elimina primeiro cold load |
| Context Engine | FUNCTIONAL | contexto progressivo e tests | compressor/retrieval ainda simples |
| Epistemic states | FUNCTIONAL | `epistemic.mjs`, runtime prompts/tests | modelo pode desobedecer em geração livre |
| Planner | FUNCTIONAL | planner + agent tests | qualidade limitada pelo modelo local |
| Task DAG | FUNCTIONAL | task graph persistido/executado | paralelismo conservador e pouca prova de conflito real |
| Executor/retries | FUNCTIONAL | executor tests | duas taxonomias de erro concorrentes |
| Verifier/evidence | FUNCTIONAL | evaluator tests, false-success rules | critérios são parcialmente inferidos por regex |
| Critic/replanning | FUNCTIONAL | critic + loop | avaliação generativa end-to-end pequena |
| Cancelamento de chat/modelo | STABLE | AbortSignal cliente→HTTP→Ollama | depende de provider respeitar abort |
| Cancelamento de processo | FUNCTIONAL | sandbox AbortSignal | SIGTERM não é isolamento de árvore/OS completo |
| Checkpoint/resume | FUNCTIONAL | persistência e autonomy tests | falta teste real de restart no meio de alteração longa |
| Filesystem tools | STABLE | contratos, path boundary, tests | área autorizada ampla depende de configuração |
| Git tools | FUNCTIONAL | allowlist e tests | não há ownership completo de diff pré-existente por hunk |
| Shell sandbox | PARTIAL | spawn sem shell + allowlist | sem isolamento de OS, CPU/RAM ou rede forte |
| Repository map/search | FUNCTIONAL | repository tests/eval | regex, sem Tree-sitter/LSP/call graph completo |
| AST/Tree-sitter/LSP | PLANNED | nenhum runtime real encontrado | coding sem inteligência semântica profunda |
| Debug pipeline | PARTIAL | hypotheses/debug module | pouca prova end-to-end em projetos quebrados reais |
| Browser DOM/click/type/tabs | FUNCTIONAL | Playwright + autonomy eval | provider Edge específico e sessão local |
| Browser console/screenshot | FUNCTIONAL | provider + autonomy eval | visual verifier ainda limitado |
| Research | FUNCTIONAL | decomposição/fontes/claims | sem eval vivo robusto de divergência/citações |
| RAG de texto/documento | FUNCTIONAL | chunks, FTS+vector, tests | ingestão de formatos ricos é limitada |
| Memória persistente SQLite | STABLE | V6 tests/long/perf | arquivo de banco monolítico crescente |
| Memory gate/scopes | FUNCTIONAL | gate + V6 tests | mais evals adversariais de vazamento necessários |
| Embeddings semânticos | FUNCTIONAL | provider Ollama + fallback identificado | degrada para lexical-hash quando provider falha |
| Recuperação híbrida | FUNCTIONAL | vector+FTS+recency+importance | reranker heurístico |
| Contradição/forget/delete | FUNCTIONAL | V6 tests + FKs | delete físico carecia de transação explícita |
| Knowledge graph | PARTIAL | entidades/relações e graph eval | consumo prático ainda pequeno |
| Continuidade | FUNCTIONAL | handoff/session/continuity tests | pouca prova de semanas/projetos grandes |
| Personalidade adaptativa | FUNCTIONAL | engine + observations + tests | polimento gramatical duplicado na UI |
| Goals/tasks/study | FUNCTIONAL | V7 modules + 30-case eval | UI é mais painel que fluxo conversacional em partes |
| Proatividade | FUNCTIONAL | dedupe, levels, annoyance eval | scheduler local precisa estar aberto |
| Capability Registry | STABLE | 96 capabilities, V9 eval | catálogo mistura disponível e indisponível, mas status existe |
| Skills | FUNCTIONAL | 5 carregadas, manifest/permissions/tests | execução avançada e ecossistema pequenos |
| MCP | FUNCTIONAL | lifecycle/schema/security tests | nenhum servidor conectado no baseline |
| Connectors/workflows | FUNCTIONAL | registry/V9 tests | integrações reais não configuradas |
| Multi-agent | PARTIAL | coordinator/capability tokens/messages | eval principalmente estrutural; pouca coordenação real longa |
| Vision | FUNCTIONAL | Ollama provider/media eval | depende de modelo multimodal instalado |
| Imagem real | SCAFFOLD | A1111/Forge provider e fila | provider indisponível no baseline |
| Edição de imagem | SCAFFOLD | img2img contract/artifact lineage | não observável sem provider |
| Vídeo | SCAFFOLD | contracts/storyboard/flag | geração desativada; não simular |
| STT/TTS local | SCAFFOLD | HTTP provider contracts | endpoints não configurados |
| Web Speech fallback | FUNCTIONAL | browser speech code | não é local garantido nem realtime voice completo |
| VAD/mic reactivity | FUNCTIONAL | analyser real + VAD | sujeito à permissão/hardware do browser |
| Output audio reactivity | PARTIAL | Web Speech boundary/pulses | sem PCM real de saída no fallback |
| Barge-in | FUNCTIONAL | stop synthesis + state transition | cobertura manual/browser, não áudio E2E |
| Living Eye states | FUNCTIONAL | componente + screenshots/tests | muitos testes são estáticos/visuais |
| Living Eye organic motion | FUNCTIONAL | blink/saccade/breathing/reduced motion | estética exige revisão humana |
| UX chat-first | FUNCTIONAL | screenshots + UX tests | `page.tsx` é god object e mode bar é permanente |
| Artifacts | FUNCTIONAL | store/panel/image/video/audio render | provider real necessário para mídia pesada |
| Responsive | FUNCTIONAL | screenshots anteriores 390/768/1440/1920 | faltava matriz completa 360/430/1024/1280 nesta rodada |
| Accessibility | PARTIAL | ARIA/reduced-motion/touch styling | falta auditoria automatizada dedicada |
| Observability | FUNCTIONAL | logger/tracing/events/metrics | audit log HTTP é somente memória e limitado |

