// ViewState: generic domain operations over the persisted per-source/per-view
// state { progress: { [entryId]: {...} }, ui: {...} }. This is NOT a "session
// snapshot": the selection only decides which entries are shown, progress stays
// bound to entry.id.
//
// The shape of one progress item belongs to the view that writes it. A view
// describes itself through registerKind(viewName, kind), where kind is
//   { label: 'S', isEntryInProgress(item) -> boolean }
// Progress (section marks, sessions dialog) reads only that contract.
const ViewState = {

  kinds: {},

  registerKind(viewName, kind) {
    this.kinds[viewName] = kind;
  },

  isEntryInProgress(viewName, item) {
    const kind = this.kinds[viewName];
    return !!(item && kind && kind.isEntryInProgress(item));
  },

  labelOf(viewName) {
    const kind = this.kinds[viewName];
    return kind && kind.label ? kind.label : viewName.slice(0, 1).toUpperCase();
  },

  get(sourceId, viewName) {
    return App.getViewState(sourceId, viewName);
  },

  setUi(sourceId, viewName, patch, emit = false) {
    const state = this.get(sourceId, viewName);
    Object.assign(state.ui, patch);
    App.saveViews();
    if(emit) Bus.emit(Bus.events.viewsChanged, { sourceId, viewName });
    return state.ui;
  },

  replaceUiValue(sourceId, viewName, key, value) {
    return this.setUi(sourceId, viewName, { [key]: value });
  },

  entry(sourceId, viewName, entryId) {
    const state = this.get(sourceId, viewName);
    return state.progress[entryId] || null;
  },

  // Store one entry's progress item, or drop it when it carries no real
  // progress any more (so "in progress" marks disappear with the last mark).
  setEntry(sourceId, viewName, entryId, item) {
    const state = this.get(sourceId, viewName);
    const key = String(entryId);
    if(this.isEntryInProgress(viewName, item)) state.progress[key] = item;
    else delete state.progress[key];
    App.saveViews();
    Bus.emit(Bus.events.viewsChanged, { sourceId, viewName, entryId });
  },

  // Several entries at once: { [entryId]: item | null }. One save and one event
  // instead of one per entry. A null or no-progress item drops the entry.
  setEntries(sourceId, viewName, items) {
    const state = this.get(sourceId, viewName);
    Object.keys(items).forEach(entryId => {
      const item = items[entryId];
      if(this.isEntryInProgress(viewName, item)) state.progress[entryId] = item;
      else delete state.progress[entryId];
    });
    App.saveViews();
    Bus.emit(Bus.events.viewsChanged, { sourceId, viewName });
  },

  // Clear progress of the given entries only (e.g. the current selection) and
  // restore the view's ui to defaults. Progress of other entries is kept.
  resetEntries(sourceId, viewName, entryIds, defaultUi = {}) {
    const state = this.get(sourceId, viewName);
    entryIds.forEach(id => { delete state.progress[String(id)]; });
    state.ui = Object.assign({}, defaultUi);
    App.saveViews();
    Bus.emit(Bus.events.viewsChanged, { sourceId, viewName });
  },
};
