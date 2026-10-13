// Progress: computes section-level "in progress" marks for the Structure view.
// Domain logic only; StructureUI renders the result without knowing about views.
const Progress = {

  // Returns { sectionId: [viewLetter, ...] } for a source.
  marksBySection(sourceId) {
    const source = Library.getSource(sourceId);
    if(!source) return {};

    const viewStates = App.views[sourceId] || {};
    const result = {};

    Object.keys(viewStates).forEach(viewName => {
      const progress = viewStates[viewName].progress || {};
      Object.keys(progress).forEach(entryIdStr => {
        if(!ReviewSessions.isEntryInProgress(progress[entryIdStr])) return;
        const entry = source.parsed.allEntries.find(e => String(e.id) === entryIdStr);
        if(entry && entry.section != null) {
          if(!result[entry.section]) result[entry.section] = new Set();
          result[entry.section].add(viewName.slice(0, 1).toUpperCase());
        }
      });
    });

    // Convert sets to sorted arrays.
    const out = {};
    Object.keys(result).forEach(sectionId => {
      out[sectionId] = Array.from(result[sectionId]).sort();
    });
    return out;
  },
};
