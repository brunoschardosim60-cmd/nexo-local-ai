# Nexo — Conversation Intelligence, Identity & Social Context

## Root cause

O transcript original não falhou por uma única frase ruim. O pipeline tinha seis causas combinadas:

1. O FAST enviava somente as quatro mensagens mais recentes (duas trocas), sem estado conversacional fora do texto bruto.
2. `Nexo` existia apenas como uma frase curta no system prompt; não havia SelfModel canônico nem distinção entre nome e apelido.
3. O nome do usuário vinha do perfil e a memória longa era acionada por palavras como `meu`, o que adicionava 4–9 segundos justamente em perguntas simples de nome.
4. Não havia representação de referente, correção, tópico, piada corrente ou respostas sociais recentes.
5. O Personality Engine controlava intensidade de traços, mas não recebia identidade, relação ou continuidade.
6. Uma lista crescente de substituições em pós-processamento tentava esconder saídas ruins (`soumigo`, `Posso posso`), sem impedir que o modelo perdesse o fato antes de gerar.

O modelo efetivo era `qwen2.5-coder:3b`. A auditoria do transporte mostrou NDJSON com deltas reais e concatenação em ordem; a corrupção observada veio do texto gerado, não de mistura de chunks na UI. O benchmark posterior mostrou melhor consistência social no `qwen2.5vl:3b`, que passou a ser o FAST padrão; o coder continua disponível para código.

## Context pipeline

O fluxo de chat passou a ser:

```text
mensagem
→ classificação social barata
→ ConversationState por chat
→ SelfModel + relação
→ referentes/correções
→ histórico recente (até 6 mensagens)
→ memória longa/RAG somente se ainda necessários
→ modelo
→ sanity check estrutural
→ fallback grounded somente se o modelo violar fatos
→ persistência do turno
```

Em uma captura estrutural para `e qual o seu?`, o FAST recebeu quatro mensagens recentes, `Nome canônico: Nexo`, `Nome do usuário: Bruno`, tópico `names` e referente `assistant.canonicalName`. O prompt tinha 1.912 caracteres, usou o 3B, não carregou memória, RAG nem pesquisa e não continha secrets.

Os logs de `runtime_chat` agora registram rota, modelo, número de turnos, campos do working state, quantidade de recuperação longa e presença de identidade — sem salvar o prompt completo.

## Identity

`agent/conversation/self-model.mjs` define uma identidade operacional pequena e imutável:

- nome canônico: `Nexo`;
- papel local-first;
- preferência de persona sobre o próprio nome;
- capacidades e limitações reais;
- nome alternativo hipotético, sem alterar o canônico.

O apelido fica fora do canônico. `P1` é armazenado como alias com autor, escopo de relação, confiança, origem `USER_EXPLICIT` e data. Comparações vagas como “você parece um João” não alteram identidade.

## Working memory

`ConversationState` é persistido em SQLite usando a infraestrutura de sessões e contém somente estado barato:

- `userName`;
- `assistantCanonicalName` e `assistantAlias`;
- tópico e entidades recentes;
- referente atual;
- tom e modo social;
- correção recente;
- pergunta pendente, preferência de tamanho e escolhas criativas;
- fatos relacionais compactos de curto prazo, como nome de pet e descrição do projeto atual;
- respostas recentes e contador de saudações.

O estado é por chat; o alias confirmado também pode ser recuperado em outro chat da mesma relação. Trocar e esquecer alias atualiza o estado imediatamente. Referentes são limpos a cada turno para não contaminar a próxima mensagem.

## Personality

O prompt social agora trata o chat como continuidade, não atendimento. Ele permite respostas curtas, humor proporcional e preferências de persona, mas continua bloqueando alegações de consciência humana, corpo ou emoções biológicas.

O sistema normaliza abreviações apenas para entendimento (`oq`, `pq`, `vc`, `agr`, `tbm`, `qm`, `ns`); o texto mostrado ao usuário não é reescrito. O classificador muda imediatamente para segurança, estudo, frustração ou assunto sério quando necessário.

Não existe `if message === "iaiii"`. A novidade vem do estado, da comparação lexical e, somente após duas violações do modelo, de um fallback que reutiliza a própria saudação do usuário. Fatos de identidade usam slots grounded como último limite de segurança, não como resposta primária.

## Streaming

Não foi encontrado bug de concatenação no Ollama → Runtime → NDJSON → React. Foram adicionados:

