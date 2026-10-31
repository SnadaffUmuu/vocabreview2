/*
   PromptUI: modal confirm/notify dialog. A projection of the Prompt state.
   Subscribes to Bus.promptChanged; button clicks are forwarded to the domain.
   Text is always set via textContent (never as markup).

   A prompt with a choice shows a DropdownUI select under the text; the chosen
   value lives in the Prompt domain object, the dropdown only reports a pick.
*/
const PromptUI = {
  name: 'PromptUI',

  CHOICE_ID: 'promptChoiceSelect',

  selectors: {
    root: '#promptOverlay',
    textEl: '#promptText',
    choiceEl: '#promptChoice',
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
    DropdownUI.on(this.CHOICE_ID, value => Prompt.choose(value));
  },

  ensureMarkup() {
    if(this.dom?.root) return;
    const html = `
      <div id="promptOverlay" class="prompt-overlay hidden">
        <div class="prompt" role="dialog" aria-modal="true">
          <div id="promptText" class="prompt-text"></div>
          <div id="promptChoice" class="prompt-choice"></div>
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
    const { open, text, notify, choice } = Prompt.state;
    return {
      open,
      text,
      notify,
      choice,
      confirmLabel: notify ? 'OK' : 'Confirm',
    };
  },

  template(vm) {
    if(!vm.choice) return '';
    return DropdownUI.select({
      id: this.CHOICE_ID,
      items: vm.choice.items,
    });
  },

  render() {
    const vm = this.viewModel();
    this.dom.textEl.textContent = vm.text;
    this.dom.choiceEl.innerHTML = this.template(vm);
    // The label and the highlight of a dropdown are written after its markup.
    if(vm.choice) DropdownUI.setValue(this.CHOICE_ID, vm.choice.value);
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
