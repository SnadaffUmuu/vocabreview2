/*
   CardZones: behaviour shared by the Views that keep cards in drop zones and
   open one card in an overlay (Board, Panel). It is not a component: it has no
   init and is not registered. A View spreads CardZones.methods at the top of
   its own object, so Events.js and Bus still address the View itself, and the
   View may override any method.

   What the View must provide (this is where the Views differ):
     viewName, kind     - the name and the domain state object (BoardState ...)
                          with uiOf/defaultUi/layout/removeEntry
     dom.expandedEl     - the overlay of the open card
     sideOrders, entries, expanded, lineExpanded, infoOpen, layout
                        - component state, own to each View
     render()
     sideIndexOf(entryId, ui)
                        - the saved side of a card. Board keeps it in the
                          persisted ui; Panel only while the card is open,
                          so a closed card always shows its default side.
     rememberSide(sourceId, entryId, index)
     resetLayoutState() - optional: drops the View's own layout state on rebuild
     canAddToList       - optional: true when the open card offers "add to a list".
                          The View then handles the click of .cardAddToList itself.
                          In a list the card also offers "remove from the list"
                          (.cardRemoveFromList), handled by the View as well.
*/
const CardZones = {

  // Click map of the open card's overlay: one list for every View.
  overlayClicks(overlaySelector) {
    return {
      [`${overlaySelector} .cardSide`]: 'rotateSide',
      [`${overlaySelector} .cardRotateBack`]: 'rotateBack',
      [`${overlaySelector} .cardLineToggle`]: 'toggleLine',
      [`${overlaySelector} .cardInfoToggle`]: 'toggleInfo',
      [`${overlaySelector} .cardRemove`]: 'removeCard',
      [`${overlaySelector} .cardSpeak`]: 'speakSide',
      [`${overlaySelector} .cardReading`]: 'speakReading',
    };
  },

  methods: {

    // The loaded current source, or null.
    loadedSource() {
      const sourceId = App.currentSource;
      return sourceId && Library.hasSource(sourceId) ? sourceId : null;
    },

    persistedUi() {
      const sourceId = this.loadedSource();
      return sourceId ? this.kind.uiOf(sourceId) : this.kind.defaultUi();
    },

    // Drops the non-persisted card state and renders from scratch.
    rebuild() {
      this.sideOrders = {};
      this.closeCard();
      if(this.resetLayoutState) this.resetLayoutState();
      this.render();
    },

    closeCard() {
      this.expanded = null;
      this.lineExpanded = false;
      this.infoOpen = false;
    },

    /*
      The cards of the View, only while it is the visible one: selection
      changes fire for every view.
    */
    loadLayout() {
      const sourceId = this.loadedSource();
      const active = App.currentView === this.viewName && sourceId;
      this.layout = active ? this.kind.layout(sourceId) : { source: [], zones: {} };
      this.entries = {};
      [this.layout.source, ...Object.values(this.layout.zones)].forEach(list =>
        list.forEach(entry => { this.entries[entry.id] = entry; }));
      if(this.expanded && !this.entries[this.expanded.id]) this.closeCard();
    },

    /*
      The random side order of a card is resolved once, here, so that
      viewModel() and template() stay deterministic.
    */
    resolveSideOrders(entries, ui) {
      entries.forEach(entry => {
        if(this.sideOrders[entry.id]) return;
        this.sideOrders[entry.id] = Cards.orderLines(
          Cards.sideLines(entry),
          ui.mode,
          this.sideIndexOf(entry.id, ui),
        );
      });
    },

    /*
      Layout measurement, the allowed DOM exception: the area below the source
      zone gets the height that is left of the visible View. It is the offset of
      the area inside the scrolling container, so it does not depend on the
      current scroll position. The offset does not depend on the area's own
      height, so the old value is not reset before measuring (that could shrink
      the scrollable area and lose the scroll position). A hidden View has no
      geometry and gets no height.

      The measurement is repeated once before the next paint. On a View switch
      every View renders in its own microtask, in the order of registration, so a
      View that renders before the previous one has hidden itself measures a
      container that is still shared with it, and gets a height that is too
      small (the legend would show on the screen). The first measurement stays
      synchronous: the Panel reads the layout that depends on it right after.
    */
    fitToViewport(fillEl, visible = App.currentView === this.viewName) {
      this.measureFill(fillEl, visible);
      if(this.fitScheduled) return;
      this.fitScheduled = true;
      requestAnimationFrame(() => {
        this.fitScheduled = false;
        this.measureFill(fillEl, App.currentView === this.viewName);
      });
    },

    measureFill(fillEl, visible) {
      const container = this.dom.containerEl;
      if(!visible) {
        fillEl.style.minHeight = '';
        return;
      }
      const offset = fillEl.getBoundingClientRect().top
        - container.getBoundingClientRect().top
        + container.scrollTop;
      fillEl.style.minHeight = `${Math.max(0, container.clientHeight - offset)}px`;
    },

    // Only the tags that the cards on the screen carry.
    legendTags() {
      const tags = new Set(Object.values(this.entries).map(entry => entry.tag).filter(Boolean));
      return Object.values(Parser.ENTRY_TAG).filter(tag => tags.has(tag));
    },

    /*
      asExpanded: the card drawn in the overlay. The same card in its zone only
      keeps its place (covered).
    */
    cardViewModel(entry, ui, asExpanded = false) {
      const order = this.sideOrders[entry.id] || [];
      const current = Cards.currentSide(order, this.sideIndexOf(entry.id, ui));
      const side = order.find(line => line.originalIndex === current);
      const reading = Cards.readingOf(entry);
      const isOpen = this.expanded?.id === entry.id;
      return {
        id: entry.id,
        tag: entry.tag,
        reviewLevel: entry.reviewLevel,
        reversed: !!ui.markReversed && !!entry.reversed,
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
        canAddToList: asExpanded && !!this.canAddToList,
        canRemoveFromList: asExpanded && !!this.canAddToList
          && Collections.isListId(App.currentSource),
        covered: !asExpanded && isOpen,
        size: !asExpanded && isOpen
          ? { width: this.expanded.width, height: this.expanded.height }
          : null,
        place: null,
      };
    },

    // ---- handlers (clean: change state or domain, then render) ---------------------

    /*
      The card is opened by its tap zone. Its viewport position and size are
      measured here, once, and kept in the component state: they are not derived
      from the domain, and the size of its place must stay as it was at the tap.
    */
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
      const sourceId = this.loadedSource();
      if(!sourceId || !this.expanded) return;
      const entryId = this.expanded.id;
      const order = this.sideOrders[entryId] || [];
      if(order.length < 2) return;
      const current = Cards.currentSide(order, this.sideIndexOf(entryId, this.persistedUi()));
      const indexes = order.map(line => line.originalIndex);
      this.rememberSide(sourceId, entryId, step.call(Cards, indexes, current));
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
      const sourceId = this.loadedSource();
      if(!sourceId || !this.expanded) return;
      const entryId = this.expanded.id;
      this.closeCard();
      this.kind.removeEntry(sourceId, entryId);
    },

    speakSide() {
      if(!this.expanded) return;
      const order = this.sideOrders[this.expanded.id] || [];
      const current = Cards.currentSide(
        order,
        this.sideIndexOf(this.expanded.id, this.persistedUi()),
      );
      const side = order.find(line => line.originalIndex === current);
      if(side?.speakable) Utils.speak(side.text);
    },

    speakReading(el) {
      Utils.speak(el.textContent.trim());
    },
  },
};

