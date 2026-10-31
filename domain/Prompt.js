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
   prompt state, so PromptUI only projects it.
*/
const Prompt = {

  current: null,

  get isOpen() {
    return this.current !== null;
  },

  // What a projection needs; callbacks never leave this object.
  get state() {
    const prompt = this.current;
    return prompt
      ? { open: true, text: prompt.text, notify: prompt.notify, choice: this._choiceState(prompt) }
      : { open: false, text: '', notify: false, choice: null };
  },

  // choice: { items: [{ value, label }], value } - optional, see the header.
  ask({ text, choice = null, onConfirm = () => {}, onCancel = () => {} }) {
    this._open({
      text,
      notify: false,
      choice: choice ? { items: choice.items, value: choice.value } : null,
      onConfirm,
      onCancel,
    });
  },

  notify(text, onClose = () => {}) {
    this._open({ text, notify: true, onConfirm: onClose, onCancel: onClose });
  },

  confirm() {
    this._close('onConfirm');
  },

  // Picks the value of the open prompt's choice; a value that is not offered is ignored.
  choose(value) {
    const choice = this.current?.choice;
    if(!choice || !choice.items.some(item => String(item.value) === String(value))) return;
    choice.value = value;
    Bus.emit(Bus.events.promptChanged);
  },

  // Cancel button or overlay click. For notify() it is the same as OK.
  cancel() {
    this._close('onCancel');
  },

  _choiceState(prompt) {
    return prompt.choice
      ? { items: prompt.choice.items.slice(), value: prompt.choice.value }
      : null;
  },

  _open(prompt) {
    if(this.current) return;
    this.current = prompt;
    Bus.emit(Bus.events.promptChanged);
  },

  _close(callbackName) {
    const prompt = this.current;
    if(!prompt) return;
    this.current = null;
    Bus.emit(Bus.events.promptChanged);
    prompt[callbackName](prompt.choice ? prompt.choice.value : undefined);
  },
};
