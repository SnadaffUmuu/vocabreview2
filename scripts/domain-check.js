/*
   Development-only: smoke-tests the domain layer (Parser + Library + App +
   Progress) without a browser. Run from vocabreview2 root:
     node scripts/domain-check.js
  
   Builds minimal globals (regex, Utils, Bus, Storage) and loads the parser and
   domain files via vm, then exercises source loading, selection, and progress.
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const memStore = {};

// ---- globals ---------------------------------------------------------------
global.queueMicrotask = global.queueMicrotask || ((cb) => Promise.resolve().then(cb));
global.requestAnimationFrame = global.requestAnimationFrame || ((cb) => setTimeout(cb, 0));
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
  shuffle(array) {
    const copy = array.slice();
    for(let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  },
  hash(str) {
    let h = 0;
    for(let i = 0; i < str.length; i++) h = (Math.imul(h, 31) + str.charCodeAt(i)) >>> 0;
    return h;
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
  failSaves: false,
  save(k, v) {
    if(this.failSaves) return false;
    memStore[k] = JSON.stringify(v);
    return true;
  },
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
loadRel('domain/Collections.js');
loadRel('domain/Library.js');
loadRel('domain/App.js');
loadRel('domain/ViewState.js');
loadRel('domain/SliderState.js');
loadRel('domain/BoardState.js');
loadRel('domain/PanelState.js');
loadRel('domain/TableState.js');
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

App.selectSource('osarai-house');
assert(App.currentSource === 'osarai-house', 'source selected');

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
assert(sessions.length === 1 && sessions[0].sourceId === 'osarai-house'
  && sessions[0].views.length === 1 && sessions[0].views[0].name === 'slider'
  && sessions[0].views[0].label === 'S', 'activeSessions lists source and view letter');

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

// Update replaces the text only: progress and selection stay, nothing is reconciled.
{
  const id = 'goshogun2';
  const before = Library.getSource(id).raw;
  const firstLine = Library.getSource(id).parsed.allEntries[0].lines[0].text;
  const selectionBefore = App.getSelection(id).slice();
  const marksBefore = JSON.stringify(App.views[id]);
  const entriesBefore = Library.getSource(id).parsed.allEntries.length;
  const otherId = 'SR_secret';
  const otherRawBefore = Library.getSource(otherId).raw;
  const otherViewsBefore = JSON.stringify(App.views[otherId]);

  Library.updateSource(id, before.replace(firstLine, firstLine + 'X'), 'http');

  const updated = Library.getSource(id);
  assert(updated.parsed.allEntries[0].lines[0].text === firstLine + 'X',
    'update parses the new text');
  assert(updated.parsed.allEntries.length === entriesBefore,
    'update keeps the number of entries for a typo fix');
  assert(JSON.stringify(App.views[id]) === marksBefore,
    'update keeps progress of the source');
  assert(App.getSelection(id).join(',') === selectionBefore.join(','),
    'update keeps selection of the source');
  assert(Storage.loadSource(id).raw === updated.raw && updated.raw !== before,
    'update persists the new raw text');
  assert(Library.getSource(otherId).raw === otherRawBefore
    && JSON.stringify(App.views[otherId]) === otherViewsBefore,
    'update does not touch other sources');
}

// Persistence round-trip.
App.saveViews();
const reloadedViews = Storage.load(Storage.KEY.views, {});
assert(reloadedViews['goshogun2']
  && reloadedViews['goshogun2']['slider'], 'views persisted and reloadable');

assert(Object.keys(memStore).every(k => k.startsWith('vocabreview2.')),
  'all stored keys carry the vocabreview2. prefix');
assert(!Object.keys(memStore).some(k => k.indexOf('knownSources') >= 0),
  'no extra knownSources key');

// Large sources default to the first leaf section only when no sections are
// selected. Explicit multi-section selections are not limited by entry count.
function sourceWithEntries(firstCount, secondCount, nested = true) {
  const first = Array.from({ length: firstCount }, (_, i) => 'word' + i + '\nmeaning').join('\n\n');
  const second = Array.from({ length: secondCount }, (_, i) => 'other' + i + '\nmeaning').join('\n\n');
  return 'Title\n====\n\n' + (nested ? '~~~~\nTop\n~~~~\n\n' : '')
    + '[1]\n\n' + first + '\n\n[2]\n\n' + second;
}

const largeId = 'large-check';
const largeRaw = sourceWithEntries(101, 5);
Library.setSource(largeId, largeRaw, 'http');
assert(Library.getSource(largeId).parsed.allEntries.length === 106,
  'large test source parses all 106 entries');
assert(App.getSelection(largeId).join(',') === '0.0'
  && App.selectedEntries(largeId).length === 101,
  'large source defaults to first child even when it exceeds 100 entries');
assert(Storage.load(Storage.KEY.selections, {})[largeId].join(',') === '0.0',
  'automatic selection is persisted immediately');

App.setSelection(largeId, ['0.0', '0.1']);
assert(App.selectedEntries(largeId).length === 106,
  'explicit large selection is not capped');
App.selectSource('goshogun2');
App.selectSource(largeId);
assert(App.getSelection(largeId).length === 2,
  'switching sources preserves an explicit selection');
App.setSelection(largeId, []);
assert(App.getSelection(largeId).join(',') === '0.0'
  && App.selectedEntries(largeId).length === 101,
  'filtering with no checked boxes reapplies the large-source default');

App.clearSelectionFor(largeId);
App.selectSource(largeId);
assert(App.getSelection(largeId).join(',') === '0.0',
  'switching to a source with no selection applies the guard');
App.setSelection(largeId, ['0.1']);
App.load();
Library.sources = {};
SOURCES_LIST.push(largeId);
Library.load();
assert(App.getSelection(largeId).join(',') === '0.1',
  'startup keeps a saved non-empty selection');
App.selections[largeId] = [];
Storage.save(Storage.KEY.selections, App.selections);
App.load();
Library.sources = {};
Library.load();
assert(App.getSelection(largeId).join(',') === '0.0',
  'startup repairs a saved empty selection for a large source');
App.clearSelectionFor(largeId);
App.load();
Library.sources = {};
Library.load();
assert(App.getSelection(largeId).join(',') === '0.0',
  'startup initializes a large source with no saved selection');

Library.reloadSource(largeId, sourceWithEntries(90, 11, false), 'http');
assert(App.getSelection(largeId).join(',') === '0'
  && App.selectedEntries(largeId).length === 90,
  'reload resets selection and chooses first root when it has no children');

const smallId = 'small-check';
Library.setSource(smallId, sourceWithEntries(95, 5), 'http');
assert(App.getSelection(smallId).length === 0
  && App.selectedEntries(smallId).length === 100,
  'exactly 100 entries load in full');
App.setSelection(smallId, ['0.0']);
App.setSelection(smallId, []);
assert(App.getSelection(smallId).length === 0
  && App.selectedEntries(smallId).length === 100,
  'empty filter on a small source loads everything');

const thresholdId = 'threshold-check';
Library.setSource(thresholdId, sourceWithEntries(1, 100), 'http');
assert(App.getSelection(thresholdId).join(',') === '0.0'
  && App.selectedEntries(thresholdId).length === 1,
  'guard applies at exactly 101 entries, based on source total');

// ---- Prompt: confirm / notify state ---------------------------------------
loadRel('domain/Prompt.js');
{
  const log = [];
  Prompt.ask({ text: 'q', onConfirm: () => log.push('yes'), onCancel: () => log.push('no') });
  assert(Prompt.isOpen && Prompt.current.notify === false, 'ask opens a confirm prompt');
  Prompt.ask({ text: 'other', onConfirm: () => log.push('other') });
  assert(Prompt.current.text === 'q', 'ask while open is ignored');
  Prompt.confirm();
  assert(!Prompt.isOpen && log.join() === 'yes', 'confirm closes and runs onConfirm synchronously');
  Prompt.ask({ text: 'q', onConfirm: () => log.push('yes'), onCancel: () => log.push('no') });
  Prompt.cancel();
  assert(!Prompt.isOpen && log.join() === 'yes,no', 'cancel closes and runs onCancel');
  Prompt.confirm();
  assert(log.length === 2, 'confirm without an open prompt is a no-op');
  Prompt.notify('msg', () => log.push('closed'));
  assert(Prompt.current.notify === true, 'notify opens a notify prompt');
  Prompt.cancel();
  assert(!Prompt.isOpen && log[2] === 'closed', 'notify closes through either path');

  assert(JSON.stringify(Prompt.state) === '{"open":false,"text":"","notify":false,"choice":null,"input":null,"canConfirm":true,"serial":' + Prompt.serial + '}',
    'state of a closed prompt');
  Prompt.notify('msg');
  assert(JSON.stringify(Prompt.state) === '{"open":true,"text":"msg","notify":true,"choice":null,"input":null,"canConfirm":true,"serial":' + Prompt.serial + '}',
    'state of an open prompt carries no callbacks');
  Prompt.cancel();

  const picked = [];
  const items = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }];
  Prompt.ask({ text: 'q', choice: { items, value: 'a' }, onConfirm: v => picked.push(v) });
  assert(Prompt.state.choice.value === 'a' && Prompt.state.choice.items.length === 2,
    'a choice starts with its initial value');
  Prompt.choose('zzz');
  assert(Prompt.state.choice.value === 'a', 'a value that is not offered is ignored');
  Prompt.choose('b');
  assert(Prompt.state.choice.value === 'b', 'choose changes the value');
  Prompt.confirm();
  assert(picked.join() === 'b', 'onConfirm receives the chosen value');
  Prompt.ask({ text: 'q', choice: { items, value: 'a' }, onConfirm: v => picked.push(v) });
  Prompt.confirm();
  assert(picked.join() === 'b,a', 'the initial value is confirmed when nothing was chosen');
  Prompt.choose('b');
  assert(!Prompt.isOpen, 'choose without an open prompt is a no-op');
}

// ---- Collections: custom lists ---------------------------------------------
{
  const listSource = 'L:global';
  const savedCurrent = App.settings.currentSource;
  Collections.lists = {};
  Storage.remove(Storage.KEY.collections);
  const origin = Library.getSource('goshogun2').parsed.allEntries[3];
  const other = Library.getSource('goshogun2').parsed.allEntries[4];

  assert(Collections.choices().length === 1 && Collections.choices()[0].value === 'global'
    && Collections.choices()[0].label === 'Global', 'Global is offered before it exists');
  assert(!Collections.has(listSource) && !Library.hasSource(listSource)
    && !Collections.menuItems().length, 'a list that does not exist is not a source');
  assert(Storage.load(Storage.KEY.collections, null) === null, 'offering Global creates nothing');

  assert(Collections.add('global', origin) === 'added', 'the first add creates the list');
  const list = Collections.lists.global;
  assert(list.name === 'Global' && list.entries.length === 1 && list.nextId === 1, 'list shape');
  const copy = list.entries[0];
  assert(copy !== origin && copy.id === 0 && copy.originalIndex === 0, 'the copy gets its own id');
  assert(!('section' in copy) && copy.lines.length === origin.lines.length
    && copy.lines.every((line, i) => line !== origin.lines[i] && line.text === origin.lines[i].text
      && line.originalIndex === origin.lines[i].originalIndex),
  'the copy has no section and keeps the lines (and their indexes) as copies');
  assert(origin.id === 3 && origin.section !== undefined, 'the source entry is not changed');
  assert(JSON.stringify(Storage.load(Storage.KEY.collections, null)) === JSON.stringify(Collections.lists),
    'the list is saved at once');

  assert(Collections.add('global', origin) === 'duplicate' && list.entries.length === 1,
    'the same text is not added twice');
  assert(Collections.add('global', other) === 'added' && list.entries[1].id === 1 && list.nextId === 2,
    'ids go on counting');

  assert(Library.hasSource(listSource) && Library.getSource(listSource).parsed.structure.length === 0,
    'a list looks like a source without structure');
  assert(Library.labelOf(listSource) === 'L: Global' && Library.labelOf('goshogun2') === 'goshogun2',
    'labels');
  assert(Collections.menuItems().length === 1 && Collections.menuItems()[0].value === listSource
    && Collections.menuItems()[0].label === 'L: Global', 'a non-empty list is in the menu');
  assert(!Library.listIds().includes(listSource) && !Library.missingIds().includes(listSource),
    'a list is not a file source');
  assert(App.selectedEntries(listSource).length === 2 && App.defaultSelection(listSource).length === 0,
    'the whole list is shown, there is no default selection');
  App.selectSource(listSource);
  assert(App.currentSource === listSource && App.getSelection(listSource).length === 0,
    'a list can be the current source, with no selection');

  // Progress of a list is kept like the progress of a source.
  SliderState.toggleSideMark(listSource, 0, 'hits', 0);
  BoardState.removeEntry(listSource, 1);
  assert(BoardState.layout(listSource).source.length === 1, 'a removed card is hidden');
  assert(Collections.lists.global.entries.length === 2, 'removing a card does not remove it from the list');
  const session = Progress.activeSessions().find(s => s.sourceId === listSource);
  assert(session && session.label === 'L: Global' && session.views.length === 2,
    'a list with progress is a session, with its label');
  assert(Progress.activeSessions().find(s => s.sourceId === 'goshogun2').label === 'goshogun2',
    'a file source label is its id');

  // Reloading or updating a source does not touch a list.
  const listBefore = JSON.stringify(Collections.lists);
  const viewsBefore = JSON.stringify(App.views[listSource]);
  Library.reloadSource('goshogun2',
    fs.readFileSync(path.join(vocabDir, 'goshogun2.txt'), 'utf8'), 'http');
  Library.updateSource('goshogun2',
    fs.readFileSync(path.join(vocabDir, 'goshogun2.txt'), 'utf8'), 'http');
  assert(JSON.stringify(Collections.lists) === listBefore
    && JSON.stringify(App.views[listSource]) === viewsBefore,
  'reload and update of a source leave lists and their progress alone');

  // Restart: the lists come back from Storage, progress survives the cleanup.
  Collections.lists = {};
  Collections.load();
  assert(JSON.stringify(Collections.lists) === listBefore, 'lists are loaded back');
  App.removeUnlistedSources([...SOURCES_LIST, ...Collections.sourceIds()]);
  assert(App.views[listSource] && App.currentSource === listSource,
    'progress and the current list survive the cleanup');
  App.removeUnlistedSources(SOURCES_LIST);
  assert(!App.views[listSource] && App.currentSource === null,
    'without the list ids the cleanup would retire its progress');

  // A broken saved list is skipped, not fatal.
  Storage.save(Storage.KEY.collections, { bad: { name: 1 }, ok: { name: 'Ok', nextId: 0, entries: [] } });
  Collections.load();
  assert(Object.keys(Collections.lists).join() === 'ok', 'a broken list is skipped on load');

  Collections.lists = {};
  Storage.remove(Storage.KEY.collections);
  App.clearViewsFor(listSource);
  App.settings.currentSource = savedCurrent;
}
// ---- Collections: managing lists and their entries ------------------------
loadRel('domain/ListPrompts.js');
loadRel('domain/EntrySearch.js');
{
  const savedCurrent = App.settings.currentSource;
  const entries = Library.getSource('goshogun2').parsed.allEntries;
  const events = [];
  const onChange = payload => events.push(`${payload.kind}:${payload.sourceId}`);
  Bus.on(Bus.events.collectionsChanged, onChange);
  Collections.lists = {};
  Collections.unrecognized = {};
  Storage.remove(Storage.KEY.collections);

  // Names
  assert(Collections.nameError('') !== '' && Collections.nameError('   ') !== '', 'an empty name is refused');
  assert(Collections.nameError('x'.repeat(41)) !== '' && Collections.nameError('x'.repeat(40)) === '',
    'the name length is limited');
  assert(Collections.nameError('global') !== '' && Collections.nameError(' GLOBAL ') !== '',
    'the name of Global is reserved, without regard to case');

  // Create
  const made = Collections.create('  Keigo  ');
  assert(made.ok && made.listId === 'l1' && Collections.lists.l1.name === 'Keigo'
    && Collections.lists.l1.entries.length === 0 && Collections.lists.l1.nextId === 0,
  'a list is created empty, with a stable id and a trimmed name');
  assert(!Collections.create('keigo').ok && Collections.create('keigo').error === 'This name is taken.',
    'a name is unique without regard to case');
  assert(Collections.create('Two').listId === 'l2', 'ids are handed out in order');
  assert(Collections.menuItems().length === 0, 'an empty list is not in the menu');
  assert(Collections.menuItems('L:l1').length === 1 && Collections.menuItems('L:l1')[0].label === 'L: Keigo',
    'the current list is in the menu even when empty');
  assert(Collections.overview().map(item => item.name).join() === 'Global,Keigo,Two'
    && Collections.overview()[0].exists === false && Collections.overview()[1].count === 0,
  'the catalog shows every list: Global first, empty ones included');
  assert(JSON.stringify(Storage.load(Storage.KEY.collections, null)) === JSON.stringify(Collections.lists),
    'a created list is saved at once');

  // Rename
  assert(Collections.rename('l1', 'Honorifics').ok && Collections.nameOf('l1') === 'Honorifics'
    && Collections.lists.l1.nextId === 0, 'rename changes the name only');
  assert(Collections.rename('l1', 'honorifics').ok, 'a list may keep its own name (in another case)');
  assert(!Collections.rename('l1', 'Two').ok, 'rename refuses a taken name');
  assert(!Collections.rename('global', 'Other').ok, 'Global cannot be renamed');
  assert(!Collections.rename('nope', 'Other').ok, 'a list that does not exist cannot be renamed');


  // Entries and their progress
  assert(Collections.add('l1', entries[0]) === 'added' && Collections.add('l1', entries[1]) === 'added'
    && Collections.add('l1', entries[2]) === 'added', 'entries are added');
  const l1 = 'L:l1';
  SliderState.toggleSideMark(l1, 1, 'hits', 0);
  SliderState.toggleSideMark(l1, 2, 'hits', 0);
  BoardState.move(l1, 1, 'good');
  BoardState.move(l1, 2, 'learn');
  ViewState.setUi(l1, 'slider', { random: true, order: [2, 1, 0], currentEntryId: 1, sideIndexes: { 1: 2, 2: 1 } });
  ViewState.setUi(l1, 'board', { sourceOrder: [0, 1, 2], sideIndexes: { 1: 3 } });
  events.length = 0;
  assert(Collections.removeEntry('l1', 1) === true, 'an entry is removed');
  assert(Collections.lists.l1.entries.map(entry => entry.id).join() === '0,2'
    && Collections.lists.l1.nextId === 3, 'the other ids stay, nextId does not go back');
  assert(!App.views[l1].slider.progress[1] && !App.views[l1].board.progress[1]
    && !!App.views[l1].slider.progress[2] && !!App.views[l1].board.progress[2],
  'the progress of the removed entry is dropped in every view, the others stay');
  const sliderUi = App.views[l1].slider.ui;
  const boardUi = App.views[l1].board.ui;
  assert(sliderUi.order.join() === '2,0' && sliderUi.currentEntryId === null
    && sliderUi.sideIndexes[1] === undefined && sliderUi.sideIndexes[2] === 1,
  'no ui reference to the removed id stays in the Slider');
  assert(boardUi.sourceOrder.join() === '0,2' && boardUi.sideIndexes[1] === undefined,
    'no ui reference to the removed id stays in the Board');
  assert(JSON.stringify(Storage.load(Storage.KEY.views, null)[l1]) === JSON.stringify(App.views[l1]),
    'the cleaned progress is saved');
  assert(Collections.removeEntry('l1', 99) === true && Collections.lists.l1.entries.length === 2,
    'an entry that is not there is a no-op');
  assert(Collections.add('l1', entries[3]) === 'added' && Collections.lists.l1.entries[2].id === 3,
    'a new entry does not take the id of a removed one');
  assert(Collections.isContentChange({ sourceId: l1, kind: 'removed' }, l1)
    && Collections.isContentChange({ sourceId: l1, kind: 'added' }, l1)
    && !Collections.isContentChange({ sourceId: l1, kind: 'renamed' }, l1)
    && !Collections.isContentChange({ sourceId: l1, kind: 'removed' }, 'goshogun2')
    && !Collections.isContentChange(undefined, l1),
  'only added and removed entries of the current list change what a View shows');

  // The last entry: the list stays, empty
  Collections.removeEntry('l1', 0);
  Collections.removeEntry('l1', 2);
  Collections.removeEntry('l1', 3);
  assert(Collections.lists.l1 && Collections.lists.l1.entries.length === 0, 'an empty list stays');
  assert(Library.hasSource(l1) && App.selectedEntries(l1).length === 0, 'an empty list is still a source');


  // Delete: the list, its progress and selection, and the current source
  Collections.add('l1', entries[0]);
  SliderState.toggleSideMark(l1, 4, 'hits', 0);
  App.selectSource(l1);
  events.length = 0;
  assert(Collections.deleteList('l1') === true && !Collections.lists.l1, 'a list is deleted');
  assert(!App.views[l1] && App.currentSource === null,
    'its progress goes with it, and nothing is current any more');
  assert(!Storage.load(Storage.KEY.views, {})[l1], 'the deleted progress is saved');
  assert(Collections.create('Again').listId === 'l1' && Collections.lists.l1.nextId === 0
    && !App.views[l1], 'a new list may reuse the id, and no old progress sticks to it');
  Collections.deleteList('l1');
  assert(Collections.deleteList('l1') === true, 'deleting a list that is not there is a no-op');

  // Global: cleared, and created again by the next add
  Collections.add('global', entries[0]);
  Collections.deleteList('global');
  assert(!Collections.lists.global && Collections.choices()[0].value === 'global',
    'Global is emptied and is still offered');
  assert(Collections.add('global', entries[0]) === 'added' && Collections.lists.global.nextId === 1,
    'Global is created again by the next add');
  Collections.deleteList('global');
  Collections.deleteList('l2');

  // Events
  setTimeout(() => {
    assert(events.includes('deleted:L:l1') && events.includes('deleted:L:global'),
      'a deletion is announced');
    Bus.off(Bus.events.collectionsChanged, onChange);
  }, 20);

  // A failed write takes the change back and tells the caller
  Collections.lists = {};
  Storage.remove(Storage.KEY.collections);
  Collections.create('Keep');
  const keep = JSON.stringify(Collections.lists);
  Storage.failSaves = true;
  assert(Collections.add('l1', entries[0]) === 'storage' && JSON.stringify(Collections.lists) === keep,
    'add: a failed write changes nothing');
  assert(!Collections.create('Lost').ok && JSON.stringify(Collections.lists) === keep,
    'create: a failed write changes nothing');
  assert(!Collections.rename('l1', 'Lost').ok && JSON.stringify(Collections.lists) === keep,
    'rename: a failed write changes nothing');
  Storage.failSaves = false;
  Collections.add('l1', entries[0]);
  Storage.failSaves = true;
  const withEntry = JSON.stringify(Collections.lists);
  App.views[l1] = { slider: { progress: { 0: { hits: [0] } }, ui: {} } };
  assert(Collections.removeEntry('l1', 0) === false && JSON.stringify(Collections.lists) === withEntry
    && !!App.views[l1].slider.progress[0], 'removeEntry: a failed write changes nothing, progress included');
  assert(Collections.deleteList('l1') === false && !!Collections.lists.l1 && !!App.views[l1],
    'deleteList: a failed write changes nothing, progress included');
  Storage.failSaves = false;
  Collections.deleteList('l1');


  // A list that could not be recognized survives the changes of the others
  Storage.save(Storage.KEY.collections, { bad: { name: 1 }, l1: { name: 'Ok', nextId: 0, entries: [] } });
  Collections.load();
  assert(Collections.unrecognized.bad && Collections.lists.l1, 'an unrecognized record is kept apart');
  Collections.create('Another');
  const stored = Storage.load(Storage.KEY.collections, {});
  assert(stored.bad && stored.bad.name === 1 && stored.l1 && stored.l2,
    'an unrecognized record is written back with the others');
  assert(Collections.newListId() === 'l3' && Collections.sourceIds().join() === 'L:l1,L:l2'
    && Collections.unrecognizedSourceIds().join() === 'L:bad', 'its id is never handed out');

  // ListPrompts: the flows, over the real Prompt
  const saw = [];
  Collections.lists = {};
  Collections.unrecognized = {};
  Storage.remove(Storage.KEY.collections);
  ListPrompts.createList(listId => saw.push(`created:${listId}`));
  assert(Prompt.isOpen && Prompt.state.input.value === '' && Prompt.state.canConfirm === false,
    'an empty name is not confirmable');
  assert(Prompt.state.input.error === '', 'no error is shown before the user types');
  Prompt.confirm();
  assert(Prompt.isOpen, 'a prompt with an error stays open on confirm');
  Prompt.type('Global');
  assert(Prompt.state.input.error === 'This name is taken.' && !Prompt.state.canConfirm, 'a taken name is refused');
  Prompt.type(' Verbs ');
  assert(Prompt.state.canConfirm && Prompt.state.input.error === '', 'a good name is confirmable');
  Prompt.confirm();
  assert(!Prompt.isOpen && saw.join() === 'created:l1' && Collections.nameOf('l1') === 'Verbs',
    'the list is created from the typed name');

  ListPrompts.renameList('l1');
  assert(Prompt.state.input.value === 'Verbs' && Prompt.state.canConfirm, 'rename starts from the current name');
  Prompt.type('Nouns');
  Prompt.confirm();
  assert(Collections.nameOf('l1') === 'Nouns', 'rename applies');

  // Add to a new list: the choice, then the name, then the copy
  App.setAddTarget(null);
  assert(Collections.defaultTarget() === 'global', 'Global is the target until another is chosen');
  ListPrompts.addEntry(entries[5]);
  assert(Prompt.state.choice.value === 'global'
    && Prompt.state.choice.items[Prompt.state.choice.items.length - 1].value === Collections.NEW_LIST,
  'the choice ends with "new list"');
  Prompt.choose(Collections.NEW_LIST);
  assert(Prompt.isOpen && Prompt.state.input, 'choosing "new list" opens the name prompt at once');
  Prompt.type('Fresh');
  Prompt.confirm();
  assert(!Prompt.isOpen && Collections.lists.l2.name === 'Fresh' && Collections.lists.l2.entries.length === 1,
    'the new list gets the card');
  assert(App.addTarget === 'l2' && Storage.load(Storage.KEY.settings, {}).addTarget === 'l2',
    'the new list becomes the target, and it is saved');
  ListPrompts.addEntry(entries[5]);
  assert(Prompt.state.choice.value === 'l2', 'the prompt starts with the list chosen last');
  Prompt.choose('l2');
  Prompt.confirm();
  assert(Prompt.isOpen && Prompt.state.notify && Prompt.state.text.includes('Already'), 'a duplicate is reported');
  Prompt.cancel();
  ListPrompts.addEntry(entries[6]);
  Prompt.choose('global');
  Prompt.confirm();
  assert(!Prompt.isOpen && Collections.lists.global.entries.length === 1, 'Global can still be chosen');
  assert(App.addTarget === 'global', 'and becomes the target');
  ListPrompts.addEntry(entries[9]);
  Prompt.choose('l1');
  Prompt.cancel();
  assert(App.addTarget === 'global', 'a cancelled prompt keeps the target');
  ListPrompts.addEntry(entries[7]);
  Prompt.choose(Collections.NEW_LIST);
  Prompt.cancel();
  assert(Prompt.isOpen && Prompt.state.choice && Prompt.state.choice.value === 'global'
    && Collections.lists.global.entries.length === 1 && !Collections.lists.l3,
  'cancelling the name prompt returns to the choice and creates nothing');
  Prompt.cancel();
  assert(!Prompt.isOpen && Collections.lists.global.entries.length === 1 && !Collections.lists.l3,
    'cancelling the choice adds nothing');
  ListPrompts.createList();
  Prompt.cancel();
  assert(!Prompt.isOpen, 'creating a list from the Lists dialog has no step back');

  Storage.failSaves = true;
  ListPrompts.addEntry(entries[8]);
  Prompt.confirm();
  assert(Prompt.state.notify && Prompt.state.text === Collections.SAVE_FAILED_TEXT, 'a failed write is reported');
  Prompt.cancel();
  Storage.failSaves = false;
  App.setAddTarget('l1');
  ListPrompts.addEntry(entries[8]);
  Storage.failSaves = true;
  Prompt.choose('l2');
  Prompt.confirm();
  Prompt.cancel();
  Storage.failSaves = false;
  assert(App.addTarget === 'l1', 'a failed write does not change the target');
  App.setAddTarget('global');

  ListPrompts.removeEntry('global', 0);
  assert(Prompt.state.text.includes('Global') && Prompt.state.text.includes('progress'), 'removal is confirmed');
  Prompt.cancel();
  assert(Collections.lists.global.entries.length === 1, 'cancel keeps the entry');
  ListPrompts.removeEntry('global', 0);
  Prompt.confirm();
  assert(Collections.lists.global.entries.length === 0, 'confirm removes the entry');
  App.setAddTarget('l2');
  assert(Collections.defaultTarget() === 'l2', 'an existing list is the default target');
  ListPrompts.deleteList('l2');
  assert(Prompt.state.text.startsWith('Delete the list "Fresh" (1 card)'), 'deleting a list is confirmed with its size');
  Prompt.confirm();
  assert(!Collections.lists.l2, 'confirm deletes the list');
  assert(App.addTarget === null && Collections.defaultTarget() === 'global',
    'deleting the target list resets it to Global');
  App.setAddTarget('l9');
  assert(Collections.defaultTarget() === 'global', 'a target that does not exist falls back to Global');
  App.setAddTarget(null);
  Collections.add('global', entries[9]);
  ListPrompts.deleteList('global');
  assert(Prompt.state.text.startsWith('Clear the list "Global"'), 'Global is cleared, not deleted');
  Prompt.cancel();

  Collections.lists = {};
  Collections.unrecognized = {};
  Storage.remove(Storage.KEY.collections);
  ['L:l1', 'L:l2', 'L:global'].forEach(id => App.clearViewsFor(id));
  App.settings.currentSource = savedCurrent;
}


// ---- Parser marks: tags, comments, service marks ---------------------------
{
  const parse = text => Parser.parse(`T\n====\n${text}`).allEntries;
  const first = text => parse(text)[0];
  assert(first('ぶらぶら\nболтать\n::onomat').tag === 'onomatopoeia', '::onomat is the onomatopoeia tag');
  assert(first('ぶらぶら\nболтать\n::onomatopoeia').tag === 'onomatopoeia', '::onomatopoeia is the same tag');
  const withComment = first('ぶらぶら\nболтать\n::onomat::комментарий');
  assert(withComment.tag === 'onomatopoeia' && withComment.info === 'комментарий',
    'the comment of a mark goes to info and the tag is the same');
  const geoComment = first('東京\nТокио\n::geo::столица');
  assert(geoComment.tag === 'geo' && geoComment.info === 'столица', 'any mark takes a comment');
  const infoMark = first('縁がなかった\nえん\nне судьба\n::info::縁 - связь');
  assert(!infoMark.tag && infoMark.info === '縁 - связь', '::info is a comment, not a tag');
  const diffMark = first('計る\nизмерять\n::diff 測る 量る');
  assert(!diffMark.tag && diffMark.info === '測る 量る', '::diff text is a comment, not a tag');
  const diffBare = first('計る\nизмерять\n::diff');
  assert(!diffBare.tag && !diffBare.info, 'a bare ::diff marks nothing');
  assert(first('さくさく\nхрустящий\n::onomat \n').tag === 'onomatopoeia', 'trailing spaces do not matter');
}

// ---- EntrySearch: criteria, kinds, counts -----------------------------------
{
  const entries = Library.getSource('osarai-house').parsed.allEntries;
  const sources = [{ sourceId: 'a', entries }, { sourceId: 'b', entries: entries.slice(0, 5) }];
  const none = EntrySearch.analyze(sources, {});
  assert(!EntrySearch.isActive({}) && !EntrySearch.isActive({ query: '', tag: '', kind: '' })
    && EntrySearch.isActive({ kind: 'reading' }), 'no criterion is not a search');
  assert(none.items.length === entries.length + 5 && none.kindCounts[''] === none.items.length,
    'without criteria everything is found');

  const word = entries[0].lines[0].text;
  const byText = EntrySearch.analyze(sources, { query: word.toUpperCase() });
  assert(byText.items.length > 0 && byText.items.every(item =>
    item.entry.lines.some(line => line.text.toLowerCase().includes(word.toLowerCase()))
    || (item.entry.info || '').toLowerCase().includes(word.toLowerCase())), 'text matches the lines and the info');
  const infoEntry = { id: 0, lines: [{ text: 'x', role: 'expression' }], info: 'ВОДА в комментарии' };
  assert(EntrySearch.analyze([{ sourceId: 's', entries: [infoEntry] }], { query: 'вода' }).items.length === 1,
    'a Russian comment is found without regard to case');

  const role = Parser.LINE_ROLE;
  const line = (text, r) => ({ text, role: r });
  const flags = lines => EntrySearch.kindFlags({ lines });
  assert(flags([line('長年', role.expression), line('ながねん', role.reading)]).reading, 'an expression with kanji and its reading is a reading card');
  assert(!flags([line('よっぽど', role.expression), line('= よほど', role.meaning), line('(余程)', role.alt_reading)]).reading,
    'a kana expression with an "=" synonym is not a reading card');
  assert(!flags([line('長年', role.expression), line('ながねん', role.reading), line('долгие годы', role.meaning)]).reading,
    'with a meaning it is not a reading card');
  assert(!flags([line('これ', role.expression), line('これ', role.reading)]).reading, 'no kanji, no reading card');
  assert(flags([line('長年', role.expression)]).reminder && !flags([line('長年', role.expression)]).regular, 'one line is a reminder');
  const reversedFlags = EntrySearch.kindFlags({ reversed: true,
    lines: [line('вода', role.meaning), line('水', role.expression), line('水を飲む', role.example)] });
  assert(reversedFlags.reversed && reversedFlags.examples && !reversedFlags.regular,
    'examples are a criterion of their own: reversed is not "without examples"');
  const regularFlags = flags([line('水', role.expression), line('вода', role.meaning), line('水を飲む', role.example)]);
  assert(regularFlags.regular && regularFlags.examples, 'a regular card may have examples');

  // Counts of a facet ignore its own criterion; a source that is not chosen is only counted
  const geo = { id: 1, tag: 'geo', lines: [line('東京', role.expression), line('Токио', role.meaning)] };
  const plain = { id: 2, lines: [line('水', role.expression), line('вода', role.meaning)] };
  const pair = [{ sourceId: 'x', entries: [geo, plain] }, { sourceId: 'y', entries: [Object.assign({}, geo, { id: 3 })] }];
  const tagged = EntrySearch.analyze(pair, { tag: 'geo' }, id => id === 'x');
  assert(tagged.items.length === 1 && tagged.sourceCounts.x === 1 && tagged.sourceCounts.y === 1,
    'a source that is off is not searched but is counted');
  assert(tagged.tagCounts.geo === 1, 'the counts of tags are for the sources that are on');
  assert(EntrySearch.analyze(pair, { tag: 'geo', kind: 'regular' }).kindCounts.regular === 2,
    'the counts of kinds ignore the kind itself');
}

// ---- Collections.addMany: one write for a batch -----------------------------
{
  const savedCurrent = App.settings.currentSource;
  const entries = Library.getSource('goshogun2').parsed.allEntries;
  Collections.lists = {};
  Collections.unrecognized = {};
  Storage.remove(Storage.KEY.collections);
  let writes = 0;
  const saveBefore = Storage.save;
  Storage.save = function(k, v) { if(k === Storage.KEY.collections) writes += 1; return saveBefore.call(this, k, v); };
  // Bus delivers later: count what is emitted.
  const announced = [];
  const emitBefore = Bus.emit;
  Bus.emit = function(event, payload) {
    if(event === Bus.events.collectionsChanged) announced.push(payload.kind);
    return emitBefore.call(this, event, payload);
  };

  const batch = [entries[0], entries[1], entries[2], entries[1]];
  const result = Collections.addMany('global', batch);
  assert(result.added === 3 && result.skipped === 1 && !result.storage, 'a copy inside the batch is skipped');
  assert(writes === 1, 'one write for the whole batch');
  assert(Collections.lists.global.entries.map(entry => entry.id).join() === '0,1,2'
    && Collections.lists.global.nextId === 3, 'ids go on counting');
  const again = Collections.addMany('global', [entries[0], entries[3]]);
  assert(again.added === 1 && again.skipped === 1 && Collections.lists.global.entries.length === 4,
    'only what the list does not have yet is added');
  const nothing = Collections.addMany('global', [entries[0]]);
  assert(nothing.added === 0 && nothing.skipped === 1 && writes === 2, 'nothing new: no write');
  assert(Collections.addMany('l9', []).added === 0 && !Collections.lists.l9, 'an empty batch creates no list');

  const sameWord = Object.assign({}, entries[0], { lines: entries[0].lines.map((l, i) => i === 1
    ? Object.assign({}, l, { text: l.text + ' (another translation)' }) : l) });
  assert(Collections.addMany('global', [sameWord]).added === 1,
    'the same word with another translation is another card');

  Storage.failSaves = true;
  const failed = Collections.addMany('global', [entries[5], entries[6]]);
  Storage.failSaves = false;
  assert(failed.storage && Collections.lists.global.entries.length === 5
    && Collections.lists.global.nextId === 5, 'a failed write takes the whole batch back');
  assert(announced.filter(kind => kind === 'added').length === 3, 'one announcement per batch that changed something');

  // ListPrompts.addEntries: the flow over the real Prompt
  App.setAddTarget(null);
  ListPrompts.addEntries([entries[7], entries[8], entries[7]]);
  assert(Prompt.isOpen && Prompt.state.text.startsWith('Add 3 cards to a list.')
    && !Prompt.state.text.includes('hardly'), 'the prompt says how many cards go');
  let done = 0;
  Prompt.cancel();
  ListPrompts.addEntries([entries[7], entries[8], entries[7]], () => { done += 1; });
  Prompt.confirm();
  assert(done === 1 && Collections.lists.global.entries.length === 7 && App.addTarget === 'global',
    'confirm adds, remembers the list and calls onDone');
  assert(Prompt.state.notify && Prompt.state.text === 'Added 2 to the list "Global", skipped 1 identical.',
    'the report says how many were added and skipped');
  Prompt.cancel();
  ListPrompts.addEntries([entries[9]], () => { done += 1; });
  Prompt.cancel();
  assert(done === 1 && Collections.lists.global.entries.length === 7, 'a cancelled prompt adds nothing and keeps the ticks');
  Storage.failSaves = true;
  ListPrompts.addEntries([entries[9]], () => { done += 1; });
  Prompt.confirm();
  Storage.failSaves = false;
  assert(done === 1 && Prompt.state.text === Collections.SAVE_FAILED_TEXT, 'a failed write is reported and keeps the ticks');
  Prompt.cancel();
  ListPrompts.addEntries(Array.from({ length: ListPrompts.BIG_BATCH + 1 }, () => entries[0]));
  assert(Prompt.state.text.includes('hardly usable'), 'a big batch is announced, not refused');
  Prompt.cancel();
  ListPrompts.addEntries([]);
  assert(!Prompt.isOpen, 'nothing ticked, nothing asked');

  Bus.emit = emitBefore;
  Storage.save = saveBefore;
  Collections.lists = {};
  Storage.remove(Storage.KEY.collections);
  App.clearViewsFor('L:global');
  App.setAddTarget(null);
  App.settings.currentSource = savedCurrent;
}



// ---- SliderState: ui defaults and visible entries --------------------------
{
  const source = 'osarai-house';
  const allIds = Library.getSource(source).parsed.allEntries.map(e => e.id);
  ViewState.resetEntries(source, 'slider', allIds, {});
  App.setSelection(source, ['0.0']);

  const before = JSON.stringify(App.views[source].slider);
  const ui = SliderState.uiOf(source);
  assert(ui.mode === 'original' && ui.onlyMatching === false && ui.random === false
    && ui.currentEntryId === null && Array.isArray(ui.order), 'uiOf applies defaults');
  assert(JSON.stringify(App.views[source].slider) === before, 'uiOf does not write to the state');

  const selected = App.selectedEntries(source);
  assert(SliderState.visibleEntries(source).length === selected.length,
    'all selected entries are visible by default');
  assert(JSON.stringify(App.views[source].slider) === before, 'visibleEntries without random does not write');

  SliderState.removeEntry(source, selected[0].id);
  assert(SliderState.visibleEntries(source).length === selected.length - 1, 'removed entries are hidden');

  ViewState.setUi(source, 'slider', { mode: 'meaning', onlyMatching: true });
  assert(SliderState.visibleEntries(source).every(e => e.lines.some(l => l.role === 'meaning')),
    'only matching keeps entries with a line of the mode role');
  ViewState.setUi(source, 'slider', { mode: 'original' });
  assert(SliderState.visibleEntries(source).length === selected.length - 1,
    'only matching is ignored for incompatible modes');

  ViewState.setUi(source, 'slider', { onlyMatching: false, random: true, order: [] });
  const first = SliderState.visibleEntries(source).map(e => e.id);
  const second = SliderState.visibleEntries(source).map(e => e.id);
  assert(first.length === selected.length - 1 && first.join() === second.join(),
    'random order is stored and stable between calls');
  assert(App.views[source].slider.ui.order.join() === first.join(), 'random order is persisted in ui.order');
  assert(new Set(first).size === first.length, 'random order has no duplicates');

  ViewState.setUi(source, 'slider', { sideIndexes: { 5: 2 } });
  SliderState.setMode(source, 'example');
  const afterMode = SliderState.uiOf(source);
  assert(afterMode.mode === 'example' && Object.keys(afterMode.sideIndexes).length === 0,
    'setMode stores the mode and forgets side positions');

  ViewState.resetEntries(source, 'slider', allIds, {});
}

// ---- BoardState: columns, order, defaults --------------------------------
{
  const source = 'osarai-house';
  App.setSelection(source, []);
  const all = App.selectedEntries(source).map(e => e.id);
  const layoutOf = () => BoardState.layout(source);
  const idsOf = list => list.map(e => e.id).join();

  assert(BoardState.uiOf(source).markReversed === true, 'R is on by default');
  assert(BoardState.defaultUi().markReversed === true, 'R is on after a reset');
  ViewState.setUi(source, 'board', { markReversed: false });
  assert(BoardState.uiOf(source).markReversed === false, 'R switched off is kept');

  assert(idsOf(layoutOf().source) === all.join(), 'source area holds all entries in file order');
  assert(Progress.activeSessions().every(s => !s.views.some(v => v.name === 'board')),
    'untouched board is not a session');

  BoardState.move(source, all[0], 'good');
  BoardState.move(source, all[1], 'good');
  BoardState.move(source, all[2], 'good', all[0]);
  assert(idsOf(layoutOf().zones.good) === [all[2], all[0], all[1]].join(),
    'move inserts before the given card');
  assert(layoutOf().source.length === all.length - 3, 'moved cards leave the source area');
  assert(App.views[source].board.progress[all[2]].order === 1, 'order is renumbered from 1');

  BoardState.move(source, all[0], 'good', null);
  assert(idsOf(layoutOf().zones.good) === [all[2], all[1], all[0]].join(), 'no beforeId moves to the end');
  BoardState.move(source, all[1], 'good', all[1]);
  assert(idsOf(layoutOf().zones.good).split(',').length === 3, 'dropping a card before itself keeps it once');

  BoardState.move(source, all[1], 'failed');
  assert(idsOf(layoutOf().zones.failed) === String(all[1]) && layoutOf().zones.good.length === 2,
    'move between columns');
  assert(Progress.activeSessions().some(s => s.views.some(v => v.name === 'board' && v.label === 'B')),
    'a card in a column makes a board session');

  App.setSelection(source, ['0.0']);
  BoardState.move(source, all[2], 'good', null);
  App.setSelection(source, []);
  assert(layoutOf().zones.good.length === 2, 'cards of other selections keep their column');

  BoardState.move(source, all[1], null);
  assert(layoutOf().zones.failed.length === 0 && layoutOf().source.some(e => e.id === all[1]),
    'move to null returns the card to the source area');

  BoardState.removeEntry(source, all[0]);
  const afterRemove = layoutOf();
  assert(![afterRemove.source, ...Object.values(afterRemove.zones)].some(l => l.some(e => e.id === all[0])),
    'removed card is shown nowhere');

  BoardState.setSideIndex(source, all[3], 2);
  assert(BoardState.uiOf(source).sideIndexes[all[3]] === 2, 'side index is stored');
  BoardState.setMode(source, 'meaning');
  assert(BoardState.uiOf(source).mode === 'meaning' && !Object.keys(BoardState.uiOf(source).sideIndexes).length,
    'setMode forgets side positions');

  ViewState.resetEntries(source, 'board', all, BoardState.defaultUi());
  assert(layoutOf().source.length === all.length && BoardState.uiOf(source).markReversed === true,
    'reset returns every card and restores R');
  assert(Progress.activeSessions().every(s => !s.views.some(v => v.name === 'board')),
    'no board session after reset');

  // Order of the source area: kept in ui, not progress.
  assert(BoardState.defaultUi().sourceOrder.length === 0 && BoardState.uiOf(source).sourceOrder.length === 0,
    'source order is empty by default');
  BoardState.move(source, all[3], null, all[0]);
  assert(layoutOf().source[0].id === all[3] && layoutOf().source.length === all.length,
    'a card dropped in the source area goes before the given card');
  BoardState.move(source, all[3], null, null);
  assert(layoutOf().source[layoutOf().source.length - 1].id === all[3], 'no beforeId moves it to the end');
  BoardState.move(source, all[1], null, all[2]);
  const arranged = idsOf(layoutOf().source);
  assert(arranged.startsWith([all[0], all[1], all[2]].join()), 'source order is rewritten from what is shown');
  assert(Progress.activeSessions().every(s => !s.views.some(v => v.name === 'board')),
    'arranging the source area is not a session');
  assert(Object.keys(App.views[source].board.progress).length === 0, 'arranging the source area stores no progress');

  BoardState.uiOf(source).sourceOrder.push(-1);
  assert(!BoardState.uiOf(source).sourceOrder.includes(-1), 'uiOf returns a copy of the source order');

  BoardState.move(source, all[0], 'good');
  assert(!layoutOf().source.some(e => e.id === all[0]) && layoutOf().zones.good.length === 1,
    'a card taken to a column leaves the arranged source area');
  BoardState.move(source, all[0], null, all[1]);
  assert(layoutOf().source.findIndex(e => e.id === all[0]) < layoutOf().source.findIndex(e => e.id === all[1]),
    'a card returned from a column lands before the given card');

  BoardState.removeEntry(source, all[2]);
  assert(!layoutOf().source.some(e => e.id === all[2]), 'a removed card stays hidden although the order lists it');
  assert(layoutOf().source.length === all.length - 1, 'stale ids in the source order do not add cards');

  BoardState.resetSourceOrder(source);
  assert(BoardState.uiOf(source).sourceOrder.length === 0, 'resetSourceOrder forgets the arrangement');
  assert(idsOf(layoutOf().source) === all.filter(id => id !== all[2]).join(),
    'file order again after resetSourceOrder');

  BoardState.move(source, all[3], null, all[0]);
  ViewState.resetEntries(source, 'board', all, BoardState.defaultUi());
  assert(idsOf(layoutOf().source) === all.join(), 'reset forgets the arrangement of the source area');
}

// ---- PanelState: free areas, removal, defaults ----------------------------
{
  const source = 'osarai-house';
  App.setSelection(source, []);
  const all = App.selectedEntries(source).map(e => e.id);
  const layoutOf = () => PanelState.layout(source);
  const idsOf = list => list.map(e => e.id).join();
  const panelSession = () => Progress.activeSessions()
    .some(s => s.views.some(v => v.name === 'panel' && v.label === 'P'));

  assert(idsOf(layoutOf().source) === all.join() && !panelSession(), 'untouched panel is not a session');
  assert(PanelState.uiOf(source).mode === 'original' && !('sideIndexes' in PanelState.uiOf(source)),
    'the panel keeps no sides');

  PanelState.move(source, all[2], '3');
  PanelState.move(source, all[0], '3');
  PanelState.move(source, all[1], '1');
  assert(idsOf(layoutOf().zones['3']) === [all[0], all[2]].join(), 'areas list their cards in file order');
  assert(idsOf(layoutOf().zones['1']) === String(all[1]), 'a card is in the area it was taken to');
  assert(!layoutOf().source.some(e => [all[0], all[1], all[2]].includes(e.id)), 'moved cards leave the start area');
  assert(panelSession(), 'a card in an area makes a panel session');
  assert(App.views[source].panel.progress[all[0]].zone === '3'
    && !('order' in App.views[source].panel.progress[all[0]]), 'progress is only the area');

  PanelState.move(source, all[0], '9');
  assert(layoutOf().source.some(e => e.id === all[0]), 'an unknown area means the start area');
  PanelState.move(source, all[0], null);
  assert(!(String(all[0]) in App.views[source].panel.progress), 'a card back in the start area has no progress');

  PanelState.removeEntry(source, all[1]);
  assert(!layoutOf().zones['1'].length && !layoutOf().source.some(e => e.id === all[1]), 'a removed card is hidden');

  // Clearing an area removes its cards: they do not return to the start area.
  PanelState.move(source, all[0], '4');
  PanelState.move(source, all[3], '4');
  const before = layoutOf().source.length;
  PanelState.removeEntries(source, layoutOf().zones['4'].map(e => e.id));
  assert(!layoutOf().zones['4'].length && layoutOf().source.length === before, 'a cleared area does not refill the start area');
  assert(App.views[source].panel.progress[all[0]].removed && App.views[source].panel.progress[all[3]].removed,
    'cleared cards are removed');
  PanelState.move(source, all[0], '2');
  assert(layoutOf().zones['2'].length === 1 && !App.views[source].panel.progress[all[0]].removed,
    'a card moved again is not removed any more');

  PanelState.setMode(source, 'meaning');
  assert(PanelState.uiOf(source).mode === 'meaning', 'mode is stored');

  ViewState.resetEntries(source, 'panel', all, PanelState.defaultUi());
  assert(idsOf(layoutOf().source) === all.join() && !panelSession(), 'reset returns every card to the start area');
  assert(PanelState.uiOf(source).mode === 'original', 'reset restores the mode');
}

// ---- TableState: columns, cells, rows, what is progress --------------------
{
  const source = 'osarai-house';
  App.setSelection(source, []);
  const all = App.selectedEntries(source).map(e => e.id);
  const layoutOf = () => TableState.layout(source);
  const idsOf = list => list.map(e => e.id).join();
  const tableSession = () => Progress.activeSessions()
    .some(s => s.views.some(v => v.name === 'table' && v.label === 'T'));
  const progressOf = id => App.views[source].table?.progress[id];

  const columns = layoutOf().columns;
  assert(columns[0] === 'expression' && columns.includes('meaning'), 'columns follow the default order of roles');
  assert(columns.every(role => TableState.roles.includes(role)), 'columns are known roles only');
  assert(idsOf(layoutOf().entries) === all.join() && !tableSession(), 'untouched table is not a session');

  // Hiding is a setting, not progress.
  TableState.toggleColumn(source, 'expression', true);
  assert(Object.keys(TableState.uiOf(source).hidden).length > 0 && !tableSession(),
    'hiding the other columns is not a session');
  assert(TableState.isHidden(TableState.uiOf(source), all[0], 'meaning')
    && !TableState.isHidden(TableState.uiOf(source), all[0], 'expression'),
  'hide others hides the cells of the other columns only');
  assert(JSON.parse(JSON.stringify(App.views))[source].table.ui.hidden[all[0]].includes('meaning'),
    'hidden cells are persisted in ui');

  // Showing a column is a setting too: nothing is opened.
  TableState.toggleColumn(source, 'expression', true);
  assert(!Object.keys(TableState.uiOf(source).hidden).length, 'showing the columns lifts hidden');
  assert(!tableSession() && !progressOf(all[0]), 'showing a column does not open cells nor start a session');

  // Hide one column, open one cell: a guess checked is progress.
  TableState.toggleColumn(source, 'meaning', false);
  TableState.toggleCell(source, all[0], 'meaning');
  assert(!TableState.isHidden(TableState.uiOf(source), all[0], 'meaning')
    && progressOf(all[0]).revealed.join() === 'meaning' && tableSession(),
  'a tap on a hidden cell opens it and starts a session');

  // Hiding the column closes what was opened, and the session ends.
  TableState.toggleColumn(source, 'meaning', false);
  assert(TableState.isHidden(TableState.uiOf(source), all[0], 'meaning') && !progressOf(all[0])
    && !tableSession(), 'hiding a column takes the opened marks away');

  // A tap on an opened cell hides it again, and the mark goes away.
  TableState.toggleCell(source, all[1], 'meaning');
  assert(!!progressOf(all[1])?.revealed, 'a tap on a hidden cell opens it');
  TableState.toggleCell(source, all[1], 'meaning');
  assert(TableState.isHidden(TableState.uiOf(source), all[1], 'meaning') && !progressOf(all[1])
    && !tableSession(), 'a tap on an opened cell hides it and the mark goes away');
  ViewState.resetEntries(source, 'table', all, TableState.defaultUi());

  // Rows: the order is progress and is numbered over all shown rows.
  TableState.moveRow(source, all[2], all[0]);
  assert(idsOf(layoutOf().entries.slice(0, 3)) === [all[2], all[0], all[1]].join(), 'a row goes before another row');
  assert(tableSession() && progressOf(all[3]).order === 4, 'a move numbers every shown row and makes a session');
  TableState.moveRow(source, all[2], null);
  assert(layoutOf().entries[all.length - 1].id === all[2], 'a row goes to the end');
  TableState.moveRowToEdge(source, all[2], true);
  assert(layoutOf().entries[0].id === all[2], 'a row goes to the top');
  const stored = JSON.stringify(App.views[source].table.progress);
  TableState.moveRow(source, all[2], layoutOf().entries[1].id);
  assert(JSON.stringify(App.views[source].table.progress) === stored, 'a move that changes nothing writes nothing');

  // Columns: the order is a setting.
  ViewState.resetEntries(source, 'table', all, TableState.uiAfterReset(source));
  assert(!tableSession(), 'reset ends the session');
  const before = layoutOf().columns;
  TableState.moveColumn(source, before[1], before[0]);
  assert(layoutOf().columns[0] === before[1] && layoutOf().columns[1] === before[0], 'a column goes before another one');
  assert(!tableSession(), 'the order of columns is not progress');
  TableState.moveColumn(source, before[0], null);
  assert(layoutOf().columns[layoutOf().columns.length - 1] === before[0], 'a column goes to the end');
  assert(TableState.columnsOf(layoutOf().entries, ['nonsense', before[1], before[1]]).length === before.length,
    'unknown and repeated roles of a saved order are ignored');

  // Removal and reset.
  TableState.removeEntry(source, all[0]);
  assert(!layoutOf().entries.some(e => e.id === all[0]) && tableSession(), 'a removed row is hidden and is progress');
  TableState.zoomBy(source, 1);
  TableState.setHideOthers(source, false);
  assert(TableState.uiOf(source).zoom === 1.1 && TableState.uiOf(source).hideOthers === false,
    'toolbar settings are stored');
  ViewState.resetEntries(source, 'table', all, TableState.uiAfterReset(source));
  assert(layoutOf().entries.some(e => e.id === all[0]) && !tableSession(), 'reset restores removed rows');
  assert(TableState.uiOf(source).zoom === 1.1 && TableState.uiOf(source).hideOthers === false
    && !Object.keys(TableState.uiOf(source).hidden).length && !TableState.uiOf(source).colOrder.length,
  'reset keeps the settings of the toolbar only');

  // Zoom is limited and a step is rounded.
  for(let i = 0; i < 40; i++) TableState.zoomBy(source, -1);
  assert(TableState.uiOf(source).zoom === 0.3, 'zoom out stops at the minimum');
  for(let i = 0; i < 40; i++) TableState.zoomBy(source, 1);
  assert(TableState.uiOf(source).zoom === 2.5, 'zoom in stops at the maximum');

  // Forgetting an entry drops its hidden cells.
  TableState.toggleColumn(source, 'expression', true);
  const ui = App.views[source].table.ui;
  TableState.forgetEntryInUi(ui, all[0]);
  assert(!(all[0] in ui.hidden), 'a forgotten entry leaves no hidden cells');
  ViewState.resetEntries(source, 'table', all, TableState.defaultUi());
}


// ---- Reset of a selection keeps progress outside it ------------------------
{
  const source = 'SR_secret';
  App.selectSource(source);
  const sectionIds = [];
  (function walk(nodes) {
    nodes.forEach(n => { sectionIds.push(n.id); if(n.children) walk(n.children); });
  })(Library.getSource(source).parsed.structure);

  App.setSelection(source, [sectionIds[1]]);
  const first = App.selectedEntries(source).map(e => e.id);
  App.setSelection(source, [sectionIds[2]]);
  const second = App.selectedEntries(source).map(e => e.id);
  PanelState.move(source, first[0], '1');
  PanelState.move(source, second[0], '1');
  assert(ViewState.countInProgressOutside(source, 'panel', second) === 1,
    'progress outside the selection is counted');

  ViewState.resetEntries(source, 'panel', second, PanelState.defaultUi());
  assert(Progress.activeSessions().some(s => s.sourceId === source && s.views.some(v => v.name === 'panel')),
    'progress in another section keeps the session after a reset of the selection');
  assert(ViewState.countInProgressOutside(source, 'panel', second) === 1, 'the kept progress is still outside');
  ViewState.resetEntries(source, 'panel', first, PanelState.defaultUi());
  assert(!Progress.activeSessions().some(s => s.sourceId === source && s.views.some(v => v.name === 'panel')),
    'session ends once no section has progress');
}

// ---- Busy: reference-counted busy flag ------------------------------------
// Loaded last so it can be exercised independently of the parser fixtures.
// Bus.emit() delivers to handlers in a macrotask, so observed transitions are
// recorded and checked once all pending timers have drained (not on a fixed
// timeout, which would race Bus.emit's own 1ms timer).
loadRel('domain/Busy.js');

const busyEvents = [];
Bus.on(Bus.events.busyChanged, ({ busy }) => busyEvents.push(busy));

// Transitions observed synchronously (before any handler flush).
assert(!Busy.isBusy, 'not busy before any producer runs');
Busy.begin();
assert(Busy.isBusy, 'busy after first begin');
Busy.begin();
assert(Busy.count === 2, 'begin is reference-counted');
assert(busyEvents.length === 0,
  'emission is deferred, not delivered synchronously');
Busy.end();
assert(Busy.isBusy, 'inner end does not clear the flag while an outer operation runs');
Busy.end();
assert(!Busy.isBusy, 'not busy after the last end');
Busy.end();
assert(Busy.count === 0, 'end without a matching begin is a no-op');

// beginAndRun waits for rAF before running the callback, allowing the overlay
// to paint. Race: Bus.emit delivers events via setTimeout, so if callbacks modify
// state synchronously, rAF may fire before the flag is emitted and painted.
let ranAfterBegin = null;
let endAtRunTime = null;
Busy.beginAndRun(() => {
  ranAfterBegin = Busy.isBusy;
  endAtRunTime = Busy.count;
});
assert(ranAfterBegin === null, 'beginAndRun defers the callback past multiple timers');

// Wait for all macrotasks/timers started above to complete before asserting on
// the emitted transitions, so the check itself never races Bus.emit's timer.
(function drain(remaining) {
  if(remaining.busyEvents.length === 4 && !Busy.isBusy) {
    assert(busyEvents.join(',') === 'true,false,true,false',
      'two balanced begin/end pairs emit exactly true,false,true,false');
    assert(ranAfterBegin === true && endAtRunTime === 1,
      'beginAndRun runs the callback while the flag is held (paint first)');
    assert(!Busy.isBusy && Busy.count === 0,
      'beginAndRun releases the flag after the callback');
    console.log('\nDOMAIN SMOKE TEST DONE');
    return;
  }
  if(remaining.tries <= 0) {
    console.error('FAIL: busy events did not settle: ' + JSON.stringify(busyEvents));
    process.exitCode = 1;
    console.log('\nDOMAIN SMOKE TEST DONE');
    return;
  }
  remaining.tries--;
  setTimeout(() => drain(remaining), 0);
})({ busyEvents, tries: 200 });
