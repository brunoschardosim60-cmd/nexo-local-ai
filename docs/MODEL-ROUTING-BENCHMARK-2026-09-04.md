# Benchmark de roteamento local — 2026-09-04

Hardware observado: Ryzen 5 3600, 16 GB RAM e Radeon RX 580 4 GB.

## Diagnóstico

`ollama ps` mostrou tanto `qwen2.5-coder:3b` quanto `qwen2.5-coder:7b-instruct-q3_K_S` em 100% GPU. A lentidão extrema não veio de offload explícito para CPU. Ela apareceu na carga e troca de modelos sob pressão de VRAM.

Reservas observadas durante a concorrência:

- coder 7B: aproximadamente 3,47 GB de memória dedicada;
- coder 3B: aproximadamente 1,85 GB;
- Forge/Stable Diffusion: aproximadamente 1,10 GB;
- capacidade física da RX 580: 4 GB.

## Resultados

| Medição | Coder 7B | Coder 3B |
| --- | ---: | ---: |
| Conversação curta | 5/5 | 3/5 |
| Questões objetivas de programação | 9/10 | 9/10 |
| Mediana quente nas questões de código | 1.497 ms | 717 ms |
| Geração longa | 14,5 tokens/s | 26,3 tokens/s |
| Carga fria isolada | 19.057 ms | 12.077 ms |
| Primeira resposta sob concorrência observada | 107.979 ms | 22.503 ms |

## Validação do runtime após a mudança

| Rota medida | Antes | Depois | Observação |
| --- | ---: | ---: | --- |
| DEEP quente, Extra alto/7B | 52.076 ms | 29.974 ms | Mesmo modelo, resposta limitada a 149 tokens |
| DEEP frio, Extra alto/7B | 100.483 ms | 87.768 ms | Ainda caro; reservado para uso explícito |
| DEEP quente, Alto/3B | 52.076 ms | 11.631 ms | Rota comum de tarefa difícil, cerca de 4,5x mais rápida |
| DEEP frio, Alto/3B | 100.483 ms | 42.337 ms | Sob Forge ativo/pressão de VRAM, cerca de 2,4x mais rápida |

Os valores “antes” são o baseline do runtime antigo com o 7B. A execução “Alto/3B” foi medida com o Forge ativo, portanto inclui a contenção real da máquina em vez de um cenário artificialmente isolado.

O benchmark social é pequeno e aceita algumas respostas ainda genéricas; ele não prova superioridade geral do 7B. O empate no conjunto objetivo também não prova equivalência em mudanças reais de repositório. Os resultados são suficientes para tornar o 3B o padrão de código e manter o 7B como escalonamento.

## Política aplicada

- FAST social continua no modelo rápido existente.
- DEEP, Alto e programação comum usam `qwen2.5-coder:3b`.
- Extra alto, correção crítica e replanejamento usam `qwen2.5-coder:7b-instruct-q3_K_S`.
- O 7B permanece carregado por 2 minutos; os demais, 8 minutos.
- Respostas profundas usam orçamento adaptativo de 420–900 tokens, em vez de até 1.500.
- O Forge descarrega o checkpoint depois de salvar cada imagem para liberar VRAM antes da verificação visual ou do próximo chat.

Essas decisões podem ser sobrescritas por `NEXO_CAPABLE_MODEL`, `NEXO_CODER_MODEL`, `NEXO_REASONING_MODEL`, `NEXO_EXPERT_MODEL`, `NEXO_MODEL_KEEP_ALIVE` e `NEXO_EXPERT_KEEP_ALIVE`.
