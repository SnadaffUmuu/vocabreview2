// App: owns current selection state (current source, current view, theme),
// per-source selections (which sections are checked), and per-source/per-view
// progress. The single point that writes views/selections/settings to Storage.
// No DOM.
//
// Data model:
//   views[sourceId][viewName] = { progress: { [entryId]: {...} }, ui: {...} }
//   selections[sourceId] = [sectionIds]
//   settings = { currentSource, currentView, night }
const App = {

  views: {},
  selections: {},
  settings: {
    currentSource: null,
    currentView: 'data',
    night: false,
  },

  load() {
    this.views = Storage.load(Storage.KEY.views, {});
    this.selections = Storage.load(Storage.KEY.selections, {});
    Object.assign(this.settings, Storage.load(Storage.KEY.settings, {}));
  },

  // Retiring a source also retires its progress and section selection. Do not
  // touch listed sources, even if their text has not been imported yet.
  removeUnlistedSources(allowedIds) {
    const allowed = new Set(allowedIds);
    let viewsChanged = false;
    let selectionsChanged = false;
    Object.keys(this.views).forEach(id => {
      if(allowed.has(id)) return;
      delete this.views[id];
      viewsChanged = true;
    });
    Object.keys(this.selections).forEach(id => {
      if(allowed.has(id)) return;
      delete this.selections[id];
      selectionsChanged = true;
    });
    if(viewsChanged) this.saveViews();
    if(selectionsChanged) Storage.save(Storage.KEY.selections, this.selections);
    if(this.settings.currentSource && !allowed.has(this.settings.currentSource)) {
      this.settings.currentSource = null;
      this._saveSettings();
    }
  },

  // ---- settings ------------------------------------------------------------------

  get night() { return this.settings.night; },
  get currentSource() { return this.settings.currentSource; },
  get currentView() { return this.settings.currentView; },

  _saveSettings() {
    Storage.save(Storage.KEY.settings, this.settings);
  },

  setNight(val) {
    this.settings.night = !!val;
    this._saveSettings();
    Bus.emit(Bus.events.settingsChanged, { night: this.settings.night });
  },

  selectSource(id) {
    this.ensureSelection(id);
    this.settings.currentSource = id;
    this._saveSettings();
    Bus.emit(Bus.events.sourceSelected, { id });
  },

  setView(name) {
    this.settings.currentView = name;
    this._saveSettings();
    Bus.emit(Bus.events.viewChanged, { name });
  },

  // ---- selections ----------------------------------------------------------------

  getSelection(sourceId) {
    return this.selections[sourceId] || [];
  },

  // An empty selection means the whole source, except when a large source
  // defaults to its first section. An explicit selection is never capped.
  defaultSelection(sourceId) {
    const parsed = Library.getSource(sourceId)?.parsed;
    if(!parsed || parsed.allEntries.length <= 100) return [];
    const first = parsed.structure[0];
    if(!first) return [];
    return [first.children?.[0]?.id || first.id];
  },

  ensureSelection(sourceId) {
    if(!sourceId || this.getSelection(sourceId).length) return;
    const initial = this.defaultSelection(sourceId);
    if(initial.length) this.setSelection(sourceId, initial);
  },

  setSelection(sourceId, sectionIds) {
    const selection = sectionIds.length ? sectionIds : this.defaultSelection(sourceId);
    this.selections[sourceId] = selection;
    Storage.save(Storage.KEY.selections, this.selections);
    Bus.emit(Bus.events.selectionChanged, { sourceId, sectionIds: selection });
  },

  clearSelectionFor(sourceId) {
    delete this.selections[sourceId];
    Storage.save(Storage.KEY.selections, this.selections);
  },

  // Entries for a source given its current selection. If no selection is set,
  // returns all entries (whole source).
  selectedEntries(sourceId) {
    const source = Library.getSource(sourceId);
    if(!source) return [];
    const sel = this.getSelection(sourceId);
    if(!sel.length) return source.parsed.allEntries;
    const set = new Set(sel);
    return source.parsed.allEntries.filter(e => set.has(e.section));
  },

  // ---- view state (per source, per view) -----------------------------------------

  getViewState(sourceId, viewName) {
    if(!this.views[sourceId]) this.views[sourceId] = {};
    if(!this.views[sourceId][viewName]) {
      this.views[sourceId][viewName] = { progress: {}, ui: {} };
    }
    return this.views[sourceId][viewName];
  },

  saveViews() {
    Storage.save(Storage.KEY.views, this.views);
  },

  clearViewsFor(sourceId) {
    delete this.views[sourceId];
    this.saveViews();
  },
};
