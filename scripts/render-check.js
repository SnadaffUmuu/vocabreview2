// Checks the pure parts (viewModel helpers and template) of SessionsUI,
// StructureUI, InfobarUI, PromptUI, DataViewUI, SliderUI, CardUI, BoardUI and the
// geometry of DragDrop without a DOM.
const fs = require('fs');
const assert = require('assert');
const load = f => fs.readFileSync(f, 'utf8');
const Components = { push() {} };
const Bus = { events: {} };
const Utils = new Function(`${load('core/Utils.js')}; return Utils;`)();
// `globals` adds stand-ins for domain objects a component reads in viewModel().
const make = (file, name, globals = {}) => new Function(
  'Components', 'Bus', 'Utils', ...Object.keys(globals),
  `${load(file)}; return ${name};`,
)(Components, Bus, Utils, ...Object.values(globals));
const SessionsUI = make('components/sessions/SessionsUI.js', 'SessionsUI');
const StructureUI = make('components/structure/StructureUI.js', 'StructureUI');

// SessionsUI.template
assert(SessionsUI.template({ sessions: [] }).includes('No sessions in progress'));
const sessionsHtml = SessionsUI.template({
  sessions: [{ sourceId: 'a"b', views: [{ name: 's', label: '<S>' }] }],
});
assert(sessionsHtml.includes('data-session-source="a&quot;b"'));
assert(sessionsHtml.includes('data-session-view="s"'));
assert(!sessionsHtml.includes('<S>') && sessionsHtml.includes('&lt;S&gt;'));

// StructureUI.buildNodes / toggled / template
const structure = [
  { id: '0', name: 'A<b>', children: [
    { id: '0.0', name: 'a1' }, { id: '0.1', name: 'a2' },
  ] },
  { id: '1', name: 'B' },
];
const ids = list => [...list].join(',');
assert.strictEqual(ids(StructureUI.allIds(structure)), '0,0.0,0.1,1');

let nodes = StructureUI.buildNodes(structure, new Set(['0.0']), new Set(), {});
assert(!nodes[0].checked && nodes[0].indeterminate, 'partial parent is indeterminate');
assert(nodes[0].children[0].checked && !nodes[1].checked);

let next = StructureUI.toggled(structure, new Set(['0.0']), '0.1', true);
assert.strictEqual(ids([...next].sort()), '0,0.0,0.1', 'all children checked -> parent checked');
next = StructureUI.toggled(structure, next, '0.0', false);
assert.strictEqual(ids([...next].sort()), '0.1', 'unchecking a child unchecks the parent');
next = StructureUI.toggled(structure, new Set(), '0', true);
assert.strictEqual(ids([...next].sort()), '0,0.0,0.1', 'parent check cascades down');

const expanded = StructureUI.expandedByDefault(structure, new Set(['0.1']));
assert(expanded.has('0') && !expanded.has('1'), 'branches with selection are open');

nodes = StructureUI.buildNodes(structure, new Set(['0.0']), expanded, { '0.0': ['S', 'D'] });
assert.strictEqual(ids(StructureUI.collectChecked(nodes)), '0.0');
assert.strictEqual(ids(StructureUI.collectOpen(nodes)), '0');
const html = StructureUI.template({ nodes });
assert(html.includes('<span class="inProgress">S&nbsp;D</span>'));
assert(html.includes('data-indeterminate') && html.includes('<details class="treeBranch" open>'));
assert(html.includes('A&lt;b&gt;') && !html.includes('A<b>'));

// InfobarUI.viewModel
let App = { currentSource: 'src', night: true, selectedEntries: () => [1, 2, 3] };
let Library = { hasSource: id => id === 'src' };
let InfobarUI = make('components/infobar/InfobarUI.js', 'InfobarUI', { App, Library });
assert.deepStrictEqual(InfobarUI.viewModel(), { source: 'src', count: '3', night: true });
App.currentSource = 'missing';
assert.deepStrictEqual(InfobarUI.viewModel(), { source: '', count: '', night: true });

// PromptUI.viewModel
let Prompt = { state: { open: true, text: 't', notify: true } };
const PromptUI = make('components/prompt/PromptUI.js', 'PromptUI', { Prompt });
assert.deepStrictEqual(PromptUI.viewModel(),
  { open: true, text: 't', notify: true, confirmLabel: 'OK' });
Prompt.state = { open: true, text: 'q', notify: false };
assert.strictEqual(PromptUI.viewModel().confirmLabel, 'Confirm');

// DataViewUI: pure helpers and templates
const DataViewUI = make('components/data-view/DataViewUI.js', 'DataViewUI');
assert.strictEqual(DataViewUI.reviewLevelStyle('2'),
  'color:var(--revLevelMinorTextColor); border-bottom:1px solid var(--revLevelMinorTextColor);');
