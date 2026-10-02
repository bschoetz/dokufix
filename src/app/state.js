// The values that more than one module assigns to. An imported name cannot be
// assigned to, so they are the properties of one object: a module that reads or
// writes one imports `state` and says state.currentVersion. A value that only
// its own module assigns to stays a `let` there.
export const state = {
  demoText: '',   // the demo text, readable
  demoGz: '',     // the same as the demo block carried it gzipped, '' if it carried text

  docUuid: '',

  // In-memory state mirrored to IDB.
  currentVersion: 0,
  versionHistory: [],
  commitBaseline: '',   // source at time of last version event
  storedSource: null,   // last source loaded from IDB (or null on fresh open)

  cleanBaseline: '',

  mermaidId: 0,

  // Init gate — set true at end of the async IIFE. Until then, download
  // buttons (and any state-mutating user actions) are disabled so a click
  // during slow CDN load can't fire against half-initialized state.
  initDone: false,
};
