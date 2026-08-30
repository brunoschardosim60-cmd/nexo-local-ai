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
  if (['write_file', 'filesystem.write', 'filesystem.patch'].includes(run.tool) && output?.path) {
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
  if (run.tool === 'code.validate' && Array.isArray(output?.results)) return { summary: `Validação de código ${output.valid ? 'aprovada' : 'reprovada'}.`, evidence: output.results.map(item => `${item.check}: exit code ${item.exitCode}`) };
  if (run.tool === 'agents.delegate' && Array.isArray(output?.children)) return { summary: `${output.children.length} subtarefas delegadas em paralelo.`, evidence: output.children.map(item => `${item.assignedAgent}: ${item.objective} (${item.id})`) };
  if (run.tool === 'agents.status' && Array.isArray(output?.tasks)) return { summary: `${output.tasks.length} subtarefas observadas; ${output.complete ? 'todas terminaram' : 'ainda há trabalho em andamento'}.`, evidence: output.tasks.map(item => `${item.assignedAgent}: ${item.status} — ${item.objective}`) };
  return { summary: `${run.tool} concluída.`, evidence: [`${run.tool}: ${run.status}`] };
}

export function createEvaluator({ ollama, router }) {
  return {
    evaluateTool(action, execution) {
      if (!execution.ok) return { success: false, reason: execution.error };
      if (['run_command', 'shell.run'].includes(action.tool) && Number(execution.output?.exitCode) !== 0) {
        return { success: false, reason: execution.output?.stderr || `Comando terminou com código ${execution.output?.exitCode}.` };
      }
      if (action.tool === 'code.validate' && !execution.output?.valid) return { success: false, reason: 'Uma validação de código falhou.' };
      if (action.tool === 'visual.verify' && !execution.output?.valid) return { success: false, reason: 'O screenshot não passou nas verificações estruturais.' };
      return { success: true, reason: action.successCriteria || 'Execução concluída.' };
    },
    async summarize(task, runs) {
      const completedRuns = runs.filter(run => run.status === 'completed');
      const observations = completedRuns.map(observedRun);
      const changedFiles = completedRuns.some(run => ['write_file', 'filesystem.write', 'filesystem.patch'].includes(run.tool));
      const successfulCheck = completedRuns.some(run => (['run_command', 'shell.run'].includes(run.tool) && Number(run.output?.exitCode) === 0 && /(?:test|lint|build|typecheck|tsc|--check)/i.test(run.output?.command || '')) || (run.tool === 'code.validate' && run.output?.valid));
      const planCompleted = task.plan.length > 0 && task.plan.every(step => step.status === 'completed');
      const validated = planCompleted && completedRuns.length > 0 && (!changedFiles || successfulCheck);
      const remainingRisks = changedFiles && !successfulCheck ? ['Houve alteração de arquivo, mas nenhum teste, lint, typecheck ou build bem-sucedido foi registrado.'] : [];
      const details = observations.map(item => item.summary).join(' ');
      return {
        validated,
        summary: validated ? `Objetivo executado com evidências locais. ${details}` : `A execução terminou, mas ainda precisa de validação. ${details}`,
        evidence: observations.flatMap(item => item.evidence).slice(0, 12),
        remainingRisks,
      };
    },
  };
}
