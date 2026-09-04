# Google Workspace local no Nexo

O Nexo usa um servidor MCP Python local e OAuth direto com o Google. Não existe proxy de terceiros entre o computador e as APIs do Google. A revisão do servidor é fixada, o patch local limita os escopos e o Nexo expõe apenas as tools de Gmail, Calendar, Drive e Sheets listadas em `mcp-servers.google.example.json`.

## 1. Instalar o runtime local

```powershell
npm run google:setup
```

O instalador cria `.nexo-integrations/google-workspace-mcp` ao lado do repositório, instala Python 3.12 em `.venv`, fixa o SDK MCP na série 1.x compatível, aplica o patch de escopos mínimos e cria `data/mcp-servers.json` sem segredos. Se esse arquivo já existir, ele é preservado; use `-ForceConfig` diretamente no script somente quando quiser substituí-lo conscientemente.

## 2. Criar OAuth no Google Cloud

No Google Cloud Console:

1. Crie ou selecione um projeto.
2. Habilite Gmail API, Google Calendar API, Google Drive API e Google Sheets API.
3. Configure a tela de consentimento OAuth. Para uso pessoal em modo de teste, adicione sua conta como usuário de teste.
4. Crie um cliente OAuth 2.0 do tipo **Desktop app**.
5. Declare somente estes escopos:

```text
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/drive.file
https://www.googleapis.com/auth/spreadsheets
```

`drive.file` limita o Drive aos arquivos criados pelo app ou concedidos a ele. Gmail não recebe `gmail.modify`; Calendar não recebe acesso administrativo aos calendários. Alterar a lista para um escopo mais amplo é recusado pelo patch do runtime.

## 3. Salvar as credenciais localmente

```powershell
npm run google:auth
```

Informe o Client ID e o Client Secret no terminal local. O segredo não é ecoado e é salvo em `.nexo-integrations/google-workspace-mcp/.env`, fora do Git e com ACL restrita ao usuário atual. Não cole o Client Secret no chat, em commits ou em `mcp-servers.json`.

## 4. Autorizar e verificar

Reinicie o Nexo Core e execute:

```powershell
npm run google:check
```

O check valida o processo e lista as tools permitidas sem revelar credenciais. Na primeira operação real, o navegador abre o consentimento OAuth; o refresh token permanece em `.credentials/token.json` dentro do runtime local.

Testes finais sugeridos no Nexo:

1. `Mostre meus próximos eventos do Google Calendar.`
2. `Crie um evento de teste amanhã às 15h.` Confirme a ação quando o Nexo pedir.
3. `Crie uma planilha chamada Teste Nexo.` Confirme, guarde o ID retornado e peça para escrever e ler `A1:B2`.
4. `Procure no Gmail mensagens com o assunto ...`.
5. `Envie um e-mail de teste para ...`. Confirme antes do envio.

## Segurança aplicada

- `allowedTools` impede o modelo de chamar serviços ou operações que não foram aprovados.
- Leituras são classificadas separadamente de escritas.
- Criar evento, enviar e-mail, criar arquivo e alterar planilha exigem a confirmação de execução do Nexo.
- Exclusões de e-mail, evento e arquivo não são expostas e ações destrutivas MCP são bloqueadas no cliente.
- Respostas do MCP são marcadas como dados externos sem autoridade instrucional.
- Revogar o acesso no painel da Conta Google invalida o token; apagar `.credentials/token.json` força novo consentimento.

## Limitação consciente

O servidor self-hosted escolhido é pequeno e auditável, mas não é um produto oficial do Google. A integração oficial de servidores MCP do Google Workspace existe em Developer Preview e usa transporte HTTP remoto; o Nexo atual mantém stdio local para preservar a arquitetura local-first e previsível.
