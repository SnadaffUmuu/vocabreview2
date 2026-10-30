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
loadRel('domain/BoardState.js');
loadRel('domain/PanelState.js');
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

  assert(JSON.stringify(Prompt.state) === '{"open":false,"text":"","notify":false}',
    'state of a closed prompt');
  Prompt.notify('msg');
  assert(JSON.stringify(Prompt.state) === '{"open":true,"text":"msg","notify":true}',
    'state of an open prompt carries no callbacks');
  Prompt.cancel();
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
