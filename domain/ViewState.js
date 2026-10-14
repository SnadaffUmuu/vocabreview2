// ViewState: generic domain operations over the persisted per-origin/per-view
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

  get(originId, viewName) {
    return App.getViewState(originId, viewName);
  },

  setUi(originId, viewName, patch, emit = false) {
    const state = this.get(originId, viewName);
    Object.assign(state.ui, patch);
    App.saveViews();
    if(emit) Bus.emit(Bus.events.viewsChanged, { originId, viewName });
    return state.ui;
  },

  replaceUiValue(originId, viewName, key, value) {
    return this.setUi(originId, viewName, { [key]: value });
  },

  entry(originId, viewName, entryId) {
    const state = this.get(originId, viewName);
    return state.progress[entryId] || null;
  },

  // Store one entry's progress item, or drop it when it carries no real
  // progress any more (so "in progress" marks disappear with the last mark).
  setEntry(originId, viewName, entryId, item) {
    const state = this.get(originId, viewName);
    const key = String(entryId);
    if(this.isEntryInProgress(viewName, item)) state.progress[key] = item;
    else delete state.progress[key];
    App.saveViews();
    Bus.emit(Bus.events.viewsChanged, { originId, viewName, entryId });
  },

  // Clear progress of the given entries only (e.g. the current selection) and
  // restore the view's ui to defaults. Progress of other entries is kept.
  resetEntries(originId, viewName, entryIds, defaultUi = {}) {
    const state = this.get(originId, viewName);
    entryIds.forEach(id => { delete state.progress[String(id)]; });
    state.ui = Object.assign({}, defaultUi);
    App.saveViews();
    Bus.emit(Bus.events.viewsChanged, { originId, viewName });
  },
};
