# Nexo V7 — Personal Intelligence

## Resultado

O V7 adiciona inteligência operacional local sem criar um segundo cérebro na interface. O Core existente continua responsável por memória, projetos, eventos, scheduler, ferramentas, permissões e execução. A nova camada `agent/personal/` organiza esse estado em objetivos, tarefas, contexto diário, aprendizagem e sugestões proativas.

## Implementado

- Goal Manager e Task Manager persistentes em SQLite, com estados, prazos, dependências, marcos editáveis, progresso e evidências.
- Priority Engine que combina urgência, importância, dependências, esforço estimado, bloqueio e trabalho iniciado.
- contexto diário, risco estimado de prazo, saúde de projeto baseada em evidências e Smart Resume usando continuidade V6, tarefas e objetivos.
- proatividade `OFF/LOW/NORMAL/HIGH`, desligada por padrão, com deduplicação, confiança mínima, quiet hours, modo foco e orçamento de interrupções.
- políticas distintas `SUGGEST/ASK/ACT`; `ACT` exige confirmação explícita e capabilities limitadas.
- Trigger Engine conectado ao Event Bus e Scheduler V2 com one-time, recurring, conditional/event-driven via triggers, retries e Resource Manager.
- Study Engine com `GUIDE/TEACH/CHALLENGE/EXAM`, histórico opcional, domínio baseado em tentativas, detecção de lacunas, active recall, pistas progressivas e repetição espaçada opt-in.
- busca local unificada em memória, RAG, projetos, objetivos, tarefas, agent tasks, artefatos e conversas.
- modos contextuais WORK, CREATIVE, STUDY e FOCUS com override.
- painel responsivo **Meu dia** e paleta `Ctrl+K`, preservando os temas claro/escuro e a interface de chat.
- APIs locais autenticadas para painel, goals, tasks, settings, sugestões, triggers, estudo, busca, retomada, review e saúde de projeto.
- controles para pausar proatividade, desligar notificações/aprendizagem e limpar separadamente objetivos, atividade ou aprendizagem.

## Limites honestos

- Não há vigilância do computador. Mudanças só existem para o Nexo quando uma tool, projeto registrado ou evento persistido fornece evidência.
- Briefs, notificações e repetição espaçada não são ativados automaticamente.
- `ACT` não é permissão global; cada automação precisa de capabilities próprias e confirmação explícita.
- risco de prazo é uma estimativa e informa sua confiança; sem esforço histórico, a confiança é menor.
- o browser mantém apenas uma cópia de conveniência dos chats. O estado pessoal autoritativo fica no SQLite local.
- geração de imagem continua dependendo de um provider local real compatível; o V7 não simula mídia ausente.

## Validação V7

- testes unitários cobrem goals, tasks, prioridades, daily context, resume, proatividade, dedupe, orçamento, segurança ACT, estudo, controles e modos contextuais;
- eval determinístico cobre 30 capacidades, incluindo annoyance (`1` sugestão útil em `51` eventos), isolamento de projetos, segurança e performance;
- o benchmark do Context Engine pessoal executa 500 snapshots sem modelo para comprovar que inteligência de fundo não compete com chat ativo.

Os resultados finais completos devem ser registrados no commit somente depois de executar todas as suítes anteriores, lint, TypeScript, build e audit.
