const ERROR_LINE = /\b(error|failed|failure|warn|exception|timeout|fatal|erro|falhou|warning)\b/i;
export function compressToolResult(output, { maxChars = 6_000 } = {}) {
  if (output == null) return { summary: null, fullLength: 0, truncated: false };
  if (typeof output === 'object' && !Array.isArray(output)) {
    const structured = { ...output }; let fieldTruncated = false;
    for (const key of ['stdout', 'stderr', 'content', 'text', 'html']) if (typeof structured[key] === 'string') {
      const value = structured[key]; const important = value.split(/\r?\n/).filter(line => ERROR_LINE.test(line)).slice(-40).join('\n');
      if (value.length > maxChars) fieldTruncated = true;
      structured[key] = value.length <= maxChars ? value : `${value.slice(0, Math.floor(maxChars * 0.55))}\n…\n${important || value.slice(-Math.floor(maxChars * 0.35))}`;
    }
    const serialized = JSON.stringify(structured); return { summary: serialized.length <= maxChars ? structured : { truncated: true, preview: serialized.slice(0, maxChars) }, fullLength: JSON.stringify(output).length, truncated: fieldTruncated || serialized.length > maxChars };
  }
  const text = typeof output === 'string' ? output : JSON.stringify(output); return { summary: text.length <= maxChars ? output : `${text.slice(0, maxChars)}…`, fullLength: text.length, truncated: text.length > maxChars };
}
