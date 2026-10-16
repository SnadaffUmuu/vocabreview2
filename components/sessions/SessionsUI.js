// SessionsUI: modal list of sources that have review progress, with one letter
// tag per view in progress. Click a source name to switch to it; click a letter
// to switch to that source and view. It only reads Progress.activeSessions()
// and changes state through App.selectOrigin / App.setView.
const SessionsUI = {
  name: 'SessionsUI',

  selectors: {
    root: '#sessions',
    closeEl: '#sessionsClose',
    listEl: '#sessionsList',
  },

  events: {
    click: {
      '#sessions': 'closeFromOverlay',
      '@closeEl': 'close',
      '#sessionsList [data-session-origin]': 'pickOrigin',
      '#sessionsList [data-session-view]': 'pickOriginAndView',
    },
  },

  init() {
    this.ensureMarkup();
    this.isOpen = false;
    Bus.batchedMethod(this, 'render');
    Bus.on(Bus.events.sessionsRequested, () => this.open());
    Bus.on(Bus.events.viewsChanged, () => this.render());
    Bus.on(Bus.events.sourcesChanged, () => this.render());
    Bus.on(Bus.events.sourceReloaded, () => this.render());
  },

  ensureMarkup() {
    if(this.dom?.root) return;
    const html = `
      <div id="sessions" class="hidden">
        <div id="sessionsDialog" role="dialog" aria-label="Current sessions">
          <button id="sessionsClose" type="button" aria-label="Close">&times;</button>
          <h3>Current sessions</h3>
          <div id="sessionsList"></div>
        </div>
      </div>`;
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
    // Only a click on the dimmed overlay itself closes; clicks inside the dialog
    // have other targets.
    if(e.target === this.dom.root) this.close();
  },

  // The only place that reads domain state. Sessions are not computed while
  // the dialog is closed: viewsChanged fires on every mark.
  viewModel() {
    return {
      isOpen: this.isOpen,
      sessions: this.isOpen ? Progress.activeSessions() : [],
    };
  },

  template(vm) {
    if(!vm.sessions.length) {
      return `
        <div class="sessionsEmpty">No sessions in progress</div>
        `;
    }
    return `
      <table class="sessionsData">
        ${vm.sessions.map(session => this.rowTemplate(session)).join('')}
      </table>
      `;
  },

  rowTemplate(session) {
    const origin = Utils.escapeHtml(session.originId);
    return `
      <tr>
        <td data-session-origin="${origin}">${origin}</td>
        <td>
          ${session.views.map(view => `
          <div class="tag"
            data-session-origin="${origin}"
            data-session-view="${Utils.escapeHtml(view.name)}"
            >
            ${Utils.escapeHtml(view.label)}
          </div>`).join('')}
        </td>
      </tr>
      `;
  },

  render() {
    const vm = this.viewModel();
    this.dom.root.classList.toggle('hidden', !vm.isOpen);
    this.dom.listEl.innerHTML = vm.isOpen ? this.template(vm) : '';
  },

  pickOrigin(el, e) {
    // A letter tag also carries data-session-origin; it is handled by pickOriginAndView.
    if(el.dataset.sessionView) return;
    Busy.beginAndRun(() => {
      App.selectOrigin(el.dataset.sessionOrigin);
      this.close();
    });
  },

  pickOriginAndView(el) {
    Busy.beginAndRun(() => {
      App.selectOrigin(el.dataset.sessionOrigin);
      App.setView(el.dataset.sessionView);
      this.close();
    });
  },
};

Components.push(SessionsUI);
