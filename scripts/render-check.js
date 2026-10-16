// Checks the pure parts (viewModel helpers and template) of SessionsUI,
// StructureUI, InfobarUI, PromptUI, DataViewUI and SliderUI without a DOM.
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
  sessions: [{ originId: 'a"b', views: [{ name: 's', label: '<S>' }] }],
});
assert(sessionsHtml.includes('data-session-origin="a&quot;b"'));
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
let App = { currentOrigin: 'src', night: true, selectedEntries: () => [1, 2, 3] };
let Library = { hasSource: id => id === 'src' };
let InfobarUI = make('components/infobar/InfobarUI.js', 'InfobarUI', { App, Library });
assert.deepStrictEqual(InfobarUI.viewModel(), { source: 'src', count: '3', night: true });
App.currentOrigin = 'missing';
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
  'color:var(--revLevelMinorTextColor);border-bottom:1px solid var(--revLevelMinorTextColor);');
assert.strictEqual(DataViewUI.reviewLevelStyle('200'),
  'color:var(--revLevelTextColor);border-bottom:2px solid var(--revLevelTextColor);');
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

// SliderUI: pure helpers and templates
const Parser = { LINE_ROLE: { reading: 'reading' }, lineOrders: {
  meaning: ['meaning', 'expression'] } };
const SliderUI = make('components/slider/SliderUI.js', 'SliderUI', { Parser });
assert.strictEqual(SliderUI.nextReading(undefined), 'listened');
assert.strictEqual(SliderUI.nextReading('listened'), 'revealed');
assert.strictEqual(SliderUI.nextReading('revealed'), '');
assert.strictEqual(SliderUI.nextSideIndex([4, 5, 6], 6), 4);
assert.strictEqual(SliderUI.nextSideIndex([4, 5, 6], 4), 5);
assert.strictEqual(SliderUI.nextSideIndex([4, 5, 6], 99), 5);

const lines = [
  { originalIndex: 0, role: 'expression', text: 'E<>' },
  { originalIndex: 1, role: 'meaning', text: 'M' },
  { originalIndex: 2, role: 'reading', text: 'R' },
];
assert.deepStrictEqual(
  SliderUI.orderLines(lines.slice(0, 2), 'meaning', undefined).map(l => l.originalIndex),
  [1, 0], 'order by mode');
assert.deepStrictEqual(
  SliderUI.orderLines(lines.slice(0, 2), 'meaning', 0).map(l => l.originalIndex),
  [0, 1], 'a saved side keeps the original order');

const entry = { id: 7, section: '0', tag: 'geo', reviewLevel: '1', info: 'i<n>', lines };
SliderUI.entries = [entry];
SliderUI.sideOrders = { 7: SliderUI.sideLines(entry) };
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

console.log('render-check ok');
