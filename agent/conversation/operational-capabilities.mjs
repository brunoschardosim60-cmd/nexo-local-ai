function item(id, label, status, detail, requirements = []) {
  return { id, label, status, detail, requirements };
}

export function isCapabilityQuestion(value = '') {
  return /\b(?:o que|oq|quais coisas)\s+(?:voc[eê]|tu)?\s*(?:sabe|consegue|pode|faz)|\b(?:voc[eê]|tu)\s+(?:sabe|consegue|pode)\b|\b(?:suas? )?(?:capacidades|limita[cç][oõ]es)|\bo que\s+(?:(?:voc[eê]|tu)\s+)?n[aã]o (?:consegue|pode|faz)|\bconsegue\s+(?:gerar|criar|abrir|ler|editar|pesquisar|programar|falar|ouvir|ver|mexer|agir|usar)\b/iu.test(String(value));
}

export function createOperationalCapabilitySnapshot({
  toolNames = [],
  config = {},
  health = {},
} = {}) {
  const tools = new Set(toolNames);
  const has = (prefix) => [...tools].some((name) => name.startsWith(prefix));
  const imageHealth = health.image || {};
  const audioHealth = health.audio || {};
  const videoHealth = health.video || {};
  const visionHealth = health.vision || {};
  const browserHealth = health.browser || {};
  const capabilities = [
    item('chat', 'conversar, explicar, planejar e criar textos', 'AVAILABLE', 'Funciona localmente com o modelo carregado.'),
    item('memory', 'lembrar conversas, preferências e contexto autorizado', 'AVAILABLE', 'Memória local em SQLite; o usuário pode corrigir ou apagar.'),
    item('coding', 'analisar, criar e corrigir código e projetos', has('code.') && has('filesystem.') ? 'AVAILABLE' : 'UNAVAILABLE', 'Inclui busca de símbolos, arquivos, testes, build e Git.', ['aprovação para escrita e execução']),
    item('files', 'ler, pesquisar, criar e editar arquivos locais', has('filesystem.') ? 'AVAILABLE' : 'UNAVAILABLE', 'Restrito ao workspace autorizado.', ['aprovação para alterações']),
    item('documents', 'ler, resumir e produzir documentos e dados tabulares', has('filesystem.') ? 'AVAILABLE' : 'UNAVAILABLE', 'Pode trabalhar com texto, CSV e artefatos; formatos avançados dependem das ferramentas instaladas.'),
    item('research', 'pesquisar fontes públicas e comparar evidências', has('research.') ? 'AVAILABLE' : 'UNAVAILABLE', 'Usa provedores públicos configurados e registra fontes.', ['rede e, quando exigido, aprovação']),
    item('browser', 'abrir e operar páginas no navegador seguro', browserHealth.available || browserHealth.automation?.available || has('browser.') ? 'AVAILABLE' : 'UNAVAILABLE', 'Pode navegar, clicar, preencher, observar DOM e capturar telas.', ['aprovação para ações externas sensíveis']),
    item('vision', 'analisar imagens e capturas de tela', config.featureFlags?.vision && visionHealth.enabled !== false ? 'AVAILABLE' : 'UNAVAILABLE', 'Usa o modelo visual local; precisa receber uma imagem ou captura.'),
    item('image', 'gerar ou editar imagens raster', !config.featureFlags?.imageGeneration ? 'UNAVAILABLE' : imageHealth.available === true ? 'AVAILABLE' : 'CONDITIONAL', imageHealth.available === true ? 'Provider local de imagem verificado.' : 'A interface existe, mas depende do Stable Diffusion WebUI/Forge local estar ligado.', ['provider local em execução']),
    item('voice', 'ouvir e responder por voz', audioHealth.enabled || audioHealth.browserFallback ? 'CONDITIONAL' : 'UNAVAILABLE', audioHealth.enabled ? 'Depende dos endpoints locais de STT/TTS configurados.' : audioHealth.browserFallback ? `Há fallback do navegador (${audioHealth.browserFallback}), mas ele não equivale a voz realtime local completa.` : 'O modo de voz completo não possui provider STT/TTS local configurado agora.'),
    item('video', 'gerar vídeos', config.featureFlags?.videoGeneration && videoHealth.enabled ? 'CONDITIONAL' : 'UNAVAILABLE', 'A geração de vídeo está desativada enquanto não houver provider local configurado.'),
    item('computer', 'agir no computador', has('filesystem.') || has('shell.') || has('browser.') ? 'CONDITIONAL' : 'UNAVAILABLE', 'Só consigo agir por ferramentas permitidas, dentro do workspace; não tenho acesso irrestrito ao sistema.', ['ferramenta compatível e aprovação quando necessária']),
  ];
  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    capabilities,
    permissions: ['leitura autorizada', 'escrita/execução com aprovação', 'rede conforme política'],
    hardLimits: [
      'não possui consciência, corpo ou percepção fora das ferramentas ativas',
      'não deve afirmar que executou uma ação sem evidência da ferramenta',
      'não acessa contas, dispositivos ou arquivos fora do escopo autorizado',
      'recursos condicionais não devem ser apresentados como disponíveis agora',
    ],
  };
}

