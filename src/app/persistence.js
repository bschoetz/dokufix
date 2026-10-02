import { gzipB64 } from './gzip.js';
import { idbGetDoc, idbPutDoc } from './idb.js';
import { fallbackUuidFromLocation } from './document.js';
import { sourceEl } from './dom.js';
import { state } from './state.js';
import { escapeHtml } from './html.js';

// --- Browser-side persistence (IndexedDB) ---------------------
// One record per dokufix file lives in IDB under its UUID, in store 'docs':
//   { uuid, source, version, history, commitBaseline, updatedAt }
// Migration from the PoC's earlier localStorage layout happens transparently
// on first load (see migrateLegacyLocalStorage). Storage of the heading-
// numbering preference stays in localStorage — it's doc-independent UX state,
// not document content.

const versionBtn   = document.getElementById('version-btn');
const versionModal = document.getElementById('version-modal');

// One-shot migration: if no IDB doc record exists for this UUID but the old
// PoC's localStorage keys do, move the data into IDB and drop the LS keys.
// Conservative: we only delete the legacy keys after the IDB write resolved
// successfully. A migration with a malformed source still proceeds (we'd
// lose nothing by keeping the LS copy around through another reload, but
// the user has already moved on to the IDB-backed flow at that point).
async function migrateLegacyLocalStorage(uuid){
  const srcKey = 'dokufix-doc-' + uuid + '-source';
  const verKey = 'dokufix-doc-' + uuid + '-versions';
  let lsSource = null, lsVersions = null;
  try { lsSource   = localStorage.getItem(srcKey); } catch(e){}
  try { lsVersions = localStorage.getItem(verKey); } catch(e){}
  if (lsSource === null && lsVersions === null) return null;
  let parsedVersions = { version: 0, history: [] };
  if (lsVersions){
    try {
      const p = JSON.parse(lsVersions);
      if (p && typeof p === 'object') parsedVersions = p;
    } catch (e) { console.warn('Legacy versions parse failed during migration:', e); }
  }
  // commitBaseline is only carried over if it's a non-empty string; empty or
  // missing falls through to loadDocState which will use the file's document
  // as baseline instead. An empty-string baseline would otherwise make every
  // subsequent edit (and the loaded source itself) read as dirty.
  const lsBaseline = typeof parsedVersions.commitBaseline === 'string' && parsedVersions.commitBaseline !== ''
    ? parsedVersions.commitBaseline : null;
  const rec = {
    uuid,
    source: lsSource || '',
    version: sanitizeVersion(parsedVersions.version),
    history: Array.isArray(parsedVersions.history) ? parsedVersions.history.filter(isValidEntry) : [],
  };
  if (lsBaseline !== null) rec.commitBaseline = lsBaseline;
  try { await idbPutDoc(rec); }
  catch (e) { console.warn('IDB migration write failed:', e); return null; }
  try { localStorage.removeItem(srcKey); localStorage.removeItem(verKey); } catch(e){}
  return rec;
}

export async function loadDocState(initialSource){
  // The file's baked-in #dokufix-history is one source of truth. The IDB
  // record (or migrated-from-localStorage) is the other. We use the file's
  // JSON purely to derive docUuid; live state comes from IDB if its version
  // is newer (commit-only events after the last download bump the IDB
  // version past the file's baked one).
  let fileData = { version: 0, history: [] };
  const el = document.getElementById('dokufix-history');
  if (el) {
    try {
      const raw = (el.textContent || '').trim() || '{"version":0,"history":[]}';
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') fileData = parsed;
    } catch (e) { console.warn('File history parse failed:', e); }
  }
  state.docUuid = (fileData && typeof fileData.uuid === 'string' && fileData.uuid)
    ? fileData.uuid : fallbackUuidFromLocation();

  // Look in IDB first; if absent, attempt one-shot migration from legacy LS.
  let dbRec = null;
  try { dbRec = await idbGetDoc(state.docUuid); }
  catch (e) { console.warn('IDB read failed:', e); }
  if (!dbRec) dbRec = await migrateLegacyLocalStorage(state.docUuid);

  const dbVer   = dbRec ? sanitizeVersion(dbRec.version) : -1;
  const fileVer = sanitizeVersion(fileData.version);
  const useDb = dbRec && dbVer > fileVer;
  const data = useDb ? dbRec : fileData;

  state.currentVersion = sanitizeVersion(data.version);
  state.versionHistory = Array.isArray(data.history) ? data.history.filter(isValidEntry) : [];
  // commitBaseline = the source at the time of the last version event.
  // If the IDB record is ahead, it stored the source as it was when the
  // commit-only happened. Otherwise the file's baked document represents it.
  // Empty string is treated as "no usable baseline" (e.g. legacy record
  // with no commitBaseline field) — fall back to initialSource so dirty
  // state isn't computed against an empty baseline.
  state.commitBaseline = useDb && typeof data.commitBaseline === 'string' && data.commitBaseline !== ''
    ? data.commitBaseline
    : initialSource;
  // Source: whatever IDB has wins — drafts survive reloads. The presence
  // of the record itself, not the truthiness of source, distinguishes
  // "no draft" from "deliberately empty draft" — clearing the textarea on
  // purpose must not be silently undone by substituting the file's document on reload.
  state.storedSource = (dbRec && typeof dbRec.source === 'string') ? dbRec.source : null;
}

