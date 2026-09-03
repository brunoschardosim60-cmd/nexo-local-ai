import { isWebsiteCreationObjective, websiteDesignGuidance } from '../sites/design-guide.mjs';

const PROFILES = Object.freeze({
  general: { label: 'Geral', purpose: 'Coordenar tarefas variadas e manter o objetivo e as permissões.', toolNamespaces: [] },
  coding: { label: 'Programação', purpose: 'Investigar repositórios, formular hipóteses, criar ou corrigir software, testar, revisar diffs e verificar interfaces reais.', toolNamespaces: ['repository.', 'code.', 'debug.', 'filesystem.', 'git.', 'shell.', 'browser.', 'site.', 'project.'] },
  research: { label: 'Pesquisa', purpose: 'Buscar fontes, comparar evidências, registrar URLs e separar fatos de inferências.', toolNamespaces: ['research.', 'browser.', 'rag.'] },
  browser: { label: 'Navegador', purpose: 'Navegar por páginas observadas, seguir links e capturar previews com segurança.', toolNamespaces: ['browser.', 'visual.'] },
  document: { label: 'Documentos', purpose: 'Ler, estruturar, resumir e validar conteúdo documental.', toolNamespaces: ['filesystem.', 'rag.'] },
  data: { label: 'Dados', purpose: 'Analisar dados de forma reprodutível e conferir resultados quantitativos.', toolNamespaces: ['filesystem.', 'shell.'] },
});

export function createSpecialistRegistry() {
  return {
    list() { return Object.entries(PROFILES).map(([id, profile]) => ({ id, ...profile })); },
    get(id = 'general') { return { id: PROFILES[id] ? id : 'general', ...(PROFILES[id] || PROFILES.general) }; },
    allowedNamespaces(id = 'general') { return [...this.get(id).toolNamespaces]; },
    suggest(objective) {
      if (/pesquis|fonte|artigo|\bweb\b|internet|not[ií]cia/i.test(objective)) return 'research';
      if (isWebsiteCreationObjective(objective) || /c[oó]digo|bug|teste|api|servidor|reposit[oó]rio|program|implement|desenvolv/i.test(objective)) return 'coding';
      if (/\b(?:abr(?:a|ir)|visit(?:e|ar)|naveg(?:ue|ar)|acesse|capture|screenshot|inspecione|observe|teste no browser)\b/i.test(objective) || /\b(?:browser|navegador)\b/i.test(objective)) return 'browser';
      if (/documento|pdf|docx|resum/i.test(objective)) return 'document';
      if (/planilha|csv|dados|gr[aá]fico|estat[ií]stica/i.test(objective)) return 'data';
      return 'general';
    },
    prompt(id, objective = '') { const profile = this.get(id); const design = id === 'coding' ? websiteDesignGuidance(objective) : ''; return `Especialista ativo: ${profile.label}. Missão: ${profile.purpose} Use apenas ferramentas observáveis; a especialização não amplia permissões e deve preservar as políticas do Nexo Core.${design ? `\n${design}` : ''}`; },
  };
}
