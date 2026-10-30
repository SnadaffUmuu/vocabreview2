/*
   Components: a global registry of every component object.
   Each component registers itself at the end of its own file with
   Components.push(MyComponent); there is no central list to maintain.
*/
const Components = {
  list: [],

  push(component) {
    this.list.push(component);
  },

  forEach(fn) {
    this.list.forEach(fn);
  },
};
