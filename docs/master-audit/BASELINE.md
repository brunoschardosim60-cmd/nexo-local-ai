# Master audit — baseline

Data da medição: 2026-08-30. Commit de referência: `ef591cd4699477ef22efa7bb8672fff7051d4838` (`main`, igual a `origin/main`). O worktree estava limpo antes desta rodada.

## Ambiente observado

- Node.js compatível com o requisito `>=22.13.0`.
- CPU: AMD Ryzen 5 3600, 12 processadores lógicos.
- RAM: 16.295 MB; a disponibilidade variou durante os testes porque os modelos locais permanecem carregados.
- GPU: Radeon RX 580, 4 GB.
- Runtime HTTP local: `127.0.0.1:7331`; UI: `localhost:3000`.
- Runtime reportado: Nexo Core 9.0.0; package: 0.9.0.

## Qualidade e segurança

| Verificação | Resultado inicial |
|---|---:|
| Testes Node | 80/80 aprovados |
| Runtime eval | 13/13 |
| Intelligence readiness | 200/200 |
| Autonomy readiness | 36/36 |
| Memory | 7/7 |
| Memory long-run | 3/3 |
| False-memory | 3/3 |
| Knowledge | 4/4 |
| Personal | 30/30 |
| Multimodal readiness | 22/22 |
| Extensions | 20/20 |
| Media providers | 4 PASS, 4 SKIPPED, 0 FAIL |
| Lint | aprovado |
| TypeScript | aprovado |
| Build | aprovado |
| `npm audit` | 0 vulnerabilidades em 697 pacotes do grafo |

Os números de readiness provam contratos e comportamento determinístico específico; não provam, sozinhos, qualidade generativa, autonomia longa ou qualidade visual humana.

## Performance inicial

| Caminho | Runtime overhead | TTFT | Total | Observação |
|---|---:|---:|---:|---|
| INSTANT horário | 24 ms | 24 ms | 24 ms | sem modelo |
| FAST frio, Qwen 3B | 31 ms | 23.613 ms | 24.082 ms | carregamento do modelo domina |
| FAST aquecido, Qwen 3B | 6 ms | 174 ms | 720 ms | dentro do objetivo interativo |
| DEEP frio, Qwen 7B | 3.993 ms | 64.913 ms | 80.054 ms | inadequado para interação curta |
| DEEP aquecido, Qwen 7B | 4 ms | 3.702 ms | 9.996 ms | aceitável apenas para trabalho profundo |
| Router AGENT | 0 ms | — | — | classificação local |
| Busca de memória, 2.000 registros | 97,47 ms fria | — | 87,68 ms aquecida | dentro do gate atual |

O gargalo principal é cold start/model loading. O overhead do Runtime aquecido é pequeno.

## Provedores observados

- Visão: contrato/provider passou na avaliação, condicionado à disponibilidade do modelo Ollama configurado.
- Imagem: indisponível no baseline porque Stable Diffusion WebUI/Forge não respondeu em `127.0.0.1:7860`.
- Vídeo: feature flag desativada.
- STT/TTS local HTTP: endpoints não configurados.
- Web Speech: fallback do navegador, não um voice runtime local completo.

## Limitações do baseline

- `app/page.tsx` tem 119.585 bytes e concentra estado, voz, chat, ações, clima e apresentação de artefatos.
- `agent/memory/database.mjs` tem 73.162 bytes e concentra schema e repositórios de múltiplos domínios.
- O banco local medido tinha cerca de 87 MB, mais WAL; isso é estado do usuário e não foi apagado.
- A suite Intelligence tem 200 casos determinísticos de roteamento/readiness, não 200 tarefas generativas end-to-end.
- A suite Autonomy contém integração real de navegador, mas também verificações estruturais; não equivale a 36 reparos autônomos completos.

