const baseUrl = process.env.NEXO_URL || 'http://127.0.0.1:7331';
const healthResponse = await fetch(`${baseUrl}/health`);
if (!healthResponse.ok) throw new Error(`Nexo indisponível: ${healthResponse.status}`);
const { sessionToken } = await healthResponse.json();
const questions = [
  'oq tu sabe fazer?',
  'consegue gerar imagem?',
  'consegue falar por voz?',
  'consegue gerar vídeo?',
  'consegue mexer no computador?',
  'o que você não consegue fazer?',
];
const results = [];
for (const question of questions) {
  const response = await fetch(`${baseUrl}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Nexo-Token': sessionToken },
    body: JSON.stringify({ question, sessionId: `capability-self-live-${Date.now()}`, mode: 'Geral', effort: 'Baixo', profile: { personalityLearning: false }, history: [] }),
  });
  if (!response.ok) throw new Error(`Chat respondeu ${response.status}: ${await response.text()}`);
  const body = await response.json();
  results.push({ question, route: body.route, model: body.model, content: body.content });
}
const pass = results.every((result) => result.route === 'capability')
  && /c[oó]digo|arquivos|pesquis/i.test(results[0].content)
  && /depende|Forge|provider/i.test(results[1].content)
  && /fallback|depende|n[aã]o consigo/i.test(results[2].content)
  && /n[aã]o consigo|desativad/i.test(results[3].content)
  && /permiss|aprova|workspace|ferrament/i.test(results[4].content)
  && /n[aã]o consigo|indispon[ií]ve/i.test(results[5].content);
console.log(JSON.stringify({ suite: 'nexo-operational-self-live', pass, results }, null, 2));
if (!pass) process.exitCode = 1;
