function matches(pattern, type) {
  return pattern === '*' || pattern === type || (pattern.endsWith('.*') && type.startsWith(pattern.slice(0, -1)));
}

export function createEventBus({ database, logger }) {
  const subscribers = new Map();

  async function publish(type, data = null, options = {}) {
    const event = database.addRuntimeEvent(type, data, { source: options.source || 'nexo-core', level: options.level || 'info', taskId: options.taskId, trust: options.trust || 'TRUSTED' });
    await logger?.info?.('event.published', { type, sequence: event.sequence, taskId: event.taskId }).catch(() => undefined);
    for (const [pattern, handlers] of subscribers) {
      if (!matches(pattern, type)) continue;
      for (const handler of handlers) queueMicrotask(() => Promise.resolve(handler(event)).catch(() => undefined));
    }
    return event;
  }

  return {
    publish,
    subscribe(pattern, handler) {
      if (!subscribers.has(pattern)) subscribers.set(pattern, new Set());
      subscribers.get(pattern).add(handler);
      return () => subscribers.get(pattern)?.delete(handler);
    },
    list(options) { return database.listRuntimeEvents(options); },
    health() { return { version: '3.0.0', persistent: true, deterministicFiltering: true, normalized: ['source','type','timestamp','payload','trust'], subscribers: [...subscribers.values()].reduce((total, handlers) => total + handlers.size, 0) }; },
  };
}
