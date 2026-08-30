# Nexo Core

O Nexo é tratado como runtime local-first. O modelo não é o agente: ele é um componente usado pelo chat, planner e seletor de ferramentas. O Runtime V3 escolhe entre `INSTANT`, `FAST`, `DEEP` e `AGENT` antes de carregar contexto.

## Fluxo

```text
Skills + RAG + memória → Context Engine
                              ↓
objetivo → Planner → Task Graph → Executor → policy → permissão → tool
              ↓                         ↓                           ↓
        especialista              agents.delegate              ambiente
                                        ↓                           ↓
                               até 4 subtask loops      observação → verifier
                                                               ├→ sucesso
                                                               └→ retry/replanner
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
- Memória combina SQLite FTS, vetores locais, importância e confiança.
- RAG é marcado como conteúdo não confiável e separado das instruções do runtime.
- Repository Intelligence indexa arquivos, imports, exports, símbolos, rotas, scripts e relações sem ler segredos.
- Pesquisa normaliza resultados de Wikipedia, OpenAlex e Stack Overflow com URL e evidência; acesso externo exige aprovação.
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
| 11–13. Executor, Verifier, retry/replan | Concluído |
| 14. Checkpoints/resume | Concluído |
| 15. Repository map | Concluído |
| 16. Symbol/code search | Base concluída; Tree-sitter/LSP ainda não |
| 17. Context Engine | Concluído com orçamento e separação trusted/untrusted |
| 18. RAG | Concluído localmente |
| 19. Memory Engine | Base híbrida e personalidade adaptativa persistente concluídas; consolidação automática avançada ainda não |
| 20. Model Router | Concluído para 3B/7B |
| 21. Research Agent | Base concluída com três fontes públicas, evidências e falhas parciais por provedor |
| 22. Browser Agent | Base concluída com sessões, leitura segura, links observados e SSRF guard |
| 23. MCP | Cliente stdio concluído para servidores locais configurados; Streamable HTTP ainda não |
| 24. Skills | Concluído com descoberta, recuperação por intenção e ativação persistente |
| 25. Coding Agent avançado | Base concluída com inspeção de repositório e pipeline restrito de validação; LSP/Tree-sitter ainda não |
| 26. Preview + screenshots | Concluído via Chrome/Edge headless quando disponível |
| 27. Visual verifier | Verificação estrutural concluída; análise semântica depende de futuro modelo local com visão |
| 28. Multi-agent | Delegação paralela de até quatro subtarefas concluída, com vínculo pai/filho e permissões próprias; isolamento em processos separados ainda não |
| 29. Background/event architecture | Scheduler, jobs e event bus persistentes concluídos; webhooks ainda não |
| 30. Evals e benchmarks | 22 testes automatizados e suite determinística com 13 critérios; benchmarks longos de 100–500 tarefas ainda não |

Não fazem parte desta fase: shell irrestrito, controle geral do sistema operacional, Git destrutivo, agentes paralelos sem isolamento, cloud automática ou integrações que enviem dados sem autorização.
