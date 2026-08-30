# Whaleye / Nexo — Master Consolidation Report

Data: 2026-08-30. Escopo: auditoria, consolidação, correção, integração e hardening do produto local existente. O nome atual continua **Nexo**; Whaleye permanece candidato, não decisão.

## 1. Executive summary

O Nexo é um runtime local funcional e amplo, não apenas um chatbot. Núcleo, persistência, routing, agent loop, browser e segurança básica são reais. A auditoria também encontrou maturidade desigual: imagem e voz dependem de providers ausentes, vídeo está desativado, multi-agent/debugging/grafo ainda não têm profundidade comparável a agentes comerciais e o sandbox não oferece isolamento de sistema operacional. Esta rodada eliminou falso sucesso de imagem, consolidou erros, tornou delete de memória atômico, removeu comportamento textual duplicado da UI, preparou a marca, adicionou golden tasks adversariais e alinhou a documentação.

## 2. Baseline

Baseline completo: [`master-audit/BASELINE.md`](master-audit/BASELINE.md). O ponto inicial era `ef591cd`: 80/80 testes, lint/types/build aprovados e zero vulnerabilidades. FAST aquecido tinha TTFT de 174 ms; FAST frio, 23,6 s. DEEP aquecido tinha TTFT de 3,7 s; frio, 64,9 s. Busca de 2.000 memórias: 97,47 ms fria e 87,68 ms aquecida.

## 3. Spec review

Foram reconciliados Core V3, V4–V9, UX/UI 2.0 e Living Eye usando prompts disponíveis, Git, README, relatórios, testes e código. Reconstrução: [`master-audit/SPEC-RECONSTRUCTION.md`](master-audit/SPEC-RECONSTRUCTION.md). Marca final, provider de vídeo e stack final de voz continuam `SPEC_UNAVAILABLE`.

## 4. Capability matrix

A matriz detalhada está em [`master-audit/CAPABILITY-MATRIX.md`](master-audit/CAPABILITY-MATRIX.md). Ela usa `STABLE`, `FUNCTIONAL`, `PARTIAL`, `SCAFFOLD`, `BROKEN` e `PLANNED` e separa provider existente de provider disponível.

## 5. Architecture before

Havia um Core único, mas quatro desvios de coerência: taxonomias de erro concorrentes, fallback SVG que podia mascarar provider de imagem ausente, correção gramatical na UI e marca espalhada sem contrato. Rotas JSON de ação legadas ainda convivem com o agent loop tipado. `app/page.tsx` e `agent/memory/database.mjs` continuam grandes.

## 6. Architecture after

```text
UI → SDK → façade loopback → Nexo Core
                           ├─ Runtime/Router/Context/Models
                           ├─ Goal/Planner/DAG/Executor/Verifier/Critic
                           ├─ Memory/RAG/Graph/Continuity
                           ├─ Media/Providers/Artifacts
                           └─ Capability Registry
                                  ↓
                           Contracts/Permissions/Sandbox
```

O error contract canônico vive em `agent/contracts/errors.mjs`. Respostas são normalizadas no Runtime. A UI só apresenta mídia raster persistida pelo Artifact Store; SVG histórico é rotulado como legado, nunca fabricado como fallback. A identidade de produto fica em `lib/nexo/brand.ts`, separada do namespace técnico `nexo`.

## 7. Fixes

- removido gerador SVG placeholder e sua heurística visual da UI;
- indisponibilidade do Forge agora permanece observável no chat;
- unificadas categorias `TRANSIENT`, `INVALID_INPUT`, `PERMISSION`, `AUTH`, `MISSING_CAPABILITY`, `RESOURCE`, `DEFINITIVE` e `UNKNOWN`;
- erros estruturados agora têm `code`, `category`, `message`, `recoverable`, `retryAfter` e `details`;
- exclusão física de memória e FTS passou a usar transação atômica;
- teste prova remoção do índice e limpeza de referência no grafo;
- corrigido espaço de microcopy detectado no DOM real após centralizar a marca.

## 8. Features completed

Nenhum provider fictício foi promovido. Foram concluídos como infraestrutura de produto: error contract compartilhado, brand config, golden master eval e regressão de exclusão física completa da memória.

## 9. Features improved

Honestidade de mídia, retry classification, memória, separação UI/Core, linguagem em pt-BR, documentação, segurança adversarial e cobertura responsiva.

## 10. Removed / consolidated

