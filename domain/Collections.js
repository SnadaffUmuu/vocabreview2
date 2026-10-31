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
  entry added to it.
*/
const Collections = {

  SOURCE_PREFIX: 'L:',
  DEFAULT_ID: 'global',
  DEFAULT_NAME: 'Global',

  lists: {},

  load() {
    const saved = Storage.load(Storage.KEY.collections, {});
    this.lists = {};
    if(!saved || typeof saved !== 'object' || Array.isArray(saved)) return;
    Object.keys(saved).forEach(listId => {
      if(this.isValidList(saved[listId])) this.lists[listId] = saved[listId];
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

  // Targets for adding an entry: "global" first, even if it does not exist yet.
  choices() {
    const others = Object.keys(this.lists)
      .filter(listId => listId !== this.DEFAULT_ID)
      .sort((a, b) => this.nameOf(a).localeCompare(this.nameOf(b)));
    return [this.DEFAULT_ID, ...others].map(listId => ({
      value: listId,
      label: this.nameOf(listId),
    }));
  },

  // Items of the sources menu: only the lists that have entries.
  menuItems() {
    return Object.keys(this.lists)
      .filter(listId => this.lists[listId].entries.length)
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

  // ---- changes -------------------------------------------------------------------

  hashOf(entry) {
    return Utils.hash(entry.lines.map(line => line.text).join('\n'));
  },

  /*
    Adds a copy of the entry to the list, creating the list on the first entry.
    listId comes from choices(). Returns false when the list already has an
    entry with the same text: nothing is changed then.
  */
  add(listId, entry) {
    const list = this.lists[listId]
      || { name: this.nameOf(listId), nextId: 0, entries: [] };
    const hash = this.hashOf(entry);
    if(list.entries.some(item => this.hashOf(item) === hash)) return false;

    const copy = JSON.parse(JSON.stringify(entry));
    delete copy.section;
    delete copy.sourceId;
    copy.id = list.nextId;
    copy.originalIndex = list.nextId;
    list.nextId += 1;
    list.entries.push(copy);

    this.lists[listId] = list;
    Storage.save(Storage.KEY.collections, this.lists);
    Bus.emit(Bus.events.collectionsChanged, { sourceId: this.sourceIdOf(listId) });
    return true;
  },
};
