// Storage: the only persistence boundary. Components and domain code never
// touch localStorage directly; they go through Storage methods.
//
// Canonical keys (prefix "vocabreview2." to avoid clashing with Version 1
// keys on file:// where localStorage is shared across local pages):
//
//   vocabreview2.src.<id>   one key per source: {raw, origin, loadedAt}
//   vocabreview2.collections custom collections (full entry copies)
//   vocabreview2.views       progress per source per view (written often)
//   vocabreview2.selections  selected section ids per source
//   vocabreview2.settings    theme, current source, current view
const Storage = {

  PREFIX: 'vocabreview2.',

  KEY: {
    collections: 'vocabreview2.collections',
    views: 'vocabreview2.views',
    selections: 'vocabreview2.selections',
    settings: 'vocabreview2.settings',
  },

  sourceKey(id) {
    return this.PREFIX + 'src.' + id;
  },

  load(key, defaultValue) {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : defaultValue;
    } catch(e) {
      console.error('Storage.load failed for', key, e);
      return defaultValue;
    }
  },

  save(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch(e) {
      console.error('Storage.save failed for', key, e);
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch(e) {
      console.error('Storage.remove failed for', key, e);
    }
  },

  saveSource(id, source) {
    this.save(this.sourceKey(id), source);
  },

  loadSource(id) {
    return this.load(this.sourceKey(id), null);
  },

  removeSource(id) {
    this.remove(this.sourceKey(id));
  },

  // Source files removed from the hard-coded list must not occupy storage.
  // Only inspect our source-key namespace; leave other app data untouched.
  removeUnlistedSources(allowedIds) {
    const allowed = new Set(allowedIds);
    const prefix = this.PREFIX + 'src.';
    try {
      for(let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if(key && key.startsWith(prefix) && !allowed.has(key.slice(prefix.length))) {
          this.remove(key);
        }
      }
    } catch(e) {
      console.error('Storage.removeUnlistedSources failed', e);
    }
  },
};