Foram removidas 49 linhas de fallback visual/heurística e a cópia de normalização gramatical da UI. As duas taxonomias de erro agora importam um contrato central com aliases de compatibilidade. Não houve reescrita ampla nem remoção arriscada de rotas antigas.

## 11. Intelligence

INSTANT/FAST/DEEP/AGENT continuam distintos. Estimator e Router V2 consideram domínio, dificuldade, tools, hardware, disponibilidade e benchmarks somente quando há amostra suficiente. Epistemic states, Context Engine, verifier e Critic são funcionais. Limite: qualidade final continua limitada pelos modelos 3B/7B e os 200 evals de Intelligence são readiness, não competência generativa.

## 12. Agent

Goal, plano, DAG persistido, execução paralela conservadora, permissões, checkpoints, budgets, cancelamento, evaluator e replanejamento existem e passam nos testes. O verifier rejeita mutação sem escrita/teste e mídia sem artifact. Faltam mais tarefas longas de reparo em repositórios reais e retomada após restart no meio de uma alteração.

## 13. Memory

SQLite, gate, escopos, FTS, embedding local com fallback identificado, reranking, contradição, esquecimento, continuidade e grafo funcionam. Delete agora é atômico e testado contra registro, FTS e referência. Benchmark de 2.000 registros permanece abaixo de 100 ms no baseline. O fallback lexical não é chamado de embedding semântico.

## 14. Coding

Mapa de repositório, TypeScript compiler AST, símbolos, calls, imports, referências textuais, patch por hash, Git e checks restritos são funcionais. Tree-sitter, LSP, type-aware references e call graph completo permanecem planejados. Não há claim de paridade com Codex.

## 15. Browser

Playwright real sobre navegador local comprovou navegação, DOM/acessibilidade, interação, console, screenshot e verificação. Nesta rodada a UI foi observada nos oito breakpoints e o fluxo de horário/imagem foi exercitado. Limite: não há isolamento do navegador nem eval amplo de aplicações externas autenticadas.

## 16. Research

Decomposição, múltiplas fontes, claims e proteção SSRF existem. A qualidade de fontes e divergências é modelada, mas ainda faltam evals vivos, repetíveis e maiores para sustentar maturidade `STABLE`.

## 17. Multimodal

Schema comum, modality router, percepção, visão local, queue, resources e artifacts são funcionais. Imagem real está `SCAFFOLD` no hardware atual porque Forge não responde. Vídeo está desativado. Nenhum SVG é retornado como imagem raster gerada.

## 18. Voice

Reconhecimento e síntese via Web Speech funcionam como fallback do navegador. Contratos STT/TTS HTTP existem, mas endpoints não estão configurados. Não existe realtime voice local completo; latências speech-end→understanding→first-audio ainda não possuem benchmark reproduzível.

## 19. Living Eye

Os dez estados, blink irregular, double/long blink, micro-saccades, respiração, parallax, quality modes, reduced motion e barge-in estão implementados. LISTENING usa energia real do microfone. SPEAKING usa eventos reais `onboundary`, mas não amplitude PCM; por isso audio-output reactivity permanece `PARTIAL`.

## 20. Personality

Traços, observações, confiança, contradição e limites por contexto continuam no Core. A normalização de erros recorrentes de português saiu da UI e foi incorporada ao Runtime. Contextos técnicos/sensíveis continuam reduzindo humor/profanidade.

## 21. UX/UI

Chat-first, sidebar progressiva, composer fixo, artifact panel, agent card, memória, capacidades, temas claro/escuro/automático e modo de voz foram preservados. Não houve redesign cosmético nesta rodada. O DOM real não apresentou overflow em 360, 390, 430, 768, 1024, 1280, 1440 e 1920.

Screenshots: [360](master-audit/screenshots/final-360-chat.png), [390](master-audit/screenshots/final-390-chat.png), [430](master-audit/screenshots/final-430-chat.png), [768](master-audit/screenshots/final-768-chat.png), [1024](master-audit/screenshots/final-1024-chat.png), [1280](master-audit/screenshots/final-1280-chat.png), [1440](master-audit/screenshots/final-1440-chat.png), [1920](master-audit/screenshots/final-1920-chat.png), [chat INSTANT](master-audit/screenshots/final-1440-chat-instant.png), [mídia indisponível honesta](master-audit/screenshots/final-1440-media-unavailable.png), [tema claro](master-audit/screenshots/final-1440-light.png), [voz mobile](master-audit/screenshots/final-390-voice-listening.png) e [fala desktop](master-audit/screenshots/final-1440-voice-speaking.png).

