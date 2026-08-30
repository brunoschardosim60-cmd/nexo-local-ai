const names = ['Bruno', 'Ana', 'Caio', 'Duda', 'Iara', 'João', 'Lia', 'Maya', 'Noah', 'Ravi'];
const aliases = ['P1', 'Azul', 'N', 'Eco', 'Maré', 'Pixel', 'Nox', 'Orbit', 'Navi', 'Zero'];
const greetings = ['iaiii', 'oiee', 'eae', 'opa', 'olaaa', 'iai bb', 'oi mano', 'eai', 'oii', 'iaii bebe'];

function exchanges(...pairs) {
  return pairs.map(([user, assistant]) => ({ user, assistant }));
}

export const conversationCases = [];

for (let index = 0; index < 10; index += 1) {
  const name = names[index]; const alias = aliases[index]; const greeting = greetings[index];
  conversationCases.push(
    {
      id: `names-${index}`, category: 'names',
      exchanges: exchanges([`meu nome é ${name}`, `${name}. fechado.`], ['qual meu nome?', `${name}.`], ['e qual o seu?', 'Nexo.']),
      expect: state => state.userName === name && state.referents.current === 'assistant.canonicalName',
    },
    {
      id: `aliases-${index}`, category: 'aliases',
      exchanges: exchanges([`pode me chamar de ${name}`, `fechou, ${name}.`], [`posso te chamar de ${alias}?`, `pode. ${alias} ficou bom.`], ['qual seu nome?', `Nexo — e ${alias} pra você.`]),
      expect: state => state.userName === name && state.assistantAlias === alias,
    },
    {
      id: `alias-correction-${index}`, category: 'corrections',
      exchanges: exchanges([`teu nome agora é ${alias}2`, 'beleza, apelido anotado.'], [`não, melhor ${alias}`, `${alias}, então.`], ['curtiu mesmo?', 'curti. combina com a nossa conversa.']),
      expect: state => state.assistantAlias === alias && state.lastCorrection?.correctedField === 'assistantAlias',
    },
    {
      id: `alias-forget-${index}`, category: 'memory',
      exchanges: exchanges([`posso te chamar de ${alias}?`, 'pode sim.'], ['qual seu nome?', `Nexo; ${alias} por aqui.`], [`esquece ${alias}`, 'apelido removido.']),
      expect: state => state.assistantAlias === null && state.assistantCanonicalName === 'Nexo',
    },
    {
      id: `greetings-${index}`, category: 'greetings',
      exchanges: exchanges([greeting, 'oiee, tô contigo'], [greeting, 'kkk voltou com a mesma energia'], ['oq podemos fazer', 'dá pra continuar um projeto, estudar ou inventar algo agora.']),
      expect: state => state.greetingCount >= 2,
    },
    {
      id: `pronouns-${index}`, category: 'pronouns',
      exchanges: exchanges([`me chamo ${name}`, `anotado: ${name}.`], ['qual o meu nome?', name], ['e o seu?', 'Nexo.']),
      expect: state => state.userName === name && state.referents.current === 'assistant.canonicalName',
    },
    {
      id: `slang-${index}`, category: 'casual-slang',
      exchanges: exchanges(['oq tu sabe fazer', 'conversar, pesquisar, programar e trabalhar nos teus arquivos locais.'], ['e agr', 'agora a gente escolhe por onde começar.'], ['ta, bora programar', 'bora. qual parte do projeto?']),
      expect: state => state.currentTopic === 'coding',
    },
    {
      id: `topic-${index}`, category: 'topic-continuity',
      exchanges: exchanges(['qual o seu nome?', 'Nexo.'], ['mas se tivesse outro qual seria', 'talvez Eco; tem uma sonoridade boa.'], ['curtiu mesmo?', 'curti como hipótese, mas Nexo continua sendo o oficial.']),
      expect: state => state.currentTopic === 'names' && state.assistantCanonicalName === 'Nexo',
    },
    {
      id: `ambiguity-${index}`, category: 'ambiguity',
      exchanges: exchanges(['oq podemos fazer', 'tem bastante opção: projeto, estudo, pesquisa ou só trocar ideia.'], ['aquele mesmo', 'o projeto que estava em pauta, certo.'], ['e depois?', 'depois a gente valida o resultado antes de fechar.']),
      expect: state => state.socialMode === 'CASUAL',
    },
    {
      id: `preferences-${index}`, category: 'preferences',
      exchanges: exchanges(['tu gosta do teu nome?', 'gosto. Nexo combina comigo.'], ['e desse apelido?', `acho ${alias} divertido.`], ['prefere qual?', 'Nexo como nome; o apelido depende da conversa.']),
      expect: state => state.currentTopic === 'names',
    },
    {
      id: `serious-${index}`, category: 'tone-transition',
      exchanges: exchanges([greeting, 'fala, tô aqui'], ['kkkk boa', 'aí sim kkk'], ['agora sério: me ajuda com esse erro de segurança', 'certo. vamos tratar isso com precisão e verificar o risco primeiro.']),
      expect: state => state.socialMode === 'SECURITY',
    },
    {
      id: `contradictions-${index}`, category: 'contradictions',
      exchanges: exchanges(['qual seu nome?', 'Nexo.'], [`posso te chamar de ${alias}?`, 'pode.'], ['então qual seu nome?', `oficialmente Nexo; ${alias} é o apelido.`]),
      expect: state => state.assistantCanonicalName === 'Nexo' && state.assistantAlias === alias,
    },
  );
}

export const realTranscript = [
  'iaiii bebe', 'iaiii', 'oi', 'iaii', 'oq podemos fazer', 'meu nome e bruno',
  'qual o meu nome?', 'e qual o seu?', 'mas se tivesse qual seria', 'mas bruno e o meu',
  'qual o seu nome', 'tu gosta do teu nome?', 'posso te chamar de P1?', 'Qual o seu nome?',
];
