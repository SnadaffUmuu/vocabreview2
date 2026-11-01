/*
   Checks the pure parts (viewModel helpers and template) of SessionsUI,
   StructureUI, InfobarUI, PromptUI, DataViewUI, SliderUI, CardUI, BoardUI, PanelUI,
   TableUI and the geometry of DragDrop without a DOM.
*/
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
  sessions: [{ sourceId: 'a"b', label: 'L: <x>', views: [{ name: 's', label: '<S>' }] }],
});
assert(sessionsHtml.includes('data-session-source="a&quot;b"'));
assert(sessionsHtml.includes('data-session-view="s"'));
assert(sessionsHtml.includes('>L: &lt;x&gt;</td>') && !sessionsHtml.includes('<x>'), 'the label is shown, escaped');
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

const treeApp = { currentSource: 'L:g', getSelection: () => [], currentView: 'board' };
const treeLibrary = { hasSource: () => true, getSource: () => ({ parsed: { structure: [] } }) };
const treeUI = make('components/structure/StructureUI.js', 'StructureUI', {
  App: treeApp, Library: treeLibrary, Progress: { marksBySection: () => ({}) },
  Collections: { isListId: id => id.startsWith('L:') } });
assert.strictEqual(treeUI.viewModel().selectable, false, 'a list has no selection');
treeApp.currentSource = 'file';
assert.strictEqual(treeUI.viewModel().selectable, true);

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
let Library = { hasSource: id => id === 'src' || id === 'L:g', labelOf: id => id === 'L:g' ? 'L: G' : id };
let InfobarUI = make('components/infobar/InfobarUI.js', 'InfobarUI', { App, Library });
assert.deepStrictEqual(InfobarUI.viewModel(), { source: 'src', count: '3', night: true });
App.currentSource = 'L:g';
assert.strictEqual(InfobarUI.viewModel().source, 'L: G', 'a list is shown by its label');
App.currentSource = 'src';
App.currentSource = 'missing';
assert.deepStrictEqual(InfobarUI.viewModel(), { source: '', count: '', night: true });

// PromptUI.viewModel
let Prompt = { state: { open: true, text: 't', notify: true, choice: null } };
const DropdownUI = make('components/dropdown/DropdownUI.js', 'DropdownUI');
const PromptUI = make('components/prompt/PromptUI.js', 'PromptUI', { Prompt, DropdownUI });
assert.deepStrictEqual(PromptUI.viewModel(),
  { open: true, text: 't', notify: true, choice: null, input: undefined,
    canConfirm: undefined, serial: undefined, confirmLabel: 'OK' });
Prompt.state = { open: true, text: 'q', notify: false, choice: null };
assert.strictEqual(PromptUI.viewModel().confirmLabel, 'Confirm');
assert.strictEqual(PromptUI.template(PromptUI.viewModel()), '', 'no choice, no dropdown');
Prompt.state.choice = { items: [{ value: 'g"1', label: '<G>' }], value: 'g"1' };
const choiceHtml = PromptUI.template(PromptUI.viewModel());
assert(choiceHtml.includes('id="promptChoiceSelect"') && choiceHtml.includes('select-button'));
assert(choiceHtml.includes('data-value="g&quot;1"') && choiceHtml.includes('&lt;G&gt;') && !choiceHtml.includes('<G>'));

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
assert(!dataHtml.includes('dataEntryRemove'), 'a file entry has no remove button');
dataHtml = DataViewUI.template({ query: '', entries: [Object.assign({}, dataEntry, { id: 7, removable: true })] });
assert(dataHtml.includes('class="dataEntryRemove iconButton"') && dataHtml.includes('data-entry-id="7"'),
  'a list entry has a remove button');
