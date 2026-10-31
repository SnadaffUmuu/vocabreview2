/*
   Checks DropdownUI markup generation and escaping (no DOM needed).
*/
const fs = require('fs');
const assert = require('assert');
const load = f => fs.readFileSync(f, 'utf8');
const Components = { push() {} };
const Bus = { events: {} };
const Utils = new Function(`${load('core/Utils.js')}; return Utils;`)();
const DropdownUI = new Function('Components', 'Bus', 'Utils',
  `${load('components/dropdown/DropdownUI.js')}; return DropdownUI;`)(Components, Bus, Utils);

const select = DropdownUI.select({
  id: 'x', placeholder: 'p<b>',
  items: [{ value: 'a"b', label: '<i>' }, { value: 'c', disabled: true }],
});
assert(!select.includes('<b>') && !select.includes('<i>'));
assert(select.includes('data-value="a&quot;b"'));
assert(select.includes('dropdown-item disabled" data-value="c">c<'));

const burger = DropdownUI.burger({ id: 'y', items: [{ value: 'z', label: 'Z' }] });
assert(burger.includes('burger-button') && burger.includes('id="y"'));

// setItems rewrites only the list of items of an existing dropdown.
let written = null;
global.document = { getElementById: id => id === 'y'
  ? { querySelector: () => ({ set innerHTML(html) { written = html; } }) } : null };
DropdownUI.setItems('y', [{ value: 'a"b', label: '<i>' }]);
assert(written.includes('data-value="a&quot;b"') && !written.includes('<i>'));
written = null;
DropdownUI.setItems('missing', []);
assert.strictEqual(written, null, 'an unknown dropdown is ignored');
delete global.document;
console.log('dropdown-check ok');
