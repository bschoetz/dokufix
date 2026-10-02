mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  // strict: a diagram can no longer call JavaScript ("click X call fn()"), and
  // "click X href" loses javascript: and data: targets. Measured on 12.0.0 with
  // a flowchart, that is the whole difference to 'loose': ordinary links (https:,
  // mailto:, relative) and sanitised HTML in labels stay as they are.
  securityLevel: 'strict',
  flowchart: { curve: 'basis' }
});

// Enable GFM footnotes ([^id] inline + [^id]: definition)
if (typeof markedFootnote === 'function') {
  marked.use(markedFootnote());
}

// --- Gzip helpers (browser-native, no library) -------------------
// Used both for compressing on download and for decompressing the
// data blocks of downloaded "Mit Editor" files on load.
async function gzipB64(text){
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
async function ungzipB64(b64){
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

// --- IndexedDB layer ------------------------------------------
// One DB per origin, two stores:
//   docs   (keyPath: uuid)  — one record per dokufix file: source, version, history, commitBaseline
//   assets (keyPath: hash)  — image Blobs, content-addressed by SHA-256 hex (auto-dedup, no GC needed)
const IDB_NAME = 'dokufix-v1';
const IDB_VERSION = 1;
let _dbPromise = null;
function openDB(){
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined'){
      reject(new Error('IndexedDB nicht verfügbar'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs', { keyPath: 'uuid' });
      if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', { keyPath: 'hash' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    req.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another tab'));
  });
  return _dbPromise;
}
function _idbReq(req){
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}
async function idbGetDoc(uuid){
  const db = await openDB();
  return _idbReq(db.transaction('docs', 'readonly').objectStore('docs').get(uuid));
}
async function idbPutDoc(rec){
  const db = await openDB();
  rec.updatedAt = new Date().toISOString();
  return _idbReq(db.transaction('docs', 'readwrite').objectStore('docs').put(rec));
}
async function idbDeleteDoc(uuid){
  const db = await openDB();
  return _idbReq(db.transaction('docs', 'readwrite').objectStore('docs').delete(uuid));
}
async function idbGetAsset(hash){
  const db = await openDB();
  return _idbReq(db.transaction('assets', 'readonly').objectStore('assets').get(hash));
}
async function idbPutAsset(rec){
  const db = await openDB();
  return _idbReq(db.transaction('assets', 'readwrite').objectStore('assets').put(rec));
}
async function idbBatchGetAssets(hashes){
  const out = new Map();
  if (!hashes.length) return out;
  const db = await openDB();
  const store = db.transaction('assets', 'readonly').objectStore('assets');
  await Promise.all(hashes.map(h => new Promise((resolve, reject) => {
    const req = store.get(h);
    req.onsuccess = () => { if (req.result) out.set(h, req.result); resolve(); };
    req.onerror   = () => reject(req.error);
  })));
  return out;
}

// --- Storage-error banner -------------------------------------
function showStorageError(detail){
  const el = document.getElementById('storage-error');
  if (!el) { alert('Speicher nicht verfügbar: ' + detail); return; }
  const msgEl = el.querySelector('.storage-error-msg');
  if (msgEl && detail) msgEl.textContent = '(' + detail + ') ';
  el.hidden = false;
}

