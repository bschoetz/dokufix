import { ungzipB64 } from './gzip.js';
import { idbGetAsset, idbPutAsset, idbBatchGetAssets } from './idb.js';
import { sourceEl } from './dom.js';
import { state } from './state.js';
import { render } from './render.js';

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
export function pruneAssetUrlCache(keepHashes){
  for (const [h, u] of assetUrlCache){
    if (!keepHashes.has(h)){
      URL.revokeObjectURL(u);
      assetUrlCache.delete(h);
    }
  }
}
export function registerAssetUrlCleanup(){
  window.addEventListener('beforeunload', () => {
    for (const u of assetUrlCache.values()) URL.revokeObjectURL(u);
    assetUrlCache.clear();
  });
}

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
export async function seedAssetsFromBakedBlock(){
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
export async function resolveAssetRefsInHtml(html){
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
export async function inlineAssetRefsAsDataUrls(html){
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
// snapshots — every prior version stays fully reconstructible from the file —
// AND any the demo text refers to, so that "Demo zurücksetzen" shows its
// images in every saved file (Ben, 2026-10-03).
//
// An asset that storage does not hold, or every asset when storage is not
// there at all, is taken from this page's own block if it is there: a file
// passes on what it carries. Without storage and without that, the bake fails
// as before.
export async function bakeAssetsForDocument(){
  const hashes = new Set(collectAssetHashes(sourceEl.value));
  for (const h of collectAssetHashes(state.demoText)) hashes.add(h);
  for (const e of state.versionHistory){
    if (!e || typeof e.s !== 'string' || !e.s) continue;
    try {
      const src = await ungzipB64(e.s);
      for (const h of collectAssetHashes(src)) hashes.add(h);
    } catch (err) {
      console.warn('History snapshot decode failed during asset bake:', err);
    }
  }
  if (!hashes.size) return {};
  const carried = bakedBlockEntries();
  let assetMap = new Map();
  try { assetMap = await idbBatchGetAssets([...hashes]); }
  catch (e) {
    if (![...hashes].some(h => carried[h])) throw e;
    console.warn('Asset bake without storage, from the file\'s own block:', e);
  }
  const out = {};
  for (const h of hashes){
    const rec = assetMap.get(h);
    if (rec && rec.blob){
      try {
        const b64 = await blobToBase64(rec.blob);
        out[h] = { m: rec.mime || 'image/webp', d: b64 };
        continue;
      } catch (e) { console.warn('Asset bake failed for ' + h + ':', e); }
    }
    if (carried[h]) out[h] = carried[h];
  }
  return out;
}

// The entries of this page's own #dokufix-assets block, by hash: { m, d }.
function bakedBlockEntries(){
  const el = document.getElementById('dokufix-assets');
  const out = {};
  let parsed;
  try { parsed = JSON.parse((el && el.textContent || '').trim() || '{}'); }
  catch (e) { return out; }
  if (!parsed || typeof parsed !== 'object') return out;
  for (const [hash, val] of Object.entries(parsed)){
    if (/^[0-9a-f]{64}$/i.test(hash) && val && typeof val.d === 'string' && val.d){
      out[hash.toLowerCase()] = { m: typeof val.m === 'string' ? val.m : 'image/webp', d: val.d };
    }
  }
  return out;
}

// --- Image input: paste, drag-and-drop, file-picker -----------
// All three pathways converge on handleImageInsert(file), which runs the
// pipeline (decode → downscale → WebP → hash → IDB) and inserts a
// markdown reference at the cursor.

export function registerImageInput(){
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
}
