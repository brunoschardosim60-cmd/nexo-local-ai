const WEBSITE = /\b(site|website|landing|p[aá]gina|homepage|loja|e-commerce|portf[oó]lio|formul[aá]rio|interface web)\b/i;
const CREATION = /\b(cri(?:e|ar)|constru(?:a|ir)|desenvolv(?:a|er)|fa[cç]a|implemente|monte|gere)\b/i;

export function isWebsiteObjective(objective = '') {
  return WEBSITE.test(String(objective));
}

export function isWebsiteCreationObjective(objective = '') {
  const value = String(objective);
  return WEBSITE.test(value) && CREATION.test(value);
}

export function websiteDesignGuidance(objective = '') {
  if (!isWebsiteObjective(objective)) return '';
  return `Direção de design web:
- estabeleça uma hierarquia clara: uma ação primária, títulos escaneáveis e conteúdo em blocos intencionais;
- use tokens CSS consistentes para cor, tipografia, espaçamento, raio e sombra; evite valores aleatórios repetidos;
- preserve contraste AA, foco visível, HTML semântico, labels e navegação por teclado;
- projete mobile-first e valide pelo menos 390×844 e 1440×900, sem overflow horizontal ou sobreposição;
- use tipografia expressiva e legível, espaçamento generoso e composição com identidade própria; evite aparência genérica de dashboard;
- não use gradientes, cards ou animações por hábito: cada elemento deve reforçar conteúdo, marca ou ação;
- estados de loading, vazio, erro, hover e disabled devem ser deliberados quando aplicáveis;
- valide build/testes e depois capture screenshots reais. Um resultado visual reprovado deve ser corrigido com base nas evidências.`;
}

export const WEBSITE_REFERENCE_TEMPLATES = Object.freeze([
  { id: 'landing-page', useFor: 'serviço, campanha ou negócio local', sections: ['hero', 'prova', 'benefícios', 'CTA'] },
  { id: 'product-page', useFor: 'produto físico ou digital', sections: ['produto', 'benefícios', 'detalhes', 'compra'] },
  { id: 'contact-page', useFor: 'captação de leads', sections: ['contexto', 'canais', 'formulário', 'confiança'] },
]);
