# Nexo Image Generation — AMD local runtime

## Decisão de hardware

O computador avaliado possui Ryzen 5 3600, 16 GB de RAM e Radeon RX 580 com 4 GB de VRAM. Por isso, o runtime padrão é SD 1.5 com DreamShaper 8 e DirectML. SDXL e Flux não foram instalados como padrão: no hardware atual, eles aumentariam muito a latência e o risco de falta de memória.

O backend é o fork AMD de Stable Diffusion WebUI, compatível com a API A1111 consumida pelo Nexo. O protocolo do `a1111-provider.mjs` não foi substituído. O instalador coloca Python, WebUI e checkpoint no disco `D:` para não pressionar o disco do sistema.

## Instalação e inicialização

```powershell
npm run image:setup
npm run image:start
```

O `start-nexo.cmd` e o atalho da área de trabalho também iniciam o provider. Variáveis relevantes:

```text
NEXO_IMAGE_PROVIDER_URL=http://127.0.0.1:7860
NEXO_IMAGE_MODEL_FAMILY=sd15
NEXO_VISION_MODEL=qwen2.5vl:3b
```

## Planner por família

Os presets agora distinguem `sd15`, `sdxl` e `flux`. Cada família controla resolução, steps, CFG, sampler e scheduler. O perfil SD 1.5 limita o tamanho para caber na RX 580. Flux possui poucos steps e CFG baixo, mas só deve ser ativado quando existir hardware e checkpoint compatíveis.

## Coordenação de memória

Antes da geração, o Core descarrega o modelo de visão do Ollama. Antes da verificação, descarrega o checkpoint da WebUI. Isso evita manter Stable Diffusion e Qwen-VL simultaneamente na VRAM. O resultado completo do job, incluindo o veredito visual, passa a ser persistido em `media_jobs.result_json`.

## Validação real

- Provider: disponível em `127.0.0.1:7860`.
- Checkpoint: `DreamShaper_8_pruned.safetensors`.
- SHA-256: `879DB523C30D3B9017143D56705015E15A2CB5628762C11D086FED9538ABD7FD`.
- Geração quente FAST, 384 × 384, 12 steps: aproximadamente 42 segundos.
- Pipeline completo do Nexo, incluindo troca de modelos e visão: aproximadamente 154 segundos na primeira execução medida.
- Matriz FAST real com cinco categorias: foto 52,2 s; logo 48,8 s; UI 46,3 s; diagrama 46,2 s; concept art 46,4 s.

Avaliação visual manual: foto e concept art tiveram boa qualidade; UI funcionou como mockup, mas não para texto legível; logo não representou claramente todos os elementos pedidos; diagrama não comunicou o ciclo nem produziu rótulos confiáveis. O verificador inicialmente devolveu um enum literal e, depois, um `PASS` contraditório. O contrato foi endurecido com JSON Schema, enum validado e rebaixamento determinístico de respostas contraditórias. Falha explícita de idioma exigido agora resulta em `FAIL`; saída estrutural inválida resulta em `UNCERTAIN`.

## Limitações

- A RX 580 DirectML é funcional, mas lenta e dependente de paginação de memória.
- Os modos HIGH/MAX podem levar vários minutos.
- Flux e SDXL permanecem configuráveis, não validados neste PC.
- O primeiro uso após iniciar o computador inclui cold start.
- Qwen 2.5 VL 3B pode avaliar mal tipografia; o veredito é tratado como sinal auxiliar, não substitui inspeção humana em entregas visuais importantes.
