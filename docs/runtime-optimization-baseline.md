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
