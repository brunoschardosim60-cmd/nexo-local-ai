# Nexo — geração e verificação de sites

## Root cause

O registry avaliava a palavra `site` na regra de navegador antes da regra de programação. Assim, “crie um site” podia receber apenas ferramentas `browser.*` e `visual.*`. O plano de fallback de coding também assumia sempre uma correção de bug, mesmo quando o objetivo era criar uma interface nova.

## Routing

- criação, implementação e desenvolvimento de site → `coding`;
- abrir, visitar, navegar, observar ou capturar uma página → `browser`;
- pesquisa web explícita → `research`.

Há regressões automatizadas para “crie um site de vendas”, “crie um website profissional” e “abra o site no navegador”.

## Design intelligence

O prompt do especialista coding recebe uma direção curta apenas quando o objetivo envolve web: hierarquia, tokens, tipografia, espaçamento, contraste, acessibilidade, mobile-first, estados e validação visual. Tarefas técnicas não relacionadas a UI não pagam esse contexto.

Três templates locais foram adicionados ao `project.create`:

- `landing-page`;
- `product-page`;
- `contact-page`.

Eles são referências adaptáveis, não respostas rígidas. Todos usam HTML semântico, tokens CSS, foco visível, reduced motion, layout mobile e nenhum recurso externo obrigatório.

## Visual verification loop

`site.visual_verify` aceita uma URL ativa ou uma pasta estática. Para pasta, inicia um servidor HTTP efêmero somente em `127.0.0.1`. O fluxo é:

1. abrir em 1440 × 900;
2. observar DOM, acessibilidade, console, rede e overflow;
3. capturar screenshot persistido;
4. repetir em 390 × 844;
5. avaliar cada screenshot com o vision model;
6. combinar evidências em `PASS`, `FAIL` ou `UNCERTAIN`;
7. retornar feedback e uma instrução de autocorreção;
8. se não houver `PASS`, o evaluator reprova a etapa e o planner replaneja usando esse feedback.

Esse ciclo complementa `code.validate`; não substitui test, lint, typecheck ou build.

## Real browser validation

Em 3 de setembro de 2026, os três templates foram criados pelo contrato real de `project.create` e abertos com Chromium/Playwright em desktop e mobile. Resultado: seis screenshots, zero overflow horizontal, CTA observável em todas as páginas e nenhum erro de aplicação. Um 404 inicial de favicon foi encontrado na primeira captura e eliminado com favicon embutido.

Arquivos locais de evidência ficam em `.nexo-artifacts/site-evals-v1/screenshots/` e não entram no Git.

## Limitations

- o vision model local pode errar julgamentos subjetivos; diagnósticos estruturais continuam sendo a fonte determinística;
- aplicações dinâmicas precisam estar rodando e informar uma URL;
- a tool não decide estratégia de marca nem substitui revisão humana para entrega comercial;
- templates do projeto Nexa não foram copiados porque nenhum diretório/fonte do Nexa foi colocado no escopo. A integração futura pode ser feita por um pacote de componentes autorizado.
