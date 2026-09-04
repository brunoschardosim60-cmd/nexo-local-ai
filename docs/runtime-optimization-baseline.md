# Runtime optimization baseline

Measured locally on 2026-09-01 before the runtime optimization phases.

## Deterministic suites

- `eval:intelligence`: 200/200
- `eval:conversation`: 120/120 (720 turns)
- `eval:personal`: 30/30

## Runtime latency

- instant time: 43 ms
- FAST warm (`qwen2.5vl:3b`): 1,546 ms total
- FAST cold: 102,247 ms total (run overlapped with the conversation benchmark, so this is a contention/worst-case sample)
- DEEP cold (`qwen2.5-coder:7b-instruct-q3_K_S`): 72,245 ms total

## Fast-model comparison

Isolated conversation benchmark:

| Model | Quality | Median latency |
| --- | ---: | ---: |
| `qwen2.5:3b-instruct` | 5/5 | 2,062 ms |
| `qwen2.5vl:3b` | 4/5 | 1,374 ms |

The text-only model was not selected as the default because it improved quality but not latency. The spec requires improvement in both dimensions.

## Context allocation probe

With `qwen2.5vl:3b`, a short deterministic prompt measured 250 ms prompt prefill at 6,000 context slots and 343 ms at 12,000. The larger window is therefore enabled only for long/deep context; ordinary FAST chat remains at 2,048.

## Final result after the optimization phases

Measured sequentially on the same machine, without running the model benchmarks in parallel:

| Route | Before | After |
| --- | ---: | ---: |
| FAST cold | 102,247 ms | 29,121 ms |
| FAST warm | 1,546 ms | 1,142 ms |
| DEEP cold | 72,245 ms | 100,483 ms |
| DEEP warm | 73,364 ms | 52,076 ms |

The combined mean of the four model samples fell from approximately 62.4 seconds to 45.7 seconds. Cold DEEP remains highly variable and is still the main latency limitation on this hardware; warm FAST and warm DEEP both improved.

Final quality gates:

- `eval:intelligence`: 200/200
- `eval:conversation`: 120/120 (720 turns; working-state median 0.877 ms)
- `eval:personal`: 30/30
- `test:agent`: 109/109
- `test:ux`: 6/6
- `lint`, TypeScript and production build: passed

Final live conversation benchmark:

| Model | Quality | Median latency |
| --- | ---: | ---: |
| `qwen2.5-coder:3b` | 4/5 | 865 ms |
| `qwen2.5-coder:7b-instruct-q3_K_S` | 4/5 | 4,072 ms |
| `qwen2.5vl:3b` | 4/5 | 975 ms |

All three models still failed the greeting-novelty live probe at least once. Deterministic conversation safeguards pass, but generative casualness remains limited by the installed local models and should continue to be measured rather than hidden by hardcoded replies.

## Reavaliação em 2026-09-04

No mesmo hardware, uma nova execução comparativa encontrou `4/5` para ambos os modelos, com mediana de `1.638 ms` para `qwen2.5:3b-instruct` e `4.753 ms` para `qwen2.5vl:3b`. O modelo puramente textual passou a ser o FAST padrão; `qwen2.5vl:3b` permanece dedicado à visão.

Fatos sociais autoritativos (nome canônico, nome do usuário, apelido explícito, correções e referências diretas) agora são resolvidos pelo `ConversationState`, sem geração. No transcript live completo, a mediana de TTFT caiu de `2.361 ms` para `8 ms`, o P95 de `3.962 ms` para `17 ms`, e todas as propriedades continuaram em `PASS`. Isso também impede corrupções generativas como `souco` em respostas factuais, sem mascarar a qualidade do modelo em conversa aberta.
