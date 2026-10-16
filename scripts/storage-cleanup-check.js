// Domain/storage check only; no browser needed. Run with node scripts/storage-cleanup-check.js.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const data = new Map();
global.localStorage = {
  get length() { return data.size; },
  key(index) { return Array.from(data.keys())[index] ?? null; },
  getItem(key) { return data.get(key) ?? null; },
  setItem(key, value) { data.set(key, String(value)); },
  removeItem(key) { data.delete(key); },
};

function load(file) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { filename: file });
}

load('core/Storage.js');
load('domain/sources-list.js');
load('domain/App.js');

const listed = SOURCES_LIST[0];
const retired = 'retired-book';
Storage.saveSource(listed, { raw: 'keep' });
Storage.saveSource(retired, { raw: 'discard' });
Storage.saveSource('another-retired-book', { raw: 'discard too' });
Storage.save(Storage.KEY.views, {
  [listed]: { slider: { progress: { 0: { hits: [0] } } } },
  [retired]: { slider: { progress: { 0: { hits: [0] } } } },
  'not-imported': { slider: { progress: {} } },
});
Storage.save(Storage.KEY.selections, { [listed]: ['0'], [retired]: ['1'] });
Storage.save(Storage.KEY.settings, { currentSource: retired, currentView: 'slider', night: true });
localStorage.setItem('vocabreview.src.legacy', 'leave alone');
localStorage.setItem('vocabreview2.collections', 'leave alone');

App.load();
Storage.removeUnlistedSources(SOURCES_LIST);
App.removeUnlistedSources(SOURCES_LIST);

assert.deepEqual(Storage.loadSource(listed), { raw: 'keep' });
assert.equal(Storage.loadSource(retired), null);
assert.equal(Storage.loadSource('another-retired-book'), null);
assert.deepEqual(Object.keys(Storage.load(Storage.KEY.views, {})), [listed]);
assert.deepEqual(Object.keys(Storage.load(Storage.KEY.selections, {})), [listed]);
assert.equal(App.currentSource, null);
assert.equal(Storage.load(Storage.KEY.settings, {}).currentSource, null);
assert.equal(App.currentView, 'slider');
assert.equal(App.night, true);
assert.equal(localStorage.getItem('vocabreview.src.legacy'), 'leave alone');
assert.equal(localStorage.getItem('vocabreview2.collections'), 'leave alone');

const once = Array.from(data);
Storage.removeUnlistedSources(SOURCES_LIST);
App.removeUnlistedSources(SOURCES_LIST);
assert.deepEqual(Array.from(data), once);

App.settings.currentSource = listed;
App.removeUnlistedSources(SOURCES_LIST);
assert.equal(App.currentSource, listed);
console.log('storage cleanup check passed');