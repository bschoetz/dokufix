import { gzipB64 } from '../gzip.js';
import { idbGetDoc, idbPutDoc, idbDeleteDoc } from '../idb.js';
import { bakeAssetsForDocument } from '../assets.js';
import { generateDocUuid } from '../document.js';
import { sourceEl } from '../dom.js';
import { state } from '../state.js';
import { persistDoc, saveTimer, updateVersionBadge, baseTitle, updateDirtyState, CLEAN_BADGE_TEXT, VERSION_BADGE_TITLE } from '../persistence.js';
import { removeTransient } from '../transient.js';
import { safeFilenameBase, triggerDownload, setDownloadInFlight } from './download.js';

// --- Download #1 — full dokufix file (with editor baked in) ---

// Encode JSON safely for embedding inside <script type="application/json">.
// Every "<" is written as \u003c. A literal close-script tag inside the JSON
// would close the script tag prematurely, and an open-comment followed by an
// open-script tag (a version description may hold both) would keep the real
// close tag from closing it, so the block would swallow the blocks after it.
// The escape is valid in JSON and survives JSON.parse on load.
function encodeJsonForScript(obj){
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

export async function downloadWithEditor(){
  if (!state.initDone) return;
  // First save with a location-based fallback UUID — upgrade to a real UUID
  // and rekey the IDB record. Subsequent saves keep the same real UUID.
  // Copies of this file (via OS-level file copy) will share the UUID —
  // that's the intentional behaviour: each "lineage" of saves shares a
  // single identifier until the user breaks it manually.
  //
  // Order matters: we cancel the debounced save and read the existing
  // record BEFORE flipping docUuid. Otherwise a 250 ms keystroke debounce
  // firing during the await window could write the current source under
  // the new UUID, only for the rekey to overwrite it with stale data.
  if (state.docUuid.startsWith('loc-')){
    clearTimeout(saveTimer);
    const oldUuid = state.docUuid;
    let oldRec = null;
    try { oldRec = await idbGetDoc(oldUuid); }
    catch (e) { console.warn('IDB rekey read failed:', e); }
    const newUuid = generateDocUuid();
    try {
      if (oldRec){
        await idbPutDoc({ ...oldRec, uuid: newUuid, source: sourceEl.value });
        await idbDeleteDoc(oldUuid);
      }
    } catch (e) { console.warn('IDB rekey write failed:', e); }
    state.docUuid = newUuid;
  }
  // Only ask for a commit message if there are actual changes since the last
  // version event. If the source already matches the last commit/save, we
  // silently re-emit the current version — no prompt, no bump.
  const hasUncommittedChanges = sourceEl.value !== state.commitBaseline;
  let pendingVersion = state.currentVersion;
  let pendingHistory = state.versionHistory;
  let pendingCommitBaseline = state.commitBaseline;
  if (hasUncommittedChanges){
    const raw = window.prompt(
      'Optionale Beschreibung dieser Version (leer lassen für ohne):',
      ''
    );
    if (raw === null) return;  // user cancelled — abort save entirely
    // Build the new entry IN MEMORY ONLY. We do not mutate currentVersion /
    // versionHistory yet — that happens after the download has actually
    // been initiated, so a serialization or popup-blocker failure can't
    // leave a phantom version dangling in localStorage.
    let snapshot = '';
    try { snapshot = await gzipB64(sourceEl.value); }
    catch (e) { console.warn('Snapshot gzip failed:', e); }
    pendingVersion = state.currentVersion + 1;
    pendingHistory = state.versionHistory.concat([{
      v: pendingVersion,
      t: new Date().toISOString(),
      m: raw.trim(),
      s: snapshot,
    }]);
    pendingCommitBaseline = sourceEl.value;
  }

  setDownloadInFlight(true);
  try {
    const historyJson = encodeJsonForScript({
      uuid: state.docUuid,
      version: pendingVersion,
      history: pendingHistory,
    });

    const docClone = document.documentElement.cloneNode(true);

    // What exists only while the page runs does not go into the file. An
    // element a component added carries data-dokufix-transient and is removed
    // here, wherever it stands; nothing below has to know it.
    removeTransient(docClone);
    // Mermaid appends this element to <body> with the first diagram it draws.
    // It is not ours to mark, so it is named.
    docClone.querySelectorAll('.mermaidTooltip').forEach(el => el.remove());
    // The rest is state on elements of the page itself, reset one by one.
    // tests/speichern.mjs compares the saved file with the built one and fails
    // on whatever is missing here.
    docClone.querySelectorAll('.menu-wrap.open').forEach(el => el.classList.remove('open'));
    // The hamburger panel of a narrow window: the download menu sits inside
    // it, so it is open while the file is saved.
    docClone.querySelectorAll('.header-actions.open').forEach(el => el.classList.remove('open'));
    docClone.querySelector('#hamburger')?.setAttribute('aria-expanded', 'false');
    // The "in-flight" disabled state must not survive into the saved file —
    // receivers must be able to use their download buttons immediately.
    docClone.querySelectorAll('button[disabled]').forEach(b => b.removeAttribute('disabled'));
    // Receiver will recompute dirty state on init against the new baseline.
    docClone.querySelector('body')?.classList.remove('is-dirty');
    // Reset the title — strip the leading "● " from dirty-state.
    const titleClone = docClone.querySelector('title');
    if (titleClone) titleClone.textContent = baseTitle;
    // And the badge: the saved file opens clean, so it says so.
    const badgeClone = docClone.querySelector('#dirty-badge');
    if (badgeClone) badgeClone.textContent = CLEAN_BADGE_TEXT;
    // Make sure the downloaded file opens in view mode by default (the receiver should see the document)
    docClone.querySelector('body')?.classList.add('mode-view');
    // Empty the rendered preview — receiver's render() runs on load and re-renders fresh.
    // Without this, every Mermaid SVG (5-15 KB each) would ship inside the file as redundant bytes.
    const previewClone = docClone.querySelector('#preview');
    if (previewClone) previewClone.innerHTML = '';
    // Same for the scrollspy rail — receiver's buildRail() repopulates it on render.
    const railClone = docClone.querySelector('#dokufix-rail');
    if (railClone){ railClone.innerHTML = ''; railClone.classList.remove('has-items'); }
    // Bake the version history into the clone before serializing.
    const historyClone = docClone.querySelector('#dokufix-history');
    if (historyClone) historyClone.textContent = historyJson;
    // Bake every asset referenced by the current source AND any history
    // snapshot. Without this, prior versions in the in-file history that
    // referenced now-baked assets would break on receiver-side preview.
    // If the bake itself fails (transaction abort, base64 conversion error
    // on a corrupt asset), we surface a clear error instead of silently
    // killing the whole download.
    let assetsPayload = {};
    try { assetsPayload = await bakeAssetsForDocument(); }
    catch (e) {
      console.error('Asset bake failed:', e);
      alert('Bilder konnten nicht in die Datei eingebettet werden — Download abgebrochen. (' + (e && e.message || e) + ')');
      return;
    }
    const assetsClone = docClone.querySelector('#dokufix-assets');
    if (assetsClone) assetsClone.textContent = encodeJsonForScript(assetsPayload);
    // Receiver opens cleanly — hide any storage-error banner the sender saw.
    const errClone = docClone.querySelector('#storage-error');
    if (errClone){
      errClone.hidden = true;
      // And without the sender's reason in it.
      const msgClone = errClone.querySelector('.storage-error-msg');
      if (msgClone) msgClone.textContent = '';
    }
    // Drop the transient .is-drop-target class on the source pane clone.
    docClone.querySelectorAll('.is-drop-target').forEach(el => el.classList.remove('is-drop-target'));
    const versionBadgeClone = docClone.querySelector('#version-btn');
    if (versionBadgeClone){
      versionBadgeClone.textContent = 'v' + pendingVersion;
      versionBadgeClone.classList.remove('persist-failed');
      versionBadgeClone.title = VERSION_BADGE_TITLE;
    }

    // Write the demo text and the current source into the clone's data blocks,
    // both gzip-compressed:
    //   #dokufix-demo    preserved from this session (immutable original demo)
    //   #dokufix-source  current source content
    // Receiver's async init decompresses both on load.
    const sourceGz    = await gzipB64(sourceEl.value);
    const demoPayload = state.demoGz || await gzipB64(state.demoText);
    const demoClone = docClone.querySelector('#dokufix-demo');
    if (demoClone) demoClone.textContent = encodeJsonForScript({ gz: demoPayload });
    const sourceClone = docClone.querySelector('#dokufix-source');
    if (sourceClone) sourceClone.textContent = encodeJsonForScript({ gz: sourceGz });

    const html = '<!DOCTYPE html>\n' + docClone.outerHTML;
    triggerDownload(safeFilenameBase() + '.html', html);

    // Download initiated successfully. Now (and only now) mutate global state.
    state.currentVersion = pendingVersion;
    state.versionHistory = pendingHistory;
    state.commitBaseline = pendingCommitBaseline;
    state.cleanBaseline = sourceEl.value;
    updateDirtyState();
    updateVersionBadge();
    await persistDoc();
  } finally {
    setDownloadInFlight(false);
  }
}
