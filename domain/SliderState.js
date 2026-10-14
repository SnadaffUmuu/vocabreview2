// SliderState: Slider-specific progress rules. Owns the shape
//   progress[entryId] = { hits: [sideIndex], lapses: [sideIndex], removed }
// and registers it as a view kind so generic code (Progress) never needs to
// know it. Only study marks count as progress; card rotation and position don't.
const SliderState = {

  viewName: 'slider',
  label: 'S',

  isEntryInProgress(item) {
    return !!(item && (
      item.removed
      || Array.isArray(item.hits) && item.hits.length
      || Array.isArray(item.lapses) && item.lapses.length
    ));
  },

  // Toggle a hit/lapse on one side. Returns true when the mark was set.
  toggleSideMark(originId, entryId, mark, sideIndex) {
    const item = Object.assign({}, ViewState.entry(originId, this.viewName, entryId));
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

    ViewState.setEntry(originId, this.viewName, entryId, item);
    return active;
  },

  removeEntry(originId, entryId) {
    const item = Object.assign({}, ViewState.entry(originId, this.viewName, entryId));
    item.removed = true;
    delete item.hits;
    delete item.lapses;
    ViewState.setEntry(originId, this.viewName, entryId, item);
  },

  // Remember which side is open. Not progress, so no event and no mark.
  setSideIndex(originId, entryId, sideIndex) {
    const state = ViewState.get(originId, this.viewName);
    const sideIndexes = Object.assign({}, state.ui.sideIndexes || {}, {
      [entryId]: sideIndex,
    });
    ViewState.setUi(originId, this.viewName, { sideIndexes });
  },

  // Selection changes reset navigation only, exactly as Slider v1 did. Review
  // marks and removed entries stay available when the old scope is restored.
  resetNavigation(originId) {
    const state = ViewState.get(originId, this.viewName);
    delete state.ui.order;
    delete state.ui.currentEntryId;
    delete state.ui.sideIndexes;
    App.saveViews();
  },
};

ViewState.registerKind(SliderState.viewName, SliderState);
