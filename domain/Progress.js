/*
  Progress: read-only domain queries over saved view progress. Used by
  StructureUI (section marks) and SessionsUI (list of sources in progress).
  It knows nothing about the shape of a view's progress: that is asked from
  ViewState.isEntryInProgress(viewName, item).
*/
const Progress = {

  // View names that have at least one entry with real progress for a source.
  viewsInProgress(sourceId) {
    const viewStates = App.views[sourceId] || {};
    return Object.keys(viewStates).filter(viewName => {
      const progress = viewStates[viewName].progress || {};
      return Object.keys(progress).some(entryId =>
        ViewState.isEntryInProgress(viewName, progress[entryId]));
    });
  },

  // [{ sourceId, label, views: [{ name, label }] }] for loaded sources and
  // lists that have a view in progress. Backs the sessions dialog.
  activeSessions() {
    const result = [];
    Object.keys(App.views).forEach(sourceId => {
      if(!Library.hasSource(sourceId)) return;
      const views = this.viewsInProgress(sourceId)
        .map(name => ({ name, label: ViewState.labelOf(name) }))
        .sort((a, b) => a.label.localeCompare(b.label));
      if(views.length) result.push({ sourceId, label: Library.labelOf(sourceId), views });
    });
    return result;
  },

  // Returns { sectionId: [viewLabel, ...] } for a source.
  marksBySection(sourceId) {
    const source = Library.getSource(sourceId);
    if(!source) return {};

    const sectionByEntry = {};
    source.parsed.allEntries.forEach(entry => {
      sectionByEntry[entry.id] = entry.section;
    });

    const viewStates = App.views[sourceId] || {};
    const result = {};

    Object.keys(viewStates).forEach(viewName => {
      const progress = viewStates[viewName].progress || {};
      const label = ViewState.labelOf(viewName);
      Object.keys(progress).forEach(entryId => {
        if(!ViewState.isEntryInProgress(viewName, progress[entryId])) return;
        const section = sectionByEntry[entryId];
        if(section == null) return;
        if(!result[section]) result[section] = new Set();
        result[section].add(label);
      });
    });

    const out = {};
    Object.keys(result).forEach(sectionId => {
      out[sectionId] = Array.from(result[sectionId]).sort();
    });
    return out;
  },
};
