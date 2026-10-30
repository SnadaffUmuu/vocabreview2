/*
   StructureUI: renders the section tree for the current source with checkboxes
   for selection and letter marks for "in progress" views. Its root is mounted
   in the menu's layout slot; it does not call or otherwise know MenuUI.
   Writes selection via App.setSelection.
  
   Not-yet-applied UI state lives in the component, not in the DOM:
     draft    - Set of checked section ids, or null while it equals the applied
                selection. Applied by the "filter" button.
     expanded - Set of opened branch ids, or null for the default (branches that
                contain selected sections).
   Both are dropped when the source, sources or the applied selection change.
*/
const StructureUI = {
  name: 'StructureUI',
  mountSelector: '#menuStructureSlot',

  selectors: {
    root: '#structure',
    treeEl: '#structureTree',
    toggleAllEl: '#structureToggleAll',
    filterEl: '#structureFilter',
  },

  events: {
    click: {
      '@filterEl': 'applyFilter',
      '#structureTree .treeBranch > summary': 'toggleBranch',
    },
    change: {
      '@toggleAllEl': 'toggleAll',
      // Delegated: checkboxes are rendered dynamically.
      '#structureTree .treeCheckbox': 'onCheckboxChange',
    },
  },

  draft: null,
  expanded: null,

  init() {
    this.ensureMarkup();
    Bus.batchedMethod(this, 'render');
    Bus.on(Bus.events.sourceSelected, () => this.resetAndRender());
    Bus.on(Bus.events.sourcesChanged, () => this.resetAndRender());
    Bus.on(Bus.events.selectionChanged, ({ sourceId }) => {
      if(sourceId === App.currentSource) this.resetAndRender();
    });
    // A progress mark changed: the draft and open branches are kept.
    Bus.on(Bus.events.viewsChanged, () => this.render());
  },

  ensureMarkup() {
    if(this.dom?.root) return;
    const html = `
      <div id="structure">
        <div id="structureActions">
          <button id="structureFilter">filter</button>
          <label for="structureToggleAll" style="padding-left:5px">All<br>
            <input type="checkbox" id="structureToggleAll">
          </label>
        </div>
        <ul id="structureTree"></ul>
      </div>
      `;
    document.querySelector(this.mountSelector).insertAdjacentHTML('beforeend', html);
    Utils.cacheComponentDom(this);
  },

  // ---- state -----------------------------------------------------------------------

  resetAndRender() {
    this.draft = null;
    this.expanded = null;
    this.render();
  },

  structure() {
    const sourceId = App.currentSource;
    if(!sourceId || !Library.hasSource(sourceId)) return [];
    return Library.getSource(sourceId).parsed.structure;
  },

  // ---- handlers (clean: change component state, then render) ------------------------

  applyFilter() {
    const sourceId = App.currentSource;
    if(!sourceId) return;
    const checked = this.collectChecked(this.viewModel().nodes);
    // Selection change re-renders every view; show the indicator across it.
    Busy.beginAndRun(() => App.setSelection(sourceId, checked));
  },

  toggleAll(el) {
    this.draft = el.checked ? this.allIds(this.structure()) : new Set();
    this.render();
  },

  onCheckboxChange(el) {
    const current = new Set(this.collectChecked(this.viewModel().nodes));
    this.draft = this.toggled(this.structure(), current, el.value, el.checked);
    this.render();
  },

  toggleBranch(el, e) {
    // Stop the native <details> toggle: the open attribute is written by render().
    e.preventDefault();
    const id = el.closest('li').dataset.treeId;
    const open = new Set(this.collectOpen(this.viewModel().nodes));
    if(open.has(id)) open.delete(id);
    else open.add(id);
    this.expanded = open;
    this.render();
  },

  // ---- view model (pure over its arguments, except viewModel() itself) -------------

  // The only place that reads domain state.
  viewModel() {
    const sourceId = App.currentSource;
    const structure = this.structure();
    const applied = new Set(App.getSelection(sourceId));
    const checked = this.draft || applied;
    const expanded = this.expanded || this.expandedByDefault(structure, applied);
    const marks = structure.length ? Progress.marksBySection(sourceId) : {};
    const nodes = this.buildNodes(structure, checked, expanded, marks);
    return {
      nodes,
      allChecked: nodes.length > 0 && nodes.every(node => node.checked),
    };
  },

  // A parent is checked when it is in the set or all its children are checked;
  // it is indeterminate when not checked but something below it is.
  buildNodes(structure, checkedSet, expandedSet, marks) {
    return structure.map(node => {
      const children = this.buildNodes(node.children || [], checkedSet, expandedSet, marks);
      const hasChildren = children.length > 0;
      const every = hasChildren && children.every(child => child.checked);
      const some = children.some(child => child.checked || child.indeterminate);
      const checked = checkedSet.has(node.id) || every;
      return {
        id: node.id,
        name: node.name,
        marks: marks[node.id] || [],
        hasChildren,
        open: hasChildren && expandedSet.has(node.id),
        checked,
        indeterminate: !checked && some,
        children,
      };
    });
  },

  expandedByDefault(structure, selectedSet) {
    const result = new Set();
    const hasSelected = node => {
      const inChildren = (node.children || []).map(hasSelected).some(Boolean);
      const selected = selectedSet.has(node.id) || inChildren;
      if(selected && node.children?.length) result.add(node.id);
      return selected;
    };
    structure.forEach(hasSelected);
    return result;
  },

  collectChecked(nodes) {
    return nodes.flatMap(node =>
      [...(node.checked ? [node.id] : []), ...this.collectChecked(node.children)]);
  },

  collectOpen(nodes) {
    return nodes.flatMap(node =>
      [...(node.open ? [node.id] : []), ...this.collectOpen(node.children)]);
  },

  allIds(structure) {
    return new Set(structure.flatMap(node =>
      [node.id, ...this.allIds(node.children || [])]));
  },

  // Returns a new set with the node and all its descendants checked/unchecked;
  // ancestors become checked exactly when all their children are.
  toggled(structure, checkedSet, id, checked) {
    const next = new Set(checkedSet);
    const setSubtree = node => {
      if(checked) next.add(node.id);
      else next.delete(node.id);
      (node.children || []).forEach(setSubtree);
    };
    const walk = nodes => nodes.some(node => {
      if(node.id === id) {
        setSubtree(node);
        return true;
      }
      if(!node.children || !walk(node.children)) return false;
      if(node.children.every(child => next.has(child.id))) next.add(node.id);
      else next.delete(node.id);
      return true;
    });
    walk(structure);
    return next;
  },

  // ---- markup ----------------------------------------------------------------------

  template(vm) {
    return vm.nodes.map(node => this.nodeTemplate(node)).join('');
  },

  nodeTemplate(node) {
    const id = Utils.escapeHtml(node.id);
    const name = Utils.escapeHtml(node.name);
    const marks = node.marks.map(mark => Utils.escapeHtml(mark)).join('&nbsp;');
    return `
      <li data-tree-id="${id}">
        ${marks ? `
        <span class="inProgress">${marks}</span>` : ''}
        <input class="treeCheckbox" type="checkbox" value="${id}"
          ${node.checked ? 'checked' : ''}
          ${node.indeterminate ? 'data-indeterminate' : ''}
          >
        ${node.hasChildren ? `
        <details class="treeBranch" ${node.open ? 'open' : ''}>
          <summary>${name}</summary>
          <ul>${node.children.map(child => this.nodeTemplate(child)).join('')}</ul>
        </details>` : `
        <span class="treeName">${name}</span>`}
      </li>
      `;
  },

  render() {
    const vm = this.viewModel();
    this.dom.toggleAllEl.checked = vm.allChecked;
    this.dom.treeEl.innerHTML = this.template(vm);
    // Exception: `indeterminate` has no HTML attribute, so it is applied as a
    // DOM property from the data-indeterminate marker written by the template.
    // Scroll position is not lost: the scroll container (#structureTree) is not replaced, only its content.
    this.dom.treeEl.querySelectorAll('[data-indeterminate]').forEach(checkbox => {
      checkbox.indeterminate = true;
    });
  },
};

Components.push(StructureUI);
