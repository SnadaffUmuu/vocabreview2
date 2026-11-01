/*
   SliderState: Slider-specific progress rules. Owns the shape
     progress[entryId] = { hits: [sideIndex], lapses: [sideIndex], removed }
   and registers it as a view kind so generic code (Progress) never needs to
   know it. Only study marks count as progress; card rotation and position don't.
*/
const SliderState = {

  viewName: 'slider',
  label: 'S',

  // "Only matching" applies to these card modes only: an entry matches when it
  // has a line with the role of the mode.
  compatibleMatchingModes: ['meaning', 'example', 'example_translation'],

  defaultUi() {
    return {
      mode: 'original',
      onlyMatching: false,
      random: false,
      order: [],
      sideIndexes: {},
      currentEntryId: null,
    };
  },

  // Persisted ui with defaults applied. Reading never writes to the state.
  uiOf(sourceId) {
    const ui = ViewState.get(sourceId, this.viewName).ui;
    const defaults = this.defaultUi();
    return {
      mode: ui.mode || defaults.mode,
      onlyMatching: !!ui.onlyMatching,
      random: !!ui.random,
      order: Array.isArray(ui.order) ? ui.order : defaults.order,
      sideIndexes: ui.sideIndexes || defaults.sideIndexes,
      currentEntryId: ui.currentEntryId ?? defaults.currentEntryId,
    };
  },

  // Entries the slider shows, in slide order: selection minus removed entries,
  // narrowed by "only matching", in the stored random order when "random" is on.
  // The random order is kept in ui.order and only extended/trimmed to follow
  // the entries, so it is stable between calls.
  visibleEntries(sourceId) {
    const progress = ViewState.get(sourceId, this.viewName).progress;
    const ui = this.uiOf(sourceId);
    let entries = App.selectedEntries(sourceId).filter(entry =>
      !progress[entry.id]?.removed);

    if(ui.onlyMatching && this.compatibleMatchingModes.includes(ui.mode)) {
      entries = entries.filter(entry => entry.lines.some(line => line.role === ui.mode));
    }

    if(ui.random) {
      const ids = entries.map(entry => entry.id);
      const known = ui.order.filter(id => ids.includes(id));
      const missing = ids.filter(id => !known.includes(id));
      const order = known.length ? known.concat(Utils.shuffle(missing)) : Utils.shuffle(ids);
      if(order.length !== ui.order.length || order.some((id, i) => id !== ui.order[i])) {
        ViewState.setUi(sourceId, this.viewName, { order });
      }
      const byId = Object.fromEntries(entries.map(entry => [entry.id, entry]));
      entries = order.map(id => byId[id]).filter(Boolean);
    }
    return entries;
  },

  // A new card mode starts every card from its first side.
  setMode(sourceId, mode) {
    ViewState.setUi(sourceId, this.viewName, { mode, sideIndexes: {} });
  },

  isEntryInProgress(item) {
    return !!(item && (
      item.removed
      || Array.isArray(item.hits) && item.hits.length
      || Array.isArray(item.lapses) && item.lapses.length
    ));
  },

  // Toggle a hit/lapse on one side. Returns true when the mark was set.
  toggleSideMark(sourceId, entryId, mark, sideIndex) {
    const item = Object.assign({}, ViewState.entry(sourceId, this.viewName, entryId));
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

    ViewState.setEntry(sourceId, this.viewName, entryId, item);
    return active;
  },

  removeEntry(sourceId, entryId) {
    const item = Object.assign({}, ViewState.entry(sourceId, this.viewName, entryId));
    item.removed = true;
    delete item.hits;
    delete item.lapses;
    ViewState.setEntry(sourceId, this.viewName, entryId, item);
  },

  // Remember which side is open. Not progress, so no event and no mark.
  setSideIndex(sourceId, entryId, sideIndex) {
    const state = ViewState.get(sourceId, this.viewName);
    const sideIndexes = Object.assign({}, state.ui.sideIndexes || {}, {
      [entryId]: sideIndex,
    });
    ViewState.setUi(sourceId, this.viewName, { sideIndexes });
  },

  // The entry left the list for good: no ui reference to its id may stay.
  forgetEntryInUi(ui, entryId) {
    if(Array.isArray(ui.order)) ui.order = ui.order.filter(id => id !== entryId);
    if(ui.currentEntryId === entryId) ui.currentEntryId = null;
    if(ui.sideIndexes) delete ui.sideIndexes[entryId];
  },

  // Selection changes reset navigation only, exactly as Slider v1 did. Review
  // marks and removed entries stay available when the old scope is restored.
  resetNavigation(sourceId) {
    const state = ViewState.get(sourceId, this.viewName);
    delete state.ui.order;
    delete state.ui.currentEntryId;
    delete state.ui.sideIndexes;
    App.saveViews();
  },
};

ViewState.registerKind(SliderState.viewName, SliderState);
