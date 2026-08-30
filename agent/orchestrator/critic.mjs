function deterministicReview(validation) {
  const missing = (validation.acceptanceCriteria || []).filter(item => !item.met).map(item => item.criterion);
  const risks = validation.remainingRisks || [];
  const gap = [...missing, ...risks].join(' ') || 'Ainda não há evidência suficiente para provar o objetivo.';
  return { decision: validation.verdict === 'PASS' ? 'accept' : 'retry', gap, strategy: 'Colete evidência nova com uma ferramenta ou validação diferente da tentativa anterior.', acceptanceCriteria: missing };
}

export function createCritic({ ollama, router }) {
  return {
    async review({ task, runs, validation, correctionRound = 0, signal = null }) {
      const baseline = deterministicReview(validation);
      if (baseline.decision === 'accept') return baseline;
      try {
        const route = router.route({ objective: task.objective, purpose: 'critic' });
        const result = await ollama.json({
          model: route.model, numPredict: 650, signal,
          system: 'Você é o Critic do Nexo. Audite evidências, identifique a lacuna exata e proponha uma estratégia diferente. Não declare sucesso sem prova observada. Responda somente JSON.',
          prompt: `OBJETIVO: ${task.objective}\nRODADA DE CORREÇÃO: ${correctionRound + 1}\nVEREDITO: ${validation.verdict}\nCRITÉRIOS: ${JSON.stringify(validation.acceptanceCriteria)}\nRISCOS: ${JSON.stringify(validation.remainingRisks)}\nEXECUÇÕES RECENTES: ${JSON.stringify(runs.slice(-8).map(run => ({ tool: run.tool, input: run.input, status: run.status, error: run.error, output: run.output }))).slice(0, 10_000)}\nRetorne {"decision":"retry|stop","gap":"lacuna comprovável","strategy":"abordagem nova e concreta","acceptanceCriteria":["evidência necessária"]}. Não repita a mesma ação que falhou.`,
        });
        if (!['retry', 'stop'].includes(result?.decision) || !result?.gap) return baseline;
        return { decision: result.decision, gap: String(result.gap).slice(0, 1200), strategy: String(result.strategy || baseline.strategy).slice(0, 1200), acceptanceCriteria: Array.isArray(result.acceptanceCriteria) ? result.acceptanceCriteria.map(String).slice(0, 8) : baseline.acceptanceCriteria, model: route.model };
      } catch (error) { if (signal?.aborted) throw error; return baseline; }
    },
    health() { return { enabled: true, trigger: ['FAIL', 'UNCERTAIN'], maxRounds: 'configurable' }; },
  };
}