dataHtml = DataViewUI.template({ query: '', entries: [Object.assign({}, dataEntry, { id: 'a"b', removable: true })] });
assert(dataHtml.includes('data-entry-id="a&quot;b"'), 'the id is escaped');
assert(!dataHtml.includes('dataEntryAdd'), 'no copy button unless the entry is copyable');
dataHtml = DataViewUI.template({ query: '', entries: [Object.assign({}, dataEntry, { id: 7, removable: true, copyable: true })] });
assert(/class="dataEntryAdd iconButton"[^>]*data-entry-id="7"[^>]*data-source-id="s&quot;1"/.test(dataHtml.replace(/\s+/g, ' '))
  && dataHtml.indexOf('dataEntryAdd') < dataHtml.indexOf('dataEntryRemove'),
'a list entry has a copy button to the left of the remove button');

// DataViewUI.viewModel: only a list entry shown without a search can be removed
const dataIsList = id => typeof id === 'string' && id.startsWith('L:');
const dataApp = { currentView: 'data', currentSource: 'L:g', selectedEntries: () => [{ id: 3, lines: [] }] };
const dataLibrary = {
  hasSource: () => true,
  listIds: () => [],
  getSource: () => ({ parsed: { structure: [], allEntries: [{ id: 3, lines: [] }] } }),
};
const ListDataUI = make('components/data-view/DataViewUI.js', 'DataViewUI', {
  App: dataApp, Library: dataLibrary, Collections: { isListId: dataIsList } });
let dataVm = ListDataUI.viewModel();
assert(dataVm.isList && dataVm.entries[0].removable && dataVm.entries[0].id === 3, 'a list entry is removable');
assert(dataVm.entries[0].copyable, 'and copyable');
dataApp.currentSource = 'file';
dataVm = ListDataUI.viewModel();
assert(!dataVm.isList && !dataVm.entries[0].removable && dataVm.entries[0].copyable,
  'a file entry is copyable, but not removable');
dataApp.currentSource = 'L:g';
ListDataUI.searchValue = 'x';
assert.strictEqual(ListDataUI.viewModel().entries.length, 0, 'the search looks in the files, not in the list');
ListDataUI.searchValue = '';
dataLibrary.listIds = () => ['file'];
dataLibrary.getSource = () => ({ parsed: { structure: [], allEntries: [{ id: 3, lines: [{ text: 'x' }] }] } });
ListDataUI.searchValue = 'x';
dataVm = ListDataUI.viewModel();
assert(dataVm.entries.length === 1 && dataVm.entries[0].copyable && !dataVm.entries[0].removable
  && dataVm.entries[0].sourceId === 'file', 'a search result can be copied, with its own source, but not removed');
ListDataUI.searchValue = '';
dataLibrary.listIds = () => [];
dataLibrary.getSource = () => ({ parsed: { structure: [], allEntries: [{ id: 3, lines: [] }] } });

// DataViewUI.removeFromList asks ListPrompts for the current list only;
// addToList hands over the entry of the source named by the button
const dataCalls = [];
const askedSources = [];
const RemovingDataUI = make('components/data-view/DataViewUI.js', 'DataViewUI', {
  App: dataApp,
  Library: Object.assign({}, dataLibrary, {
    getSource: id => {
      askedSources.push(id);
      return id === 'nowhere' ? undefined : dataLibrary.getSource(id);
    },
  }),
  Collections: { isListId: dataIsList, listIdOf: id => id.slice(2) },
  ListPrompts: {
    removeEntry: (listId, entryId) => dataCalls.push([listId, entryId]),
    addEntry: entry => dataCalls.push(['add', entry.id]),
  } });
RemovingDataUI.removeFromList({ dataset: { entryId: '3' } });
dataApp.currentSource = 'file';
RemovingDataUI.removeFromList({ dataset: { entryId: '3' } });
assert.deepStrictEqual(dataCalls, [['g', 3]], 'a file source has nothing to remove from');
RemovingDataUI.addToList({ dataset: { entryId: '3', sourceId: 'file' } });
assert.deepStrictEqual(dataCalls[1], ['add', 3], 'an entry of a file is handed to the prompt');
dataApp.currentSource = 'L:g';
RemovingDataUI.addToList({ dataset: { entryId: '3', sourceId: 'file' } });
assert.deepStrictEqual(askedSources.slice(-1), ['file'], 'the source comes from the button, not from the current source');
RemovingDataUI.addToList({ dataset: { entryId: '99', sourceId: 'file' } });
RemovingDataUI.addToList({ dataset: { entryId: '3', sourceId: 'nowhere' } });
assert.strictEqual(dataCalls.length, 3, 'an unknown entry or source is ignored');

