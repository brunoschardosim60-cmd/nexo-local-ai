export function createModelRouter(config) {
  return {
    complexity(objective = '') {
      const text = String(objective).toLowerCase();
      if (/corrij|implemente|refator|bug|erro|teste|build|c[oó]digo|api|site|servidor|arquitetura|banco de dados/.test(text)) return 'high';
      if (/analis|compare|investig|pesquis|document|planilh|vários|varios|projeto/.test(text) || text.length > 280) return 'medium';
      return 'low';
    },
    choose(purpose, complexity = 'medium') {
      if (['classify', 'summary', 'summarize-short', 'evaluation', 'extract'].includes(purpose) && complexity !== 'high') return config.fastModel;
      if (purpose === 'tool-selection' && complexity !== 'high') return config.fastModel;
      if (purpose === 'planning' && complexity === 'low') return config.fastModel;
      return config.capableModel;
    },
    capabilities() {
      return {
        fast: { model: config.fastModel, uses: ['classificação', 'extração', 'resumo curto', 'planejamento simples', 'seleção simples de ferramenta'] },
        capable: { model: config.capableModel, uses: ['planejamento complexo', 'programação', 'replanejamento'] },
        evaluator: { model: 'determinístico', uses: ['validação baseada na saída real das ferramentas'] },
      };
    },
  };
}