## 22. Security

Loopback, token aleatório, CORS estrito, rate limit, schemas, path boundaries, secret-path deny, approval por risco, spawn sem shell e SSRF guard continuam ativos. Novos testes adversariais cobrem `.env`, `.ssh`, `git reset --hard`, metacaracteres, executável não permitido e traversal. O sandbox continua `PARTIAL`: não há VM/container, limite forte de RAM/CPU ou bloqueio de rede por processo.

## 23. Performance

| Rota | Antes TTFT / total | Depois TTFT / total |
|---|---:|---:|
| INSTANT | 24 / 24 ms | 25 / 25 ms |
| FAST frio | 23.613 / 24.082 ms | 7.761 / 8.512 ms |
| FAST aquecido | 174 / 720 ms | 117 / 1.060 ms |
| DEEP frio | 64.913 / 80.054 ms | 68.661 / 83.734 ms |
| DEEP aquecido | 3.702 / 9.996 ms | 3.757 / 13.760 ms |

O total varia com a quantidade de tokens gerada (FAST final: 26 tokens; DEEP final: 130), portanto a queda do FAST frio não é atribuída às alterações desta rodada e pode refletir cache do SO/Ollama. Runtime overhead final: 5 ms em FAST aquecido e 4 ms em DEEP aquecido. O gargalo continua sendo carregamento frio, especialmente no 7B.

Memória com 2.000 registros: 93,82 ms fria e 101,28 ms aquecida na medição final; ambas passam o gate, com variação normal de máquina em uso.

## 24. Tests

Antes: 80 testes. Depois das correções: 87 testes, incluindo cinco hardening/false-success, uma regressão de memória e a normalização de saída no Runtime. Categorias presentes: unit, integration, browser, security, UX contract e persistence. Visual e áudio temporal ainda dependem parcialmente de inspeção humana.

## 25. Evals

Foi criado `eval:master` com 13 golden tasks do control plane: horário exato, FAST casual, DEEP por esforço, AGENT coding, memória seletiva, contexto de segurança, secrets, destruição, error contract, linguagem, dois false-success e traversal. Resultado observado: 13/13. O próprio output declara que isso não mede qualidade generativa.

## 26. Build

Build Vinext completo aprovado após as correções. O aviso de classificação dinâmica de rota é do analisador do Vinext e não uma falha de build.

## 27. Lint / types

Oxlint e `tsc --noEmit` aprovados após cada onda relevante.

## 28. Dependencies

Nenhuma dependência nova foi instalada. `npm audit` encontrou zero vulnerabilidades no grafo de 697 pacotes. Providers ausentes não foram instalados automaticamente.

## 29. Known limitations

1. Cold start de 3B/7B é lento neste hardware.
2. Forge/Stable Diffusion não está ativo; imagem raster indisponível.
3. Vídeo desativado e sem provider.
4. STT/TTS HTTP não configurados; Web Speech é fallback.
5. SPEAKING sem PCM real de saída.
6. Sandbox sem isolamento de SO/recursos/rede forte.
7. Tree-sitter/LSP/call graph ainda ausentes.
8. Multi-agent, debugging e knowledge graph têm pouca prova end-to-end longa.
9. Evals de inteligência medem mais control plane/readiness que qualidade generativa.
10. `app/page.tsx` e `database.mjs` permanecem grandes.

## 30. Technical debt

- **P1:** substituir/aposentar rotas JSON legadas de ação em favor de tasks/tools do Core;
- **P1:** suite de competência generativa com repositórios quebrados e critérios externos;
- **P2:** decompor `app/page.tsx` por chat, voice, settings e legacy renderer;
- **P2:** separar repositórios SQLite por módulo mantendo uma conexão/migrações únicas;
- **P2:** gate de cold-start e política explícita de unload/warm conforme RAM;
- **P3:** Tree-sitter/LSP e pesquisa viva com claims/citações;
- **P3:** provider local real de voz/imagem escolhido pelo usuário.

## 31. Git

Commits desta rodada:

- `2bf5630` — `docs: record master audit baseline`
- `2f2b7ba` — `fix(core): unify errors and remove false media success`
- `cb04b3c` — `refactor(runtime): centralize response and product identity`

O commit final de documentação/evidências e o hash final são registrados no histórico Git; não houve rebase, reset destrutivo ou remoção de estado do usuário.
