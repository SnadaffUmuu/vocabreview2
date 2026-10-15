// PromptUI: modal confirm/notify dialog. A projection of the Prompt state.
// Subscribes to Bus.promptChanged; button clicks are forwarded to the domain.
// Text is always set via textContent (never as markup).
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
    Bus.on(Bus.events.promptChanged, state => this.render(state));
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

  render({ open, text, notify }) {
    this.dom.textEl.textContent = text;
    this.dom.confirmEl.textContent = notify ? 'OK' : 'Confirm';
    this.dom.cancelEl.classList.toggle('hidden', !!notify);
    this.dom.root.classList.toggle('hidden', !open);
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