// PromptUI: the input field
Prompt.state = { open: true, text: 'name', notify: false, choice: null,
  input: { value: 'a"b', error: 'bad <name>' }, canConfirm: false, serial: 4 };
let promptVm = PromptUI.viewModel();
assert(promptVm.input.value === 'a"b' && promptVm.canConfirm === false && promptVm.serial === 4);
assert.strictEqual(PromptUI.template(promptVm), '', 'the field is static markup, not part of the template');
const fields = {
  inputBoxEl: { hidden: null, classList: { toggle(cls, on) { fields.inputBoxEl.hidden = on; } } },
  inputErrorEl: { textContent: '' },
  inputEl: { value: '', focused: 0, focus() { this.focused++; }, select() {} },
};
PromptUI.dom = fields;
PromptUI.shownSerial = 0;
PromptUI.renderInput(promptVm);
assert(fields.inputBoxEl.hidden === false && fields.inputErrorEl.textContent === 'bad <name>',
  'the field and its error are shown');
assert(fields.inputEl.value === 'a"b' && fields.inputEl.focused === 1, 'a new prompt writes the field and focuses it');
fields.inputEl.value = 'typed more';
PromptUI.renderInput(PromptUI.viewModel());
assert(fields.inputEl.value === 'typed more' && fields.inputEl.focused === 1,
  'a render of the same prompt never overwrites what is being typed');
Prompt.state = { open: true, text: 'name', notify: false, choice: null, input: { value: 'z', error: '' },
  canConfirm: true, serial: 5 };
PromptUI.renderInput(PromptUI.viewModel());
assert(fields.inputEl.value === 'z' && fields.inputEl.focused === 2, 'the next prompt starts from its own value');
Prompt.state = { open: true, text: 'q', notify: false, choice: null, input: null, canConfirm: true, serial: 6 };
PromptUI.renderInput(PromptUI.viewModel());
assert(fields.inputBoxEl.hidden === true && fields.inputErrorEl.textContent === '', 'no input, no field');

// ListsUI: the catalog
const ListsUI = make('components/lists/ListsUI.js', 'ListsUI');
const catalog = [
  { listId: 'global', sourceId: 'L:global', name: 'Global', count: 3, exists: true, isDefault: true, current: true },
  { listId: 'l1', sourceId: 'L:l1', name: '<b>Verbs</b>', count: 0, exists: true, isDefault: false, current: false },
  { listId: 'l2', sourceId: 'L:l2', name: 'Nouns', count: 2, exists: true, isDefault: false, current: false },
];
let listsHtml = ListsUI.template({ lists: catalog });
assert(listsHtml.includes('data-list-pick="L:global"') && listsHtml.includes('data-list-pick="L:l2"'),
  'a list with entries can be opened');
assert(!listsHtml.includes('data-list-pick="L:l1"'), 'an empty list cannot be opened');
assert(listsHtml.includes('&lt;b&gt;Verbs&lt;/b&gt;') && !listsHtml.includes('<b>Verbs'), 'the name is escaped');
assert(!listsHtml.includes('data-list-rename="global"') && listsHtml.includes('data-list-rename="l1"'),
  'Global cannot be renamed');
assert(listsHtml.includes('data-list-delete="global"') && listsHtml.includes('aria-label="Clear"')
  && listsHtml.includes('aria-label="Delete"'), 'Global is cleared, the others are deleted');
assert(/listsItem\s+current/.test(listsHtml) && /listsItem\s+empty/.test(listsHtml), 'the current and empty rows are marked');
listsHtml = ListsUI.template({ lists: [
  { listId: 'global', sourceId: 'L:global', name: 'Global', count: 0, exists: false, isDefault: true, current: false }] });
