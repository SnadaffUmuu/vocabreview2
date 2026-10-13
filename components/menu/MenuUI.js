// MenuUI: top bar with source selector, view switcher, and reload. The source
// selector loads via http when served over http://, otherwise via file picker.
const MenuUI = {
  name: 'MenuUI',

  views: ['data', 'slider', 'table', 'board', 'panel'],

  selectors: {
    root: '#menu',
    sourcesEl: '#menuSources',
    viewSwitcherEl: '#menuViewSwitcher',
    reloadEl: '#menuReload',
  },

  events: {
    change: { '@sourcesEl': 'changeSource' },
    click: {
      '#menuViewSwitcher .switchView': 'switchView',
      '@reloadEl': 'reloadCurrent',
    },
  },

  init() {
    this.ensureMarkup();
    Bus.batchedMethod(this, 'render');
    Bus.on(Bus.events.originSelected, () => this.render());
    Bus.on(Bus.events.sourcesChanged, () => this.render());
  },

  ensureMarkup() {
    if(this.dom?.root) return;
    const html = `
      <div id="menu">
        <select id="menuSources"></select>
        <div id="menuViewSwitcher">
          ${this.views.map(v =>
            '<button class="switchView" data-app-type="' + v + '">' + v + '</button>'
          ).join('')}
        </div>
        <button id="menuReload">reload</button>
      </div>`;
    document.querySelector('#appBody').insertAdjacentHTML('beforeend', html);
    Utils.cacheComponentDom(this);
  },

  render() {
    // Sources dropdown.
    const current = App.currentOrigin;
    const ids = Array.from(new Set([...SOURCES_LIST, ...Library.listIds()]));
    this.dom.sourcesEl.innerHTML = '<option value=""' + (!current ? ' selected' : '') + '>source…</option>' + ids.map(id =>
      '<option value="' + id + '"' + (id === current ? ' selected' : '') + '>'
        + Utils.escapeHtml(id) + '</option>'
    ).join('');

    // View highlight.
    Array.from(this.dom.viewSwitcherEl.querySelectorAll('.switchView')).forEach(btn => {
      btn.classList.toggle('active', btn.dataset.appType === App.currentView);
    });
  },

  // ---- source loading ------------------------------------------------------------

  changeSource(el, e) {
    this.loadSource(el.value);
  },

  async loadSource(id) {
    if(!id) return;
    if(Library.hasSource(id)) {
      App.selectOrigin(id);
      return;
    }

    // Try http first (works when served over http://); fall back to picker.
    const raw = await this.tryHttpFetch(id);
    if(raw != null) {
      Library.setSource(id, raw, 'http');
      App.selectOrigin(id);
    } else {
      this.pickFile(id);
    }
  },

  isHttp() {
    return location.protocol === 'http:' || location.protocol === 'https:';
  },

  async tryHttpFetch(id) {
    if(!this.isHttp()) return null;
    try {
      const response = await fetch('./vocab/' + id + '.txt?' + Date.now());
      if(response.ok) return await response.text();
    } catch(e) {
      console.warn('http fetch failed for', id, e);
    }
    return null;
  },

  pickFile(id) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if(!file) return;
      const pickedId = file.name.replace(/\.txt$/, '');
      if(pickedId !== id) {
        console.warn('Picked file ' + file.name + ' does not match expected ' + id);
        return;
      }
      file.text().then(raw => {
        Library.setSource(id, raw, 'file');
        App.selectOrigin(id);
      });
    };
    input.click();
  },

  reloadCurrent() {
    const id = App.currentOrigin;
    if(!id) return;
    if(!confirm('Reload source "' + id + '"? Its progress and selection will be reset.')) return;

    if(this.isHttp()) {
      this.tryHttpFetch(id).then(raw => {
        if(raw != null) Library.reloadSource(id, raw, 'http');
      });
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.txt';
      input.onchange = () => {
        const file = input.files && input.files[0];
        if(!file) return;
        file.text().then(raw => {
          Library.reloadSource(id, raw, 'file');
        });
      };
      input.click();
    }
  },

  switchView(el, e) {
    App.setView(el.dataset.appType);
  },
};

Components.push(MenuUI);
