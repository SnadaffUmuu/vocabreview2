// App: owns current selection state (current origin, current view, theme),
// per-source selections (which sections are checked), and per-origin/per-view
// progress. The single point that writes views/selections/settings to Storage.
// No DOM.
//
// Data model:
//   views[originId][viewName] = { progress: { [entryId]: {...} }, ui: {...} }
//   selections[sourceId] = [sectionIds]
//   settings = { currentOrigin, currentView, night }
const App = {

  views: {},
  selections: {},
  settings: {
    currentOrigin: null,
    currentView: 'data',
    night: false,
  },

  load() {
    this.views = Storage.load(Storage.KEY.views, {});
    this.selections = Storage.load(Storage.KEY.selections, {});
    Object.assign(this.settings, Storage.load(Storage.KEY.settings, {}));
  },

  // ---- settings ------------------------------------------------------------------

  get night() { return this.settings.night; },
  get currentOrigin() { return this.settings.currentOrigin; },
  get currentView() { return this.settings.currentView; },

  _saveSettings() {
    Storage.save(Storage.KEY.settings, this.settings);
  },

  setNight(val) {
    this.settings.night = !!val;
    this._saveSettings();
    Bus.emit(Bus.events.settingsChanged, { night: this.settings.night });
  },

  selectOrigin(id) {
    this.settings.currentOrigin = id;
    this._saveSettings();
    Bus.emit(Bus.events.originSelected, { id });
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

  setSelection(sourceId, sectionIds) {
    this.selections[sourceId] = sectionIds;
    Storage.save(Storage.KEY.selections, this.selections);
    Bus.emit(Bus.events.selectionChanged, { sourceId, sectionIds });
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

  // ---- view state (per origin, per view) -----------------------------------------

  getViewState(originId, viewName) {
    if(!this.views[originId]) this.views[originId] = {};
    if(!this.views[originId][viewName]) {
      this.views[originId][viewName] = { progress: {}, ui: {} };
    }
    return this.views[originId][viewName];
  },

  saveViews() {
    Storage.save(Storage.KEY.views, this.views);
  },

  clearViewsFor(originId) {
    delete this.views[originId];
    this.saveViews();
  },
};
