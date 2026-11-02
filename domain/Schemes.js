/*
  Schemes: the color schemes the user can choose from. A scheme is a file
  css/themes/<id>.css with a day and a night palette; this list only names them,
  so a scheme must be added in both places (and linked in index.html).
  Day/night is a separate setting (App.night) and works inside any scheme.
  No DOM.
*/
const Schemes = {

  DEFAULT: 'default',

  list: [
    { id: 'default', label: 'Wine' },
    { id: 'forest', label: 'Forest' },
    { id: 'newsprint', label: 'Newsprint' },
  ],

  has(id) {
    return this.list.some(scheme => scheme.id === id);
  },

  // A stored id may be unknown: an import from another version, a scheme removed later.
  resolve(id) {
    return this.has(id) ? id : this.DEFAULT;
  },

  // Items for a Prompt choice.
  choices() {
    return this.list.map(scheme => ({ value: scheme.id, label: scheme.label }));
  },
};
