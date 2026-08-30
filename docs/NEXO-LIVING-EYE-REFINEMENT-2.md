# Nexo / Whaleye — Living Eye Refinement 2.0

## AUDIT

A auditoria foi feita no app real em 1440 × 900 e 390 × 844, com capturas de `idle`, `listening`, `speaking`, `working`, `error` e `resting` antes da alteração.

Problemas confirmados:

- o asset de baleia e o fade nas bordas já estavam corretos, mas os estados abertos pareciam quase iguais em uma captura e em observação prolongada;
- a camada dinâmica ainda criava ramos radialmente, o que podia reintroduzir leitura de íris sci-fi;
- o blink visível dependia principalmente do crossfade para o PNG fechado; as classes de pálpebra existiam no CSS, mas não estavam montadas no componente;
- o desktop limitava o olho a 34 rem e deixava a entidade visualmente menor do que a composição permitia;
- o microfone usava RMS e peak reais, porém sem noise floor adaptativo;
- `speechSynthesis` não expõe PCM de saída; o pulso anterior era derivado do índice do caractere e não da cadência temporal real dos eventos;
- hierarquia, fundo, transcrição, controles, barge-in e fallbacks já estavam funcionais e foram preservados.

## VISUAL CHANGES

O asset Whale Eye V2 foi mantido. Esta rodada não foi tratada como troca de imagem.

- o olho passou a ter um wrapper biológico próprio, permitindo compressão independente durante o blink;
- a rede procedural passou de raios uniformes para curvas Bézier irregulares, com bifurcações esparsas concentradas na metade superior;
- membrana vítrea, corrente interna e reflexo úmido receberam movimentos separados e assimétricos;
- a energia ciano continua dentro do globo, sem virar anel neon ou HUD;
- o limite desktop subiu para 40 rem e o mobile para até 96 vw, mantendo o fade orgânico no fundo;
- o fundo recebeu apenas duas profundidades azul-escuras muito discretas; nenhum elemento oceânico literal foi adicionado.

## STATE BEHAVIOR

| Estado          | Comportamento                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------- |
| `idle`          | respiração lenta, brilho baixo e microsaccades raros                                              |
| `listening`     | abertura ligeiramente maior, blink menos frequente, corrente atenta e energia ligada ao microfone |
| `understanding` | foco profundo e atividade irregular contida                                                       |
| `thinking`      | deriva interna lenta, filamentos cognitivos e mudança mínima de foco                              |
| `speaking`      | corrente e ondas internas respondem à cadência da fala                                            |
| `working`       | energia direcional concentrada, sem aceleração frenética                                          |
| `success`       | expansão curta e estabilização suave                                                              |
| `error`         | perda de saturação e energia; não usa vermelho berrante                                           |
| `offline`       | presença dormente com movimento mínimo                                                            |
| `resting`       | asset fechado do mesmo animal e baixa luminosidade                                                |
| wake            | `resting/offline → ativo` abre com tensão vertical curta e recupera a luz                         |

O blink normal, o double blink raro e o long blink agora combinam: pálpebra superior descendente, reação inferior menor, compressão do globo, breve asset fechado e reabertura. Os intervalos continuam irregulares e ficam maiores durante `listening`.

## AUDIO REACTIVITY

Entrada:

- `getUserMedia` + `AnalyserNode` continuam fornecendo PCM real do microfone;
- RMS e peak passam por noise floor adaptativo, gate de silêncio e attack/release;
- fala baixa, normal e alta aumentam luz, filamentos e ondas sem transformar o olho em visualizador musical;
- ruído constante baixo é absorvido gradualmente pelo noise floor.

Saída:

- Web Speech continua sem acesso ao PCM real;
- a aproximação agora usa o tempo real de `onboundary`, delta de caracteres, cadência e pausas de pontuação;
- a implementação não declara essa aproximação como amplitude real;
- barge-in cancela a síntese, zera o envelope e muda imediatamente para `listening`.

## PERFORMANCE

- nenhuma dependência ou motor 3D foi adicionado;
- os filamentos caíram de 82/52/28 para 34/22/12 em `high/medium/low`;
- Canvas continua com DPR limitado, pausa em aba oculta e degradação automática por hardware;
- os mesmos dois PNGs cacheados foram preservados;
- reduced motion desliga blink, wake e correntes animadas, mantendo a leitura dos estados.

## RESPONSIVE

- desktop validado em 1440 × 900 com foco maior e melhor ocupação do vazio central;
- mobile validado em 390 × 844, sem competir com header, status ou controles de polegar;
- safe area e controles fixos existentes foram preservados;
- a transcrição continua limitada e secundária.

## SCREENSHOTS

As capturas finais estão em `docs/voice-presence/screenshots/refinement-2/`:

- dez estados em desktop;
- `listening` e `speaking` em mobile.

## TESTS

- contratos de pálpebra real, rede Bézier, wake, noise floor e output cadence foram adicionados à suíte UX;
- TypeScript, lint, build, testes UX e suíte completa do agente são executados antes da entrega.

## LIMITATIONS

- o realismo anatômico de base ainda vem de raster; Canvas adiciona vida, mas não deforma a pele em 3D;
- Web Speech não fornece PCM de saída. Reatividade de fala continua temporal, não espectral;
- permissão e acústica de microfone variam por navegador e ambiente. A lógica real foi validada por contrato, enquanto as capturas usam o modo de preview controlado;
- screenshot valida composição e estado, não consegue provar sozinho a naturalidade temporal de blink e micro movimentos.

## GIT

Branch: `main`. Commit de entrega: `feat(voice): refine living eye biological presence`. O hash final é informado junto da entrega e enviado ao `origin/main`.
