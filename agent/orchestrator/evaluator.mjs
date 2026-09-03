function fileName(path = '') { return String(path).split(/[\\/]/).filter(Boolean).at(-1) || String(path); }

function observedRun(run) {
  const output = run.output;
  if (['list_files', 'filesystem.list'].includes(run.tool) && Array.isArray(output)) {
    const names = output.slice(0, 30).map(item => fileName(item.path));
    return { summary: `${output.length} itens encontrados: ${names.join(', ')}${output.length > names.length ? '…' : ''}.`, evidence: output.slice(0, 12).map(item => `${item.type === 'folder' ? 'Pasta' : 'Arquivo'}: ${item.path}`) };
  }
  if (['search_text', 'filesystem.search', 'code.find_symbol', 'code.find_references'].includes(run.tool) && Array.isArray(output)) {
    return { summary: `${output.length} ocorrências encontradas na pesquisa.`, evidence: output.slice(0, 10).map(item => `${item.path}:${item.line} — ${item.text}`) };
  }
  if (['read_file', 'filesystem.read'].includes(run.tool) && output?.path) {
    return { summary: `Arquivo ${output.path} lido com sucesso.`, evidence: [`Leitura concluída: ${output.path} (${String(output.content || '').length} caracteres)`] };
  }
  if (run.tool === 'filesystem.patch' && output?.path) {
    return { summary: `Patch aplicado em ${output.path}, linhas ${output.startLine}–${output.endLine}.`, evidence: [`Patch concluído: ${output.path}; hash ${output.beforeHash} → ${output.afterHash}${output.backup ? `; backup: ${output.backup}` : ''}`] };
  }
  if (['write_file', 'filesystem.write'].includes(run.tool) && output?.path) {
    return { summary: `Arquivo ${output.path} gravado com ${output.bytes || 0} bytes.`, evidence: [`Escrita concluída: ${output.path}${output.backup ? `; backup: ${output.backup}` : ''}`] };
  }
  if (['run_command', 'shell.run', 'git.status', 'git.diff', 'git.log', 'git.show'].includes(run.tool) && output?.command) {
    return { summary: `Comando ${output.command} terminou com código ${output.exitCode}.`, evidence: [`${output.command}: exit code ${output.exitCode}${output.timedOut ? ' (timeout)' : ''}`] };
  }
  if (['research.search', 'web.search'].includes(run.tool) && Array.isArray(output?.results)) {
    return { summary: `Pesquisa encontrou ${output.results.length} resultados em ${output.sources?.join(', ') || 'fontes públicas'}.`, evidence: output.results.slice(0, 10).map(item => `${item.title} — ${item.url}`) };
  }
  if (['research.fetch', 'web.fetch', 'browser.open', 'browser.follow'].includes(run.tool) && output?.url) {
    return { summary: `Página ${output.title || output.url} observada com sucesso.`, evidence: [`${output.title || 'Página'} — ${output.url}`] };
  }
  if (run.tool === 'browser.screenshot' && output?.path) return { summary: `Screenshot ${output.path} capturado em ${output.width}×${output.height}.`, evidence: [`Artefato: ${output.path} (${output.bytes} bytes)`] };
  if (run.tool === 'visual.verify' && output?.path) return { summary: `Screenshot ${output.valid ? 'validado' : 'reprovado'} estruturalmente.`, evidence: (output.checks || []).map(check => `${check.passed ? 'OK' : 'FALHA'}: ${check.name} — ${check.detail}`) };
  if (run.tool === 'site.visual_verify') return { summary: `Site ${output?.verdict === 'PASS' ? 'aprovado' : 'reprovado'} visualmente em ${(output?.reports || []).map(report => report.viewport).join(' e ') || 'viewports solicitados'}.`, evidence: [...(output?.reports || []).map(report => `${report.viewport}: ${report.screenshot?.path} — ${report.evaluation?.result?.verdict || 'UNCERTAIN'}`), ...(output?.feedback || []).map(item => `Feedback: ${item}`)] };
  if (/^(?:image|video|audio)\./.test(run.tool) && (output?.artifact?.id || output?.artifactId)) return { summary: `Artefato de mídia gerado por ${output.artifact?.provider || output.provider || 'provider local'}.`, evidence: [`Artefato persistido: ${output.artifact?.id || output.artifactId}`] };
  if (run.tool === 'code.validate' && Array.isArray(output?.results)) return { summary: `Validação de código ${output.valid ? 'aprovada' : 'reprovada'}.`, evidence: output.results.map(item => `${item.check}: exit code ${item.exitCode}`) };
  if (run.tool === 'agents.delegate' && Array.isArray(output?.children)) return { summary: `${output.children.length} subtarefas delegadas em paralelo.`, evidence: output.children.map(item => `${item.assignedAgent}: ${item.objective} (${item.id})`) };
  if (run.tool === 'agents.status' && Array.isArray(output?.tasks)) return { summary: `${output.tasks.length} subtarefas observadas; ${output.complete ? 'todas terminaram' : 'ainda há trabalho em andamento'}.`, evidence: output.tasks.map(item => `${item.assignedAgent}: ${item.status} — ${item.objective}`) };
  return { summary: `${run.tool} concluída.`, evidence: [`${run.tool}: ${run.status}`] };
}

