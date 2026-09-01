export function recordModelOutcome(database, { model, domain = 'chat', route = null, quality = null, metrics = null } = {}) {
  if (!database?.upsertModelBenchmark || !model) return null;
  const previous = database.listModelBenchmarks?.(domain)?.find(item => item.model === model) || null;
  const previousCount = previous?.sampleCount || 0;
  const qualityScore = quality ? (quality.pass ? 1 : 0) : 0.8;
  const latencyMs = metrics?.totalDuration ? Math.round(metrics.totalDuration / 1_000_000) : null;
  return database.upsertModelBenchmark({
    model,
    domain,
    score: Number((((previous?.score || 0) * previousCount + qualityScore) / (previousCount + 1)).toFixed(4)),
    sampleCount: previousCount + 1,
    medianLatencyMs: latencyMs == null ? previous?.medianLatencyMs || null : Math.round((((previous?.medianLatencyMs || latencyMs) * previousCount) + latencyMs) / (previousCount + 1)),
    metadata: { source: 'runtime.completed', lastRoute: route, lastQualityPassed: quality?.pass ?? null },
  });
}
