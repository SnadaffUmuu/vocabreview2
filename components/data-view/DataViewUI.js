/*
   DataViewUI: read-only, maximally detailed dump of the selected collection
   for the current source, plus a search box. No tests/editor (not wanted).
   Shows/hides itself based on App.currentView === 'data'.
  
   Component state:
     onlyFiltered - the "only selection" checkbox
     searchValue  - the applied search query
   The text typed into the search input is an uncommitted draft that lives in
   the input itself (caret, IME); render() never writes it back. It becomes
   state when the user commits it (Enter / the search event).

   Data is read-only for the text of entries. Every entry, wherever it comes
   from (a file, a search result, a list), can be copied to a custom list. An
   entry of the current list can also be removed from it for good (with its
   progress), after a confirmation. The list is shown whole, so "only selection"
   is hidden for it. Search results come from the files, not from the list, and
   cannot be removed.
*/
const DataViewUI = {
  name: 'DataViewUI',
  viewName: 'data',
  viewLabel: 'D',

  selectors: {
    root: '#dataView',
    searchEl: '#dataSearch',
    filteredEl: '#dataFiltered',
    filteredBoxEl: '#dataFilteredBox',
    counterEl: '#dataResCounter',
    outputEl: '#dataOutput',
  },

  events: {
    keydown: { '@searchEl': 'doSearch' },
    search: { '@searchEl': 'doSearchValue' },
    change: { '@filteredEl': 'changeFiltered' },
    click: {
      '#dataOutput .dataEntryAdd': 'addToList',
      '#dataOutput .dataEntryRemove': 'removeFromList',
    },
  },

  onlyFiltered: true,
  searchValue: '',

  init() {
    this.ensureMarkup();
    Bus.batchedMethod(this, 'render');
    Bus.on(Bus.events.viewChanged, () => this.render());
    Bus.on(Bus.events.sourceSelected, () => this.render());
    Bus.on(Bus.events.selectionChanged, () => this.render());
    Bus.on(Bus.events.sourcesChanged, () => this.render());
    // Entries of the current list changed, or the list was renamed or deleted.
    Bus.on(Bus.events.collectionsChanged, () => this.render());
  },

  ensureMarkup() {
    if(this.dom?.root) return;
    const html = `
      <div id="dataView" class="appView hidden">
        <div id="dataViewActions">
          <label id="dataFilteredBox">only selection <input type="checkbox" id="dataFiltered"></label>
          <input type="search" id="dataSearch" placeholder="search">
          <div id="dataResCounter" class="tag"></div>
        </div>
        <div id="dataOutput"></div>
      </div>
      `;
    document.querySelector('#appBody').insertAdjacentHTML('beforeend', html);
    Utils.cacheComponentDom(this);
  },

  // ---- handlers (clean: change component state, then render) ------------------------

  changeFiltered(el) {
    this.onlyFiltered = el.checked;
    this.render();
  },

  /*
     Copies an entry to a list chosen in the prompt (the same flow as the "+" of
     an open card). The entry is found by its own source: search results come
     from several sources, and their ids repeat. The target may be the list the
     entry is in: a copy that the list already has is refused as a duplicate.
     Together with the removal this makes moving an entry between lists.
  */
  addToList(el) {
    const source = Library.getSource(el.dataset.sourceId);
    const entryId = Number(el.dataset.entryId);
    const entry = source?.parsed.allEntries.find(item => item.id === entryId);
    if(entry) ListPrompts.addEntry(entry);
  },

  // Confirmed by ListPrompts; the list announces the change and render() follows.
  removeFromList(el) {
    const sourceId = App.currentSource;
    if(!sourceId || !Collections.isListId(sourceId)) return;
    ListPrompts.removeEntry(Collections.listIdOf(sourceId), Number(el.dataset.entryId));
  },

  // Enter on a mobile keyboard may report keyCode 229/0, so check e.key. The
  // 'search' event (fired by type=search on Enter or clear) is handled too.
  doSearch(el, e) {
    if(e.key === 'Enter') this.doSearchValue(el);
  },

  // DOM-touching: commits the input draft (see the header) into state.
  doSearchValue(el) {
    const value = el.value.trim();
    if(value === this.searchValue) return;
    this.searchValue = value;
    this.render();
  },

  // ---- view model ----------------------------------------------------------------

  // The only place that reads domain state. Nothing is computed while the view
  // is hidden: selection changes fire for every view.
  viewModel() {
    const visible = App.currentView === this.viewName;
    const sourceId = App.currentSource;
    const vm = {
      visible,
      isList: Collections.isListId(sourceId),
      onlyFiltered: this.onlyFiltered,
      query: this.searchValue,
      count: '',
      entries: [],
    };
    if(!visible || !sourceId || !Library.hasSource(sourceId)) return vm;

    const entries = this.entriesToShow(sourceId);
    const removable = vm.isList && !this.searchValue;
    vm.count = String(entries.length);
    vm.entries = entries.map(entry =>
      Object.assign(this.entryViewModel(entry, sourceId), {
        id: entry.id,
        removable,
        copyable: true,
      }));
    return vm;
  },

  entriesToShow(sourceId) {
    if(this.searchValue) return this.searchAllSources(this.searchValue);
    return this.onlyFiltered
      ? App.selectedEntries(sourceId)
      : Library.getSource(sourceId).parsed.allEntries;
  },

  searchAllSources(query) {
    const results = [];
    Library.listIds().forEach(id => {
      const source = Library.getSource(id);
      source.parsed.allEntries.forEach(entry => {
        if(entry.lines.some(l => l.text.indexOf(query) !== -1)) {
          const copy = Object.assign({}, entry, {
            sourceId: id,
            lines: entry.lines.slice(),
          });
          results.push(copy);
        }
      });
    });
    return results;
  },

  // Plain data for one entry; template() needs neither Library nor App.
  entryViewModel(entry, fallbackSourceId) {
    const sourceId = entry.sourceId || fallbackSourceId;
    const source = Library.getSource(sourceId);
    return {
      sourceId,
      tag: entry.tag,
      info: entry.info,
      reviewLevel: entry.reviewLevel,
      lines: entry.lines.map((line, i) => ({
        text: line.text,
        role: line.role,
        compact: !!line.isCompact,
        translationLineIndex: line.translationLineIndex,
        // Only the first line of an entry carries the review level.
        level: i === 0 && entry.reviewLevel ? entry.reviewLevel : '',
        levelStyle: i === 0 && entry.reviewLevel
          ? this.reviewLevelStyle(entry.reviewLevel) : '',
      })),
      breadcrumbs: this.breadcrumbs(source ? source.parsed.structure : [], entry.section),
    };
  },

  reviewLevelStyle(rl) {
    const p = parseInt(rl, 10);
    const color = p >= 100 ? 'var(--revLevelTextColor)' : 'var(--revLevelMinorTextColor)';
    const width = p < 100 ? (p - 1) : rl.substring(0, 1);
    return `color:${color}; border-bottom:${width}px solid ${color};`;
  },

  breadcrumbs(structure, sectionId) {
    if(sectionId == null) return '';
    const parts = sectionId.split('.');
    let nodes = structure;
    const names = [];
    for(let i = 0; i < parts.length; i++) {
      const node = nodes[parseInt(parts[i], 10)];
      if(!node) break;
      names.push(node.name);
      nodes = node.children || [];
    }
    return names.join(' / ');
  },

  // ---- markup --------------------------------------------------------------------

  template(vm) {
    return vm.entries.map(entry => this.entryTemplate(entry, vm.query)).join('');
  },

  entryTemplate(entry, query) {
    return `
      <article class="dataEntry">
        <div class="dataEntryRow">
          <div class="dataEntryMain">
            ${entry.tag ? `
            <div class="tag">${Utils.escapeHtml(entry.tag)}</div>` : ''}
            <ul class="linesList">${entry.lines.map(line => this.lineTemplate(line, query)).join('')}</ul>
            ${entry.info ? `
            <div class="entryInfo">ⓘ&nbsp;${Utils.escapeHtml(entry.info)}</div>` : ''}
          </div>
          ${entry.reviewLevel || entry.removable || entry.copyable ? `
          <div class="dataEntryAside">
            ${entry.reviewLevel ? `
            <div class="reviewLevel tag">${Utils.escapeHtml(entry.reviewLevel)}</div>` : ''}
            ${entry.removable || entry.copyable ? `
            <div class="dataEntryActions">
              ${entry.copyable ? `
              <button class="dataEntryAdd iconButton" type="button"
                aria-label="Add to a list"
                data-entry-id="${Utils.escapeHtml(entry.id)}"
                data-source-id="${Utils.escapeHtml(entry.sourceId)}"
                >＋</button>` : ''}
              ${entry.removable ? `
              <button class="dataEntryRemove iconButton" type="button"
                aria-label="Remove from the list"
                data-entry-id="${Utils.escapeHtml(entry.id)}"
                >🗑</button>` : ''}
            </div>` : ''}
          </div>` : ''}
        </div>
        <div class="section">${query ? `
          <span class="entrySource">${Utils.escapeHtml(entry.sourceId)}</span> ` : ''}
          ${Utils.escapeHtml(entry.breadcrumbs)}
        </div>
      </article>
      `;
  },

  // Inline content stays on the tag lines on purpose: whitespace inside <li>
  // would change how the line looks.
  lineTemplate(line, query) {
    const text = this.highlight(line.text, query);
    const roleSuffix = line.translationLineIndex != null
      ? ` (trans.l.index: ${Utils.escapeHtml(line.translationLineIndex)})` : '';
    return `
      <li
        ${line.role ? `data-role="${Utils.escapeHtml(line.role)}"` : ''}
        ${line.compact ? 'class="compact"' : ''}
        >${line.level ? `<span class="revLevel"
          data-review-level="${Utils.escapeHtml(line.level)}"
          style="${Utils.escapeHtml(line.levelStyle)}"
          >${text}</span>` : text}${line.role ? `<span class="lineRole"> ......${Utils.escapeHtml(line.role)}${roleSuffix}</span>` : ''}</li>
      `;
  },

  highlight(text, query) {
    if(!query) return Utils.escapeHtml(text);
    const parts = String(text).split(query);
    return parts.map(Utils.escapeHtml).join(`<strong>${Utils.escapeHtml(query)}</strong>`);
  },

  render() {
    const vm = this.viewModel();
    this.dom.root.classList.toggle('hidden', !vm.visible);
    this.dom.filteredEl.checked = vm.onlyFiltered;
    this.dom.filteredBoxEl.classList.toggle('hidden', vm.isList);
    this.dom.counterEl.textContent = vm.count;
    this.dom.outputEl.innerHTML = this.template(vm);
  },
};

Components.push(DataViewUI);
