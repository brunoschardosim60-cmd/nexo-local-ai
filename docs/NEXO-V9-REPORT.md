# Nexo V9 — relatório de maturidade

## IMPLEMENTED

- Capability Registry central para TOOL, SKILL, MCP, PROVIDER, WORKFLOW e CONNECTOR.
- Busca limitada por metadados, requisitos e relevância; 100 capabilities não são inseridas no prompt.
- Health, enable/disable, preferências persistentes, lazy-loader e seleção por qualidade/latência/risco.
- Skills V3 com manifest, validação, isolamento de autoridade, candidato vindo de memória procedural e confirmação obrigatória.
- MCP V2 stdio: lifecycle, tools, resources, prompts, timeout, risco por tool e retorno externo não confiável.
- Connector SDK, revogação e escopos mínimos.
- Credential Vault com referências `secret://`, cifra em memória e nenhum valor persistido no SQLite.
- Workflow Engine persistente com DAG, branching básico, parallel, aprovação, retry por retomada, resume e cancelamento.
- Event Bus V3, auditoria de execução/falha e contratos de erro.
- Provider/Tool/Connector SDKs, extension manifest, trust levels e Developer Mode.
- Discovery UI responsiva com diagnósticos, versões, risco, permissões e disable switch.

## PARTIAL

- Busca é lexical ponderada; embeddings semânticos do Memory Engine ainda não alimentam o índice de capabilities.
- Backup de configuração é preservado pelo estado SQLite, mas não há navegador visual de snapshots.
- Workflow `condition` é determinístico e seguro, mas ainda não possui editor visual.
- Hot reload está definido como `idle-only`; observação automática do filesystem não foi habilitada.

## EXPERIMENTAL

- Promoção de memória procedural para skill retorna candidato revisável, sem instalação automática.
- Extension Manager local aceita manifests controlados, mas não executa código arbitrário dentro do processo principal.

## PLANNED

- Assinatura criptográfica e catálogo/marketplace.
- OAuth/Keychain nativo por sistema operacional.
- Transportes MCP HTTP/SSE adicionais.
- Editor visual completo de workflows e migração/rollback empacotado de skills.

## Evidências

- Suite principal: 75 testes.
- Eval V9: 20/20.
- Benchmark: 100 capabilities, 1.000 buscas, catálogo limitado a 8 resultados por busca.
- Adversarial: skill tentando obter autoridade system é rejeitada; MCP é sempre dado externo.
- Segurança: secrets não chegam ao modelo nem são persistidos em texto claro.
