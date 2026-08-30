import { randomUUID } from 'node:crypto';

const MUTATION = /\b(corrij|implement|alter|edit|refator|cri|constru|remov|adicion|fa[cç]a)\w*/i;
const CODING = /\b(c[oó]digo|bug|projeto|reposit[oó]rio|site|api|typescript|javascript|python|build|teste)\b/i;
const RESEARCH = /\b(pesquis|fontes?|evid[eê]ncia|compare|investig)\w*/i;
const BROWSER = /\b(browser|navegador|p[aá]gina|site|formul[aá]rio|modal|e2e|visual)\b/i;

function unique(values) { return [...new Set(values.filter(Boolean))]; }

export function createGoalEngine() {
  function create(objective, options = {}) {
    const text = String(objective || '').trim(); if (text.length < 5) throw new Error('Objetivo curto demais.');
    const coding = CODING.test(text); const mutation = MUTATION.test(text); const research = RESEARCH.test(text); const browser = BROWSER.test(text);
    const constraints = unique([
      'Preservar mudanças preexistentes do usuário.', 'Não acessar segredos ou caminhos fora do workspace.',
      mutation ? 'Aplicar a menor mudança suficiente e verificável.' : null,
      options.constraints?.map?.(String),
    ].flat());
    const acceptanceCriteria = unique([
      coding ? 'Arquitetura e arquivos relevantes foram observados antes da mudança.' : null,
      mutation ? 'A mudança solicitada existe em um diff ou artefato observado.' : null,
      coding ? 'Uma validação relevante (teste, typecheck, lint, build ou reprodução) terminou com sucesso.' : null,
      browser ? 'O comportamento da interface foi observado em navegador real após a execução.' : null,
      research ? 'Conclusões importantes possuem evidências e fontes rastreáveis.' : null,
      'O resultado final foi comparado com o objetivo original e as incertezas foram registradas.',
      options.acceptanceCriteria?.map?.(String),
    ].flat());
    const requiredEvidence = unique([
      mutation ? 'diff observado' : null, coding ? 'saída de validação' : null, browser ? 'DOM/URL/console/network e screenshot quando visualmente relevante' : null,
      research ? 'fontes e matriz de evidências' : null, 'eventos e tool runs persistidos', options.requiredEvidence?.map?.(String),
    ].flat());
    return { id: randomUUID(), objective: text, constraints, acceptanceCriteria: acceptanceCriteria.map((criterion, index) => ({ id: `criterion-${index + 1}`, criterion, status: 'NOT_CHECKED', evidence: [] })), assumptions: unique(options.assumptions?.map?.(String) || ['O workspace selecionado é o escopo autorizado da tarefa.']), requiredEvidence, completionState: 'OPEN', createdAt: new Date().toISOString(), version: 1 };
  }
  function evaluate(goal, observed = {}) {
    const evidenceText = JSON.stringify(observed).toLowerCase(); const criteria = goal.acceptanceCriteria.map(item => {
      const criterion = item.criterion.toLowerCase(); let status = 'UNCERTAIN';
      if (/diff ou artefato/.test(criterion)) status = /git\.diff|filesystem\.(?:write|patch)|artifact/.test(evidenceText) ? 'PASS' : 'FAIL';
      else if (/valida[cç][aã]o/.test(criterion)) status = /code\.validate|npm (?:test|run (?:lint|build|typecheck))|exitcode[^0-9]*0/.test(evidenceText) ? 'PASS' : 'NOT_CHECKED';
      else if (/navegador real/.test(criterion)) status = /browser\.(?:observe|click|navigate|screenshot)|playwright/.test(evidenceText) ? 'PASS' : 'NOT_CHECKED';
      else if (/fontes/.test(criterion)) status = /https?:\/\//.test(evidenceText) ? 'PASS' : 'NOT_CHECKED';
      else if (/arquitetura/.test(criterion)) status = /repository\.map|code\.inspect/.test(evidenceText) ? 'PASS' : 'NOT_CHECKED';
      else status = observed.verdict === 'PASS' ? 'PASS' : observed.verdict === 'FAIL' ? 'FAIL' : 'UNCERTAIN';
      return { ...item, status, evidence: (observed.evidence || []).filter(value => typeof value === 'string').slice(0, 8) };
    });
    const completionState = criteria.some(item => item.status === 'FAIL') ? 'FAILED' : criteria.every(item => item.status === 'PASS') ? 'VERIFIED' : 'UNCERTAIN';
    return { ...goal, acceptanceCriteria: criteria, completionState, evaluatedAt: new Date().toISOString() };
  }
  return { create, evaluate, health: () => ({ explicitGoals: true, stableAcrossReplanning: true, criterionStates: ['PASS', 'FAIL', 'UNCERTAIN', 'NOT_CHECKED'] }) };
}
