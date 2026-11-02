/*
  Compares the resolved colors of the working tree with those of a git ref
  (default: master), separately for day and night. Every var() chain is
  followed to its final value, so renaming or regrouping color tokens must
  leave every rule with exactly the same value in both modes.

  Usage: node scripts/theme-compare.js [ref]

  Limits: this is a check of CSS values, not of what a browser draws.
  Variables set locally by a component (e.g. --cardBg) are not resolved, only
  their fallbacks and their own values are.
*/
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ref = process.argv[2] || 'master';
const root = path.join(__dirname, '..');
/* The scheme compared is the default one: before schemes existed its palettes were :root and body.night. */
const PALETTE_SELECTORS = {
  day: [':root', 'body[data-scheme="default"]'],
  night: ['body.night', 'body[data-scheme="default"].night'],
};

function git(cmd) {
  return execSync(`git ${cmd}`, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
}

function cssFilesOfRef() {
  return git(`ls-tree -r --name-only ${ref}`).split('\n')
    .filter(f => f.endsWith('.css'));
}

function cssFilesOfTree() {
  return git('ls-files --cached --others --exclude-standard').split('\n')
    .filter(f => f.endsWith('.css') && fs.existsSync(path.join(root, f)));
}

/* Rules as [{ selector, decls: [[prop, value]] }]; at-rules with a body are entered, keyframes skipped. */
function parseCss(text) {
  const src = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@import[^;]*;/g, '');
  const rules = [];
  let pos = 0;

  function readBlock(prefix) {
    while (pos < src.length) {
      const open = src.indexOf('{', pos);
      const close = src.indexOf('}', pos);
      if (open === -1 || (close !== -1 && close < open)) {
        pos = close === -1 ? src.length : close + 1;
        return;
      }
      const selector = src.slice(pos, open).trim().replace(/\s+/g, ' ');
      pos = open + 1;
      if (selector.startsWith('@keyframes')) {
        skipBlock();
      } else if (selector.startsWith('@')) {
        readBlock(`${prefix}${selector} `);
      } else {
        const end = src.indexOf('}', pos);
        rules.push({ selector: prefix + selector, decls: parseDecls(src.slice(pos, end)) });
        pos = end + 1;
      }
    }
  }

  function skipBlock() {
    let depth = 1;
    while (depth && pos < src.length) {
      const ch = src[pos++];
      if (ch === '{') depth++;
      if (ch === '}') depth--;
    }
  }

  readBlock('');
  return rules;
}

function parseDecls(body) {
  const decls = [];
  let depth = 0;
  let cur = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ';' && depth === 0) {
      decls.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  decls.push(cur);
  return decls
    .map(d => d.trim())
    .filter(Boolean)
    .map(d => {
      const i = d.indexOf(':');
      return [d.slice(0, i).trim(), d.slice(i + 1).trim()];
    });
}

function normalize(value) {
  return value.toLowerCase().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',').trim();
}

/* Replaces var() calls from the innermost out. */
function resolve(value, vars, depth = 0) {
  if (depth > 20) throw new Error(`var() cycle in: ${value}`);
  const re = /var\(\s*(--[\w-]+)\s*(?:,((?:[^()]|\([^()]*\))*))?\)/;
  let out = value;
  let m;
  while ((m = re.exec(out))) {
    const [whole, name, fallback] = m;
    let replacement;
    if (vars[name] !== undefined) {
      replacement = resolve(vars[name], vars, depth + 1);
    } else if (fallback !== undefined) {
      replacement = `var(${name},${resolve(fallback.trim(), vars, depth + 1)})`;
    } else {
      replacement = `var(${name})`;
    }
    // Marks an unresolved call so that the loop does not meet it again.
    out = out.replace(whole, replacement.replace(/var\(/g, 'var\u0000('));
  }
  return out.replace(/var\u0000\(/g, 'var(');
}

function collect(files, readFile) {
  const palettes = { day: {}, night: {} };
  const items = [];
  for (const file of files) {
    for (const rule of parseCss(readFile(file))) {
      const mode = Object.keys(PALETTE_SELECTORS).find(m => PALETTE_SELECTORS[m].includes(rule.selector));
      if (/^body\[data-scheme=/.test(rule.selector) && !mode) continue; // another scheme
      if (mode) {
        for (const [prop, value] of rule.decls) {
          if (prop.startsWith('--')) palettes[mode][prop] = value;
        }
      } else {
        items.push({ file, rule });
      }
    }
  }
  // A night palette overrides the day one; what it does not set stays as in the day.
  palettes.night = { ...palettes.day, ...palettes.night };
  return { palettes, items };
}

function resolvedMap(tree, mode) {
  const map = new Map();
  const counts = new Map();
  for (const { file, rule } of tree.items) {
    for (const [prop, value] of rule.decls) {
      const base = `${file} | ${rule.selector} | ${prop}`;
      const n = (counts.get(base) || 0) + 1;
      counts.set(base, n);
      map.set(`${base} #${n}`, normalize(resolve(value, tree.palettes[mode])));
    }
  }
  return map;
}

const oldTree = collect(cssFilesOfRef(), f => git(`show ${ref}:${f}`));
const newTree = collect(cssFilesOfTree(), f => fs.readFileSync(path.join(root, f), 'utf8'));

let problems = 0;
for (const mode of ['day', 'night']) {
  const before = resolvedMap(oldTree, mode);
  const after = resolvedMap(newTree, mode);
  for (const [key, value] of before) {
    if (!after.has(key)) {
      console.log(`[${mode}] MISSING  ${key}\n    was: ${value}`);
      problems++;
    } else if (after.get(key) !== value) {
      console.log(`[${mode}] CHANGED  ${key}\n    was: ${value}\n    now: ${after.get(key)}`);
      problems++;
    }
  }
  for (const [key, value] of after) {
    if (!before.has(key)) {
      console.log(`[${mode}] ADDED    ${key}\n    now: ${value}`);
      problems++;
    }
  }
  console.log(`${mode}: ${before.size} declarations compared`);
}

if (problems) {
  console.log(`theme-compare: ${problems} difference(s) against ${ref}`);
  process.exit(1);
}
console.log(`theme-compare: no differences against ${ref}`);
