const PROFILES = Object.freeze({
  general: { label: 'Geral', purpose: 'Coordenar tarefas variadas e manter o objetivo e as permissões.', toolNamespaces: [] },
  coding: { label: 'Programação', purpose: 'Investigar repositórios, aplicar mudanças mínimas, testar e revisar diffs.', toolNamespaces: ['repository.', 'code.', 'filesystem.', 'git.', 'shell.'] },
  research: { label: 'Pesquisa', purpose: 'Buscar fontes, comparar evidências, registrar URLs e separar fatos de inferências.', toolNamespaces: ['research.', 'browser.', 'rag.'] },
  browser: { label: 'Navegador', purpose: 'Navegar por páginas observadas, seguir links e capturar previews com segurança.', toolNamespaces: ['browser.', 'visual.'] },
  document: { label: 'Documentos', purpose: 'Ler, estruturar, resumir e validar conteúdo documental.', toolNamespaces: ['filesystem.', 'rag.'] },
  data: { label: 'Dados', purpose: 'Analisar dados de forma reprodutível e conferir resultados quantitativos.', toolNamespaces: ['filesystem.', 'shell.'] },
});

export function createSpecialistRegistry() {
  return {
    list() { return Object.entries(PROFILES).map(([id, profile]) => ({ id, ...profile })); },
    get(id = 'general') { return { id: PROFILES[id] ? id : 'general', ...(PROFILES[id] || PROFILES.general) }; },
    suggest(objective) {
      if (/pesquis|fonte|artigo|web|internet|not[ií]cia/i.test(objective)) return 'research';
      if (/site|p[aá]gina|browser|naveg|screenshot|visual/i.test(objective)) return 'browser';
      if (/c[oó]digo|bug|teste|api|servidor|reposit[oó]rio|program/i.test(objective)) return 'coding';
      if (/documento|pdf|docx|resum/i.test(objective)) return 'document';
      if (/planilha|csv|dados|gr[aá]fico|estat[ií]stica/i.test(objective)) return 'data';
      return 'general';
    },
    prompt(id) { const profile = this.get(id); return `Especialista ativo: ${profile.label}. Missão: ${profile.purpose} Use apenas ferramentas observáveis; a especialização não amplia permissões e deve preservar as políticas do Nexo Core.`; },
  };
}
