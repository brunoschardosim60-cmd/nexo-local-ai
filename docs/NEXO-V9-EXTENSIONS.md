# Nexo V9 — desenvolvimento de extensões

O V9 adiciona um ecossistema local-first controlado pelo `Capability Registry`. Conteúdo externo, de projeto, MCP e extensões entra sempre como dado não confiável; nunca recebe autoridade de sistema.

## Tool

Use `defineTool({ name, description, inputSchema, risk, execute })`. O nome precisa ter namespace, o input é validado e o retorno deve ser estruturado. Registre a tool no Tool Registry; o Core a projeta como uma capability `TOOL`.

## Skill V3

Crie `skills/<nome>/SKILL.md` com frontmatter: `name`, `version`, `description`, `triggers`, `requiredTools`, `optionalTools`, `permissions`, `risk` e `author`. Instruções não podem elevar autoridade. Instalação, atualização e promoção de memória procedural exigem revisão do usuário. Skills de projeto são locais e não confiáveis por padrão.

## Provider e Connector

Use `defineProvider` ou `defineConnector` em `agent/extensions/contracts.mjs`. Declare capacidades reais, modelos/limites, health, requisitos, escopos mínimos e risco. Credenciais entram como `secret://provider/key`; o modelo recebe apenas a referência. `disconnect()` revoga os handles imediatamente.

## Workflow

Workflows são DAGs persistidos no SQLite. Steps suportados: `tool`, `agent`, `condition`, `approval`, `wait`, `parallel` e `notification`. Inputs e outputs são objetos estruturados. Execuções pausam em aprovação, retomam pelo mesmo `runId` e podem ser canceladas.

## MCP V2

Configure `data/mcp-servers.json` com `id`, `command`, `args`, `cwd`, `enabled`, referências de ambiente e permissões por tool. O cliente negocia o protocolo `2025-06-18`, descobre tools/resources/prompts, limita tempo, classifica risco por tool e marca todo retorno como `EXTERNAL_DATA` sem autoridade instrucional.

## Extension manifest

Uma extensão declara `id`, `version`, `trust`, dependências e capabilities. Níveis atuais: `BUILT_IN`, `TRUSTED`, `LOCAL`, `UNVERIFIED`. Não há assinatura criptográfica no V9. O Developer Mode valida manifests locais e hot reload só é considerado seguro quando não há tarefa crítica em execução.

## Segurança e portabilidade

- Exportações removem campos com nomes de secret, token ou password.
- Extensões não verificadas precisam de confirmação.
- Ações acima de leitura continuam sujeitas à política de permissões.
- Atualizações importantes devem preservar estado anterior recuperável.
- Uma implementação quebrada falha isoladamente e gera evento de auditoria.

## APIs locais

- `GET /agent/capabilities` e `/search`
- `POST /agent/capabilities/configure` e `/execute`
- `GET/POST /agent/workflows`
- `POST /agent/workflows/run`, `/resume`, `/cancel`
- `POST /agent/mcp/discover`
- `POST /agent/skills/candidate`

Essas APIs usam o token efêmero da sessão local e aceitam somente a origem do Nexo.
