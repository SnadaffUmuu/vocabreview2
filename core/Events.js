// Events: DOM -> application, via a single document-level listener per event
// type. Handlers are declared in each component's "events" map and dispatched
// here by selector match (e.target.matches). Mirrors KanbanMvd's Events.js.
//
//   component.events = {
//     click: {
//       '@alias': 'myHandler',               // selector via component.selectors
//       '#raw .selector': 'myHandler',       // raw selector
//       '@other': ['myHandler', [param1, param2]],
//     },
//   };
//
// Handler names are auto-prefixed with component.name.
const Events = {

  namespaces: {},

  map: {},

  register(component) {
    component.name && (this.namespaces[component.name] = component);
  },

  init() {
    // Merge every component's declarative events into one map.
    Components.forEach(component => {
      this.register(component);
      if(!component.events) return;

      Object.keys(component.events).forEach(eventName => {
        if(!this.map[eventName]) this.map[eventName] = {};

        const entries = component.events[eventName];
        Object.keys(entries).forEach(selectorKey => {
          const selector = selectorKey.startsWith('@')
            ? component.selectors[selectorKey.slice(1)]
            : selectorKey;
          const rawValue = entries[selectorKey];
          const value = Array.isArray(rawValue)
            ? [this._prefix(rawValue[0], component), rawValue[1] || []]
            : [this._prefix(rawValue, component), []];

          if(!this.map[eventName][selector]) {
            this.map[eventName][selector] = [];
          }
          this.map[eventName][selector].push(value);
        });
      });
    });

    // One document-level listener per event type.
    Object.keys(this.map).forEach(eventName => {
      document.addEventListener(eventName, (e) => {
        this.handler(e, eventName);
      });
    });
  },

  _prefix(methodPath, component) {
    return methodPath.includes('.')
      ? methodPath
      : component.name + '.' + methodPath;
  },

  handler(e, eventName) {
    const entry = this.map[eventName];
    if(!entry) return;

    Object.keys(entry).forEach(selector => {
      const shouldRun =
        selector === '##' ||
        (e.target.matches && e.target.matches(selector));

      if(!shouldRun) return;

      entry[selector].forEach(([methodPath, params]) => {
        const [nsName, methodName] = methodPath.split('.');
        const ns = this.namespaces[nsName];
        if(!ns || typeof ns[methodName] !== 'function') return;
        ns[methodName](e.target, e, params);
      });
    });
  },
};