assert(!listsHtml.includes('data-list-delete') && !listsHtml.includes('data-list-rename'),
  'Global that does not exist yet has nothing to rename or clear');

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
assert(!cardHtml.includes('cardAddToList'), 'no add button unless the view offers it');
assert(CardUI.template(Object.assign({}, baseCard, { expanded: true, canAddToList: true })).includes('cardAddToList'));
assert(!CardUI.template(Object.assign({}, baseCard, { canAddToList: true })).includes('cardAddToList'),
  'only the open card has actions');
assert(CardUI.template(Object.assign({}, baseCard, { covered: true })).includes('covered'));
assert(!CardUI.template(Object.assign({}, baseCard, { covered: true })).includes('style='), 'no size, no style');
assert(CardUI.template(Object.assign({}, baseCard, { reversed: false })).indexOf('reversedShown') < 0);
assert(CardUI.legendTemplate(['geo', 'a"b']).includes('data-tag="a&quot;b"'));

// BoardUI: view model and template
const ENTRY_TAG = { geo: 'geo', name: 'name' };
const boardApp = { currentView: 'board' };
const BoardState = { zones: ['failed', 'learn', 'good'] };
const isListId = id => typeof id === 'string' && id.startsWith('L:');
const CardZones = make('components/card/CardZones.js', 'CardZones', {
  App: boardApp, Cards, Parser: { ENTRY_TAG }, Collections: { isListId },
  Library: { hasSource: () => true } });
const BoardUI = make('components/board/BoardUI.js', 'BoardUI', {
  App: boardApp, BoardState, Cards, CardUI, CardZones, Parser: { ENTRY_TAG },
  Collections: { isListId } });
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

BoardUI.expanded = { id: 2, top: 40, width: 120, height: 31 };
BoardUI.infoOpen = true;
boardVm = BoardUI.viewModel(boardUi);
assert(boardVm.expanded.expanded && boardVm.expanded.top === 40 && !boardVm.expanded.draggable);
assert(boardVm.zones.source[1].covered && !boardVm.zones.source[0].covered);
assert.deepStrictEqual(boardVm.zones.source[1].size, { width: 120, height: 31 }, 'covered place keeps its size');
assert.strictEqual(boardVm.zones.source[0].size, null);
const zoneHtml = BoardUI.template(boardVm.zones.source);
assert(zoneHtml.includes('data-drag-id="1"') && zoneHtml.includes('covered'));
assert(zoneHtml.includes('style="width:120px;height:31px"'), 'the place of the open card has a frozen size');
// The place does not depend on the side the open card shows.
BoardUI.sideOrders[2] = BoardUI.sideOrders[2].slice().reverse();
assert.strictEqual(
  BoardUI.template(BoardUI.viewModel(boardUi).zones.source).match(/style="[^"]*"/)[0],
  'style="width:120px;height:31px"');
assert.strictEqual(BoardUI.template([]), '');
assert(boardVm.expanded.canAddToList && !boardVm.zones.source[0].canAddToList, 'the open Board card can be added to a list');
assert(CardUI.template(boardVm.expanded).includes('cardAddToList'));

// Open card of a list: "remove from the list" next to "add"; a file source has no such button
assert(!boardVm.expanded.canRemoveFromList, 'a file source card is not removed from a list');
boardApp.currentSource = 'L:global';
assert(BoardUI.viewModel(boardUi).expanded.canRemoveFromList, 'the open card of a list can be removed from it');
assert(!BoardUI.viewModel(boardUi).zones.source[0].canRemoveFromList, 'only the open card has actions');
assert(CardUI.template(BoardUI.viewModel(boardUi).expanded).includes('cardRemoveFromList'));
assert(!CardUI.template(boardVm.expanded).includes('cardRemoveFromList'));
boardApp.currentSource = 'src';