export function operationalCapabilityPrompt(snapshot) {
  if (!snapshot) return '';
  const lines = snapshot.capabilities.map((capability) => {
    const requirements = capability.requirements.length ? ` Requer: ${capability.requirements.join(', ')}.` : '';
    return `- ${capability.label}: ${capability.status}. ${capability.detail}${requirements}`;
  });
  return [
    'CAPACIDADES OPERACIONAIS REAIS (estado atual, autoritativo):',
    ...lines,
    `Limites: ${snapshot.hardLimits.join('; ')}.`,
    'AVAILABLE = pode fazer agora; CONDITIONAL = só pode após cumprir o requisito; UNAVAILABLE = não pode fazer agora. Seja claro sobre essa diferença. Nunca diga que é apenas uma IA de texto se alguma ferramenta listada permite a ação.',
  ].join('\n');
}

function requestedCapability(question, capabilities) {
  const text = String(question).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const terms = {
    image: /\b(?:imagem|foto|desenho|logo)\b/,
    video: /\bvideo\b/,
    voice: /\b(?:voz|falar|ouvir|audio)\b/,
    vision: /\b(?:ver|analisar imagem|tela|captura)\b/,
    coding: /\b(?:codigo|programar|api|bug)\b/,
    computer: /\b(?:computador|pc|sistema)\b/,
    files: /\b(?:arquivo|pasta)\b/,
    documents: /\b(?:documento|pdf|planilha|csv)\b/,
    research: /\b(?:pesquis|internet|google|fonte)\w*\b/,
    browser: /\b(?:navegador|browser|site|pagina)\b/,
    memory: /\b(?:lembr|memoria|conversa)\w*\b/,
  };
  const id = Object.entries(terms).find(([, pattern]) => pattern.test(text))?.[0];
  return id ? capabilities.find((capability) => capability.id === id) || null : null;
}

export function renderOperationalCapabilityAnswer(snapshot, question = '') {
  if (!snapshot) return 'Ainda não consegui ler meu estado operacional.';
  const capability = requestedCapability(question, snapshot.capabilities);
  if (capability) {
    const requirement = capability.requirements.length ? ` Para isso, preciso de ${capability.requirements.join(' e ')}.` : '';
    if (capability.status === 'AVAILABLE') return `Sim — consigo ${capability.label}. ${capability.detail}${requirement}`;
    if (capability.status === 'CONDITIONAL') return `Consigo ${capability.label}, mas depende de configuração ou permissão antes de funcionar. ${capability.detail}${requirement}`;
    return `No estado atual, não consigo ${capability.label}. ${capability.detail}`;
  }
  const unavailableOnly = /\b(?:(?:voc[eê]|tu)\s+)?n[aã]o (?:faz|consegue|pode)|\blimita[cç][oõ]es\b/iu.test(question);
  const available = snapshot.capabilities.filter((item) => item.status === 'AVAILABLE');
  const conditional = snapshot.capabilities.filter((item) => item.status === 'CONDITIONAL');
  const unavailable = snapshot.capabilities.filter((item) => item.status === 'UNAVAILABLE');
  if (unavailableOnly) {
    return `Hoje eu não consigo, de forma ativa: ${unavailable.map((item) => item.label).join('; ')}. Também há funções condicionais — ${conditional.map((item) => item.label).join('; ')} — que só funcionam quando os requisitos locais e as permissões estão prontos. E eu nunca devo dizer que fiz algo sem evidência real da ferramenta.`;
  }
  return [
    `Eu consigo de verdade: ${available.map((item) => item.label).join('; ')}.`,
    conditional.length ? `Também consigo, quando os requisitos estão prontos: ${conditional.map((item) => item.label).join('; ')}.` : '',
    unavailable.length ? `Neste momento não estão disponíveis: ${unavailable.map((item) => item.label).join('; ')}.` : '',
    'Se você me perguntar por uma função específica, eu te digo se ela está disponível agora, se precisa de configuração ou se realmente não existe.',
  ].filter(Boolean).join('\n\n');
}
