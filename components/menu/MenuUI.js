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
    viewSwitcherEl: '#menuViewSwitcher',
    reloadEl: '#menuReload',
    sessionsEl: '#menuSessions',
  },

  events: {
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
    this.isOpened = false;
    Bus.batchedMethod(this, 'render');
    Bus.on(Bus.events.originSelected, () => this.render());
    Bus.on(Bus.events.sourcesChanged, () => this.render());
    Bus.on(Bus.events.viewChanged, () => this.render());
    DropdownUI.on('menuSources', id => this.loadSource(id));
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
            ${DropdownUI.select({
              id: 'menuSources',
              items: SOURCES_LIST.map(id => ({ value: id })),
              placeholder: 'source…',
              cls: 'menuSourcesButton',
              menuCls: 'sourcesList',
            })}
            <button id="menuReload" type="button" aria-label="Reload current source">⟳</button>
            ${DropdownUI.burger({
              id: 'menuActions',
              cls: 'menuActionsButton v2',
              items: [
                { value: 'loadAllSources', label: 'Load all', disabled: true },
                { value: 'resetSpeech', label: 'reset speech', disabled: true },
                { value: 'resetApp', label: 'reset App', disabled: true },
                { value: 'exportState', label: 'export state', disabled: true },
                { value: 'importState', label: 'import state', disabled: true },
              ],
            })}
          </div>
          <div id="menuViewRow">
            <button id="menuSessions" type="button" aria-label="Sessions">A</button>
            <div id="menuViewSwitcher">${switchers}
            </div>
          </div>
          <div id="menuStructureSlot"></div>
        </div>
      </div>`;
    document.querySelector('#appBody').insertAdjacentHTML('beforeend', html);
    Utils.cacheComponentDom(this);
  },

  toggleMenu() {
    this.setMenuOpened(!this.isOpened);
  },

  setMenuOpened(opened) {
    this.isOpened = opened;
    this.render();
  },

  closeFromOverlay() {
    this.setMenuOpened(false);
  },

  showSessions() {
    Bus.emit(Bus.events.sessionsRequested);
    this.setMenuOpened(false);
  },

  async _installSource(id, raw, origin) {
    if(Library.hasSource(id)) {
      Library.reloadSource(id, raw, origin);
    } else {
      Library.setSource(id, raw, origin);
    }
    App.selectOrigin(id);
  },

  render() {
    // Menu open state: DOM only reflects component state.
    this.dom.root.classList.toggle('isOpened', this.isOpened);
    this.dom.triggerEl.textContent = this.isOpened ? '<<' : '>>';
    this.dom.triggerEl.setAttribute('aria-expanded', String(this.isOpened));
    this.dom.triggerEl.setAttribute('aria-label', this.isOpened ? 'Close menu' : 'Open menu');

    // Sources dropdown: always the hard-coded list, loaded or not.
    DropdownUI.setValue('menuSources', App.currentOrigin);

    // View highlight.
    Array.from(this.dom.viewSwitcherEl.querySelectorAll('.switchView')).forEach(btn => {
      btn.classList.toggle('active', btn.dataset.appType === App.currentView);
    });
  },

  // ---- source loading ------------------------------------------------------------

  async loadSource(id) {
    if(!id) return;
    if(Library.hasSource(id)) {
      Busy.beginAndRun(() => App.selectOrigin(id));
      return;
    }

    // Try http first (works when served over http://); fall back to picker.
    Busy.begin();
    let raw = null;
    try {
      raw = await this.tryHttpFetch(id);
    } finally {
      Busy.end();
    }
    if(raw != null) {
      Busy.beginAndRun(() => this._installSource(id, raw, 'http'));
      return;
    }
    // The dropdown shows the requested id already; restore it to the real current
    // origin in case the picker is cancelled.
    this.render();
    this.pickFile(id, picked => {
      Busy.beginAndRun(() => this._installSource(id, picked, 'file'));
    });
  },

  isHttp() {
    return location.protocol === 'http:' || location.protocol === 'https:';
  },

  async tryHttpFetch(id) {
    if(!this.isHttp()) return null;
    try {
      const response = await fetch(`./vocab/${encodeURIComponent(id)}.txt?${Date.now()}`);
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
        Prompt.notify(`Wrong file: expected "${id}.txt" but got "${file.name}".`);
        return;
      }
      file.text().then(onRaw);
    };
    input.click();
  },

  reloadCurrent() {
    const id = App.currentOrigin;
    if(!id) return;
    Prompt.ask({
      text: `Reload source "${id}"? Its progress and selection will be reset.`,
      onConfirm: () => this.doReload(id),
    });
  },

  async doReload(id) {
    Busy.begin();
    let raw = null;
    try {
      raw = await this.tryHttpFetch(id);
    } finally {
      Busy.end();
    }
    if(raw != null) {
      Busy.beginAndRun(() => this._installSource(id, raw, 'http'));
      return;
    }
    this.pickFile(id, picked => {
      Busy.beginAndRun(() => this._installSource(id, picked, 'file'));
    });
  },

  switchView(el) {
    Busy.beginAndRun(() => {
      App.setView(el.dataset.appType);
      this.setMenuOpened(false);
    });
  },
};

Components.push(MenuUI);