// BoardUI.addToList / removeFromList only hand the card over to ListPrompts
const listCalls = [];
const boardListPrompts = {
  addEntry: entry => listCalls.push(['add', entry.id]),
  removeEntry: (listId, entryId) => listCalls.push(['remove', listId, entryId]),
};
const boardCollections = { isListId, listIdOf: id => id.slice(2) };
const boardLibrary = { hasSource: () => true };
const ListBoardUI = make('components/board/BoardUI.js', 'BoardUI', {
  App: boardApp, BoardState, Cards, CardUI, CardZones, Parser: { ENTRY_TAG },
  ListPrompts: boardListPrompts, Collections: boardCollections, Library: boardLibrary });
ListBoardUI.entries = BoardUI.entries;
ListBoardUI.expanded = null;
ListBoardUI.addToList();
ListBoardUI.removeFromList();
assert.deepStrictEqual(listCalls, [], 'no open card, nothing is asked');
ListBoardUI.expanded = { id: 2 };
ListBoardUI.addToList();
assert.deepStrictEqual(listCalls, [['add', 2]]);
boardApp.currentSource = 'src';
ListBoardUI.removeFromList();
assert.strictEqual(listCalls.length, 1, 'a file source has nothing to remove a card from');
boardApp.currentSource = 'L:global';
ListBoardUI.removeFromList();
assert.deepStrictEqual(listCalls[1], ['remove', 'global', 2]);
assert.strictEqual(ListBoardUI.expanded.id, 2, 'the card stays open until the list announces the change');
boardApp.currentSource = 'src';
BoardUI.expanded = null;
BoardUI.infoOpen = false;

// CardUI: a card that lies freely in its zone
cardHtml = CardUI.template(Object.assign({}, baseCard, { place: { x: 12, y: 30, z: 4 } }));
assert(cardHtml.includes('style="left:12px;top:30px;z-index:4"') && cardHtml.includes('placed'));
cardHtml = CardUI.template(Object.assign({}, baseCard, {
  place: { x: 'a"b', y: 0, z: 1 }, covered: true, size: { width: 50, height: 20 } }));
assert(cardHtml.includes('left:0px') && !cardHtml.includes('a"b'), 'a place holds numbers only');
assert(cardHtml.includes('left:0px;top:0px;z-index:1;width:50px;height:20px'), 'place and frozen size go together');
assert(!CardUI.template(baseCard).includes('placed'), 'no place, no mark');

// PanelUI: view model and template
const PanelState = { zones: ['1', '2', '3', '4'] };
const PanelUI = make('components/panel/PanelUI.js', 'PanelUI', {
  App: boardApp, PanelState, Cards, CardUI, CardZones, Parser: { ENTRY_TAG } });
boardApp.currentView = 'panel';
PanelUI.layout = { source: [bEntries[0]], zones: { '2': [bEntries[1]], '3': [bEntries[2]] } };
PanelUI.entries = Object.fromEntries(bEntries.map(e => [e.id, e]));
PanelUI.sideOrders = {};
PanelUI.positions = { 2: { x: 7, y: 9, z: 3 } };
PanelUI.resolveSideOrders(bEntries, { mode: 'original' });
assert.strictEqual(PanelUI.sideOrders[1].length, 2, 'the reading is not a side');
const panelUi = { mode: 'original' };
let panelVm = PanelUI.viewModel(panelUi);
assert.strictEqual(panelVm.sourceCount, '1');
assert.deepStrictEqual(Object.keys(panelVm.zones).sort(), ['1', '2', '3', '4', 'source']);
assert.deepStrictEqual(panelVm.zones['2'].cards.map(c => c.id), [2]);
assert.deepStrictEqual(panelVm.zones['1'].cards, []);
assert(!panelVm.zones.source.controls && panelVm.zones['1'].controls, 'the start area has no buttons');
assert.deepStrictEqual(panelVm.zones['2'].cards[0].place, { x: 7, y: 9, z: 3 }, 'a placed card keeps its place');
assert.strictEqual(panelVm.zones.source.cards[0].place, null, 'a card without a place is in the flow');
assert(!panelVm.zones['2'].cards[0].reversed, 'the panel has no reversed mark');
assert.deepStrictEqual(panelVm.legend, ['geo'], 'legend lists the tags of the cards on the screen');
assert.strictEqual(panelVm.expanded, null);