- assembler que aceita deltas e respostas cumulativas;
- sequência monotônica nos eventos de token;
- descarte de sequência de transporte repetida no cliente;
- teste com `["Eu sou", " Nexo"]` e com chunk cumulativo;
- sanity check para corrupção morfológica antes de concluir respostas sociais protegidas.

## Evals

- Testes do agente: **100/100**.
- Conversation Intelligence: **120/120 conversas**, **720 turnos**, 12 categorias.
- Latência do working state: mediana próxima de **1 ms**, p95 próximo de **3 ms** na execução final concorrente.
- Transcript real ao vivo: **11/11 propriedades**.
- Build, TypeScript e lint: PASS.
- Master golden: atualizado para verificar sanidade estrutural, em vez de depender da antiga lista de correções por regex.

Foram executadas e lidas **20 conversas ao vivo, 100 turnos**, entre saudações, gírias, nomes, pronomes, aliases, correções, preferências, projetos, estudo e transição séria. A revisão encontrou lacunas que a suíte estrutural não via — alias usado como nome do usuário, retomada antiga em `continua`, descrição de projeto inventada e escolha criativa esquecida. Esses casos originaram novos campos/guardas e uma segunda revisão dirigida de **7 conversas, 35 turnos**. A interface foi inspecionada separadamente: zero botões visíveis sem nome acessível e zero nós visíveis contendo o texto cru `svg`.

## Transcript regression

Uma execução final equivalente produziu comportamento com estas propriedades:

```text
USER: iaiii bebe
NEXO: resposta social curta, sem fechamento corporativo

USER: iaiii
NEXO: formulação diferente ou reconhecimento de repetição

USER: meu nome e bruno
NEXO: reconhece Bruno

USER: qual o meu nome?
NEXO: Bruno

USER: e qual o seu?
NEXO: Nexo

USER: mas se tivesse qual seria
NEXO: mantém o assunto no nome do assistente

USER: mas bruno e o meu
NEXO: reconhece que Bruno é o nome do usuário

USER: tu gosta do teu nome?
NEXO: responde pela persona, sem disclaimer genérico

USER: posso te chamar de P1?
NEXO: aceita P1 como apelido do assistente

USER: qual seu nome?
NEXO: preserva Nexo + P1
```

O avaliador não exige frases idênticas; ele verifica identidade, alias, referência, correção, novidade, esclarecimento desnecessário, disclaimer, papéis e sanidade.

## Performance

Antes da mudança, a reprodução local teve **65,9 s** na primeira resposta fria; depois, a mediana quente das demais ficou em **1,275 s**, mas perguntas de nome que acionavam memória chegaram a **4,274 s** e **8,609 s**. O caso observado na UI pelo usuário mostrou **8,8 s de TTFT** para uma saudação.

Na execução final com o novo FAST conversacional:

- primeira carga observada: cerca de **19,2 s**;
- TTFT quente mediano: cerca de **2,0 s**;
- p95 quente: cerca de **3,0 s**;
- atualização do ConversationState: cerca de **2,2 ms** no p95 da execução final.

O benchmark curto confirmou o trade-off: o coder 3B teve mediana de 777 ms após carga, mas falhou em linguagem social; o 7B levou 46 s na primeira carga e ~2,9 s quente; o visual 3B teve melhor score conversacional, com latência quente da mesma ordem do 3B anterior. Por isso o FAST passou ao `qwen2.5vl:3b`, sem jogar toda saudação no 7B.

## Limitations

- O `qwen2.5vl:3b` ainda pode produzir formulações socialmente estranhas em conversa aberta; o guard cobre identidade, relação e fatos confirmados, mas não transforma um modelo 3B em um conversador de nível frontier.
- A revisão manual ainda observou escolhas abertas pouco inspiradas e explicações de estudo com qualidade irregular; esses casos pedem um modelo local de chat melhor ou escalonamento seletivo, não mais regexes.
- O alias de relação usa o nome/perfil local ou um identificador explícito; não há conta multiusuário completa.
- A resolução de referentes cobre continuidade casual comum, não um parser linguístico universal.
- O fallback grounded é deliberadamente pequeno e só cobre fatos operacionais críticos.
- Um modelo de chat pequeno, treinado para conversação em pt-BR, provavelmente aumentaria naturalidade sem o custo de carregar o 7B, mas ainda precisa ser instalado e medido neste hardware.

## Git

Os hashes do commit e do `HEAD` final são informados no resumo de entrega, após a criação do commit que inclui este relatório.
