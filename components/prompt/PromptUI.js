/*
   PromptUI: modal confirm/notify dialog. A projection of the Prompt state.
   Subscribes to Bus.promptChanged; button clicks are forwarded to the domain.
   Text is always set via textContent (never as markup).

   A prompt with a choice shows a DropdownUI select under the text; the chosen
   value lives in the Prompt domain object, the dropdown only reports a pick.

   A prompt with an input shows a text field. The typed text is a draft that
   lives in the field itself (caret, IME) and is reported to the domain on every
   input event; render() writes it into the field only when a NEW prompt opens
   (serial), never while the user types: a delayed render would otherwise
   overwrite what was typed after the event. The domain value and error come
   back through the projection (the error line, the Confirm button).
*/
const PromptUI = {
  name: 'PromptUI',

  CHOICE_ID: 'promptChoiceSelect',

  selectors: {
    root: '#promptOverlay',
    textEl: '#promptText',
    choiceEl: '#promptChoice',
    inputBoxEl: '#promptInputBox',
    inputEl: '#promptInput',
    inputErrorEl: '#promptInputError',
    confirmEl: '#promptConfirm',
    cancelEl: '#promptCancel',
  },

  events: {
    click: {
      '@root': 'overlayClick',
      '@confirmEl': 'confirm',
      '@cancelEl': 'cancel',
    },
    input: { '@inputEl': 'typed' },
    keydown: { '@inputEl': 'inputKey' },
  },

  // The serial of the prompt whose text is already in the field.
  shownSerial: 0,

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
          <div id="promptInputBox" class="prompt-input hidden">
            <input id="promptInput" type="text" autocomplete="off" autocapitalize="off" spellcheck="false">
            <div id="promptInputError" class="prompt-input-error"></div>
          </div>
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
    const { open, text, notify, choice, input, canConfirm, serial } = Prompt.state;
    return {
      open,
      text,
      notify,
      choice,
      input,
      canConfirm,
      serial,
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
    this.dom.confirmEl.disabled = !vm.canConfirm;
    this.dom.cancelEl.classList.toggle('hidden', vm.notify);
    this.dom.root.classList.toggle('hidden', !vm.open);
    // After the overlay is shown: an element inside display:none cannot get the focus.
    this.renderInput(vm);
  },

  /*
    Exception (see the header): the text of the field is written once per
    prompt, and the field gets the focus then. Focus has no state to project.
    The overlay must already be visible, see render().
  */
  renderInput(vm) {
    this.dom.inputBoxEl.classList.toggle('hidden', !vm.input);
    this.dom.inputErrorEl.textContent = vm.input ? vm.input.error : '';
    if(!vm.input || vm.serial === this.shownSerial) return;
    this.shownSerial = vm.serial;
    this.dom.inputEl.value = vm.input.value;
    this.dom.inputEl.focus();
    //this.dom.inputEl.select();
  },

  // DOM-touching: reports the draft of the field (see the header).
  typed(el) {
    Prompt.type(el.value);
  },

  inputKey(el, e) {
    if(e.key === 'Enter') Prompt.confirm();
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
