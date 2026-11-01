/*
   EntrySearch: selects entries of the sources by criteria. Pure domain logic;
   no DOM, no storage.

   Criteria: { query, tag, kind }, all combined with "and".
     query - text, without regard to case; looked for in the lines and in the
             info (the comment after the second "::" of a mark)
     tag   - entry.tag
     kind  - what the card is for, guessed from the roles of its lines, like
             the roles themselves. Never stored: it is computed on demand, so
             the heuristics can change without a migration.

   Kinds are not a partition: "with examples" is a criterion of its own and
   does not exclude the others, "reversed" does not mean "without examples".
     reversed - the user wrote the translation first
     reading  - an expression with kanji and its reading, nothing else: the
                user did not forget what it means, but how it is read
     reminder - one line
     regular  - everything that is none of the above
     examples - has a line with the role "example"

   analyze() does everything in one pass: the entries found and, for the
   dropdowns of the UI, how many entries each tag, each kind and each source
   would give with the other criteria applied.
*/
const EntrySearch = {

  ANY_KIND: '',

  KINDS: [
    { value: '', label: 'any kind' },
    { value: 'reversed', label: 'reversed' },
    { value: 'reading', label: 'reading' },
    { value: 'reminder', label: 'reminder' },
    { value: 'regular', label: 'regular' },
    { value: 'examples', label: 'with examples' },
  ],

  // entry -> its text in lower case; the entries of the sources are not replaced while they live.
  haystacks: new WeakMap(),

  isActive(criteria) {
    return !!(criteria.query || criteria.tag
      || (criteria.kind && criteria.kind !== this.ANY_KIND));
  },

  kindFlags(entry) {
    const roles = entry.lines.map(line => line.role);
    const role = Parser.LINE_ROLE;
    const examples = roles.includes(role.example);
    const reversed = !!entry.reversed;
    const reminder = entry.lines.length === 1;
    const reading = !examples
      && !roles.includes(role.meaning)
      && roles[0] === role.expression
      && roles[1] === role.reading
      && Parser.isWithKanji(entry.lines[0].text);
    return {
      reversed,
      reading,
      reminder,
      examples,
      regular: !reversed && !reminder && !reading,
    };
  },

  haystackOf(entry) {
    let text = this.haystacks.get(entry);
    if(text === undefined) {
      text = entry.lines.map(line => line.text).concat(entry.info || '').join('\n').toLowerCase();
      this.haystacks.set(entry, text);
    }
    return text;
  },

  matchesKind(flags, kind) {
    return !kind || kind === this.ANY_KIND || !!flags[kind];
  },

  /*
    sources: [{ sourceId, entries }]; isChosen(sourceId) tells whether the entries
    of a source are taken: the others are only counted in sourceCounts, so that
    the user sees what a source would give before taking it.
    -> { items: [{ sourceId, entry }], tagCounts, kindCounts, sourceCounts }
    Counts of a facet ignore the criterion of that facet itself.
  */
  analyze(sources, criteria, isChosen = () => true) {
    const needle = String(criteria.query || '').toLowerCase();
    const tagCounts = {};
    const kindCounts = {};
    const sourceCounts = {};
    const items = [];
    this.KINDS.forEach(kind => { kindCounts[kind.value] = 0; });

    sources.forEach(({ sourceId, entries }) => {
      sourceCounts[sourceId] = 0;
      const chosen = isChosen(sourceId);
      entries.forEach(entry => {
        const flags = this.kindFlags(entry);
        const textOk = !needle || this.haystackOf(entry).includes(needle);
        const tagOk = !criteria.tag || entry.tag === criteria.tag;
        const kindOk = this.matchesKind(flags, criteria.kind);
        if(!textOk) return;
        if(tagOk && kindOk) sourceCounts[sourceId] += 1;
        if(!chosen) return;
        if(kindOk && entry.tag) tagCounts[entry.tag] = (tagCounts[entry.tag] || 0) + 1;
        if(tagOk) {
          kindCounts[this.ANY_KIND] += 1;
          Object.keys(flags).forEach(kind => { if(flags[kind]) kindCounts[kind] += 1; });
        }
        if(tagOk && kindOk) items.push({ sourceId, entry });
      });
    });
    return { items, tagCounts, kindCounts, sourceCounts };
  },
};
