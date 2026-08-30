# Master audit — gaps e plano priorizado

## P0 — correctness/security/honestidade

1. Remover o falso fallback de imagem SVG da UI. Imagem real indisponível deve permanecer indisponível.
2. Unificar o contrato de erros para impedir decisões de retry divergentes entre orchestrator e extensions.
3. Cobrir false-success, path traversal, shell injection, secret paths e capability errors numa golden/master suite.
4. Tornar delete de memória/índice atômico e provar limpeza de referências por teste.

## P1 — inteligência e autonomia

1. Fazer critérios de aceitação e erro padronizados fluírem pelo executor/verifier.
2. Separar avaliações de readiness de avaliações de competência; adicionar golden tasks reais e adversariais.
3. Classificar multi-agent, knowledge graph e debugging como parciais até existirem tarefas end-to-end fortes.
4. Preservar um único agent loop; não adicionar especialistas novos nesta rodada.

## P2 — performance e experiência

1. Reduzir ambiguidade entre modo manual e auto-routing; manter o controle avançado sem exigir escolha para chat simples.
2. Documentar e limitar cold start; warming é útil, mas não deve pressionar RAM silenciosamente.
3. Remover polimento textual duplicado da UI depois de cobrir o comportamento no Runtime.
4. Validar 360, 390, 430, 768, 1024, 1280, 1440 e 1920 com screenshots reais.
5. Preparar brand config central sem renomear produto/namespace.

## P3 — profundidade de capacidades

1. Tree-sitter/LSP/call graph para coding intelligence.
2. Evals vivos de pesquisa com claims e fontes independentes.
3. Providers locais reais de imagem e voz, instalados/configurados pelo usuário.
4. Realtime output audio com PCM analisável; Web Speech permanece fallback.
5. Multi-agent real somente quando os golden tasks demonstrarem ganho.

## P4 — polish

1. Decompor `app/page.tsx` e `database.mjs` gradualmente.
2. Revisão humana de Living Eye, microcopy e contraste.
3. Decisão explícita de marca antes de qualquer rebranding.

## Ondas desta master round

| Onda | Escopo | Gate |
|---|---|---|
| 1 | honestidade de imagem, error contract, memória atômica, segurança | testes de unidade + master golden |
| 2 | coerência Runtime/UI e brand config | runtime/UX tests + build |
| 3 | documentação, capability matrix final e README honesto | revisão de claims |
| 4 | screenshots responsivos/voz e regressão final | browser real + suite completa + benchmarks |

Itens P3 que dependem de provider, novos binários ou modelos não serão falsamente marcados como concluídos. Nenhuma dependência ou provider será instalado sem necessidade comprovada.

