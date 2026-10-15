// PreloaderUI: full-screen spinner overlay. A projection of the Busy flag.
// Subscribes to Bus.busyChanged and shows/hides itself.
const PreloaderUI = {
  name: 'PreloaderUI',

  selectors: {
    root: '#preloaderView',
  },

  init() {
    this.ensureMarkup();
    Bus.on(Bus.events.busyChanged, ({ busy }) => this.setBusy(busy));
  },

  ensureMarkup() {
    if(this.dom?.root) return;
    const html = `
      <div id="preloaderView" class="hidden">
        <div id="preloader"></div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    Utils.cacheComponentDom(this);
  },

  setBusy(busy) {
    this.dom.root.classList.toggle('hidden', !busy);
  },
};

Components.push(PreloaderUI);
