// Development-only: compares the v2 Parser against the Version 1 DataFactory
// on the three source files. Run from the vocabreview2 root:
//   node scripts/compare-v1.js
//
// Requires Version 1 to be present at the path referenced in AGENTS.md.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const V1 = '/home/mvd/Documents/MyJsAndStuff/vocabreview';

// ---- globals shared by both parsers --------------------------------------
const regex = {
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
function stringToHash(string) {
  let hash = 0;
  if(string.length == 0) return hash;
  for(let i = 0; i < string.length; i++) {
    const ch = string.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash = hash & hash;
  }
  return hash;
}
function countCharOccurrencesInString(str, ch) {
  let n = 0;
  for(const x of str) if(x === ch) n++;
  return n;
}
global.regex = regex;
global.stringToHash = stringToHash;
global.countCharOccurrencesInString = countCharOccurrencesInString;
global.Utils = { countCharOccurrencesInString };

// ---- load parsers ---------------------------------------------------------
function loadV1Module(file) {
  let src = fs.readFileSync(path.join(V1, 'modules', file), 'utf8');
  src = src.replace(/^import[\s\S]*?from\s*["'][^"']+["'];?/gm, '');
  src = src.replace(/^export\s+/gm, '');
  // Append an assignment exposing the module's export via a global var.
  src += '\nglobalThis.__loadedDataFactory = DataFactory;';
  vm.runInThisContext(src, { filename: file });
}
loadV1Module('data.js');
const DataFactory = globalThis.__loadedDataFactory;

function loadV2Parser() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'domain', 'parser', 'Parser.js'), 'utf8');
  vm.runInThisContext(src, { filename: 'Parser.js' });
}
loadV2Parser();

// ---- helpers --------------------------------------------------------------
function summarize(r) {
  const roles = {};
  r.allEntries.forEach(e => e.lines.forEach(l => { roles[l.role] = (roles[l.role] || 0) + 1; }));
  const tags = [...new Set(r.allEntries.filter(e => e.tag).map(e => e.tag))].sort();
  // section ids (v1 uses hash, v2 uses path) -> compare count + names only
  const structureNames = r.structure.map(n => n.name);
  // walk children too
  const allNames = [];
  (function walk(nodes){ nodes.forEach(n => { allNames.push(n.name); if(n.children) walk(n.children); }); })(r.structure);
  return {
    entries: r.allEntries.length,
    roots: r.structure.length,
    allNames: allNames.sort(),
    roles,
    tags,
    exclEntries: (r.excludedEntries || []).length,
    exclLines: (r.excludedLines || []).length,
  };
}

// ---- run ------------------------------------------------------------------
const VOCAB2 = path.join(__dirname, '..', 'vocab');
const files = ['goshogun2', 'osarai-house', 'SR_secret'];

let allMatch = true;
for(const id of files) {
  const raw2 = fs.readFileSync(path.join(VOCAB2, id + '.txt'), 'utf8');
  const raw1 = fs.readFileSync(path.join(V1, 'vocab', id + '.txt'), 'utf8');

  const v2 = summarize(Parser.parse(raw2));
  const v1 = summarize(DataFactory.parse(raw1));

  const match = JSON.stringify(v2) === JSON.stringify(v1);
  allMatch = allMatch && match;
  console.log('--- ' + id + ' --- ' + (match ? 'MATCH' : 'DIFFER'));
  if(!match) {
    console.log('  v1:', JSON.stringify(v1));
    console.log('  v2:', JSON.stringify(v2));
  }
}
console.log(allMatch ? '\nALL MATCH' : '\nSOME DIFFER');
