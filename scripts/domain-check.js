// Development-only: smoke-tests the domain layer (Parser + Library + App +
// Progress) without a browser. Run from vocabreview2 root:
//   node scripts/domain-check.js
//
// Builds minimal globals (regex, Utils, Bus, Storage) and loads the parser and
// domain files via vm, then exercises source loading, selection, and progress.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const memStore = {};

// ---- globals ---------------------------------------------------------------
global.queueMicrotask = global.queueMicrotask || ((cb) => Promise.resolve().then(cb));
global.Bus = null; // set below by loading core/Bus.js
global.regex = {
  hasKanji: /[\p{Script=Han}]+/u,
  kanaOnly: /^[\p{Script=Hiragana}\p{Script=Katakana}\p{N}\p{P}\s\p{S}\p{Z}ー]+$/u,
  hiraganaOnly: /^[\p{Script=Hiragana}\p{N}\p{P}\s\p{S}\p{Z}ー]+$/u,
  katakanaOnly: /^[\p{Script=Katakana}\p{N}\p{P}\s\p{S}\p{Z}ー]+$/u,
  nonJapanese: /^[\p{Script=Cyrillic}\p{Script=Latin}\p{N}\p{P}\s\p{S}\p{Z}ー]+$/u,
  japaneseOnly: /^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\p{N}\p{P}\s\p{S}\p{Z}ー]+$/u,
  mixed: /^(?=.*[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}])(?=.*[\p{Script=Latin}\p{Script=Cyrillic}])[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\p{Script=Latin}\p{Script=Cyrillic}\p{N}\p{P}\s\p{S}\p{Z}ー]+$/u,
  nonChars: /[\p{N}\p{P}\s\p{S}\p{Z}ー]+/u,
};
global.Utils = {
  countCharOccurrencesInString(s, c) {
    let n = 0;
    for(const x of s) if(x === c) n++;
    return n;
  },
};
global.SOURCES_LIST = ['goshogun2', 'osarai-house', 'SR_secret'];

global.Storage = {
  KEY: {
    settings: 'vocabreview2.settings',
    views: 'vocabreview2.views',
    selections: 'vocabreview2.selections',
    collections: 'vocabreview2.collections',
  },
  PREFIX: 'vocabreview2.',
  sourceKey(id) { return 'vocabreview2.src.' + id; },
  load(k, d) { return memStore[k] !== undefined ? JSON.parse(memStore[k]) : d; },
  save(k, v) { memStore[k] = JSON.stringify(v); },
  remove(k) { delete memStore[k]; },
  loadSource(id) { return memStore['vocabreview2.src.' + id] !== undefined
    ? JSON.parse(memStore['vocabreview2.src.' + id]) : null; },
  saveSource(id, s) { memStore['vocabreview2.src.' + id] = JSON.stringify(s); },
  removeSource(id) { delete memStore['vocabreview2.src.' + id]; },
};

function loadRel(file) {
  const abs = path.join(__dirname, '..', file);
  vm.runInThisContext(fs.readFileSync(abs, 'utf8'), { filename: file });
}

// ---- load parser + core + domain ------------------------------------------
loadRel('domain/parser/Parser.js');
loadRel('core/Bus.js');
loadRel('domain/Library.js');
loadRel('domain/App.js');
loadRel('domain/ViewState.js');
loadRel('domain/SliderState.js');
loadRel('domain/Progress.js');

// ---- exercise --------------------------------------------------------------
const vocabDir = path.join(__dirname, '..', 'vocab');
const ids = ['goshogun2', 'osarai-house', 'SR_secret'];
ids.forEach(id => {
  Library.setSource(id, fs.readFileSync(path.join(vocabDir, id + '.txt'), 'utf8'), 'http');
});

function assert(cond, msg) {
  if(!cond) { console.error('FAIL: ' + msg); process.exitCode = 1; }
  else console.log('ok  : ' + msg);
}

assert(Library.listIds().length === 3, 'three sources loaded');
assert(Library.getSource('goshogun2').parsed.allEntries.length === 15, 'goshogun2 has 15 entries');

App.selectOrigin('osarai-house');
assert(App.currentOrigin === 'osarai-house', 'origin selected');

const struct = Library.getSource('osarai-house').parsed.structure;
const sections = [];
(function walk(ns) { ns.forEach(n => { sections.push(n.id); if(n.children) walk(n.children); }); })(struct);
assert(sections.join(',') === '0,0.0,0.1', 'osarai-house sections are 0,0.0,0.1');

