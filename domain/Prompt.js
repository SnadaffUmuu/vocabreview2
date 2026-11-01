/*
   Prompt: pending question to the user (confirm) or message (notify). Pure
   domain state, never persisted; PromptUI is its projection. Replaces the
   system confirm()/alert().
  
   Callbacks run synchronously from confirm()/cancel()/dismiss(), not through
   Bus: Bus delivers in a later macrotask, which would lose the user gesture
   needed by follow-ups such as opening a file picker. Callbacks are therefore
   kept here and never travel in the event payload.
  
   One prompt at a time: ask()/notify() while another is open are ignored.

   A confirm prompt may carry a choice: one value out of a list of items
   { value, label }, chosen before confirming. onConfirm then receives the
   chosen value; the initial one is choice.value. The choice is part of the
   prompt state, so PromptUI only projects it. Values listed in choice.confirmOn
   are not a pick to be confirmed later but an action: choosing one confirms the
   prompt at once (e.g. "new list", which continues with its own prompt).

   A confirm prompt may carry a text input instead: { value, validate }, where
   validate(value) returns an error message or ''. The typed value and its error
   are prompt state (type() changes them); an error blocks confirm(), so the
   caller never receives a value that did not pass its own validation. The
   error is shown only once the user has typed something. onConfirm receives
   the typed value as it is; normalizing it is the caller's job.
*/
const Prompt = {

  current: null,

  // Counts the opened prompts: a projection tells a new prompt from a changed one.
  serial: 0,

  get isOpen() {
    return this.current !== null;
  },

  // What a projection needs; callbacks never leave this object.
  get state() {
    const prompt = this.current;
    return prompt
      ? {
        open: true,
        text: prompt.text,
        notify: prompt.notify,
        choice: this._choiceState(prompt),
        input: this._inputState(prompt),
        canConfirm: !prompt.input || !prompt.input.error,
        serial: this.serial,
      }
      : {
        open: false,
        text: '',
        notify: false,
        choice: null,
        input: null,
        canConfirm: true,
        serial: this.serial,
      };
  },

  // choice: { items: [{ value, label }], value, confirmOn } and
  // input: { value, validate } are optional, see the header.
  ask({ text, choice = null, input = null, onConfirm = () => {}, onCancel = () => {} }) {
    this._open({
      text,
      notify: false,
      choice: choice
        ? { items: choice.items, value: choice.value, confirmOn: choice.confirmOn || [] }
        : null,
      input: input ? this._newInput(input) : null,
      onConfirm,
      onCancel,
    });
  },

  notify(text, onClose = () => {}) {
    this._open({ text, notify: true, onConfirm: onClose, onCancel: onClose });
  },

  // A prompt whose input has an error stays open.
  confirm() {
    const prompt = this.current;
    if(!prompt) return;
    if(prompt.input && prompt.input.error) return;
    this._close('onConfirm');
  },

  // The text of the open prompt's input changed.
  type(value) {
    const input = this.current?.input;
    if(!input) return;
    input.value = String(value);
    input.touched = true;
    input.error = input.validate(input.value);
    Bus.emit(Bus.events.promptChanged);
  },

  // Picks the value of the open prompt's choice; a value that is not offered is ignored.
  choose(value) {
    const choice = this.current?.choice;
    if(!choice || !choice.items.some(item => String(item.value) === String(value))) return;
    choice.value = value;
    if(choice.confirmOn.some(item => String(item) === String(value))) {
      this.confirm();
      return;
    }
    Bus.emit(Bus.events.promptChanged);
  },

  // Cancel button or overlay click. For notify() it is the same as OK.
  cancel() {
    this._close('onCancel');
  },

  _newInput({ value = '', validate = () => '' }) {
    return { value: String(value), validate, error: validate(String(value)), touched: false };
  },

  _inputState(prompt) {
    return prompt.input
      ? { value: prompt.input.value, error: prompt.input.touched ? prompt.input.error : '' }
      : null;
  },

  _choiceState(prompt) {
    return prompt.choice
      ? { items: prompt.choice.items.slice(), value: prompt.choice.value }
      : null;
  },

  _open(prompt) {
    if(this.current) return;
    this.current = prompt;
    this.serial += 1;
    Bus.emit(Bus.events.promptChanged);
  },

  _valueOf(prompt) {
    if(prompt.choice) return prompt.choice.value;
    return prompt.input ? prompt.input.value : undefined;
  },

  _close(callbackName) {
    const prompt = this.current;
    if(!prompt) return;
    this.current = null;
    Bus.emit(Bus.events.promptChanged);
    prompt[callbackName](this._valueOf(prompt));
  },
};
