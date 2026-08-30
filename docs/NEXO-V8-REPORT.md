# Nexo V8 — Multimodal Presence & Advanced Media

## Estado real neste computador

| Modalidade | Estado | Evidência e limite |
|---|---|---|
| Texto, código e documentos textuais | STABLE | Runtime, RAG, tools e memória preservados. |
| Visão de imagens | BETA | Ollama `qwen2.5vl:3b`; qualidade depende do modelo e não equivale a OCR especializado. |
| Captura de tela | BETA | Captura pontual consentida + Vision V2; não é observação contínua silenciosa nem controle automático. |
| Câmera | BETA | Captura opcional via navegador e análise visual; nunca ativada automaticamente. |
| Geração/edição de imagem | UNAVAILABLE por padrão | Pipeline V2 implementado, mas Forge/Automatic1111 precisa estar ativo em `127.0.0.1:7860`. SVG não é usado como fotografia falsa. |
| STT/TTS local V2 | UNAVAILABLE | Endpoints locais não configurados. Web Speech é fallback do navegador, não realtime speech completo. |
| Realtime voice/full-duplex | EXPERIMENTAL | VAD, métricas, estados e barge-in arquitetados; full-duplex depende de provider compatível. |
| Geração de vídeo | UNAVAILABLE | Storyboard/projeto prontos; feature flag e provider local não disponíveis. GIF não é tratado como vídeo generativo. |
| Compreensão temporal de vídeo | UNAVAILABLE | Exige extrator real de frames, áudio e transcript. Upload isolado não é chamado de compreensão. |

## Entregue

- `Unified Multimodal Message` com arrays por modalidade e compatibilidade com `parts` legado.
- `Modality Router V2`, provider registry dinâmico e raciocínio cross-modal.
- `Perception Engine V2` com observações rastreáveis, sampling, change detection, regiões e memória apenas por resumo elegível.
- `Presence Mode` explicitamente ativado, indicadores Listening/Viewing Screen/Camera/Thinking/Speaking, barge-in e kill switch.
- Image Planner/Runtime V2 com intenção, fotografia estruturada, qualidade real por steps/verificação, img2img/inpainting, comparação e proveniência entre versões.
- Video Runtime V2 com modos declarados conforme provider, storyboard editável, consistência de cena e degradação honesta.
- Audio Runtime V2 com contrato de timestamps, idioma, voz consistente, personalidade vocal e métricas; capacidades dependentes do provider são rotuladas.
- Resource Manager V2 com lifecycle de modelos, fila de GPU e prioridade para voz/realtime.
- progresso de mídia por fases sem porcentagem inventada e cancelamento por `AbortSignal` quando o provider respeita o sinal.
- UI única de conversa com attach, voz, tela, câmera, geração/edição e kill switch sem separar sete ferramentas.

## Segurança e privacidade

- câmera, tela e presença contínua exigem gesto/consentimento explícito;
- kill switch encerra tracks do navegador, fala e sessão do Core;
- credenciais não entram no provider status, prompt ou relatório;
- nenhum frame bruto é persistido automaticamente;
- cloud é opcional e nenhum provider pago está configurado silenciosamente;
- identidade só pode ser declarada preservada após comparação visual e suporte do provider.

## Avaliação

Os evals estruturais medem contratos, roteamento, consentimento, deduplicação de frames, barge-in, VAD, presets, storyboard, providers, recursos, isolamento e degradação. Qualidade estética precisa de avaliação humana opcional nas dimensões: estética, aderência ao prompt, identidade e consistência temporal. Os evals não inventam uma nota estética para providers indisponíveis.