export function sanitizeVersion(n){
  const v = Math.floor(Number(n));
  return Number.isFinite(v) && v >= 0 ? v : 0;
}
export function isValidEntry(e){
  return e && typeof e === 'object'
    && Number.isFinite(e.v) && typeof e.t === 'string'
    && (typeof e.m === 'string' || e.m === undefined)
    && (typeof e.s === 'string' || e.s === undefined);
}

export async function persistDoc(){
  try {
    await idbPutDoc({
      uuid: state.docUuid,
      source: sourceEl.value,
      version: state.currentVersion,
      history: state.versionHistory,
      commitBaseline: state.commitBaseline,
    });
    setPersistFailed(false);
  } catch (e) {
    console.warn('IDB persist failed:', e);
    setPersistFailed(true);
  }
}

export let saveTimer;
export function scheduleSave(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistDoc, 250);
}

let persistFailedFlag = false;
// The badge's title while storage works: the one it has in src/index.html.
// "Mit Editor" writes it into the saved file.
export const VERSION_BADGE_TITLE = 'Versionsverlauf anzeigen';
export function setPersistFailed(failed){
  if (persistFailedFlag === failed) return;
  persistFailedFlag = failed;
  if (versionBtn){
    versionBtn.classList.toggle('persist-failed', failed);
    versionBtn.title = failed
      ? 'Achtung: Versionsdaten konnten nicht im Browser gespeichert werden (Quota?). Klick für Details.'
      : VERSION_BADGE_TITLE;
  }
}

async function commitNewVersion(message){
  // Capture a gzipped snapshot of the source at this version. Lets readers
  // of the file inspect what the document looked like at any prior version
  // — the basis of the audit story.
  let snapshot = '';
  try { snapshot = await gzipB64(sourceEl.value); }
  catch (e) { console.warn('Version snapshot gzip failed:', e); }

  state.currentVersion += 1;
  state.versionHistory = state.versionHistory.concat([{
    v: state.currentVersion,
    t: new Date().toISOString(),
    m: message,
    s: snapshot,
  }]);
  state.commitBaseline = sourceEl.value;
  await persistDoc();
  updateVersionBadge();
}

export function updateVersionBadge(){
  if (versionBtn) versionBtn.textContent = 'v' + state.currentVersion;
}

export function formatVersionDate(iso){
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = n => String(n).padStart(2, '0');
  return pad(d.getDate()) + '.' + pad(d.getMonth()+1) + '.' + d.getFullYear() +
         ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function renderVersionModalBody(){
  const body = versionModal && versionModal.querySelector('.version-modal-body');
  if (!body) return;
  if (!state.versionHistory.length){
    body.innerHTML = '<p class="version-empty">Noch keine Versionen gespeichert. Beim ersten Download „Mit Editor" wird Version 1 angelegt.</p>';
    return;
  }
  const items = [...state.versionHistory].reverse().map(e => {
    const num = '<span class="v-num">v' + e.v + '</span>';
    const date = '<span class="v-date">' + escapeHtml(formatVersionDate(e.t)) + '</span>';
    const msg = e.m
      ? '<span class="v-msg">' + escapeHtml(e.m) + '</span>'
      : '<span class="v-msg"><em>(ohne Beschreibung)</em></span>';
    return '<li>' + num + date + msg + '</li>';
  }).join('');
  body.innerHTML = '<ol class="version-list">' + items + '</ol>';
}

export function registerVersionDialog(){
  if (versionBtn && versionModal){
    versionBtn.addEventListener('click', () => {
      if (versionModal.open) return;  // guard against double-click
      renderVersionModalBody();
      versionModal.showModal();
    });
    const closeBtn = versionModal.querySelector('.version-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', () => versionModal.close());
    // Click outside dialog (on backdrop) closes
    versionModal.addEventListener('click', e => {
      if (e.target === versionModal) versionModal.close();
    });
    const commitBtn = document.getElementById('commit-btn');
    if (commitBtn){
      commitBtn.addEventListener('click', async () => {
        // Skip silently when nothing changed since the last commit/save —
        // mirrors the "Mit Editor" save behaviour. No empty-commit spam.
        if (sourceEl.value === state.commitBaseline){
          commitBtn.classList.add('shake');
          setTimeout(() => commitBtn.classList.remove('shake'), 400);
          return;
        }
        const raw = window.prompt(
          'Beschreibung dieser Version (leer lassen für ohne):',
          ''
        );
        if (raw === null) return;
        await commitNewVersion(raw.trim());
        renderVersionModalBody();
      });
    }
  }
}

// --- Dirty-state indicator ------------------------------------
// "clean" means: the current editor text is identical to what is baked
// into this HTML file (#dokufix-source, or the demo text for a fresh dokufix file).
// "dirty" means: the user has unsaved changes relative to the file on disk.
// A "Mit Editor"-Download resets the baseline to the new saved content.
export const baseTitle = document.title;
const dirtyBadgeEl = document.getElementById('dirty-badge');
// What the badge says when nothing changed: the text it has in src/index.html.
// "Mit Editor" writes it into the saved file, which opens clean.
export const CLEAN_BADGE_TEXT = 'wie in Datei';
export function updateDirtyState(){
  const dirty = sourceEl.value !== state.cleanBaseline;
  document.body.classList.toggle('is-dirty', dirty);
  document.title = (dirty ? '● ' : '') + baseTitle;
  if (dirtyBadgeEl) dirtyBadgeEl.textContent = dirty ? 'geändert' : CLEAN_BADGE_TEXT;
}

// Loading the file's document is async (its block may need decompression). See the async init in src/app.js.
