/*
   BoardUI: cards that are dragged from the source area into three review
   columns. Persistent state is owned by ViewState/BoardState; the DOM is only
   a projection of it. Dragging itself is done by DragDrop, which reports a drop
   through Bus; this component then changes BoardState and re-renders.
   What the Board shares with the Panel (the open card, the sides, the legend)
   lives in CardZones; here stays what is specific to three ordered columns.
  
   Component state that is not persisted (dropped by rebuild(): on a view,
   source or selection change and on actions that rebuild the cards):
     entries      - { [entryId]: entry } of the cards on the board
     sideOrders   - { [entryId]: lines } order of the sides of a card. It can be
                    random, so it is resolved once and then reused.
     expanded     - { id, top, width, height } the card opened with its actions,
                    or null. top is where the card was in the viewport when it
                    was tapped; width and height are the size of its place in
                    the zone, frozen at that moment.
     lineExpanded - the open card shows its whole side, not a clamped one
     infoOpen     - the open card shows its info
  
   The open card is drawn by the same template in a fixed overlay, and its place
   in the zone is only hidden and keeps the frozen size, so the layout does not
   jump when the open card rotates to a side of another size.
  
   Legend: the columns are stretched to the visible height of the board, so the
   legend (and nothing else) is just below the screen and is reached by scroll.
   The height depends on where the columns start, which depends on the number of
   cards in the source area, so it is measured after every render (fitToViewport).
*/
const BoardUI = {
  ...CardZones.methods,

  name: 'BoardUI',
  viewName: 'board',
  viewLabel: 'B',
  kind: BoardState,

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
      ...CardZones.overlayClicks('#boardExpanded'),
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
    window.addEventListener('resize', () => this.fitToViewport(this.dom.colsOuterEl));
    DropdownUI.on('boardCardMode', mode => this.changeMode(mode));
    DropdownUI.on('boardActions', action => {
      if(action === 'reset') this.reset();
    });
  },

  ensureMarkup() {
    if(this.dom?.root) return;
    const html = `
      <div id="boardView" class="appView hidden" data-drag-scope="board">
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
            //cls: 'v2',
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

  // The side of a card is part of the persisted ui of the Board.
  sideIndexOf(entryId, ui) {
    return ui.sideIndexes[entryId];
  },

  rememberSide(sourceId, entryId, index) {
    BoardState.setSideIndex(sourceId, entryId, index);
  },

  // ---- view model ------------------------------------------------------------------

  /*
     The only place that reads domain state for the board. Pure over the
     component state (layout, entries, sideOrders, expanded, ...) and ui.
  */
  viewModel(ui) {
    const cardsOf = list => list.map(entry => this.cardViewModel(entry, ui));
    const zones = {
      source: cardsOf(this.layout.source || []),
    };
    BoardState.zones.forEach(zone => {
      zones[zone] = cardsOf(this.layout.zones[zone] || []);
    });
    const open = this.expanded ? this.entries[this.expanded.id] : null;
    return {
      visible: App.currentView === this.viewName,
      mode: ui.mode,
      markReversed: ui.markReversed,
      sourceCount: String(zones.source.length),
      zones,
      expanded: open ? this.cardViewModel(open, ui, true) : null,
      legend: this.legendTags(),
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
    this.fitToViewport(this.dom.colsOuterEl, vm.visible);
  },

  // ---- handlers (clean: change state or domain, then render) -----------------------

  changeMode(mode) {
    const sourceId = this.loadedSource();
    if(!sourceId) return;
    BoardState.setMode(sourceId, mode);
    this.rebuild();
  },

  changeReversed(el) {
    const sourceId = this.loadedSource();
    if(!sourceId) return;
    ViewState.setUi(sourceId, this.viewName, { markReversed: el.checked }, true);
  },

  reset() {
    const sourceId = this.loadedSource();
    if(!sourceId) return;
    const ids = App.selectedEntries(sourceId).map(entry => entry.id);
    const kept = ViewState.countInProgressOutside(sourceId, this.viewName, ids);
    Prompt.ask({
      text: `Really reset the Board?${kept ? ` ${kept} entries in other sections keep their progress.` : ''}`,
      onConfirm: () => this.doReset(),
    });
  },

  doReset() {
    const sourceId = this.loadedSource();
    if(!sourceId) return;
    const ids = App.selectedEntries(sourceId).map(entry => entry.id);
    ViewState.resetEntries(sourceId, this.viewName, ids, BoardState.defaultUi());
    this.rebuild();
  },

  /*
     DragDrop reports ids as strings. "source" is not a column: it means the
     card goes back to the source area.
  */
  dropCard({ id, zone, beforeId }) {
    const sourceId = this.loadedSource();
    if(!sourceId) return;
    BoardState.move(
      sourceId,
      Number(id),
      BoardState.zones.includes(zone) ? zone : null,
      beforeId == null ? null : Number(beforeId),
    );
  },
};

Components.push(BoardUI);
