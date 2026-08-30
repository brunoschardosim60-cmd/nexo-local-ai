# Relatório técnico — Nexo Intelligence, Vision & Media V4

## Resultado

O V4 introduz uma camada de inteligência independente da UI, memória seletiva, estado epistêmico, perfis de modelo, visão real e um runtime de mídia extensível. O fast path determinístico continua sem chamada de modelo.

### Implementado

- Complexity Estimator barato; Model Router V2.2 por domínio, dificuldade, tools, privacidade, orçamento, modelos instalados/carregados e benchmarks.
- estados `KNOWN`, `INFERRED`, `RETRIEVED`, `UNCERTAIN` e `UNKNOWN`;
- erros classificados, política de recuperação, Critic e autocorreção com orçamento;
- Memory Gate com recusa de trivialidades, deduplicação, reforço e contradição;
- embeddings semânticos reais e Context Engine seletivo;
- response planning separado da personalidade e limites de tom por contexto;
- schema multimodal, análise de imagens com `qwen2.5vl:3b`, artefatos e fila persistente;
- providers para Automatic1111/Forge, STT/TTS HTTP e vídeo HTTP, todos substituíveis;
- Resource Manager com CPU, RAM, GPU/VRAM, fila, fallback e rejeição;
- anexos visuais na UI, exibição/download de artefatos e estados honestos de indisponibilidade;
- eval de inteligência com 200 casos, eval de mídia e benchmark cold/warm.

### Parcial

- Coding Intelligence cobre AST TypeScript/JavaScript, símbolos, referências e chamadas; LSP e Tree-sitter multilíngue ainda faltam.
- Browser e pesquisa possuem leitura segura e múltiplas fontes; navegação visual autônoma completa continua limitada.
- TTS/STT do navegador funcionam quando suportados. Uma voz neural local própria requer provider configurado.

### Não implementado / experimental

- Geração raster não está operacional neste computador enquanto Automatic1111/Forge não estiver ativo.
- Vídeo generativo fica desativado por padrão; o hardware observado (16 GB RAM, RX 580 4 GB) não justifica habilitar um modelo pesado automaticamente.
- Não existe sandbox de SO forte por VM/contêiner; o executor atual usa processos sem shell, allowlist, workspace e aprovação.
- Não há API compatível com OpenAI, por decisão de escopo.

## Medições reais deste hardware

Medições em 30/08/2026, Ryzen 5 3600, 16 GB RAM e RX 580 4 GB:

| Caminho | Runtime | TTFT | Total |
|---|---:|---:|---:|
| Instant/time | 37 ms | 37 ms | 37 ms |
| Fast 3B cold | 8 ms | 15,5 s | 16,2 s |
| Fast 3B warm | 5 ms | 118 ms | 530 ms |
| Deep 7B cold | 3,45 s | 42,8 s | 74,0 s |
| Deep 7B warm | 10 ms | 3,42 s | 13,0 s |
| Agent routing | 1 ms | 1 ms | 1 ms |
| Vision 3B cold | — | — | 51,3 s |
| Vision 3B warm | — | — | 528 ms |

Cold start é o gargalo dominante. O Resource Manager e a preferência por modelo já carregado evitam trocas desnecessárias, sem sacrificar tarefas classificadas como complexas.

## Evals

- 33/33 testes automatizados passaram.
- 13/13 critérios do runtime passaram na última validação V3/V4.
- 200/200 casos de prontidão estrutural passaram; isto não é uma alegação de 100% de qualidade generativa.
- Mídia: 4 `PASS`, 0 `FAIL`, 4 `SKIPPED` (imagem, vídeo, STT e TTS sem provider local ativo).

## Segurança e privacidade

Todo estado permanece em SQLite/disco local. O servidor escuta somente loopback, usa token aleatório, origem restrita, rate limit e limite de corpo. Caminhos são confinados ao workspace; escrita, processos e rede sensível exigem aprovação. Artefatos são servidos por rota autenticada local. Nenhum provider de nuvem é ativado automaticamente.

## Próximos passos recomendados

1. Instalar um provider de imagem compatível e leve para a RX 580, medir antes de torná-lo padrão.
2. Criar eval generativo humano/model-graded por modelo e domínio, além da prontidão estrutural.
3. Adicionar LSP e Tree-sitter para linguagens além de TypeScript/JavaScript.
4. Implementar sandbox forte opcional por contêiner/VM.
5. Só então ampliar Browser Agent e vídeo local.
