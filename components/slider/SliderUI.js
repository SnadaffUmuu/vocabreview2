// SliderUI: swipeable cards backed by Keen Slider. Persistent state is owned
// by ViewState/SliderState; DOM is only a projection of that state.
const SliderUI = {
  name: 'SliderUI',
  viewName: 'slider',
  viewLabel: 'S',

  selectors: {
    root: '#sliderView',
    modeEl: '#sliderCardMode',
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
      '@modeEl': 'changeMode',
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
    },
  },

  compatibleMatchingModes: ['meaning', 'example', 'example_translation'],
  slider: null,

  init() {
    this.ensureMarkup();
    Bus.batchedMethod(this, 'render');
    Bus.on(Bus.events.viewChanged, () => this.render());
    Bus.on(Bus.events.originSelected, () => this.render());
    Bus.on(Bus.events.sourcesChanged, () => this.render());
    Bus.on(Bus.events.selectionChanged, ({ sourceId }) => {
      if(sourceId === App.currentOrigin) {
        SliderState.resetNavigation(sourceId);
        this.render();
      }
    });
  },

  ensureMarkup() {
    if(this.dom?.root) return;
    const html = `
      <div id="sliderView" class="appView">
        <div id="sliderActions">
          <select id="sliderCardMode">
            <option value="original">original</option>
            <option value="random">random</option>
            <option value="expression">expression</option>
            <option value="meaning">meaning</option>
            <option value="example">examples</option>
            <option value="example_translation">examples' translations</option>
          </select>
          <label>Omm <input type="checkbox" id="sliderOnlyMatching"></label>
          <label>R <input type="checkbox" id="sliderRandomOrder"></label>
          <button id="sliderReset">Reset</button>
          <div id="sliderCounters"><span id="sliderCurrentIndex"></span><span id="sliderCounterSep">/</span><span id="sliderDataCount"></span></div>
        </div>
        <div id="sliderOuter">
          <div id="sliderLapse" class="sliderMark" aria-label="lapse" role="button" tabindex="0">✗</div>
          <div id="sliderHit" class="sliderMark" aria-label="hit" role="button" tabindex="0">〇</div>
          <button id="sliderRemove" aria-label="remove">消</button>
          <div id="sliderContainer" class="keen-slider"></div>
        </div>
      </div>`;
    document.querySelector('#appBody').insertAdjacentHTML('beforeend', html);
    Utils.cacheComponentDom(this);
  },

  state() {
    const state = ViewState.get(App.currentOrigin, this.viewName);
    if(!state.ui.mode) state.ui.mode = 'original';
    if(state.ui.onlyMatching == null) state.ui.onlyMatching = false;
    if(state.ui.random == null) state.ui.random = false;
    if(!state.ui.sideIndexes) state.ui.sideIndexes = {};
    return state;
  },

  render() {
    const visible = App.currentView === this.viewName;
    this.dom.root.classList.toggle('hidden', !visible);
    if(!visible) {
      this.destroySlider();
      return;
    }

    this.destroySlider();
    this.dom.containerEl.innerHTML = '';
    this.dom.currentEl.textContent = '';
    this.dom.totalEl.textContent = '0';

    const originId = App.currentOrigin;
    if(!originId || !Library.hasSource(originId)) return;

    const state = this.state();
    this.syncControls(state.ui);
    const entries = this.visibleEntries(originId, state);
    entries.forEach(entry => {
      this.dom.containerEl.insertAdjacentHTML('beforeend', this.renderSlide(entry, state));
    });
    this.dom.totalEl.textContent = String(entries.length);

    if(!entries.length || typeof KeenSlider !== 'function') return;

    const initial = Math.max(0, entries.findIndex(e => e.id === state.ui.currentEntryId));
    this.slider = new KeenSlider(this.dom.containerEl, {
      loop: true,
      initial,
      created: slider => this.onSlideChanged(slider),
      slideChanged: slider => this.onSlideChanged(slider),
    });
  },

  visibleEntries(originId, state) {
    let entries = App.selectedEntries(originId).filter(entry =>
      !state.progress[entry.id]?.removed);

    if(state.ui.onlyMatching && this.compatibleMatchingModes.includes(state.ui.mode)) {
      entries = entries.filter(entry => entry.lines.some(line => line.role === state.ui.mode));
    }

    if(state.ui.random) {
      const ids = entries.map(e => e.id);
      let order = Array.isArray(state.ui.order)
        ? state.ui.order.filter(id => ids.includes(id)) : [];
      const missing = ids.filter(id => !order.includes(id));
      if(!order.length) order = Utils.shuffle(ids);
      else order = order.concat(Utils.shuffle(missing));
      state.ui.order = order;
      App.saveViews();
      const map = Object.fromEntries(entries.map(e => [e.id, e]));
      entries = order.map(id => map[id]).filter(Boolean);
    }
    return entries;
  },

  renderSlide(entry, state) {
    const reading = entry.lines.find(line => line.role === Parser.LINE_ROLE.reading);
    const lines = entry.lines.filter(line => line !== reading);
    const savedSide = state.ui.sideIndexes[entry.id];
    const ordered = this.orderLines(lines, state.ui.mode, savedSide);
    const current = ordered.find(line => line.originalIndex === savedSide) || ordered[0];
    const attrs = [
      'data-entry-id="' + Utils.escapeHtml(entry.id) + '"',
      entry.section != null ? 'data-section="' + Utils.escapeHtml(entry.section) + '"' : '',
      entry.tag ? 'data-tag="' + Utils.escapeHtml(entry.tag) + '"' : '',
      entry.reviewLevel ? 'data-review-level="' + Utils.escapeHtml(entry.reviewLevel) + '"' : '',
    ].filter(Boolean).join(' ');
    const info = entry.info
      ? '<details class="entry-info"><summary>ⓘ</summary>' + Utils.escapeHtml(entry.info) + '</details>' : '';
    const sides = ordered.map(line => this.renderSide(line, current)).join('');
    const readingHtml = reading
      ? '<div class="slideReading" data-reading="' + Utils.escapeHtml(reading.text) + '" role="button" tabindex="0">'
        + Utils.escapeHtml(reading.text) + '</div>' : '';
    // const readingHtml = reading
    //   ? '<div class="slideReading" data-reading="' + Utils.escapeHtml(reading.text) + '" role="button" tabindex="0"><span>'
    //     + Utils.escapeHtml(reading.text) + '</span></div>' : '';

    return '<div class="keen-slider__slide js-slide" ' + attrs + '>'
      + info
      + '<div class="sides-count">' + ordered.length + '</div>'
      + '<div class="current-side">' + (current ? current.originalIndex : '') + '</div>'
      + '<div class="slide-inner js-slide-inner">' + sides + '</div>'
      + readingHtml
      + '</div>';
  },

  renderSide(line, current) {
    const classes = ['slide-side', 'js-slide-side'];
    if(line === current) classes.push('current');
    if(line.isCompact || line.role === 'example') classes.push('compact');
    return '<div class="' + classes.join(' ') + '" data-index="' + Utils.escapeHtml(line.originalIndex) + '"'
      + (line.role ? ' data-role="' + Utils.escapeHtml(line.role) + '"' : '')
      + (line.speakable ? ' data-reading="' + Utils.escapeHtml(line.text) + '"' : '')
      + '><span>' + Utils.escapeHtml(line.text) + '</span></div>';
  },

  orderLines(lines, mode, savedSide) {
    if(savedSide != null && lines.some(l => l.originalIndex === savedSide)) return lines.slice();
    if(mode === 'random') return Utils.shuffle(lines);
    const order = Parser.lineOrders?.[mode];
    if(!order) return lines.slice();

    if(mode === 'example_translation') {
      const translations = Utils.shuffle(lines.filter(line =>
        line.role === 'example_translation'));
      const paired = [];
      translations.forEach(translation => {
        paired.push(translation);
        const example = lines.find(line =>
          line.translationLineIndex === translation.originalIndex);
        if(example) paired.push(example);
      });
      return order.flatMap(role => {
        if(role === 'example_translation') return paired;
        if(role === 'example') {
          return Utils.shuffle(lines.filter(line =>
            line.role === role && !paired.includes(line)));
        }
        return lines.filter(line => line.role === role);
      });
    }

    return order.flatMap(role => {
      const group = lines.filter(line => line.role === role);
      return ['example', 'example_translation'].includes(role) ? Utils.shuffle(group) : group;
    });
  },

  syncControls(ui) {
    this.dom.modeEl.value = ui.mode;
    this.dom.matchingEl.checked = !!ui.onlyMatching;
    this.dom.randomEl.checked = !!ui.random;
  },

  changeMode(el) {
    const state = this.state();
    state.ui.mode = el.value;
    state.ui.sideIndexes = {};
    App.saveViews();
    this.render();
  },

  changeMatching(el) {
    ViewState.setUi(App.currentOrigin, this.viewName, {
      onlyMatching: el.checked,
      currentEntryId: null,
    });
    this.render();
  },

  changeRandom(el) {
    const patch = { random: el.checked, currentEntryId: null };
    if(el.checked) {
      patch.order = Utils.shuffle(App.selectedEntries(App.currentOrigin).map(e => e.id));
    } else {
      patch.order = [];
    }
    ViewState.setUi(App.currentOrigin, this.viewName, patch);
    this.render();
  },

  reset() {
    if(!App.currentOrigin || !confirm('Really reset the Slider?')) return;
    const ids = App.selectedEntries(App.currentOrigin).map(e => e.id);
    ViewState.resetEntries(App.currentOrigin, this.viewName, ids, {
      mode: 'original',
      onlyMatching: false,
      random: false,
      order: [],
      sideIndexes: {},
      currentEntryId: null,
    });
    this.render();
  },

  currentSlide() {
    if(!this.slider?.slides?.length) return null;
    const rel = this.slider.track.details ? this.slider.track.details.rel : 0;
    return this.slider.slides[rel] || this.slider.slides[0];
  },

  rotateSide(el, e) {
    const inner = el.classList.contains('js-slide-inner') ? el : el.closest('.js-slide-inner');
    const slide = el.closest('.js-slide');
    if(!inner || !slide) return;
    e.preventDefault();

    const sides = Array.from(inner.querySelectorAll('.js-slide-side'));
    if(sides.length < 2) return;
    const current = inner.querySelector('.current');
    const idx = Math.max(0, sides.indexOf(current));
    const next = sides[(idx + 1) % sides.length];
    current?.classList.remove('current');
    next.classList.add('current');
    slide.querySelector('.current-side').textContent = next.dataset.index;

    SliderState.setSideIndex(
      App.currentOrigin,
      Number(slide.dataset.entryId),
      Number(next.dataset.index),
    );
    this.updateMarks();
  },

  readReading(el, e) {
    e.stopPropagation();
    const reading = el.closest('.slideReading');
    const text = reading.dataset.reading;
    if(!reading.classList.contains('listened') && !reading.classList.contains('revealed')) {
      reading.classList.add('listened');
      Utils.speak(text);
    } else if(reading.classList.contains('listened')) {
      reading.classList.remove('listened');
      reading.classList.add('revealed');
    } else {
      reading.classList.remove('revealed');
    }
  },

  speakSide(el, e) {
    e.stopPropagation();
    const side = el.closest('.js-slide-side');
    if(side?.dataset.reading) Utils.speak(side.dataset.reading);
  },

  toggleLapse() {
    this.toggleMark('lapses');
  },

  toggleHit() {
    this.toggleMark('hits');
  },

  toggleMark(mark) {
    const slide = this.currentSlide();
    const side = slide?.querySelector('.js-slide-side.current');
    if(!slide || !side) return;
    SliderState.toggleSideMark(
      App.currentOrigin,
      Number(slide.dataset.entryId),
      mark,
      Number(side.dataset.index),
    );
    this.updateMarks();
  },

  removeCurrent() {
    const slide = this.currentSlide();
    if(!slide || this.slider.slides.length === 1) return;
    if(!confirm('Remove the slide?')) return;
    const originId = App.currentOrigin;
    const rel = this.slider.track.details ? this.slider.track.details.rel : 0;
    const entryId = Number(slide.dataset.entryId);
    SliderState.removeEntry(originId, entryId);
    // Preserve position: after removal, the slide at same index `rel` becomes current.
    const state = this.state();
    const entries = this.visibleEntries(originId, state);
    const next = entries[rel] || entries[0];
    ViewState.replaceUiValue(originId, this.viewName, 'currentEntryId', next ? next.id : null);
    this.render();
  },

  onSlideChanged(slider) {
    this.slider = slider;
    const rel = slider.track.details ? slider.track.details.rel : 0;
    const slide = slider.slides[rel] || slider.slides[0];
    slider.slides.forEach(other => {
      if(other !== slide) {
        const info = other.querySelector('.entry-info');
        if(info) info.open = false;
      }
    });
    this.dom.currentEl.textContent = String(rel + 1);
    if(slide) {
      ViewState.replaceUiValue(
        App.currentOrigin,
        this.viewName,
        'currentEntryId',
        Number(slide.dataset.entryId),
      );
    }
    this.updateMarks();
  },

  updateMarks() {
    const slide = this.currentSlide();
    const side = slide?.querySelector('.js-slide-side.current');
    if(!slide || !side) {
      this.dom.hitEl.classList.remove('active');
      this.dom.lapseEl.classList.remove('active');
      return;
    }
    const item = ViewState.entry(
      App.currentOrigin,
      this.viewName,
      Number(slide.dataset.entryId),
    ) || {};
    const sideIndex = Number(side.dataset.index);
    this.dom.hitEl.classList.toggle('active', item.hits?.includes(sideIndex) || false);
    this.dom.lapseEl.classList.toggle('active', item.lapses?.includes(sideIndex) || false);
  },

  destroySlider() {
    if(this.slider) {
      this.slider.destroy();
      this.slider = null;
    }
  },
};

Components.push(SliderUI);