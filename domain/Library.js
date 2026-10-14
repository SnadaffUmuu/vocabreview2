// Library: holds loaded sources (raw text + parsed result in memory), loads
// and reloads them. Pure domain logic; no DOM. Emits Bus events and persists
// only the raw text through Storage; the parsed result is never stored.
// The set of known sources is the hard-coded SOURCES_LIST.
const Library = {

  // id -> { id, raw, origin, loadedAt, title, sourceName, parsed }
  sources: {},

  // Called once at startup: load each listed source from Storage and parse it.
  load() {
    SOURCES_LIST.forEach(id => {
      const saved = Storage.loadSource(id);
      if(saved && saved.raw != null) {
        this.sources[id] = this._build(id, saved.raw, saved.origin || 'file', saved.loadedAt || null);
      }
    });
  },

  _build(id, raw, origin, loadedAt) {
    const parsed = Parser.parse(raw);
    return {
      id,
      raw,
      origin,
      loadedAt,
      title: parsed.title,
      sourceName: parsed.sourceName,
      parsed,
    };
  },

  getSource(id) {
    return this.sources[id];
  },

  hasSource(id) {
    return !!this.sources[id];
  },

  listIds() {
    return Object.keys(this.sources);
  },

  // Install raw text for a source (from network or a picked file). Parses,
  // persists the raw text, and emits sourceLoaded + sourcesChanged.
  setSource(id, raw, origin) {
    const loadedAt = Date.now();
    const source = this._build(id, raw, origin, loadedAt);
    this.sources[id] = source;
    Storage.saveSource(id, { raw, origin, loadedAt });

    Bus.emit(Bus.events.sourceLoaded, { id });
    Bus.emit(Bus.events.sourcesChanged, { id });
    return source;
  },

  // Reload a source: wipe its progress and selection, then install the fresh
  // text. No reconcile with the old data. The caller (a component) has already
  // confirmed with the user and obtained the new raw text.
  reloadSource(id, raw, origin) {
    App.clearViewsFor(id);
    App.clearSelectionFor(id);
    this.setSource(id, raw, origin);
    Bus.emit(Bus.events.sourceReloaded, { id });
  },
};
