/*
  PanelState: Panel-specific progress rules. Owns the shape
    progress[entryId] = { zone } | { removed }
  and registers it as a view kind so generic code (Progress) never needs to
  know it. An entry is in progress when it sits in one of the four areas or was
  removed.

  Unlike Board, the Panel is a game of free placement: only the area of a card
  is progress. Where exactly the card lies inside the area, and which side it
  was turned to, is not persisted (the View keeps it while the page lives), so
  there is no order here and no sideIndexes in ui.
*/
const PanelState = {

  viewName: 'panel',
  label: 'P',

  // In the order the areas are shown.
  zones: ['1', '2', '3', '4'],

  defaultUi() {
    return { mode: 'original' };
  },

  // Persisted ui with defaults applied. Reading never writes to the state.
  uiOf(sourceId) {
    const ui = ViewState.get(sourceId, this.viewName).ui;
    return { mode: ui.mode || this.defaultUi().mode };
  },

  isEntryInProgress(item) {
    return !!(item && (item.removed || this.zones.includes(item.zone)));
  },

  /*
     The selection split into the start area and the four areas, in file order.
     Removed entries are left out. Entries of other selections keep their place
     in the saved progress; they are simply not shown now.
  */
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
    return result;
  },

  // Put an entry into an area. zone === null returns it to the start area.
  move(sourceId, entryId, zone) {
    const item = this.zones.includes(zone) ? { zone } : null;
    ViewState.setEntry(sourceId, this.viewName, entryId, item);
  },

  // Removing wins over any place in an area.
  removeEntry(sourceId, entryId) {
    ViewState.setEntry(sourceId, this.viewName, entryId, { removed: true });
  },

  // Several entries at once (clearing an area): one save and one event.
  removeEntries(sourceId, entryIds) {
    const changes = {};
    entryIds.forEach(id => { changes[id] = { removed: true }; });
    ViewState.setEntries(sourceId, this.viewName, changes);
  },

  // A new card mode starts every card from its first side.
  setMode(sourceId, mode) {
    ViewState.setUi(sourceId, this.viewName, { mode });
  },
};

ViewState.registerKind(PanelState.viewName, PanelState);
