# Story 1.2: Hover and Focus Previews for Footnotes

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a reader working through a document with citations,
I want to see a footnote's text by hovering (or keyboard-focusing) its reference marker,
so that I can take in the aside without jumping to the bottom of the document and losing my reading position — including in the JavaScript-free reading copy.

## Acceptance Criteria

1. **Hover shows the footnote text in place.** Hovering a footnote reference marker shows a preview containing that footnote's text, anchored near the marker, without navigating away. The preview element follows the `dokufix-` class-prefix convention and disappears when the pointer leaves. [FR7]
2. **Implemented without JavaScript.** The preview appears in the JS-free `nur-lesen` export, driven purely by CSS. Base positioning must not depend on any CSS feature unsupported by current Firefox or Safari; progressive refinements must degrade to a still-usable preview. [FR7, NFR2, NFR7]
3. **Keyboard reachable.** When the footnote reference receives focus, the preview appears on the same terms as on hover. [FR8]
4. **Ships through every variant.** The preview works in `Mit Editor`, `nur-lesen`, `schlank`, and `kompakt`. Required CSS exists in both the live `#preview` block and in `READONLY_CSS`. [NFR1, NFR4]
5. **Existing footnote behaviour is preserved.** The footnote list at the document end, the reference anchors, and the backref links behave exactly as before; clicking a reference still jumps to the definition; a screen reader does not announce the footnote text twice. [FR9]
6. **Size impact is measured.** The export size delta for a representative footnote document is measured across all four variants and recorded in the completion notes; if material, noted in `poc/README.md` alongside the existing size table. [NFR6]

## Tasks / Subtasks

