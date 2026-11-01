/*
   ListsUI: modal catalog of the custom lists, empty ones included (the sources
   menu shows only lists with entries). A tap on a name switches to the list and
   opens it in Data, where its entries can be managed; working with it in another
   View is done by opening it from the sources menu;
   rename, delete and creation go through ListPrompts. It is a dialog and not a
   View: it manages the lists themselves, while Views show the entries of the
   current source, and it must not take over the persisted current view.

   Component state: isOpen. Everything else is read from Collections.
*/
const ListsUI = {
  name: 'ListsUI',

  // The viewName of DataViewUI: the View where the entries of a list are managed.
  DATA_VIEW: 'data',

  selectors: {
    root: '#lists',
    closeEl: '#listsClose',
    listEl: '#listsList',
    newEl: '#listsNew',
  },

  events: {
    click: {
      '#lists': 'closeFromOverlay',
      '@closeEl': 'close',
      '@newEl': 'createList',
      '#listsList [data-list-pick]': 'pickList',
      '#listsList [data-list-rename]': 'renameList',
      '#listsList [data-list-delete]': 'deleteList',
    },
  },

  init() {
    this.ensureMarkup();
    this.isOpen = false;
    Bus.batchedMethod(this, 'render');
    Bus.on(Bus.events.listsRequested, () => this.open());
    Bus.on(Bus.events.collectionsChanged, () => this.render());
    Bus.on(Bus.events.sourceSelected, () => this.render());
  },

  ensureMarkup() {
    if(this.dom?.root) return;
    const html = `
      <div id="lists" class="hidden">
        <div id="listsDialog" role="dialog" aria-label="Lists">
          <button id="listsClose" type="button" aria-label="Close">&times;</button>
          <h3>Lists</h3>
          <div id="listsList"></div>
          <button id="listsNew" type="button">＋ New list</button>
        </div>
      </div>
      `;
    document.querySelector('#appBody').insertAdjacentHTML('beforeend', html);
    Utils.cacheComponentDom(this);
  },

  open() {
    this.isOpen = true;
    this.render();
  },

  close() {
    this.isOpen = false;
    this.render();
  },

  closeFromOverlay(el, e) {
    // Only a click on the dimmed overlay itself closes.
    if(e.target === this.dom.root) this.close();
  },

  // The only place that reads domain state. Not computed while the dialog is closed.
  viewModel() {
    return {
      isOpen: this.isOpen,
      lists: this.isOpen
        ? Collections.overview().map(list => Object.assign({}, list, {
          current: list.sourceId === App.currentSource,
        }))
        : [],
    };
  },

  template(vm) {
    return `
      <ul class="listsItems">
        ${vm.lists.map(list => this.itemTemplate(list)).join('')}
      </ul>
      `;
  },

  /*
    An empty list is shown dimmed and cannot be opened. Global cannot be renamed;
    it is cleared instead of deleted, and only when there is something to clear.
  */
  itemTemplate(list) {
    const id = Utils.escapeHtml(list.listId);
    const canDelete = list.exists && (!list.isDefault || list.count > 0);
    return `
      <li class="listsItem
        ${list.count ? '' : 'empty'}
        ${list.current ? 'current' : ''}"
        >
        <span class="listsName"
          ${list.count ? `data-list-pick="${Utils.escapeHtml(list.sourceId)}"` : ''}
          >${Utils.escapeHtml(list.name)}
        </span>
        <span class="listsActions">
          <span class="listsCount tag">${Utils.escapeHtml(list.count)}</span>
          ${list.isDefault || !list.exists ? '' : `
          <button class="listsAction iconButton" type="button" aria-label="Rename"
            data-list-rename="${id}">✎</button>`}
          ${canDelete ? `
          <button class="listsAction iconButton" type="button"
            aria-label="${list.isDefault ? 'Clear' : 'Delete'}"
            data-list-delete="${id}">🗑</button>` : ''}
        </span>
      </li>
      `;
  },

  render() {
    const vm = this.viewModel();
    this.dom.root.classList.toggle('hidden', !vm.isOpen);
    this.dom.listEl.innerHTML = vm.isOpen ? this.template(vm) : '';
  },

  // ---- handlers (clean: change domain state, then it is announced) ------------------

  pickList(el) {
    Busy.beginAndRun(() => {
      App.selectSource(el.dataset.listPick);
      App.setView(this.DATA_VIEW);
      this.close();
    });
  },

  createList() {
    ListPrompts.createList();
  },

  renameList(el) {
    ListPrompts.renameList(el.dataset.listRename);
  },

  deleteList(el) {
    ListPrompts.deleteList(el.dataset.listDelete);
  },
};

Components.push(ListsUI);
