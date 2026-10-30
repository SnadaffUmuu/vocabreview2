/*
   PromptUI: modal confirm/notify dialog. A projection of the Prompt state.
   Subscribes to Bus.promptChanged; button clicks are forwarded to the domain.
   Text is always set via textContent (never as markup).
*/
const PromptUI = {
  name: 'PromptUI',

  selectors: {
    root: '#promptOverlay',
    textEl: '#promptText',
    confirmEl: '#promptConfirm',
    cancelEl: '#promptCancel',
  },

  events: {
    click: {
      '@root': 'overlayClick',
      '@confirmEl': 'confirm',
      '@cancelEl': 'cancel',
    },
  },

  init() {
    this.ensureMarkup();
    Bus.batchedMethod(this, 'render');
    Bus.on(Bus.events.promptChanged, () => this.render());
  },

  ensureMarkup() {
    if(this.dom?.root) return;
    const html = `
      <div id="promptOverlay" class="prompt-overlay hidden">
        <div class="prompt" role="dialog" aria-modal="true">
          <div id="promptText" class="prompt-text"></div>
          <div class="prompt-buttons">
            <button id="promptConfirm" type="button">Confirm</button>
            <button id="promptCancel" type="button">Cancel</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    Utils.cacheComponentDom(this);
  },

  // The only place that reads domain state. The event is only a notification:
  // callbacks of a closing prompt may open the next one before this render runs.
  viewModel() {
    const { open, text, notify } = Prompt.state;
    return {
      open,
      text,
      notify,
      confirmLabel: notify ? 'OK' : 'Confirm',
    };
  },

  render() {
    const vm = this.viewModel();
    this.dom.textEl.textContent = vm.text;
    this.dom.confirmEl.textContent = vm.confirmLabel;
    this.dom.cancelEl.classList.toggle('hidden', vm.notify);
    this.dom.root.classList.toggle('hidden', !vm.open);
  },

  // Events matches by e.target, so this fires only for the overlay itself.
  overlayClick() {
    Prompt.cancel();
  },

  confirm() {
    Prompt.confirm();
  },

  cancel() {
    Prompt.cancel();
  },
};

Components.push(PromptUI);
