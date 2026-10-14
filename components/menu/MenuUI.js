// MenuUI: slide-out panel with source selector, view switcher, sessions button
// and reload. A source loads via http when served over http(s)://, otherwise
// (or when http fails) via a file picker. The menu does not know which views
// exist: every registered component that declares viewName/viewLabel gets a
// switch button, and the menu only calls App.setView().
const MenuUI = {
  name: 'MenuUI',

  selectors: {
    root: '#menu',
    containerEl: '#menuContainer',
    triggerEl: '#menuTrigger',
    sourcesEl: '#menuSources',
    viewSwitcherEl: '#menuViewSwitcher',
    reloadEl: '#menuReload',
    sessionsEl: '#menuSessions',
  },

  events: {
    change: { '@sourcesEl': 'changeSource' },
    click: {
      '@containerEl': 'closeFromOverlay',
      '@triggerEl': 'toggleMenu',
      '#menuViewSwitcher .switchView': 'switchView',
      '@reloadEl': 'reloadCurrent',
      '@sessionsEl': 'showSessions',
    },
  },

  init() {
    this.ensureMarkup();
    Bus.batchedMethod(this, 'render');
    Bus.on(Bus.events.originSelected, () => this.render());
    Bus.on(Bus.events.sourcesChanged, () => this.render());
    Bus.on(Bus.events.viewChanged, () => this.render());
  },

  // Components that present themselves as a view (declare viewName/viewLabel).
  viewComponents() {
    return Components.list.filter(c => c.viewName && c.viewLabel);
  },

  ensureMarkup() {
    if(this.dom?.root) return;
    const switchers = this.viewComponents().map(c => `
              <button class="switchView" type="button" data-app-type="${Utils.escapeHtml(c.viewName)}">${Utils.escapeHtml(c.viewLabel)}</button>`
    ).join('');
    const html = `
      <div id="menuContainer">
        <button id="menuTrigger" type="button" aria-label="Open menu" aria-expanded="false">&gt;&gt;</button>
        <div id="menu">
          <div id="menuSourcesRow">
            <select id="menuSources"></select>
            <button id="menuReload" type="button" aria-label="Reload current source">⟳</button>
          </div>
          <div id="menuViewRow">
            <button id="menuSessions" type="button" aria-label="Sessions">A</button>
            <div id="menuViewSwitcher">${switchers}
            </div>
          </div>
        </div>
      </div>`;
    document.querySelector('#appBody').insertAdjacentHTML('beforeend', html);
    Utils.cacheComponentDom(this);
  },

  toggleMenu() {
    this.setMenuOpened(!this.dom.root.classList.contains('isOpened'));
  },

  setMenuOpened(opened) {
    this.dom.root.classList.toggle('isOpened', opened);
    this.dom.triggerEl.textContent = opened ? '<<' : '>>';
    this.dom.triggerEl.setAttribute('aria-expanded', String(opened));
    this.dom.triggerEl.setAttribute('aria-label', opened ? 'Close menu' : 'Open menu');
  },

  closeFromOverlay() {
    this.setMenuOpened(false);
  },

  showSessions() {
    Bus.emit(Bus.events.sessionsRequested);
    this.setMenuOpened(false);
  },

  render() {
    // Sources dropdown: always the hard-coded list, loaded or not.
    const current = App.currentOrigin;
    this.dom.sourcesEl.innerHTML = `<option value=""${!current ? ' selected' : ''}>source…</option>`
      + SOURCES_LIST.map(id => {
        const safe = Utils.escapeHtml(id);
        return `<option value="${safe}"${id === current ? ' selected' : ''}>${safe}</option>`;
      }).join('');

    // View highlight.
    Array.from(this.dom.viewSwitcherEl.querySelectorAll('.switchView')).forEach(btn => {
      btn.classList.toggle('active', btn.dataset.appType === App.currentView);
    });
  },

  // ---- source loading ------------------------------------------------------------

  changeSource(el) {
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
      return;
    }
    // The select shows the requested id already; restore it to the real current
    // origin in case the picker is cancelled.
    this.render();
    this.pickFile(id, picked => {
      Library.setSource(id, picked, 'file');
      App.selectOrigin(id);
    });
  },

  isHttp() {
    return location.protocol === 'http:' || location.protocol === 'https:';
  },

  async tryHttpFetch(id) {
    if(!this.isHttp()) return null;
    try {
      const response = await fetch('./vocab/' + encodeURIComponent(id) + '.txt?' + Date.now());
      if(response.ok) return await response.text();
    } catch(e) {
      console.warn('http fetch failed for', id, e);
    }
    return null;
  },

  // One file at a time. The picked file name must match the expected source id;
  // a mismatch is reported to the user and nothing is substituted silently.
  pickFile(id, onRaw) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,text/plain';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if(!file) return;
      const pickedId = file.name.replace(/\.txt$/i, '');
      if(pickedId !== id) {
        alert('Wrong file: expected "' + id + '.txt" but got "' + file.name + '".');
        return;
      }
      file.text().then(onRaw);
    };
    input.click();
  },

  async reloadCurrent() {
    const id = App.currentOrigin;
    if(!id) return;
    if(!confirm('Reload source "' + id + '"? Its progress and selection will be reset.')) return;

    const raw = await this.tryHttpFetch(id);
    if(raw != null) {
      Library.reloadSource(id, raw, 'http');
      return;
    }
    this.pickFile(id, picked => Library.reloadSource(id, picked, 'file'));
  },

  switchView(el) {
    App.setView(el.dataset.appType);
    this.setMenuOpened(false);
  },
};

Components.push(MenuUI);
