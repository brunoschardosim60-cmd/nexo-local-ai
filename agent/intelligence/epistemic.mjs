export const EPISTEMIC = Object.freeze({ KNOWN: 'KNOWN', INFERRED: 'INFERRED', RETRIEVED: 'RETRIEVED', UNCERTAIN: 'UNCERTAIN', UNKNOWN: 'UNKNOWN' });

export function assessKnowledge({ direct = false, retrieved = [], evidence = [], contradictions = [], confidence = null } = {}) {
  const numeric = confidence == null ? (direct ? 0.95 : evidence.length ? 0.82 : retrieved.length ? 0.72 : 0.25) : Number(confidence);
  if (contradictions.length) return { state: EPISTEMIC.UNCERTAIN, confidence: Math.min(numeric, 0.55), shouldVerify: true, reasons: ['evidências contraditórias'] };
  if (direct && numeric >= 0.9) return { state: EPISTEMIC.KNOWN, confidence: numeric, shouldVerify: false, reasons: ['fonte determinística ou observação direta'] };
  if (evidence.length) return { state: EPISTEMIC.RETRIEVED, confidence: numeric, shouldVerify: numeric < 0.8, reasons: ['evidência recuperada'] };
  if (retrieved.length) return { state: EPISTEMIC.RETRIEVED, confidence: numeric, shouldVerify: true, reasons: ['memória ou contexto recuperado'] };
  if (numeric >= 0.55) return { state: EPISTEMIC.INFERRED, confidence: numeric, shouldVerify: true, reasons: ['inferência do modelo'] };
  if (numeric >= 0.2) return { state: EPISTEMIC.UNCERTAIN, confidence: numeric, shouldVerify: true, reasons: ['evidência insuficiente'] };
  return { state: EPISTEMIC.UNKNOWN, confidence: numeric, shouldVerify: true, reasons: ['sem base confiável'] };
}

export function epistemicInstruction(assessment) {
  if (!assessment || assessment.state === EPISTEMIC.KNOWN) return '';
  if (assessment.state === EPISTEMIC.RETRIEVED) return 'Trate o contexto recuperado como evidência atribuível, não como conhecimento absoluto.';
  if (assessment.state === EPISTEMIC.INFERRED) return 'Diferencie claramente inferências de fatos observados.';
  if (assessment.state === EPISTEMIC.UNKNOWN) return 'Admita que a informação não está disponível e peça ou busque a evidência necessária.';
  return 'Não apresente certeza: há evidência insuficiente ou contraditória; verifique ou explicite a incerteza.';
}
