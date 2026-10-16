// Entry point. Short, explicit startup mirroring KanbanMvd's main.js:
// load data, init events/components, then issue explicit initial renders.
// Afterwards, changes flow through Bus events.
const AppInit = {

  init() {
    App.load();
    Storage.removeUnlistedSources(SOURCES_LIST);
    App.removeUnlistedSources(SOURCES_LIST);
    Library.load();
    Events.init();

    Components.forEach(component => {
      component.init && component.init();
    });

    // Infobar projects the persisted theme onto <body>; render it right away
    // (a microtask, before the first paint) so there is no flash of the other theme.
    InfobarUI.render();

    // Explicit initial renders, wrapped in the preloader so the user sees the
    // indicator while the first (potentially large) render is painted. Busy is
    // begun before PreloaderUI has seen any event, so the indicator appears
    // once the flag is emitted and is hidden from beginAndRun's tail.
    Busy.beginAndRun(() => {
      MenuUI.render();
      StructureUI.render();
      DataViewUI.render();
      SliderUI.render();
    });
  },
};

document.addEventListener('DOMContentLoaded', () => {
  AppInit.init();
});