// A turned side is only kept while the card is open.
PanelUI.expanded = { id: 3, top: 10, width: 80, height: 29, sideIndex: 1 };
panelVm = PanelUI.viewModel(panelUi);
assert.strictEqual(panelVm.expanded.side.index, 1, 'the open card shows its turned side');
assert.strictEqual(panelVm.expanded.place, null, 'the open card lies in the overlay');
assert(panelVm.expanded.canAddToList && !panelVm.zones['3'].cards[0].canAddToList,
  'the open Panel card can be added to a list');
assert(CardUI.template(panelVm.expanded).includes('cardAddToList'), 'the open Panel card offers adding to a list');
assert(!CardUI.template(panelVm.zones['3'].cards[0]).includes('cardAddToList'), 'only the open card has actions');
assert(panelVm.zones['3'].cards[0].covered);
PanelUI.closeCard();
PanelUI.sideOrders = {};
PanelUI.resolveSideOrders(bEntries, panelUi);
panelVm = PanelUI.viewModel(panelUi);
assert.strictEqual(panelVm.zones['3'].cards[0].side.index, 0, 'a closed card is back on its default side');

let zoneHtml2 = PanelUI.template(panelVm.zones['2']);
assert(zoneHtml2.includes('zoneFocus') && zoneHtml2.includes('zoneClear'));
assert(zoneHtml2.includes('data-drag-id="2"') && zoneHtml2.includes('left:7px;top:9px;z-index:3'));
assert(zoneHtml2.indexOf('zoneClear') < zoneHtml2.indexOf('entryCard'), 'buttons come before the cards');
assert(!PanelUI.template(panelVm.zones.source).includes('zoneClear'), 'no buttons in the start area');
assert(!PanelUI.template(Object.assign({}, panelVm.zones['2'], { focused: true })).includes('zoneClear'),
  'a zoomed area has no clear button');
assert(PanelUI.template(Object.assign({}, panelVm.zones['2'], { focused: true })).includes('zoneFocus'));
assert.strictEqual(PanelUI.template({ controls: false, focused: false, cards: [] }).trim(), '');
PanelUI.focused = { zone: '2', height: 300, top: 40, bottom: null };
assert(PanelUI.viewModel(panelUi).zones['2'].focused && !PanelUI.viewModel(panelUi).zones['3'].focused);
PanelUI.resetLayoutState();
assert(!PanelUI.focused && !Object.keys(PanelUI.positions).length && !Object.keys(PanelUI.sizes).length);
boardApp.currentView = 'board';

// TableUI: view model and template
const tableEntry = (id, extra) => Object.assign({ id, lines: [
  { originalIndex: 0, role: 'expression', text: 'E<' + id + '>' },
  { originalIndex: 1, role: 'meaning', text: 'M"' + id },
  { originalIndex: 2, role: 'reading', text: 'R' + id, speakable: true },
  { originalIndex: 3, role: 'weird', text: 'W' + id },
] }, extra);
const tableEntries = [tableEntry(1, { tag: 'geo', reviewLevel: 2, info: 'I<1>' }), tableEntry(2)];
const tableRoles = ['expression', 'meaning', 'reading', 'example', 'example_translation', 'alt_reading', 'info', 'unknown'];
const TableStateStub = {
  roles: tableRoles,
  defaultUi: () => ({ hideOthers: true }),
  uiOf: () => ({ hideOthers: false, zoom: 1.2, hidden: { 2: ['meaning'] } }),
  layout: () => ({ entries: tableEntries, columns: ['expression', 'meaning', 'info', 'unknown'] }),
  isHidden: (ui, id, role) => !!ui.hidden[id]?.includes(role),
  hasContent: (entry, role) => role === 'info' ? !!entry.info
    : entry.lines.some(l => (tableRoles.includes(l.role) ? l.role : 'unknown') === role),
  cellLines: (entry, role) => role === 'info' ? []
    : entry.lines.filter(l => (tableRoles.includes(l.role) ? l.role : 'unknown') === role),
};
const tableApp = { currentView: 'table', currentSource: 'src' };
const TableUI = make('components/table/TableUI.js', 'TableUI', {
  App: tableApp, TableState: TableStateStub, CardUI, Parser: { ENTRY_TAG },
  Library: { hasSource: () => true } });
