// InfobarUI: shows the current source name and selected-entry count, plus a
// night-mode toggle. Renders from domain state; no data of its own.
const InfobarUI = {
  name: 'InfobarUI',

  selectors: {
    root: '#infobar',
    sourceEl: '#infobarCurrentSource',
    countEl: '#infobarEntriesCount',
    nightEl: '#infobarNightMode',
  },

  events: {
    click: { '@nightEl': 'toggleNight' },
  },

  init() {
    this.ensureMarkup();
    Bus.batchedMethod(this, 'render');
    Bus.on(Bus.events.originSelected, () => this.render());
    Bus.on(Bus.events.selectionChanged, () => this.render());
    Bus.on(Bus.events.sourcesChanged, () => this.render());
  },

  ensureMarkup() {
    if(this.dom?.root) return;
    const html = `
      <div id="infobar">
        <span id="infobarCurrentSource"></span>
        <span id="infobarEntriesCount"></span>
        <button id="infobarNightMode">night</button>
      </div>`;
    document.querySelector('#appBody').insertAdjacentHTML('beforeend', html);
    Utils.cacheComponentDom(this);
  },

  toggleNight() {
    const night = !document.body.classList.contains('night');
    document.body.classList.toggle('night', night);
    App.setNight(night);
  },

  render() {
    const originId = App.currentOrigin;
    if(originId && Library.hasSource(originId)) {
      this.dom.sourceEl.textContent = originId;
      const entries = App.selectedEntries(originId);
      this.dom.countEl.textContent = entries.length;
    } else {
      this.dom.sourceEl.textContent = '';
      this.dom.countEl.textContent = '';
    }
    this.dom.nightEl.textContent = App.night ? 'day' : 'night';
  },
};

Components.push(InfobarUI);
