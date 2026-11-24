// In-memory event bus. Webhooks publish here; GET /events streams events to the browser (SSE).
// Event ids include a boot id so a browser that reconnects after a server restart never
// mistakes new events for ones it has already shown.
function createEventBus({ size = 200 } = {}) {
  const bootId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const buffer = [];
  const listeners = new Set();
  let counter = 0;

  return {
    publish(source, type, payload) {
      counter += 1;
      const event = { id: `${bootId}-${counter}`, at: new Date().toISOString(), source, type, payload };
      buffer.push(event);
      if (buffer.length > size) buffer.shift();
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (err) {
          console.error('Event listener failed:', err.message);
        }
      }
      return event;
    },
    recent: (filter = () => true) => buffer.filter(filter),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    clear() {
      buffer.length = 0;
    },
  };
}

module.exports = { createEventBus };
