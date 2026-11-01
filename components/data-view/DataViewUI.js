/*
   DataViewUI: read-only, maximally detailed dump of the selected collection
   for the current source, and the place where entries are searched for and
   collected into custom lists. No tests/editor (not wanted).
   Shows/hides itself based on App.currentView === 'data'.

   Two modes. Without criteria it shows the selection of the current source (a
   list: the whole list) with no limit: that is what is reviewed before another
   pass through a book. As soon as one criterion is set (text, tag, kind of
   the card; see EntrySearch) it searches the loaded files: all of them by
   default, narrowed by "only selection" (the selection of the current source)
   or by the sources the user took off in the "Adjust sources" dialog. Lists
   are never searched: they hold no content of their own.

   Component state:
     onlySelection - the "only selection" checkbox; counts only while searching
     searchValue   - the applied text of the search
     tag, kind     - the other criteria
     sourcesOff    - ids of the sources taken off the search
     showAll       - the user agreed to mount a result bigger than SHOW_LIMIT
     picked        - keys of the ticked results; they go to a list in one batch
     adjustOpen    - the "Adjust sources" dialog is open
   None of the search settings is persisted: what is worth keeping goes to a
   list. A result is dropped (showAll, picked) whenever what it was made of
   changes, so a big result always has to be confirmed anew.
   The text typed into the search input is an uncommitted draft that lives in
   the input itself (caret, IME); render() never writes it back. It becomes
   state when the user commits it (Enter / the search event).

   Data is read-only for the text of entries. Every entry, wherever it comes
   from (a file, a search result, a list), can be copied to a custom list. An
   entry of the current list can also be removed from it for good (with its
   progress), after a confirmation. The list is shown whole, so "only selection"
   is hidden for it. Search results come from the files, not from the list, and
   cannot be removed.

   Why a big result is not mounted: the DOM of thousands of entries kills the
   browser, and a Board over a huge list is no better. Many entries go to a list
   only through the ticks, i.e. through what is shown.
*/
const DataViewUI = {
  name: 'DataViewUI',
  viewName: 'data',
  viewLabel: 'D',

  // A result bigger than this is announced and mounted only on request.
  SHOW_LIMIT: 100,
  TAG_ID: 'dataTagSelect',
  KIND_ID: 'dataKindSelect',

  selectors: {
    root: '#dataView',
    searchEl: '#dataSearch',
    filtersEl: '#dataFilters',
    filteredEl: '#dataFiltered',
    filteredBoxEl: '#dataFilteredBox',
    scopeEl: '#dataScope',
    adjustEl: '#dataAdjust',
    counterEl: '#dataResCounter',
    pickerEl: '#dataPicker',
    outputEl: '#dataOutput',
    sourcesRootEl: '#dataSources',
    sourcesListEl: '#dataSourcesList',
  },

  events: {
    keydown: { '@searchEl': 'doSearch' },
    search: { '@searchEl': 'doSearchValue' },
    change: {
      '@filteredEl': 'changeFiltered',
      '#dataOutput .dataPick': 'pickEntry',
      '#dataSourcesList .dataSourceCheck': 'toggleSource',
    },
    click: {
      '@adjustEl': 'openSources',
      '#dataSources': 'closeSourcesFromOverlay',
      '#dataSourcesClose': 'closeSources',
      '#dataSourcesAll': 'takeAllSources',
      '#dataSourcesNone': 'takeNoSources',
      '#dataFilters .dataFilterClear': 'clearFilter',
      '#dataOutput .dataShow': 'showResult',
      '#dataOutput .dataEntryAdd': 'addToList',
      '#dataOutput .dataEntryRemove': 'removeFromList',
      '#dataPicker .dataPickAll': 'pickAll',
      '#dataPicker .dataPickNone': 'pickNone',
      '#dataPicker .dataPickAdd': 'addPicked',
    },
  },

  onlySelection: false,
  searchValue: '',
  tag: '',
  kind: EntrySearch.ANY_KIND,
  sourcesOff: new Set(),
  showAll: false,
  picked: new Set(),
  adjustOpen: false,

  // Memoized analysis(); dropped together with the result.
  cache: null,

  // A new result is read from its top; see render().
  scrollToTop: false,

  init() {
    this.ensureMarkup();
    Bus.batchedMethod(this, 'render');
    Bus.on(Bus.events.viewChanged, () => this.render());
    // What a result is made of changed: it is not valid any more.
    Bus.on(Bus.events.sourceSelected, () => this.resetResult());
    Bus.on(Bus.events.selectionChanged, () => this.resetResult());
    Bus.on(Bus.events.sourcesChanged, () => this.resetResult());
    // Entries of the current list changed, or the list was renamed or deleted.
    Bus.on(Bus.events.collectionsChanged, () => this.render());
    DropdownUI.on(this.TAG_ID, value => this.chooseTag(value));
    DropdownUI.on(this.KIND_ID, value => this.chooseKind(value));
  },

  ensureMarkup() {
    if(this.dom?.root) return;
    const html = `
      <div id="dataView" class="appView hidden">
        <div id="dataViewActions">
          <div id="dataSearchRow">
            <input type="search" id="dataSearch" placeholder="search">
            <div id="dataResCounter" class="tag"></div>
          </div>
          <div id="dataFilters"></div>
          <div id="dataScope">
            <label id="dataFilteredBox">only selection <input type="checkbox" id="dataFiltered"></label>
            <button id="dataAdjust" type="button">sources</button>
          </div>
          <div id="dataPicker"></div>
        </div>
        <div id="dataOutput"></div>
      </div>
      <div id="dataSources" class="hidden">
        <div id="dataSourcesDialog" role="dialog" aria-label="Sources">
          <button id="dataSourcesClose" type="button" aria-label="Close">&times;</button>
          <h3>Sources to search in</h3>
          <div id="dataSourcesButtons">
            <button id="dataSourcesAll" type="button">select all</button>
            <button id="dataSourcesNone" type="button">deselect all</button>
          </div>
          <div id="dataSourcesList"></div>
        </div>
      </div>
      `;
    document.querySelector('#appBody').insertAdjacentHTML('beforeend', html);
    Utils.cacheComponentDom(this);
  },

  // ---- handlers (clean: change component state, then render) ------------------------

  // The result is not valid any more: the next one has to be confirmed and ticked anew.
  resetResult() {
    this.cache = null;
    this.scrollToTop = true;
    this.showAll = false;
    this.picked = new Set();
    this.render();
  },

  changeFiltered(el) {
    this.onlySelection = el.checked;
    this.resetResult();
  },

  chooseTag(value) {
    this.tag = value;
    this.resetResult();
  },

  chooseKind(value) {
    this.kind = value;
    this.resetResult();
  },

  // The reset button of a chosen filter: the same as choosing its "any ..." item.
  clearFilter(el) {
    if(el.dataset.filter === 'tag') this.chooseTag('');
    else if(el.dataset.filter === 'kind') this.chooseKind(EntrySearch.ANY_KIND);
  },

  openSources() {
    this.adjustOpen = true;
    this.render();
  },

  closeSources() {
    this.adjustOpen = false;
    this.render();
  },

  closeSourcesFromOverlay(el, e) {
    // Only a click on the dimmed overlay itself closes.
    if(e.target === this.dom.sourcesRootEl) this.closeSources();
  },

  toggleSource(el) {
    const sourcesOff = new Set(this.sourcesOff);
    if(el.checked) sourcesOff.delete(el.dataset.sourceId);
    else sourcesOff.add(el.dataset.sourceId);
    this.sourcesOff = sourcesOff;
    this.resetResult();
  },

  takeAllSources() {
    this.sourcesOff = new Set();
    this.resetResult();
  },

  takeNoSources() {
    this.sourcesOff = new Set(Library.knownIds());
    this.resetResult();
  },

  showResult() {
    this.showAll = true;
    this.render();
  },

  /*
     DOM-touching exception: the browser has already toggled the checkbox, and the
     state follows it. Only the bar with the counter is written again: mounting a
     result of hundreds of entries on every tick would make it unusable.
  */
  pickEntry(el) {
    const picked = new Set(this.picked);
    if(el.checked) picked.add(el.dataset.pickKey);
    else picked.delete(el.dataset.pickKey);
    this.picked = picked;
    this.renderPicker(this.pickerViewModel(this.resultOf(App.currentSource)));
  },

  // Only what is mounted can be ticked.
  pickAll() {
    const result = this.resultOf(App.currentSource);
    if(!this.pickerViewModel(result).visible) return;
    this.picked = new Set(result.found.map(item => this.pickKey(item.sourceId, item.entry.id)));
    this.render();
  },

  pickNone() {
    this.picked = new Set();
    this.render();
  },

  // The list is asked by ListPrompts; the ticks are dropped once the cards are in.
  addPicked() {
    const result = this.resultOf(App.currentSource);
    if(!this.pickerViewModel(result).visible || !this.picked.size) return;
    const entries = result.found
      .filter(item => this.picked.has(this.pickKey(item.sourceId, item.entry.id)))
      .map(item => Object.assign({}, item.entry, { sourceId: item.sourceId }));
    ListPrompts.addEntries(entries, () => this.pickNone());
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
    this.resetResult();
  },

  // ---- view model ----------------------------------------------------------------

  pickKey(sourceId, entryId) {
    return `${sourceId}|${entryId}`;
  },

  criteria() {
    return { query: this.searchValue, tag: this.tag, kind: this.kind };
  },

  // The selection narrows the search only for a file: a list has no selection.
  isNarrowedToSelection(sourceId) {
    return this.onlySelection && !Collections.isListId(sourceId) && Library.hasSource(sourceId);
  },

  // What is searched in: the selection of the current file, or the loaded files.
  scopeSources(sourceId) {
    if(this.isNarrowedToSelection(sourceId)) {
      return [{ sourceId, entries: App.selectedEntries(sourceId) }];
    }
    return Library.listIds().map(id => ({
      sourceId: id,
      entries: Library.getSource(id).parsed.allEntries,
    }));
  },

  /*
     The search over the scope, together with the counts for the filters. It is
     a pure function of the criteria and of the sources, so it is remembered
     until one of them changes (resetResult): a tick or a tap on "show" must
     not search the whole library again.
  */
  analysis(sourceId) {
    const criteria = this.criteria();
    const key = JSON.stringify([
      criteria,
      sourceId,
      this.isNarrowedToSelection(sourceId),
      Array.from(this.sourcesOff).sort(),
    ]);
    if(this.cache?.key !== key) {
      const narrowed = this.isNarrowedToSelection(sourceId);
      const isChosen = id => narrowed || !this.sourcesOff.has(id);
      this.cache = {
        key,
        value: EntrySearch.analyze(this.scopeSources(sourceId), criteria, isChosen),
      };
    }
    return this.cache.value;
  },

  /*
     What is found and how much of it is mounted. Without criteria it is the
     selection of the current source. A result of a search bigger than SHOW_LIMIT
     stays unmounted until the user asks for it.
  */
  resultOf(sourceId) {
    const searching = EntrySearch.isActive(this.criteria());
    const analysis = this.analysis(sourceId);
    let found = [];
    if(searching) {
      found = analysis.items;
    } else if(Library.hasSource(sourceId)) {
      found = App.selectedEntries(sourceId).map(entry => ({ sourceId, entry }));
    }
    return {
      searching,
      analysis,
      found,
      mounted: !searching || this.showAll || found.length <= this.SHOW_LIMIT,
    };
  },

  // The only place that reads domain state. Nothing is computed while the view
  // is hidden: selection changes fire for every view.
  viewModel() {
    const visible = App.currentView === this.viewName;
    const sourceId = App.currentSource;
    const isList = Collections.isListId(sourceId);
    const vm = {
      visible,
      isList,
      searching: false,
      onlySelection: this.onlySelection,
      query: this.searchValue,
      count: '',
      hiddenCount: 0,
      entries: [],
      narrowed: false,
      adjustOpen: false,
      filters: this.filtersViewModel(null),
      sources: [],
      picker: this.pickerViewModel(null),
    };
    if(!visible) return vm;

    const result = this.resultOf(sourceId);
    vm.searching = result.searching;
    vm.count = String(result.found.length);
    vm.filters = this.filtersViewModel(result.analysis);
    vm.narrowed = this.isNarrowedToSelection(sourceId);
    vm.adjustOpen = this.adjustOpen;
    if(this.adjustOpen) vm.sources = this.sourcesViewModel(result.analysis);
    vm.picker = this.pickerViewModel(result);
    if(!result.mounted) {
      vm.hiddenCount = result.found.length;
      return vm;
    }
    const removable = isList && !result.searching;
    vm.entries = result.found.map(({ sourceId: id, entry }) => {
      const pickKey = this.pickKey(id, entry.id);
      return Object.assign(this.entryViewModel(entry, id), {
        id: entry.id,
        removable,
        copyable: true,
        fromSearch: result.searching,
        pickKey,
        picked: this.picked.has(pickKey),
      });
    });
    return vm;
  },

  // The bar of the ticks: only for a result that is mounted.
  pickerViewModel(result) {
    const shown = !!result && result.searching && result.mounted;
    return {
      visible: shown && result.found.length > 0,
      pickedCount: this.picked.size,
    };
  },

  // Items of the two dropdowns, counted for the other criteria and the scope.
  filtersViewModel(result) {
    const tagCounts = result ? result.tagCounts : {};
    const tags = Object.keys(tagCounts);
    if(this.tag && !tags.includes(this.tag)) tags.push(this.tag);
    tags.sort((a, b) => a.localeCompare(b));
    return {
      tag: this.tag,
      kind: this.kind,
      tagItems: [{ value: '', label: 'any tag' }].concat(tags.map(tag => ({
        value: tag,
        label: `${tag} (${tagCounts[tag] || 0})`,
      }))),
      kindItems: EntrySearch.KINDS.map(kind => ({
        value: kind.value,
        label: result ? `${kind.label} (${result.kindCounts[kind.value]})` : kind.label,
      })),
    };
  },

  // Every listed source: one that is not loaded cannot be searched in.
  sourcesViewModel(result) {
    const loaded = new Set(Library.listIds());
    return Library.knownIds().map(sourceId => ({
      sourceId,
      loaded: loaded.has(sourceId),
      taken: !this.sourcesOff.has(sourceId),
      count: result.sourceCounts[sourceId] || 0,
    }));
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
    if(vm.hiddenCount) return this.hiddenTemplate(vm);
    return vm.entries.map(entry => this.entryTemplate(entry, vm.query)).join('');
  },

  // A result that is not mounted: the user decides whether to pay for it.
  hiddenTemplate(vm) {
    return `
      <div class="dataHidden">
        <div>${Utils.escapeHtml(vm.hiddenCount)} entries found: too many to show at once.
          Narrow the search or show them all.</div>
        <button class="dataShow" type="button">show</button>
      </div>
      `;
  },

  entryTemplate(entry, query) {
    return `
      <article class="dataEntry">
        <div class="dataEntryRow">
          ${entry.fromSearch ? `
          <input class="dataPick" type="checkbox"
            aria-label="Select"
            data-pick-key="${Utils.escapeHtml(entry.pickKey)}"
            ${entry.picked ? 'checked' : ''}
            >` : ''}
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
        <div class="section">${entry.fromSearch ? `
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

  // Without regard to case; the text is shown as it is written, not as it was typed.
  highlight(text, query) {
    if(!query) return Utils.escapeHtml(text);
    const parts = String(text).split(new RegExp(`(${Utils.escapeRegExp(query)})`, 'i'));
    return parts.map((part, i) => i % 2
      ? `<strong>${Utils.escapeHtml(part)}</strong>`
      : Utils.escapeHtml(part)).join('');
  },

  /*
    A chosen item scrolls the open list to itself, so the "any ..." item that
    would reset it is out of sight: a chosen filter gets its own reset button.
  */
  filtersTemplate(filters) {
    return `
      <div class="dataFilter">
        ${DropdownUI.select({ id: this.TAG_ID, items: filters.tagItems, placeholder: 'any tag' })}
        ${filters.tag ? this.clearTemplate('tag') : ''}
      </div>
      <div class="dataFilter">
        ${DropdownUI.select({ id: this.KIND_ID, items: filters.kindItems, placeholder: 'any kind' })}
        ${filters.kind ? this.clearTemplate('kind') : ''}
      </div>
      `;
  },

  clearTemplate(filter) {
    return `
      <button class="dataFilterClear iconButton" type="button"
        aria-label="Reset the filter"
        data-filter="${Utils.escapeHtml(filter)}"
        >&times;</button>
      `;
  },

  pickerTemplate(picker) {
    if(!picker.visible) return '';
    return `
      <button class="dataPickAll" type="button">select all</button>
      <button class="dataPickNone" type="button">none</button>
      <button class="dataPickAdd" type="button"
        ${picker.pickedCount ? '' : 'disabled'}
        >add selected (${Utils.escapeHtml(picker.pickedCount)}) to a list</button>
      `;
  },

  // A source that is not loaded has nothing to search in.
  sourcesTemplate(vm) {
    return `
      <ul class="dataSourcesItems">
        ${vm.sources.map(source => `
        <li class="dataSourcesItem ${source.loaded ? '' : 'empty'}">
          <label>
            <input class="dataSourceCheck" type="checkbox"
              data-source-id="${Utils.escapeHtml(source.sourceId)}"
              ${source.taken && source.loaded ? 'checked' : ''}
              ${source.loaded ? '' : 'disabled'}
              >
            <span class="dataSourcesName">${Utils.escapeHtml(source.sourceId)}</span>
          </label>
          <span class="tag">${source.loaded ? Utils.escapeHtml(source.count) : 'not loaded'}</span>
        </li>`).join('')}
      </ul>
      `;
  },

  render() {
    const vm = this.viewModel();
    this.dom.root.classList.toggle('hidden', !vm.visible);
    this.dom.filtersEl.innerHTML = this.filtersTemplate(vm.filters);
    // The label and the highlight of a dropdown are written after its markup.
    DropdownUI.setValue(this.TAG_ID, vm.filters.tag);
    DropdownUI.setValue(this.KIND_ID, vm.filters.kind);
    // The scope matters only while searching; a list has no selection to narrow to.
    this.dom.scopeEl.classList.toggle('hidden', !vm.searching);
    this.dom.filteredBoxEl.classList.toggle('hidden', vm.isList);
    this.dom.filteredEl.checked = vm.onlySelection;
    this.dom.adjustEl.disabled = vm.narrowed;
    this.dom.counterEl.textContent = vm.count;
    this.renderPicker(vm.picker);
    this.dom.outputEl.innerHTML = this.template(vm);
    // Exception (scroll position has no state to project): the list is scrolled,
    // not the page, and a new result starts from its top, a tick does not move it.
    if(this.scrollToTop) this.dom.outputEl.scrollTop = 0;
    this.scrollToTop = false;
    this.dom.sourcesRootEl.classList.toggle('hidden', !vm.adjustOpen);
    this.dom.sourcesListEl.innerHTML = vm.adjustOpen ? this.sourcesTemplate(vm) : '';
  },

  renderPicker(picker) {
    this.dom.pickerEl.classList.toggle('hidden', !picker.visible);
    this.dom.pickerEl.innerHTML = this.pickerTemplate(picker);
  },
};

Components.push(DataViewUI);
