// The entry of the script. esbuild bundles it, with every module it imports,
// into the one script of the built file.
//
// The modules under app/ declare: functions, constants, element lookups.
// Nothing in them acts when it is loaded. Whatever acts at load stands here,
// in the order it ran when the script was one file: the library setup, each
// module's listeners (its register…() function), the async init. That order
// is written down in this file and does not follow from who imports whom.
import { openDB, showStorageError, registerStorageBanner } from './app/idb.js';
import { seedAssetsFromBakedBlock, registerAssetUrlCleanup, registerImageInput } from './app/assets.js';
import { readTextBlock, fallbackUuidFromLocation } from './app/document.js';
import { sourceEl, previewEl } from './app/dom.js';
import { state } from './app/state.js';
import { loadDocState, sanitizeVersion, isValidEntry, setPersistFailed, updateVersionBadge, registerVersionDialog, updateDirtyState } from './app/persistence.js';
import { render } from './app/render.js';
import { registerRailClicks } from './app/rail.js';
import { registerEditorInput, registerReset, registerNumbering, registerHamburger, registerViewToggle, registerLicences } from './app/editor.js';
import { registerDownloadMenu } from './app/downloads/menu.js';
import { registerSearch, closeSearch } from './app/search.js';

// A page whose script tag of Mermaid failed has no mermaid; the script runs
// on, and every diagram that needs it becomes a warning (app/diagrams.js,
// app/bpmn.js).
if (typeof mermaid !== 'undefined') mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  // strict: a diagram can no longer call JavaScript ("click X call fn()"), and
  // "click X href" loses javascript: and data: targets. Measured on 12.0.0 with
  // a flowchart, that is the whole difference to 'loose': ordinary links (https:,
  // mailto:, relative) and sanitised HTML in labels stay as they are.
  securityLevel: 'strict',
  // A diagram with an error: Mermaid throws instead of drawing its error
  // picture into the node (the default in 12.0.0). The Diagramme pass in
  // app/diagrams.js catches that and puts a warning where the diagram would be.
  suppressErrorRendering: true,
  flowchart: { curve: 'basis' }
});

// Enable GFM footnotes ([^id] inline + [^id]: definition). description is the
// text of the heading marked-footnote puts above the footnotes; a reader meets
// it in the table of contents and in the rail, so it is German.
if (typeof markedFootnote === 'function') {
  marked.use(markedFootnote({ description: 'Fußnoten' }));
}

registerAssetUrlCleanup();
registerVersionDialog();
registerRailClicks();
registerEditorInput();
registerImageInput();
registerReset();
registerDownloadMenu();
registerNumbering();
registerHamburger();
registerViewToggle();
registerStorageBanner();
registerLicences();
// The search reads the preview and opens in read mode; leaving read mode, in
// whatever way, closes it.
const inReadMode = () => document.body.classList.contains('mode-view');
registerSearch({ root: previewEl, inReadMode });
new MutationObserver(() => { if (!inReadMode()) closeSearch(); })
  .observe(document.body, { attributes: true, attributeFilter: ['class'] });

// Async init — reads the demo text and this file's document from their data
// blocks (decompressing them if they are gzipped), opens IDB, migrates legacy
// localStorage if present, then loads source + renders.
(async () => {
  const demo = await readTextBlock('dokufix-demo');
  state.demoText = demo.text;
  state.demoGz = demo.gz;
  const fallback = (await readTextBlock('dokufix-source')).text || state.demoText;

  // Open IDB once up front. If the browser refuses (private mode in some
  // browsers, file:// quirks), surface the banner — but keep going in a
  // degraded mode so the user can still READ the baked document or demo. Edits
  // won't persist (persistDoc will warn via setPersistFailed), but the
  // document content itself remains visible. The PoC is modern-only and
  // doesn't fall back to localStorage for storage, but blocking the view
  // would mean private-mode users can't even read what they just opened.
  let idbAvailable = true;
  try { await openDB(); }
  catch (e) {
    console.error('IndexedDB unavailable:', e);
    showStorageError(e && e.message ? e.message : String(e));
    idbAvailable = false;
  }

  if (idbAvailable){
    // loadDocState FIRST: derives docUuid from the file's history JSON,
    // then loads (or migrates) the IDB record for that UUID.
    await loadDocState(fallback);
    // Seed assets baked into THIS file into IDB (idempotent — content-addressed).
    await seedAssetsFromBakedBlock();
  } else {
    // Degraded path: parse the baked history block for UUID + history (so
    // the version badge and bake metadata are correct), but no IDB read.
    state.docUuid = fallbackUuidFromLocation();
    const el = document.getElementById('dokufix-history');
    if (el){
      try {
        const parsed = JSON.parse((el.textContent || '').trim() || '{}');
        if (parsed && typeof parsed === 'object'){
          if (typeof parsed.uuid === 'string' && parsed.uuid) state.docUuid = parsed.uuid;
          state.currentVersion = sanitizeVersion(parsed.version);
          state.versionHistory = Array.isArray(parsed.history) ? parsed.history.filter(isValidEntry) : [];
        }
      } catch (e) { console.warn('File history parse failed (degraded mode):', e); }
    }
    state.commitBaseline = fallback;
    state.storedSource = null;
    setPersistFailed(true);
  }

  // Baseline = what's actually baked into THIS file. A draft restored from
  // IDB that differs from the baseline correctly reads as "geändert".
  state.cleanBaseline = fallback;
  // A record exists (storedSource is a string) → respect it even if it's
  // empty — that means the user cleared the textarea deliberately. No
  // record → fall back to the file's document or demo so the doc is readable.
  sourceEl.value = (state.storedSource !== null) ? state.storedSource : fallback;
  updateDirtyState();
  updateVersionBadge();
  render();
  state.initDone = true;
})();
