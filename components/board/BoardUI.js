// BoardUI: cards that are dragged from the source area into three review
// columns. Persistent state is owned by ViewState/BoardState; the DOM is only
// a projection of it. Dragging itself is done by DragDrop, which reports a drop
// through Bus; this component then changes BoardState and re-renders.
//
// Component state that is not persisted (dropped by rebuild(): on a view,
// source or selection change and on actions that rebuild the cards):
//   entries      - { [entryId]: entry } of the cards on the board
//   sideOrders   - { [entryId]: lines } order of the sides of a card. It can be
//                  random, so it is resolved once and then reused.
//   expanded     - { id, top, width, height } the card opened with its actions,
//                  or null. top is where the card was in the viewport when it
//                  was tapped; width and height are the size of its place in
//                  the zone, frozen at that moment.
//   lineExpanded - the open card shows its whole side, not a clamped one
//   infoOpen     - the open card shows its info
//
// The open card is drawn by the same template in a fixed overlay, and its place
// in the zone is only hidden and keeps the frozen size, so the layout does not
// jump when the open card rotates to a side of another size.
//
// Legend: the columns are stretched to the visible height of the board, so the
// legend (and nothing else) is just below the screen and is reached by scroll.
// The height depends on where the columns start, which depends on the number of
// cards in the source area, so it is measured after every render (fitColumns).
const BoardUI = {
  name: 'BoardUI',
  viewName: 'board',
  viewLabel: 'B',

  selectors: {
    root: '#boardView',
    containerEl: '#boardContainer',
    colsOuterEl: '#boardColsOuter',
    reversedEl: '#boardReversed',
    counterEl: '#boardSourceCount',
    zonesss: '#boardView [data-drop-zone]',
    expandedEl: '#boardExpanded',
    legendEl: '#boardLegend',
  },

  events: {
    change: {
      '@reversedEl': 'changeReversed',
    },
    click: {
      '#boardView .cardTapZone': 'expandCard',
      '@expandedEl': 'collapseCard',
      '#boardExpanded .cardSide': 'rotateSide',
      '#boardExpanded .cardRotateBack': 'rotateBack',
      '#boardExpanded .cardLineToggle': 'toggleLine',
      '#boardExpanded .cardInfoToggle': 'toggleInfo',
      '#boardExpanded .cardRemove': 'removeCard',
      '#boardExpanded .cardSpeak': 'speakSide',
      '#boardExpanded .cardReading': 'speakReading',
    },
  },

  entries: {},
  sideOrders: {},
  expanded: null,
  lineExpanded: false,
  infoOpen: false,

  init() {
    this.ensureMarkup();
    Bus.batchedMethod(this, 'render');
    Bus.on(Bus.events.viewChanged, () => this.rebuild());
    Bus.on(Bus.events.sourceSelected, () => this.rebuild());
    Bus.on(Bus.events.sourcesChanged, () => this.rebuild());
    Bus.on(Bus.events.selectionChanged, ({ sourceId }) => {
      BoardState.resetSourceOrder(sourceId);
      if(sourceId === App.currentSource) this.rebuild();
    });
    Bus.on(Bus.events.viewsChanged, ({ viewName }) => {
      if(viewName === this.viewName) this.render();
    });
    Bus.on(Bus.events.dragDropped, payload => {
      if(payload.scope === this.viewName) this.dropCard(payload);
    });
    window.addEventListener('resize', () => this.fitColumns());
    DropdownUI.on('boardCardMode', mode => this.changeMode(mode));
    DropdownUI.on('boardActions', action => {
      if(action === 'reset') this.reset();
    });
  },

  ensureMarkup() {
    if(this.dom?.root) return;
    const html = `
      <div id="boardView" class="appView" data-drag-scope="board">
        <div id="boardToolbar">
          ${DropdownUI.select({
            id: 'boardCardMode',
            items: [
              { value: 'original', label: 'original' },
              { value: 'random', label: 'random' },
              { value: 'expression', label: 'expression' },
              { value: 'meaning', label: 'meaning' },
              { value: 'example', label: 'examples' },
              { value: 'example_translation', label: "examples' translations" },
            ],
            cls: 'boardCardModeButton',
          })}
          <label>R <input type="checkbox" id="boardReversed"></label>
          <div id="boardSourceCount" class="tag"></div>
          ${DropdownUI.burger({
            id: 'boardActions',
            cls: 'v2',
            items: [
              { value: 'reset', label: 'Reset' },
            ],
          })}
        </div>
        <div id="boardContainer" data-drag-scroll>
          <div id="boardSourceOuter" data-drag-scroll>
            <div id="boardSource" class="boardZone" data-drop-zone="source"></div>
          </div>
          <div id="boardColsOuter" data-drag-scroll>
            <div id="boardCols">
              <div class="boardZone" data-drop-zone="failed"></div>
              <div class="boardZone" data-drop-zone="learn"></div>
              <div class="boardZone" data-drop-zone="good"></div>
            </div>
          </div>
          <div id="boardLegend"></div>
        </div>
        <div id="boardExpanded" class="hidden"></div>
      </div>
      `;
    document.querySelector('#appBody').insertAdjacentHTML('beforeend', html);
    Utils.cacheComponentDom(this);
  },

  // ---- state -----------------------------------------------------------------------

  // The loaded current source, or null.
  boardSource() {
    const sourceId = App.currentSource;
    return sourceId && Library.hasSource(sourceId) ? sourceId : null;
  },

  persistedUi() {
    const sourceId = this.boardSource();
    return sourceId ? BoardState.uiOf(sourceId) : BoardState.defaultUi();
  },

  // Drops the non-persisted card state and renders the board from scratch.
  rebuild() {
    this.sideOrders = {};
    this.closeCard();
    this.render();
  },

  closeCard() {
    this.expanded = null;
    this.lineExpanded = false;
    this.infoOpen = false;
  },

  // The random side order of a card is resolved once, here, so that
  // viewModel() and template() stay deterministic.
  resolveSideOrders(entries, ui) {
    entries.forEach(entry => {
      if(this.sideOrders[entry.id]) return;
      this.sideOrders[entry.id] = Cards.orderLines(
        Cards.sideLines(entry),
        ui.mode,
        ui.sideIndexes[entry.id],
      );
    });
  },

  // The cards on the board, only while the board is the visible view: selection
  // changes fire for every view.
  loadLayout() {
    const sourceId = this.boardSource();
    const active = App.currentView === this.viewName && sourceId;
    this.layout = active ? BoardState.layout(sourceId) : { source: [], zones: {} };
    this.entries = {};
    [this.layout.source, ...Object.values(this.layout.zones)].forEach(list =>
      list.forEach(entry => { this.entries[entry.id] = entry; }));
    if(this.expanded && !this.entries[this.expanded.id]) this.closeCard();
  },

  // ---- view model ------------------------------------------------------------------

  // The only place that reads domain state for the board. Pure over the
  // component state (layout, entries, sideOrders, expanded, ...) and ui.
  viewModel(ui) {
    const cardsOf = list => list.map(entry => this.cardViewModel(entry, ui));
    const zones = {
      source: cardsOf(this.layout.source || []),
    };
    BoardState.zones.forEach(zone => {
      zones[zone] = cardsOf(this.layout.zones[zone] || []);
    });
    const open = this.expanded ? this.entries[this.expanded.id] : null;
    const tags = new Set(Object.values(this.entries).map(entry => entry.tag).filter(Boolean));
    return {
      visible: App.currentView === this.viewName,
      mode: ui.mode,
      markReversed: ui.markReversed,
      sourceCount: String(zones.source.length),
      zones,
      expanded: open ? this.cardViewModel(open, ui, true) : null,
      legend: Object.values(Parser.ENTRY_TAG).filter(tag => tags.has(tag)),
    };
  },

  // asExpanded: the card drawn in the overlay. The same card in its zone only
  // keeps its place (covered).
  cardViewModel(entry, ui, asExpanded = false) {
    const order = this.sideOrders[entry.id] || [];
    const current = Cards.currentSide(order, ui.sideIndexes[entry.id]);
    const side = order.find(line => line.originalIndex === current);
    const reading = Cards.readingOf(entry);
    const isOpen = this.expanded?.id === entry.id;
    return {
      id: entry.id,
      tag: entry.tag,
      reviewLevel: entry.reviewLevel,
      reversed: ui.markReversed && !!entry.reversed,
      count: order.length,
      side: side ? {
        index: side.originalIndex,
        role: side.role,
        text: side.text,
        speakable: !!side.speakable,
        compact: !!side.isCompact || side.role === 'example',
      } : null,
      reading: reading ? reading.text : null,
      info: entry.info || null,
      infoOpen: asExpanded && this.infoOpen,
      draggable: !asExpanded,
      expanded: asExpanded,
      top: asExpanded ? this.expanded.top : 0,
      lineExpanded: asExpanded && this.lineExpanded,
      covered: !asExpanded && isOpen,
      size: !asExpanded && isOpen
        ? { width: this.expanded.width, height: this.expanded.height }
        : null,
    };
  },

  // ---- markup ----------------------------------------------------------------------

  // The content of one zone. A card has exactly one source of markup: CardUI.
  template(cards) {
    return cards.map(card => CardUI.template(card)).join('');
  },

  // ---- rendering -------------------------------------------------------------------

  render() {
    this.loadLayout();
    const ui = this.persistedUi();
    this.resolveSideOrders(Object.values(this.entries), ui);
    const vm = this.viewModel(ui);

    this.dom.root.classList.toggle('hidden', !vm.visible);
    this.dom.zonesss.forEach(zoneEl => {
      zoneEl.innerHTML = this.template(vm.zones[zoneEl.dataset.dropZone] || []);
    });
    this.dom.expandedEl.classList.toggle('hidden', !vm.expanded);
    this.dom.expandedEl.innerHTML = vm.expanded ? CardUI.template(vm.expanded) : '';
    this.dom.legendEl.innerHTML = vm.legend.length ? CardUI.legendTemplate(vm.legend) : '';
    this.dom.counterEl.textContent = vm.sourceCount;
    this.dom.reversedEl.checked = vm.markReversed;
    DropdownUI.setValue('boardCardMode', vm.mode);
    this.fitColumns(vm.visible);
  },

  // Layout measurement, the allowed DOM exception: the columns get the height
  // that is left of the visible board below the source area. It is the offset
  // of the columns inside the scrolling container, so it does not depend on the
  // current scroll position. The offset does not depend on the columns' own
  // height, so the old value is not reset before measuring (that could shrink
  // the scrollable area and lose the scroll position). A hidden board has no
  // geometry and gets no height.
  fitColumns(visible = App.currentView === this.viewName) {
    const container = this.dom.containerEl;
    const cols = this.dom.colsOuterEl;
    if(!visible) {
      cols.style.minHeight = '';
      return;
    }
    const offset = cols.getBoundingClientRect().top
      - container.getBoundingClientRect().top
      + container.scrollTop;
    cols.style.minHeight = `${Math.max(0, container.clientHeight - offset)}px`;
  },

  // ---- handlers (clean: change state or domain, then render) -----------------------

  changeMode(mode) {
    const sourceId = this.boardSource();
    if(!sourceId) return;
    BoardState.setMode(sourceId, mode);
    this.rebuild();
  },

  changeReversed(el) {
    const sourceId = this.boardSource();
    if(!sourceId) return;
    ViewState.setUi(sourceId, this.viewName, { markReversed: el.checked }, true);
  },

  reset() {
    if(!this.boardSource()) return;
    Prompt.ask({
      text: 'Really reset the Board?',
      onConfirm: () => this.doReset(),
    });
  },

  doReset() {
    const sourceId = this.boardSource();
    if(!sourceId) return;
    const ids = App.selectedEntries(sourceId).map(entry => entry.id);
    ViewState.resetEntries(sourceId, this.viewName, ids, BoardState.defaultUi());
    this.rebuild();
  },

  // DragDrop reports ids as strings. "source" is not a column: it means the
  // card goes back to the source area.
  dropCard({ id, zone, beforeId }) {
    const sourceId = this.boardSource();
    if(!sourceId) return;
    BoardState.move(
      sourceId,
      Number(id),
      BoardState.zones.includes(zone) ? zone : null,
      beforeId == null ? null : Number(beforeId),
    );
  },

  // The card is opened by its tap zone. Its viewport position and size are
  // measured here, once, and kept in the component state: they are not derived
  // from the domain, and the size of its place must stay as it was at the tap.
  expandCard(el) {
    const card = el.closest('.entryCard');
    if(!card) return;
    const rect = card.getBoundingClientRect();
    this.expanded = {
      id: Number(card.dataset.entryId),
      top: Math.max(0, Math.min(rect.top, window.innerHeight - 160)),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
    this.lineExpanded = true;
    this.infoOpen = false;
    this.render();
  },

  collapseCard() {
    this.closeCard();
    this.render();
  },

  rotateSide(el, e) {
    this.rotate(Cards.nextSideIndex, e);
  },

  rotateBack(el, e) {
    this.rotate(Cards.prevSideIndex, e);
  },

  rotate(step, e) {
    e.stopPropagation();
    const sourceId = this.boardSource();
    if(!sourceId || !this.expanded) return;
    const entryId = this.expanded.id;
    const order = this.sideOrders[entryId] || [];
    if(order.length < 2) return;
    const current = Cards.currentSide(order, this.persistedUi().sideIndexes[entryId]);
    const indexes = order.map(line => line.originalIndex);
    BoardState.setSideIndex(sourceId, entryId, step.call(Cards, indexes, current));
    this.render();
  },

  toggleLine() {
    this.lineExpanded = !this.lineExpanded;
    this.render();
  },

  toggleInfo() {
    this.infoOpen = !this.infoOpen;
    this.render();
  },

  // No confirmation: removing a card is frequent and cheap.
  removeCard() {
    const sourceId = this.boardSource();
    if(!sourceId || !this.expanded) return;
    const entryId = this.expanded.id;
    this.closeCard();
    BoardState.removeEntry(sourceId, entryId);
  },

  speakSide() {
    if(!this.expanded) return;
    const order = this.sideOrders[this.expanded.id] || [];
    const current = Cards.currentSide(order, this.persistedUi().sideIndexes[this.expanded.id]);
    const side = order.find(line => line.originalIndex === current);
    if(side?.speakable) Utils.speak(side.text);
  },

  speakReading(el) {
    Utils.speak(el.textContent.trim());
  },
};

Components.push(BoardUI);
