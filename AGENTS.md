# Vocab Review App

## Project References

### KanbanMvd — architectural reference
`/home/mvd/AndroidStudioProjects/KanbanMvd/app/src/main/assets`

Use this project as a reference for separating domain logic from UI. Reuse relevant architectural patterns, not domain-specific implementation.

### Version 1 — functional reference
`/home/mvd/Documents/MyJsAndStuff/vocabreview`

Version 2 is a rewrite of Version 1 from scratch. Preserve the useful functionality listed below, but do not carry over obsolete features or legacy conventions.

## Project Overview

A mobile-only web application for reviewing Japanese vocabulary collected in user-maintained text files.

- Native HTML, CSS and JavaScript; no frameworks, ES modules or build step.
- Loaded in a browser through a local HTTP server.
- Source files are edited externally. Their syntax conventions are deliberately permissive; parsing combines explicit rules and heuristics.
- Users select sources and scopes (chapters or sections), then review vocabulary through independent Views, such as sliders, tables, cards on boards and cards on panels.
- Persisted data: raw source text, custom lists, per-source selections, per-view progress and UI state, and application settings. Parsed results are rebuilt in memory, not persisted.
- Storage access is isolated from UI components.

## Version 2: Functionality preserved from Version 1

- Existing visual design and color scheme where appropriate.
- Importing and parsing user-maintained text files.
- Browsing the resulting library, selecting sources and scopes, and switching between Views.
- Starting a learning session and resuming from previously saved progress.
- Reloading a source after its contents change, with the appropriate reset behavior.
- Simple development workflow: no build step, straightforward browser debugging.
- File-first workflow: users edit source files freely outside the application.

## Version 1: Features Not to Reintroduce

- Lapse tracking in Board and Panel Views.
- Global vocabulary pool; planned custom collections replace it.
- Matching View.
- Built-in tests and editor in DataView.

Do not preserve legacy features or conventions merely for compatibility with Version 1.

## Architecture and Implementation Rules

### Technologies

- Use native HTML, CSS and JavaScript.
- Use classic `<script src>` loading only. No ES modules, frameworks or build tools.
- Third-party libraries, when needed, belong in the `assets` directory.

### Components and Communication

- Separate domain logic from UI, following the relevant architecture of KanbanMvd.
- Components do not call each other directly or manipulate each other's markup.
- Components communicate through events dispatched by Bus.
- Each component owns its rendering and markup.
- Declarative DOM composition is allowed: a child component may mount its root into a stable layout container owned by a parent, provided the parent is initialized first.
- Direct DOM manipulation is reserved for drag-and-drop effects.
- Each JavaScript file exposes one global `const` as its public entry point; keep implementation details scoped within it.
- Component CSS lives next to the component. The shared component stylesheet contains imports only.
- Confirmations and user-facing messages go through the `Prompt` domain object (`ask`/`notify`) rendered by PromptUI; never use system `confirm()`/`alert()`. Prompt callbacks run synchronously (not via Bus) so follow-ups keep the user gesture, e.g. opening a file picker.
- Producers mark only user-perceived waits as busy (source load/reload, startup render, selection change, View switch); do not wrap trivial or purely internal work.

### Component Rendering

A component renders a snapshot of its state into markup. `render()` must be idempotent: given the same state it must produce the same DOM, and it must never read the current DOM to decide what to draw.

#### Structure

`ensureMarkup()` mounts only the stable shell: the root element, containers that need CSS transitions, and elements whose presence does not change. Everything that depends on state is written by `render()` unconditionally, every time — `classList.toggle(cls, bool)`, `setAttribute` and `removeAttribute` by condition, `textContent`. If a class or attribute can appear under one condition and disappear under another, `render()` must handle both branches. “Forgot to remove the attribute” is not a valid state.

#### Dynamic regions

Lists, trees, slides, tables and similar repeatable regions are built by a pure `template(viewModel)` function that returns an HTML string, written into a container via `innerHTML`. After that the region is not patched piece by piece. One fragment has exactly one source of markup; the same snippet is not built in two different methods.

`viewModel()` derives a plain object from domain/App state and component state; it is the single place where a component reads the domain. `template()` receives that object and knows nothing about Bus, domain or App; it may use `Utils.escapeHtml` and sub-templates. This makes `viewModel` helpers and `template` testable with Node scripts without a browser (see `scripts/render-check.js`).

State that is not applied yet (a draft selection, opened branches) is component state (`this.draft`, `this.expanded`), not DOM. Such state is reset on the Bus events that invalidate it.

#### Event handlers

Handlers split into two kinds:
- **Clean**: change state (via domain/App) and emit a Bus event. They never touch DOM.
- **DOM-touching**: handle ephemeral interaction that cannot be represented in state yet — draft checkboxes, drag-and-drop visuals, caret position. These are exceptions, not the norm, and must be commented.

#### Allowed exceptions to full re-render

Full re-render is not mandatory where it is impossible or harmful:
- DOM properties with no attribute equivalent: `indeterminate` on checkboxes, `open` on `<details>` when a transition must be preserved, scroll position, focus.
- Third-party widget lifecycle (Keen Slider `destroy` / `new`).
- Re-rendering the content of a single element of a region (never the element itself) when the region's container is owned by a third-party widget and rebuilding it would destroy the widget state, e.g. one Slider card after a tap. The content still comes from the same template.
- Focus and caret restoration after a re-render.

