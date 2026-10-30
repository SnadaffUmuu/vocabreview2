/*
  Cards: pure rules for the sides (lines) of a card, shared by the Views that
  show an entry as a card (Slider, Board). No DOM, no storage, no state: the
  caller owns the resolved side order, because a random order must be created
  once and then reused.
*/
const Cards = {

  readingOf(entry) {
    return entry.lines.find(line => line.role === Parser.LINE_ROLE.reading);
  },

  // The reading line is not a side: it is shown separately.
  sideLines(entry) {
    const reading = this.readingOf(entry);
    return entry.lines.filter(line => line !== reading);
  },

  // The side shown on a card: the saved one if the card still has it, else the first.
  currentSide(order, saved) {
    if(order.some(line => line.originalIndex === saved)) return saved;
    return order.length ? order[0].originalIndex : null;
  },

  nextSideIndex(indexes, current) {
    const position = Math.max(0, indexes.indexOf(current));
    return indexes[(position + 1) % indexes.length];
  },

  prevSideIndex(indexes, current) {
    const position = Math.max(0, indexes.indexOf(current));
    return indexes[(position - 1 + indexes.length) % indexes.length];
  },

  // Sides in the order of a card mode. A saved side means the order was already
  // chosen once: keep the original order so the saved side stays meaningful.
  orderLines(lines, mode, savedSide) {
    if(savedSide != null && lines.some(l => l.originalIndex === savedSide)) return lines.slice();
    if(mode === 'random') return Utils.shuffle(lines);
    const order = Parser.lineOrders?.[mode];
    if(!order) return lines.slice();

    if(mode === 'example_translation') {
      const translations = Utils.shuffle(lines.filter(line =>
        line.role === 'example_translation'));
      const paired = [];
      translations.forEach(translation => {
        paired.push(translation);
        const example = lines.find(line =>
          line.translationLineIndex === translation.originalIndex);
        if(example) paired.push(example);
      });
      return order.flatMap(role => {
        if(role === 'example_translation') return paired;
        if(role === 'example') {
          return Utils.shuffle(lines.filter(line =>
            line.role === role && !paired.includes(line)));
        }
        return lines.filter(line => line.role === role);
      });
    }

    return order.flatMap(role => {
      const group = lines.filter(line => line.role === role);
      return ['example', 'example_translation'].includes(role) ? Utils.shuffle(group) : group;
    });
  },
};