let tableVm = TableUI.viewModel();
assert.deepStrictEqual(tableVm.columns.map(c => c.label), ['expression', 'meaning', 'info', 'other'], 'columns have titles');
assert.strictEqual(tableVm.zoom, 1.2);
assert.strictEqual(tableVm.hideOthers, false);
assert.deepStrictEqual(tableVm.legend, ['geo'], 'only the tags of the shown rows');
assert(tableVm.rows[1].cells[1].hidden && !tableVm.rows[0].cells[1].hidden, 'hidden comes from the state');
assert(!tableVm.rows[1].cells[2].filled && tableVm.rows[1].cells[2].lines.length === 0, 'a row without info has an empty info cell');
assert.strictEqual(tableVm.rows[0].cells[0].lines[0].reviewLevel, 2, 'the review level marks the first line');
assert.strictEqual(tableVm.rows[0].cells[1].lines[0].reviewLevel, null, 'and only the first line');
let tableHtml = TableUI.template(tableVm);
assert(tableHtml.includes('data-drop-zone="cols"') && tableHtml.includes('data-drop-zone="rows"'), 'zones of columns and rows');
assert(tableHtml.includes('transform:scale(1.2)'), 'zoom is a scale of the table');
assert(tableHtml.includes('>info</div>') && tableHtml.includes('>other</div>'), 'titles are in the heads');
assert(tableHtml.includes('data-drag-id="meaning"') && tableHtml.includes('data-drag-kind="col"'), 'a head is a draggable column');
assert(tableHtml.includes('data-drag-handle=".rowDrag"'), 'a row is dragged by its handle only');
assert.strictEqual((tableHtml.match(/class="tableRemove"/g) || []).length, 2, 'every row has a cross');
assert(tableHtml.includes('tableRemoveHead'), 'the head of the cross column is empty');
assert.strictEqual((tableHtml.match(/cellHidden/g) || []).length, 1, 'one hidden cell');
assert(!/class="[^"]*\bhidden\b/.test(tableHtml.replace('tableView', '')), 'the global .hidden is not used for cells');
assert(tableHtml.includes('E&lt;1&gt;') && !tableHtml.includes('E<1>'), 'text is escaped');
assert(tableHtml.includes('ⓘ&nbsp;I&lt;1&gt;'), 'info is a line with a mark, escaped');
assert(tableHtml.includes('data-reading="R1"') === false, 'a column that is not shown has no reading');
assert(tableHtml.includes('data-tag="geo"') && tableHtml.includes('class="tagsLegend"'), 'tag and legend');
assert(tableHtml.includes('data-review-level="2"'));
assert(/class="cellInner ellipsis"/.test(tableHtml), 'cells are clamped');
TableUI.expandedRows = new Set([1]);
assert(TableUI.template(TableUI.viewModel()).split('cellInner ellipsis').length === TableUI.template(tableVm).split('cellInner ellipsis').length - 4,
  'an expanded row loses the clamp of its four filled cells');