assert.strictEqual(DataViewUI.reviewLevelStyle('200'),
  'color:var(--revLevelTextColor); border-bottom:2px solid var(--revLevelTextColor);');
const tree = [{ name: 'A', children: [{ name: 'a1' }] }, { name: 'B' }];
assert.strictEqual(DataViewUI.breadcrumbs(tree, '0.0'), 'A / a1');
assert.strictEqual(DataViewUI.breadcrumbs(tree, '1'), 'B');
assert.strictEqual(DataViewUI.breadcrumbs(tree, null), '');
assert.strictEqual(DataViewUI.highlight('a<b>c', 'b'), 'a&lt;<strong>b</strong>&gt;c');
const dataEntry = {
  sourceId: 's"1', tag: 'grammar', info: '<i>', reviewLevel: '2', breadcrumbs: 'A / a1',
  lines: [
    { text: 'x<y', role: 'expression', compact: false, level: '2', levelStyle: 'color:red;' },
    { text: 'z', role: 'example', compact: true, translationLineIndex: 3, level: '' },
  ],
};
let dataHtml = DataViewUI.template({ query: '', entries: [dataEntry] });
assert(dataHtml.includes('<div class="reviewLevel tag">2</div>'));
assert(dataHtml.includes('<div class="tag">grammar</div>'));
assert(dataHtml.includes('data-review-level="2"') && dataHtml.includes('style="color:red;"'));
assert(dataHtml.includes('x&lt;y') && !dataHtml.includes('x<y') && !dataHtml.includes('<i>'));
assert(dataHtml.includes('class="compact"') && dataHtml.includes('(trans.l.index: 3)'));
assert(!dataHtml.includes('entrySource'), 'source tag only while searching');
dataHtml = DataViewUI.template({ query: 'z', entries: [dataEntry] });
assert(dataHtml.includes('<span class="entrySource">s&quot;1</span>'));
assert(dataHtml.includes('<strong>z</strong>'));
assert.strictEqual(DataViewUI.template({ query: '', entries: [] }), '');

// Cards: pure side rules shared by Slider and Board
const Parser = { LINE_ROLE: { reading: 'reading' }, lineOrders: {
  meaning: ['meaning', 'expression'] } };
const Cards = make('domain/Cards.js', 'Cards', { Parser });
assert.strictEqual(Cards.nextSideIndex([4, 5, 6], 6), 4);
assert.strictEqual(Cards.nextSideIndex([4, 5, 6], 4), 5);
assert.strictEqual(Cards.nextSideIndex([4, 5, 6], 99), 5);
assert.strictEqual(Cards.prevSideIndex([4, 5, 6], 4), 6);
assert.strictEqual(Cards.prevSideIndex([4, 5, 6], 6), 5);
assert.strictEqual(Cards.currentSide([{ originalIndex: 3 }, { originalIndex: 4 }], 4), 4);
assert.strictEqual(Cards.currentSide([{ originalIndex: 3 }, { originalIndex: 4 }], 9), 3);
assert.strictEqual(Cards.currentSide([], 9), null);

const lines = [
  { originalIndex: 0, role: 'expression', text: 'E<>' },
  { originalIndex: 1, role: 'meaning', text: 'M' },
  { originalIndex: 2, role: 'reading', text: 'R' },
];
assert.deepStrictEqual(
  Cards.orderLines(lines.slice(0, 2), 'meaning', undefined).map(l => l.originalIndex),
  [1, 0], 'order by mode');
assert.deepStrictEqual(
  Cards.orderLines(lines.slice(0, 2), 'meaning', 0).map(l => l.originalIndex),
  [0, 1], 'a saved side keeps the original order');

// SliderUI: pure helpers and templates
const SliderUI = make('components/slider/SliderUI.js', 'SliderUI', { Cards });
assert.strictEqual(SliderUI.nextReading(undefined), 'listened');
assert.strictEqual(SliderUI.nextReading('listened'), 'revealed');
assert.strictEqual(SliderUI.nextReading('revealed'), '');

const entry = { id: 7, section: '0', tag: 'geo', reviewLevel: '1', info: 'i<n>', lines };
SliderUI.entries = [entry];
SliderUI.sideOrders = { 7: Cards.sideLines(entry) };
SliderUI.readings = { 7: 'revealed' };
SliderUI.openInfoId = 7;
assert.strictEqual(SliderUI.currentSideIndex(7, { sideIndexes: {} }), 0);
assert.strictEqual(SliderUI.currentSideIndex(7, { sideIndexes: { 7: 1 } }), 1);
assert.strictEqual(SliderUI.currentSideIndex(7, { sideIndexes: { 7: 99 } }), 0);

