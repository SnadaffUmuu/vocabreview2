/*
   ListPrompts: the dialogs of list management as one flow, shared by every
   component that offers them (the Lists dialog, Board, Data). Domain logic over
   Prompt and Collections; no DOM. A component only calls the action it needs:
   there is exactly one place that knows what is asked and what is reported.

   The checks of Collections are authoritative: a name is validated by the
   prompt for the user's comfort and again by Collections when it is applied.
   Every refusal and every failed write is reported with Prompt.notify.
   Prompts are chained from callbacks: they run synchronously after the
   previous prompt has closed.
*/
const ListPrompts = {

  NEW_LIST_LABEL: '＋ new list…',

  reportSaveFailed() {
    Prompt.notify(Collections.SAVE_FAILED_TEXT);
  },

  // Asks for a name; onName gets it as typed (Collections trims it).
  askName({ text, value = '', exceptListId = null, onName, onCancel = () => {} }) {
    Prompt.ask({
      text,
      input: { value, validate: name => Collections.nameError(name, exceptListId) },
      onConfirm: onName,
      onCancel,
    });
  },

  // A new empty list; onCreated(listId) runs when it exists, onCancel when the name is not given.
  createList(onCreated = () => {}, onCancel = () => {}) {
    this.askName({
      text: 'Name of the new list',
      onCancel,
      onName: name => {
        const result = Collections.create(name);
        if(result.ok) onCreated(result.listId);
        else Prompt.notify(result.error);
      },
    });
  },

  renameList(listId) {
    this.askName({
      text: 'New name of the list',
      value: Collections.nameOf(listId),
      exceptListId: listId,
      onName: name => {
        const result = Collections.rename(listId, name);
        if(!result.ok) Prompt.notify(result.error);
      },
    });
  },

  // Global is emptied, not removed for good: it is created again by the next add.
  deleteList(listId) {
    const name = Collections.nameOf(listId);
    const count = Collections.countOf(listId);
    const cards = count === 1 ? '1 card' : `${count} cards`;
    const text = listId === Collections.DEFAULT_ID
      ? `Clear the list "${name}" (${cards})? Its progress will be deleted too.`
      : `Delete the list "${name}" (${cards})? Its progress will be deleted too.`;
    Prompt.ask({
      text,
      onConfirm: () => {
        if(!Collections.deleteList(listId)) this.reportSaveFailed();
      },
    });
  },

  /*
    Asks for the list to add a copy of the entry to (the one chosen last, Global
    at first, or a new list), adds it and reports a duplicate. The card stays
    where it is.
    Choosing "new list" does not wait for Confirm: the name is asked at once.
    Cancelling the name prompt closes only that prompt: the choice is asked
    again (from its default), so the user steps back and does not lose the flow.
    The list becomes the default of the next time once it is chosen, also when
    the card turns out to be a duplicate; a cancelled prompt or a failed write
    changes nothing.
  */
  addEntry(entry) {
    const items = [
      ...Collections.choices(),
      { value: Collections.NEW_LIST, label: this.NEW_LIST_LABEL },
    ];
    Prompt.ask({
      text: 'Add the card to a list',
      choice: { items, value: Collections.defaultTarget(), confirmOn: [Collections.NEW_LIST] },
      onConfirm: listId => {
        if(listId === Collections.NEW_LIST) {
          this.createList(newId => this.addTo(newId, entry), () => this.addEntry(entry));
        } else {
          this.addTo(listId, entry);
        }
      },
    });
  },

  addTo(listId, entry) {
    const result = Collections.add(listId, entry);
    if(result !== 'storage') App.setAddTarget(listId);
    if(result === 'duplicate') {
      Prompt.notify(`Already in the list "${Collections.nameOf(listId)}".`);
    } else if(result === 'storage') {
      this.reportSaveFailed();
    }
  },

  // Final, unlike the removal of a card in a View: the progress goes with it.
  removeEntry(listId, entryId) {
    Prompt.ask({
      text: `Remove the card from the list "${Collections.nameOf(listId)}"? Its progress will be lost.`,
      onConfirm: () => {
        if(!Collections.removeEntry(listId, entryId)) this.reportSaveFailed();
      },
    });
  },
};
