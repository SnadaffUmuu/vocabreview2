// DataViewUI: read-only, maximally detailed dump of the selected collection
// for the current source, plus a search box. No tests/editor (not wanted).
// Shows/hides itself based on App.currentView === 'data'.
const DataViewUI = {
  name: 'DataViewUI',
  viewName: 'data',
  viewLabel: 'D',

  selectors: {
    root: '#dataView',
    searchEl: '#dataSearch',
    filteredEl: '#dataFiltered',
    counterEl: '#dataResCounter',
    outputEl: '#dataOutput',
  },

  events: {
    keydown: { '@searchEl': 'doSearch' },
    search: { '@searchEl': 'doSearchValue' },
    change: { '@filteredEl': 'render' },
  },

  init() {
    this.ensureMarkup();
    Bus.batchedMethod(this, 'render');
    Bus.on(Bus.events.viewChanged, () => this.render());
    Bus.on(Bus.events.originSelected, () => this.render());
    Bus.on(Bus.events.selectionChanged, () => this.render());
    Bus.on(Bus.events.sourcesChanged, () => this.render());
  },

  ensureMarkup() {
    if(this.dom?.root) return;
    const html = `
      <div id="dataView" class="appView">
        <div id="dataViewActions">
          <label>only selection <input type="checkbox" id="dataFiltered" checked></label>
          <input type="search" id="dataSearch" placeholder="search">
          <div id="dataResCounter" class="tag"></div>
        </div>
        <div id="dataOutput"></div>
      </div>`;
    document.querySelector('#appBody').insertAdjacentHTML('beforeend', html);
    Utils.cacheComponentDom(this);
  },

  // ---- search -------------------------------------------------------------------

  // Enter on a mobile keyboard may report keyCode 229/0, so check e.key. The
  // 'search' event (fired by type=search on Enter or clear) is handled too.
  doSearch(el, e) {
    if(e.key === 'Enter') this.doSearchValue(el);
  },

  doSearchValue(el) {
    const value = el.value.trim();
    if(value === this.searchValue) return;
    this.searchValue = value;
    this.render();
  },

  // ---- rendering -----------------------------------------------------------------

  render() {
    // Screen guard: only visible as the 'data' view.
    this.dom.root.classList.toggle('hidden', App.currentView !== this.viewName);
    if(App.currentView !== this.viewName) return;

    this.dom.outputEl.innerHTML = '';
    this.dom.counterEl.innerHTML = '';

    const sourceId = App.currentOrigin;
    if(!sourceId || !Library.hasSource(sourceId)) return;

    let entries;
    if(this.searchValue) {
      entries = this.searchAllSources(this.searchValue);
    } else {
      entries = this.dom.filteredEl.checked
        ? App.selectedEntries(sourceId)
        : Library.getSource(sourceId).parsed.allEntries;
    }

    const html = entries.map(en =>
      this.renderEntry(en, sourceId, this.searchValue)).join('');
    this.dom.outputEl.innerHTML = html;
    this.dom.counterEl.innerHTML = String(entries.length);
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

  renderEntry(entry, fallbackSourceId, query) {
    const rl = entry.reviewLevel;
    let info = '';

    if(entry.tag) {
      info += '<div class="tag">' + Utils.escapeHtml(entry.tag) + '</div>';
    }

    info += '<ul class="linesList">' + entry.lines.map((line, i) => {
      let templ = this.highlight(line.text, query);

      if(i === 0 && entry.reviewLevel) {
        const p = parseInt(rl, 10);
        const color = 'color:' + (p >= 100 ? 'var(--revLevelTextColor)' : 'var(--revLevelMinorTextColor)') + ';';
        const border = 'border-bottom:'
          + (p < 100 ? (p - 1) : rl.substring(0, 1)) + 'px solid '
          + (p >= 100 ? 'var(--revLevelTextColor)' : 'var(--revLevelMinorTextColor)') + ';';
        templ = '<span data-review-level="' + Utils.escapeHtml(rl) + '" class="revLevel" style="'
          + color + border + '">' + templ + '</span>';
      }

      if(line.role) {
        templ += '<span class="lineRole"> ......' + Utils.escapeHtml(line.role)
          + (line.translationLineIndex != null ? ' (trans.l.index: ' + line.translationLineIndex + ')' : '')
          + '</span>';
      }

      const compact = line.isCompact ? 'font-size:15px;' : '';
      return '<li'
        + (line.role ? ' data-role="' + Utils.escapeHtml(line.role) + '"' : '')
        + (compact ? ' class="compact"' : '')
        + '>' + templ + '</li>';
    }).join('') + '</ul>';

    if(entry.info) {
      info += '<div class="entryInfo">ⓘ&nbsp;' + Utils.escapeHtml(entry.info) + '</div>';
    }

    const sourceId = entry.sourceId || fallbackSourceId;
    info += '<div class="section">'
      + (query ? '<span class="entrySource">' + Utils.escapeHtml(sourceId) + '</span> ' : '')
      + Utils.escapeHtml(this.breadcrumbs(sourceId, entry.section))
      + '</div>';

    return '<article class="dataEntry">'
      + (rl ? '<div class="reviewLevel tag">' + Utils.escapeHtml(rl) + '</div>' : '')
      + info
      + '</article>';
  },

  highlight(text, query) {
    if(!query) return Utils.escapeHtml(text);
    const parts = String(text).split(query);
    return parts.map(Utils.escapeHtml).join('<strong>' + Utils.escapeHtml(query) + '</strong>');
  },

  breadcrumbs(sourceId, sectionId) {
    if(sectionId == null) return '';
    const source = Library.getSource(sourceId);
    if(!source) return '';

    const parts = sectionId.split('.');
    let nodes = source.parsed.structure;
    const names = [];
    for(let i = 0; i < parts.length; i++) {
      const node = nodes[parseInt(parts[i], 10)];
      if(!node) break;
      names.push(node.name);
      nodes = node.children || [];
    }
    return names.join(' / ');
  },
};

Components.push(DataViewUI);