const slide = SliderUI.slideViewModel(entry, { sideIndexes: { 7: 1 } });
assert.strictEqual(slide.currentSide, 1);
assert.deepStrictEqual(slide.sides.map(side => side.current), [false, true]);
assert(slide.info.open && slide.reading.state === 'revealed');
let slideHtml = SliderUI.template({ slides: [slide] });
assert(slideHtml.includes('data-entry-id="7"') && slideHtml.includes('data-tag="geo"'));
assert(slideHtml.includes('data-review-level="1"') && slideHtml.includes('data-section="0"'));
assert(/<details class="entry-info"\s+open\s*>/.test(slideHtml));
assert(slideHtml.includes('<div class="sides-count">2</div>'));
assert(slideHtml.includes('<div class="current-side">1</div>'));
assert(/slide-side js-slide-side\s+current/.test(slideHtml));
assert(slideHtml.includes('class="slideReading revealed"'));
assert(slideHtml.includes('E&lt;&gt;') && !slideHtml.includes('E<>') && !slideHtml.includes('i<n>'));

SliderUI.openInfoId = null;
SliderUI.readings = {};
slideHtml = SliderUI.template({ slides: [SliderUI.slideViewModel(entry, { sideIndexes: {} })] });
assert(!/<details class="entry-info"\s+open/.test(slideHtml), 'info is closed by default');
assert(slideHtml.includes('class="slideReading "'), 'reading is hidden by default');
assert.strictEqual(SliderUI.template({ slides: [] }), '');

// CardUI: card markup
const CardUI = make('components/card/CardUI.js', 'CardUI');
const baseCard = {
  id: 7, tag: 'geo', reviewLevel: '1', reversed: true, count: 2,
  side: { index: 0, role: 'expression', text: 'E<>"', speakable: true, compact: false },
  reading: 'R<r>', info: 'i<n>', infoOpen: false, draggable: true,
  expanded: false, top: 0, lineExpanded: false, covered: false,
};
let cardHtml = CardUI.template(baseCard);
assert(cardHtml.includes('data-entry-id="7"') && cardHtml.includes('data-drag-id="7"'));
assert(cardHtml.includes('data-tag="geo"') && cardHtml.includes('reversedShown'));
assert(cardHtml.includes('cardTapZone') && cardHtml.includes('cardInfoMark'));
assert(!cardHtml.includes('cardActions') && !cardHtml.includes('cardInfo"'), 'actions only when expanded');
assert(cardHtml.includes('data-review-level="1"') && cardHtml.includes('data-reading='));
assert(cardHtml.includes('E&lt;&gt;&quot;') && !cardHtml.includes('E<>'), 'side text is escaped');
assert(!cardHtml.includes('covered') && !cardHtml.includes('style='));
cardHtml = CardUI.template(Object.assign({}, baseCard, {
  expanded: true, top: 120, infoOpen: true, draggable: false, covered: false, lineExpanded: true }));
assert(cardHtml.includes('style="top:120px"') && cardHtml.includes('lineExpanded'));
assert(!cardHtml.includes('data-drag-id') && !cardHtml.includes('cardTapZone'));
assert(cardHtml.includes('cardSpeak') && cardHtml.includes('cardInfoToggle') && cardHtml.includes('cardRemove'));
assert(cardHtml.includes('R&lt;r&gt;') && cardHtml.includes('i&lt;n&gt;') && !cardHtml.includes('i<n>'));
cardHtml = CardUI.template(Object.assign({}, baseCard, {
  expanded: true, side: Object.assign({}, baseCard.side, { speakable: false }), info: null }));
assert(!cardHtml.includes('cardSpeak') && !cardHtml.includes('cardReading') && !cardHtml.includes('cardInfoToggle'));
assert(CardUI.template(Object.assign({}, baseCard, { covered: true })).includes('covered'));
assert(CardUI.template(Object.assign({}, baseCard, { reversed: false })).indexOf('reversedShown') < 0);
assert(CardUI.legendTemplate(['geo', 'a"b']).includes('data-tag="a&quot;b"'));

// BoardUI: view model and template
const ENTRY_TAG = { geo: 'geo', name: 'name' };
const boardApp = { currentView: 'board' };
const BoardState = { zones: ['failed', 'learn', 'good'] };
const BoardUI = make('components/board/BoardUI.js', 'BoardUI', {
  App: boardApp, BoardState, Cards, CardUI, Parser: { ENTRY_TAG } });
