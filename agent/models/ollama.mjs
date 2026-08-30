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
    async warm(model, numContext = 4096, timeoutMs = 45_000) {
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${config.ollamaUrl}/api/generate`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ model, prompt: '', stream: false, keep_alive: '30m', options: { num_ctx: numContext, num_predict: 1 } }),
        });
        if (!response.ok) throw new Error(`Ollama respondeu ${response.status}.`);
        return { model, numContext, ready: true };
      } finally { clearTimeout(timer); }
    },
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
    async *stream({ model, messages, temperature = 0.28, numPredict = 600, numContext = 4096, timeoutMs = 120_000, signal = null }) {
      const controller = new AbortController(); const abort = () => controller.abort();
      if (signal?.aborted) controller.abort(); else signal?.addEventListener?.('abort', abort, { once: true });
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${config.ollamaUrl}/api/chat`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({
            model, stream: true, keep_alive: '30m',
            options: { temperature, top_p: 0.9, repeat_penalty: 1.1, num_ctx: numContext, num_predict: numPredict },
            messages,
          }),
        });
        if (!response.ok) throw new Error(`Ollama respondeu ${response.status}.`);
        if (!response.body) throw new Error('Ollama não iniciou o streaming.');
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
        while (true) {
          const { value, done } = await reader.read(); if (done) break;
          buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.trim()) continue;
            const data = JSON.parse(line); const token = data.message?.content || '';
            if (token) yield { type: 'token', content: token };
            if (data.done) yield { type: 'metrics', metrics: { totalDuration: data.total_duration, loadDuration: data.load_duration, promptTokens: data.prompt_eval_count, promptDuration: data.prompt_eval_duration, outputTokens: data.eval_count, outputDuration: data.eval_duration } };
          }
        }
        if (buffer.trim()) {
          const data = JSON.parse(buffer); const token = data.message?.content || '';
          if (token) yield { type: 'token', content: token };
          if (data.done) yield { type: 'metrics', metrics: { totalDuration: data.total_duration, loadDuration: data.load_duration, promptTokens: data.prompt_eval_count, promptDuration: data.prompt_eval_duration, outputTokens: data.eval_count, outputDuration: data.eval_duration } };
        }
      } finally {
        clearTimeout(timer); signal?.removeEventListener?.('abort', abort);
      }
    },
  };
}
