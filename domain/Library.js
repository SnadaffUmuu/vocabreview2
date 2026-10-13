// Library: holds loaded sources (raw text + parsed result in memory), loads
// and reloads them. Pure domain logic; no DOM. Emits Bus events; never touches
// localStorage directly (it delegates to Storage).
const Library = {

  // id -> { id, raw, origin, title, sourceName, parsed }
  sources: {},

  // Called once at startup: load each saved source from Storage and parse it.
  load() {
    const savedList = Storage.load(Storage.KEY.settings + '.knownSources', null)
      || SOURCES_LIST;

    savedList.forEach(id => {
      const saved = Storage.loadSource(id);
      if(saved && saved.raw != null) {
        this.sources[id] = this._hydrate(id, saved);
      }
    });
  },

  _hydrate(id, saved) {
    const parsed = Parser.parse(saved.raw);
    return {
      id,
      raw: saved.raw,
      origin: saved.origin || 'file',
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
  // persists the raw text, and emits sourcesChanged.
  setSource(id, raw, origin) {
    const parsed = Parser.parse(raw);
    const source = {
      id,
      raw,
      origin,
      title: parsed.title,
      sourceName: parsed.sourceName,
      parsed,
    };
    this.sources[id] = source;
    Storage.saveSource(id, { raw, origin, loadedAt: Date.now() });

    const known = this._knownList();
    if(!known.includes(id)) {
      known.push(id);
      Storage.save(Storage.KEY.settings + '.knownSources', known);
    }

    Bus.emit(Bus.events.sourceLoaded, { id });
    Bus.emit(Bus.events.sourcesChanged, { id });
    return source;
  },

  // Reload a source: wipe its progress and selection, then re-fetch.
  // The caller (a component) supplies the fresh raw text after confirming.
  async reloadSource(id, raw, origin) {
    this.setSource(id, raw, origin);
    App.clearViewsFor(id);
    App.clearSelectionFor(id);
    Bus.emit(Bus.events.sourceReloaded, { id });
  },

  _knownList() {
    return Storage.load(Storage.KEY.settings + '.knownSources', null) || SOURCES_LIST.slice();
  },
};
