// SliderUI: swipeable cards backed by Keen Slider. Persistent state is owned
// by ViewState/SliderState; DOM is only a projection of that state.
//
// Component state that is not persisted (dropped by rebuild(): on a view,
// source or selection change and on actions that rebuild the slides):
//   entries    - domain entries the slides are built from, in slide order
//   entryIds   - their ids; a position in Keen maps to an id through it
//   sideOrders - { [entryId]: lines } order of the sides of a card. It can be
//                random, so it is resolved once and then reused.
//   readings   - { [entryId]: 'listened' | 'revealed' } state of the reading bar
//   openInfoId - id of the card whose info <details> is open
//
// Exceptions to a full re-render (see AGENTS.md):
//   - Keen Slider is destroyed/created together with the slides it owns.
//   - A tap on a card (rotate a side, reading bar, info) re-renders only the
//     content of that one slide: rebuilding the container would destroy the
//     widget and lose the position. The slide element itself is never replaced.
const SliderUI = {
  name: 'SliderUI',
  viewName: 'slider',
  viewLabel: 'S',

  selectors: {
    root: '#sliderView',
    matchingEl: '#sliderOnlyMatching',
    randomEl: '#sliderRandomOrder',
    resetEl: '#sliderReset',
    currentEl: '#sliderCurrentIndex',
    totalEl: '#sliderDataCount',
    outerEl: '#sliderOuter',
    lapseEl: '#sliderLapse',
    hitEl: '#sliderHit',
    removeEl: '#sliderRemove',
    containerEl: '#sliderContainer',
  },

  events: {
    change: {
      '@matchingEl': 'changeMatching',
      '@randomEl': 'changeRandom',
    },
    click: {
      '@resetEl': 'reset',
      '@lapseEl': 'toggleLapse',
      '@hitEl': 'toggleHit',
      '@removeEl': 'removeCurrent',
      '#sliderView .js-slide-inner': 'rotateSide',
      '#sliderView .js-slide-side, #sliderView .js-slide-side span': 'speakSide',
      '#sliderView .slideReading, #sliderView .slideReading span': 'readReading',
      '#sliderView .entry-info > summary': 'toggleInfo',
    },
  },

  slider: null,
  entries: [],
  entryIds: [],
  sideOrders: {},
  readings: {},
  openInfoId: null,

  init() {
    this.ensureMarkup();
    Bus.batchedMethod(this, 'render');
    Bus.on(Bus.events.viewChanged, () => this.rebuild());
    DropdownUI.on('sliderCardMode', mode => this.changeMode(mode));
    Bus.on(Bus.events.sourceSelected, () => this.rebuild());
    Bus.on(Bus.events.sourcesChanged, () => this.rebuild());
    Bus.on(Bus.events.selectionChanged, ({ sourceId }) => {
      if(sourceId !== App.currentSource) return;
      SliderState.resetNavigation(sourceId);
      this.rebuild();
    });
  },

  ensureMarkup() {
    if(this.dom?.root) return;
    const html = `
      <div id="sliderView" class="appView">
        <div id="sliderActions">
          ${DropdownUI.select({
            id: 'sliderCardMode',
            items: [
              { value: 'original', label: 'original' },
              { value: 'random', label: 'random' },
              { value: 'expression', label: 'expression' },
              { value: 'meaning', label: 'meaning' },
              { value: 'example', label: 'examples' },
              { value: 'example_translation', label: "examples' translations" },
            ],
            cls: 'sliderCardModeButton',
          })}
          <label>Omm <input type="checkbox" id="sliderOnlyMatching"></label>
          <label>R <input type="checkbox" id="sliderRandomOrder"></label>
          <button id="sliderReset">Reset</button>
          <div id="sliderCounters">
            <span id="sliderCurrentIndex"></span>
            <span id="sliderCounterSep">/</span>
            <span id="sliderDataCount"></span>
          </div>
        </div>
        <div id="sliderOuter">
          <div id="sliderLapse" class="sliderMark" aria-label="lapse" role="button" tabindex="0">✗</div>
          <div id="sliderHit" class="sliderMark" aria-label="hit" role="button" tabindex="0">〇</div>
          <button id="sliderRemove" aria-label="remove">消</button>
          <div id="sliderContainer" class="keen-slider"></div>
        </div>
      </div>
      `;
    document.querySelector('#appBody').insertAdjacentHTML('beforeend', html);
    Utils.cacheComponentDom(this);
  },

  // ---- state -----------------------------------------------------------------------

  // The loaded current source, or null.
  sliderSource() {
    const sourceId = App.currentSource;
    return sourceId && Library.hasSource(sourceId) ? sourceId : null;
  },

  persistedUi() {
    const sourceId = this.sliderSource();
    return sourceId ? SliderState.uiOf(sourceId) : SliderState.defaultUi();
  },

  // Drops the non-persisted card state and renders the slides from scratch.
  rebuild() {
    this.sideOrders = {};
    this.readings = {};
    this.openInfoId = null;
    this.render();
  },

  // Entries are loaded only while the slider is the visible view: selection
  // changes fire for every view.
  loadEntries() {
    const sourceId = this.sliderSource();
    const active = App.currentView === this.viewName && sourceId;
    this.entries = active ? SliderState.visibleEntries(sourceId) : [];
    this.entryIds = this.entries.map(entry => entry.id);
  },

  // The random side order of a card is resolved once, here, so that
  // viewModel() and template() stay deterministic.
  resolveSideOrders(ui) {
    this.entries.forEach(entry => {
      if(this.sideOrders[entry.id]) return;
      this.sideOrders[entry.id] = Cards.orderLines(
        Cards.sideLines(entry),
        ui.mode,
        ui.sideIndexes[entry.id],
      );
    });
  },

  // The only thing that is known by the widget alone: the visible position.
  currentIndex() {
    return this.slider?.track.details ? this.slider.track.details.rel : 0;
  },

  currentEntryId() {
    if(!this.slider) return null;
    return this.entryIds[this.currentIndex()] ?? this.entryIds[0] ?? null;
  },

  // The side shown on a card: the saved one if the card has it, else the first.
  currentSideIndex(entryId, ui) {
    return Cards.currentSide(this.sideOrders[entryId] || [], ui.sideIndexes[entryId]);
  },

  // hidden -> listened (spoken) -> revealed -> hidden.
  nextReading(state) {
    return { '': 'listened', listened: 'revealed', revealed: '' }[state || ''];
  },

  // ---- view model ------------------------------------------------------------------

  // The only place that reads domain state for the slides. Pure over the
  // component state (entries, sideOrders, readings, openInfoId).
  viewModel() {
    const ui = this.persistedUi();
    const slides = this.entries.map(entry => this.slideViewModel(entry, ui));
    return {
      visible: App.currentView === this.viewName,
      slides,
      initialIndex: Math.max(0, this.entryIds.indexOf(ui.currentEntryId)),
    };
  },

  slideViewModel(entry, ui) {
    const order = this.sideOrders[entry.id] || [];
    const current = this.currentSideIndex(entry.id, ui);
    const reading = Cards.readingOf(entry);
    return {
      id: entry.id,
      section: entry.section,
      tag: entry.tag,
      reviewLevel: entry.reviewLevel,
      info: entry.info ? { text: entry.info, open: this.openInfoId === entry.id } : null,
      currentSide: current ?? '',
      sides: order.map(line => ({
        index: line.originalIndex,
        role: line.role,
        text: line.text,
        speakable: !!line.speakable,
        compact: !!line.isCompact || line.role === 'example',
        current: line.originalIndex === current,
      })),
      reading: reading
        ? { text: reading.text, state: this.readings[entry.id] || '' }
        : null,
    };
  },

  // Counters, controls and hit/lapse marks depend on the widget position, so
  // they are rendered after the widget is created and on every slide change.
  controlsViewModel() {
    const sourceId = this.sliderSource();
    const ui = this.persistedUi();
    const entryId = this.currentEntryId();
    const item = sourceId && entryId != null
      ? ViewState.entry(sourceId, this.viewName, entryId) : null;
    const side = entryId != null ? this.currentSideIndex(entryId, ui) : null;
    return {
      mode: ui.mode,
      onlyMatching: ui.onlyMatching,
      random: ui.random,
      position: entryId != null ? String(this.currentIndex() + 1) : '',
      total: String(this.entryIds.length),
      hit: side != null && !!item?.hits?.includes(side),
      lapse: side != null && !!item?.lapses?.includes(side),
    };
  },

  // ---- markup ----------------------------------------------------------------------

  template(vm) {
    return vm.slides.map(slide => this.slideTemplate(slide)).join('');
  },

  // The slide element carries only what depends on the entry itself. Its
  // content (everything a tap can change) is a separate fragment, see
  // slideContentTemplate().
  slideTemplate(slide) {
    return `
      <div class="keen-slider__slide js-slide"
        data-entry-id="${Utils.escapeHtml(slide.id)}"
        ${slide.section != null ? `data-section="${Utils.escapeHtml(slide.section)}"` : ''}
        ${slide.tag ? `data-tag="${Utils.escapeHtml(slide.tag)}"` : ''}
        ${slide.reviewLevel ? `data-review-level="${Utils.escapeHtml(slide.reviewLevel)}"` : ''}
        >${this.slideContentTemplate(slide)}</div>
      `;
  },

  slideContentTemplate(slide) {
    return `
      ${slide.info ? `
      <details class="entry-info" ${slide.info.open ? 'open' : ''}>
        <summary>ⓘ</summary>${Utils.escapeHtml(slide.info.text)}
      </details>` : ''}
      <div class="sides-count">${slide.sides.length}</div>
      <div class="current-side">${Utils.escapeHtml(slide.currentSide)}</div>
      <div class="slide-inner js-slide-inner">${slide.sides.map(side => this.sideTemplate(side)).join('')}</div>
      ${slide.reading ? `
      <div class="slideReading ${slide.reading.state}"
        data-reading="${Utils.escapeHtml(slide.reading.text)}"
        role="button"
        tabindex="0"
        >${Utils.escapeHtml(slide.reading.text)}</div>` : ''}
      `;
  },

  sideTemplate(side) {
    return `
      <div class="slide-side js-slide-side ${side.current ? 'current' : ''} ${side.compact ? 'compact' : ''}"
        data-index="${Utils.escapeHtml(side.index)}"
        ${side.role ? `data-role="${Utils.escapeHtml(side.role)}"` : ''}
        ${side.speakable ? `data-reading="${Utils.escapeHtml(side.text)}"` : ''}
        >
        <span>${Utils.escapeHtml(side.text)}</span>
      </div>
      `;
  },

  // ---- rendering -------------------------------------------------------------------

  render() {
    this.destroySlider();
    this.loadEntries();
    this.resolveSideOrders(this.persistedUi());
    const vm = this.viewModel();
    this.dom.root.classList.toggle('hidden', !vm.visible);
    this.dom.containerEl.innerHTML = this.template(vm);
    this.createSlider(vm);
    this.renderControls();
  },

  // Exception: third-party widget lifecycle. Keen is created over the slides
  // that were just written; created/slideChanged render the position-dependent
  // controls.
  createSlider(vm) {
    if(!vm.slides.length || typeof KeenSlider !== 'function') return;
    this.slider = new KeenSlider(this.dom.containerEl, {
      loop: true,
      initial: vm.initialIndex,
      created: slider => this.onSlideChanged(slider),
      slideChanged: slider => this.onSlideChanged(slider),
    });
  },

  renderControls() {
    const vm = this.controlsViewModel();
    DropdownUI.setValue('sliderCardMode', vm.mode);
    this.dom.matchingEl.checked = vm.onlyMatching;
    this.dom.randomEl.checked = vm.random;
    this.dom.currentEl.textContent = vm.position;
    this.dom.totalEl.textContent = vm.total;
    this.dom.hitEl.classList.toggle('active', vm.hit);
    this.dom.lapseEl.classList.toggle('active', vm.lapse);
  },

  // Exception: one card is re-rendered in place (see the header).
  renderSlide(entryId) {
    const entry = this.entries.find(item => item.id === entryId);
    const slideEl = this.dom.containerEl.querySelector(`[data-entry-id="${entryId}"]`);
    if(!entry || !slideEl) return;
    const slide = this.slideViewModel(entry, this.persistedUi());
    slideEl.innerHTML = this.slideContentTemplate(slide);
  },

  // ---- handlers (clean: change state or domain, then render) -----------------------

  changeMode(mode) {
    const sourceId = this.sliderSource();
    if(!sourceId) return;
    SliderState.setMode(sourceId, mode);
    this.rebuild();
  },

  changeMatching(el) {
    ViewState.setUi(App.currentSource, this.viewName, {
      onlyMatching: el.checked,
      currentEntryId: null,
    });
    this.rebuild();
  },

  // The random order itself is created by SliderState.visibleEntries().
  changeRandom(el) {
    ViewState.setUi(App.currentSource, this.viewName, {
      random: el.checked,
      order: [],
      currentEntryId: null,
    });
    this.rebuild();
  },

  reset() {
    if(!App.currentSource) return;
    Prompt.ask({
      text: 'Really reset the Slider?',
      onConfirm: () => this.doReset(),
    });
  },

  doReset() {
    if(!App.currentSource) return;
    const ids = App.selectedEntries(App.currentSource).map(e => e.id);
    ViewState.resetEntries(App.currentSource, this.viewName, ids, SliderState.defaultUi());
    this.rebuild();
  },

  slideIdOf(el) {
    return Number(el.closest('.js-slide').dataset.entryId);
  },

  rotateSide(el, e) {
    if(!el.closest('.js-slide')) return;
    e.preventDefault();
    const entryId = this.slideIdOf(el);
    const indexes = (this.sideOrders[entryId] || []).map(line => line.originalIndex);
    if(indexes.length < 2) return;
    const ui = this.persistedUi();
    const next = Cards.nextSideIndex(indexes, this.currentSideIndex(entryId, ui));
    SliderState.setSideIndex(App.currentSource, entryId, next);
    this.renderSlide(entryId);
    this.renderControls();
  },

  readReading(el, e) {
    e.stopPropagation();
    const reading = el.closest('.slideReading');
    const entryId = this.slideIdOf(reading);
    const next = this.nextReading(this.readings[entryId]);
    if(next === 'listened') Utils.speak(reading.dataset.reading);
    this.readings[entryId] = next;
    this.renderSlide(entryId);
  },

  speakSide(el, e) {
    e.stopPropagation();
    const side = el.closest('.js-slide-side');
    if(side?.dataset.reading) Utils.speak(side.dataset.reading);
  },

  // Stop the native <details> toggle: the open attribute is written by the template.
  toggleInfo(el, e) {
    e.preventDefault();
    const entryId = this.slideIdOf(el);
    const previous = this.openInfoId;
    this.openInfoId = previous === entryId ? null : entryId;
    this.renderSlide(entryId);
    if(previous != null && previous !== entryId) this.renderSlide(previous);
  },

  toggleLapse() {
    this.toggleMark('lapses');
  },

  toggleHit() {
    this.toggleMark('hits');
  },

  toggleMark(mark) {
    const entryId = this.currentEntryId();
    if(entryId == null) return;
    const side = this.currentSideIndex(entryId, this.persistedUi());
    if(side == null) return;
    SliderState.toggleSideMark(App.currentSource, entryId, mark, side);
    this.renderControls();
  },

  removeCurrent() {
    if(this.currentEntryId() == null || this.entryIds.length === 1) return;
    Prompt.ask({
      text: 'Remove the slide?',
      onConfirm: () => this.doRemoveCurrent(),
    });
  },

  doRemoveCurrent() {
    const entryId = this.currentEntryId();
    if(entryId == null || this.entryIds.length === 1) return;
    const sourceId = App.currentSource;
    const position = this.currentIndex();
    SliderState.removeEntry(sourceId, entryId);
    // Preserve position: the slide that takes the removed one's place becomes current.
    const entries = SliderState.visibleEntries(sourceId);
    const next = entries[position] || entries[0];
    ViewState.replaceUiValue(sourceId, this.viewName, 'currentEntryId', next ? next.id : null);
    this.rebuild();
  },

  onSlideChanged(slider) {
    this.slider = slider;
    const entryId = this.currentEntryId();
    if(this.openInfoId != null && this.openInfoId !== entryId) {
      const previous = this.openInfoId;
      this.openInfoId = null;
      this.renderSlide(previous);
    }
    if(entryId != null) {
      ViewState.replaceUiValue(App.currentSource, this.viewName, 'currentEntryId', entryId);
    }
    this.renderControls();
  },

  destroySlider() {
    if(this.slider) {
      this.slider.destroy();
      this.slider = null;
    }
  },
};

Components.push(SliderUI);

