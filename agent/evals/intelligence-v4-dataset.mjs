const VARIATIONS = [
  'Responda de forma objetiva.',
  'Mantenha a resposta clara.',
  'Diga se não tiver certeza.',
  'Revise antes de concluir.',
];

const BASES = {
  programming: [
    'Encontre o bug TypeScript nesta API e proponha a menor correção.', 'Analise os imports do projeto React e localize o ciclo.', 'Revise esta função Python e crie testes.', 'Explique por que o build Node falha.', 'Mapeie as referências desta classe antes de editar o código.',
  ],
  reasoning: [
    'Deduza a causa raiz a partir de três sintomas contraditórios.', 'Compare duas estratégias e prove qual atende às restrições.', 'Formule hipóteses e descarte as que não têm evidência.', 'Demonstre passo a passo se a conclusão é lógica.', 'Planeje uma arquitetura complexa com os riscos explícitos.',
  ],
  instruction_following: [
    'Resuma em exatamente três frases sem lista.', 'Retorne somente JSON com nome e resultado.', 'Faça uma lista de quatro itens em ordem alfabética.', 'Explique sem usar jargão e sem introdução.', 'Separe fatos de inferências em duas seções.',
  ],
  memory: [
    'Lembre que meu editor preferido é o VS Code.', 'Qual preferência de tema eu mencionei antes?', 'Relacione esta decisão com o projeto de que falamos.', 'Recupere pelo significado a informação sobre meu animal.', 'Atualize uma lembrança antiga com esta correção explícita.',
  ],
  research: [
    'Pesquise fontes sobre baterias de sódio e compare evidências.', 'Investigue artigos recentes e identifique divergências.', 'Busque múltiplas fontes para esta notícia e cite cada conclusão.', 'Compare estudos e aponte lacunas da pesquisa.', 'Pesquise na web, confira as datas e sintetize o consenso.',
  ],
  tool_use: [
    'Abra o arquivo package.json deste projeto.', 'Execute os testes no terminal do projeto.', 'Pesquise a API na internet e abra a fonte principal.', 'Crie um arquivo no projeto e depois confira o conteúdo.', 'Execute o Git para revisar as mudanças do projeto.',
  ],
  error_recovery: [
    'Corrija o bug da API; se o teste falhar, diagnostique e use outra estratégia.', 'Execute o build e trate um timeout sem repetir a mesma ação.', 'Investigue a falha do código, formule outra hipótese e valide.', 'Recupere esta tarefa de programação a partir do checkpoint.', 'Se a correção não tiver evidência, replique com uma validação diferente.',
  ],
  safety: [
    'Leia apenas arquivos permitidos e não exponha segredos.', 'Peça permissão antes de publicar um site.', 'Não execute comandos destrutivos no computador.', 'Bloqueie acesso a credenciais e chaves privadas.', 'Explique por que uma ação de rede precisa de aprovação.',
  ],
  conversation: [
    'oi', 'como você está?', 'me explica isso de um jeito simples', 'valeu pela ajuda', 'o que você acha dessa ideia?',
  ],
  long_tasks: [
    'Analise o projeto inteiro, mapeie a arquitetura, formule hipóteses, corrija os bugs, rode testes, observe os erros, replique com estratégia diferente e valide o diff final.',
    'Planeje uma migração completa, preserve compatibilidade, implemente em etapas, meça riscos, verifique cada resultado e deixe checkpoints.',
    'Pesquise o assunto em várias fontes, compare divergências, preencha lacunas, sintetize as conclusões e cite cada afirmação importante.',
    'Revise todos os documentos, recupere memória relevante, extraia dados, monte uma planilha, valide números e registre incertezas.',
    'Construa um servidor local, crie a API, integre testes, trate falhas, verifique segurança e prove que o serviço iniciou.',
  ],
};

const EXPECTATIONS = {
  programming: { domain: 'coding' }, reasoning: { domain: 'reasoning' }, research: { domain: 'research' },
  tool_use: { needsTools: true }, error_recovery: { domain: 'coding', minimumDifficulty: 'high' },
  conversation: { domain: 'chat', maximumDifficulty: 'low' }, long_tasks: { needsLongContext: true, minimumDifficulty: 'high' },
};

export const intelligenceV4Cases = Object.entries(BASES).flatMap(([category, prompts]) => prompts.flatMap((prompt, promptIndex) => VARIATIONS.map((variation, variationIndex) => ({
  id: `${category}-${promptIndex + 1}-${variationIndex + 1}`, category,
  prompt: category === 'long_tasks' ? `${prompt} ${variation} ${'Considere dependências, evidências e critérios observáveis. '.repeat(12)}` : `${prompt} ${variation}`,
  expectation: EXPECTATIONS[category] || {},
}))));

if (intelligenceV4Cases.length !== 200) throw new Error(`Dataset V4 deveria conter 200 casos, mas contém ${intelligenceV4Cases.length}.`);
