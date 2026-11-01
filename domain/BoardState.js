/*
   BoardState: Board-specific progress rules. Owns the shape
     progress[entryId] = { zone, order, removed }
   and registers it as a view kind so generic code (Progress) never needs to
   know it. An entry is in progress when it sits in a column or was removed.
  
   Zones are the three review columns (failed / learn / good). Entries that are
   in no zone stay in the source area. `order` is the position inside a zone; it
   is renumbered 1..n on every move, so it never degenerates.
   Columns carry no automation: they are only places to put cards.
  
   The order of the source area is not progress: it is kept in ui.sourceOrder,
   so that arranging cards there never makes a board session. It is only a hint
   for layout(): ids that are not shown (removed, in a column, outside the
   selection) are ignored, shown cards that it does not list follow in file
   order. move() rewrites it from what is shown, so stale ids drop out by
   themselves and removeEntry() has nothing to clean. It is forgotten when the
   selection changes (resetSourceOrder) and on a reset (ui is replaced).
*/
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
      sourceOrder: [],
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
      sourceOrder: (ui.sourceOrder || defaults.sourceOrder).slice(),
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

    const rank = new Map(this.uiOf(sourceId).sourceOrder.map((id, i) => [id, i]));
    const arranged = result.source
      .filter(entry => rank.has(entry.id))
      .sort((a, b) => rank.get(a.id) - rank.get(b.id));
    const rest = result.source.filter(entry => !rank.has(entry.id));
    result.source = [...arranged, ...rest];
    return result;
  },

  // Put an entry into a zone before another entry of that zone (or to the end).
  // zone === null returns it to the source area, before another card of the
  // source area (or to the end) - this is also how cards are rearranged there.
  // Every card of the zone is renumbered, including cards outside the current
  // selection, so their relative order is kept.
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
      const shown = this.layout(sourceId).source
        .map(entry => entry.id)
        .filter(id => id !== entryId);
      const at = beforeId == null ? -1 : shown.indexOf(beforeId);
      if(at < 0) shown.push(entryId);
      else shown.splice(at, 0, entryId);
      // No event here: setEntries below saves again and announces the change.
      ViewState.setUi(sourceId, this.viewName, { sourceOrder: shown });

      delete moving.zone;
      delete moving.order;
      changes[entryId] = moving;
    }
    ViewState.setEntries(sourceId, this.viewName, changes);
  },

  // The arrangement of the source area belongs to one selection. Does not write
  // when there is nothing to forget, and does not emit: the caller re-renders.
  resetSourceOrder(sourceId) {
    const state = ViewState.get(sourceId, this.viewName);
    if(!state.ui.sourceOrder?.length) return;
    ViewState.setUi(sourceId, this.viewName, { sourceOrder: [] });
  },

  // Removing wins over any place in a column.
  removeEntry(sourceId, entryId) {
    ViewState.setEntry(sourceId, this.viewName, entryId, { removed: true });
  },

  // The entry left the list for good: no ui reference to its id may stay.
  forgetEntryInUi(ui, entryId) {
    if(Array.isArray(ui.sourceOrder)) ui.sourceOrder = ui.sourceOrder.filter(id => id !== entryId);
    if(ui.sideIndexes) delete ui.sideIndexes[entryId];
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
