# Nexo Voice Presence — Living Eye

## IMPLEMENTATION

- `public/nexo/living-eye-base.png`: baleia abissal viva em macro, com globo quase preto, luz azul em profundidade e ramificações internas assimétricas.
- `public/nexo/living-eye-closed.png`: o mesmo animal com pálpebras pesadas totalmente fechadas, usado durante o blink e no repouso.
- `components/nexo/nexo-living-eye.tsx`: `NexoLivingEye`, `NexoLivingEyeMini`, modo de voz imersivo, state machine, Canvas 2D e analisador de áudio.
- `app/globals.css`: pálpebras, profundidade, umidade, respiração, estados, responsividade e reduced motion.
- `hooks/use-speech-output.ts`: reprodução neural, análise RMS real, fallback Web Speech e cancelamento/barge-in.
- `hooks/use-voice-mode.ts`: captura `MediaRecorder`, VAD RMS, endpoint por silêncio e fallback controlado.
- `scripts/tts/`: instalação e serviço HTTP local do Piper, usando `pt_BR-faber-medium`.
- `scripts/stt/`: serviço local Faster Whisper `small` INT8 e scripts de instalação/execução.
- `local-agent.mjs`: endpoints autenticados de síntese e transcrição.

## STATE MACHINE

Estados explícitos: `IDLE`, `LISTENING`, `UNDERSTANDING`, `THINKING`, `SPEAKING`, `WORKING`, `SUCCESS`, `ERROR`, `OFFLINE` e `RESTING`. A tabela de transições fica junto do componente e inclui a transição rápida `SPEAKING → LISTENING` para barge-in. O estado real da UI deriva de microfone, TTS, geração, modo Agente e disponibilidade do runtime.

## AUDIO REACTIVITY

Ao ouvir, o componente abre um `MediaStream` autorizado, usa `AnalyserNode`, calcula RMS + peak em 512 amostras e aplica attack/release diferentes para evitar jitter. Esse valor controla discretamente pupila, brilho interno, ondas e ramificações. Ao falar, o WAV neural passa por `HTMLAudioElement → MediaElementAudioSourceNode → AnalyserNode`; o hook calcula RMS real em cada frame e entrega esse nível ao olho. Barge-in aborta a requisição, pausa o áudio, desconecta o grafo e devolve a escuta. Web Speech permanece como fallback e só nele a reação usa `onboundary`, pois o navegador não fornece o PCM dessa API.

## LOCAL NEURAL TTS

O provider escolhido é Piper 1.4.2, adequado ao Ryzen 5 3600 e à RX 580 de 4 GB porque roda rápido em CPU sem disputar VRAM com Ollama ou geração de imagem. O wrapper escuta apenas no loopback, carrega a voz uma vez e implementa o contrato já existente `{text, voice, speed, energy, pauses, emphasis} → audio/wav`. `speed` controla `length_scale`; `energy` e `emphasis` ajustam parâmetros suportados pelo Piper. O Piper não oferece um controle direto e completo de pausas, então esse campo é preservado no contrato sem prometer prosódia que o engine não executa.

Instalação e execução:

```powershell
npm run tts:setup
npm run stt:setup
npm run voice:start
./scripts/tts/start-agent-with-voice.ps1
npm run dev
```

`start-nexo.cmd` automatiza as três últimas etapas. Os modelos e arquivos locais ficam em `.nexo-tts/` e `.nexo-stt/`, ignorados pelo Git.

## LOCAL NEURAL STT

O microfone é capturado no navegador e o VAD mede energia localmente; após 850 ms de silêncio, o trecho é enviado ao endpoint autenticado do Core. O Core limita o payload e encaminha somente ao Faster Whisper em loopback. O modelo `small` roda em CPU com INT8 e retorna texto, idioma, confiança e segmentos. O fallback Web Speech é usado quando o serviço não está configurado ou falha durante a sessão.

```powershell
npm run stt:setup
npm run voice:start
```

No teste ponta a ponta Piper → Faster Whisper, “Olá Bruno, o Nexo está ouvindo” foi recuperado integralmente em 3,204 s com o modelo já carregado. A primeira transcrição após carga levou 6,289 s. O teste separado passando pelo endpoint autenticado do Core levou 2,985 s em configuração `beam_size=1`; o preset final usa `beam_size=3` para priorizar precisão.

## BLINK SYSTEM

