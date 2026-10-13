# Vocab review app

## Absolute paths for references

### "KanbanMvd" 
/home/mvd/AndroidStudioProjects/KanbanMvd/app/src/main/assets

### "Version 1"
/home/mvd/Documents/MyJsAndStuff/vocabreview

## General

This is a project in progress. The project is a web application written in native html-js-css. It will use some libraries which will be stored in assets folder. No frameworks. The app is launched in browser with the help of some local http server. 
The purpose of the app is to give a user a vocab review UI that is sourced in text files to which a user writes vocabularly when reading japanese books. The app parses files according to some syntax conventions (as well as some euristics) and allows to review vocab in dirrefent game-like UIs, such as slider, kanban-like board, cards between panels, table with draggable rows etc. These different modes are called Views.
The parsed data, as well as review sessions and app settings are stored in browser localStorage.
Vesion 1. This app is version 2 of a prototype app. Since the version 1 was designed chaotically and is full of legacy (not needed) features and convensions, it was decided to write the new app from scratch.
I am the only person who uses the app so prod/test philosophy doesn't apply.
There is "KanbanMvd" app that has some features for it's architecture that I like and will be referencing to. 

## Version 1: what was good

- Design and current color scheme, css is not so bad. 
- Domain logic: uploading and parsing a user's text files, output it as library that allows to select source, see it's structure, select scope to pull vocab from (chapters, sections), switch to different views, start learning sessions, proceed from where you've stopped (persistance in state), reload source file (re-parce the data) if source file is changed.
- Simple framework (native code, lauching in browser without build, easy debug)
- File-first source: source files are being edited outside the app in a free manner; syntax convensions are very soft. 

## Version 1: featrues that turned out not needed

- On Board and Panel views - the logic of "lapses"
- Global pool (should be redesigned as custom sessions/collections)
- Matching view

## Version 2 standards

- separate domain logic and UI (like in 'KanbanMvd' app)
- clear compoments architecture: components are agnostic of each other, they react to events dispatched by Bus and render themselves. Only drag-n-drop effects are ok to do in DOM directly
