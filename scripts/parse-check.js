// Development-only harness: runs the v2 parser over the three source files and
// prints a compact summary. Run with: node scripts/parse-check.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Load globals: regex and Utils (countCharOccurrencesInString) come from the
// browser build; reproduce them here for the Node harness.
global.regex = {
  hasKanji: /[\p{Script=Han}]+/u,
  kanaOnly: /^[\p{Script=Hiragana}\p{Script=Katakana}\p{N}\p{P}\s\p{S}\p{Z}ー]+$/u,
  hiraganaOnly: /^[\p{Script=Hiragana}\p{N}\p{P}\s\p{S}\p{Z}ー]+$/u,
  katakanaOnly: /^[\p{Script=Katakana}\p{N}\p{P}\s\p{S}\p{Z}ー]+$/u,
  nonJapanese: /^[\p{Script=Cyrillic}\p{Script=Latin}\p{N}\p{P}\s\p{S}\p{Z}ー]+$/u,
  japaneseOnly: /^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\p{N}\p{P}\s\p{S}\p{Z}ー]+$/u,
  mixed: /^(?=.*[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}])(?=.*[\p{Script=Latin}\p{Script=Cyrillic}])[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\p{Script=Latin}\p{Script=Cyrillic}\p{N}\p{P}\s\p{S}\p{Z}ー]+$/u,
  nonChars: /[\p{N}\p{P}\s\p{S}\p{Z}ー]+/u,
  upperSectionTitle: /~~\n(.*)\n~~/u,
  pageLevelSection: /\[(.*)\]((.*))?/u,
};
global.Utils = {
  countCharOccurrencesInString(s, c) {
    let n = 0;
    for(const x of s) if(x === c) n++;
    return n;
  },
};

const Regex = global.regex;

// Evaluate the parser file in the global context so `const Parser` is exposed
// (mirrors how a classic <script> shares the global scope in the browser).
const parserSrc = fs.readFileSync(path.join(__dirname, '..', 'domain', 'parser', 'Parser.js'), 'utf8');
vm.runInThisContext(parserSrc, { filename: 'Parser.js' });

const vocabDir = path.join(__dirname, '..', 'vocab');
const files = ['goshogun2', 'osarai-house', 'SR_secret'];

for(const id of files) {
  const raw = fs.readFileSync(path.join(vocabDir, id + '.txt'), 'utf8');
  const r = Parser.parse(raw);
  console.log('=== ' + id + '  title=' + JSON.stringify(r.title) + '  source=' + r.sourceName);
  console.log('  entries: ' + r.allEntries.length
    + '  structure roots: ' + r.structure.length
    + '  excludedEntries: ' + (r.excludedEntries || []).length
    + '  excludedLines: ' + (r.excludedLines || []).length);
  console.log('  structure: ' + JSON.stringify(r.structure.map(n => ({
    id: n.id, name: n.name,
    children: n.children && n.children.map(c => c.id),
  }))));
  // Role distribution across all entries.
  const roleCount = {};
  r.allEntries.forEach(e => e.lines.forEach(l => {
    roleCount[l.role] = (roleCount[l.role] || 0) + 1;
  }));
  console.log('  roles: ' + JSON.stringify(roleCount));
  const tags = [...new Set(r.allEntries.filter(e => e.tag).map(e => e.tag))];
  if(tags.length) console.log('  tags: ' + JSON.stringify(tags));
}