These exceptions are local and documented in the component. They do not justify making the whole render imperative.

#### Verification criteria for a view

Before considering a view converted to this model, check:
1. `render()` does not read `classList`, `checked`, `value`, `textContent` or any other DOM property to decide output. It reads only state.
2. Every class and attribute that can appear or disappear is set unconditionally in `render()` for both branches.
3. No method other than `render()` writes into the component’s owned regions, except the listed exceptions.
4. `viewModel()` and `template()` are pure functions of input data.
5. Opening/closing, toggling and similar UI modes live in component state (`this.isOpen`, etc.), not in DOM classes read back by logic.

### Views and State

- Views are independent components. There is no Router or central View registry.
- The current View is persisted.
- Progress data structures belong to individual Views. Shared progress and state logic must remain generic and must not depend on View-specific progress structures.
- There is no saved-snapshot entity for sessions. A selection is a window over entries, not a separately persisted copy.
- Progress is bound to entries and survives changes to the current selection.
- In the UI, a session means a source + View combination with actual progress.
- The setup of a View's work area (hidden columns, zoom, and the like) is not progress: it lives in the View's `ui`, survives a reload and never makes a session. A View's own progress rules are documented in its domain file.
- Removing a card or a row in a View only marks it removed in that View's progress, without confirmation; the View's reset restores it. It never removes the entry from its source or list.

### Identifiers

- Entry IDs are ordinal numbers in the source file.
- Section IDs are structural paths.
- Hashes are used only for duplicate detection when adding an entry to a custom list.
- A custom list is addressed like a source with the id `L:<listId>` (shown as `L: <name>`), so Views, progress and sessions work with it unchanged. Its entry ids are ordinals handed out by a counter that never goes back: progress is bound to the id, so an id must not move to another entry.

### Custom Lists

- An entry added to a list is a detached copy (lines, tag, info, review level). It loses its section and its link to the source: reloading or updating a source never touches a list, and nothing is reconciled.
- A list has no structure and no selection: the whole list is always shown, the section tree is hidden. It has no file, so it cannot be reloaded or updated.
- The list `Global` is always offered as a target and is created by the first entry added to it. A list appears in the sources menu only when it is not empty, or while it is the current source (so the menu still shows where the user is after its last entry was removed). An empty current list stays current and shows empty Views.
- Removing an entry from a list is a different action from removing a card in a View: it is final, always confirmed, and deletes the entry and its progress in every View, including the ids kept in the View's `ui`. `nextId` never goes back, so an id is not handed to another entry.
- Deleting a list deletes its progress and selection with it, and resets the current source if it was the list. This is required because ids restart from 0 when a list id is reused. `Global` cannot be renamed; deleting it only empties it (it is still offered and is created again by the next add).
- A `listId` is stable and independent of the name (`global`, then `l<n>`); only the name changes on rename. Names are unique without regard to case, `Global` is reserved, at most 40 characters. The checks of `Collections` are authoritative; the name prompt validates for the user's comfort only.
- List management is a dialog, not a View. Its prompts live in `ListPrompts`, so every component that offers them uses the same flow; a list can also be created from the "add to a list" prompt.
- The "add to a list" prompt starts with the list chosen last (`settings.addTarget`), Global at first. The list is remembered once chosen, also when the card is a duplicate; a cancelled prompt or a failed write changes nothing. Deleting the list resets it (its id may be reused), and a target that no longer exists falls back to Global.
- Every change of a list is written at once; if the write fails, the change is taken back and the user is told. Records of lists that could not be recognized on load are kept and written back with the rest, never dropped silently; import validates the structure of every list.
- A View rebuilds only when the content of the current list changes (`Collections.isContentChange`); a rename must not rebuild a View.

### Persistence and Source Reloading

- Persist only raw source text, custom lists, per-source selections, per-view progress/UI state, and application settings.
- Rebuild parsed results in memory rather than storing them.
- Keep storage access isolated from UI components.
- Persist state changes immediately. Do not introduce debounced or delayed writes to localStorage.
- Reloading a source resets its View progress and selection, after confirmation.
- Do not reconcile old progress with reloaded source data or introduce automatic synchronization.
- Update (menu action) is the exception to the reset: it replaces only the raw text of the current source and keeps progress and selection, without confirmation or any check. It exists for fixing typos in the file; the user is responsible for leaving the number and order of entries, lines and sections unchanged. A changed structure requires a reload.
- State export/import/reset (`Backup`) covers only the `vocabreview2.` storage namespace and includes raw source texts. A file is fully validated before the current state is replaced. Version 1 exports are rejected, not converted. After a reset or import the page reloads, because Views hold in-memory state.

### Input Safety

- Escape untrusted data for its output context.
- Never insert user-provided text into HTML as raw markup.
- Apply appropriate escaping to both text content and attribute values.

## Documentation and Verification

### Documentation

Do not turn documentation into a retelling of the code.

Document only intent, constraints, domain rules, non-obvious conventions, trade-offs and reasons for decisions.

Do not add inventories of files, methods, fields, events or components, execution walkthroughs, or other facts that are obvious from reading the implementation.

### Checks

- Do not run all Node checks by default. Run only checks relevant to the areas affected by the change.
- The application is mobile-only and runs in Kiwi Browser on Android 10.
- Do not test the UI in a desktop or headless browser. The user verifies UI behavior on a real device.
- Static analysis and relevant non-UI checks are allowed when applicable.