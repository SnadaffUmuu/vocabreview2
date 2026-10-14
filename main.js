// Entry point. Short, explicit startup mirroring KanbanMvd's main.js:
// load data, init events/components, then issue explicit initial renders.
// Afterwards, changes flow through Bus events.
const AppInit = {

  init() {
    App.load();
    Library.load();
    Events.init();

    Components.forEach(component => {
      component.init && component.init();
    });

    // Apply persisted night mode.
    if(App.night) {
      document.body.classList.add('night');
    }

    // Explicit initial renders.
    MenuUI.render();
    InfobarUI.render();
    StructureUI.render();
    DataViewUI.render();
    SliderUI.render();
  },
};

document.addEventListener('DOMContentLoaded', () => {
  AppInit.init();
});

