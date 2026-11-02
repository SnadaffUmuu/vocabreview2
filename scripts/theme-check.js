/*
  Static check of the color tokens (no browser needed):
  - every token of a palette exists in both the day and the night palette of
    its scheme, in the same order, and in every scheme, so a night palette
    cannot silently keep a day color;
  - every scheme file is listed in domain/Schemes.js and linked in index.html;
  - every var(--x) in the stylesheets is defined somewhere;
  - there are no color literals outside css/themes/ (colors are tokens).

  Usage: node scripts/theme-check.js
*/
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const themesDir = path.join(root, 'css', 'themes');

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('.') || name === 'node_modules' || name === 'assets') continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.css')) out.push(full);
  }
  return out;
}

const strip = text => text.replace(/\/\*[\s\S]*?\*\//g, '');
const rel = f => path.relative(root, f);
let problems = 0;
function report(msg) {
  console.log(msg);
  problems++;
}

/* ---- palettes of every scheme ---- */
const defined = new Set();
const schemes = {};
for (const file of fs.readdirSync(themesDir).filter(f => f.endsWith('.css'))) {
  const text = strip(fs.readFileSync(path.join(themesDir, file), 'utf8'));
  const sets = {};
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(text))) {
    const selector = m[1].trim();
    const names = [...m[2].matchAll(/(--[\w-]+)\s*:/g)].map(x => x[1]);
    sets[selector] = (sets[selector] || []).concat(names);
  }
  const id = file.replace(/\.css$/, '');
  const dayList = sets[`body[data-scheme="${id}"]`] || [];
  const nightList = sets[`body[data-scheme="${id}"].night`] || [];
  const day = new Set(dayList);
  const night = new Set(nightList);
  if (!day.size || !night.size) report(`${file}: needs body[data-scheme="${id}"] and body[data-scheme="${id}"].night`);
  for (const t of day) if (!night.has(t)) report(`${file}: ${t} is in the day palette only`);
  for (const t of night) if (!day.has(t)) report(`${file}: ${t} is in the night palette only`);
  if (dayList.join() !== nightList.join()) report(`${file}: the palettes list their tokens in a different order`);
  day.forEach(t => defined.add(t));
  night.forEach(t => defined.add(t));
  schemes[id] = day;
}
for (const [id, tokens] of Object.entries(schemes)) {
  for (const t of defined) if (!tokens.has(t)) report(`${id}.css: lacks ${t}`);
}
const listed = (fs.readFileSync(path.join(root, 'domain', 'Schemes.js'), 'utf8').match(/id: '[\w-]+'/g) || [])
  .map(x => x.slice(5, -1));
for (const id of Object.keys(schemes)) if (!listed.includes(id)) report(`${id}.css is not listed in domain/Schemes.js`);
for (const id of listed) if (!schemes[id]) report(`${id} is listed in domain/Schemes.js but has no css/themes/${id}.css`);
const linked = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const id of Object.keys(schemes)) if (!linked.includes(`css/themes/${id}.css`)) report(`${id}.css is not linked in index.html`);

/* ---- usages and literals in the rest of the stylesheets ---- */
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(|(?<![\w-])(?:white|black|red|green|blue|gray|grey|orange|yellow|plum|purple|pink)(?![\w-])/;
const sheets = walk(root).filter(f => !f.startsWith(themesDir));
const local = new Set();
const used = [];
for (const file of sheets) {
  const text = strip(fs.readFileSync(file, 'utf8'));
  for (const m of text.matchAll(/(--[\w-]+)\s*:/g)) local.add(m[1]);
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g)) {
      used.push({ file, line: i + 1, name: m[1], hasFallback: !!m[2] });
    }
    // Property names and url() paths are not colors.
    const probe = line.replace(/url\([^)]*\)/g, '').replace(/--[\w-]+/g, '');
    if (COLOR_LITERAL.test(probe)) report(`${rel(file)}:${i + 1}: color literal outside css/themes: ${line.trim()}`);
  });
}
for (const u of used) {
  if (!defined.has(u.name) && !local.has(u.name)) {
    report(`${rel(u.file)}:${u.line}: ${u.name} is not defined`);
  }
}

/* ---- tokens nobody uses ---- */
const usedNames = new Set(used.map(u => u.name));
for (const t of defined) {
  if (!usedNames.has(t)) report(`token ${t} is defined but not used`);
}

if (problems) {
  console.log(`theme-check: ${problems} problem(s)`);
  process.exit(1);
}
console.log(`theme-check: ok (${defined.size} tokens, ${used.length} usages)`);
