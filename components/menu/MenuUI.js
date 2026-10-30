/*
   MenuUI: slide-out panel with source selector, view switcher, sessions button,
   reload and the global actions menu (load all, speech, app state). A source
   loads via http when served over http(s)://, otherwise (or when http fails)
   via a file picker. The menu does not know which views exist: every
   registered component that declares viewName/viewLabel gets a switch button,
   and the menu only calls App.setView().
  
   Reset and import replace the whole persisted state and then reload the page:
   views keep in-memory state of their own, and a reload is the only reliable
   way to make every component start from the new data. Storage writes are
   immediate, so nothing is lost by reloading.
*/
const MenuUI = {
  name: 'MenuUI',

  // Global actions: one table feeds both the dropdown items and the dispatch.
  actions: [
    { value: 'loadAllSources', label: 'Load all', run: menu => menu.loadAllSources() },
    { value: 'updateSource', label: 'update source', run: menu => menu.updateCurrent() },
    { value: 'resetSpeech', label: 'reset speech', run: () => Utils.cancelSpeech() },
    { value: 'resetApp', label: 'reset App', run: menu => menu.resetApp() },
    { value: 'exportState', label: 'export state', run: menu => menu.exportState() },
    { value: 'importState', label: 'import state', run: menu => menu.importState() },
  ],

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
    Bus.on(Bus.events.sourceSelected, () => this.render());
    Bus.on(Bus.events.sourcesChanged, () => this.render());
    Bus.on(Bus.events.viewChanged, () => this.render());
    DropdownUI.on('menuSources', id => this.loadSource(id));
    DropdownUI.on('menuActions', value => this.runAction(value));
  },

  runAction(value) {
    this.actions.find(action => action.value === value)?.run(this);
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
              items: this.actions.map(({ value, label }) => ({ value, label })),
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
    App.selectSource(id);
  },

  render() {
    // Menu open state: DOM only reflects component state.
    this.dom.root.classList.toggle('isOpened', this.isOpened);
    this.dom.triggerEl.textContent = this.isOpened ? '<<' : '>>';
    this.dom.triggerEl.setAttribute('aria-expanded', String(this.isOpened));
    this.dom.triggerEl.setAttribute('aria-label', this.isOpened ? 'Close menu' : 'Open menu');

    // Sources dropdown: always the hard-coded list, loaded or not.
    DropdownUI.setValue('menuSources', App.currentSource);

    // View highlight.
    Array.from(this.dom.viewSwitcherEl.querySelectorAll('.switchView')).forEach(btn => {
      btn.classList.toggle('active', btn.dataset.appType === App.currentView);
    });
  },

  // ---- source loading ------------------------------------------------------------

  async loadSource(id) {
    if(!id) return;
    if(Library.hasSource(id)) {
      Busy.beginAndRun(() => App.selectSource(id));
      return;
    }

    // The dropdown shows the requested id already; restore it to the real current
    // source in case the picker is cancelled.
    await this.fetchOrPick(id, (raw, origin) => {
      Busy.beginAndRun(() => this._installSource(id, raw, origin));
    }, () => this.render());
  },

  /*
    Gets the text of a source: http first (works when served over http://),
    otherwise a file picker. onRaw(raw, origin) is called with the text;
    beforePick runs just before the picker opens.
  */
  async fetchOrPick(id, onRaw, beforePick) {
    Busy.begin();
    let raw = null;
    try {
      raw = await this.tryHttpFetch(id);
    } finally {
      Busy.end();
    }
    if(raw != null) {
      onRaw(raw, 'http');
      return;
    }
    if(beforePick) beforePick();
    this.pickFile(id, picked => onRaw(picked, 'file'));
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
    this.pickFiles({
      accept: '.txt,text/plain',
      onFiles: files => {
        const file = files[0];
        const pickedId = file.name.replace(/\.txt$/i, '');
        if(pickedId !== id) {
          Prompt.notify(`Wrong file: expected "${id}.txt" but got "${file.name}".`);
          return;
        }
        file.text().then(onRaw);
      },
    });
  },

  // Opens the system file picker. Must be called within a user gesture.
  // The input is never attached to the document; onFiles gets a non-empty array.
  pickFiles({ accept, multiple = false, onFiles }) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => {
      const files = Array.from(input.files || []);
      if(files.length) onFiles(files);
    };
    input.click();
  },

  // ---- global actions ------------------------------------------------------------

  // Loads only sources that are not loaded yet; loaded ones keep their progress
  // and selection, so no confirmation is needed. The current source is not changed.
  async loadAllSources() {
    const ids = Library.missingIds();
    if(!ids.length) {
      Prompt.notify('All sources are already loaded.');
      return;
    }
    if(this.isHttp()) {
      await this.loadMissingOverHttp(ids);
      return;
    }
    this.pickFiles({
      accept: '.txt,text/plain',
      multiple: true,
      onFiles: files => this.loadMissingFromFiles(ids, files),
    });
  },

  async loadMissingOverHttp(ids) {
    Busy.begin();
    let results = [];
    try {
      results = await Promise.all(ids.map(async id => ({ id, raw: await this.tryHttpFetch(id) })));
    } finally {
      Busy.end();
    }
    const loaded = results.filter(item => item.raw != null);
    const failed = results.filter(item => item.raw == null).map(item => item.id);
    if(loaded.length) this.installAll(loaded, 'http');
    if(failed.length) Prompt.notify(`Could not load: ${failed.join(', ')}.`);
  },

  // Files are matched to missing sources by name; the rest are reported, not guessed.
  async loadMissingFromFiles(ids, files) {
    const wanted = files.filter(file => ids.includes(file.name.replace(/\.txt$/i, '')));
    const skipped = files.filter(file => !wanted.includes(file)).map(file => file.name);
    const loaded = await Promise.all(wanted.map(async file => ({
      id: file.name.replace(/\.txt$/i, ''),
      raw: await file.text(),
    })));
    if(loaded.length) this.installAll(loaded, 'file');
    if(skipped.length) {
      Prompt.notify(`Skipped (not a missing source): ${skipped.join(', ')}.`);
    }
  },

  installAll(items, origin) {
    Busy.beginAndRun(() => {
      items.forEach(({ id, raw }) => Library.setSource(id, raw, origin));
    });
  },

  resetApp() {
    Prompt.ask({
      text: 'Reset the whole app? Sources, progress, selections and settings will be erased.',
      onConfirm: () => {
        Backup.reset();
        location.reload();
      },
    });
  },

  // The file is handed to the browser through a temporary link.
  exportState() {
    const { filename, json } = Backup.serialize();
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoking at once can abort the download in mobile browsers.
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  },

  // The picker opens inside the Prompt callback (it runs synchronously) to keep
  // the user gesture. The file is validated before the current state is touched.
  importState() {
    Prompt.ask({
      text: 'Replace the current state with the contents of a file?',
      onConfirm: () => this.pickFiles({
        accept: '.json,application/json',
        onFiles: files => this.importFromFile(files[0]),
      }),
    });
  },

  async importFromFile(file) {
    const result = Backup.parse(await file.text());
    if(!result.ok) {
      Prompt.notify(`Import failed: ${result.error}`);
      return;
    }
    Backup.apply(result.data);
    location.reload();
  },

  reloadCurrent() {
    const id = App.currentSource;
    if(!id) return;
    Prompt.ask({
      text: `Reload source "${id}"? Its progress and selection will be reset.`,
      onConfirm: () => this.doReload(id),
    });
  },

  async doReload(id) {
    await this.fetchOrPick(id, (raw, origin) => {
      Busy.beginAndRun(() => this._installSource(id, raw, origin));
    });
  },

  /*
    Replaces only the text of the current source: progress and selection stay.
    No confirmation, the user is responsible for keeping the structure of the
    file (entries, lines, sections) as it was. Unlike reloadCurrent().
  */
  async updateCurrent() {
    const id = App.currentSource;
    if(!id || !Library.hasSource(id)) return;
    await this.fetchOrPick(id, (raw, origin) => {
      Busy.beginAndRun(() => Library.updateSource(id, raw, origin));
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
