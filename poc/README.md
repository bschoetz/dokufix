# dokufix — Proof of Concept

A working prototype of the **dokufix** vision: one HTML file that is simultaneously the viewer, the editor, and the artifact for technical documentation written in Markdown + Mermaid.

Open `dokufix-poc.html` in any modern browser. No install, no server, no account.

## What this PoC demonstrates

- **Markdown + Mermaid rendering** in the browser via `marked` and `mermaid` (loaded from CDN — production will inline these).
- **Viewer ↔ Editor toggle.** Default mode is the reader experience; a discreet "Editor ↩" button in the corner reveals the editing UI.
- **IndexedDB-style persistence** (currently `localStorage` for PoC speed) — every keystroke survives a tab close, a refresh, or a crash.
- **Explicit save** — leaving edit mode does **not** auto-save; saving is a deliberate user action via the Download menu.
- **Self-replication** — the "Mit Editor" download produces a new HTML file with the user's content baked in (gzip-compressed). The receiver opens that file and starts from there.
- **Three read-only export tiers** — open / schlank / kompakt, each with different size-vs-portability tradeoffs.
- **Heading numbering toggle** — opt-in 1.2.3 outline numbering via pure CSS counters.
- **Mobile-friendly** — hamburger menu collapses the editor toolbar on narrow viewports.

## Download variants

| Variant | What's in the file | Receiver can re-edit? | JS required to open? | Approx. size (demo content) |
|---|---|---|---|---|
| **Mit Editor** | Full editor + gzipped Markdown source + immutable demo-text reset capability | ✅ Yes | ✅ (via CDN libs) | ~16 KB + libs |
| **Ohne Editor — offen** (`-nur-lesen.html`) | Pre-rendered HTML + inline SVG diagrams, no JavaScript at all | ❌ No | ❌ | ~30 KB |
| **Ohne Editor — schlank** (`-schlank.html`) | Plaintext HTML + Mermaid SVGs gzip-compressed individually, tiny inline decoder | ❌ No | ⚠️ For diagrams only — text remains readable | ~10 KB |
| **Ohne Editor — kompakt** (`-kompakt.html`) | Entire body gzip-compressed + tiny decoder | ❌ No | ✅ | ~6 KB |

## Architecture notes

### `DEMO` vs `SAMPLE`

Two distinct concepts, deliberately separated:

- **`DEMO`** — the immutable original demo text, shipped gzip-compressed in every downloaded file. The "Demo zurücksetzen" button always restores from this. It is never overwritten on re-download.
- **`SAMPLE`** — this file's per-document default (what gets loaded on first open if `localStorage` is empty). On `Mit Editor` download, this is replaced with the user's current content.

Loading order on open: `localStorage` > `SAMPLE` > `DEMO`.

### Compression

All compression uses native browser **`CompressionStream('gzip')`** — no library dependency.

Brotli would compress 15–25% better, but is currently *missing* from `CompressionStream` in Chrome / Edge as of May 2026 (Firefox 147 and Safari 18.4 have shipped it). We stay on gzip until Chrome catches up. Migration is a one-line swap.

### `</script>` escaping

Template literals embedded inside the main `<script>` element use `<\/script>` to avoid the HTML parser prematurely closing the outer script tag. Classic gotcha — escape both the payload-holder tag and the inner decoder script.

### Self-replication mechanism

The script wraps two reassignable blocks with comment markers:

```js
// === DEMO-START ===
let DEMO = `…demo text…`;
let DEMO_GZ = '';
// === DEMO-END ===

// === SAMPLE-START ===
let SAMPLE = '';
let SAMPLE_GZ = '';
// === SAMPLE-END ===
```

On "Mit Editor" download, both blocks are rewritten in the cloned document:

- `DEMO_GZ` ← gzipped immutable demo
- `SAMPLE_GZ` ← gzipped current source

The receiver's async-init decompresses both before first render.

### `<script type="text/plain">` payload

The "kompakt" variant ships gzip+base64-encoded HTML inside a `<script type="text/plain">` element. This works because the browser does not execute the script (wrong MIME), but the contents are accessible via `textContent`. Decoder reads, decompresses via `DecompressionStream`, sets `innerHTML`.

## Known PoC limitations (deferred to MVP)

- **CDN-loaded libraries** — production target is single-file inline. Will roughly 200× the editor variant's file size from ~16 KB to ~3 MB once Mermaid is bundled.
- **`localStorage` not IndexedDB** — fine for plaintext-only PoC; needs IndexedDB once base64 images push payloads past the ~5 MB localStorage cap.
- **localStorage cross-contamination on `file://`** — multiple dokufix files in the same browser share state. Fix: per-document storage keys derived from a UUID baked into each file at save time.
- **No File System Access API integration** — Chromium-only, optional power-user path. Not in PoC. See product brief distillate for design.
- **Mermaid SVG bloat unaddressed** — each SVG ships a redundant 1.5–3 KB `<style>` block. Future optimization: dedupe to a single document-level `<style>`.

## File layout

```
poc/
├── dokufix-poc.html    The PoC itself. Open in browser.
└── README.md           This file.
```

The PoC is intentionally a single file. Everything you see when you open it (HTML, CSS, JS, demo content, assets) lives inside that one file.

## Related artifacts

- Product brief: `../_bmad-output/planning-artifacts/product-brief-dokufix.md`
- Distillate (technical decisions, open questions): `../_bmad-output/planning-artifacts/product-brief-dokufix-distillate.md`
- One-pager pitches (DE/EN): `../_bmad-output/planning-artifacts/one-pager-dokufix-users*.md`
- Landing page: `../_bmad-output/planning-artifacts/landing-dokufix.html`
- Original brainstorming: `../_bmad-output/brainstorming/brainstorming-session-2026-04-30-2055.md`
