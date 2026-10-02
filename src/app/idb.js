// --- IndexedDB layer ------------------------------------------
// One DB per origin, two stores:
//   docs   (keyPath: uuid)  — one record per dokufix file: source, version, history, commitBaseline
//   assets (keyPath: hash)  — image Blobs, content-addressed by SHA-256 hex (auto-dedup, no GC needed)
const IDB_NAME = 'dokufix-v1';
const IDB_VERSION = 1;
let _dbPromise = null;
export function openDB(){
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
export async function idbGetDoc(uuid){
  const db = await openDB();
  return _idbReq(db.transaction('docs', 'readonly').objectStore('docs').get(uuid));
}
export async function idbPutDoc(rec){
  const db = await openDB();
  rec.updatedAt = new Date().toISOString();
  return _idbReq(db.transaction('docs', 'readwrite').objectStore('docs').put(rec));
}
export async function idbDeleteDoc(uuid){
  const db = await openDB();
  return _idbReq(db.transaction('docs', 'readwrite').objectStore('docs').delete(uuid));
}
export async function idbGetAsset(hash){
  const db = await openDB();
  return _idbReq(db.transaction('assets', 'readonly').objectStore('assets').get(hash));
}
export async function idbPutAsset(rec){
  const db = await openDB();
  return _idbReq(db.transaction('assets', 'readwrite').objectStore('assets').put(rec));
}
export async function idbBatchGetAssets(hashes){
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
export function showStorageError(detail){
  const el = document.getElementById('storage-error');
  if (!el) { alert('Speicher nicht verfügbar: ' + detail); return; }
  const msgEl = el.querySelector('.storage-error-msg');
  if (msgEl && detail) msgEl.textContent = '(' + detail + ') ';
  el.hidden = false;
}
// The banner lies over the top of the page, the "Editor" button included. Its
// close button hides it for as long as the page is open; the next opening
// shows it again if storage is still unavailable.
export function registerStorageBanner(){
  const el = document.getElementById('storage-error');
  const closeBtn = el && el.querySelector('.storage-error-close');
  if (closeBtn) closeBtn.addEventListener('click', () => { el.hidden = true; });
}
