# Nexo Local AI

Assistente pessoal com interface web, memória de conversas e modelos executados localmente pelo Ollama. O Nexo oferece chat, programação, documentos, planilhas CSV, imagens vetoriais simples, voz, pesquisa opcional e ações protegidas em arquivos.

## Requisitos

- Windows
- Node.js 22 ou mais recente
- [Ollama](https://ollama.com/) instalado
- Modelos locais:

```powershell
ollama pull qwen2.5-coder:3b
ollama pull qwen2.5-coder:7b-instruct-q3_K_S
```

## Executar

A forma mais simples é abrir `start-nexo.cmd`. Também é possível iniciar manualmente:

```powershell
npm install
npm run agent
npm run dev
```

Depois, acesse [http://localhost:3000](http://localhost:3000).

## Privacidade

Conversas, perfil e preferências ficam no navegador deste computador. Os modelos são executados pelo Ollama localmente. Recursos de pesquisa online só são usados quando ativados na interface.
