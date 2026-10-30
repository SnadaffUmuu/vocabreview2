/*
   Prompt: pending question to the user (confirm) or message (notify). Pure
   domain state, never persisted; PromptUI is its projection. Replaces the
   system confirm()/alert().
  
   Callbacks run synchronously from confirm()/cancel()/dismiss(), not through
   Bus: Bus delivers in a later macrotask, which would lose the user gesture
   needed by follow-ups such as opening a file picker. Callbacks are therefore
   kept here and never travel in the event payload.
  
   One prompt at a time: ask()/notify() while another is open are ignored.
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
      ? { open: true, text: prompt.text, notify: prompt.notify }
      : { open: false, text: '', notify: false };
  },

  ask({ text, onConfirm = () => {}, onCancel = () => {} }) {
    this._open({ text, notify: false, onConfirm, onCancel });
  },

  notify(text, onClose = () => {}) {
    this._open({ text, notify: true, onConfirm: onClose, onCancel: onClose });
  },

  confirm() {
    this._close('onConfirm');
  },

  // Cancel button or overlay click. For notify() it is the same as OK.
  cancel() {
    this._close('onCancel');
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
    prompt[callbackName]();
  },
};
