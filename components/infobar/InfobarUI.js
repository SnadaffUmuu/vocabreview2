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
    Bus.on(Bus.events.settingsChanged, () => this.render());
  },

  ensureMarkup() {
    if(this.dom?.root) return;
    const html = `
      <div id="infobar">
        <span id="infobarCurrentSource"></span>
        <span id="infobarEntriesCount"></span>
        <div id="infobarNightMode" role="button" tabindex="0" aria-label="Toggle color theme">
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 122.88 112.88" aria-hidden="true">
            <path fill-rule="evenodd" clip-rule="evenodd"
              d="M14.29,0h94.3c7.86,0,14.29,6.43,14.29,14.29v84.3c0,7.86-6.43,14.29-14.29,14.29h-94.3 C6.43,112.88,0,106.45,0,98.59v-84.3C0,6.43,6.43,0,14.29,0L14.29,0z M61.36,24.87c-7.69,4.45-12.87,12.77-12.87,22.3 c0,14.22,11.53,25.75,25.75,25.75c6.75,0,12.9-2.6,17.49-6.85c2.28-2.11,4.89-0.57,4.01,1.94c-4.81,13.82-17.95,23.73-33.41,23.73 c-19.54,0-35.38-15.84-35.38-35.38c0-18.72,14.61-34.1,33.1-35.23C63.47,20.93,64.35,23.14,61.36,24.87L61.36,24.87z" />
          </svg>
        </div>
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
    this.dom.nightEl.classList.toggle('nightMode', App.night);
  },
};

Components.push(InfobarUI);