TableUI.expandedRows = new Set();
TableStateStub.uiOf = () => ({ hideOthers: true, zoom: 1, hidden: {} });
assert(!TableUI.template(TableUI.viewModel()).includes('transform'), 'no zoom, no transform');
TableStateStub.layout = () => ({ entries: [], columns: [] });
assert.strictEqual(TableUI.template(TableUI.viewModel()), '', 'no rows, no table');
tableApp.currentView = 'board';
assert.strictEqual(TableUI.viewModel().visible, false);
assert.deepStrictEqual(TableUI.viewModel().rows, [], 'a hidden View reads no domain');
tableApp.currentView = 'board';

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
assert.strictEqual(DragDrop.clampPosition(-5, 40, 300), 0, 'not left of the zone');
assert.strictEqual(DragDrop.clampPosition(100, 40, 300), 100);
assert.strictEqual(DragDrop.clampPosition(290, 40, 300), 260, 'the whole card stays inside');
assert.strictEqual(DragDrop.clampPosition(10, 400, 300), 0, 'a card larger than the zone sticks to its start');
assert.strictEqual(DragDrop.isFree({ dataset: { dropMode: 'free' } }), true);
assert.strictEqual(DragDrop.isFree({ dataset: {} }), false, 'a zone is a flow unless marked');
assert.strictEqual(DragDrop.scrollDelta(10, 0, 300), -DragDrop.scrollStep);
assert.strictEqual(DragDrop.scrollDelta(290, 0, 300), DragDrop.scrollStep);
assert.strictEqual(DragDrop.scrollDelta(150, 0, 300), 0);
assert.strictEqual(DragDrop.scrollDelta(40, 0, 80), 0, 'a small box keeps a middle without scrolling');
assert.strictEqual(DragDrop.scrollDelta(10, 0, 80), -DragDrop.scrollStep);

// DragDrop: rows and columns of a table
const colRects = [box(0, 0, 100, 40), box(100, 0, 220, 40), box(220, 0, 300, 40)];
assert.strictEqual(DragDrop.axisInsertionIndex(colRects, 10, 'x'), 0, 'left half of the first column');
assert.strictEqual(DragDrop.axisInsertionIndex(colRects, 60, 'x'), 1, 'right half: before the next column');
assert.strictEqual(DragDrop.axisInsertionIndex(colRects, 290, 'x'), 3, 'right half of the last: to the end');
assert.strictEqual(DragDrop.axisInsertionIndex([], 5, 'x'), 0);
const rowRects = [box(0, 0, 300, 50), box(0, 50, 300, 110)];
assert.strictEqual(DragDrop.axisInsertionIndex(rowRects, 20, 'y'), 0);
assert.strictEqual(DragDrop.axisInsertionIndex(rowRects, 40, 'y'), 1, 'the lower half goes before the next row');
assert.strictEqual(DragDrop.axisInsertionIndex(rowRects, 100, 'y'), 2, 'below the middle of the last row: to the end');
assert.strictEqual(DragDrop.axisOf({ dataset: { dropMode: 'rows' } }), 'y');
assert.strictEqual(DragDrop.axisOf({ dataset: { dropMode: 'cols' } }), 'x');
assert.strictEqual(DragDrop.axisOf({ dataset: { dropMode: 'free' } }), null, 'other modes are not an axis');
assert.strictEqual(DragDrop.axisOf({ dataset: {} }), null);
assert.strictEqual(DragDrop.accepts({ dataset: {} }, { dataset: { dragKind: 'row' } }), true, 'a zone without a kind takes every card');
assert.strictEqual(DragDrop.accepts({ dataset: { dropAccepts: 'row' } }, { dataset: { dragKind: 'row' } }), true);
assert.strictEqual(DragDrop.accepts({ dataset: { dropAccepts: 'row' } }, { dataset: { dragKind: 'col' } }), false, 'a column is not a row');
const handleCard = { dataset: { dragHandle: '.rowDrag' }, closest: sel => sel === '[data-drag-scope]' ? {} : null };
const viaTarget = (match, card) => ({ closest: sel => sel === '[data-drag-id]' ? card : (sel === '.rowDrag' && match ? {} : null) });
assert.strictEqual(DragDrop.cardAt(viaTarget(true, handleCard)), handleCard, 'a card is taken by its handle');
assert.strictEqual(DragDrop.cardAt(viaTarget(false, handleCard)), null, 'and not by the rest of it');
const plainCard = { dataset: {}, closest: sel => sel === '[data-drag-scope]' ? {} : null };
assert.strictEqual(DragDrop.cardAt(viaTarget(false, plainCard)), plainCard, 'a card without a handle is taken anywhere');

console.log('render-check ok');
