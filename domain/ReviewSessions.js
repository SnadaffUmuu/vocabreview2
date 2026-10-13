// ReviewSessions: domain operations over persisted per-origin/per-view state.
// A "session" is the accumulated state of one view for one origin. Selection
// only controls which entries are visible; changing it never deletes progress.
const ReviewSessions = {

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

  toggleSideMark(originId, viewName, entryId, mark, sideIndex) {
    const state = this.get(originId, viewName);
    const key = String(entryId);
    const item = state.progress[key] || {};
    const other = mark === 'hits' ? 'lapses' : 'hits';
    const values = Array.isArray(item[mark]) ? item[mark].slice() : [];
    const idx = values.indexOf(sideIndex);
    const active = idx < 0;

    if(active) values.push(sideIndex);
    else values.splice(idx, 1);

    if(values.length) item[mark] = values;
    else delete item[mark];

    // A side cannot be a hit and a lapse simultaneously.
    if(active && Array.isArray(item[other])) {
      item[other] = item[other].filter(i => i !== sideIndex);
      if(!item[other].length) delete item[other];
    }

    this._saveEntry(state, key, item);
    Bus.emit(Bus.events.viewsChanged, { originId, viewName, entryId });
    return active;
  },

  setSideIndex(originId, viewName, entryId, sideIndex) {
    const state = this.get(originId, viewName);
    const sideIndexes = Object.assign({}, state.ui.sideIndexes || {}, {
      [entryId]: sideIndex,
    });
    state.ui.sideIndexes = sideIndexes;
    App.saveViews();
  },

  removeEntry(originId, viewName, entryId) {
    const state = this.get(originId, viewName);
    const key = String(entryId);
    const item = state.progress[key] || {};
    item.removed = true;
    delete item.hits;
    delete item.lapses;
    this._saveEntry(state, key, item);
    Bus.emit(Bus.events.viewsChanged, { originId, viewName, entryId });
  },

  reset(originId, viewName, defaultUi = {}) {
    const state = this.get(originId, viewName);
    state.progress = {};
    state.ui = Object.assign({}, defaultUi);
    App.saveViews();
    Bus.emit(Bus.events.viewsChanged, { originId, viewName });
  },

  // Scope changes reset navigation only, exactly as Slider v1 did. Review
  // marks and removed entries remain available when the old scope is restored.
  resetNavigation(originId, viewName) {
    const state = this.get(originId, viewName);
    delete state.ui.order;
    delete state.ui.currentEntryId;
    delete state.ui.sideIndexes;
    App.saveViews();
  },

  isEntryInProgress(item) {
    return !!(item && (
      item.removed
      || Array.isArray(item.hits) && item.hits.length
      || Array.isArray(item.lapses) && item.lapses.length
    ));
  },

  _saveEntry(state, key, item) {
    if(this.isEntryInProgress(item)) state.progress[key] = item;
    else delete state.progress[key];
    App.saveViews();
  },
};