const bEntry = (id, extra) => Object.assign({ id, lines: [
  { originalIndex: 0, role: 'expression', text: 'E' + id },
  { originalIndex: 1, role: 'meaning', text: 'M' + id },
  { originalIndex: 2, role: 'reading', text: 'R' + id },
] }, extra);
const bEntries = [bEntry(1, { tag: 'geo' }), bEntry(2, { reversed: true }), bEntry(3)];
BoardUI.layout = { source: [bEntries[0], bEntries[1]], zones: { good: [bEntries[2]] } };
BoardUI.entries = Object.fromEntries(bEntries.map(e => [e.id, e]));
BoardUI.resolveSideOrders(bEntries, { mode: 'original', sideIndexes: {} });
assert.strictEqual(BoardUI.sideOrders[1].length, 2, 'the reading is not a side');
let boardUi = { mode: 'original', markReversed: true, sideIndexes: { 2: 1 } };
let boardVm = BoardUI.viewModel(boardUi);
assert.strictEqual(boardVm.sourceCount, '2');
assert.deepStrictEqual(boardVm.zones.source.map(c => c.id), [1, 2]);
assert.deepStrictEqual(boardVm.zones.good.map(c => c.id), [3]);
assert.deepStrictEqual(boardVm.zones.failed, []);
assert.strictEqual(boardVm.zones.source[1].side.index, 1, 'saved side is shown');
assert(boardVm.zones.source[1].reversed && boardVm.zones.source[0].draggable);
assert.deepStrictEqual(boardVm.legend, ['geo'], 'legend lists the tags of the cards');
assert.strictEqual(boardVm.expanded, null);
boardVm = BoardUI.viewModel(Object.assign({}, boardUi, { markReversed: false }));
assert(!boardVm.zones.source[1].reversed, 'R off hides the mark');

BoardUI.expanded = { id: 2, top: 40 };
BoardUI.infoOpen = true;
boardVm = BoardUI.viewModel(boardUi);
assert(boardVm.expanded.expanded && boardVm.expanded.top === 40 && !boardVm.expanded.draggable);
assert(boardVm.zones.source[1].covered && !boardVm.zones.source[0].covered);
const zoneHtml = BoardUI.template(boardVm.zones.source);
assert(zoneHtml.includes('data-drag-id="1"') && zoneHtml.includes('covered'));
assert.strictEqual(BoardUI.template([]), '');
BoardUI.expanded = null;
BoardUI.infoOpen = false;

// DragDrop: pure geometry
const DragDrop = make('components/drag-drop/DragDrop.js', 'DragDrop');
const box = (left, top, right, bottom) => ({ left, top, right, bottom });
const rowA = [box(0, 0, 40, 20), box(45, 0, 85, 20), box(90, 0, 130, 20)];
const rowB = [box(0, 25, 40, 45), box(45, 25, 85, 45)];
const twoRows = rowA.concat(rowB);
assert.strictEqual(DragDrop.insertionIndex([], 10, 10), 0, 'empty zone: to the end');
assert.strictEqual(DragDrop.insertionIndex(twoRows, 10, 10), 0);
assert.strictEqual(DragDrop.insertionIndex(twoRows, 50, 10), 1, 'left half of a card: before it');
assert.strictEqual(DragDrop.insertionIndex(twoRows, 80, 10), 2, 'right half: before the next');
assert.strictEqual(DragDrop.insertionIndex(twoRows, 125, 10), 3, 'right end of a row: first of the next row');
assert.strictEqual(DragDrop.insertionIndex(twoRows, 200, 10), 3, 'past the end of a row');
assert.strictEqual(DragDrop.insertionIndex(twoRows, 10, 30), 3);
assert.strictEqual(DragDrop.insertionIndex(twoRows, 200, 30), 5, 'past the last card');
assert.strictEqual(DragDrop.insertionIndex(twoRows, 10, 200), 5, 'below everything: to the end');
assert.strictEqual(DragDrop.insertionIndex(twoRows, 10, 22), 3, 'the gap between rows belongs to the next row');
const uneven = [box(0, 0, 40, 60), box(45, 10, 85, 30), box(0, 65, 40, 85)];
assert.strictEqual(DragDrop.insertionIndex(uneven, 60, 30), 1, 'cards of different heights stay in one row');
assert.strictEqual(DragDrop.insertionIndex(uneven, 10, 70), 2, 'the next row starts below the tallest card');
assert.strictEqual(DragDrop.scrollDelta(10, 0, 300), -DragDrop.scrollStep);
assert.strictEqual(DragDrop.scrollDelta(290, 0, 300), DragDrop.scrollStep);
assert.strictEqual(DragDrop.scrollDelta(150, 0, 300), 0);

console.log('render-check ok');
