/*
   PanelUI: a game of free placement. Cards lie in a start area and in four
   areas and can be dropped anywhere inside any of them: a loose classification
   on any grounds. Persistent state is owned by ViewState/PanelState and is only
   the area of a card (or that it was removed). Dragging is done by DragDrop in
   its free mode, which reports a drop with the position inside the area.
   What the Panel shares with the Board (the open card, the sides, the legend)
   lives in CardZones; here stays what is specific to free placement.

   Differences from the Board that are on purpose:
     - the position of a card inside its area is not progress; it is kept in
       the component and is lost on a reload;
     - a card that is closed again shows its default side: the turned side is
       kept only while the card is open (expanded.sideIndex);
     - an area can be zoomed (focus) to get room for arranging;
     - clearing an area removes its cards, like the cross of a card does.

   Component state that is not persisted (dropped by rebuild(): on a view,
   source or selection change, on a new card mode and on a reset):
     entries, sideOrders, expanded, lineExpanded, infoOpen - as in CardZones;
                  expanded also carries sideIndex, the side the open card is
                  turned to
     positions  - { [entryId]: { x, y, z } } place of a card inside its area and
                  its stacking order (the last dropped is on top)
     sizes      - { [area]: height } height an area has to keep once its cards
                  lie freely, because they no longer fill it
     focused    - { zone, height, top, bottom } the zoomed area, or null.
                  Measured once at the tap, like the position of an open card.

   Cards first flow in their areas, the way they do in the Board, and the
   arrange button returns them there. Free positions are taken from that flow:
   settle() reads where the browser put the cards, remembers it in positions and
   sizes, and the next render lays the cards out absolutely. This is the one
   place where a render reads the layout; it happens only for cards that have
   no position yet, so the render stays a function of the state.
*/
const PanelUI = {
  ...CardZones.methods,

  name: 'PanelUI',
  viewName: 'panel',
  viewLabel: 'P',
  kind: PanelState,

  selectors: {
    root: '#panelView',
    containerEl: '#panelContainer',
    zonesOuterEl: '#panelZonesOuter',
    arrangeEl: '#panelArrange',
    counterEl: '#panelSourceCount',
    zonesss: '#panelView [data-drop-zone]',
    expandedEl: '#panelExpanded',
    legendEl: '#panelLegend',
  },

  events: {
    click: {
      '#panelView .cardTapZone': 'expandCard',
      '@expandedEl': 'collapseCard',
      ...CardZones.overlayClicks('#panelExpanded'),
      '@arrangeEl': 'arrange',
      '#panelView .zoneClear': 'clearZone',
      '#panelView .zoneFocus': 'toggleFocus',
    },
  },

  entries: {},
  sideOrders: {},
  expanded: null,
  lineExpanded: false,
  infoOpen: false,
  positions: {},
  sizes: {},
  focused: null,

  init() {
    this.ensureMarkup();
    Bus.batchedMethod(this, 'render');
    Bus.on(Bus.events.viewChanged, () => this.rebuild());
    Bus.on(Bus.events.sourceSelected, () => this.rebuild());
    Bus.on(Bus.events.sourcesChanged, () => this.rebuild());
    Bus.on(Bus.events.selectionChanged, ({ sourceId }) => {
      if(sourceId === App.currentSource) this.rebuild();
    });
    Bus.on(Bus.events.viewsChanged, ({ viewName }) => {
      if(viewName === this.viewName) this.render();
    });
    Bus.on(Bus.events.dragDropped, payload => {
      if(payload.scope === this.viewName) this.dropCard(payload);
    });
    window.addEventListener('resize', () => {
      this.fitToViewport(this.dom.zonesOuterEl);
    });
    DropdownUI.on('panelCardMode', mode => this.changeMode(mode));
    DropdownUI.on('panelActions', action => {
      if(action === 'reset') this.reset();
    });
  },

  ensureMarkup() {
    if(this.dom?.root) return;
    const html = `
      <div id="panelView" class="appView hidden" data-drag-scope="panel">
        <div id="panelToolbar">
          ${DropdownUI.select({
            id: 'panelCardMode',
            items: [
              { value: 'original', label: 'original' },
              { value: 'random', label: 'random' },
              { value: 'expression', label: 'expression' },
              { value: 'meaning', label: 'meaning' },
              { value: 'example', label: 'examples' },
              { value: 'example_translation', label: "examples' translations" },
            ],
            cls: 'panelCardModeButton',
          })}
          <div id="panelSourceCount" class="tag"></div>
          <button id="panelArrange" type="button" aria-label="Arrange cards">⟳</button>
          ${DropdownUI.burger({
            id: 'panelActions',
            //cls: 'v2',
            items: [
              { value: 'reset', label: 'Reset' },
            ],
          })}
        </div>
        <div id="panelContainer" data-drag-scroll>
          <div id="panelSourceOuter" data-drag-scroll>
            <div id="panelSource" class="panelZone"
              data-drop-zone="source"
              data-drop-mode="free"
              ></div>
          </div>
          <div id="panelZonesOuter" data-drag-scroll>
            <div id="panelZones">
              ${PanelState.zones.map(zone => `
              <div class="panelSlot">
                <div class="panelZone"
                  data-drop-zone="${Utils.escapeHtml(zone)}"
                  data-drop-mode="free"
                  ></div>
              </div>`).join('')}
            </div>
          </div>
          <div id="panelLegend"></div>
        </div>
        <div id="panelExpanded" class="hidden"></div>
      </div>
      `;
    document.querySelector('#appBody').insertAdjacentHTML('beforeend', html);
    Utils.cacheComponentDom(this);
  },

  // ---- state -----------------------------------------------------------------------

  /*
     The turned side lives only in the open card: a card that is closed again
     goes back to its default side.
  */
  sideIndexOf(entryId) {
    return this.expanded?.id === entryId ? this.expanded.sideIndex : undefined;
  },

  rememberSide(sourceId, entryId, index) {
    if(this.expanded?.id === entryId) this.expanded.sideIndex = index;
  },

  /*
     Where the cards lie depends on the cards that are shown, so any rebuild
     starts from the flow again.
  */
  resetLayoutState() {
    this.positions = {};
    this.sizes = {};
    this.focused = null;
  },

  // ---- view model ------------------------------------------------------------------

  /*
     The only place that reads domain state for the panel. Pure over the
     component state (layout, entries, sideOrders, positions, ...) and ui.
  */
  viewModel(ui) {
    const cardsOf = list => list.map(entry => this.cardViewModel(entry, ui));
    const zones = {
      source: { controls: false, focused: false, cards: cardsOf(this.layout.source || []) },
    };
    PanelState.zones.forEach(zone => {
      zones[zone] = {
        controls: true,
        focused: this.focused?.zone === zone,
        cards: cardsOf(this.layout.zones[zone] || []),
      };
    });
    const open = this.expanded ? this.entries[this.expanded.id] : null;
    return {
      visible: App.currentView === this.viewName,
      mode: ui.mode,
      sourceCount: String(zones.source.cards.length),
      zones,
      focus: this.focused,
      sizes: this.sizes,
      expanded: open ? this.cardViewModel(open, ui, true) : null,
      legend: this.legendTags(),
    };
  },

  // A card in an area lies where it was put; the open card lies in the overlay.
  cardViewModel(entry, ui, asExpanded = false) {
    const card = CardZones.methods.cardViewModel.call(this, entry, ui, asExpanded);
    card.place = asExpanded ? null : (this.positions[entry.id] || null);
    return card;
  },

  // ---- markup ----------------------------------------------------------------------

  /*
     The content of one area. A card has exactly one source of markup: CardUI.
     The clear button is hidden while the area is zoomed: the focus button is the
     only way out then.
  */
  template(zone) {
    return `
      ${zone.controls ? `
      <div class="zoneFocus" role="button" aria-label="Zoom the area"></div>
      ${zone.focused ? '' : `
      <div class="zoneClear" role="button" aria-label="Clear the area">x</div>`}` : ''}
      ${zone.cards.map(card => CardUI.template(card)).join('')}
      `;
  },

  // ---- rendering -------------------------------------------------------------------

  render() {
    this.loadLayout();
    const ui = this.persistedUi();
    this.resolveSideOrders(Object.values(this.entries), ui);
    const vm = this.viewModel(ui);

    this.dom.root.classList.toggle('hidden', !vm.visible);
    this.dom.zonesss.forEach(zoneEl => this.renderZone(zoneEl, vm));
    this.dom.expandedEl.classList.toggle('hidden', !vm.expanded);
    this.dom.expandedEl.innerHTML = vm.expanded ? CardUI.template(vm.expanded) : '';
    this.dom.legendEl.innerHTML = vm.legend.length ? CardUI.legendTemplate(vm.legend) : '';
    this.dom.counterEl.textContent = vm.sourceCount;
    DropdownUI.setValue('panelCardMode', vm.mode);
    this.fitToViewport(this.dom.zonesOuterEl, vm.visible);
    if(this.settle(vm)) this.render();
  },

  /*
     An area keeps its place in the layout while it is zoomed (it is taken out of
     the flow then), so the height of the place is reserved on its slot.
  */
  renderZone(zoneEl, vm) {
    const name = zoneEl.dataset.dropZone;
    const zone = vm.zones[name];
    const focus = zone.focused ? vm.focus : null;
    zoneEl.innerHTML = this.template(zone);
    zoneEl.classList.toggle('focused', zone.focused);
    zoneEl.style.top = focus && focus.top != null ? `${focus.top}px` : '';
    zoneEl.style.bottom = focus && focus.bottom != null ? `${focus.bottom}px` : '';
    zoneEl.style.height = focus ? `${focus.height}px` : '';
    this.slotOf(zoneEl).style.minHeight = vm.sizes[name] ? `${vm.sizes[name]}px` : '';
  },

  slotOf(zoneEl) {
    return zoneEl.closest('.panelSlot') || zoneEl;
  },

  /*
     Layout measurement, the allowed DOM exception. Cards that have no position
     yet are in the flow of their area; where the browser put them becomes their
     position, and the height of the area is kept, because the cards leave the
     flow and would no longer fill it. Returns true when something was measured,
     then the caller renders again, now with every card placed. A hidden View has
     no geometry and measures nothing.
  */
  settle(vm) {
    if(!vm.visible) return false;
    let measured = false;
    this.dom.zonesss.forEach(zoneEl => {
      const name = zoneEl.dataset.dropZone;
      const loose = vm.zones[name].cards.filter(card => !card.place);
      if(!loose.length) return;
      measured = true;
      this.sizes[name] = this.slotOf(zoneEl).offsetHeight;
      loose.forEach(card => {
        const cardEl = zoneEl.querySelector(`.entryCard[data-entry-id="${card.id}"]`);
        this.positions[card.id] = {
          x: cardEl ? cardEl.offsetLeft : 0,
          y: cardEl ? cardEl.offsetTop : 0,
          z: 0,
        };
      });
    });
    return measured;
  },


  // ---- handlers (clean: change state or domain, then render) -----------------------

  changeMode(mode) {
    const sourceId = this.loadedSource();
    if(!sourceId) return;
    PanelState.setMode(sourceId, mode);
    this.rebuild();
  },

  // Every card goes back into the flow of its area; the areas are not changed.
  arrange() {
    this.resetLayoutState();
    this.closeCard();
    this.render();
  },

  reset() {
    const sourceId = this.loadedSource();
    if(!sourceId) return;
    const ids = App.selectedEntries(sourceId).map(entry => entry.id);
    const kept = ViewState.countInProgressOutside(sourceId, this.viewName, ids);
    Prompt.ask({
      text: `Really reset the Panel?${kept ? ` ${kept} entries in other sections keep their progress.` : ''}`,
      onConfirm: () => this.doReset(),
    });
  },

  doReset() {
    const sourceId = this.loadedSource();
    if(!sourceId) return;
    const ids = App.selectedEntries(sourceId).map(entry => entry.id);
    ViewState.resetEntries(sourceId, this.viewName, ids, PanelState.defaultUi());
    this.rebuild();
  },

  /*
     DragDrop reports ids as strings. "source" is not one of the areas: it means
     the card goes back to the start area. The dropped card goes on top of all.
  */
  dropCard({ id, zone, x, y }) {
    const sourceId = this.loadedSource();
    if(!sourceId) return;
    const entryId = Number(id);
    const top = Object.values(this.positions).reduce((max, place) => Math.max(max, place.z), 0);
    this.positions[entryId] = { x, y, z: top + 1 };
    PanelState.move(sourceId, entryId, PanelState.zones.includes(zone) ? zone : null);
  },

  /*
     The cards of the area are removed, as if each one was removed by its own
     cross, so they do not return to the start area. It asks first: it is a
     mass action.
  */
  clearZone(el) {
    const sourceId = this.loadedSource();
    const zoneEl = el.closest('[data-drop-zone]');
    if(!sourceId || !zoneEl) return;
    const ids = (this.layout.zones[zoneEl.dataset.dropZone] || []).map(entry => entry.id);
    if(!ids.length) return;
    Prompt.ask({
      text: 'Clear the box?',
      onConfirm: () => PanelState.removeEntries(sourceId, ids),
    });
  },

  /*
     The area is zoomed to twice its height, anchored to the edge of the screen
     it is nearest to, so there is room to arrange cards. Measured here, once,
     like the position of an open card. Leaving the zoom returns the cards of the
     area to the flow: they could lie outside the smaller area.
  */
  toggleFocus(el) {
    const zoneEl = el.closest('[data-drop-zone]');
    if(!zoneEl) return;
    const zone = zoneEl.dataset.dropZone;
    if(this.focused) {
      if(this.focused.zone === zone) this.unfocus();
      return;
    }
    const rect = this.slotOf(zoneEl).getBoundingClientRect();
    const atTop = PanelState.zones.indexOf(zone) < 2;
    this.closeCard();
    // The zoomed area leaves the flow, so its slot must keep the height.
    if(!this.sizes[zone]) this.sizes[zone] = Math.round(rect.height);
    this.focused = {
      zone,
      height: Math.round(rect.height * 2),
      top: atTop ? Math.round(rect.top - 5) : null,
      bottom: atTop ? null : Math.round(window.innerHeight - rect.bottom),
    };
    this.render();
  },

  unfocus() {
    const zone = this.focused.zone;
    (this.layout.zones[zone] || []).forEach(entry => { delete this.positions[entry.id]; });
    delete this.sizes[zone];
    this.focused = null;
    this.render();
  },
};

Components.push(PanelUI);

