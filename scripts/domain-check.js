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
loadRel('domain/ReviewSessions.js');
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

ReviewSessions.setSideIndex('osarai-house', 'slider', 0, 1);
assert(Object.keys(Progress.marksBySection('osarai-house')).length === 0,
  'side navigation alone is not review progress');

ReviewSessions.toggleSideMark('osarai-house', 'slider', 0, 'hits', 0);
const marks = Progress.marksBySection('osarai-house');
assert(marks[App.selectedEntries('osarai-house')[0].section], 'progress mark appears for section');

ReviewSessions.toggleSideMark('osarai-house', 'slider', 0, 'lapses', 0);
let sliderEntry = ReviewSessions.entry('osarai-house', 'slider', 0);
assert(!sliderEntry.hits && sliderEntry.lapses.includes(0), 'hit and lapse are mutually exclusive');

ReviewSessions.toggleSideMark('osarai-house', 'slider', 0, 'lapses', 0);
assert(ReviewSessions.entry('osarai-house', 'slider', 0) === null,
  'clearing the final mark removes entry progress');
ReviewSessions.toggleSideMark('osarai-house', 'slider', 0, 'lapses', 0);

App.setSelection('osarai-house', ['0.1']);
sliderEntry = ReviewSessions.entry('osarai-house', 'slider', 0);
assert(sliderEntry.lapses.includes(0), 'selection change does not delete progress');

ReviewSessions.removeEntry('osarai-house', 'slider', 1);
assert(ReviewSessions.entry('osarai-house', 'slider', 1).removed, 'removed entry is persisted as progress');

// Persistence round-trip.
App.saveViews();
const reloadedViews = Storage.load(Storage.KEY.views, {});
assert(reloadedViews['osarai-house']
  && reloadedViews['osarai-house']['slider'], 'views persisted and reloadable');

console.log('\nDOMAIN SMOKE TEST DONE');
