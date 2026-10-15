// Bus: application -> subscribers (named change notifications).
// Components subscribe with Bus.on() and react; they never call each other.
// Render methods wrapped with Bus.batchedMethod() are coalesced per microtask.
const Bus = {

  // Canonical event names. Refer to these; do not hardcode strings elsewhere.
  events: {
    sourcesChanged: 'sourcesChanged',
    sourceLoaded: 'sourceLoaded',
    sourceReloaded: 'sourceReloaded',
    originSelected: 'originSelected',
    selectionChanged: 'selectionChanged',
    viewChanged: 'viewChanged',
    viewsChanged: 'viewsChanged',
    sessionsRequested: 'sessionsRequested',
    collectionsChanged: 'collectionsChanged',
    settingsChanged: 'settingsChanged',
    busyChanged: 'busyChanged',
  },

  listeners: {},

  on(event, handler) {
    if(!this.listeners[event]) {
      this.listeners[event] = new Set();
    }
    this.listeners[event].add(handler);
  },

  off(event, handler) {
    this.listeners[event]?.delete(handler);
  },

  emit(event, payload) {
    const handlers = this.listeners[event];
    if(!handlers) return;
    setTimeout(() => {
      handlers.forEach(h => h(payload));
    }, 0);
  },

  scheduleMicrotask:
    typeof queueMicrotask === 'function'
      ? queueMicrotask
      : (cb) => Promise.resolve().then(cb),

  // Wraps a render method so multiple triggers in the same tick result in a
  // single call. Must be applied BEFORE subscribing the renderer to Bus events.
  batchedMethod(obj, methodName) {
    let scheduled = false;
    const schedule = this.scheduleMicrotask;
    const fn = obj[methodName].bind(obj);

    obj[methodName] = (...args) => {
      if(scheduled) return;
      scheduled = true;
      schedule(() => {
        scheduled = false;
        fn(...args);
      });
    };
  },
};
