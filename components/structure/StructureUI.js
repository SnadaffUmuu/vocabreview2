// StructureUI: renders the section tree for the current source with checkboxes
// for selection and letter marks for "in progress" views. Reads domain state,
// writes selection via App.setSelection.
const StructureUI = {
  name: 'StructureUI',

  selectors: {
    root: '#structure',
    treeEl: '#structureTree',
    toggleAllEl: '#structureToggleAll',
    filterEl: '#structureFilter',
  },

  events: {
    click: { '@filterEl': 'applyFilter' },
    change: {
      '@toggleAllEl': 'toggleAll',
      // Delegate checkbox changes: checkboxes are rendered dynamically.
      '#structureTree .treeCheckbox': 'onCheckboxChange',
    },
  },

  init() {
    this.ensureMarkup();
    this.treeCheckboxSelector = '.treeCheckbox';
    Bus.batchedMethod(this, 'render');
    Bus.on(Bus.events.originSelected, () => this.render());
    Bus.on(Bus.events.sourcesChanged, () => this.render());
    Bus.on(Bus.events.viewsChanged, () => this.renderMarks());
  },

  ensureMarkup() {
    if(this.dom?.root) return;
    const html = `
      <div id="structure">
        <button id="structureFilter">filter</button>
        <label for="structureToggleAll">All:
          <input type="checkbox" id="structureToggleAll">
        </label>
        <div id="structureTree"></div>
      </div>`;
    document.querySelector('#appBody').insertAdjacentHTML('beforeend', html);
    Utils.cacheComponentDom(this);
  },

  applyFilter() {
    const sourceId = App.currentOrigin;
    if(!sourceId) return;
    const checked = Array.from(this.dom.treeEl.querySelectorAll('input.treeCheckbox:checked'))
      .map(cb => cb.value);
    App.setSelection(sourceId, checked);
  },

  toggleAll(e, ev) {
    const checked = ev.target.checked;
    Array.from(this.dom.treeEl.querySelectorAll('input.treeCheckbox[type=checkbox]'))
      .forEach(cb => { cb.checked = checked; });
  },

  onCheckboxChange(el, e) {
    // Propagate checked state to children and update parent tri-state.
    this.cascade(e.target);
  },

  // Mirror Version 1's toggleTreeCheckboxes behaviour.
  cascade(check) {
    const selectors = this.treeCheckboxSelector;
    const children = Array.from(check.parentNode.querySelectorAll(selectors));
    children.forEach(child => { child.checked = check.checked; });

    let c = check;
    while(c) {
      const ul = c.closest('ul');
      if(!ul) break;
      const li = ul.parentNode;
      const parent = li.querySelector(':scope > ' + selectors);
      const childList = li.querySelector('ul');
      if(childList && parent) {
        const siblings = Array.from(childList.querySelectorAll(selectors));
        const every = siblings.every(s => s.checked);
        const some = siblings.some(s => s.checked);
        parent.checked = every;
        parent.indeterminate = !every && some;
      }
      c = (c !== parent) ? parent : 0;
    }
  },

  render() {
    this.dom.treeEl.innerHTML = '';

    const sourceId = App.currentOrigin;
    if(!sourceId || !Library.hasSource(sourceId)) return;

    const parsed = Library.getSource(sourceId).parsed;
    const selected = App.getSelection(sourceId);
    const selectedSet = new Set(selected);
    const marks = Progress.marksBySection(sourceId);

    const list = this.buildTree(parsed.structure, selectedSet, marks);
    this.dom.treeEl.insertAdjacentHTML('afterbegin', list);

    // Reflect selection: if selection exists, check matching boxes.
    if(selected.length) {
      Array.from(this.dom.treeEl.querySelectorAll('input.treeCheckbox'))
        .forEach(cb => {
          if(selectedSet.has(cb.value)) cb.checked = true;
        });
      this.updateParents();
    }
  },

  // Progress changed (e.g. a mark was set in a view): refresh only the letter
  // marks, leaving the tree and any not-yet-applied checkbox state untouched.
  renderMarks() {
    const sourceId = App.currentOrigin;
    if(!sourceId || !Library.hasSource(sourceId)) return;
    const marks = Progress.marksBySection(sourceId);
    Array.from(this.dom.treeEl.querySelectorAll('li[data-tree-id]')).forEach(li => {
      const old = li.querySelector(':scope > .inProgress');
      if(old) old.remove();
      const letters = marks[li.dataset.treeId];
      if(letters) {
        li.insertAdjacentHTML('afterbegin',
          '<span class="inProgress">' + letters.map(Utils.escapeHtml).join('&nbsp;') + '</span>');
      }
    });
  },

  buildTree(nodes, selectedSet, marks) {
    const items = nodes.map(node => {
      const mark = marks[node.id] ? marks[node.id].map(Utils.escapeHtml).join('&nbsp;') : '';
      const childHtml = node.children && node.children.length
        ? '<ul>' + this.buildTree(node.children, selectedSet, marks) + '</ul>'
        : '';
      const name = Utils.escapeHtml(node.name);
      const markHtml = mark ? '<span class="inProgress">' + mark + '</span>' : '';
      const id = Utils.escapeHtml(node.id);
      return '<li data-tree-id="' + id + '">'
        + markHtml
        + '<input class="treeCheckbox" type="checkbox" value="' + id + '">'
        + '&nbsp;' + name
        + childHtml
        + '</li>';
    }).join('');
    return items;
  },

  updateParents() {
    // Set parent tri-state from children after an explicit programmatic change.
    Array.from(this.dom.treeEl.querySelectorAll('ul ul input.treeCheckbox'))
      .forEach(child => {
        if(child.checked) {
          const li = child.closest('ul').closest('li');
          const parent = li.querySelector(':scope > input.treeCheckbox');
          const siblings = Array.from(child.closest('ul').querySelectorAll('input.treeCheckbox'));
          const every = siblings.every(s => s.checked);
          const some = siblings.some(s => s.checked);
          if(parent) {
            parent.checked = every;
            parent.indeterminate = !every && some;
          }
        }
      });
  },
};

Components.push(StructureUI);
