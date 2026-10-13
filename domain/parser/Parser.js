// Parser: pure domain logic. parse(rawText) -> { title, sourceName, structure,
// allEntries, excludedEntries, excludedLines }. No DOM, no storage, no net.
//
// Faithful port of Version 1's DataFactory.parse, with a few clarifications:
//   - BOM is stripped before parsing (v1 silently left it glued to the first line).
//   - File header (title / ::source:: / ====) is recognized explicitly.
//   - entry.id is the positional index (0-based) in the file.
//   - section.id is the structural path ("0", "0.1", ...), not a hash.
const Parser = {

  LINE_ROLE: {
    expression: 'expression',
    reading: 'reading',
    meaning: 'meaning',
    alt_reading: 'alt_reading',
    example: 'example',
    example_translation: 'example_translation',
    info: 'info',
    unknown: 'unknown',
  },

  ENTRY_TAG: {
    grammar: 'grammar',
    onomatopoeia: 'onomatopoeia',
    geo: 'geo',
    name: 'name',
    term: 'term',
    yojijukugo: 'yojijukugo',
    pattern: 'pattern',
    counter: 'counter',
    suffix: 'suffix',
    dialect: 'dialect',
    katakana: 'katakana',
  },

  lineOrders: {
    expression: ['expression', 'alt_reading', 'example', 'meaning', 'example_translation', 'reading', 'unknown'],
    meaning: ['meaning', 'expression', 'alt_reading', 'example_translation', 'example', 'reading', 'unknown'],
    example: ['example', 'expression', 'alt_reading', 'meaning', 'example_translation', 'reading', 'unknown'],
    example_translation: ['example_translation', 'meaning', 'example', 'expression', 'alt_reading', 'reading', 'unknown'],
  },

  kanaExcl: ['〜', '！', '、', ',', ' '],

  toReplace: ['🎵', '    ♪', '✔', '♦'],

  reviewLevelMarks: ['▲', '*'],

  nonEntrySymbols: ['==', '~~', '・・・'],

  // ---- character classification -------------------------------------------------

  isJapaneseOnly(l) { return regex.japaneseOnly.test(l); },
  isMixed(l) { return regex.mixed.test(l); },
  isKanaOnly(l) { return regex.kanaOnly.test(l); },
  isHiraganaOnly(l) { return regex.hiraganaOnly.test(l); },
  isKatakanaOnly(l) { return regex.katakanaOnly.test(l); },
  isNonJapanese(l) { return regex.nonJapanese.test(l); },

  isWithKanji(l) {
    return (regex.japaneseOnly.test(l)
      || regex.mixed.test(l) && this.isJapaneseWithEigaChars(l))
      && Array.from(l).some(ch => regex.hasKanji.test(ch));
  },

  isNotJapaneseOnly(l) {
    return regex.nonJapanese.test(l)
      || regex.mixed.test(l) && !this.isJapaneseWithEigaChars(l);
  },

  isJapaneseWithEigaChars(l) {
    const jaChars = Array.from(l).filter(ch =>
      this.isJapaneseOnly(ch) && !regex.nonChars.test(ch));
    const nonJaChars = Array.from(l).filter(ch =>
      this.isNonJapanese(ch) && !regex.nonChars.test(ch));
    return jaChars.length && nonJaChars.length <= 3;
  },

  // ---- block filters -------------------------------------------------------------

  entryFilter(entryStr) {
    return !entryStr.startsWith('[')
      && !this.nonEntrySymbols.find(s => entryStr.indexOf(s) >= 0);
  },

  linesFilter(l) {
    return !l.startsWith('?')
      && !l.startsWith('？')
      && !l.startsWith('::')
      && l.trim().split('\n').join('').length;
  },

  // Header is everything up to (and including) a leading ==== divider.
  _splitHeader(text) {
    let title = '';
    let sourceName = '';
    const lines = text.split('\n');

    if(lines[0] && !lines[0].startsWith('::source::') && !/^=+$/.test(lines[0].trim())) {
      title = lines[0].trim();
    }

    const sourceLine = lines.find(l => l.startsWith('::source::'));
    if(sourceLine) {
      sourceName = sourceLine.replace('::source::', '').trim();
    }

    let cutIdx = -1;
    for(let i = 0; i < lines.length; i++) {
      if(/^=+$/.test(lines[i].trim())) { cutIdx = i; break; }
    }
    const body = cutIdx >= 0 ? lines.slice(cutIdx + 1).join('\n') : text;
    return { title, sourceName, body };
  },

  // ---- top-level parse ------------------------------------------------------------

  // Top-level entry point. Splits the body into double-newline blocks, builds
  // the structure tree and a flat list of entries.
  parse(rawText) {
    const text = rawText.replace(/^\uFEFF/, '');
    const { title, sourceName, body } = this._splitHeader(text);

    const blocks = body.split('\n\n');

    const structure = [];
    const entries = [];
    const excludedEntries = [];
    const excludedLines = [];
    let entriesCounter = 0;
    let upper = null;           // current upper section (~~~~ blocks)
    let currentSection = null;  // current page-level section ([NN])

    blocks.forEach(block => {
      const entry = block.trim();
      if(!entry) return;

      if(entry.indexOf('~~') > -1) {
        const node = this._parseUpperSection(entry, structure, upper);
        if(node) { structure.push(node); upper = node; currentSection = null; }
        return;
      }

      if(entry.startsWith('[')) {
        const node = this._parseSection(entry, structure, upper);
        if(node) currentSection = node;
        return;
      }

      if(!this.entryFilter(entry)) {
        excludedEntries.push(entry);
        return;
      }

      const resEntry = this._parseEntry(entry, entriesCounter++, currentSection, upper, excludedLines);
      if(resEntry) entries.push(resEntry);
    });

    const result = {
      title: title || sourceName || '',
      sourceName,
      structure,
      allEntries: entries,
    };
    if(excludedEntries.length) result.excludedEntries = excludedEntries;
    if(excludedLines.length) result.excludedLines = excludedLines;
    return result;
  },

  _parseUpperSection(entry, structure, upper) {
    const m = entry.match(/\n(.*)\n/s);
    if(!m) return null;
    const name = m[1].trim();
    const idx = structure.length;
    return { id: String(idx), name, index: idx };
  },

  _parseSection(entry, structure, upper) {
    const m = entry.match(/^\[(.*?)\](.*)?$/);
    if(!m) return null;
    const name = ((m[1] || '') + (m[2] || '')).trim();
    let parent = null;
    let index;
    if(upper) {
      parent = upper;
      index = parent.children ? parent.children.length : 0;
    } else {
      index = structure.length;
    }
    const id = parent ? parent.id + '.' + index : String(index);
    const node = { id, name, index };
    if(parent) {
      node.parentId = parent.id;
      if(parent.children) parent.children.push(node);
      else parent.children = [node];
    } else {
      structure.push(node);
    }
    return node;
  },

  _parseEntry(block, id, currentSection, upper, excludedLines) {
    const resEntry = {
      id,
      originalIndex: id,
    };
    if(currentSection) {
      resEntry.section = currentSection.id;
    } else if(upper) {
      resEntry.section = upper.id;
    }

    let replaced = block;
    this.toReplace.forEach(s => { replaced = replaced.split(s).join(''); });

    const originalLines = replaced.split('\n');
    const filteredLines = [];

    originalLines.forEach(l => {
      const lineText = l.trim();

      if(lineText.startsWith('::')) {
        let tag = null;
        const parts = lineText.split('::');
        if(parts.length > 2) {
          if(!lineText.startsWith('::diff')) tag = parts[1];
          resEntry.info = parts[2];
        } else {
          if(parts[1] && parts[1].startsWith('onomat')) tag = 'onomatopoeia';
          else tag = parts[1];
        }
        if(tag) resEntry.tag = tag.trim();
      } else {
        if(this.linesFilter(lineText)) {
          let text = lineText;
          if(this.reviewLevelMarks.some(m => text.endsWith(m))) {
            const triangle = this.reviewLevelMarks[0];
            const asterisk = this.reviewLevelMarks[1];
            if(text.endsWith(triangle)) {
              const n = Utils.countCharOccurrencesInString(text, triangle);
              resEntry.reviewLevel = n + '00';
            } else if(text.endsWith(asterisk)) {
              const n = Utils.countCharOccurrencesInString(text, asterisk);
              resEntry.reviewLevel = String(n);
            }
            text = this.reviewLevelMarks.reduce((t, m) => t.split(m).join('').trim(), text);
          }
          filteredLines.push(text);
        } else if(lineText.split('\n').join('').trim().length) {
          excludedLines.push(lineText);
        }
      }
    });

    if(!filteredLines.length) return null;

    resEntry.lines = filteredLines.map((text, i) => {
      const isCompact = this.isNotJapaneseOnly(text);
      const isSpeakable = this.isJapaneseOnly(text)
        || this.isJapaneseWithEigaChars(text);
      return { text, originalIndex: i, speakable: isSpeakable, isCompact };
    });
    this.setLineRoles(resEntry);
    return resEntry;
  },

  // ---- line role assignment -------------------------------------------------------

  // Ported verbatim from Version 1's DataFactory.setLineRoles. Classifies each
  // line of an entry into a LINE_ROLE using heuristics over the character set.
  setLineRoles(entry) {
    const lRoles = this.LINE_ROLE;
    const lines = entry.lines;
    const inBracketsRegexp = new RegExp(/^\(.*\)$/);

    const meanings = [];

    const firstNotJpOnly = lines.find(l =>
      this.isNotJapaneseOnly(l.text));

    const lineThatStartsWithEqual = lines.find(l =>
      Array.from('=＝').some(ch => l.text.startsWith(ch)));

    if(lineThatStartsWithEqual) {
      lineThatStartsWithEqual.role = lRoles.meaning;
      lineThatStartsWithEqual.theSameAs = true;
      meanings.push(lineThatStartsWithEqual);

      const altMeaning = [
        lines[lineThatStartsWithEqual.originalIndex + 1],
        lines[lineThatStartsWithEqual.originalIndex - 1],
      ].find(l =>
        l && this.isNotJapaneseOnly(l.text)
        && !inBracketsRegexp.test(l.text));

      if(altMeaning) {
        altMeaning.role = lRoles.meaning;
        meanings.push(altMeaning);
      }
    }

    // If the first is non-Japanese, it is a reversal and is always a meaning;
    // the next line is always the expression.
    if(this.isNotJapaneseOnly(lines[0].text)) {
      lines[0].role = lRoles.meaning;
      lines[1].role = lRoles.expression;
      entry.reversed = true;
      meanings.push(lines[0]);
    } else {
      // Otherwise the first line is always the expression.
      lines[0].role = lRoles.expression;
      // First non-Japanese line is the meaning, if no "=" case was hit.
      if(!meanings.length && firstNotJpOnly
        && !inBracketsRegexp.test(firstNotJpOnly.text)) {
        firstNotJpOnly.role = lRoles.meaning;
        meanings.push(firstNotJpOnly);
      }
    }

    let lReading = null;
    const firstHiraganaOnlyLine = lines.filter(l => !l.role).find(l =>
      this.isHiraganaOnly(l.text));
    const linesWithKanji = lines.filter(l => this.isWithKanji(l.text));

    if(firstHiraganaOnlyLine && linesWithKanji.length > 0) {
      if(
        firstHiraganaOnlyLine.originalIndex > 0
        && !lines[0].text.startsWith('〜')
      ) {
        lReading = firstHiraganaOnlyLine;
      } else if(
        lines[0].text.startsWith('〜')
        && this.isWithKanji(lines[0].text)
        && firstHiraganaOnlyLine.originalIndex == 1
      ) {
        lReading = firstHiraganaOnlyLine;
      }
    }
    if(lReading) {
      lReading.role = lRoles.reading;
    }

    let infoRoleLine = null;

    lines.filter(l => !l.role).forEach(l => {
      const prevLine = lines[l.originalIndex - 1];
      if(prevLine && prevLine.role && prevLine.role !== lRoles.example
        && this.isNotJapaneseOnly(l.text)) {
        // Previous line has a role and this one is a following non-Japanese
        // line, i.e. an explanation.
        if(entry.info) {
          entry.info = entry.info + '\n' + l.text;
        } else {
          entry.info = l.text;
          infoRoleLine = l;
        }
      } else if((this.isJapaneseOnly(l.text)
        || this.isJapaneseWithEigaChars(l.text)
      ) && !Array.from('(=＝').some(ch => l.text.startsWith(ch))) {
        l.role = lRoles.example;
      } else if(prevLine && prevLine.role && prevLine.role == lRoles.example
        && this.isNotJapaneseOnly(l.text)) {
        l.role = lRoles.example_translation;
        prevLine.translationLineIndex = l.originalIndex;
      }
    });

    if(infoRoleLine) {
      lines.splice(lines.indexOf(infoRoleLine), 1);
    }

    lines.filter(l => !l.role).forEach(l => {
      if(this.isJapaneseOnly(l.text) && inBracketsRegexp.test(l.text)) {
        l.role = lRoles.alt_reading;
      }
    });

    lines.filter(l => !l.role).forEach(l =>
      l.role = lRoles.unknown);
  },
};