function includesObjective(objective, pattern) { return pattern.test(String(objective || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()); }

export function createEvaluator() {
  return {
    evaluateTool(action, execution) {
      if (!execution.ok) return { success: false, reason: execution.error };
      if (['run_command', 'shell.run'].includes(action.tool) && Number(execution.output?.exitCode) !== 0) {
        return { success: false, reason: execution.output?.stderr || `Comando terminou com código ${execution.output?.exitCode}.` };
      }
      if (action.tool === 'code.validate' && !execution.output?.valid) return { success: false, reason: 'Uma validação de código falhou.' };
      if (action.tool === 'visual.verify' && !execution.output?.valid) return { success: false, reason: 'O screenshot não passou nas verificações estruturais.' };
      if (action.tool === 'site.visual_verify' && execution.output?.verdict !== 'PASS') return { success: false, reason: `A verificação visual do site retornou ${execution.output?.verdict || 'UNCERTAIN'}. ${execution.output?.autoCorrection?.instruction || (execution.output?.feedback || []).join(' ')}`.slice(0, 5000) };
      return { success: true, reason: action.successCriteria || 'Execução concluída.' };
    },
    async summarize(task, runs) {
      const completedRuns = runs.filter(run => run.status === 'completed');
      const observations = completedRuns.map(observedRun);
      const changedFiles = completedRuns.some(run => ['write_file', 'filesystem.write', 'filesystem.patch', 'filesystem.mkdir', 'project.create'].includes(run.tool));
      const successfulCheck = completedRuns.some(run => (['run_command', 'shell.run'].includes(run.tool) && Number(run.output?.exitCode) === 0 && /(?:test|lint|build|typecheck|tsc|--check)/i.test(run.output?.command || '')) || (run.tool === 'code.validate' && run.output?.valid));
      const researchEvidence = completedRuns.some(run => ['research.search', 'web.search', 'research.fetch', 'web.fetch', 'browser.open', 'browser.follow'].includes(run.tool));
      const mediaEvidence = completedRuns.some(run => /^(?:image|video|audio)\./.test(run.tool) && (run.output?.artifact?.id || run.output?.artifactId));
      const visualSiteEvidence = completedRuns.some(run => run.tool === 'site.visual_verify' && run.output?.verdict === 'PASS');
      const planCompleted = task.plan.length > 0 && task.plan.every(step => step.status === 'completed');
      const asksForMutation = includesObjective(task.objective, /\b(cri|corr|edit|implement|refator|alter|remov|adicion|constru|fac|ger)[a-z]*/);
      const asksForValidation = includesObjective(task.objective, /\b(test|valid|lint|build|compil|typecheck|verific|confir)[a-z]*/);
      const asksForResearch = includesObjective(task.objective, /\b(pesquis|investig|busc|procure|internet|web)[a-z]*/);
      const asksForMedia = includesObjective(task.objective, /\b(imagem|ilustra|foto|video|audio|voz|narra)[a-z]*/);
      const asksForWebsite = includesObjective(task.objective, /\b(site|website|landing|pagina|homepage|loja|portfolio|interface web)\b/);
      const failedRuns = runs.filter(run => run.status === 'failed');
      const acceptanceCriteria = [
        { criterion: 'O plano terminou sem etapas pendentes.', met: planCompleted },
        ...(asksForMutation ? [{ criterion: 'A mudança solicitada produziu um artefato observado.', met: changedFiles }] : []),
        ...(asksForValidation || changedFiles ? [{ criterion: 'Uma validação relevante terminou com sucesso.', met: successfulCheck }] : []),
        ...(asksForResearch ? [{ criterion: 'A pesquisa produziu fontes ou páginas observadas.', met: researchEvidence }] : []),
        ...(asksForMedia ? [{ criterion: 'Um artefato de mídia real foi persistido.', met: mediaEvidence }] : []),
        ...(asksForWebsite && asksForMutation ? [{ criterion: 'O site passou por verificação visual desktop e mobile.', met: visualSiteEvidence }] : []),
      ];
      const hardFailure = !planCompleted || completedRuns.length === 0 || (asksForMutation && !changedFiles) || (asksForValidation && !successfulCheck) || (asksForResearch && !researchEvidence) || (asksForMedia && !mediaEvidence) || (asksForWebsite && asksForMutation && !visualSiteEvidence);
      const uncertain = !hardFailure && (failedRuns.length > 0 || (changedFiles && !successfulCheck));
      const verdict = hardFailure ? 'FAIL' : uncertain ? 'UNCERTAIN' : 'PASS';
      const validated = verdict === 'PASS';
      const remainingRisks = [
        ...(changedFiles && !successfulCheck ? ['Houve alteração de arquivo, mas nenhum teste, lint, typecheck ou build bem-sucedido foi registrado.'] : []),
        ...(failedRuns.length ? [`${failedRuns.length} execução(ões) falharam antes do resultado final.`] : []),
      ].filter((value, index, values) => values.indexOf(value) === index);
      const details = observations.map(item => item.summary).join(' ');
      const confidence = verdict === 'PASS' ? 0.94 : verdict === 'FAIL' ? 0.9 : 0.58;
      return {
        verdict, validated, confidence, acceptanceCriteria,
        summary: verdict === 'PASS' ? `PASS — objetivo comprovado com evidências locais. ${details}` : verdict === 'FAIL' ? `FAIL — o objetivo não foi comprovado. ${details}` : `UNCERTAIN — a execução produziu resultado, mas ainda falta evidência suficiente. ${details}`,
        evidence: observations.flatMap(item => item.evidence).slice(0, 12),
        remainingRisks,
      };
    },
  };
}
