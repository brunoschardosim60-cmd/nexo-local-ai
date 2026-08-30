export function createStreamAssembler() {
  let value = '';
  let lastSequence = 0;
  return {
    append(chunk, sequence = null) {
      const text = String(chunk || '');
      if (!text) return { accepted: false, delta: '', value };
      if (Number.isInteger(sequence)) {
        if (sequence <= lastSequence) return { accepted: false, delta: '', value };
        lastSequence = sequence;
      }
      if (value && text.length > value.length && text.startsWith(value)) {
        const delta = text.slice(value.length);
        value = text;
        return { accepted: true, delta, value, cumulative: true };
      }
      value += text;
      return { accepted: true, delta: text, value, cumulative: false };
    },
    value() { return value; },
    reset() { value = ''; lastSequence = 0; },
  };
}

export function assembleStreamChunks(chunks = []) {
  const assembler = createStreamAssembler();
  for (const chunk of chunks) {
    if (typeof chunk === 'string') assembler.append(chunk);
    else assembler.append(chunk?.content, chunk?.sequence);
  }
  return assembler.value();
}
