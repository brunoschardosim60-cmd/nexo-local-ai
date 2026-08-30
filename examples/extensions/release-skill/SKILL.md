---
name: example-release
version: 1.0.0
description: Valida um release local de forma reproduzível.
triggers: release, publicar versão
requiredTools: terminal.run, git.status
permissions: execute, read
risk: execute
author: local-example
---

Execute os testes definidos pelo projeto, execute o build, confira o diff e apresente evidências. Nunca crie tag ou publique sem aprovação explícita do usuário.
