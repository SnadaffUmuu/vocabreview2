/*
   Library: holds loaded sources (raw text + parsed result in memory), loads
   and reloads them. Pure domain logic; no DOM. Emits Bus events and persists
   only the raw text through Storage; the parsed result is never stored.
   The set of known sources is the hard-coded SOURCES_LIST.

   Custom lists (Collections) are looked up through the same getSource() and
   hasSource(), so Views treat them as sources. They are not file sources:
   listIds() and missingIds() never include them, so nothing that loads,
   reloads or searches the files touches a list.
*/
const Library = {

  // id -> { id, raw, origin, loadedAt, title, sourceName, parsed }
  sources: {},

  // Called once at startup: load each listed source from Storage and parse it.
  load() {
    SOURCES_LIST.forEach(id => {
      const saved = Storage.loadSource(id);
      if(saved && saved.raw != null) {
        this.sources[id] = this._build(id, saved.raw, saved.origin || 'file', saved.loadedAt || null);
        App.ensureSelection(id);
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
    return Collections.isListId(id) ? Collections.asSource(id) : this.sources[id];
  },

  hasSource(id) {
    return Collections.isListId(id) ? Collections.has(id) : !!this.sources[id];
  },

  // The name of a source for the user: the id of a file, "L: name" for a list.
  labelOf(id) {
    return Collections.isListId(id) ? Collections.labelOf(id) : id;
  },

  listIds() {
    return Object.keys(this.sources);
  },

  // Every listed source, loaded or not.
  knownIds() {
    return SOURCES_LIST.slice();
  },

  // Listed sources whose text has not been loaded yet.
  missingIds() {
    return SOURCES_LIST.filter(id => !this.sources[id]);
  },

  // Parses the text, keeps the result in memory and persists the raw text only.
  _install(id, raw, origin) {
    const loadedAt = Date.now();
    const source = this._build(id, raw, origin, loadedAt);
    this.sources[id] = source;
    Storage.saveSource(id, { raw, origin, loadedAt });
    return source;
  },

  // Install raw text for a source (from network or a picked file). Parses,
  // persists the raw text, and emits sourcesChanged.
  setSource(id, raw, origin) {
    const source = this._install(id, raw, origin);
    App.ensureSelection(id);

    Bus.emit(Bus.events.sourcesChanged, { id });
    return source;
  },

  /*
    Update a source: replace its text and nothing else. Progress and selection
    are kept as they are and are NOT checked against the new text: entry
    ordinals, section paths and line indexes are expected to be unchanged (a
    typo fix). If the structure of the file changed, the source has to be
    reloaded instead. The selection is not touched, not even to apply the
    default one.
  */
  updateSource(id, raw, origin) {
    const source = this._install(id, raw, origin);
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
