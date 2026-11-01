/*
  Collections: custom lists of entries. Pure domain logic; no DOM. Persists
  through Storage only, immediately on every change.

  An entry added to a list is a detached copy: it keeps its lines, tag, info and
  review level, and loses its section and its id in the source. Reloading or
  updating the source never touches a list.

  A list is addressed everywhere else (App, Library, ViewState, Progress) as a
  source with the id "L:<listId>", so Views, selections and per-view progress
  work with it unchanged. A list has no structure and no selection: the whole
  list is always shown.

    lists[listId] = { name, nextId, entries: [entry] }

  Entry ids are ordinals handed out by nextId and never reused: progress is
  bound to entry.id, so an id must not move to another entry after a removal.
  Line indexes of a copy are kept as they were (they can have gaps): sides of a
  card are found by them.

  Hashes are used for duplicate detection only (see add()).
  The list "global" is always offered as a target; it is created by the first
  entry added to it. It cannot be renamed; deleting it empties it, and the next
  add creates it again.

  Identifiers and names: listId is stable and independent of the name ("global"
  or "l<n>"); only the name changes on rename. A name is unique without regard
  to case. A list id may be reused after its list is deleted, which is safe
  because the progress of a deleted list is deleted with it: otherwise an old
  mark would stick to a new entry with the same ordinal.

  Removing an entry from a list is final and also drops its progress in every
  View (see ViewState.forgetEntry). Every change is written at once; when the
  write fails the change is taken back, so memory and storage never differ.

  Every change is announced as collectionsChanged { sourceId, kind } with kind
  one of created, added, removed, renamed, deleted: a View rebuilds only for
  added and removed (see isContentChange()), a rename only changes names.

  Lists that could not be recognized on load are kept as they are and written
  back with the others, so a bad record never disappears silently.
*/
const Collections = {

  SOURCE_PREFIX: 'L:',
  DEFAULT_ID: 'global',
  DEFAULT_NAME: 'Global',

  // The value of the extra item of the "add to a list" choice that asks for a new list.
  NEW_LIST: '+new',
  NAME_MAX_LENGTH: 40,
  SAVE_FAILED_TEXT: 'Could not save the lists: the storage is full or unavailable. The change was not made.',

  lists: {},

  // Records of the saved lists that are not valid lists. Never shown, never lost.
  unrecognized: {},

  load() {
    const saved = Storage.load(Storage.KEY.collections, {});
    this.lists = {};
    this.unrecognized = {};
    if(!saved || typeof saved !== 'object' || Array.isArray(saved)) return;
    Object.keys(saved).forEach(listId => {
      if(this.isValidList(saved[listId])) this.lists[listId] = saved[listId];
      else this.unrecognized[listId] = saved[listId];
    });
  },

  isValidList(list) {
    return !!list
      && typeof list === 'object'
      && typeof list.name === 'string'
      && Number.isInteger(list.nextId)
      && Array.isArray(list.entries)
      && list.entries.every(entry =>
        !!entry && Number.isInteger(entry.id) && Array.isArray(entry.lines));
  },

  // ---- ids -----------------------------------------------------------------------

  isListId(sourceId) {
    return typeof sourceId === 'string' && sourceId.startsWith(this.SOURCE_PREFIX);
  },

  sourceIdOf(listId) {
    return `${this.SOURCE_PREFIX}${listId}`;
  },

  listIdOf(sourceId) {
    return sourceId.slice(this.SOURCE_PREFIX.length);
  },

  // Ids under which the existing lists are known to App.
  sourceIds() {
    return Object.keys(this.lists).map(listId => this.sourceIdOf(listId));
  },

  // The progress of a list that could not be recognized is kept with it.
  unrecognizedSourceIds() {
    return Object.keys(this.unrecognized).map(listId => this.sourceIdOf(listId));
  },

  // ---- queries -------------------------------------------------------------------

  has(sourceId) {
    return this.isListId(sourceId) && !!this.lists[this.listIdOf(sourceId)];
  },

  nameOf(listId) {
    const list = this.lists[listId];
    if(list) return list.name;
    return listId === this.DEFAULT_ID ? this.DEFAULT_NAME : listId;
  },

  // The label of a list in the places where it is shown like a source.
  labelOf(sourceId) {
    return `L: ${this.nameOf(this.listIdOf(sourceId))}`;
  },

  // "global" first, even if it does not exist yet, then the others by name.
  orderedIds() {
    const others = Object.keys(this.lists)
      .filter(listId => listId !== this.DEFAULT_ID)
      .sort((a, b) => this.nameOf(a).localeCompare(this.nameOf(b)));
    return [this.DEFAULT_ID, ...others];
  },

  // Targets for adding an entry.
  choices() {
    return this.orderedIds().map(listId => ({
      value: listId,
      label: this.nameOf(listId),
    }));
  },

  /*
    The list the "add to a list" choice starts with: the one chosen last, or
    Global when there is none or it is gone (deleted, or lost with an import).
  */
  defaultTarget() {
    const listId = App.addTarget;
    return listId && this.lists[listId] ? listId : this.DEFAULT_ID;
  },

  countOf(listId) {
    return this.lists[listId] ? this.lists[listId].entries.length : 0;
  },

  // Every list, empty ones and a not yet created Global included: the catalog.
  overview() {
    return this.orderedIds().map(listId => ({
      listId,
      sourceId: this.sourceIdOf(listId),
      name: this.nameOf(listId),
      count: this.countOf(listId),
      exists: !!this.lists[listId],
      isDefault: listId === this.DEFAULT_ID,
    }));
  },

  /*
    Items of the sources menu: the lists that have entries, and the current one
    even when it is empty (its last entry was removed), so the menu still shows
    where the user is.
  */
  menuItems(currentSourceId = null) {
    return Object.keys(this.lists)
      .filter(listId => this.lists[listId].entries.length
        || this.sourceIdOf(listId) === currentSourceId)
      .sort((a, b) => this.nameOf(a).localeCompare(this.nameOf(b)))
      .map(listId => {
        const sourceId = this.sourceIdOf(listId);
        return { value: sourceId, label: this.labelOf(sourceId) };
      });
  },

  /*
    A list in the shape of a loaded source (the part that Views and App read),
    with an empty structure. Not stored: it wraps the entries of the list.
  */
  asSource(sourceId) {
    const list = this.lists[this.listIdOf(sourceId)];
    if(!list) return undefined;
    return {
      id: sourceId,
      title: list.name,
      sourceName: '',
      parsed: {
        title: list.name,
        sourceName: '',
        structure: [],
        allEntries: list.entries,
      },
    };
  },

  // ---- names -------------------------------------------------------------------

  // A message for a name that cannot be used, or ''. exceptListId is the list
  // that is being renamed: it may keep its own name.
  nameError(name, exceptListId = null) {
    const trimmed = String(name).trim();
    if(!trimmed) return 'Enter a name.';
    if(trimmed.length > this.NAME_MAX_LENGTH) {
      return `At most ${this.NAME_MAX_LENGTH} characters.`;
    }
    const taken = Object.keys(this.lists)
      .filter(listId => listId !== exceptListId)
      .map(listId => this.nameOf(listId));
    // The name of Global is reserved even while the list does not exist.
    if(exceptListId !== this.DEFAULT_ID) taken.push(this.DEFAULT_NAME);
    const wanted = trimmed.toLowerCase();
    return taken.some(item => item.toLowerCase() === wanted) ? 'This name is taken.' : '';
  },

  newListId() {
    let n = 1;
    while(this.lists[`l${n}`] || this.unrecognized[`l${n}`]) n += 1;
    return `l${n}`;
  },

  // ---- changes -------------------------------------------------------------------

  hashOf(entry) {
    return Utils.hash(entry.lines.map(line => line.text).join('\n'));
  },

  // Applies the change and writes it. A failed write takes the change back.
  _change(apply) {
    const before = JSON.stringify(this.lists);
    apply();
    const saved = Storage.save(
      Storage.KEY.collections,
      Object.assign({}, this.unrecognized, this.lists),
    );
    if(!saved) this.lists = JSON.parse(before);
    return saved;
  },

  _announce(listId, kind) {
    Bus.emit(Bus.events.collectionsChanged, { sourceId: this.sourceIdOf(listId), kind });
  },

  // Only these change what a View shows (see the header).
  isContentChange(change, sourceId) {
    return !!change && change.sourceId === sourceId
      && (change.kind === 'added' || change.kind === 'removed');
  },

  /*
    A new empty list. -> { ok: true, listId } | { ok: false, error }. The name is
    validated again here: the prompt checks it only for the user's comfort.
  */
  create(name) {
    const error = this.nameError(name);
    if(error) return { ok: false, error };
    const listId = this.newListId();
    const saved = this._change(() => {
      this.lists[listId] = { name: String(name).trim(), nextId: 0, entries: [] };
    });
    if(!saved) return { ok: false, error: this.SAVE_FAILED_TEXT };
    this._announce(listId, 'created');
    return { ok: true, listId };
  },

  // Global keeps its name: it is the one list that is always offered by name.
  rename(listId, name) {
    if(!this.lists[listId]) return { ok: false, error: 'The list does not exist.' };
    if(listId === this.DEFAULT_ID) return { ok: false, error: 'This list cannot be renamed.' };
    const error = this.nameError(name, listId);
    if(error) return { ok: false, error };
    const saved = this._change(() => {
      this.lists[listId].name = String(name).trim();
    });
    if(!saved) return { ok: false, error: this.SAVE_FAILED_TEXT };
    this._announce(listId, 'renamed');
    return { ok: true, listId };
  },

  /*
    Deletes the list with its progress and selection. When it was the current
    source, nothing is current afterwards. Returns false when it could not be saved.
  */
  deleteList(listId) {
    if(!this.lists[listId]) return true;
    if(!this._change(() => { delete this.lists[listId]; })) return false;
    const sourceId = this.sourceIdOf(listId);
    const wasCurrent = App.currentSource === sourceId;
    App.clearViewsFor(sourceId);
    App.clearSelectionFor(sourceId);
    // The id may be reused by another list: no stale target must point to it.
    if(App.addTarget === listId) App.setAddTarget(null);
    this._announce(listId, 'deleted');
    if(wasCurrent) App.deselectSource();
    return true;
  },

  /*
    Removes one entry for good and drops its progress. Returns false when it
    could not be saved (nothing changes then). An entry that is not there counts
    as removed. The list stays, even when it becomes empty. nextId is not lowered.
  */
  removeEntry(listId, entryId) {
    const list = this.lists[listId];
    if(!list || !list.entries.some(entry => entry.id === entryId)) return true;
    const saved = this._change(() => {
      list.entries = list.entries.filter(entry => entry.id !== entryId);
    });
    if(!saved) return false;
    ViewState.forgetEntry(this.sourceIdOf(listId), entryId);
    this._announce(listId, 'removed');
    return true;
  },

  /*
    Adds a copy of the entry to the list, creating the list on the first entry.
    listId comes from choices(). Returns 'added', 'duplicate' (the list already
    has an entry with the same text) or 'storage' (could not be saved). Nothing
    is changed unless 'added'.
  */
  add(listId, entry) {
    const result = this.addMany(listId, [entry]);
    if(result.storage) return 'storage';
    return result.added ? 'added' : 'duplicate';
  },

  /*
    Adds copies of the entries with one write and one announcement. An entry whose
    text is exactly the text of an entry that the list already has, or that comes
    earlier in the batch, is skipped. Entries that only look alike (another
    translation of the same word) are not duplicates: they are different cards.
    -> { added, skipped, storage }. Nothing is changed when storage is true.
  */
  addMany(listId, entries) {
    const existing = this.lists[listId];
    const known = new Set(existing ? existing.entries.map(item => this.hashOf(item)) : []);
    const fresh = [];
    entries.forEach(entry => {
      const hash = this.hashOf(entry);
      if(known.has(hash)) return;
      known.add(hash);
      const copy = JSON.parse(JSON.stringify(entry));
      delete copy.section;
      delete copy.sourceId;
      fresh.push(copy);
    });
    const result = { added: fresh.length, skipped: entries.length - fresh.length, storage: false };
    if(!fresh.length) return result;

    const saved = this._change(() => {
      const list = this.lists[listId]
        || { name: this.nameOf(listId), nextId: 0, entries: [] };
      fresh.forEach(copy => {
        copy.id = list.nextId;
        copy.originalIndex = list.nextId;
        list.nextId += 1;
        list.entries.push(copy);
      });
      this.lists[listId] = list;
    });
    if(!saved) return { added: 0, skipped: 0, storage: true };
    this._announce(listId, 'added');
    return result;
  },
};