assert(App.selectedEntries('osarai-house').length === 34, 'no selection -> all 34 entries');

App.setSelection('osarai-house', ['0.0']);
assert(App.selectedEntries('osarai-house').length > 0
  && App.selectedEntries('osarai-house').length < 34, 'selection filters entries');

assert(Progress.activeSessions().length === 0, 'no sessions in progress before any mark');

SliderState.setSideIndex('osarai-house', 0, 1);
assert(Object.keys(Progress.marksBySection('osarai-house')).length === 0,
  'side navigation alone is not review progress');
assert(Progress.activeSessions().length === 0, 'side navigation alone is not a session');

SliderState.toggleSideMark('osarai-house', 0, 'hits', 0);
const marks = Progress.marksBySection('osarai-house');
const firstSection = Library.getSource('osarai-house').parsed.allEntries[0].section;
assert(marks[firstSection] && marks[firstSection].includes('S'),
  'progress mark S appears for the entry section');

const sessions = Progress.activeSessions();
assert(sessions.length === 1 && sessions[0].originId === 'osarai-house'
  && sessions[0].views.length === 1 && sessions[0].views[0].name === 'slider'
  && sessions[0].views[0].label === 'S', 'activeSessions lists origin and view letter');

SliderState.toggleSideMark('osarai-house', 0, 'lapses', 0);
let sliderEntry = ViewState.entry('osarai-house', 'slider', 0);
assert(!sliderEntry.hits && sliderEntry.lapses.includes(0), 'hit and lapse are mutually exclusive');

SliderState.toggleSideMark('osarai-house', 0, 'lapses', 0);
assert(ViewState.entry('osarai-house', 'slider', 0) === null,
  'clearing the final mark removes entry progress');
assert(Progress.activeSessions().length === 0, 'session disappears with the last mark');
SliderState.toggleSideMark('osarai-house', 0, 'lapses', 0);

App.setSelection('osarai-house', ['0.1']);
sliderEntry = ViewState.entry('osarai-house', 'slider', 0);
assert(sliderEntry.lapses.includes(0), 'selection change does not delete progress');

SliderState.resetNavigation('osarai-house');
assert(ViewState.entry('osarai-house', 'slider', 0).lapses.includes(0),
  'resetNavigation keeps progress');

SliderState.removeEntry('osarai-house', 1);
assert(ViewState.entry('osarai-house', 'slider', 1).removed, 'removed entry is persisted as progress');

// Reset clears only entries of the given selection, others keep progress.
const inSel = App.selectedEntries('osarai-house').map(e => e.id);
SliderState.toggleSideMark('osarai-house', 33, 'hits', 0);
const outsideId = Library.getSource('osarai-house').parsed.allEntries
  .find(e => !inSel.includes(e.id)).id;
SliderState.toggleSideMark('osarai-house', outsideId, 'hits', 0);
ViewState.resetEntries('osarai-house', 'slider', inSel, { mode: 'original' });
assert(inSel.every(id => ViewState.entry('osarai-house', 'slider', id) === null),
  'reset clears progress of selected entries');
assert(ViewState.entry('osarai-house', 'slider', outsideId) !== null,
  'reset keeps progress outside the selection');

// Reload wipes views and selection of that source only.
SliderState.toggleSideMark('goshogun2', 0, 'hits', 0);
Library.reloadSource('osarai-house',
  fs.readFileSync(path.join(vocabDir, 'osarai-house.txt'), 'utf8'), 'http');
assert(!App.views['osarai-house'] && App.getSelection('osarai-house').length === 0,
  'reload resets views and selection of the source');
assert(App.views['goshogun2'], 'reload does not touch other sources');
assert(Library.getSource('osarai-house').loadedAt > 0, 'loadedAt is kept in memory');

// Persistence round-trip.
App.saveViews();
const reloadedViews = Storage.load(Storage.KEY.views, {});
assert(reloadedViews['goshogun2']
  && reloadedViews['goshogun2']['slider'], 'views persisted and reloadable');

console.log('\nDOMAIN SMOKE TEST DONE');

assert(Object.keys(memStore).every(k => k.startsWith('vocabreview2.')),
  'all stored keys carry the vocabreview2. prefix');
assert(!Object.keys(memStore).some(k => k.indexOf('knownSources') >= 0),
  'no extra knownSources key');
