/*
  TableState: Table-specific rules. Owns the shape
    progress[entryId] = { revealed: [role], order, removed }
    ui = { hideOthers, zoom, hidden: { [entryId]: [role] }, colOrder: [role] }
  and registers it as a view kind so generic code (Progress) never needs to
  know it.

  What is progress and what is not. The Table is a game of guessing row by row:
  the user hides what must be guessed, opens a cell to check the guess and moves
  the guessed rows down and the missed ones up. Therefore a session is started
  by exactly these: a cell opened by the user (revealed), a row moved (order),
  a row removed. Hiding and showing cells or whole columns is the preparation of
  the work area, a setting, not progress: it lives in ui (hidden), is restored
  after a reload and never makes a session, nor does the order of the columns.

  A cell has three states: default (visible), hidden, revealed (opened by the
  user after being hidden). Showing a column only lifts "hidden"; "revealed" is
  written by a tap on a hidden cell alone.

  The order of the rows is numbered 1..n over every shown row on each move, like
  the order of a Board column. Rows without a number follow the numbered ones in
  file order.

  Columns are the roles of the lines found in the shown entries, plus "info"
  (the info text of an entry) and "unknown" (lines without a known role).
  Several lines of one role share a cell.
*/
const TableState = {

  viewName: 'table',
  label: 'T',

  // The default order of the columns.
  roles: [
    'expression',
    'meaning',
    'reading',
    'example',
    'example_translation',
    'alt_reading',
    'info',
    'unknown',
  ],

  zoomMin: 0.3,
  zoomMax: 2.5,
  zoomStep: 0.1,

  defaultUi() {
    return { hideOthers: true, zoom: 1, hidden: {}, colOrder: [] };
  },

  // Persisted ui with defaults applied. Reading never writes to the state.
  // The returned hidden and colOrder belong to the state: do not change them.
  uiOf(sourceId) {
    const ui = ViewState.get(sourceId, this.viewName).ui;
    const defaults = this.defaultUi();
    return {
      hideOthers: ui.hideOthers ?? defaults.hideOthers,
      zoom: Number.isFinite(ui.zoom) ? this.clampZoom(ui.zoom) : defaults.zoom,
      hidden: ui.hidden || defaults.hidden,
      colOrder: Array.isArray(ui.colOrder) ? ui.colOrder : defaults.colOrder,
    };
  },

  // What a reset of the table keeps: these are settings of the toolbar.
  uiAfterReset(sourceId) {
    const ui = this.uiOf(sourceId);
    return Object.assign(this.defaultUi(), { hideOthers: ui.hideOthers, zoom: ui.zoom });
  },

  // Only the order of the rows and the opened cells (and removal) are progress.
  isEntryInProgress(item) {
    return !!(item && (
      item.removed
      || typeof item.order === 'number'
      || Array.isArray(item.revealed) && item.revealed.length
    ));
  },

  clampZoom(zoom) {
    const clamped = Math.min(this.zoomMax, Math.max(this.zoomMin, zoom));
    return Math.round(clamped * 10) / 10;
  },

  // ---- pure rules over entries ---------------------------------------------------

  roleOf(line) {
    return this.roles.includes(line.role) ? line.role : 'unknown';
  },

  cellLines(entry, role) {
    if(role === 'info') return [];
    return entry.lines.filter(line => this.roleOf(line) === role);
  },

  hasContent(entry, role) {
    return role === 'info' ? !!entry.info : this.cellLines(entry, role).length > 0;
  },

  // Roles that have content in at least one of the entries, saved order first.
  columnsOf(entries, colOrder = []) {
    const present = this.roles.filter(role =>
      entries.some(entry => this.hasContent(entry, role)));
    const saved = colOrder.filter((role, i) =>
      present.includes(role) && colOrder.indexOf(role) === i);
    return saved.concat(present.filter(role => !saved.includes(role)));
  },

  // Numbered rows first, by their number; the rest in the order they came in.
  arrange(entries, progress) {
    const numbered = entries
      .filter(entry => typeof progress[entry.id]?.order === 'number')
      .sort((a, b) => progress[a.id].order - progress[b.id].order || a.id - b.id);
    const rest = entries.filter(entry => typeof progress[entry.id]?.order !== 'number');
    return numbered.concat(rest);
  },

  isHidden(ui, entryId, role) {
    return !!ui.hidden[entryId]?.includes(role);
  },

  // ---- domain reads --------------------------------------------------------------

  // The selection without removed entries, in the order of the table, and the
  // columns of these entries. Entries of other selections keep their place in
  // the saved progress; they are simply not shown now.
  layout(sourceId) {
    const progress = ViewState.get(sourceId, this.viewName).progress;
    const shown = App.selectedEntries(sourceId).filter(entry => !progress[entry.id]?.removed);
    const entries = this.arrange(shown, progress);
    return { entries, columns: this.columnsOf(entries, this.uiOf(sourceId).colOrder) };
  },

  // ---- rows ----------------------------------------------------------------------

  // Put a row before another row (or to the end) and number every shown row.
  // A move that changes nothing is not progress.
  moveRow(sourceId, entryId, beforeId = null) {
    const progress = ViewState.get(sourceId, this.viewName).progress;
    const ids = this.layout(sourceId).entries.map(entry => entry.id);
    if(!ids.includes(entryId)) return;

    const rest = ids.filter(id => id !== entryId);
    const at = beforeId == null ? -1 : rest.indexOf(beforeId);
    if(at < 0) rest.push(entryId);
    else rest.splice(at, 0, entryId);
    if(rest.every((id, i) => id === ids[i])) return;

    const changes = {};
    rest.forEach((id, i) => {
      changes[id] = Object.assign({}, progress[id], { order: i + 1 });
    });
    ViewState.setEntries(sourceId, this.viewName, changes);
  },

  // To the top or to the bottom of the table.
  moveRowToEdge(sourceId, entryId, toTop) {
    const ids = this.layout(sourceId).entries.map(entry => entry.id);
    this.moveRow(sourceId, entryId, toTop ? ids[0] : null);
  },

  removeEntry(sourceId, entryId) {
    ViewState.setEntry(sourceId, this.viewName, entryId, { removed: true });
  },

  // ---- columns -------------------------------------------------------------------

  // Put a column before another column (or to the end). Not progress.
  moveColumn(sourceId, role, beforeRole = null) {
    const columns = this.layout(sourceId).columns;
    if(!columns.includes(role)) return;

    const rest = columns.filter(item => item !== role);
    const at = beforeRole == null ? -1 : rest.indexOf(beforeRole);
    if(at < 0) rest.push(role);
    else rest.splice(at, 0, role);
    if(rest.every((item, i) => item === columns[i])) return;

    ViewState.setUi(sourceId, this.viewName, { colOrder: rest }, true);
  },

  // ---- cells ---------------------------------------------------------------------

  /*
    A tap on a cell. A hidden cell is opened: that is a guess checked, so it is
    progress. A visible cell (default or opened) is hidden again, and an opened
    mark it carried goes away.
  */
  toggleCell(sourceId, entryId, role) {
    const entry = this.layout(sourceId).entries.find(item => item.id === entryId);
    if(!entry || !this.hasContent(entry, role)) return;

    const ui = this.uiOf(sourceId);
    const hidden = this.copyHidden(ui.hidden);
    const items = {};
    if(this.isHidden(ui, entryId, role)) {
      this.unhide(hidden, entryId, role);
      this.reveal(sourceId, items, entryId, role);
    } else {
      this.hide(hidden, entryId, role);
      this.unreveal(sourceId, items, entryId, role);
    }
    this.commit(sourceId, { hidden }, items);
  },

  /*
    A tap on the head of a column. The cells it concerns are those of the column
    or, with "hide others", those of all the other columns. If any of them is
    visible they are all hidden (and their opened marks go away); otherwise they
    are all shown. Showing only lifts "hidden": the cells are not opened, so no
    progress is made.
  */
  toggleColumn(sourceId, role, hideOthers) {
    const { entries, columns } = this.layout(sourceId);
    const roles = hideOthers ? columns.filter(item => item !== role) : [role];
    const cells = [];
    entries.forEach(entry => roles.forEach(item => {
      if(this.hasContent(entry, item)) cells.push({ id: entry.id, role: item });
    }));
    if(!cells.length) return;

    const ui = this.uiOf(sourceId);
    const hidden = this.copyHidden(ui.hidden);
    const items = {};
    if(cells.some(cell => !this.isHidden(ui, cell.id, cell.role))) {
      cells.forEach(cell => {
        this.hide(hidden, cell.id, cell.role);
        this.unreveal(sourceId, items, cell.id, cell.role);
      });
    } else {
      cells.forEach(cell => this.unhide(hidden, cell.id, cell.role));
    }
    this.commit(sourceId, { hidden }, items);
  },

  copyHidden(hidden) {
    const copy = {};
    Object.keys(hidden).forEach(id => { copy[id] = hidden[id].slice(); });
    return copy;
  },

  hide(hidden, entryId, role) {
    const list = hidden[entryId] || [];
    if(!list.includes(role)) hidden[entryId] = list.concat(role);
  },

  unhide(hidden, entryId, role) {
    if(!hidden[entryId]) return;
    hidden[entryId] = hidden[entryId].filter(item => item !== role);
    if(!hidden[entryId].length) delete hidden[entryId];
  },

  // The new progress item of the entry is collected in items, not written yet.
  itemFor(sourceId, items, entryId) {
    if(!items[entryId]) {
      items[entryId] = Object.assign({}, ViewState.entry(sourceId, this.viewName, entryId));
    }
    return items[entryId];
  },

  reveal(sourceId, items, entryId, role) {
    const item = this.itemFor(sourceId, items, entryId);
    const list = Array.isArray(item.revealed) ? item.revealed : [];
    if(!list.includes(role)) item.revealed = list.concat(role);
  },

  unreveal(sourceId, items, entryId, role) {
    const current = ViewState.entry(sourceId, this.viewName, entryId);
    if(!current?.revealed?.includes(role)) return;
    const item = this.itemFor(sourceId, items, entryId);
    item.revealed = item.revealed.filter(value => value !== role);
    if(!item.revealed.length) delete item.revealed;
  },

  /*
    ui and progress are written together: two saves, but one announcement, so a
    View renders once. With no progress to change only the ui is written.
  */
  commit(sourceId, uiPatch, items) {
    if(Object.keys(items).length) {
      ViewState.setUi(sourceId, this.viewName, uiPatch);
      ViewState.setEntries(sourceId, this.viewName, items);
    } else {
      ViewState.setUi(sourceId, this.viewName, uiPatch, true);
    }
  },

  // ---- toolbar -------------------------------------------------------------------

  setHideOthers(sourceId, hideOthers) {
    ViewState.setUi(sourceId, this.viewName, { hideOthers: !!hideOthers }, true);
  },

  zoomBy(sourceId, direction) {
    const current = this.uiOf(sourceId).zoom;
    const zoom = this.clampZoom(current + direction * this.zoomStep);
    if(zoom === current) return;
    ViewState.setUi(sourceId, this.viewName, { zoom }, true);
  },

  // The entry left the list for good: no ui reference to its id may stay.
  forgetEntryInUi(ui, entryId) {
    if(ui.hidden) delete ui.hidden[entryId];
  },
};

ViewState.registerKind(TableState.viewName, TableState);
