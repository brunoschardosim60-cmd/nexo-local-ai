const baseUrl = process.env.NEXO_URL || 'http://127.0.0.1:7331';

const scenarios = [
  ['iaiii bb', 'iaiii', 'oi', 'eae', 'ta por ai?'],
  ['meu nome é Bruno', 'qual meu nome?', 'e o seu?', 'curte esse nome?', 'por quê?'],
  ['posso te chamar de P1?', 'qual seu nome?', 'curtiu P1?', 'teu nome agora é P2', 'não, melhor P1'],
  ['vou te chamar de Farol', 'qual teu apelido?', 'esquece Farol', 'qual teu nome?', 'e apelido?'],
  ['oq podemos fazer', 'algo criativo', 'mais diferente', 'curti essa', 'continua'],
  ['qual cor tu prefere?', 'azul então?', 'curtiu mesmo?', 'e verde?', 'qual ficou melhor?'],
  ['meu cachorro chama Nexo', 'qual o nome dele?', 'e o seu?', 'não, eu falei do cachorro', 'agora entendeu?'],
  ['iaiii kkk', 'tô meio preocupado', 'é uma coisa séria', 'me escuta um pouco', 'obrigado'],
  ['fala bb', 'agora me ajuda com um erro de segurança', 'é num login', 'pode ser SQL injection', 'qual primeiro passo?'],
  ['vc ta bem?', 'oq tu faz?', 'pq esse nome?', 'agr fala curto', 'blz?'],
  ['vamos falar do meu projeto', 'ele é uma IA local', 'qual era o projeto?', 'e o diferencial?', 'resume em uma frase'],
  ['seu apelido é Capitão', 'capitão kkk', 'essa foi boa', 'qual era a piada?', 'beleza capitão'],
  ['o que a gente faz agora?', 'escolhe você', 'por que isso?', 'manda o primeiro passo', 'fechou'],
  ['se não fosse Nexo, qual seria teu nome?', 'por quê?', 'e qual é o oficial?', 'posso usar o outro?', 'então como te chamo?'],
  ['eu prefiro respostas curtas', 'me explica o que é RAM', 'mais curto', 'agora sim', 'lembra como eu prefiro?'],
  ['bom dia', 'como você está?', 'vamos conversar formalmente', 'qual é sua função?', 'obrigado'],
  ['isso deu errado de novo', 'tô frustrado', 'não brinca agora', 'me ajuda a organizar', 'qual o primeiro passo?'],
  ['quero inventar um nome para um app', 'ele é sobre oceano', 'algo estranho e vivo', 'gostei de Abissal', 'qual foi o escolhido?'],
  ['preciso estudar matemática', 'o tema é função', 'começa pelo básico', 'o que é domínio?', 'e imagem?'],
  ['oi', 'preciso apagar um arquivo importante', 'tem dois com o mesmo nome', 'qual você apagaria?', 'boa, não apaga nada'],
];
const requested = new Set(String(process.env.NEXO_MANUAL_CASES || '').split(',').map(Number).filter(Number.isInteger));
const selectedScenarios = scenarios.map((turns, index) => ({ index, turns })).filter(({ index }) => !requested.size || requested.has(index + 1));

const healthResponse = await fetch(`${baseUrl}/health`);
if (!healthResponse.ok) throw new Error(`Nexo indisponível: ${healthResponse.status}`);
const { sessionToken: token } = await healthResponse.json();

async function ask({ question, sessionId, history }) {
  const response = await fetch(`${baseUrl}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Nexo-Token': token },
    body: JSON.stringify({
      question,
      sessionId,
      mode: 'Geral',
      effort: 'Baixo',
      profile: { name: '', city: '', style: 'natural', instructions: '', relationshipId: sessionId },
      history,
      documents: [],
      attachments: [],
      webSearch: false,
    }),
  });
  if (!response.ok) throw new Error(`Chat respondeu ${response.status}: ${await response.text()}`);
  if ((response.headers.get('content-type') || '').includes('application/json')) {
    return (await response.json()).content;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events = [];
  const consume = (line) => {
    if (line.trim()) events.push(JSON.parse(line));
  };
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) consume(line);
  }
  consume(buffer);
  const done = events.findLast((event) => event.type === 'done');
  return done?.content || events.filter((event) => event.type === 'token').map((event) => event.content).join('');
}

const results = [];
for (const { index, turns: questions } of selectedScenarios) {
  const sessionId = `conversation-manual-${Date.now()}-${index}`;
  const history = [];
  const turns = [];
  for (const question of questions) {
    const content = await ask({ question, sessionId, history });
    turns.push({ user: question, nexo: content });
    history.push({ role: 'user', content: question }, { role: 'assistant', content });
  }
  results.push({ scenario: index + 1, turns });
  console.log(JSON.stringify(results.at(-1)));
}

console.log(JSON.stringify({ suite: 'nexo-manual-live-review-v10', conversations: results.length, turns: results.reduce((sum, item) => sum + item.turns.length, 0) }));
