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
- **Two-layer Table of Contents** — author-placed inline `[[toc]]` marker (renders as a static nested list inside the document, ships through every export variant) plus a JS-driven right-side scrollspy rail in read mode on wide viewports.
- **Dirty-state indicator** — a header badge (and a `●` prefix in the browser tab title) shows whether the editor content matches what is baked into the file. Resets to clean after a "Mit Editor" download.
- **In-file version history** — each "Mit Editor" download increments a counter and appends a `{v, t (ISO), m (optional message)}` entry to a JSON block embedded in the file (`<script type="application/json" id="dokufix-history">` — non-executing, just data). A clickable `v{N}` badge in the header opens a modal listing every saved version, newest first. Read-only exports inherit a small `Version N · DD.MM.YYYY HH:MM · message` footer at the end of the document.
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

### Table of Contents (two layers)

Two complementary mechanisms, deliberately separate:

- **Inline `[[toc]]` marker** — write `[[toc]]` (default H2+H3) or `[[toc:4]]` (down to H4) on its own line in the markdown. At render time, the paragraph is replaced with a nested `<nav class="dokufix-toc">` list. The list is **static HTML** — it travels through every export variant including the JS-free `nur-lesen` one, and the numbering toggle reaches it via a dedicated `tocH2/tocH3/tocH4` counter scope (no double-counting with body headings).
- **Right-side rail** — auto-generated from H2/H3/H4 headings, visible above ~1500 px viewport when the document has ≥ 4 such headings. At wide viewports the body switches to a 2-column **grid**: a 1000 px content column (centered in its track) and a 425 px rail column, sharing the same horizontal budget with a 73 px gap instead of overlapping. The body caps at 1562 px (1000 + 73 + 425 + 64 padding), so from 1562 px upward both columns hit their exact target widths; between 1500 and 1561 px the content track flexes a little while the rail stays pinned. The rail uses `position: sticky; top: 80px` so it stays in view during scroll while still participating in the grid for sizing. Two flavors of the same UI:
  - **Live (editor / `Mit Editor` downloads):** scroll-based "reading line" scrollspy picks the last heading whose top edge sits at or above 25 % of the viewport — so there is always exactly one active entry (the first heading before scrolling, the last after the document ends, the just-scrolled-past one in between). The active link is auto-scrolled into view inside the rail's own scroll container so it stays visible in long tables of contents. Smooth-scrolls on click. Visible only in read mode.
  - **Static (read-only downloads — `nur-lesen`, `schlank`, `kompakt`):** pre-built HTML emitted at export time with the same heading list and CSS, but no JS dependency. Clicking jumps via native anchor — no scrollspy, no smooth scroll. Survives the JS-free `nur-lesen` variant.

Heading IDs are slugified deterministically (umlaut-aware, ASCII-folded, deduped), so anchor links remain stable across re-renders and across the editor/receiver boundary.

### Version history

Two ways to create a new version entry:

1. **"Mit Editor" download (canonical save).** Asks for an optional message via `prompt()`. Cancel aborts entirely; Enter on an empty input proceeds without a message. The counter bumps, the entry lands in the history list, and the file is emitted with everything baked in.
2. **Commit-only (button in the version modal).** Same prompt, same bump, same history append — but no file is produced. The new state is persisted to `localStorage` under `dokufix-poc-versions-v1` so it survives a reload. Later "Mit Editor" downloads pick up all accumulated commits.

Both flows are **skipped silently when the source matches the last committed/saved state** (the `commitBaseline`). Clicking "Mit Editor" on an unchanged document re-emits the same version without a prompt or counter bump; clicking it right after a commit-only does the same. There is no "make me ask anyway" path — by design, every prompt corresponds to actual uncommitted changes.

On load, version state comes from whichever of the two sources is more recent: the file's baked-in `<script type="application/json" id="dokufix-history">` block, or `localStorage`. localStorage wins when commit-onlys have happened since the last download. Files without the history block (older dokufix files predating this feature) load as `version: 0, history: []`; the first save bootstraps the history at `v1`.

Read-only downloads do *not* bump the version — they ship the current `Version N · timestamp · message` as a footer (inside the compressed payload for the `kompakt` variant so it survives decompression). They are derivatives of a saved version, not new saves.

### Dirty-state baseline

The dirty indicator compares the live editor against `cleanBaseline`, which is set to `SAMPLE || DEMO` at load time — i.e. whatever is actually baked into *this* HTML file on disk. Consequences:

- A `localStorage` draft that differs from the baked content reads as **geändert** immediately on open. That's the intended "you have unsynced work" signal after a crash or tab close.
- A successful "Mit Editor" download resets `cleanBaseline` to the just-saved content → badge flips to clean. The downloaded HTML file also carries the new baseline, so the receiver opens it as clean.
- The other download variants (read-only) don't touch the baseline, since they don't carry editable source out the door.

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