Os intervalos usam PRNG com seed e distribuição entre aproximadamente 3,8 e 11,2 segundos. Durante escuta o intervalo aumenta. Há blink normal, double blink raro e long blink raro, com tempos diferentes de fechamento, pausa e abertura. A camada fechada preserva pele e textura orgânicas e só aparece durante o fechamento; Canvas, pupila e reflexos continuam independentes.

## MOTION SYSTEM

Micro-saccades usam random walk controlado; pointer parallax é limitado; a respiração combina períodos não coincidentes; reflexo úmido desloca lentamente. A rede orgânica principal agora faz parte da anatomia do asset, enquanto o Canvas foi reduzido a micro-impulsos e glow subsuperficial discretos para não recriar uma íris humana radial. O estado não reinicia o loop do Canvas, então brilho e energia interpolam suavemente.

## PERFORMANCE

Não foi adicionada biblioteca 3D. O motor usa Canvas 2D em baixa opacidade, DPR limitado e três níveis de qualidade. O modo `auto` considera `hardwareConcurrency` e reduced motion. A aba oculta deixa de desenhar e o miniolho força low. A imagem-base é carregada uma vez e reutilizada pelo cache.

## RESPONSIVE

Desktop usa o olho como foco central, sem painéis administrativos. Mobile usa até 88vw, mantém controles no rodapé com safe area e não apresenta overflow em 390 × 844. O modo abre sem reload e possui fullscreen.

## ACCESSIBILITY

O olho anuncia seu estado por nome acessível; controles têm labels; o texto do estado não depende apenas de cor; `prefers-reduced-motion` remove parallax/animações grandes e reduz Canvas, preservando a indicação visual.

## TESTS

- Testes de contrato da state machine, blink e áudio real adicionados à suíte `test:ux`.
- Testes do provider validam protocolo, prosódia encaminhada, WAV retornado e artifact persistido.
- Screenshots automatizados dos dez estados em desktop e de listening em mobile.
- Validação de DOM acessível e ausência de overflow no navegador real.
- Teste no app confirmou `tts_synthesize`, estado acessível `Falando…`, provider disponível e console sem erros.
- Lint, TypeScript, build e suíte completa do agente executados antes da entrega.

## SCREENSHOTS

Os estados estão em `docs/voice-presence/screenshots/`: `idle`, `listening`, `understanding`, `thinking`, `speaking`, `working`, `success`, `error`, `offline`, `resting` e `listening-mobile`. A revisão visual de baleia V2 acrescenta `whale-eye-v2-listening-desktop.png` e `whale-eye-v2-listening-mobile.png`.

## WHALE EYE V2

A segunda direção visual preserva toda a arquitetura comportamental e substitui apenas a presença orgânica. O globo ficou maior e vítreo para expor a rede interna da referência; o centro continua quase preto, sem pupila humana limpa. As bordas do asset agora desaparecem gradualmente no ambiente, em vez de formar um quadrado arredondado. A camada circular de pupila e o Canvas radial foram reduzidos para que as ramificações anatômicas do olho sejam a leitura dominante. Os prompts e as referências usados nesta revisão estão documentados em `docs/voice-presence/WHALE-EYE-V2-PROMPTS.md`.

O refinamento comportamental seguinte — auditoria, blink com pálpebras reais, estados diferenciados, rede procedural orgânica, noise floor e validação responsiva — está documentado em `docs/NEXO-LIVING-EYE-REFINEMENT-2.md`.

## VIDEO/GIF DE TESTE

O navegador integrado disponível nesta execução não expõe gravação de vídeo. Não foi produzido um GIF falso a partir de frames estáticos. O comportamento foi validado ao vivo, e as capturas por estado foram mantidas como regressão visual.

## LIMITATIONS

- O STT local é por turnos/utterances; ainda não há transcrição incremental de áudio enquanto o usuário fala.
- Piper é natural e leve, mas não oferece clonagem de voz nem a prosódia expressiva de um XTTS-v2; trocar de engine continua possível pelo mesmo contrato HTTP.
- Web Speech continua como fallback quando o serviço neural estiver desligado; nessa situação, a reação volta a usar boundaries, não PCM real.
- Os dois assets realistas somam aproximadamente 5,2 MB em PNG; é aceitável no uso local e ambos são cacheados, mas uma etapa futura pode gerar AVIF/WebP preservando a textura.
- Screenshot comprova composição e estado, não naturalidade temporal. A distribuição de blink é validada separadamente em sessão prolongada.
