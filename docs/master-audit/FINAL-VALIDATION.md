# Master audit — validação final

Data: 2026-08-30. Todos os comandos abaixo terminaram com exit code 0, exceto capacidades explicitamente marcadas `SKIPPED` por provider ausente.

| Verificação | Resultado final |
|---|---:|
| Testes Node | 87/87 |
| Runtime eval | 13/13 |
| Intelligence readiness | 200/200 |
| Autonomy readiness | 36/36 |
| Memory | 7/7 |
| Memory long | 3/3 |
| False-memory | 3/3 |
| Knowledge graph | 4/4 |
| Personal | 30/30 |
| Multimodal readiness | 22/22 |
| Extensions | 20/20 |
| Master golden | 13/13 |
| Media | 4 PASS, 4 SKIPPED, 0 FAIL |
| Lint | aprovado |
| TypeScript | aprovado |
| Build | aprovado |
| npm audit | 0 vulnerabilidades / 697 dependências no grafo |

## Performance final

| Cenário | Overhead | TTFT | Total |
|---|---:|---:|---:|
| INSTANT | 25 ms | 25 ms | 25 ms |
| FAST frio | 32 ms | 7.761 ms | 8.512 ms |
| FAST aquecido | 5 ms | 117 ms | 1.060 ms |
| DEEP frio | 3.496 ms | 68.661 ms | 83.734 ms |
| DEEP aquecido | 4 ms | 3.757 ms | 13.760 ms |
| AGENT routing-only | 0 ms | 0 ms | 0 ms |

O total de geração não é diretamente comparável sem normalizar completion tokens. A medição final produziu mais tokens nas rotas aquecidas que o baseline. Nenhuma otimização de inferência foi atribuída sem causalidade.

Memória, 2.000 registros: 93,82 ms fria; 101,28 ms aquecida.

## Browser e UI

- breakpoints verificados: 360, 390, 430, 768, 1024, 1280, 1440 e 1920;
- overflow horizontal observado: nenhum;
- console: nenhum erro da aplicação; apenas Vite/React dev info;
- fluxo INSTANT: “que horas são?” retornou apenas o horário;
- fluxo de imagem sem provider: informou indisponibilidade do Forge e não gerou SVG;
- temas claro e escuro verificados;
- Living Eye LISTENING mobile e SPEAKING desktop renderizados com labels acessíveis.

## Providers ausentes

- imagem: Forge/A1111 não respondeu em `127.0.0.1:7860`;
- vídeo: feature flag desativada;
- STT e TTS HTTP: endpoint não configurado.

Esses quatro casos são `SKIPPED`/indisponíveis, não sucesso funcional.