- [ ] **Task 1: Build the preview injection pass** (AC: 1, 5)
  - [ ] Add `attachFootnotePreviews()` — a post-DOM pass over `previewEl`, following the `processInlineToc` pattern (L1564).
  - [ ] For each `a[data-footnote-ref]`, resolve its target `<li>` in `section.footnotes` via the ref's `href` fragment.
  - [ ] Clone the target's content, **strip the backref link** (`a[data-footnote-backref]`) from the clone, and strip any nested `a[data-footnote-ref]` markers to avoid recursive previews.
  - [ ] Wrap/insert a `<span class="dokufix-fn-preview" aria-hidden="true">` as a sibling of the ref anchor inside its `<sup>`. See Dev Notes → *Why `aria-hidden`* (AC5).
  - [ ] Call it from `render()` after `previewEl.innerHTML = resolution.html` (L1470) — anywhere in the DOM-transform half, e.g. next to `processInlineToc` (L1475).
  - [ ] Make it a no-op when the document has no footnotes, and tolerate a missing/unresolvable definition (skip that ref, don't throw).
- [ ] **Task 2: CSS-only show/hide — twice** (AC: 1, 2, 3, 4)
  - [ ] Add `#preview`-prefixed rules to the main `<style>` block near the existing footnote rules (L362–379).
  - [ ] Add the unprefixed twin to `READONLY_CSS` next to its footnote rules (L2104–2111).
  - [ ] Hide by default; reveal on `:hover` **and** `:focus-within` on the containing `<sup>` (AC3 comes free from `:focus-within` — the ref is a focusable `<a>`).
  - [ ] Position with classic `position: absolute` inside a `position: relative` `<sup>`. Constrain with `max-width: min(32rem, 90vw)`. Do **not** make base positioning depend on CSS anchor positioning (Dev Notes → *Positioning*).
  - [ ] Use `visibility`/`opacity` rather than `display:none` so a transition is possible; keep it consistent with the file's existing decorative `:hover` transitions.
  - [ ] Match the existing palette; do not introduce CSS custom properties.
- [ ] **Task 3: Verify all four export variants** (AC: 2, 4)
  - [ ] Export a footnote document as all four variants and hover-test each.
  - [ ] **Explicitly confirm `nur-lesen` still contains no `<script>` tag** and that previews work there.
  - [ ] Check the preview is not clipped by an ancestor `overflow` and renders above following content (`z-index`), especially inside the 2-column grid read mode.
- [ ] **Task 4: Measure size impact** (AC: 6)
  - [ ] Export a representative footnote-bearing document before and after; record the delta per variant in Completion Notes.
  - [ ] If material, add a note to `poc/README.md` near the size table.
- [ ] **Task 5: Documentation**
  - [ ] Document the preview in `poc/README.md`.
  - [ ] **Also document the pre-existing footnote support**, which is currently undocumented (Dev Notes → *Documentation debt*).
  - [ ] Record deferred edge cases (e.g. touch behaviour, viewport-edge overflow) in `_bmad-output/implementation-artifacts/deferred-work.md`.

## Dev Notes

### Footnotes already work — this story adds only the preview

**Do not build footnote parsing.** `marked-footnote` is already loaded and registered:

- CDN script tag: L659 — `https://cdn.jsdelivr.net/npm/marked-footnote/dist/index.umd.min.js`
- Registration: L671–672
  ```js
  // Enable GFM footnotes ([^id] inline + [^id]: definition)
  if (typeof markedFootnote === 'function') {
    marked.use(markedFootnote());
  }
  ```
  Note the `typeof` guard — a CDN failure degrades silently rather than throwing.
- This is also the **only** `marked.use()` in the file. There is no custom renderer, no `walkTokens`, no custom tokenizer; options are passed per-call at L1457.

**Existing rendered shape.** `[^id]` → `<sup><a data-footnote-ref href="#footnote-id" id="footnote-ref-id">1</a></sup>`; `[^id]: …` → a `<section class="footnotes">` at document end containing an `<ol>` of `<li>` with `<a data-footnote-backref>` return arrows. Confirm the exact `id`/`href` shape in the browser before coding against it — it comes from the plugin, not from this codebase.

**Existing CSS, already duplicated in both stylesheets:**

- Live, L362–379:
  ```css
  #preview .footnotes{margin-top:3em;padding-top:1.5em;border-top:1px solid #e5e5ea;font-size:.9em;color:#3a3a3f;}
  #preview .footnotes h2{display:none}
  #preview sup a, #preview a[data-footnote-ref]{text-decoration:none;font-weight:700;padding:0 2px;color:#0066cc;}
  #preview a[data-footnote-backref]{text-decoration:none;margin-left:4px;opacity:.55;}
  ```
- Export twin, L2104–2111 — same rules, `#preview` stripped.
- `.footnotes h2{display:none}` (L368, L2105) hides the plugin's generated heading.

Live demo content already exercises footnotes: L1151 references `[^selbstbezug]`, L1153 defines it. Use it for manual testing.

### Why post-DOM injection ships to exports for free

Every export variant calls `await render()` and then reads `previewEl.innerHTML` back out:

- `downloadReadonlyOpen()` L2142–2169 (reads at L2143/2149)
- `downloadReadonlySlim()` L2173–2226 (L2174/2181)
- `downloadReadonlyCompact()` L2229–2273 (L2230/2237)

So a DOM mutation performed during `render()` lands in all exports automatically — no export-specific code. `processInlineToc` (L1564–1586) relies on exactly this; the only live-only part it keeps is a smooth-scroll click listener (L1584), which exports simply drop in favour of native anchor jumps. **Mirror that discipline: the preview must be complete without any listener.**

`render()` structure — steps 2–5 are string transforms, steps 6–11 are DOM transforms on `#preview`:

| # | Step | Line |
|---|---|---|
| 2 | `marked.parse(...)` | 1457 |
| 6 | `previewEl.innerHTML = resolution.html` — string→DOM boundary | **1470** |
| 7 | `assignHeadingIds(headings)` | 1474 |
| 8 | `processInlineToc(headings)` | **1475** ← insert the new pass around here |
| 10 | `await mermaid.run({ nodes })` | 1487–1494 |
| 11 | `buildRail(headings)` — live-only | 1497 |

### JS-free export constraint — confirmed

`downloadReadonlyOpen()` (L2142–2169) emits `<!DOCTYPE html>` + `<style>${READONLY_CSS}</style>` + `<main class="reader-body">${bodyHtml}</main>` + meta footer + rail, with **no `<script>` tag in the template** (verified L2153–2168). Only `schlank` (1-line gzip SVG decoder at L2197, emitted only when `svgCount > 0`) and `kompakt` (payload + decoder, L2259–2270) carry script.

AC2 is therefore satisfied by construction **only if the reveal is pure CSS**. The injection pass runs at render time in the authoring session; what lands in the export is inert markup plus CSS. Do not reach for a JS positioning/show-hide handler — that would work in `Mit Editor` and silently fail in `nur-lesen`, which is the variant the product owner specifically asked about.

### Why `aria-hidden` on the preview (AC5)

The footnote text will exist **twice** in the DOM: once in the preview span, once in the `section.footnotes` list. The ref anchor already points assistive tech at the definition. Marking the preview `aria-hidden="true"` prevents the same text being announced twice while leaving it fully visible to sighted hover/focus users. The preview is decorative duplication of content that is already reachable — that is precisely the case `aria-hidden` exists for.

Do not put the preview inside the `<a>`: that would make the link's accessible name the entire footnote text. Keep it a **sibling of the anchor**, inside the `<sup>`, and hang `:hover`/`:focus-within` off the `<sup>`.

### Positioning (the one real design risk)

- **Base:** `position: absolute` inside `position: relative` on the `<sup>`, e.g. `left: 50%; transform: translateX(-50%)`, plus `max-width: min(32rem, 90vw)` and a `z-index` above body content. Works in every target browser.
- **CSS anchor positioning** (`anchor-name` / `position-try-fallbacks`) would solve viewport-edge flipping elegantly, but as of 2026 it is **not available across Firefox and Safari**. NFR7 forbids depending on it. If you want the refinement, add it behind `@supports (position-try-fallbacks: flip-block)` so unsupported browsers keep the working base — never the other way round.
- **Accepted limitation:** a footnote ref at the far edge of the content column may clip or overflow slightly. The content column is 1000 px centered (grid read mode; see `poc/README.md` → *Table of Contents (two layers)*), so there is usually margin to spare. If it proves ugly, prefer a CSS-only mitigation (clamp width, bias the transform) over introducing JS. Record the residual in `deferred-work.md`.
- **Overflow/clipping:** check ancestors for `overflow` that would clip an absolutely-positioned child, particularly in the 2-column grid read mode and inside the rail-adjacent layout (`:has()` layout rules at L546, L2088–2089).
- **Touch:** `:hover` does not exist on touch. Tapping the ref focuses the `<a>` (firing `:focus-within`) *and* navigates to the definition — the existing anchor jump remains the touch fallback, which is acceptable. Note it in the README rather than engineering around it.

### Styling conventions (L7–569 and L2047–2118)

- **The CSS duplication tax applies.** `READONLY_CSS` (L2047–2118) is a hand-maintained duplicate of the main `<style>` block with `#preview` stripped and editor chrome dropped, with no sharing mechanism and no drift detection. **Every rule this story adds lands twice** — next to the footnote rules in each (L362–379 live / L2104–2111 export).
- **No CSS custom properties, no `:root`, no `var()`, no dark mode** in this file. Do not introduce them here.
- Palette: `#1c1c1e` text · `#f5f5f7` background · `#e5e5ea` borders · `#8e8e92` muted · `#0066cc` links · `#d4ff00` lime accent · `#fafafa` panel background. Footnote text already uses `#3a3a3f` at `.9em` (L366) — the preview should feel like the same family.
- **Naming:** `dokufix-` prefix for constructs that ship into exports (`dokufix-toc` L322, `dokufix-rail` L501, `dokufix-meta` L2085). Hence `dokufix-fn-preview`.
- Existing `:hover` usage is decorative only (color/opacity/border transitions — L347, L379, L534, L2081, L2100, L2111). **No `:hover` tooltip pattern exists yet**; this story introduces the first one.
- `:has()` is already used for layout (L546, L2088–2089), so modern selectors are acceptable within NFR7.

### Documentation debt

**Footnote support is entirely undocumented in `poc/README.md`** despite being live in the PoC and used by the demo content. Task 5 fixes this: document both the pre-existing footnote capability and the new preview. The repo has a consistent README-follows-feature habit (commits `41e7857`, `e5bd8f0`).

### Known robustness note (not this story's scope)

The CDN dependency is **unpinned** (L658–660: `npm/marked`, `npm/marked-footnote`, `npm/mermaid` — no version) and the footnote plugin is silently optional (L671). A breaking upstream release, or a CDN failure, would silently drop footnotes — and with them, these previews. This is flagged rather than fixed: the PoC's CDN usage is a known, documented limitation (`poc/README.md` → *Known PoC limitations*, and the L657 comment *"CDN libraries (PoC only — production bundle will inline these)"*), and pinning/inlining belongs to the MVP build-pipeline work, not here. **If the preview pass depends on the plugin's DOM shape, guard it** so a missing plugin yields no previews rather than an exception.

### Project Structure Notes

- Single-file PoC by design: all changes land in `poc/dokufix-poc.html`. No new files, no build step (`poc/README.md:179`).
- No persistence change: previews are derived at render time from the source; nothing new is stored. Do not touch the IndexedDB schema.
- Independent of Story 1.1: that story intercepts *before* `marked.parse`; this one post-processes *after* it. They overlap only in both needing CSS added to both stylesheets. Either order works; if 1.1 has already landed, rebase onto its `render()` shape.

### Testing standards

No automated test suite exists (`_bmad-output/test-artifacts/` is empty) and no framework is configured. Verification is manual browser testing, consistent with all prior work. At minimum exercise:

- The demo document's existing footnote (L1151/L1153) — hover, and Tab-focus (AC1, AC3).
- A document with no footnotes → pass is a no-op, nothing breaks (AC5).
- Multi-paragraph footnote content, and a footnote containing a link or inline code → preview renders, backref stripped (AC1).
- Reference near the right edge of the content column → note behaviour (positioning limitation).
- Clicking a ref still jumps to the definition; backref still returns (AC5).
- All four download variants; `nur-lesen` checked for absence of `<script>` (AC2, AC4).
- Cross-browser: at minimum Chrome and Firefox, given NFR7.
- Size delta measured per variant (AC6).

### References

- Footnote plugin load and registration: [Source: poc/dokufix-poc.html#L657-L660, #L671-L672]
- Existing footnote CSS (live): [Source: poc/dokufix-poc.html#L362-L379]
- Existing footnote CSS (export twin): [Source: poc/dokufix-poc.html#L2104-L2111]
- Demo content using a footnote: [Source: poc/dokufix-poc.html#L1151, #L1153]
- Render pipeline and DOM-transform half: [Source: poc/dokufix-poc.html#L1453-L1498]
- DOM injection point: [Source: poc/dokufix-poc.html#L1470-L1475]
- Post-DOM marker precedent `processInlineToc`: [Source: poc/dokufix-poc.html#L1564-L1586]
- `READONLY_CSS` export stylesheet: [Source: poc/dokufix-poc.html#L2047-L2118]
- JS-free export template: [Source: poc/dokufix-poc.html#L2142-L2169]
- Read-only exports re-reading `previewEl.innerHTML`: [Source: poc/dokufix-poc.html#L2142-L2273]
- Grid read-mode layout and content-column width: [Source: poc/README.md#Table of Contents (two layers)]
- Known PoC limitations incl. CDN libraries: [Source: poc/README.md#Known PoC limitations (deferred to MVP)]
- Browser-target and no-CDN constraints: [Source: _bmad-output/planning-artifacts/product-brief-dokufix-distillate.md#Technical Direction (Not in the Brief, but Decided)]
- "Body for information" scope test: [Source: _bmad-output/planning-artifacts/product-brief-dokufix-distillate.md#Identity & Framing]
- Epic and scope justification: [Source: _bmad-output/planning-artifacts/epics.md#Epic 1: Metadata Headers and Footnote Previews]

## Dev Agent Record

### Agent Model Used

_To be filled by the dev agent._

### Debug Log References

### Completion Notes List

### File List
