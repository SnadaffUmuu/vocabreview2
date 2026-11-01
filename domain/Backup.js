/*
   Backup: export/import/reset of the whole persisted state. Pure domain logic;
   no DOM. Only Storage touches localStorage.
  
   A backup is a snapshot of every key in our Storage namespace, including raw
   source texts, so that an import works on file:// without re-picking files.
   parse() validates the file completely before anything is replaced: a bad
   file must never damage the current state. Version 1 exports are rejected on
   purpose; their data model differs and old data is not reconciled.
*/
const Backup = {

  FORMAT: 'vocabreview2-state',
  VERSION: 1,

  serialize(now = new Date()) {
    const payload = {
      format: this.FORMAT,
      version: this.VERSION,
      exportedAt: now.toISOString(),
      data: Storage.exportAll(),
    };
    return {
      filename: `vocabreview2-state-${Utils.timestamp(now)}.json`,
      json: JSON.stringify(payload),
    };
  },

  // -> { ok: true, data } | { ok: false, error }
  parse(text) {
    let payload;
    try {
      payload = JSON.parse(text);
    } catch(e) {
      return { ok: false, error: 'the file is not valid JSON.' };
    }
    if(!this._isObject(payload)) {
      return { ok: false, error: 'unexpected file content.' };
    }
    if(payload.format !== this.FORMAT) {
      const legacy = this._isObject(payload.localStorage);
      return {
        ok: false,
        error: legacy
          ? 'this is a Version 1 export, which cannot be imported.'
          : 'this is not an app state file.',
      };
    }
    if(payload.version !== this.VERSION) {
      return { ok: false, error: `unsupported file version: ${payload.version}.` };
    }
    const error = this._dataError(payload.data);
    return error ? { ok: false, error } : { ok: true, data: payload.data };
  },

  apply(data) {
    Storage.importAll(data);
  },

  reset() {
    Storage.clearAll();
  },

  _isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  },

  // Returns a message for the first problem found, or '' when data is usable.
  _dataError(data) {
    if(!this._isObject(data)) return 'the file has no state data.';
    const keys = Object.keys(data);
    if(!keys.length) return 'the file contains no state.';

    const srcPrefix = `${Storage.PREFIX}src.`;
    const mapKeys = [
      Storage.KEY.views,
      Storage.KEY.selections,
      Storage.KEY.settings,
      Storage.KEY.collections,
    ];
    for(const key of keys) {
      if(!key.startsWith(Storage.PREFIX)) return `foreign key "${key}".`;
      const value = data[key];
      if(key.startsWith(srcPrefix)) {
        if(!this._isObject(value) || typeof value.raw !== 'string') {
          return `broken source "${key.slice(srcPrefix.length)}".`;
        }
      } else if(mapKeys.includes(key) && !this._isObject(value)) {
        return `broken section "${key}".`;
      } else if(key === Storage.KEY.collections) {
        const broken = Object.keys(value).find(listId => !Collections.isValidList(value[listId]));
        if(broken) return `broken list "${broken}".`;
      }
    }
    return '';
  },
};
