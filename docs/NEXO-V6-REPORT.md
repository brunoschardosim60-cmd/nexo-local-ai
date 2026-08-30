# Nexo V6 — Memory, Knowledge & Personal Intelligence

## Resultado

O V6 transforma a memória anterior — um conjunto simples de textos e vetores — em um subsistema local persistente, temporal, explicável e controlável. A migração é aditiva: o `data/nexo.db` existente é preservado e ganha colunas e tabelas novas sem apagar conversas, tarefas ou vetores antigos.

## Implementado

- `MemoryRecord V3` com tipo, conteúdo, resumo, embedding, entidades, tópicos, origem, escopo, confiança, importância, datas, reforços, contradições, expiração, privacidade e status.
- Tipos `working`, `episodic`, `semantic`, `procedural`, `user`, `project`, `style`, `error` e `decision`.
- Status `ACTIVE`, `UNCERTAIN`, `SUPERSEDED`, `FORGOTTEN` e `DELETED` no contrato; exclusão física remove o registro do SQLite e do FTS.
- Proveniência controlada: `USER_EXPLICIT`, `USER_INFERRED`, `TOOL`, `FILE`, `WEB`, `AGENT`, `SYSTEM` e `DERIVED`.
- Memory Gate V2 com pontuação de utilidade, novidade, estabilidade, confiança, escopo, sensibilidade e duplicação.
- Embeddings semânticos locais por Ollama, cache/batch existentes, registro do espaço vetorial e migração de vetores incompatíveis.
- Recuperação híbrida com FTS5, vetor, importância, confiança, recência, escopo, acesso, query expansion limitada e explicação do ranking.
- Isolamento entre `global`, projeto e sessão; memória global só é incluída quando solicitado.
- Contradiction Engine que registra conflito, reduz confiança e decide `SUPERSEDE` para correção explícita ou `UNCERTAIN` quando a evidência não basta.
- Validade temporal (`observedAt`, `validFrom`, `validUntil`, `expiresAt`) e recuperação somente de fatos atuais.
- Esquecimento por decay com arquivamento antes de exclusão e consolidação de episódios somente após três evidências relacionadas.
- Knowledge Graph local com entidades, relações tipadas, proveniência e travessia limitada a cinco saltos.
- Memórias específicas para procedimentos, decisões, erros e projetos.
- Continuity Engine com handoff persistente: objetivo, concluído, pendente, decisões, artefatos e próximos passos.
- Tools de memória e conhecimento tipadas, sujeitas às permissões normais do agente.
- RAG incremental com SHA-256, `mtime`, versão, modelo de embedding e chunks guiados por títulos/blocos de código.
- Comandos determinísticos “lembre…” e “esqueça…”, sem gastar uma chamada do modelo.
- Central de memória na interface para busca, inspeção, edição, confirmação, arquivamento e exclusão.

## Parcial, com limites explícitos

- A extração de entidades usa regras locais determinísticas para arquivos, tecnologias e projetos. É confiável nesses domínios, mas não substitui um NER geral.
- O grafo é leve e relacional em SQLite. Não há banco de grafos separado nem inferência probabilística aberta.
- A busca vetorial faz reranking em memória. O benchmark com 2.000 registros é rápido, mas bases de milhões de itens exigirão um índice ANN local.
- A consolidação é conservadora e baseada em evidência repetida; não gera biografias nem perfis psicológicos.
- O modelo pessoal aprende preferências explícitas e sinais operacionais, não realiza fine-tuning automático.

## Planejado, não alegado como pronto

- Índice ANN/HNSW local quando o volume justificar.
- NER local especializado e resolução avançada de entidades homônimas.
- Reranker neural separado, habilitado apenas em tarefas profundas.
- Importadores binários avançados para PDF/DOCX/XLSX além dos pipelines já existentes na aplicação.

## Evidência de validação

- Testes V6: 10/10.
- `eval:memory`: 7/7.
- `eval:memory-long`: 3/3 com 600 registros e isolamento de projeto.
- `eval:false-memory`: 3/3; consulta sem evidência retorna vazio/UNKNOWN.
- `eval:knowledge`: 4/4 para entidades, relações, travessia e proveniência.
- `benchmark:memory`: 2.000 registros; cold 86,05 ms e warm 80,08 ms na execução final desta máquina.
- O fechamento também executa lint, toda a suíte do agente, evals V3/V4/V5, build e auditoria de dependências.

Os números de benchmark são observações deste hardware e desta execução, não garantias universais.
