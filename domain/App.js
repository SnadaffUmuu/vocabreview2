// App: owns current selection state (current origin, current view, theme),
// per-source selections (which sections are checked), and per-origin/per-view
// progress. Coordinates saves via Storage. No DOM.
//
// Data model (see plan in AGENTS.md discussion):
//   views[originId][viewName] = { progress: { [entryId]: {...} }, ui: {...} }
//   selections[sourceId] = [sectionIds]
//   settings = { currentOrigin, currentView, night }
const App = {

  selected: null,
  views: {},
  selections: {},
  settings: null,

  load() {
    this.views = Storage.load(Storage.KEY.views, {});
    this.selections = Storage.load(Storage.KEY.selections, {});
    this.settings = Storage.load(Storage.KEY.settings, {
      currentOrigin: null,
      currentView: 'data',
      night: false,
    });
    this.selected = this.settings.currentOrigin;
  },

  // Ensure settings is initialized (so domain ops are safe before/without load).
  _ensureSettings() {
    if(!this.settings) {
      this.settings = { currentOrigin: null, currentView: 'data', night: false };
    }
  },

  // ---- settings ------------------------------------------------------------------

  get night() { this._ensureSettings(); return this.settings.night; },
  setNight(val) {
    this._ensureSettings();
    this.settings.night = !!val;
    Storage.save(Storage.KEY.settings, this.settings);
    Bus.emit(Bus.events.viewChanged); // cheap way to let theme-reactive UI update
  },

  get currentOrigin() { this._ensureSettings(); return this.settings.currentOrigin; },
  get currentView() { this._ensureSettings(); return this.settings.currentView; },

  selectOrigin(id) {
    this._ensureSettings();
    this.settings.currentOrigin = id;
    this.selected = id;
    Storage.save(Storage.KEY.settings, this.settings);
    Bus.emit(Bus.events.originSelected, { id });
  },

  setView(name) {
    this._ensureSettings();
    this.settings.currentView = name;
    Storage.save(Storage.KEY.settings, this.settings);
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

  // ---- progress (per origin, per view) -------------------------------------------

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

  // Set a progress patch for one entry within a view state, then persist.
  markProgress(originId, viewName, entryId, patch) {
    const state = this.getViewState(originId, viewName);
    if(!state.progress[entryId]) state.progress[entryId] = {};
    Object.assign(state.progress[entryId], patch);
    this.saveViews();
    Bus.emit(Bus.events.viewsChanged, { originId, viewName, entryId });
  },
};
