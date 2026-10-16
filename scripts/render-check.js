// Checks the pure parts (viewModel helpers and template) of SessionsUI and
// StructureUI without a DOM.
const fs = require('fs');
const assert = require('assert');
const load = f => fs.readFileSync(f, 'utf8');
const Components = { push() {} };
const Bus = { events: {} };
const Utils = new Function(`${load('core/Utils.js')}; return Utils;`)();
const make = (file, name) => new Function('Components', 'Bus', 'Utils',
  `${load(file)}; return ${name};`)(Components, Bus, Utils);
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

console.log('render-check ok');
