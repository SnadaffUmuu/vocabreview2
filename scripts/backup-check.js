/*
   Domain/storage check only; no browser needed. Run with node scripts/backup-check.js.
*/
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

load('core/Utils.js');
load('core/Storage.js');
load('domain/sources-list.js');
load('domain/Collections.js');
load('domain/Backup.js');

const listed = SOURCES_LIST[0];
Storage.saveSource(listed, { raw: 'text', origin: 'file', loadedAt: 1 });
Storage.save(Storage.KEY.views, { [listed]: { slider: { progress: { 0: { hits: [0] } }, ui: {} } } });
Storage.save(Storage.KEY.selections, { [listed]: ['0'] });
Storage.save(Storage.KEY.settings, { currentSource: listed, currentView: 'slider', night: true });
localStorage.setItem('review-data', 'foreign');

// Round trip: export, wipe, import gives the same namespace; foreign keys stay.
const before = Storage.exportAll();
assert.equal(Object.keys(before).length, 4);
assert.ok(!('review-data' in before));

const exported = Backup.serialize(new Date(2026, 0, 2, 3, 4, 5));
assert.equal(exported.filename, 'vocabreview2-state-2026-01-02-030405.json');

Backup.reset();
assert.deepEqual(Storage.exportAll(), {});
assert.equal(localStorage.getItem('review-data'), 'foreign');

const parsed = Backup.parse(exported.json);
assert.equal(parsed.ok, true);
Backup.apply(parsed.data);
assert.deepEqual(Storage.exportAll(), before);
assert.equal(localStorage.getItem('review-data'), 'foreign');

// Import replaces, not merges.
Storage.save(Storage.KEY.collections, { stale: true });
Backup.apply(parsed.data);
assert.deepEqual(Storage.exportAll(), before);

// A broken collections section is rejected like any other section.
const badCollections = JSON.stringify({
  format: Backup.FORMAT, version: 1, data: { [Storage.KEY.collections]: [] },
});
assert.equal(Backup.parse(badCollections).ok, false, 'collections not an object');
const goodCollections = JSON.stringify({
  format: Backup.FORMAT, version: 1,
  data: { [Storage.KEY.collections]: { global: { name: 'Global', nextId: 0, entries: [] } } },
});
assert.equal(Backup.parse(goodCollections).ok, true, 'collections are exported and imported');

// The structure of every list is validated, so a bad list is never imported (and never dropped silently later).
const withLists = lists => JSON.stringify({
  format: Backup.FORMAT, version: 1, data: { [Storage.KEY.collections]: lists },
});
const goodList = { name: 'L', nextId: 1, entries: [{ id: 0, lines: [] }] };
assert.equal(Backup.parse(withLists({ l1: goodList })).ok, true, 'a valid list is accepted');
for(const [what, list] of [
  ['no name', { nextId: 0, entries: [] }],
  ['no nextId', { name: 'L', entries: [] }],
  ['entries not an array', { name: 'L', nextId: 0, entries: {} }],
  ['an entry without lines', { name: 'L', nextId: 1, entries: [{ id: 0 }] }],
  ['an entry without an id', { name: 'L', nextId: 1, entries: [{ lines: [] }] }],
  ['not an object', 5],
]) {
  const result = Backup.parse(withLists({ l1: goodList, bad: list }));
  assert.equal(result.ok, false, `a broken list is rejected: ${what}`);
  assert(result.error.includes('"bad"'), 'the broken list is named');
}

// A write that fails is reported to the caller.
const realSetItem = localStorage.setItem;
localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
const consoleError = console.error;
console.error = () => {};
assert.equal(Storage.save(Storage.KEY.collections, {}), false, 'a failed write is reported');
console.error = consoleError;
localStorage.setItem = realSetItem;
assert.equal(Storage.save(Storage.KEY.collections, { stale: true }), true, 'a successful write is reported');

// Bad files are rejected, and parse() never touches storage.
const snapshot = Array.from(data);
const key = Storage.sourceKey(listed);
const bad = {
  'not json': 'not json {',
  'array': '[]',
  'version 1 export': JSON.stringify({ version: 1, localStorage: { 'review-data': {} } }),
  'other format': JSON.stringify({ format: 'something', version: 1, data: {} }),
  'future version': JSON.stringify({ format: Backup.FORMAT, version: 99, data: before }),
  'no data': JSON.stringify({ format: Backup.FORMAT, version: 1 }),
  'empty data': JSON.stringify({ format: Backup.FORMAT, version: 1, data: {} }),
  'foreign key': JSON.stringify({ format: Backup.FORMAT, version: 1, data: { 'review-data': {} } }),
  'source without raw': JSON.stringify({ format: Backup.FORMAT, version: 1, data: { [key]: {} } }),
  'views not an object': JSON.stringify({
    format: Backup.FORMAT, version: 1, data: { [Storage.KEY.views]: [] },
  }),
};
Object.keys(bad).forEach(name => {
  const result = Backup.parse(bad[name]);
  assert.equal(result.ok, false, name);
  assert.ok(result.error, name);
});
assert.deepEqual(Array.from(data), snapshot);

assert.equal(Backup.parse(bad['version 1 export']).error, 'this is a Version 1 export, which cannot be imported.');

console.log('backup check passed');
