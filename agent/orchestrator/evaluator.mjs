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
  return { summary: `${run.tool} concluída.`, evidence: [`${run.tool}: ${run.status}`] };
}

export function createEvaluator({ ollama, router }) {
  return {
    evaluateTool(action, execution) {
      if (!execution.ok) return { success: false, reason: execution.error };
      if (['run_command', 'shell.run'].includes(action.tool) && Number(execution.output?.exitCode) !== 0) {
        return { success: false, reason: execution.output?.stderr || `Comando terminou com código ${execution.output?.exitCode}.` };
      }
      return { success: true, reason: action.successCriteria || 'Execução concluída.' };
    },
    async summarize(task, runs) {
      const completedRuns = runs.filter(run => run.status === 'completed');
      const observations = completedRuns.map(observedRun);
      const changedFiles = completedRuns.some(run => ['write_file', 'filesystem.write', 'filesystem.patch'].includes(run.tool));
      const successfulCheck = completedRuns.some(run => ['run_command', 'shell.run'].includes(run.tool) && Number(run.output?.exitCode) === 0 && /(?:test|lint|build|typecheck|tsc|--check)/i.test(run.output?.command || ''));
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
