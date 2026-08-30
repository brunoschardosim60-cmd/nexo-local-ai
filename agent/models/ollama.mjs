function parseJson(content) {
  const cleaned = String(content || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(cleaned); } catch {
    const object = cleaned.match(/\{[\s\S]*\}/)?.[0];
    if (!object) throw new Error('O modelo não retornou JSON válido.');
    return JSON.parse(object);
  }
}

export function createOllamaClient(config) {
  return {
    async json({ model, system, prompt, temperature = 0.15, numPredict = 1400, timeoutMs = 120_000 }) {
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${config.ollamaUrl}/api/chat`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({
            model, stream: false, format: 'json', keep_alive: '30m',
            options: { temperature, top_p: 0.9, repeat_penalty: 1.1, num_ctx: 6144, num_predict: numPredict },
            messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
          }),
        });
        if (!response.ok) throw new Error(`Ollama respondeu ${response.status}.`);
        const data = await response.json();
        return parseJson(data.message?.content);
      } finally { clearTimeout(timer); }
    },
  };
}
