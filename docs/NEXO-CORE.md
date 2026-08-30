# Nexo Core

O Nexo é tratado como runtime local-first. O modelo não é o agente: ele é um componente usado pelo chat, planner, Critic e seletor de ferramentas. O Runtime V6 escolhe entre `INSTANT`, `FAST`, `DEEP`, `AGENT` e comandos determinísticos de memória antes de carregar contexto; o Model Router V2 seleciona o modelo pelo domínio, dificuldade, tools, visão e benchmarks locais.

## Fluxo

```text
Skills + RAG + memória → Context Engine
                              ↓
objetivo → Planner → Task Graph → Executor → policy → permissão → tool
              ↓                         ↓                           ↓
        especialista              agents.delegate              ambiente
                                        ↓                           ↓
                               até 4 subtask loops      observação → verifier
                                                               ├→ PASS → sucesso
                                                               └→ FAIL/UNCERTAIN → Critic
                                                                                  └→ estratégia nova/replanner
```

Cada run persiste objetivo, plano, nós, dependências, tentativas, observações, tool runs, permissões, eventos, checkpoints e resultado. `pause`, `resume` e `cancel` fazem parte do protocolo; tarefas interrompidas em `planning` ou `running` são retomadas na inicialização.

## Garantias atuais

- Tools possuem namespace, versão, JSON Schema, risco e executor. Input desconhecido ou inválido é recusado antes da execução.
- Leituras ficam dentro do workspace. Credenciais e caminhos protegidos são bloqueados.
- Escrita e processos exigem aprovação. Comandos destrutivos são negados.
- `filesystem.patch` exige o SHA-256 observado na leitura e cria backup.
- O executor usa allowlist, `spawn` sem shell, ambiente mínimo e limites de tempo/saída. É uma barreira local, não isolamento de SO por VM/contêiner.
- Git nativo atual é somente leitura: status, diff, log e show.
- O verifier usa saídas reais das tools e critérios de aceitação, produzindo `PASS`, `FAIL` ou `UNCERTAIN`; alterações sem teste/build nunca recebem `PASS`.
- Memória combina SQLite FTS, embeddings semânticos locais, reranking, importância, confiança, recência, escopo, temporalidade, proveniência, contradições e esquecimento controlado; o hash lexical permanece apenas como fallback de disponibilidade.
- O Knowledge Graph local mantém entidades e relações tipadas com proveniência; o Continuity Engine persiste handoffs de sessão/projeto.
- RAG é marcado como conteúdo não confiável e separado das instruções do runtime.
- Repository Intelligence indexa arquivos, imports, exports, símbolos, chamadas AST, rotas, scripts e relações sem ler segredos.
- Pesquisa decompõe perguntas, consulta Wikipedia, OpenAlex e Stack Overflow em paralelo e devolve URLs, evidências, cobertura, datas e lacunas; acesso externo exige aprovação.
- Navegação valida protocolo, credenciais, DNS, redirecionamentos, tamanho e redes privadas antes de ler uma página.
- Browser sessions, runtime events, jobs e estado de skills sobrevivem a reinícios no SQLite.
- MCP só inicia processos presentes no arquivo local de configuração e cada descoberta/chamada exige aprovação de execução.
- Especialistas mudam foco e seleção de tools, mas nunca ampliam permissões.

## Sequência disciplinada

| Etapa | Estado atual |
|---|---|
| 1. Refatorar arquitetura | Base concluída: UI → SDK/hook → Core; a separação visual pode continuar por componentes |
| 2. Nexo Core | Concluído |
| 3. SQLite | Concluído |
| 4. Tool Registry tipado | Concluído com contratos JSON validados em runtime |
| 5. Filesystem tools | Concluído, incluindo patch com hash |
| 6. Git tools | Leitura concluída; branch/commit/restore ficam para a evolução protegida |
| 7. Executor restrito | Concluído com allowlist e sem shell; isolamento real de SO ainda depende de VM/contêiner |
| 8–9. Agent Loop + Planner | Concluído |
| 10. Task Graph | Concluído com dependências, detecção de ciclos e execução paralela de nós independentes sem permissão pendente |
| 11–13. Executor, Verifier, Critic, retry/replan | Concluído com `PASS`/`FAIL`/`UNCERTAIN`, três rodadas máximas e estratégia diferente |
| 14. Checkpoints/resume | Concluído |
| 15. Repository map | Concluído |
| 16. Symbol/code search | AST TypeScript/JavaScript, declarações, chamadas e referências concluídos; LSP e Tree-sitter multilíngue ainda não |
| 17. Context Engine | V2 seletivo concluído: carrega somente memória, RAG, repositório, tools e eventos relevantes |
| 18. RAG | Semântico e incremental com `embeddinggemma`, hash de conteúdo, chunks estruturais, freshness e migração de vetores antigos |
| 19. Memory Engine | Personal Memory V3: tipos, escopos, temporalidade, proveniência, gate, conflitos, consolidação, procedimentos, decisões, erros, grafo e continuidade |
| 20. Model Router | V2.2 adaptativo, consciente de profiles, modelos carregados, recursos, domínio e benchmarks locais |
| 21. Research Agent | Três fontes públicas, decomposição multi-query, matriz de evidências, datas, cobertura, lacunas e falhas parciais |
| 22. Browser Agent | Base concluída com sessões, leitura segura, links observados e SSRF guard |
| 23. MCP | Cliente stdio concluído para servidores locais configurados; Streamable HTTP ainda não |
| 24. Skills | Concluído com descoberta, recuperação por intenção e ativação persistente |
| 25. Coding Agent avançado | AST, contexto de símbolos, inspeção de repositório e pipeline restrito de testes/lint/typecheck/build; LSP e call graph tipado completo ainda não |
| 26. Preview + screenshots | Concluído via Chrome/Edge headless quando disponível |
| 27. Visual verifier | Verificação estrutural e análise semântica local concluídas com `qwen2.5vl:3b` |
| 28. Multi-agent | Delegação paralela de até quatro subtarefas concluída, com vínculo pai/filho e permissões próprias; isolamento em processos separados ainda não |
| 29. Background/event architecture | Scheduler, jobs e event bus persistentes concluídos; webhooks ainda não |
| 30. Evals e benchmarks | Suítes do agente + 10 testes V6, evals de memória longa, falsa memória, grafo e benchmark cold/warm com 2.000 registros |

## Matriz V4 de capacidade

| Área | Estado | Provider observado |
|---|---|---|
| Chat/código/raciocínio | Estável | Ollama, Qwen 3B/7B |
| Embeddings e memória semântica | Estável | Ollama, embeddinggemma |
| Visão, OCR e análise de screenshot | Beta funcional | Ollama, qwen2.5vl:3b |
| Geração de imagem raster | Beta, provider ausente neste PC | API local Automatic1111/Forge em `127.0.0.1:7860` |
| STT/TTS | Browser funcional; servidor configurável ausente | Web Speech API ou endpoint HTTP local |
| Vídeo | Experimental, desativado | endpoint HTTP local configurável |
| Fila/artefatos/recursos | Estável | SQLite + disco local + telemetria do Windows |

Um provider ausente nunca é apresentado como sucesso. As avaliações registram `SKIPPED`, a API devolve `kind: unavailable` e a interface explica o componente que precisa ser iniciado.

Não fazem parte desta fase: shell irrestrito, controle geral do sistema operacional, Git destrutivo, agentes paralelos sem isolamento, cloud automática ou integrações que enviem dados sem autorização.
