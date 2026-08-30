# Nexo Voice Presence — Living Eye

## IMPLEMENTATION

- `public/nexo/living-eye-base.png`: base visual original gerada a partir das duas referências, sem copiar nenhuma delas.
- `public/nexo/living-eye-closed.png`: estado orgânico fechado, usado apenas durante os milissegundos de blink e no repouso.
- `components/nexo/nexo-living-eye.tsx`: `NexoLivingEye`, `NexoLivingEyeMini`, modo de voz imersivo, state machine, Canvas 2D e analisador de áudio.
- `app/globals.css`: pálpebras, profundidade, umidade, respiração, estados, responsividade e reduced motion.
- `app/page.tsx`: ligação com reconhecimento de voz, TTS, barge-in, loading do chat, Agent e runtime local.

## STATE MACHINE

Estados explícitos: `IDLE`, `LISTENING`, `UNDERSTANDING`, `THINKING`, `SPEAKING`, `WORKING`, `SUCCESS`, `ERROR`, `OFFLINE` e `RESTING`. A tabela de transições fica junto do componente e inclui a transição rápida `SPEAKING → LISTENING` para barge-in. O estado real da UI deriva de microfone, TTS, geração, modo Agente e disponibilidade do runtime.

## AUDIO REACTIVITY

Ao ouvir, o componente abre um `MediaStream` autorizado, usa `AnalyserNode`, calcula RMS + peak em 512 amostras e aplica attack/release diferentes para evitar jitter. Esse valor controla discretamente pupila, brilho interno, ondas e ramificações. Ao falar por Web Speech, o navegador não oferece o waveform de saída; por isso a reação usa eventos reais de fronteira da fala (`onboundary`) e não uma amplitude inventada contínua. Barge-in cancela TTS imediatamente.

## BLINK SYSTEM

Os intervalos usam PRNG com seed e distribuição entre aproximadamente 3,8 e 11,2 segundos. Durante escuta o intervalo aumenta. Há blink normal, double blink raro e long blink raro, com tempos diferentes de fechamento, pausa e abertura. A camada fechada preserva pele e textura orgânicas e só aparece durante o fechamento; Canvas, pupila e reflexos continuam independentes.

## MOTION SYSTEM

Micro-saccades usam random walk controlado; pointer parallax é limitado; a respiração combina períodos não coincidentes; reflexo úmido desloca lentamente; Canvas desenha rede radial orgânica, glow subsuperficial e impulsos irregulares. O estado não reinicia o loop do Canvas, então brilho e energia interpolam suavemente.

## PERFORMANCE

Não foi adicionada biblioteca 3D. O motor usa Canvas 2D, DPR limitado e três níveis de qualidade: high (82 ramos), medium (52) e low (28). O modo `auto` considera `hardwareConcurrency` e reduced motion. A aba oculta deixa de desenhar e o miniolho força low. A imagem-base é carregada uma vez e reutilizada pelo cache.

## RESPONSIVE

Desktop usa o olho como foco central, sem painéis administrativos. Mobile usa até 88vw, mantém controles no rodapé com safe area e não apresenta overflow em 390 × 844. O modo abre sem reload e possui fullscreen.

## ACCESSIBILITY

O olho anuncia seu estado por nome acessível; controles têm labels; o texto do estado não depende apenas de cor; `prefers-reduced-motion` remove parallax/animações grandes e reduz Canvas, preservando a indicação visual.

## TESTS

- Testes de contrato da state machine, blink e áudio real adicionados à suíte `test:ux`.
- Screenshots automatizados dos dez estados em desktop e de listening em mobile.
- Validação de DOM acessível e ausência de overflow no navegador real.
- Lint, TypeScript, build e suíte completa do agente executados antes da entrega.

## SCREENSHOTS

Os estados estão em `docs/voice-presence/screenshots/`: `idle`, `listening`, `understanding`, `thinking`, `speaking`, `working`, `success`, `error`, `offline`, `resting` e `listening-mobile`.

## VIDEO/GIF DE TESTE

O navegador integrado disponível nesta execução não expõe gravação de vídeo. Não foi produzido um GIF falso a partir de frames estáticos. O comportamento foi validado ao vivo, e as capturas por estado foram mantidas como regressão visual.

## LIMITATIONS

- Web Speech não expõe o áudio PCM de saída; a fala reage aos boundaries reais do sintetizador. Quando o Nexo passar a tocar TTS por `AudioBuffer`/`HTMLAudioElement`, o mesmo controlador poderá receber amplitude de saída real.
- Os dois assets realistas somam aproximadamente 5,2 MB em PNG; é aceitável no uso local e ambos são cacheados, mas uma etapa futura pode gerar AVIF/WebP preservando a textura.
- Screenshot comprova composição e estado, não naturalidade temporal. A distribuição de blink é validada separadamente em sessão prolongada.
