/*
   TableUI: a table of the shown entries, one row per entry, one column per role
   of the lines (expression, meaning, ...). A column can be hidden to guess what
   it holds and each cell can be opened by a tap; rows and columns are dragged to
   change their order. Persistent state is owned by ViewState/TableState (which
   also tells what is progress and what is only the setup of the work area); the
   DOM is only a projection of it. Dragging is done by DragDrop, which reports a
   drop through Bus; this component then changes TableState.

   Component state that is not persisted (dropped by rebuild(): on a view,
   source or selection change and on a reset):
     expandedRows - Set of entry ids whose cells are shown whole, not clamped
     resetScroll  - the next render starts from the top left corner

   The cells are not draggable: only rows (by the handle) and columns (by the
   head). Taps are matched by the exact target, as Events.js does, and on
   purpose: a tap on the text of a cell does nothing, so that it reaches the
   dictionary plugin the app is used with. A cell is toggled by a tap beside the
   text, the reading is spoken by the strip at the left edge of the line.

   Exception to a full render (see AGENTS.md): the scroll position of the table
   container is read before the table is rewritten and restored after it; every
   tap re-renders the whole table, and the user must stay where they are.
*/
const TableUI = {
  name: 'TableUI',
  viewName: 'table',
  viewLabel: 'T',

  // Titles of the columns, short enough for the head of a narrow column.
  labels: {
    expression: 'expression',
    meaning: 'meaning',
    reading: 'reading',
    example: 'examples',
    example_translation: 'translations',
    alt_reading: 'alt reading',
    info: 'info',
    unknown: 'other',
  },

  selectors: {
    root: '#tableView',
    hideOthersEl: '#tableHideOthers',
    zoomInEl: '#tableZoomIn',
    zoomOutEl: '#tableZoomOut',
    resetEl: '#tableReset',
    containerEl: '#tableContainer',
  },

  events: {
    change: {
      '@hideOthersEl': 'changeHideOthers',
    },
    click: {
      '@zoomInEl': 'zoomIn',
      '@zoomOutEl': 'zoomOut',
      '@resetEl': 'reset',
      '#tableView th .toggle': 'toggleColumn',
      '#tableView .cellLine': 'toggleCell',
      '#tableView .cellInner': 'toggleCell',
      '#tableView .speakme': 'speakCell',
      '#tableView .expand': 'toggleExpand',
      '#tableView .moveToTop': 'moveRowToTop',
      '#tableView .moveToBottom': 'moveRowToBottom',
      '#tableView .tableRemove': 'removeRow',
    },
  },

  expandedRows: new Set(),
  resetScroll: true,

  init() {
    this.ensureMarkup();
    Bus.batchedMethod(this, 'render');
    Bus.on(Bus.events.viewChanged, () => this.rebuild());
    Bus.on(Bus.events.sourceSelected, () => this.rebuild());
    Bus.on(Bus.events.sourcesChanged, () => this.rebuild());
    Bus.on(Bus.events.collectionsChanged, change => {
      if(Collections.isContentChange(change, App.currentSource)) this.rebuild();
    });
    Bus.on(Bus.events.selectionChanged, ({ sourceId }) => {
      if(sourceId === App.currentSource) this.rebuild();
    });
    Bus.on(Bus.events.viewsChanged, ({ viewName }) => {
      if(viewName === this.viewName) this.render();
    });
    Bus.on(Bus.events.dragDropped, payload => {
      if(payload.scope === this.viewName) this.dropped(payload);
    });
  },

  ensureMarkup() {
    if(this.dom?.root) return;
    const html = `
      <div id="tableView" class="appView hidden" data-drag-scope="table">
        <div id="tableActions">
          <label for="tableHideOthers">Hide others</label>
          <input type="checkbox" id="tableHideOthers">
          <button type="button" id="tableZoomIn">Zoom in</button>
          <button type="button" id="tableZoomOut">Zoom out</button>
          <button type="button" id="tableReset">Reset</button>
        </div>
        <div id="tableContainer" data-drag-scroll></div>
      </div>
      `;
    document.querySelector('#appBody').insertAdjacentHTML('beforeend', html);
    Utils.cacheComponentDom(this);
  },

  // ---- state -----------------------------------------------------------------------

  // The loaded current source, or null.
  loadedSource() {
    const sourceId = App.currentSource;
    return sourceId && Library.hasSource(sourceId) ? sourceId : null;
  },

  // Drops the non-persisted state and renders from scratch.
  rebuild() {
    this.expandedRows = new Set();
    this.resetScroll = true;
    this.render();
  },

  // ---- view model ------------------------------------------------------------------

  /*
    The only place that reads domain state for the table. Pure over the
    component state (expandedRows). Nothing is computed while the View is not
    the visible one: selection changes fire for every View.
  */
  viewModel() {
    const sourceId = this.loadedSource();
    const visible = App.currentView === this.viewName;
    const empty = {
      visible,
      hideOthers: TableState.defaultUi().hideOthers,
      zoom: 1,
      columns: [],
      rows: [],
      legend: [],
    };
    if(!visible || !sourceId) return empty;

    const ui = TableState.uiOf(sourceId);
    const { entries, columns } = TableState.layout(sourceId);
    const tags = new Set(entries.map(entry => entry.tag).filter(Boolean));
    return {
      visible,
      hideOthers: ui.hideOthers,
      zoom: ui.zoom,
      columns: columns.map(role => ({ role, label: this.labels[role] || role })),
      rows: entries.map(entry => this.rowViewModel(entry, columns, ui)),
      legend: Object.values(Parser.ENTRY_TAG).filter(tag => tags.has(tag)),
    };
  },

  rowViewModel(entry, columns, ui) {
    return {
      id: entry.id,
      tag: entry.tag,
      label: String(entry.lines[0]?.text || '').slice(0, 14),
      expanded: this.expandedRows.has(entry.id),
      cells: columns.map(role => this.cellViewModel(entry, role, ui)),
    };
  },

  cellViewModel(entry, role, ui) {
    const filled = TableState.hasContent(entry, role);
    return {
      role,
      filled,
      hidden: filled && TableState.isHidden(ui, entry.id, role),
      info: role === 'info' ? entry.info : null,
      lines: TableState.cellLines(entry, role).map(line => ({
        role: line.role,
        text: line.text,
        speakable: !!line.speakable,
        reviewLevel: entry.reviewLevel && line.originalIndex === 0 ? entry.reviewLevel : null,
      })),
    };
  },

  // ---- markup ----------------------------------------------------------------------

  template(vm) {
    if(!vm.rows.length) return '';
    return `
      ${this.tableTemplate(vm)}
      ${vm.legend.length ? CardUI.legendTemplate(vm.legend) : ''}
      `;
  },

  /*
    The table is the zone of the columns, its body the zone of the rows: a
    column can be dropped over any part of the table, a row only over the body.
    The scale is written only when it is not 1, so that the default table has no
    transform at all.
  */
  tableTemplate(vm) {
    const zoom = Number(vm.zoom) || 1;
    return `
      <table id="tableGrid"
        data-drop-zone="cols"
        data-drop-mode="cols"
        data-drop-accepts="col"
        ${zoom !== 1 ? `style="transform:scale(${zoom});transform-origin:top left"` : ''}
        >
        <thead>
          <tr>
            <th></th>
            ${vm.columns.map(column => this.headTemplate(column)).join('')}
            <th class="tableRemoveHead"></th>
          </tr>
        </thead>
        <tbody
          data-drop-zone="rows"
          data-drop-mode="rows"
          data-drop-accepts="row"
          >
          ${vm.rows.map(row => this.rowTemplate(row)).join('')}
        </tbody>
      </table>
      `;
  },

  headTemplate(column) {
    const role = Utils.escapeHtml(column.role);
    return `
      <th data-role="${role}"
        data-drag-id="${role}"
        data-drag-kind="col"
        data-drag-label="↔ ${Utils.escapeHtml(column.label)}"
        >
        <div class="colHead">
          <div class="drag">↔</div>
          <div class="colName">${Utils.escapeHtml(column.label)}</div>
        </div>
        <div class="toggle">toggle</div>
      </th>
      `;
  },

  rowTemplate(row) {
    const id = Utils.escapeHtml(row.id);
    return `
      <tr data-entry-id="${id}"
        data-drag-id="${id}"
        data-drag-kind="row"
        data-drag-handle=".rowDrag"
        data-drag-label="↕ ${Utils.escapeHtml(row.label)}"
        ${row.tag ? `data-tag="${Utils.escapeHtml(row.tag)}"` : ''}
        >
        <td>
          <div class="rowDrag">↕</div>
          <div class="moveToTop">↑</div><div class="moveToBottom">↓</div>
        </td>
        ${row.cells.map(cell => this.cellTemplate(cell, row.expanded)).join('')}
        <td class="tableRemoveCell">
          <div class="tableRemove" role="button" aria-label="Remove the row">✖</div>
        </td>
      </tr>
      `;
  },

  /*
    An empty cell is only a place: it has no ellipsis, no expand mark and no
    line, and a tap on it changes nothing (there is nothing to hide).
  */
  cellTemplate(cell, expanded) {
    const role = Utils.escapeHtml(cell.role);
    if(!cell.filled) {
      return `
        <td class="tableCell" data-role="${role}">
          <div class="cellInner"></div>
        </td>
        `;
    }
    return `
      <td class="tableCell ${cell.hidden ? 'cellHidden' : ''}" data-role="${role}">
        <div class="cellInner ${expanded ? '' : 'ellipsis'}">
          <div class="expand"></div>
          ${cell.info !== null ? this.infoTemplate(cell.info) : cell.lines.map(line => this.lineTemplate(line)).join('')}
        </div>
      </td>
      `;
  },

  infoTemplate(info) {
    return `
      <div class="cellLine">
        <span class="line-text">ⓘ&nbsp;${Utils.escapeHtml(info)}</span>
      </div>
      `;
  },

  // Inline content stays on the .line-text line on purpose: whitespace inside
  // it would change how the line looks.
  lineTemplate(line) {
    return `
      <div class="cellLine"
        ${line.role ? `data-role="${Utils.escapeHtml(line.role)}"` : ''}
        ${line.reviewLevel ? `data-review-level="${Utils.escapeHtml(line.reviewLevel)}"` : ''}
        >
        <span class="line-text">${line.speakable ? `<span class="speakme"
          data-reading="${Utils.escapeHtml(line.text)}"></span>` : ''}${Utils.escapeHtml(line.text)}</span>
      </div>
      `;
  },

  // ---- rendering -------------------------------------------------------------------

  render() {
    const vm = this.viewModel();
    const container = this.dom.containerEl;
    // The scroll position is read before the table is rewritten, see the header.
    const left = this.resetScroll ? 0 : container.scrollLeft;
    const top = this.resetScroll ? 0 : container.scrollTop;

    this.dom.root.classList.toggle('hidden', !vm.visible);
    this.dom.hideOthersEl.checked = vm.hideOthers;
    container.innerHTML = this.template(vm);
    container.scrollLeft = left;
    container.scrollTop = top;
    if(vm.visible) this.resetScroll = false;
  },

  // ---- handlers (clean: change state or domain, the domain announces it) -----------

  changeHideOthers(el) {
    const sourceId = this.loadedSource();
    if(!sourceId) return;
    TableState.setHideOthers(sourceId, el.checked);
  },

  zoomIn() {
    this.zoomBy(1);
  },

  zoomOut() {
    this.zoomBy(-1);
  },

  zoomBy(direction) {
    const sourceId = this.loadedSource();
    if(!sourceId) return;
    TableState.zoomBy(sourceId, direction);
  },

  /*
    Whether the cells are shown or hidden is decided by the state (and by the
    toolbar setting "hide others"), not by what the DOM looks like.
  */
  toggleColumn(el) {
    const sourceId = this.loadedSource();
    const head = el.closest('th');
    if(!sourceId || !head) return;
    const { hideOthers } = TableState.uiOf(sourceId);
    TableState.toggleColumn(sourceId, head.dataset.role, hideOthers);
  },

  toggleCell(el) {
    const sourceId = this.loadedSource();
    const cell = el.closest('td');
    const row = el.closest('tr');
    if(!sourceId || !cell || !row) return;
    TableState.toggleCell(sourceId, Number(row.dataset.entryId), cell.dataset.role);
  },

  speakCell(el) {
    Utils.speak(el.dataset.reading);
  },

  // The cells of the row show their whole text instead of a clamped one.
  toggleExpand(el) {
    const row = el.closest('tr');
    if(!row) return;
    const id = Number(row.dataset.entryId);
    if(this.expandedRows.has(id)) this.expandedRows.delete(id);
    else this.expandedRows.add(id);
    this.render();
  },

  moveRowToTop(el) {
    this.moveRowToEdge(el, true);
  },

  moveRowToBottom(el) {
    this.moveRowToEdge(el, false);
  },

  moveRowToEdge(el, toTop) {
    const sourceId = this.loadedSource();
    const row = el.closest('tr');
    if(!sourceId || !row) return;
    TableState.moveRowToEdge(sourceId, Number(row.dataset.entryId), toTop);
  },

  // No confirmation: removing a row is frequent and cheap, like removing a
  // card. It is only hidden in this View and returns on a reset.
  removeRow(el) {
    const sourceId = this.loadedSource();
    const row = el.closest('tr');
    if(!sourceId || !row) return;
    TableState.removeEntry(sourceId, Number(row.dataset.entryId));
  },

  reset() {
    const sourceId = this.loadedSource();
    if(!sourceId) return;
    const ids = App.selectedEntries(sourceId).map(entry => entry.id);
    const kept = ViewState.countInProgressOutside(sourceId, this.viewName, ids);
    Prompt.ask({
      text: `Reset table?${kept ? ` ${kept} entries in other sections keep their progress.` : ''}`,
      onConfirm: () => this.doReset(),
    });
  },

  doReset() {
    const sourceId = this.loadedSource();
    if(!sourceId) return;
    const ids = App.selectedEntries(sourceId).map(entry => entry.id);
    ViewState.resetEntries(sourceId, this.viewName, ids, TableState.uiAfterReset(sourceId));
    this.rebuild();
  },

  /*
    DragDrop reports ids as strings. A row goes before another row, a column
    before another column (null = to the end). A drop that changes nothing
    writes nothing, and the engine has not touched the DOM, so nothing is left
    to repair.
  */
  dropped({ id, zone, beforeId }) {
    const sourceId = this.loadedSource();
    if(!sourceId) return;
    if(zone === 'rows') {
      TableState.moveRow(sourceId, Number(id), beforeId == null ? null : Number(beforeId));
    } else if(zone === 'cols') {
      TableState.moveColumn(sourceId, id, beforeId);
    }
  },
};

Components.push(TableUI);