// --- Image / asset pipeline -----------------------------------
// Assets are stored as native Blob in IDB, keyed by SHA-256 hex (content
// addressing → automatic deduplication). The markdown source refers to
// them via ![alt](#asset-<hash>). The render step rewrites those refs to
// Blob URLs; read-only downloads inline them as data: URLs.
const ASSET_MAX_INPUT_BYTES = 5 * 1024 * 1024;
const ASSET_MAX_WIDTH = 1600;
const ASSET_WEBP_QUALITY = 0.85;
// Guard against decoded-pixel blow-up: a heavily compressed JPEG can fit
// inside the 5 MB input cap and still decode to a 12000×8000 bitmap, where
// the intermediate canvas allocates ~400 MB of RGBA and can OOM the tab.
const ASSET_MAX_DECODED_PIXELS = 25 * 1000 * 1000;  // 25 MP
// Hash matcher: 12-64 hex chars after #asset- (full sha256 is 64; allow
// shorter prefixes for forward-compat with eventual short-hash refs).
const ASSET_REF_RE = /#asset-([0-9a-f]{12,64})/gi;
// Same shape inside an HTML attribute value, used to rewrite src="#asset-…".
const ASSET_SRC_ATTR_RE = /src=("|')#asset-([0-9a-f]{12,64})\1/gi;

// Session-lifetime cache mapping hash → blob URL. Created on demand during
// render. Stale entries (hashes no longer referenced from the source) are
// revoked after each render via pruneAssetUrlCache — long sessions otherwise
// accumulate decoded image references that the browser keeps alive.
const assetUrlCache = new Map();
function assetUrlFor(hash, blob){
  let url = assetUrlCache.get(hash);
  if (!url){
    url = URL.createObjectURL(blob);
    assetUrlCache.set(hash, url);
  }
  return url;
}
function pruneAssetUrlCache(keepHashes){
  for (const [h, u] of assetUrlCache){
    if (!keepHashes.has(h)){
      URL.revokeObjectURL(u);
      assetUrlCache.delete(h);
    }
  }
}
window.addEventListener('beforeunload', () => {
  for (const u of assetUrlCache.values()) URL.revokeObjectURL(u);
  assetUrlCache.clear();
});

// 1×1 transparent GIF data URL used as the src for unresolved/missing asset
// refs. Avoids the empty src="" footgun where browsers fetch the document's
// own URL, and keeps the layout box stable so the CSS placeholder renders
// at a sensible size.
const MISSING_ASSET_SRC = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

// Pull every #asset-<hash> reference out of an arbitrary markdown / HTML
// string. Returns a Set of unique lowercase hashes.
function collectAssetHashes(text){
  const out = new Set();
  if (!text) return out;
  ASSET_REF_RE.lastIndex = 0;
  let m;
  while ((m = ASSET_REF_RE.exec(text)) !== null) out.add(m[1].toLowerCase());
  return out;
}

async function sha256Hex(buf){
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// Decode the file, optionally downscale, re-encode to WebP, hash, store.
// Returns { hash, mime, size, alt, width, height }.
async function addImageFromBlob(file, altHint){
  if (!file || !file.type || !file.type.startsWith('image/')){
    throw new Error('Keine Bilddatei');
  }
  if (file.size > ASSET_MAX_INPUT_BYTES){
    throw new Error('Datei zu groß (max. ' + Math.round(ASSET_MAX_INPUT_BYTES / 1024 / 1024) + ' MB)');
  }
  // createImageBitmap with imageOrientation: 'from-image' applies EXIF
  // orientation to the pixels; the subsequent canvas roundtrip strips
  // the EXIF metadata entirely (privacy side-effect).
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const w0 = bitmap.width, h0 = bitmap.height;
  if (w0 * h0 > ASSET_MAX_DECODED_PIXELS){
    if (bitmap.close) bitmap.close();
    throw new Error('Bild zu groß zum Verarbeiten (' + w0 + '×' + h0 +
      ' Pixel; Limit ' + Math.round(ASSET_MAX_DECODED_PIXELS / 1e6) + ' MP)');
  }
  const scale = Math.min(1, ASSET_MAX_WIDTH / w0);
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  let outBlob;
  try {
    if (typeof OffscreenCanvas !== 'undefined' && OffscreenCanvas.prototype.convertToBlob){
      const oc = new OffscreenCanvas(w, h);
      const ctx = oc.getContext('2d');
      if (!ctx) throw new Error('Canvas-Kontext nicht verfügbar');
      ctx.drawImage(bitmap, 0, 0, w, h);
      outBlob = await oc.convertToBlob({ type: 'image/webp', quality: ASSET_WEBP_QUALITY });
    } else {
      const cv = Object.assign(document.createElement('canvas'), { width: w, height: h });
      const ctx = cv.getContext('2d');
      if (!ctx) throw new Error('Canvas-Kontext nicht verfügbar');
      ctx.drawImage(bitmap, 0, 0, w, h);
      outBlob = await new Promise((res, rej) =>
        cv.toBlob(b => b ? res(b) : rej(new Error('Bild-Encoding fehlgeschlagen')),
                  'image/webp', ASSET_WEBP_QUALITY));
    }
  } finally {
    // Release native bitmap memory even when encoding throws — otherwise
    // each failed upload leaks the decoded buffer until GC.
    if (bitmap.close) bitmap.close();
  }
  const buf = await outBlob.arrayBuffer();
  const hash = await sha256Hex(buf);
  await idbPutAsset({
    hash, blob: outBlob, mime: 'image/webp',
    size: outBlob.size, createdAt: new Date().toISOString(),
  });
  // Sanitize alt-text from the filename: strip characters that would let an
  // attacker-controlled filename break out of the markdown image syntax
  // (e.g. `x](http://evil/track.png).png` would otherwise inject an external
  // src). Keep it readable: trim leftover whitespace and bound the length.
  const rawAlt = altHint || (file.name ? file.name.replace(/\.[^.]+$/, '') : 'Bild');
  const altBase = String(rawAlt).replace(/[\[\]()\\`<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Bild';
  return { hash, mime: 'image/webp', size: outBlob.size, alt: altBase, width: w, height: h };
}

// Insert markdown text at the current selection position of the textarea
// and dispatch input so the save / dirty machinery picks it up.
function insertAtCursor(textarea, text){
  const start = textarea.selectionStart, end = textarea.selectionEnd;
  textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
  const pos = start + text.length;
  textarea.selectionStart = textarea.selectionEnd = pos;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

async function handleImageInsert(file){
  try {
    const { hash, alt } = await addImageFromBlob(file);
    insertAtCursor(sourceEl, '![' + alt + '](#asset-' + hash + ')');
    render();
  } catch (e) {
    console.error('Image insert failed:', e);
    alert('Bild konnte nicht eingefügt werden: ' + (e.message || e));
  }
}

// Read the baked <script id="dokufix-assets"> JSON block and write each
// entry into IDB. Idempotent — content-addressed hashes mean a re-seed
// of identical bytes is a no-op.
//
// Integrity check: the asserted hash is treated as untrusted (the file
// may have been crafted by an attacker pairing a benign hash with hostile
// bytes). We recompute SHA-256 over the decoded bytes and refuse to store
// the entry if it doesn't match. A mismatch is logged once and skipped —
// the markdown ref will simply render as a missing-asset placeholder.
async function seedAssetsFromBakedBlock(){
  const el = document.getElementById('dokufix-assets');
  if (!el) return;
  let parsed;
  try { parsed = JSON.parse((el.textContent || '').trim() || '{}'); }
  catch (e) { console.warn('Assets block parse failed:', e); return; }
  if (!parsed || typeof parsed !== 'object') return;
  for (const [hash, val] of Object.entries(parsed)){
    if (!/^[0-9a-f]{64}$/i.test(hash)) continue;  // require full SHA-256
    if (!val || typeof val !== 'object') continue;
    const mime = typeof val.m === 'string' ? val.m : 'image/webp';
    const b64 = typeof val.d === 'string' ? val.d : '';
    if (!b64) continue;
    const lowerHash = hash.toLowerCase();
    try {
      const existing = await idbGetAsset(lowerHash);
      if (existing) continue;
      let bytes;
      try { bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); }
      catch (e) { console.warn('Asset base64 decode failed for ' + lowerHash + ':', e); continue; }
      const actualHash = await sha256Hex(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      if (actualHash !== lowerHash){
        console.warn('Asset integrity check failed — asserted ' + lowerHash +
                     ' but bytes hash to ' + actualHash + '; skipping.');
        continue;
      }
      const blob = new Blob([bytes], { type: mime });
      await idbPutAsset({
        hash: lowerHash, blob, mime, size: bytes.length,
        createdAt: new Date().toISOString(),
      });
    } catch (e) { console.warn('Asset seed failed for ' + lowerHash + ':', e); }
  }
}

// Blob → "base64" (binary-safe via FileReader).
async function blobToBase64(blob){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// Rewrite src="#asset-<hash>" inside the rendered HTML to a Blob URL pulled
// from IDB. Missing assets get a transparent placeholder src plus a
// data-missing-asset attribute so the CSS rule img[data-missing-asset] can
// render a clearly-labeled placeholder. The transparent src prevents the
// browser from issuing a fetch against the document URL (which empty
// src="" would otherwise trigger). Returns the set of hashes that were
// successfully resolved so the caller can prune stale cache entries.
async function resolveAssetRefsInHtml(html){
  if (!html) return { html, resolved: new Set() };
  const hashes = new Set();
  let m;
  ASSET_SRC_ATTR_RE.lastIndex = 0;
  while ((m = ASSET_SRC_ATTR_RE.exec(html)) !== null) hashes.add(m[2].toLowerCase());
  if (!hashes.size) return { html, resolved: new Set() };
  let assetMap = new Map();
  try { assetMap = await idbBatchGetAssets([...hashes]); }
  catch (e) { console.warn('Asset batch read failed:', e); }
  const resolved = new Set();
  const out = html.replace(ASSET_SRC_ATTR_RE, (_full, q, hex) => {
    const h = hex.toLowerCase();
    const rec = assetMap.get(h);
    if (rec && rec.blob){
      const url = assetUrlFor(h, rec.blob);
      resolved.add(h);
      return 'src=' + q + url + q;
    }
    return 'src=' + q + MISSING_ASSET_SRC + q + ' data-missing-asset=' + q + h + q;
  });
  return { html: out, resolved };
}

// Same shape, but produces data: URLs — for read-only exports that must be
// self-contained without any IDB or runtime dependency. Unresolvable refs
// keep the transparent placeholder src plus their data-missing-asset
// attribute, so the receiver's CSS still shows a "Bild fehlt" marker.
async function inlineAssetRefsAsDataUrls(html){
  if (!html) return html;
  const hashes = new Set();
  let m;
  ASSET_SRC_ATTR_RE.lastIndex = 0;
  while ((m = ASSET_SRC_ATTR_RE.exec(html)) !== null) hashes.add(m[2].toLowerCase());
  // Read-only exports may also contain Blob URLs that the live render pass
  // inserted into the preview before we cloned it. Resolve those too via
  // the assetUrlCache reverse map.
  const blobUrlToHash = new Map();
  for (const [h, u] of assetUrlCache.entries()) blobUrlToHash.set(u, h);
  const BLOB_RE = /src=("|')(blob:[^"']+)\1/gi;
  while ((m = BLOB_RE.exec(html)) !== null){
    const h = blobUrlToHash.get(m[2]);
    if (h) hashes.add(h);
  }
  if (!hashes.size) return html;
  let assetMap = new Map();
  try { assetMap = await idbBatchGetAssets([...hashes]); }
  catch (e) { console.warn('Asset batch read failed:', e); }
  const dataUrls = new Map();
  for (const [h, rec] of assetMap.entries()){
    if (!rec || !rec.blob) continue;
    try {
      const b64 = await blobToBase64(rec.blob);
      dataUrls.set(h, 'data:' + (rec.mime || 'image/webp') + ';base64,' + b64);
    } catch (e) { console.warn('Asset data-URL convert failed for ' + h + ':', e); }
  }
  let out = html.replace(ASSET_SRC_ATTR_RE, (_full, q, hex) => {
    const h = hex.toLowerCase();
    const url = dataUrls.get(h);
    return url
      ? 'src=' + q + url + q
      : 'src=' + q + MISSING_ASSET_SRC + q + ' data-missing-asset=' + q + h + q;
  });
  out = out.replace(BLOB_RE, (_full, q, blobUrl) => {
    const h = blobUrlToHash.get(blobUrl);
    const url = h ? dataUrls.get(h) : null;
    if (url) return 'src=' + q + url + q;
    return 'src=' + q + MISSING_ASSET_SRC + q +
           (h ? ' data-missing-asset=' + q + h + q : '');
  });
  return out;
}

// Build the JSON payload for the #dokufix-assets script block. Includes any
// asset referenced by the current source AND any referenced in history
// snapshots — every prior version stays fully reconstructible from the file.
async function bakeAssetsForDocument(){
  const hashes = new Set(collectAssetHashes(sourceEl.value));
  for (const e of versionHistory){
    if (!e || typeof e.s !== 'string' || !e.s) continue;
    try {
      const src = await ungzipB64(e.s);
      for (const h of collectAssetHashes(src)) hashes.add(h);
    } catch (err) {
      console.warn('History snapshot decode failed during asset bake:', err);
    }
  }
  if (!hashes.size) return {};
  const assetMap = await idbBatchGetAssets([...hashes]);
  const out = {};
  for (const [h, rec] of assetMap.entries()){
    if (!rec || !rec.blob) continue;
    try {
      const b64 = await blobToBase64(rec.blob);
      out[h] = { m: rec.mime || 'image/webp', d: b64 };
    } catch (e) { console.warn('Asset bake failed for ' + h + ':', e); }
  }
  return out;
}

// --- Demo text and this file's document ------------------------
// Both live in data blocks of the page, not in this script:
//   #dokufix-demo    the immutable original demo text, for "Demo zurücksetzen"
//   #dokufix-source  this file's document; empty in a fresh dokufix file
// A block holds {"text": …} (as built from src/demo.md) or {"gz": …} (gzip +
// base64, as "Mit Editor" writes it). Saving writes the blocks of the cloned
// document through the DOM, so nothing depends on the text of this script,
// which the build minifies. The async init at the bottom reads both.
let demoText = '';   // the demo text, readable
let demoGz   = '';   // the same as the demo block carried it gzipped, '' if it carried text
async function readTextBlock(id){
  const out = { text: '', gz: '' };
  const el = document.getElementById(id);
  if (!el) return out;
  try {
    const parsed = JSON.parse((el.textContent || '').trim() || '{}');
    if (parsed && typeof parsed.gz === 'string' && parsed.gz){
      out.gz = parsed.gz;
      out.text = await ungzipB64(parsed.gz);
    } else if (parsed && typeof parsed.text === 'string'){
      out.text = parsed.text;
    }
  } catch (e) { console.error('#' + id + ' could not be read:', e); }
  return out;
}

const sourceEl  = document.getElementById('source');
const previewEl = document.getElementById('preview');
const btnEl     = document.getElementById('render-btn');
const resetEl   = document.getElementById('reset-btn');

// --- Per-document identity ------------------------------------
// Each dokufix file carries a UUID baked into its #dokufix-history JSON.
// Both localStorage keys (editor source + version history) are suffixed
// with this UUID, so two different dokufix files in the same browser
// no longer collide on storage. Files predating this feature load with
// no UUID; we generate one for the session and bake it on first save.
let docUuid = '';
function generateDocUuid(){
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'){
    try { return crypto.randomUUID(); } catch(e){ /* fall through */ }
  }
  // Fallback for non-secure contexts (some file:// browsers)
  return 'd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// Stable session-spanning identifier for files that have not yet been
// saved (no UUID baked into the JSON). Without this, every reload would
// produce a fresh UUID and orphan the localStorage data from the prior
// session. We derive the fallback from origin+pathname so the same file
// at the same path keeps the same fallback ID across reloads — but two
// different files at different paths still get distinct IDs. Hash and
// query are deliberately excluded: ToC clicks mutate the hash via
// history.replaceState, and a stale anchor in the URL on next reload
// would otherwise produce a different key and orphan the prior data.
function fallbackUuidFromLocation(){
  const src = (location.origin || '') + (location.pathname || '')
           || String(location.href);
  // Cheap deterministic hash (FNV-1a 32-bit-ish, base36-encoded).
  let h = 2166136261 >>> 0;
  for (let i = 0; i < src.length; i++){
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return 'loc-' + h.toString(36);
}

// --- Browser-side persistence (IndexedDB) ---------------------
// One record per dokufix file lives in IDB under its UUID, in store 'docs':
//   { uuid, source, version, history, commitBaseline, updatedAt }
// Migration from the PoC's earlier localStorage layout happens transparently
// on first load (see migrateLegacyLocalStorage). Storage of the heading-
// numbering preference stays in localStorage — it's doc-independent UX state,
// not document content.

// In-memory state mirrored to IDB.
let currentVersion = 0;
let versionHistory = [];
let commitBaseline = '';   // source at time of last version event
let storedSource   = null; // last source loaded from IDB (or null on fresh open)
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

async function loadDocState(initialSource){
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
  docUuid = (fileData && typeof fileData.uuid === 'string' && fileData.uuid)
    ? fileData.uuid : fallbackUuidFromLocation();

  // Look in IDB first; if absent, attempt one-shot migration from legacy LS.
  let dbRec = null;
  try { dbRec = await idbGetDoc(docUuid); }
  catch (e) { console.warn('IDB read failed:', e); }
  if (!dbRec) dbRec = await migrateLegacyLocalStorage(docUuid);

  const dbVer   = dbRec ? sanitizeVersion(dbRec.version) : -1;
  const fileVer = sanitizeVersion(fileData.version);
  const useDb = dbRec && dbVer > fileVer;
  const data = useDb ? dbRec : fileData;

  currentVersion = sanitizeVersion(data.version);
  versionHistory = Array.isArray(data.history) ? data.history.filter(isValidEntry) : [];
  // commitBaseline = the source at the time of the last version event.
  // If the IDB record is ahead, it stored the source as it was when the
  // commit-only happened. Otherwise the file's baked document represents it.
  // Empty string is treated as "no usable baseline" (e.g. legacy record
  // with no commitBaseline field) — fall back to initialSource so dirty
  // state isn't computed against an empty baseline.
  commitBaseline = useDb && typeof data.commitBaseline === 'string' && data.commitBaseline !== ''
    ? data.commitBaseline
    : initialSource;
  // Source: whatever IDB has wins — drafts survive reloads. The presence
  // of the record itself, not the truthiness of source, distinguishes
  // "no draft" from "deliberately empty draft" — clearing the textarea on
  // purpose must not be silently undone by substituting the file's document on reload.
  storedSource = (dbRec && typeof dbRec.source === 'string') ? dbRec.source : null;
}

function sanitizeVersion(n){
  const v = Math.floor(Number(n));
  return Number.isFinite(v) && v >= 0 ? v : 0;
}
function isValidEntry(e){
  return e && typeof e === 'object'
    && Number.isFinite(e.v) && typeof e.t === 'string'
    && (typeof e.m === 'string' || e.m === undefined)
    && (typeof e.s === 'string' || e.s === undefined);
}

async function persistDoc(){
  try {
    await idbPutDoc({
      uuid: docUuid,
      source: sourceEl.value,
      version: currentVersion,
      history: versionHistory,
      commitBaseline,
    });
    setPersistFailed(false);
  } catch (e) {
    console.warn('IDB persist failed:', e);
    setPersistFailed(true);
  }
}

let saveTimer;
function scheduleSave(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistDoc, 250);
}

let persistFailedFlag = false;
function setPersistFailed(failed){
  if (persistFailedFlag === failed) return;
  persistFailedFlag = failed;
  if (versionBtn){
    versionBtn.classList.toggle('persist-failed', failed);
    versionBtn.title = failed
      ? 'Achtung: Versionsdaten konnten nicht im Browser gespeichert werden (Quota?). Klick für Details.'
      : 'Versionsverlauf anzeigen';
  }
}

async function commitNewVersion(message){
  // Capture a gzipped snapshot of the source at this version. Lets readers
  // of the file inspect what the document looked like at any prior version
  // — the basis of the audit story.
  let snapshot = '';
  try { snapshot = await gzipB64(sourceEl.value); }
  catch (e) { console.warn('Version snapshot gzip failed:', e); }

  currentVersion += 1;
  versionHistory = versionHistory.concat([{
    v: currentVersion,
    t: new Date().toISOString(),
    m: message,
    s: snapshot,
  }]);
  commitBaseline = sourceEl.value;
  await persistDoc();
  updateVersionBadge();
}

function updateVersionBadge(){
  if (versionBtn) versionBtn.textContent = 'v' + currentVersion;
}

function formatVersionDate(iso){
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = n => String(n).padStart(2, '0');
  return pad(d.getDate()) + '.' + pad(d.getMonth()+1) + '.' + d.getFullYear() +
         ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function renderVersionModalBody(){
  const body = versionModal && versionModal.querySelector('.version-modal-body');
  if (!body) return;
  if (!versionHistory.length){
    body.innerHTML = '<p class="version-empty">Noch keine Versionen gespeichert. Beim ersten Download „Mit Editor" wird Version 1 angelegt.</p>';
    return;
  }
  const items = [...versionHistory].reverse().map(e => {
    const num = '<span class="v-num">v' + e.v + '</span>';
    const date = '<span class="v-date">' + escapeHtml(formatVersionDate(e.t)) + '</span>';
    const msg = e.m
      ? '<span class="v-msg">' + escapeHtml(e.m) + '</span>'
      : '<span class="v-msg"><em>(ohne Beschreibung)</em></span>';
    return '<li>' + num + date + msg + '</li>';
  }).join('');
  body.innerHTML = '<ol class="version-list">' + items + '</ol>';
}

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
      if (sourceEl.value === commitBaseline){
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

// --- Dirty-state indicator ------------------------------------
// "clean" means: the current editor text is identical to what is baked
// into this HTML file (#dokufix-source, or the demo text for a fresh dokufix file).
// "dirty" means: the user has unsaved changes relative to the file on disk.
// A "Mit Editor"-Download resets the baseline to the new saved content.
let cleanBaseline = '';
const baseTitle = document.title;
const dirtyBadgeEl = document.getElementById('dirty-badge');
function updateDirtyState(){
  const dirty = sourceEl.value !== cleanBaseline;
  document.body.classList.toggle('is-dirty', dirty);
  document.title = (dirty ? '● ' : '') + baseTitle;
  if (dirtyBadgeEl) dirtyBadgeEl.textContent = dirty ? 'geändert' : 'wie in Datei';
}

// Loading the file's document is async (its block may need decompression). See bottom of script.

let mermaidId = 0;

// --- Frontmatter -------------------------------------------------------
// A leading YAML/JSON metadata block is not document content. Left alone,
// marked renders "---\ntitle: X\n---" as an <hr> plus a setext <h2> (the
// closing delimiter underlines the last line) — visible garbage in the
// preview and in every export. We split the block off before parsing and
// render it as a collapsible panel instead.
//
// Deliberately NOT a full YAML implementation: a library (~30 KB) against a
// ~16 KB artifact fails the "body for information" test. Supported subset is
// documented in src/README.md. Anything outside it throws, and the block
// falls back to being shown verbatim — never partially parsed, never
// silently dropped.

// A '#' only opens a comment when preceded by whitespace or at line start,
// so "https://x.com#frag" keeps its fragment.
function fmStripComment(s){
  const m = s.match(/(?:^|\s)#/);
  return m ? s.slice(0, m.index) : s;
}

function fmFindQuoteEnd(s, q){
  for (let i = 1; i < s.length; i++){
    if (q === '"' && s[i] === '\\'){ i++; continue; }
    if (q === "'" && s[i] === "'" && s[i+1] === "'"){ i++; continue; }
    if (s[i] === q) return i;
  }
  return -1;
}

const FM_DQ_ESCAPES = { '"':'"', '\\':'\\', '/':'/', n:'\n', r:'\r', t:'\t' };

function fmScalar(raw){
  const s = raw.trim();
  if (!s) return '';
  const q = s[0];
  if (q === '"' || q === "'"){
    const end = fmFindQuoteEnd(s, q);
    if (end < 0) throw new Error('unterminated quoted scalar');
    const inner = s.slice(1, end);
    if (fmStripComment(s.slice(end + 1)).trim()) throw new Error('trailing content after quoted scalar');
    return q === '"'
      // Every escape we don't decode must throw, not pass through: a literal
      // "café" in the panel is a silent mis-render, and this parser's
      // contract is to fail loudly so the raw block is shown instead.
      ? inner.replace(/\\(.)/g, (_, c) => {
          if (!Object.prototype.hasOwnProperty.call(FM_DQ_ESCAPES, c)) throw new Error('unsupported escape sequence: \\' + c);
          return FM_DQ_ESCAPES[c];
        })
      : inner.replace(/''/g, "'");
  }
  const v = fmStripComment(s).trim();
  // Out-of-subset constructs: fail loudly so the caller can show the raw block.
  if (/^[|>]/.test(v)) throw new Error('block scalars are not supported');
  if (/^[&*]/.test(v)) throw new Error('anchors and aliases are not supported');
  if (/^!/.test(v)) throw new Error('tags are not supported');
  if (/^[[{]/.test(v)) throw new Error('flow collections are not supported');
  // No type coercion on purpose — values are displayed, not computed on.
  return v;
}

function fmUnquoteKey(k){
  const s = k.trim();
  if (s.length > 1 && ((s[0] === '"' && s[s.length-1] === '"') || (s[0] === "'" && s[s.length-1] === "'"))) return s.slice(1, -1);
  return s;
}

function fmIsSeqItem(text){ return text === '-' || text.startsWith('- '); }

// One key alphabet for the whole feature. Three used to disagree: the sniffer's
// [A-Za-z0-9_.-] rejected keys the map parser reads fine ("Prüfer: Ben" reverted
// a whole German header to <hr>+<h2> garbage), and the sequence guard's [\w.-]
// missed keys the map parser accepts ("- Autor Name: Ben" became a scalar). This
// mirrors fmParseMap's own [^:#]+? — anything it calls a key, everyone calls a key.
const FM_KEY_LINE_RE = /^[ \t]*[^:#\s][^:#]*?[ \t]*:(?:[ \t]|$)/;

function fmParseNode(lines, i, indent){
  return fmIsSeqItem(lines[i].text) ? fmParseSeq(lines, i, indent) : fmParseMap(lines, i, indent);
}

// Object.create(null), not {}: "__proto__: x" on a plain object hits the
// inherited setter, so the key never becomes an own property and vanishes from
// the panel with no error. And a repeated key must throw rather than overwrite —
// both are the "half-parsed panel that silently dropped a key" this parser's
// fail-loudly contract rules out. A null-prototype object also makes `key in out`
// an honest own-key test.
function fmDefine(out, key, value){
  if (key in out) throw new Error('duplicate key: ' + key);
  out[key] = value;
}

function fmParseMap(lines, i, indent){
  const out = Object.create(null);
  while (i < lines.length){
    const ln = lines[i];
    if (ln.indent < indent) break;
    if (ln.indent > indent) throw new Error('unexpected indentation on line ' + ln.line);
    if (fmIsSeqItem(ln.text)) break;
    const m = ln.text.match(/^([^:#]+?)\s*:(?:\s+(.*))?$/);
    if (!m) throw new Error('unsupported line: ' + ln.text);
    const key = fmUnquoteKey(m[1]);
    let rest = (m[2] === undefined ? '' : m[2]).trim();
    if (rest.startsWith('#')) rest = '';
    i++;
    if (rest === ''){
      const nxt = lines[i];
      if (nxt && nxt.indent > indent){
        const r = fmParseNode(lines, i, nxt.indent);
        fmDefine(out, key, r.value); i = r.next;
      } else if (nxt && nxt.indent === indent && fmIsSeqItem(nxt.text)){
        // Sequence written flush with its key — the other common YAML style.
        const r = fmParseSeq(lines, i, indent);
        fmDefine(out, key, r.value); i = r.next;
      } else {
        fmDefine(out, key, '');
      }
    } else {
      fmDefine(out, key, fmScalar(rest));
    }
  }
  return { value: out, next: i };
}

function fmParseSeq(lines, i, indent){
  const out = [];
  while (i < lines.length){
    const ln = lines[i];
    if (ln.indent < indent) break;
    if (ln.indent > indent) throw new Error('unexpected indentation on line ' + ln.line);
    if (!fmIsSeqItem(ln.text)) break;
    const rest = (ln.text === '-' ? '' : ln.text.slice(2)).trim();
    i++;
    // "- key: value" (sequence of maps) is outside the subset. Without this
    // guard it would silently become the scalar string "key: value".
    if (FM_KEY_LINE_RE.test(rest)) throw new Error('sequences of maps are not supported');
    if (rest === ''){
      const nxt = lines[i];
      if (nxt && nxt.indent > indent){
        const r = fmParseNode(lines, i, nxt.indent);
        // The same construct spelled across two lines ("-" then an indented
        // "key: value"). Reject both spellings or neither — README lists the
        // construct as unsupported, not one way of writing it.
        if (r.value && typeof r.value === 'object' && !Array.isArray(r.value)) throw new Error('sequences of maps are not supported');
        out.push(r.value); i = r.next;
      } else {
        out.push('');
      }
    } else {
      out.push(fmScalar(rest));
    }
  }
  return { value: out, next: i };
}

function parseYamlSubset(text){
  const lines = [];
  text.split(/\r?\n/).forEach((raw, idx) => {
    if (/^[ \t]*$/.test(raw)) return;
    if (/^[ \t]*#/.test(raw)) return;
    const lead = raw.match(/^[ \t]*/)[0];
    if (lead.includes('\t')) throw new Error('tab indentation is not supported');
    lines.push({ indent: lead.length, text: raw.slice(lead.length).replace(/\s+$/, ''), line: idx + 1 });
  });
  if (!lines.length) throw new Error('empty block');
  const r = fmParseNode(lines, 0, lines[0].indent);
  if (r.next !== lines.length) throw new Error('inconsistent indentation');
  return r.value;
}

// Doubles as the detection signal below: a block carrying one of these is
// frontmatter even with a single entry, because no one opens a document with a
// prose line called "title:".
const FM_SUMMARY_KEYS = ['title', 'version', 'date', 'author'];

// Intent test, kept separate from parsability. A block that doesn't even look
// like a mapping is a thematic break and must render exactly as it always has
// (a doc may legitimately open with "---"). A block that DOES look like
// frontmatter but fails to parse is shown raw rather than reverted to garbage.
//
// "First line is shaped key:" is not enough on its own, because that shape is
// equally an ordinary sentence: "---\nNote: this is a draft.\n---" used to be
// reinterpreted as a one-entry mapping, which moved the author's prose out of
// the body and into a collapsed panel. The tie must never break toward hiding
// body text, so a second signal is required: either two entries, or one
// recognized metadata key. One prose line satisfies neither.
function fmLooksLikeFrontmatter(raw){
  const lines = raw.split(/\r?\n/).filter(l => !/^[ \t]*$/.test(l) && !/^[ \t]*#/.test(l));
  if (!lines.length) return false;
  if (/^[ \t]*\{/.test(lines[0])) return true; // JSON — unambiguous on its own
  let entries = 0;
  let recognized = false;
  for (const line of lines){
    if (/^[ \t]/.test(line)) continue;         // nested value, not a top-level entry
    const m = line.match(FM_KEY_LINE_RE);
    if (!m) continue;
    entries++;
    const key = fmUnquoteKey(line.slice(0, line.indexOf(':'))).toLowerCase();
    if (FM_SUMMARY_KEYS.includes(key)) recognized = true;
  }
  return recognized || entries >= 2;
}

// An unterminated block is the other way body text gets swallowed: the closing
// "---" search is document-wide, so it latches onto the next thematic break and
// drags whole paragraphs into the candidate, which then fails to parse and buries
// them in the "nicht lesbar" panel. Frontmatter never contains blank-line-separated
// prose; a document does. Reject on that signature and the block renders as the
// malformed source it is, with the prose left in the body where the author put it.
function fmHasProseParagraph(raw){
  let blank = false;
  for (const line of raw.split(/\r?\n/)){
    if (/^[ \t]*$/.test(line)){ blank = true; continue; }
    if (/^[ \t]*#/.test(line)) continue;
    const structural = /^[ \t]/.test(line) || fmIsSeqItem(line.trim()) || FM_KEY_LINE_RE.test(line);
    if (blank && !structural) return true;
    blank = false;
  }
  return false;
}

function splitFrontmatter(src){
  const none = { raw: '', kind: null, data: null, body: src };
  if (typeof src !== 'string' || !src) return none;
  const open = src.match(/^---([A-Za-z]*)[ \t]*\r?\n/);
  if (!open) return none;
  const fence = open[1].toLowerCase();
  if (fence && fence !== 'json' && fence !== 'yaml') return none;
  const rest = src.slice(open[0].length);
  const close = rest.match(/^---[ \t]*(?:\r?\n|$)/m);
  if (!close) return none;
  const raw = rest.slice(0, close.index);
  const body = rest.slice(close.index + close[0].length);
  const explicit = !!fence;
  // An explicit but empty header ("---json\n---") has nothing to show. Announcing
  // "nicht lesbar" over an empty <pre> is a lie; consume the block and render
  // nothing. Without a fence an empty block is not frontmatter at all, so it stays
  // two thematic breaks (see deferred-work.md).
  if (!raw.trim()) return explicit ? { raw, kind: null, data: null, body } : none;
  if (!explicit && !fmLooksLikeFrontmatter(raw)) return none;
  if (!explicit && fmHasProseParagraph(raw)) return none;
  const trimmed = raw.trim();
  try {
    if (fence === 'json' || (!fence && trimmed.startsWith('{'))){
      const data = JSON.parse(trimmed);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not a JSON object');
      if (!Object.keys(data).length) throw new Error('empty mapping');
      return { raw, kind: 'json', data, body };
    }
    // Reachable only under an explicit ---yaml fence (the unfenced form is routed
    // to JSON.parse above and throws there). Without it, fmParseMap's lazy key
    // match reads "{a: 1}" as key "{a" / value "1}" — a confident-looking panel
    // over half-parsed data, and the fmScalar flow-collection guard never sees it
    // because it only ever inspects values.
    if (/^[[{]/.test(trimmed)) throw new Error('flow collections are not supported');
    const data = parseYamlSubset(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not a mapping');
    if (!Object.keys(data).length) throw new Error('empty mapping');
    return { raw, kind: 'yaml', data, body };
  } catch (err){
    return { raw, kind: 'raw', data: null, body, error: err.message };
  }
}

// Single source of truth for "what is this document called?" — used by the
// download filename and by all three read-only export <title>s. Reads the
// BODY, so a "#"-prefixed YAML comment can't masquerade as the heading.
function deriveDocTitle(fallback){
  const m = splitFrontmatter(sourceEl.value).body.match(/^#\s+(.+?)\s*$/m);
  return (m ? m[1] : fallback).trim();
}

function fmLookup(data, name){
  const k = Object.keys(data).find(key => key.toLowerCase() === name);
  return k === undefined ? undefined : data[k];
}

function buildFrontmatterSummary(data){
  const parts = [];
  for (const name of FM_SUMMARY_KEYS){
    const v = fmLookup(data, name);
    if (v === null || v === undefined || typeof v === 'object') continue;
    const s = String(v).trim();
    if (s) parts.push(s);
  }
  return parts.join(' · ');
}

function buildFrontmatterValueHtml(v){
  if (v === null || v === undefined || v === '') return '<span class="dokufix-fm-empty">—</span>';
  if (Array.isArray(v)){
    if (!v.length) return '<span class="dokufix-fm-empty">—</span>';
    return '<ul class="dokufix-fm-list">' + v.map(x => '<li>' + buildFrontmatterValueHtml(x) + '</li>').join('') + '</ul>';
  }
  if (typeof v === 'object') return buildFrontmatterRowsHtml(v);
  return escapeHtml(String(v));
}

function buildFrontmatterRowsHtml(obj){
  const keys = Object.keys(obj);
  if (!keys.length) return '<span class="dokufix-fm-empty">—</span>';
  let html = '<dl class="dokufix-fm-rows">';
  for (const k of keys){
    html += '<dt>' + escapeHtml(k) + '</dt><dd>' + buildFrontmatterValueHtml(obj[k]) + '</dd>';
  }
  return html + '</dl>';
}

function buildFrontmatterHtml(fm){
  if (!fm || !fm.kind) return '';
  if (fm.kind === 'raw'){
    return '<details class="dokufix-frontmatter dokufix-fm-unparsed">' +
      '<summary><span class="dokufix-fm-label">Metadaten</span>' +
      '<span class="dokufix-fm-digest">nicht lesbar — Originaltext</span></summary>' +
      '<div class="dokufix-fm-body"><pre class="dokufix-fm-raw">' +
      escapeHtml(fm.raw.replace(/\s+$/, '')) + '</pre></div></details>';
  }
  const count = Object.keys(fm.data).length;
  const digest = buildFrontmatterSummary(fm.data) || (count + (count === 1 ? ' Eintrag' : ' Einträge'));
  return '<details class="dokufix-frontmatter">' +
    '<summary><span class="dokufix-fm-label">Metadaten</span>' +
    '<span class="dokufix-fm-digest">' + escapeHtml(digest) + '</span></summary>' +
    '<div class="dokufix-fm-body">' + buildFrontmatterRowsHtml(fm.data) + '</div></details>';
}

// Post-DOM injection, mirroring processInlineToc: every export variant calls
// render() and then reads previewEl.innerHTML back out, so mutating the live
// preview here is what makes the panel ship into all four downloads for free.
// Emits no headings, so assignHeadingIds/buildRail stay unaffected.
function injectFrontmatterPanel(fm){
  const html = buildFrontmatterHtml(fm);
  if (html) previewEl.insertAdjacentHTML('afterbegin', html);
}

async function render() {
  const fm = splitFrontmatter(sourceEl.value);
  const md = fm.body;
  let html;
  try {
    html = marked.parse(md, { gfm: true, breaks: false });
  } catch (err) {
    previewEl.innerHTML = '<div class="error">Markdown-Fehler: ' + escapeHtml(err.message) + '</div>';
    return;
  }
  // Resolve #asset-<hash> image refs: pull the matching Blobs from IDB and
  // rewrite the html string before insertion so the browser never tries to
  // load the bogus "#asset-…" URL. Unresolved hashes get a transparent
  // placeholder src + data-missing-asset attribute. Prune cache entries
  // for hashes no longer referenced — long sessions would otherwise hold
  // decoded image memory for every image ever inserted.
  const resolution = await resolveAssetRefsInHtml(html);
  pruneAssetUrlCache(resolution.resolved);
  previewEl.innerHTML = resolution.html;
  injectFrontmatterPanel(fm);

  // Heading IDs first — both the inline ToC and the scrollspy rail need them.
  const headings = previewEl.querySelectorAll('h1, h2, h3, h4, h5, h6');
  assignHeadingIds(headings);
  processInlineToc(headings);
  // Order matters: attachFootnotePreviews() resolves each definition through
  // the marker's href, and linkFootnoteReturnPaths() rewrites that href to
  // point at the return arrow. Retargeting first would build every preview
  // out of the "↩" anchor instead of the footnote.
  attachFootnotePreviews();
  linkFootnoteReturnPaths();

  // Convert <pre><code class="language-mermaid">…</code></pre> into <div class="mermaid">…</div>
  previewEl.querySelectorAll('pre code.language-mermaid').forEach(block => {
    const div = document.createElement('div');
    div.className = 'mermaid';
    div.id = 'mermaid-' + (++mermaidId);
    div.textContent = block.textContent;
    block.parentElement.replaceWith(div);
  });

  // Render Mermaid diagrams (if any)
  const nodes = previewEl.querySelectorAll('.mermaid');
  if (nodes.length) {
    try {
      await mermaid.run({ nodes: Array.from(nodes) });
    } catch (err) {
      console.error('Mermaid error:', err);
    }
  }

  // Build the scrollspy rail (read-mode only; CSS gates visibility).
  buildRail(headings);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// --- Table of Contents ----------------------------------------
// Two layers, see README:
//   1. Inline [[toc]] (or [[toc:N]]) marker in markdown → static nested list.
//   2. Right-side scrollspy rail in read mode (wide viewports only).
// Both feed off the same set of generated heading IDs.

function slugify(text, used){
  // Fold most Latin diacritics via NFKD decomposition (é → e, ç → c, ñ → n).
  // German-specific letters are spelled out explicitly because NFKD splits
  // them differently (ä → "a" + combining diaeresis, which would collapse to
  // "a" — we want "ae" instead, the conventional German romanization).
  let slug = String(text)
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')  // strip remaining combining marks
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  if (!slug) slug = 'section';
  // Guard: never let a heading produce an "asset-…" slug — that namespace is
  // reserved for image refs (#asset-<hash>) in the rendered preview, and a
  // collision would let the asset-resolver target a heading anchor.
  if (slug.startsWith('asset-') || slug === 'asset') slug = 'h-' + slug;
  let candidate = slug, i = 1;
  while (used.has(candidate)) candidate = slug + '-' + (++i);
  used.add(candidate);
  return candidate;
}

function assignHeadingIds(headings){
  const used = new Set();
  headings.forEach(h => { if (h.id) used.add(h.id); });
  headings.forEach(h => { if (!h.id) h.id = slugify(h.textContent, used); });
}

function buildTocHtml(headings, maxLevel){
  const items = Array.from(headings).filter(h => {
    const lv = parseInt(h.tagName.substring(1), 10);
    return lv >= 2 && lv <= maxLevel;
  });
  if (!items.length) return '';
  const minLv = Math.min(...items.map(h => parseInt(h.tagName.substring(1), 10)));
  let html = '';
  const open = []; // stack of (relative) levels currently open
  for (const h of items){
    const lv = parseInt(h.tagName.substring(1), 10) - minLv;
    while (open.length && open[open.length-1] > lv){ html += '</li></ol>'; open.pop(); }
    if (!open.length || open[open.length-1] < lv){ html += '<ol>'; open.push(lv); }
    else { html += '</li>'; }
    html += '<li><a href="#' + h.id + '">' + escapeHtml(headingLabelText(h)) + '</a>';
  }
  while (open.length){ html += '</li></ol>'; open.pop(); }
  return html;
}

// Heading text for a ToC or rail label. Not h.textContent: attachFootnotePreviews()
// appends the whole footnote into a <span> inside the marker's <sup>, so a marker
// in a heading drags the entire footnote into the label. textContent is DOM-level
// and does not care that the span is visibility:hidden. processInlineToc() happens
// to run before the preview pass and would escape today, but that is call ordering,
// not a guarantee — buildRail() and buildStaticRailHtml() run after it.
function headingLabelText(h){
  const clone = h.cloneNode(true);
  clone.querySelectorAll('.dokufix-fn-preview').forEach(n => n.remove());
  return clone.textContent;
}

function processInlineToc(headings){
  const paras = previewEl.querySelectorAll('p');
  for (const p of paras){
    // Stricter than textContent.trim(): the paragraph must contain ONLY a
    // text node matching the marker — no inline elements (e.g., <code>,
    // <em>) wrapping it. That way a doc explaining the marker by writing
    // `[[toc]]` (which marked renders as <p><code>[[toc]]</code></p>)
    // doesn't accidentally invoke the feature.
    if (p.children.length !== 0) continue;
    const txt = (p.textContent || '').trim();
    const m = txt.match(/^\[\[toc(?::([1-6]))?\]\]$/);
    if (!m) continue;
    const maxLevel = m[1] ? parseInt(m[1], 10) : 3;
    const inner = buildTocHtml(headings, maxLevel);
    if (!inner){ p.remove(); continue; }
    const nav = document.createElement('nav');
    nav.className = 'dokufix-toc';
    nav.setAttribute('aria-label', 'Inhaltsverzeichnis');
    nav.innerHTML = inner;
    // Smooth scroll on click + update hash without jumping
    nav.addEventListener('click', tocLinkHandler);
    p.replaceWith(nav);
  }
}

// --- Footnote previews -------------------------------------------------
// Hovering (or focusing) a footnote marker shows its text in place, so the
// reader keeps their position. Reveal is pure CSS (:hover / :focus-within on
// the host <sup>) — no listener — which is what makes it work in the JS-free
// nur-lesen export. This pass only injects inert markup at render time.
//
// Footnote parsing itself is marked-footnote's job (see marked.use above);
// this touches only presentation.

// Tags kept as-is inside a preview. Everything else is unwrapped to its
// children — including <a>, whose text we keep but whose link we drop: an
// aria-hidden subtree must not contain focusable elements.
const FN_KEEP_TAGS = new Set(['CODE','EM','STRONG','B','I','SUB','SUP','SMALL','MARK','ABBR','KBD','SAMP','VAR','DEL','INS','SPAN','BR']);
// Unwrapping these joins their content with a space so words don't collide.
const FN_BLOCK_TAGS = new Set(['P','DIV','UL','OL','LI','BLOCKQUOTE','PRE','TABLE','THEAD','TBODY','TR','TD','TH','H1','H2','H3','H4','H5','H6','SECTION','FIGURE','FIGCAPTION','DL','DT','DD','HR']);

// Flatten to phrasing content. This is load-bearing, not cosmetic: the
// preview sits in a <sup> inside the paragraph that carries the marker, and a
// <p> (or <ul>, …) nested in a <p> makes the HTML parser close the outer
// paragraph early. That would quietly shred the document structure of every
// exported file, where the markup is serialised and re-parsed.
function fnFlattenInline(src, out){
  for (const child of src.childNodes){
    if (child.nodeType === Node.TEXT_NODE){
      out.appendChild(child.cloneNode(false));
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    // Uppercase explicitly: tagName is only normalised for HTML-namespace
    // elements, so inline SVG/MathML reports "svg"/"title" verbatim and would
    // miss both sets, falling through to the unwrap default — which renders an
    // <svg><title> accessible name as body copy.
    const tag = child.tagName.toUpperCase();
    if (FN_KEEP_TAGS.has(tag)){
      const el = child.cloneNode(false);
      // cloneNode copies every attribute. An id would be duplicated into the
      // document once per marker (breaking getElementById and in-document
      // links), and tabindex would put a focusable element inside the
      // aria-hidden subtree that unwrapping <a> exists to keep unfocusable.
      el.removeAttribute('id');
      el.removeAttribute('tabindex');
      el.removeAttribute('name');
      fnFlattenInline(child, el);
      out.appendChild(el);
    } else {
      if (FN_BLOCK_TAGS.has(tag) && out.lastChild && !/\s$/.test(out.textContent || '')){
        out.appendChild(document.createTextNode(' '));
      }
      fnFlattenInline(child, out);
    }
  }
}

function buildFootnotePreview(li){
  const clone = li.cloneNode(true);
  // Drop the "↩" return link — it belongs to the definition list, not here.
  clone.querySelectorAll('a[data-footnote-backref]').forEach(a => a.remove());
  // Drop nested markers so a footnote citing a footnote can't nest previews.
  clone.querySelectorAll('a[data-footnote-ref]').forEach(a => {
    const sup = a.parentElement;
    (sup && sup.tagName === 'SUP' ? sup : a).remove();
  });
  const span = document.createElement('span');
  span.className = 'dokufix-fn-preview';
  span.setAttribute('aria-hidden', 'true');
  fnFlattenInline(clone, span);
  // Whitespace from the source markup collapses via CSS (white-space:normal).
  if (!(span.textContent || '').trim()) return null;
  return span;
}

// Point every footnote marker at its OWN return arrow.
//
// marked-footnote renders each reference to a footnote with the same visible
// number and the same href: three citations of [^norm] all read "1" and all
// link to #footnote-norm, while the definition grows three arrows ↩ ↩² ↩³.
// On arrival you cannot tell which arrow leads back to where you came from.
//
// :target only ever knows the current fragment, so CSS cannot distinguish the
// three cases — the only JS-free fix is to give each marker a distinct target.
// The arrow itself becomes that target, which lets CSS mark exactly the right
// one (a[data-footnote-backref]:target) and shade the definition around it
// (li:has(...)). The plain #footnote-<id> anchor keeps working via li:target.
//
// TRADE-OFF: the marker now lands on the arrow, which sits at the END of the
// footnote text, so assistive tech reads "Back to reference" before the prose.
// Documented in src/README.md; see deferred-work.md for the reversal option.
// Pairing goes through each definition, NOT through the arrow's href id.
// marked-footnote does not guarantee footnote-ref-<label>-N is unique: a document
// with both [^bgb] (cited twice) and [^bgb-2] mints id="footnote-ref-bgb-2" twice,
// and resolving by id takes whichever comes first in tree order — which repointed
// [^bgb-2]'s marker at footnote bgb's arrow and landed the reader on the wrong
// footnote, while its hover preview still showed the right text. A marker's href
// names its definition unambiguously, so pair the Nth marker of a definition with
// its Nth arrow: both are in reference order.
function linkFootnoteReturnPaths(){
  const refs = Array.from(previewEl.querySelectorAll('a[data-footnote-ref]'));
  for (const li of previewEl.querySelectorAll('.footnotes li[id]')){
    const arrows = li.querySelectorAll('a[data-footnote-backref]');
    if (!arrows.length) continue;
    const markers = refs.filter(a => a.getAttribute('href') === '#' + li.id);
    arrows.forEach((back, n) => {
      const ref = markers[n];
      if (!ref) return;                                // orphan arrow → leave alone
      const backId = 'footnote-back-' + li.id.replace(/^footnote-/, '') + (n ? '-' + (n + 1) : '');
      // footnote-back-* shares one flat namespace with the definitions
      // (footnote-<label>) and with each other, so [^back-x] beside [^x], or
      // [^bgb] beside [^bgb-2], can mint an id that already exists. slugify()
      // guards its reserved "asset-" namespace the same way. On a collision,
      // leave the marker pointing at its definition: the jump still works and
      // only the arrow marking is lost for that one reference.
      if (previewEl.querySelector('#' + CSS.escape(backId))) return;
      back.id = backId;
      ref.setAttribute('href', '#' + backId);
    });
  }
}

function attachFootnotePreviews(){
  const refs = previewEl.querySelectorAll('a[data-footnote-ref]');
  for (const ref of refs){
    const sup = ref.parentElement;
    if (!sup || sup.tagName !== 'SUP') continue;
    if (sup.querySelector(':scope > .dokufix-fn-preview')) continue; // idempotent
    const href = ref.getAttribute('href') || '';
    if (!href.startsWith('#') || href.length < 2) continue;
    // "li#": resolve only to a definition, never to whatever else carries that id.
    // This is what keeps the pass order-independent. It must run before
    // linkFootnoteReturnPaths() retargets these hrefs at the return arrows; if it
    // ever ran after, an unqualified "#id" would resolve to the ↩ anchor and every
    // preview would silently render as "↩" — no error, just wrong. Now it resolves
    // to nothing and the preview is skipped. CSS.escape is total over strings and
    // cannot throw, so no try/catch is needed here.
    const li = previewEl.querySelector('.footnotes li#' + CSS.escape(href.slice(1)));
    if (!li) continue; // definition missing → no preview, ref still jumps
    const span = buildFootnotePreview(li);
    if (!span) continue;
    sup.classList.add('dokufix-fn-host');
    sup.appendChild(span);
  }
}

function tocLinkHandler(e){
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute('href').slice(1);
  const target = document.getElementById(id);
  if (!target) return;
  e.preventDefault();
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // Some browsers (older Safari, file:// in some Chromium builds) throw
  // SecurityError on history API in non-http contexts. Smooth scroll has
  // already happened — just swallow the hash-update failure.
  try { history.replaceState(null, '', '#' + id); }
  catch (err) { /* ignore */ }
}

// Build a static rail HTML string (no scrollspy) for read-only exports.
// Same structure as the live rail; just anchor links, no JS dependency.
function buildStaticRailHtml(headings){
  const items = Array.from(headings).filter(h => /^H[234]$/.test(h.tagName));
  if (items.length < RAIL_MIN_HEADINGS) return '';
  let html = '<aside class="dokufix-rail has-items" aria-label="Navigation"><ol>';
  for (const h of items){
    html += '<li class="rail-' + h.tagName.toLowerCase() + '">' +
            '<a href="#' + h.id + '">' + escapeHtml(headingLabelText(h)) + '</a></li>';
  }
  html += '</ol></aside>';
  return html;
}

// --- Right-side scrollspy rail --------------------------------
const railEl = document.getElementById('dokufix-rail');
const RAIL_MIN_HEADINGS = 4;
// Click handler is attached ONCE at init; the rail's children are
// rebuilt on each render() but the rail element itself persists.
if (railEl) railEl.addEventListener('click', tocLinkHandler);
// Reading line: where in the viewport we consider "what the reader is currently looking at".
// 25 % from the top — under the eye-line of someone scanning new content.
const READING_LINE_RATIO = 0.25;

// One scroll handler at a time; track it so buildRail can swap it on re-render.
let railScrollHandler = null;
let railResizeHandler = null;

function buildRail(headings){
  if (!railEl) return;

  // Detach previous handlers before rebuilding (re-render of editor source).
  if (railScrollHandler){
    window.removeEventListener('scroll', railScrollHandler);
    railScrollHandler = null;
  }
  if (railResizeHandler){
    window.removeEventListener('resize', railResizeHandler);
    railResizeHandler = null;
  }

  const items = Array.from(headings).filter(h => /^H[234]$/.test(h.tagName));
  if (items.length < RAIL_MIN_HEADINGS){
    railEl.classList.remove('has-items');
    railEl.innerHTML = '';
    return;
  }

  let html = '<ol>';
  for (const h of items){
    html += '<li class="rail-' + h.tagName.toLowerCase() + '">' +
            '<a href="#' + h.id + '">' + escapeHtml(headingLabelText(h)) + '</a></li>';
  }
  html += '</ol>';
  railEl.innerHTML = html;
  railEl.classList.add('has-items');

  // Scrollspy: pick the last heading whose top edge is at or above the reading line.
  // Guarantees a non-empty active state in every position — before the first heading
  // we pick the first; after the last heading we keep the last; mid-section we keep
  // the one we just scrolled past.
  const linksByHash = new Map();
  railEl.querySelectorAll('a').forEach(a => linksByHash.set(a.getAttribute('href'), a));

  let lastActiveHref = null;
  function updateActive(){
    const lineY = window.innerHeight * READING_LINE_RATIO;
    let active = items[0];
    for (const h of items){
      const top = h.getBoundingClientRect().top;
      if (top <= lineY) active = h;
      else break;
    }
    const href = '#' + active.id;
    if (href === lastActiveHref) return;
    lastActiveHref = href;
    for (const [h, a] of linksByHash){
      a.classList.toggle('active', h === href);
    }
    // Keep the active entry visible inside the rail's own scroll container,
    // without nudging the page scroll position.
    const link = linksByHash.get(href);
    if (link){
      const lr = link.getBoundingClientRect();
      const rr = railEl.getBoundingClientRect();
      if (lr.top < rr.top || lr.bottom > rr.bottom){
        railEl.scrollTop += (lr.top + lr.height / 2) - (rr.top + rr.height / 2);
      }
    }
  }

  // rAF-throttled scroll handler — at most one update per frame.
  let pending = false;
  railScrollHandler = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; updateActive(); });
  };
  railResizeHandler = railScrollHandler;
  window.addEventListener('scroll', railScrollHandler, { passive: true });
  window.addEventListener('resize', railResizeHandler, { passive: true });

  updateActive(); // initial state, before any scroll
}

btnEl.addEventListener('click', render);

sourceEl.addEventListener('input', () => { scheduleSave(); updateDirtyState(); });
sourceEl.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    render();
  }
});

// --- Image input: paste, drag-and-drop, file-picker -----------
// All three pathways converge on handleImageInsert(file), which runs the
// pipeline (decode → downscale → WebP → hash → IDB) and inserts a
// markdown reference at the cursor.

// Clipboard paste (e.g. Win+Shift+S screenshot, Mac Cmd+Ctrl+Shift+4)
sourceEl.addEventListener('paste', async e => {
  const items = e.clipboardData ? e.clipboardData.items : null;
  if (!items) return;
  const imgs = [];
  for (const it of items){
    if (it.kind === 'file' && it.type && it.type.startsWith('image/')){
      const f = it.getAsFile();
      if (f) imgs.push(f);
    }
  }
  if (!imgs.length) return;  // let the normal text paste through
  e.preventDefault();
  for (const f of imgs) await handleImageInsert(f);
});

// Drag-and-drop on the source pane. Highlights via .is-drop-target.
const sourcePane = document.querySelector('.pane-source');
if (sourcePane){
  let dragDepth = 0;
  const hasFile = ev => ev.dataTransfer && Array.from(ev.dataTransfer.types || []).includes('Files');
  sourcePane.addEventListener('dragenter', e => {
    if (!hasFile(e)) return;
    e.preventDefault();
    if (dragDepth++ === 0) sourcePane.classList.add('is-drop-target');
  });
  sourcePane.addEventListener('dragover', e => {
    if (!hasFile(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  sourcePane.addEventListener('dragleave', e => {
    if (!hasFile(e)) return;
    if (--dragDepth <= 0){ dragDepth = 0; sourcePane.classList.remove('is-drop-target'); }
  });
  sourcePane.addEventListener('drop', async e => {
    if (!hasFile(e)) return;
    e.preventDefault();
    dragDepth = 0;
    sourcePane.classList.remove('is-drop-target');
    const files = Array.from(e.dataTransfer.files || []).filter(f => f.type.startsWith('image/'));
    for (const f of files) await handleImageInsert(f);
  });
}

// "+ Bild" toolbar button → hidden file input
const imgBtn = document.getElementById('img-btn');
const imgInput = document.getElementById('img-input');
if (imgBtn && imgInput){
  imgBtn.addEventListener('click', () => imgInput.click());
  imgInput.addEventListener('change', async () => {
    const files = Array.from(imgInput.files || []);
    for (const f of files) await handleImageInsert(f);
    imgInput.value = '';  // allow reselecting the same file
  });
}

// "Demo zurücksetzen" — restore the immutable demo text (not this file's document, which a download overwrites)
resetEl.addEventListener('click', () => {
  if (sourceEl.value === demoText || confirm('Demo-Text zurücksetzen? Aktuelle Änderungen gehen verloren.')){
    sourceEl.value = demoText;
    persistDoc();
    updateDirtyState();
    render();
    sourceEl.focus();
  }
});

// --- Download menu --------------------------------------------
const downloadWrap = document.getElementById('download-wrap');
const downloadBtn  = document.getElementById('download-btn');

function toggleMenu(force){
  const willOpen = (typeof force === 'boolean') ? force : !downloadWrap.classList.contains('open');
  downloadWrap.classList.toggle('open', willOpen);
  downloadBtn.setAttribute('aria-expanded', String(willOpen));
}
downloadBtn.addEventListener('click', e => { e.stopPropagation(); toggleMenu(); });
document.addEventListener('click', e => {
  if (!downloadWrap.contains(e.target)) toggleMenu(false);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && downloadWrap.classList.contains('open')) toggleMenu(false);
});

downloadWrap.querySelectorAll('button[data-download]').forEach(btn => {
  btn.addEventListener('click', async () => {
    if (!initDone || downloadInFlight) return;
    toggleMenu(false);
    // For read-only downloads we set the in-flight gate here.
    // downloadWithEditor() manages its own gate (it can take more steps).
    const variant = btn.dataset.download;
    if (variant === 'full'){
      await downloadWithEditor();
      return;
    }
    setDownloadInFlight(true);
    try {
      if (variant === 'readonly-open')     await downloadReadonlyOpen();
      if (variant === 'readonly-slim')     await downloadReadonlySlim();
      if (variant === 'readonly-compact')  await downloadReadonlyCompact();
    } finally {
      setDownloadInFlight(false);
    }
  });
});

// Filename helper — pull title from the first H1 of the markdown
function safeFilenameBase(){
  let base = deriveDocTitle('dokufix-dokument');
  base = base.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/\s+/g, '-').slice(0, 80);
  return base || 'dokufix-dokument';
}
function triggerDownload(filename, content, mime='text/html;charset=utf-8'){
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// Init gate — set true at end of the async IIFE. Until then, download
// buttons (and any state-mutating user actions) are disabled so a click
// during slow CDN load can't fire against half-initialized state.
let initDone = false;
let downloadInFlight = false;
function setDownloadInFlight(flag){
  downloadInFlight = flag;
  downloadWrap.querySelectorAll('button[data-download]').forEach(b => {
    b.disabled = flag;
  });
}

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

async function downloadWithEditor(){
  if (!initDone) return;
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
  if (docUuid.startsWith('loc-')){
    clearTimeout(saveTimer);
    const oldUuid = docUuid;
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
    docUuid = newUuid;
  }
  // Only ask for a commit message if there are actual changes since the last
  // version event. If the source already matches the last commit/save, we
  // silently re-emit the current version — no prompt, no bump.
  const hasUncommittedChanges = sourceEl.value !== commitBaseline;
  let pendingVersion = currentVersion;
  let pendingHistory = versionHistory;
  let pendingCommitBaseline = commitBaseline;
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
    pendingVersion = currentVersion + 1;
    pendingHistory = versionHistory.concat([{
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
      uuid: docUuid,
      version: pendingVersion,
      history: pendingHistory,
    });

    const docClone = document.documentElement.cloneNode(true);

    // Strip transient UI state from the clone
    docClone.querySelectorAll('.menu-wrap.open').forEach(el => el.classList.remove('open'));
    // The "in-flight" disabled state must not survive into the saved file —
    // receivers must be able to use their download buttons immediately.
    docClone.querySelectorAll('button[disabled]').forEach(b => b.removeAttribute('disabled'));
    // Receiver will recompute dirty state on init against the new baseline.
    docClone.querySelector('body')?.classList.remove('is-dirty');
    // Reset the title — strip the leading "● " from dirty-state.
    const titleClone = docClone.querySelector('title');
    if (titleClone) titleClone.textContent = baseTitle;
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
    if (errClone) errClone.hidden = true;
    // Drop the transient .is-drop-target class on the source pane clone.
    docClone.querySelectorAll('.is-drop-target').forEach(el => el.classList.remove('is-drop-target'));
    const versionBadgeClone = docClone.querySelector('#version-btn');
    if (versionBadgeClone){
      versionBadgeClone.textContent = 'v' + pendingVersion;
      versionBadgeClone.classList.remove('persist-failed');
    }

    // Write the demo text and the current source into the clone's data blocks,
    // both gzip-compressed:
    //   #dokufix-demo    preserved from this session (immutable original demo)
    //   #dokufix-source  current source content
    // Receiver's async init decompresses both on load.
    const sourceGz    = await gzipB64(sourceEl.value);
    const demoPayload = demoGz || await gzipB64(demoText);
    const demoClone = docClone.querySelector('#dokufix-demo');
    if (demoClone) demoClone.textContent = encodeJsonForScript({ gz: demoPayload });
    const sourceClone = docClone.querySelector('#dokufix-source');
    if (sourceClone) sourceClone.textContent = encodeJsonForScript({ gz: sourceGz });

    const html = '<!DOCTYPE html>\n' + docClone.outerHTML;
    triggerDownload(safeFilenameBase() + '.html', html);

    // Download initiated successfully. Now (and only now) mutate global state.
    currentVersion = pendingVersion;
    versionHistory = pendingHistory;
    commitBaseline = pendingCommitBaseline;
    cleanBaseline = sourceEl.value;
    updateDirtyState();
    updateVersionBadge();
    await persistDoc();
  } finally {
    setDownloadInFlight(false);
  }
}

// --- Gliederungsnummerierung (Heading numbering) ----------------
const NUMBERING_KEY = 'dokufix-poc-numbering';
const numberingBtn  = document.getElementById('numbering-btn');
function applyNumbering(on){
  document.body.classList.toggle('numbered', on);
  numberingBtn.classList.toggle('toggle-on', on);
  numberingBtn.setAttribute('aria-pressed', String(on));
  try { localStorage.setItem(NUMBERING_KEY, on ? '1' : '0'); } catch(e){}
}
numberingBtn.addEventListener('click', () => {
  applyNumbering(!document.body.classList.contains('numbered'));
});
// Restore saved preference on load
try {
  if (localStorage.getItem(NUMBERING_KEY) === '1') applyNumbering(true);
} catch(e){}

// --- Styles of the read-only exports ---------------------------
// A read-only export gets two things, in this order:
//   1. the document styles, read from the #dokufix-doc-css block in <head>
//      when the file is written — the same block the preview is using, so
//      the two cannot drift apart;
//   2. the frame below: reset, page margins, the footer, the rail grid.
// "noscript p" is frame too: the kompakt export's "needs JavaScript" notice sits
// outside the content container, and without this rule the rail beside it would
// stand 17 px higher than it did when p{} was an unscoped rule.
// A rule for document content does NOT go into the frame. It goes into the
// block in <head>, or the editor and "Mit Editor" never see it.
// tests/check-doc-styles.mjs fails when one turns up here.
const READONLY_FRAME_CSS = `*{box-sizing:border-box;margin:0;padding:0}
body{
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  color:#1c1c1e;background:#fff;line-height:1.5;
  max-width:950px;margin:0 auto;padding:80px 32px 120px;
  font-size:17px;-webkit-font-smoothing:antialiased;
}
.reader-body{min-width:0}
.dokufix-meta{margin-top:4em;padding-top:1.5em;border-top:1px solid #e5e5ea;font-size:.85em;color:#8e8e92}
.dokufix-meta p{margin:0}
noscript p{margin-bottom:1em}
@media (min-width:1500px){
  body:has(aside.dokufix-rail.has-items){max-width:1562px;display:grid;grid-template-columns:minmax(0, 1fr) 425px;column-gap:73px;padding:80px 32px 120px}
  body:has(aside.dokufix-rail.has-items) .reader-body{max-width:1000px;margin:0 auto;width:100%}
  .dokufix-rail.has-items{display:block;position:sticky;top:80px;max-height:calc(100vh - 100px);align-self:start}
}
.dokufix-rail-pending{pointer-events:none;opacity:.4;transition:opacity .25s ease}
@media (max-width:820px){body{padding:64px 22px 96px;font-size:16px}}`;

// Comments out, whitespace down to what CSS needs. Quoted strings are left
// alone: content:"Bild fehlt: " must keep its space.
function compactCss(css){
  const STR = '("(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\')';
  return css
    .replace(new RegExp(STR + '|\\/\\*[\\s\\S]*?\\*\\/|\\s+', 'g'), (m, str) => str || (m[0] === '/' ? '' : ' '))
    .replace(new RegExp(STR + '|\\s*([{};])\\s*', 'g'), (m, str, punct) => str || punct)
    .replace(new RegExp(STR + '|;}', 'g'), (m, str) => str || '}')
    .trim();
}

// The complete stylesheet of a read-only export. Every export template must
// use this and nothing else for its <style>.
function readonlyCss(){
  const block = document.getElementById('dokufix-doc-css');
  return compactCss(block ? block.textContent : '') + '\n' + READONLY_FRAME_CSS;
}

function bodyClassForExport(){
  return document.body.classList.contains('numbered') ? ' class="numbered"' : '';
}

function escTitle(s){ return String(s).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])); }

// Small metadata block appended to read-only exports. Always emits at least
// an export timestamp — even on files that have never been saved (v0) — so
// every read-only artifact carries a "when was this generated" anchor.
function buildMetaFooterHtml(){
  const nowStr = escapeHtml(formatVersionDate(new Date().toISOString()));
  if (currentVersion === 0 || !versionHistory.length){
    return '<footer class="dokufix-meta"><p>Exportiert: ' + nowStr + ' · ungespeicherte Fassung</p></footer>';
  }
  const last = versionHistory[versionHistory.length - 1];
  const dateStr = escapeHtml(formatVersionDate(last.t));
  const msgStr = last.m ? ' · ' + escapeHtml(last.m) : '';
  return '<footer class="dokufix-meta"><p>Version ' + last.v + ' · ' + dateStr + msgStr +
         ' · exportiert ' + nowStr + '</p></footer>';
}

// --- Download #2a — pure read-only, no JS, fully open HTML ---
async function downloadReadonlyOpen(){
  await render(); // ensure preview reflects current source AND mermaid SVGs are inlined

  const title = deriveDocTitle('dokufix-Dokument');
  // Inline every image asset as a data: URL — the receiver of a read-only
  // export has no IDB and may not even have JS, so blob URLs (live preview)
  // and "#asset-…" refs (unresolved) both need to become self-contained.
  const bodyHtml = await inlineAssetRefsAsDataUrls(previewEl.innerHTML);
  const railHtml = buildStaticRailHtml(previewEl.querySelectorAll('h1, h2, h3, h4, h5, h6'));

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escTitle(title)}</title>
<style>${readonlyCss()}</style>
</head>
<body${bodyClassForExport()}>
<main class="reader-body dokufix-doc">
${bodyHtml}
${buildMetaFooterHtml()}
</main>
${railHtml}
</body>
</html>`;

  triggerDownload(safeFilenameBase() + '-nur-lesen.html', html);
}

// --- Download #2b — schlank: text plain, only Mermaid SVGs gzipped per-element ---
async function downloadReadonlySlim(){
  await render();

  const title = deriveDocTitle('dokufix-Dokument');

  // Work on a clone of the rendered preview, with image refs inlined as
  // data: URLs so the export is fully self-contained.
  const wrapper = document.createElement('div');
  wrapper.innerHTML = await inlineAssetRefsAsDataUrls(previewEl.innerHTML);

  // Replace each Mermaid SVG with a placeholder div that carries gzipped+base64 SVG payload.
  // The text/HTML around it stays as readable plaintext.
  let svgCount = 0;
  for (const div of wrapper.querySelectorAll('.mermaid')){
    const svg = div.querySelector('svg');
    if (!svg) continue;
    const gz = await gzipB64(svg.outerHTML);
    div.setAttribute('data-gz', gz);
    div.innerHTML = ''; // emptied — decoder fills it on load
    svgCount++;
  }

  // Tiny inline decoder (only emitted if there are diagrams to expand)
  const decoder = svgCount > 0
    ? `<script>(async()=>{for(const el of document.querySelectorAll('[data-gz]')){try{const u=Uint8Array.from(atob(el.getAttribute('data-gz')),c=>c.charCodeAt(0));const r=new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip')));el.innerHTML=await r.text();el.removeAttribute('data-gz');}catch(e){console.error('SVG decode failed',e);}}})();<\/script>`
    : '';

  const noscript = svgCount > 0
    ? `<noscript><style>.mermaid[data-gz]{display:block;padding:24px;border:1px dashed #d8d8da;color:#8e8e92;text-align:center;font-size:14px;font-style:italic}.mermaid[data-gz]::before{content:"[Mermaid-Diagramm — JavaScript erforderlich, um es anzuzeigen]"}</style></noscript>`
    : '';

  const railHtml = buildStaticRailHtml(previewEl.querySelectorAll('h1, h2, h3, h4, h5, h6'));

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escTitle(title)}</title>
<style>${readonlyCss()}</style>
${noscript}
</head>
<body${bodyClassForExport()}>
<main class="reader-body dokufix-doc">
${wrapper.innerHTML}
${buildMetaFooterHtml()}
${decoder}
</main>
${railHtml}
</body>
</html>`;

  triggerDownload(safeFilenameBase() + '-schlank.html', html);
}

// --- Download #2c — read-only, fully gzip-compressed, tiny JS decoder ---
async function downloadReadonlyCompact(){
  await render();

  const title = deriveDocTitle('dokufix-Dokument');
  // Image refs become data: URLs before gzipping. Binary PNG/WebP doesn't
  // compress meaningfully a second time, but base64 itself shrinks by ~30 %
  // through gzip, so the overall cost vs an open export is modest.
  const inlinedBody = await inlineAssetRefsAsDataUrls(previewEl.innerHTML);
  const bodyHtml = inlinedBody + buildMetaFooterHtml();
  const payload = await gzipB64(bodyHtml);
  // Rail stays outside the compressed payload so it appears immediately
  // (no flash of empty navigation while the body decompresses).
  // Mark the rail as pending — clicks would race against decompression
  // (anchor targets don't exist until the body is filled). CSS dims it
  // and disables pointer events; the decoder removes the class on done.
  const railHtmlPending = buildStaticRailHtml(previewEl.querySelectorAll('h1, h2, h3, h4, h5, h6'))
    .replace(/class="dokufix-rail has-items"/, 'class="dokufix-rail has-items dokufix-rail-pending"');

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escTitle(title)}</title>
<style>${readonlyCss()}</style>
</head>
<body${bodyClassForExport()}>
<noscript><p style="padding:40px 32px;color:#8b1300">Diese kompakte Variante benötigt JavaScript zum Entpacken. Wenn JavaScript nicht erlaubt ist, bitte die offene Variante (-nur-lesen.html) anfordern.</p></noscript>
<main class="reader-body dokufix-doc"><div id="d"></div></main>
${railHtmlPending}
<script type="text/plain" id="p">${payload}<\/script>
<script>
(async()=>{
  const b=document.getElementById('p').textContent.trim();
  const u=Uint8Array.from(atob(b),c=>c.charCodeAt(0));
  const r=new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip')));
  document.getElementById('d').innerHTML=await r.text();
  const rail=document.querySelector('.dokufix-rail-pending');
  if(rail) rail.classList.remove('dokufix-rail-pending');
})();
<\/script>
</body>
</html>`;

  triggerDownload(safeFilenameBase() + '-kompakt.html', html);
}

// Hamburger menu (mobile)
const hamburgerBtn  = document.getElementById('hamburger');
const headerActions = document.getElementById('header-actions');
hamburgerBtn.addEventListener('click', e => {
  e.stopPropagation();
  const willOpen = !headerActions.classList.contains('open');
  headerActions.classList.toggle('open', willOpen);
  hamburgerBtn.setAttribute('aria-expanded', String(willOpen));
});
document.addEventListener('click', e => {
  if (!headerActions.contains(e.target) && e.target !== hamburgerBtn){
    headerActions.classList.remove('open');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
  }
});

// View / Editor toggle
const viewBtn = document.getElementById('view-btn');
const editBtn = document.getElementById('edit-btn');
viewBtn.addEventListener('click', async () => {
  await render();              // make sure preview reflects latest source
  document.body.classList.add('mode-view');
  window.scrollTo(0, 0);
  document.getElementById('preview').scrollTop = 0;
});
editBtn.addEventListener('click', () => {
  document.body.classList.remove('mode-view');
  sourceEl.focus();
});
// ESC leaves view mode
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.body.classList.contains('mode-view')) {
    document.body.classList.remove('mode-view');
    sourceEl.focus();
  }
});

// Async init — reads the demo text and this file's document from their data
// blocks (decompressing them if they are gzipped), opens IDB, migrates legacy
// localStorage if present, then loads source + renders.
(async () => {
  const demo = await readTextBlock('dokufix-demo');
  demoText = demo.text;
  demoGz = demo.gz;
  const fallback = (await readTextBlock('dokufix-source')).text || demoText;

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
    docUuid = fallbackUuidFromLocation();
    const el = document.getElementById('dokufix-history');
    if (el){
      try {
        const parsed = JSON.parse((el.textContent || '').trim() || '{}');
        if (parsed && typeof parsed === 'object'){
          if (typeof parsed.uuid === 'string' && parsed.uuid) docUuid = parsed.uuid;
          currentVersion = sanitizeVersion(parsed.version);
          versionHistory = Array.isArray(parsed.history) ? parsed.history.filter(isValidEntry) : [];
        }
      } catch (e) { console.warn('File history parse failed (degraded mode):', e); }
    }
    commitBaseline = fallback;
    storedSource = null;
    setPersistFailed(true);
  }

  // Baseline = what's actually baked into THIS file. A draft restored from
  // IDB that differs from the baseline correctly reads as "geändert".
  cleanBaseline = fallback;
  // A record exists (storedSource is a string) → respect it even if it's
  // empty — that means the user cleared the textarea deliberately. No
  // record → fall back to the file's document or demo so the doc is readable.
  sourceEl.value = (storedSource !== null) ? storedSource : fallback;
  updateDirtyState();
  updateVersionBadge();
  render();
  initDone = true;
})();
