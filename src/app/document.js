import { ungzipB64 } from './gzip.js';

// --- Demo text and this file's document ------------------------
// Both live in data blocks of the page, not in this script:
//   #dokufix-demo    the immutable original demo text, for "Demo zurücksetzen"
//   #dokufix-source  this file's document; empty in a fresh dokufix file
// A block holds {"text": …} (as built from src/demo.md) or {"gz": …} (gzip +
// base64, as "Mit Editor" writes it). Saving writes the blocks of the cloned
// document through the DOM, so nothing depends on the text of this script,
// which the build minifies. The async init in src/app.js reads both.
export async function readTextBlock(id){
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

// --- Per-document identity ------------------------------------
// Each dokufix file carries a UUID baked into its #dokufix-history JSON.
// Both localStorage keys (editor source + version history) are suffixed
// with this UUID, so two different dokufix files in the same browser
// no longer collide on storage. Files predating this feature load with
// no UUID; we generate one for the session and bake it on first save.
export function generateDocUuid(){
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
export function fallbackUuidFromLocation(){
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
