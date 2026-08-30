# Nexo Presence 3.0

## Entrega

- Living Eye mais responsivo durante escuta e fala, com micro-saccades em cadência própria, reflexo úmido secundário, respiração contínua e rede interna ligada à energia real.
- Conversa contínua opt-in por padrão, com transcrição parcial, fim de fala por silêncio e rearm automático entre turnos.
- TTS por frases durante o streaming do modelo; o Nexo pode começar a falar antes de terminar toda a resposta.
- Barge-in: voz e fila de fala são canceladas, a geração ativa pode ser interrompida e o microfone volta à escuta.
- Perguntas faladas são registradas como `input: voice` no mesmo chat persistente.
- Camada casual anti-template: preserva ritmo e informalidade, evita atendimento corporativo e mantém quatro mensagens recentes no caminho rápido.
- Inteligência Pessoal substitui contadores isolados por uma leitura em linguagem natural do estado atual.
- Artifact Workspace abre HTML/SVG em iframe isolado, alterna preview/fonte, copia e baixa o conteúdo.
- Planos de UI/código incluem validação em navegador real e evidência de DOM, acessibilidade, console e rede.

## Validação

- TypeScript e lint sem erros.
- Suíte do agente: 88 testes após os novos contratos de voz.
- `eval:coding-browser`: 20/20 gates.
- Navegador real: chat, Living Eye desktop/mobile, painel pessoal e preview de artifact inspecionados.
- Mobile 390 × 844: `scrollWidth === innerWidth`.

## Limites honestos

- Web Speech continua dependente do suporte do navegador e não entrega áudio PCM de saída. A animação de fala usa boundaries temporais reais, não amplitude inventada.
- O endpoint por energia melhora a troca de turno, mas um provider local de STT/TTS streaming com áudio próprio ainda é necessário para full duplex neural, voz consistente e controle fino de latência.
- Os 20 gates medem a prontidão determinística do loop coding/browser. A taxa de correção autônoma precisa ser medida separadamente com 20 projetos quebrados, modelos locais reais e critérios de sucesso executáveis.
