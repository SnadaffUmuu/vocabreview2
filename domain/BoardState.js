// BoardState: Board-specific progress rules. Owns the shape
//   progress[entryId] = { zone, order, removed }
// and registers it as a view kind so generic code (Progress) never needs to
// know it. An entry is in progress when it sits in a column or was removed.
//
// Zones are the three review columns (failed / learn / good). Entries that are
// in no zone stay in the source area in file order. `order` is the position
// inside a zone; it is renumbered 1..n on every move, so it never degenerates.
// Columns carry no automation: they are only places to put cards.
const BoardState = {

  viewName: 'board',
  label: 'B',

  // In the order the columns are shown.
  zones: ['failed', 'learn', 'good'],

  defaultUi() {
    return {
      mode: 'original',
      markReversed: true,
      sideIndexes: {},
    };
  },

  // Persisted ui with defaults applied. Reading never writes to the state.
  // "R" is on unless the user switched it off.
  uiOf(sourceId) {
    const ui = ViewState.get(sourceId, this.viewName).ui;
    const defaults = this.defaultUi();
    return {
      mode: ui.mode || defaults.mode,
      markReversed: ui.markReversed ?? defaults.markReversed,
      sideIndexes: ui.sideIndexes || defaults.sideIndexes,
    };
  },

  isEntryInProgress(item) {
    return !!(item && (item.removed || this.zones.includes(item.zone)));
  },

  // The selection split into the source area and the columns. Removed entries
  // are left out. Entries of other selections keep their place in the saved
  // progress; they are simply not shown now.
  layout(sourceId) {
    const progress = ViewState.get(sourceId, this.viewName).progress;
    const result = { source: [], zones: {} };
    this.zones.forEach(zone => { result.zones[zone] = []; });

    App.selectedEntries(sourceId).forEach(entry => {
      const item = progress[entry.id];
      if(item?.removed) return;
      if(item && this.zones.includes(item.zone)) result.zones[item.zone].push(entry);
      else result.source.push(entry);
    });

    this.zones.forEach(zone => {
      result.zones[zone].sort((a, b) =>
        (progress[a.id].order ?? 0) - (progress[b.id].order ?? 0) || a.id - b.id);
    });
    return result;
  },

  // Put an entry into a zone before another entry of that zone (or to the end).
  // zone === null returns it to the source area. Every card of the zone is
  // renumbered, including cards outside the current selection, so their
  // relative order is kept.
  move(sourceId, entryId, zone, beforeId = null) {
    const progress = ViewState.get(sourceId, this.viewName).progress;
    const moving = Object.assign({}, progress[entryId]);
    const changes = {};

    if(zone && this.zones.includes(zone)) {
      const ids = Object.keys(progress)
        .filter(id => progress[id].zone === zone && !progress[id].removed && Number(id) !== entryId)
        .sort((a, b) => (progress[a].order ?? 0) - (progress[b].order ?? 0) || a - b)
        .map(Number);
      const at = beforeId == null ? -1 : ids.indexOf(beforeId);
      if(at < 0) ids.push(entryId);
      else ids.splice(at, 0, entryId);

      ids.forEach((id, i) => {
        const item = Object.assign({}, id === entryId ? moving : progress[id]);
        item.zone = zone;
        item.order = i + 1;
        changes[id] = item;
      });
    } else {
      delete moving.zone;
      delete moving.order;
      changes[entryId] = moving;
    }
    ViewState.setEntries(sourceId, this.viewName, changes);
  },

  // Removing wins over any place in a column.
  removeEntry(sourceId, entryId) {
    ViewState.setEntry(sourceId, this.viewName, entryId, { removed: true });
  },

  // A new card mode starts every card from its first side.
  setMode(sourceId, mode) {
    ViewState.setUi(sourceId, this.viewName, { mode, sideIndexes: {} });
  },

  // Remember which side is open. Not progress, so no event and no mark.
  setSideIndex(sourceId, entryId, sideIndex) {
    const state = ViewState.get(sourceId, this.viewName);
    const sideIndexes = Object.assign({}, state.ui.sideIndexes || {}, {
      [entryId]: sideIndex,
    });
    ViewState.setUi(sourceId, this.viewName, { sideIndexes });
  },
};

ViewState.registerKind(BoardState.viewName, BoardState);
