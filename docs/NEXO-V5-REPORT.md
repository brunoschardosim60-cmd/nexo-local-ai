# Nexo V5 — relatório de implementação e auditoria

Data: 30 de agosto de 2026. Base auditada: commit `209abbe` (V4). Este documento separa capacidade comprovada de intenção arquitetural.

## Baseline observado

- V4 iniciava com 33 testes, 13 avaliações de runtime, 200 casos de prontidão estrutural e build/lint válidos.
- O Browser Agent anterior fazia leitura HTTP e screenshot; não clicava, digitava ou verificava uma aplicação real.
- Tarefas tinham DAG e checkpoints, mas não possuíam um objeto de objetivo explícito, budgets completos nem capability token.
- O benchmark de desempenho ficou bloqueado com Qwen 3B, Qwen 7B e embedding carregados ao mesmo tempo. No RX 580 de 4 GB isso excedia o orçamento prático de VRAM.
- Memória, perfil, RAG, Router V2, Critic, mídia e isolamento por allowlist já existiam e foram preservados.

## Implementado e provado

- Goal Engine persistente com objetivo, restrições, suposições, evidências exigidas, critérios e estados `PASS`, `FAIL`, `UNCERTAIN` e `NOT_CHECKED`.
- Budgets persistentes de passos, retries, tool calls, model calls, duração e custo local zero; uso aparece na tarefa.
- Capability tokens temporários vinculados à tarefa, especialista, namespace, escopo e TTL, com revogação ao terminar ou cancelar.
- Cancelamento propagado ao Executor e ao processo filho do sandbox por `AbortSignal`.
- Tool discovery seletiva por objetivo e namespace; o plano não recebe obrigatoriamente o catálogo inteiro.
- Working memory curta por tarefa e compressão seletiva dos resultados. O resultado integral fica no SQLite e a visão padrão usa o resumo.
- Debugging Engine com hipótese, evidência favorável/contrária, experimento, confiança e resolução persistentes.
- Project Workspace persistente: mapa, linguagens, scripts, rotas, Git e `NEXO.md` marcado como `UNTRUSTED_PROJECT_INSTRUCTIONS`.
- Browser V2 com Playwright sobre Edge/Chrome real: DOM, accessibility tree, URL, título, console, erros de página, rede, clique, preenchimento, seleção, hover, teclado, scroll, abas, upload, download, screenshot e verificação antes/depois.
- Sessões do navegador são descartáveis e não persistem cookies ou segredos. Digitação marcada como sensível é recusada.
- Artifact graph básico com relações `derived-from`, hash e proveniência por provider/tarefa.
- Mensagens estruturadas entre especialistas e coleta pelo supervisor com detecção de conflito de artefato.
- Serialização das chamadas generativas do Ollama e descarregamento do modelo anterior ao trocar; embeddings usam `keep_alive: 0`. Isso evita repetir o cenário de três modelos residentes ao mesmo tempo, com o custo honesto de recarregar quando o router troca de modelo.
- UI de tarefa ampliada com operação atual, budget usado, Goal Engine e critérios de aceitação. O painel de capacidades informa Playwright real.

## Parcial, não vendido como completo

- Coding V3 usa AST oficial do TypeScript e referências textuais. Tree-sitter e um servidor LSP real não foram adicionados porque ainda não há integração que justificasse essas dependências.
- O sandbox é um processo sem shell, com ambiente reduzido, allowlist, timeout e cancelamento. Não é contêiner, VM, AppContainer nem isolamento de kernel.
- Browser V2 não possui login autônomo com credenciais. Segredos devem ser inseridos pelo usuário. CAPTCHA, MFA e confirmação financeira continuam sendo barreiras humanas.
- Research V3 tem decomposição, múltiplas fontes, cobertura, datas, lacunas e sinal de divergência; ainda não mantém um grafo argumentativo profundo com crawler iterativo.
- Multi-agent executa subtarefas realmente separadas no mesmo runtime e tem mensagens/conflitos básicos. Não há processo de SO separado por especialista nem merge automático de branches.
- O scheduler é persistente, mas prioridades gerais, cotas por tipo e preempção ainda não formam um scheduler completo de sistema.
- Documentos e dados reutilizam RAG, filesystem e shell restrito. Um Python Worker isolado e geração nativa completa de DOCX/XLSX não foram incorporados ao Core.
- ComputerProvider de desktop inteiro, mouse global e teclado global não foi habilitado. Essa capacidade seria de alto risco e exige isolamento/consentimento mais forte que o disponível hoje.
- O visual verifier comprova observação, mudança e screenshot; comparação perceptual/pixel-diff e aprovação estética ainda são futuras.

## Verificação executada

- `npm run test:agent`: 39/39, incluindo cancelamento real e Edge real.
- `npm run eval:autonomy`: 36/36. É uma avaliação de capacidade real e browser, não um benchmark de inteligência generativa.
- `npm run lint`: válido após correções.
- `npm run build`: válido.
- `npm audit`: zero vulnerabilidades no momento da instalação de `playwright-core`.
- Runtime reiniciado e observado em `127.0.0.1:7331`: Core 5.0.0, Runtime 5.0.0, 62 tools e Playwright disponível. A chamada HTTP determinística “que horas são?” terminou em 20 ms sem modelo.
- Benchmark real no Ryzen 5 3600/RX 580: fast 3B cold TTFT 19,0 s e total 24,1 s; fast warm TTFT 293 ms e total 716 ms; deep 7B cold TTFT 47,9 s e total 65,0 s; deep warm TTFT 3,38 s e total 16,8 s. O gargalo restante é carregamento/inferência local, não o roteamento.

## Dependências

- Adicionada: `playwright-core@1.62.1`, usada diretamente pelo Browser V2 com o Edge/Chrome já instalado.
- Não adicionadas: Tree-sitter e LSP. A V5 continua usando `typescript@5.9.3`, que já estava presente e é realmente utilizado para AST.

## Limites técnicos atuais

- A qualidade final continua limitada pelos modelos Ollama instalados e pelo hardware. Um 3B rápido não se torna equivalente a modelos de fronteira por causa do orquestrador.
- Trocar entre 3B e 7B pode produzir cold start porque a política de VRAM mantém somente um modelo generativo residente.
- Ações `WRITE`, `EXECUTE` e `NETWORK` continuam exigindo aprovação; destrutivas e caminhos protegidos são negados.
- Downloads, uploads e screenshots ficam limitados ao workspace. A navegação valida a URL inicial contra SSRF; defesas contra navegação indireta hostil ainda precisam de interceptação de cada request.

## Próximos gates recomendados

1. Interceptação de requests do Playwright e política de domínio por tarefa.
2. LSP/Tree-sitter somente com eval de ganho real em código.
3. Python Worker em processo/container isolado para documentos e dados.
4. Scheduler global de CPU/RAM/VRAM com prioridade e preempção.
5. Evals generativos de reparo de repositório e pesquisa com respostas avaliadas, separados dos 200 casos estruturais.
6. Visual verifier perceptual e ComputerProvider restrito a aplicações explicitamente autorizadas.
