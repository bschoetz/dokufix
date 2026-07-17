# Story 1.1: Collapsible Metadata Panel for YAML and JSON Frontmatter

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an author handing a document to a non-technical reader,
I want a YAML or JSON header block at the top of my Markdown to render as a tidy, collapsible metadata panel,
so that the document opens looking like a finished document instead of leaking its header as broken markup — and so the reader can still see title, owner, and version when they want them.

## Acceptance Criteria

1. **YAML frontmatter renders as a panel.** A document starting with `---`, YAML key/value lines, and a closing `---` renders that block as a single `<details class="dokufix-frontmatter">` at the top of the preview, above the first heading. No `<hr>` and no `<h2>` derived from the delimiters appear. [FR1]
2. **Key/value pairs are laid out legibly.** Each pair is a labelled row with key and value visually distinguished. Nested maps and sequences render as nested rows — never flattened, never `[object Object]`. All values are HTML-escaped. [FR1]
3. **JSON frontmatter renders through the same panel.** Both `---json` … `---` and a `---` … `---` block whose content begins with `{` produce the same panel via the same rendering path. [FR2]
4. **Collapsible without JavaScript.** The panel expands/collapses by mouse and by keyboard in every variant including the JS-free `nur-lesen` export, with no `<script>` added to that export. [FR3, NFR2]
5. **Collapsed state is informative.** Default state is collapsed; the summary line shows a compact digest of the most useful available keys, not just a generic label. [FR4]
6. **Frontmatter never becomes the title or filename.** With a `#`-prefixed line inside the frontmatter (e.g. YAML comment `# internal draft`) and a real `# Heading` in the body, both the download filename and the export `<title>` derive from the body heading. [FR5]
7. **Unparseable frontmatter degrades safely.** A block parseable as neither JSON nor the supported YAML subset must not throw; the rest of the document renders, and the raw text is shown verbatim inside the panel rather than discarded. No source content is lost. [FR6, NFR3]
8. **A leading thematic break is not mistaken for frontmatter, and prose is never swallowed.** A document legitimately starting with a `---` thematic break renders exactly as it does today. *Amended during code review 2026-07-16:* the original second clause ("or whose `---` block does not resolve to a key/value mapping") contradicted AC7 for a bare `---` fence and was never implemented — detection is an **intent** test, deliberately separate from parsability, so a block that looks like frontmatter but fails to parse gets the raw panel (AC7) rather than reverting to garbage. Intent now requires two signals: **two or more entries, or one recognized metadata key**. One prose line shaped `Note: this is a draft.` satisfies neither and stays body text; a lone `title: X` still gets its panel. An unterminated block whose candidate contains blank-line-separated prose is likewise rejected, so the prose stays in the body instead of being buried in a collapsed panel. [FR6]
9. **Ships through every variant.** The panel is present, styled, and collapsible in `Mit Editor`, `nur-lesen`, `schlank`, and `kompakt`. Required CSS exists in both the live `#preview` block and in `READONLY_CSS`. [NFR1, NFR4]

## Tasks / Subtasks

- [x] **Task 1: Add the `splitFrontmatter` seam** (AC: 1, 3, 6, 8)
  - [x] Add `splitFrontmatter(src)` near the other source-level helpers, returning `{ raw, kind, data, body }` — or a null-object (`{ raw: '', kind: null, data: null, body: src }`) when no valid frontmatter is present. *(Corrected 2026-07-16: the spec said `bodyOffset`; it was never implemented and nothing consumes it — it would only matter for source-mapping editor selections, which is out of scope. The shipped shape adds an `error` field on the raw path instead.)*
  - [x] Detection rule: the **very first line** of the source must be exactly `---` (or `---json` / `---yaml`), and a closing `---` line must follow. No leading blank lines permitted before the opening delimiter.
  - [x] **Guard against false positives (AC8):** *(rewritten 2026-07-16 to describe what shipped — the original text specified a parse-based guard that would have made AC7's raw panel unreachable, and was correctly discarded during implementation without the spec being updated.)* Gate on **intent**, not parsability: `fmLooksLikeFrontmatter()` requires two or more key/value entries **or** one recognized metadata key (`title`/`version`/`date`/`author`), or a `{` first line for JSON. `fmHasProseParagraph()` additionally rejects a candidate containing blank-line-separated prose, which is the signature of an unterminated block that ran to the document's next thematic break. A block passing intent but failing to parse gets the raw panel (AC7); a block failing intent returns the null-object and renders unchanged (AC8).
  - [x] Keep this function pure and side-effect free — it is called from four sites.
- [x] **Task 2: Parse the two content shapes** (AC: 2, 3, 7)
  - [x] JSON path: content trimmed starts with `{`, **or** the fence is `---json`. Use `JSON.parse` in a try/catch.
  - [x] YAML path: implement the deliberate subset described in Dev Notes → *Scope decision: the YAML subset*. Do **not** bundle a YAML library.
  - [x] On parse failure of either path, return `kind: 'raw'` with the verbatim text so Task 4 can render it as a fallback (AC7). Never throw out of `splitFrontmatter`.
- [x] **Task 3: Strip frontmatter from the parse and title paths** (AC: 1, 6)
  - [x] In `render()` (L1453), feed `splitFrontmatter(sourceEl.value).body` to `marked.parse` instead of the raw `sourceEl.value` (L1457).
  - [x] Route `safeFilenameBase()` (L1832) through `splitFrontmatter(...).body` before applying its `/^#\s+(.+?)\s*$/m` match. **This is an active defect fix** — see Dev Notes.
  - [x] Route the three export `<title>` derivations (L2145, L2176, L2232) through the same body. Consider extracting the repeated regex into one `deriveDocTitle()` helper used by all four sites rather than patching the regex in four places.
- [x] **Task 4: Build and inject the panel** (AC: 1, 2, 5, 7)
  - [x] Add `buildFrontmatterHtml(fm)` — a pure string builder in the style of `buildTocHtml` (L1544). Escape everything via the existing `escapeHtml` (L1500). *(Corrected 2026-07-16: the spec said `(kind, data, raw)`; the shipped signature takes the whole `fm` object.)*
  - [x] Emit `<details class="dokufix-frontmatter">` + `<summary>` digest + a `<dl>`-style body. Recurse for nested maps/sequences.
  - [x] Summary digest (AC5): join **all** present keys from a small preference list (`title`, `version`, `date`, `author`) with `·`, in that order; fall back to a generic label plus the key count when none match. Keep the preference list short and obvious. *(Corrected 2026-07-16: this said "pick the first available", and `poc/README.md` repeated it; the code joins every one that is present, which is the better behaviour and what AC5 actually asks for — "a compact digest of the most useful available keys". The prose was wrong, not the code. The list doubles as the detection signal — see Task 1.)*
  - [x] `kind: 'raw'` fallback: emit the same `<details>` shell with the verbatim block inside a `<pre>`, and a summary that signals the block could not be parsed (AC7).
  - [x] Inject in `render()` **immediately after** `previewEl.innerHTML = resolution.html` (L1470) by prepending to `previewEl` — mirroring the post-DOM pattern of `processInlineToc`. See Dev Notes → *Why post-DOM injection*.
- [x] **Task 5: Style it — twice** (AC: 1, 2, 4, 9)
  - [x] Add `#preview`-prefixed rules to the main `<style>` block (L7–569), near the ToC/footnote rules.
  - [x] Add the unprefixed twin to `READONLY_CSS` (L2047–2118).
  - [x] Style the native `<details>`/`<summary>` disclosure so it reads as document furniture, not a debug dump. Match the existing palette (Dev Notes → *Styling conventions*). Do not introduce CSS custom properties — the file has none.
  - [x] Ensure the panel does not disturb the `[[toc]]` nav or the rail (it contains no headings, so `assignHeadingIds`/`buildRail` are unaffected — verify).
- [x] **Task 6: Verify all four export variants** (AC: 4, 9)
  - [x] Manually export a frontmatter document as all four variants and open each.
  - [x] **Explicitly confirm `nur-lesen` contains no `<script>` tag** and that the panel still toggles there.
- [x] **Task 7: Documentation**
  - [x] Document the feature in `poc/README.md`: the supported delimiters, the YAML subset and its limits, the collapse default, and the raw-fallback behaviour.
  - [x] Record any newly discovered edge cases in `_bmad-output/implementation-artifacts/deferred-work.md` if deferred.

### Review Findings

Code review 2026-07-16 (Blind Hunter + Edge Case Hunter + Acceptance Auditor). AC2, AC4, AC6 and AC9 were re-verified by execution and hold.

- [x] [Review][Patch] *(was Decision — resolved by Ben 2026-07-16: **require a second signal**)* Gate on `≥2 key/value entries OR ≥1 recognized metadata key` (`title`/`version`/`date`/`author`, reusing `FM_SUMMARY_KEYS`), and bound the block so an unterminated one cannot run to the document's next thematic break (stop at a blank line followed by prose). `Note: this is a draft.` = 1 entry, no recognized key → stays body prose. `title: X` alone → still a panel. **The panel can swallow body prose — two triggers, one gate** — `fmLooksLikeFrontmatter` accepts any first line shaped `Word: text`, so a legitimate `---`/`Note: this is a draft.`/`---` opener is reinterpreted as a one-entry mapping: the prose leaves the body and lands in a **collapsed** `<details>`, in all four exports (verified: `kind: yaml`, `data: {"Note":"this is a draft."}`). Separately, the closing-delimiter search is unbounded (`/^---[ \t]*(?:\r?\n|$)/m`), so an *unterminated* block runs to the document's next thematic break, fails to parse, and buries the intervening prose in the "nicht lesbar" raw panel. README claims `---\nSome intro.\n---` "is left completely untouched" — true only because that example has no colon. The gate needs a corroborating signal (entry count, recognized metadata keys, block length, max span) to break the tie; picking one is a product call. Note the interaction: widening the key alphabet (patch below) slightly widens this blast radius. [poc/dokufix-poc.html:1776-1782, 1794]
- [x] [Review][Patch] Sniffer key alphabet is stricter than the parser's, so a German first key reverts the block to pre-feature `<hr>`+`<h2>` garbage *and* regresses AC6 (`# internal draft` becomes the H1, file downloads as `internal-draft.html`); verified: `Prüfer: Ben` → sniffer `false`, parser reads key `"Prüfer"` [poc/dokufix-poc.html:1781]
- [x] [Review][Patch] `fmParseMap` assigns into a plain `{}`, so duplicate keys silently overwrite and `__proto__` vanishes through the inherited setter — both return `kind:'yaml'` without the raw fallback, the exact "half-parsed panel that silently dropped a key" the Completion Notes rule out [poc/dokufix-poc.html:1699, 1715, 1724]
- [x] [Review][Patch] `poc/README.md` and Task 4 both say the summary digest is "the first available of `title`, `version`, `date`, `author`"; `buildFrontmatterSummary` loops all four and joins them with ` · ` — there is no `break` anywhere in it, so "first available" never happens. The code is the better behaviour and is what AC5 asks for; the prose was wrong [poc/README.md · this file, Tasks §4]
- [x] [Review][Patch] Top-level flow mapping under an explicit fence half-parses instead of throwing: `---yaml\n{a: 1}\n---` → `dt="{a"`, `dd="1}"`; the unfenced form correctly throws to the raw panel, so being explicit yields the worse result [poc/dokufix-poc.html:1786-1814]
- [x] [Review][Patch] Sequence-of-maps guard uses `[\w.-]+`, so `- Autor Name: Ben` and `- Größe: 5` bypass it and become scalar strings — the silent-scalar outcome the guard's own comment says it prevents [poc/dokufix-poc.html:1741]
- [x] [Review][Patch] Sequence-of-maps is rejected by spelling, not semantics: `authors:\n  - name: Ben` throws, but the equivalent `authors:\n  -\n    name: Ben` parses and renders fine — `deferred-work.md` scopes the construct as unsupported, not one spelling of it [poc/dokufix-poc.html:1744-1751]
- [x] [Review][Patch] Unrecognized double-quote escapes pass through literally — `title: "café"` renders the text `café` rather than failing loudly to the raw panel [poc/dokufix-poc.html:1673]
- [x] [Review][Patch] Empty-mapping guard exists only on the YAML branch, so `---\n{}\n---` yields a contentless "0 Einträge" panel while the YAML twin throws `empty mapping` [poc/dokufix-poc.html:1804]
- [x] [Review][Patch] Empty explicit fence (`---json\n---`) announces "nicht lesbar — Originaltext" over an empty `<pre>` — a raw panel with no raw text to show [poc/dokufix-poc.html:1862-1870]
- [x] [Review][Patch] Task 1's `[x]` subtask specifies a parse-based AC8 guard ("if parsing yields no mapping, return the null-object"); the shipped rule is intent-based (looks-like → panel, raw on parse failure). The deviation is the better design and is argued in the Completion Notes — but AC8's second clause and the subtask text still assert the discarded rule [this file, Tasks §1 / AC8]
- [x] [Review][Patch] README promises out-of-subset constructs "fail loudly rather than partially" and lists multi-document streams as unsupported; in fact `---\na: 1\n---\nb: 2\n---` parses doc 1 confidently and leaks `b: 2` into the body as a setext `<h2>` [poc/README.md]
- [x] [Review][Patch] Two `[x]` subtasks specify shapes that do not exist: `splitFrontmatter` returns no `bodyOffset` (nothing consumes it), and the signature is `buildFrontmatterHtml(fm)`, not `(kind, data, raw)` [this file, Tasks §1 and §4]

**Dismissed as noise:** panel `open` state lost on re-render (Blind Hunter, `speculative`) — premise disproved: `render()` fires only on button click and Ctrl/Cmd+Enter (`poc/dokufix-poc.html:2263, 2269`), not on input.

## Dev Notes

### Current state of the code being modified

`poc/dokufix-poc.html` is a single 2382-line file: `<style>` L7–569, body L570–660, CDN scripts L658–660, one main `<script>` L662–2379.

**`render()` — L1453–1498.** The pipeline, and the two halves that matter here:

| # | Step | Line |
|---|---|---|
| 1 | Read `sourceEl.value` | 1454 |
| 2 | `marked.parse(md, { gfm: true, breaks: false })` | **1457** |
| 3 | catch → `<div class="error">`, early return | 1458–1461 |
| 4 | `await resolveAssetRefsInHtml(html)` — string-level `#asset-<hash>` → `blob:` | 1468 |
| 5 | `pruneAssetUrlCache(...)` | 1469 |
| 6 | `previewEl.innerHTML = resolution.html` — **string → DOM boundary** | **1470** |
| 7 | `assignHeadingIds(headings)` | 1474 |
| 8 | `processInlineToc(headings)` | 1475 |
| 9 | mermaid `<pre><code>` → `<div class="mermaid">` | 1478–1484 |
| 10 | `await mermaid.run({ nodes })` | 1487–1494 |
| 11 | `buildRail(headings)` — live-only scrollspy | 1497 |

Steps 2–5 are **string transforms**; steps 6–11 are **DOM transforms on the live `#preview` element**.

### Why post-DOM injection (the load-bearing architectural fact)

Every export variant calls `await render()` and then reads `previewEl.innerHTML` back out:

- `downloadReadonlyOpen()` L2142–2169 (reads at L2143/2149)
- `downloadReadonlySlim()` L2173–2226 (L2174/2181)
- `downloadReadonlyCompact()` L2229–2273 (L2230/2237)

**Consequence:** anything that mutates the `#preview` DOM during `render()` automatically ships into all exports for free. Anything hooked *after* the export reads the HTML back out does not. This is exactly why `processInlineToc` needs no export-specific code — and why the frontmatter panel must be injected inside `render()`, not bolted on afterwards.

### The precedent to follow: `processInlineToc` — L1564–1586

The in-house pattern for "author-placed construct → rich static HTML that survives every export":

```js
const paras = previewEl.querySelectorAll('p');
for (const p of paras){
  if (p.children.length !== 0) continue;              // L1571 — guard
  const txt = (p.textContent || '').trim();
  const m = txt.match(/^\[\[toc(?::([1-6]))?\]\]$/);  // L1573
  if (!m) continue;
  const inner = buildTocHtml(headings, maxLevel);
  if (!inner){ p.remove(); continue; }                // L1577 — degrade
  const nav = document.createElement('nav');
  nav.className = 'dokufix-toc';                      // L1580
  nav.setAttribute('aria-label', 'Inhaltsverzeichnis');
  nav.innerHTML = inner;
  nav.addEventListener('click', tocLinkHandler);      // L1584 — live-only enhancement
  p.replaceWith(nav);                                 // L1585
}
```

Points to copy: post-DOM rather than marked-level; a pure string builder (`buildTocHtml` L1544–1562) kept separate from DOM insertion; `dokufix-` prefixed class; static HTML with listeners only as progressive enhancement; graceful degradation when there is nothing to emit.

**Note the divergence:** the ToC marker is detected *after* parsing because it survives marked as a `<p>`. Frontmatter cannot use that trick — marked destroys the block's structure (see below) — so detection must happen *before* `marked.parse`, while injection still happens *after* `previewEl.innerHTML`. That split is intentional and is the core of this story's design.

### What happens today (the defect being fixed)

Frontmatter is **not handled anywhere**: zero matches for `frontmatter` / `yaml` / `matter` in the file. The source goes untouched from `sourceEl.value` (L1454) straight into `marked.parse` (L1457).

Per CommonMark, `---` on its own line is a thematic break **unless** preceded by paragraph text, in which case it is a **setext H2 underline**. So:

```markdown
---
title: Foo
---
```

renders as `<hr>` followed by `<h2>title: Foo</h2>` — the closing `---` setext-underlines the `title: Foo` line. Multi-key frontmatter renders as `<hr>` + `<p>` of keys + `<hr>`. Either way: **visible garbage in the preview and in every export.** dokufix's own planning artifacts (including the product brief) open with exactly this construct.

**Worse — the silent title bug (AC6).** `safeFilenameBase()` L1832–1837:

```js
function safeFilenameBase(){
  const m = sourceEl.value.match(/^#\s+(.+?)\s*$/m);   // multiline!
  ...
}
```

The same regex is duplicated at L2145, L2176, L2232 for the export `<title>`. Because it is `/m`-multiline and scans the raw source, a **YAML comment inside frontmatter** (`# internal draft`) matches before the document's real `# Heading` — so the file downloads as `internal-draft.html` with `<title>internal draft</title>`. Fixing this is AC6 and is a genuine bug fix, not cosmetic.

### Scope decision: the YAML subset

**Do not bundle a YAML library.** The distillate is explicit: *"No CDN dependencies anywhere — the file must work fully offline"*, the production target is a single inlined file, and `js-yaml` is ~30 KB against an editor variant currently ~16 KB + libs. A full YAML parser fails the "body for information" test outright.

Implement a deliberate subset covering what document frontmatter actually contains:

- flat `key: value` pairs
- nested maps by indentation
- sequences (`- item`), including sequences of scalars under a key
- single/double-quoted and bare scalars
- `#` comments (full-line and trailing on unquoted scalars)
- blank lines

Explicitly **out**: anchors/aliases (`&`/`*`), multi-line block scalars (`|`, `>`), tags (`!!`), flow mappings (`{a: 1}` — except as the JSON path), multi-document (`---` separators inside), dates as typed objects (keep as strings).

Anything outside the subset must land in the `kind: 'raw'` fallback (AC7), not throw and not silently drop. **Document the subset boundary in `poc/README.md`** — an author whose anchors silently vanished would be a data-integrity failure, whereas an author who sees their raw block in a panel understands immediately.

Keep types unambitious: strings are fine for everything. Do not implement YAML's type coercion rules (the `NO`/`false`, Norway-problem class of bugs). Values are rendered, not computed on.

### Styling conventions (L7–569 and L2047–2118)

- **The CSS duplication tax is unavoidable here.** `READONLY_CSS` (L2047–2118) is a **hand-maintained duplicate** of the main `<style>` block with the `#preview` prefix stripped and editor chrome dropped. There is no sharing mechanism and no drift detection. Compare L322–359 (live ToC) vs L2093–2103 (export ToC) for the shape of the duplication. **Every rule this story adds lands twice.**
- **No CSS custom properties, no `:root`, no `var()`, no dark mode** anywhere in the file. Do not introduce them in this story — that is a separate refactor.
- Palette (hardcoded hex, repeated at each use site): `#1c1c1e` text · `#f5f5f7` background · `#e5e5ea` borders · `#8e8e92` muted · `#0066cc` links · `#d4ff00` lime accent · `#fafafa` panel background.
- **Naming:** `dokufix-` prefix for constructs that ship into exports (`dokufix-toc` L322, `dokufix-rail` L501, `dokufix-meta` L2085). Editor-only chrome is unprefixed and terse (`.hamburger`, `.menu`). Body-level state classes are bare adjectives (`.numbered`, `.is-dirty`, `.mode-view`).
- `<details>` / `<summary>` currently has **zero occurrences** in the file — this story introduces the first use. It is the right tool: a native disclosure widget is keyboard-accessible and JS-free by construction, which is precisely AC4. Remember to style `summary { cursor: pointer }` and consider `list-style` / `::marker` handling for a clean chevron.
- Modern selectors are already assumed — `:has()` is used for layout at L546 and L2088–2089 — so modern CSS is acceptable within NFR7.

### Reference precedent for a CSS-only feature that survives the JS-free export

Heading numbering, L381–387 (live) with its export twin at L2112–2117:

```css
.numbered #preview{counter-reset:h2}
.numbered #preview h2{counter-reset:h3}
.numbered #preview h2::before{counter-increment:h2;content:counter(h2) ". ";…}
```

State → body class (`applyNumbering` L2032–2038 flips `document.body.classList`) → CSS → exported via `bodyClassForExport()` (L2120–2122). This story does not need the body-class half, but it is the cleanest existing example of "CSS does the work, the export inherits it for free".

### JS-free export constraint — confirmed

`downloadReadonlyOpen()` (L2142–2169) emits `<!DOCTYPE html>` + `<style>${READONLY_CSS}</style>` + `<main class="reader-body">${bodyHtml}</main>` + meta footer + rail. **There is no `<script>` tag in that template** (verified L2153–2168). Only `schlank` (1-line gzip SVG decoder, L2197, emitted only when `svgCount > 0`) and `kompakt` (payload + decoder, L2259–2270) carry script. AC4 depends on `<details>` needing no JS — do not regress this by reaching for a click handler.

### Project Structure Notes

- Single-file PoC by design: **all** changes land in `poc/dokufix-poc.html`. No new files, no build step (`poc/README.md:179`: *"The PoC is intentionally a single file"*).
- `poc/README.md` must be updated in the same change — the repo has a consistent habit of README-follows-feature (commits `41e7857`, `e5bd8f0`).
- Frontmatter lives in the Markdown source and is persisted with it; the IndexedDB `docs` record stores `source` verbatim. **No persistence-layer change is needed** — do not touch the IDB schema.
- The panel is **render-only**. Editing frontmatter through the panel is explicitly out of scope for Epic 1; the Markdown source stays the single source of truth.

### Testing standards

There is no automated test suite in this project (`_bmad-output/test-artifacts/` is empty) and no test framework is configured. Verification is manual browser testing, consistent with all prior work. At minimum exercise:

- YAML frontmatter, JSON frontmatter (both fence forms), no frontmatter, empty frontmatter block (`---\n---`).
- Frontmatter containing a `#` comment **plus** a real `# Heading` → check the downloaded filename and the export `<title>` (AC6).
- A document legitimately starting with a `---` thematic break (AC8).
- Malformed YAML (e.g. a block scalar `|`, an anchor `&x`) → raw fallback, no throw, nothing lost (AC7).
- Nested maps and sequences → nested rows (AC2).
- A value containing `<script>` or `&` → escaped, not injected (AC2).
- All four download variants, `nur-lesen` checked for absence of `<script>` (AC4, AC9).
- Keyboard: Tab to the summary, Enter/Space toggles (AC4).

### References

- Render pipeline and the string→DOM boundary: [Source: poc/dokufix-poc.html#L1453-L1498]
- `marked.parse` call site to reroute: [Source: poc/dokufix-poc.html#L1457]
- DOM injection point: [Source: poc/dokufix-poc.html#L1470]
- Marker precedent `processInlineToc` / `buildTocHtml`: [Source: poc/dokufix-poc.html#L1544-L1586]
- `escapeHtml` helper: [Source: poc/dokufix-poc.html#L1500]
- Title/filename defect — `safeFilenameBase`: [Source: poc/dokufix-poc.html#L1832-L1837]
- Export `<title>` duplicates: [Source: poc/dokufix-poc.html#L2145, #L2176, #L2232]
- `READONLY_CSS` export stylesheet: [Source: poc/dokufix-poc.html#L2047-L2118]
- Read-only export functions that re-read `previewEl.innerHTML`: [Source: poc/dokufix-poc.html#L2142-L2273]
- CSS-only precedent (heading numbering counters): [Source: poc/dokufix-poc.html#L381-L387, #L2112-L2117]
- `[[toc]]` contract documented in prose: [Source: poc/README.md#Table of Contents (two layers)]
- Single-file / no-CDN / offline constraints: [Source: _bmad-output/planning-artifacts/product-brief-dokufix-distillate.md#Technical Direction (Not in the Brief, but Decided)]
- "Body for information" scope test and feature-creep risk: [Source: _bmad-output/planning-artifacts/product-brief-dokufix-distillate.md#Identity & Framing, #Risks (with Mitigation Notes)]
- Persona requiring "looks like a real document": [Source: _bmad-output/planning-artifacts/product-brief-dokufix-distillate.md#Secondary — Author whose Reader Hates Markdown]
- Epic and scope justification: [Source: _bmad-output/planning-artifacts/epics.md#Epic 1: Metadata Headers and Footnote Previews]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context)

### Debug Log References

Verification harness (scratchpad, not committed — the repo has no test framework and adding one was out of scope):
`test-story-1-1.js` drives the real `poc/dokufix-poc.html` in a real browser via playwright-core and calls the page globals directly (`splitFrontmatter`, `render`, `safeFilenameBase`, `deriveDocTitle`), then exercises all four download buttons, saves the produced files, and re-opens each one to assert the panel renders and is styled.

- RED confirmed before implementation: `ReferenceError: splitFrontmatter is not defined`.
- Final: **71 assertions, 0 failures, in both Chromium 1228 and Firefox 151.**
- Regression (`regress.js`): demo document unchanged — 8 headings, inline ToC present, 2 Mermaid SVGs, footnotes section present, rail present, no panel, filename `Willkommen-bei-dokufix`, zero page errors.
- Harness note: `Mit Editor` calls `prompt()` for the commit message; Playwright auto-dismisses dialogs, which the PoC correctly reads as "cancel the save". The harness accepts the dialog.

### Completion Notes List

- **All 9 ACs satisfied and machine-verified.** Each AC has at least one assertion in the harness; the export ACs are verified by opening the produced files rather than by grepping the source for CSS.
- **Two-tier detection resolves the AC7/AC8 tension.** AC7 wants unparseable frontmatter shown raw; AC8 wants a leading `---` thematic break untouched. For a bare `---` fence these are indistinguishable from parsability alone. So detection asks *intent* first (`fmLooksLikeFrontmatter`: is the first meaningful line a `key:` or `{`?) and only then parses. Looks-like + parse failure → raw panel (AC7). Doesn't look like → not frontmatter, source untouched (AC8). An explicit `---json`/`---yaml` fence is always treated as intent.
- **The YAML parser fails loudly, never partially.** Out-of-subset constructs (`|`, `>`, `&`, `*`, `!!`, flow collections, tab indent, `- key: value`) throw, and the whole block falls back to the verbatim raw panel. A half-parsed panel that silently dropped a key would be a data-integrity failure. The `- key: value` guard matters specifically because without it YAML's sequence-of-maps would have degraded into the scalar string `"key: value"` — wrong, and silently so.
- **No type coercion on purpose.** Values stay strings, so YAML's `no` → `false` (Norway problem) class of bugs cannot occur. The panel displays values; nothing computes on them.
- **Comment stripping respects URLs.** `#` only opens a comment when preceded by whitespace, so `url: https://x.com#frag` keeps its fragment, while `title: Foo # note` loses the note. Quoted scalars are parsed before comment stripping, so `title: "a # b"` survives intact.
- **AC6 was a real, pre-existing bug — now fixed.** `safeFilenameBase()` and the three export `<title>` derivations each ran `/^#\s+(.+?)\s*$/m` against the *raw* source. Multiline, so a YAML comment `# internal draft` beat the document's real `# Heading`; the file downloaded as `internal-draft.html`. All four sites now route through a single `deriveDocTitle(fallback)` reading the frontmatter-stripped body — four duplicated regexes collapsed to one helper.
- **Panel ships to exports for free**, via the existing architecture rather than new export code: `injectFrontmatterPanel` mutates the live `#preview` DOM inside `render()`, and every export variant calls `await render()` then reads `previewEl.innerHTML` back out. No export function was touched except to reroute its `<title>`. Same mechanism `processInlineToc` relies on.
- **JS-free requirement met by construction.** Native `<details>` — verified by asserting the `nur-lesen` export contains no `<script>` tag at all, then opening it and confirming click *and* keyboard (Enter on `<summary>`) toggle it, with the expanded content measurably visible.
- **Panel emits no headings** (`<summary>`/`<dl>` only), so `assignHeadingIds`, `processInlineToc` and `buildRail` are provably unaffected — asserted, not assumed.
- **CSS duplication tax paid as required by NFR4:** rules exist twice, `#preview`-prefixed in the main block and unprefixed in `READONLY_CSS`. This remains the file's most obvious refactor candidate (noted in the epic's Additional Requirements) but was out of scope here.
- **Cross-browser:** full suite green in Chromium and Firefox. No CSS custom properties introduced (the file has none); no bleeding-edge selectors used.
- **Deferred items recorded** in `deferred-work.md`: the YAML subset boundary, the empty `---\n---` block, frontmatter `title` not feeding the document title, and the absence of a frontmatter editing UI.

### File List

- `poc/dokufix-poc.html` — modified. Added the frontmatter section (`fmStripComment`, `fmFindQuoteEnd`, `fmScalar`, `fmUnquoteKey`, `fmIsSeqItem`, `fmParseNode`, `fmParseMap`, `fmParseSeq`, `parseYamlSubset`, `fmLooksLikeFrontmatter`, `splitFrontmatter`, `deriveDocTitle`, `fmLookup`, `buildFrontmatterSummary`, `buildFrontmatterValueHtml`, `buildFrontmatterRowsHtml`, `buildFrontmatterHtml`, `injectFrontmatterPanel`) before `render()`; rerouted `render()` to parse `fm.body` and inject the panel; replaced the title regex in `safeFilenameBase()` and in the three read-only export functions with `deriveDocTitle()`; added panel CSS to the main `<style>` block and its twin to `READONLY_CSS`.
- `poc/README.md` — modified. New *Frontmatter (YAML / JSON metadata header)* architecture section (delimiters, panel behaviour, YAML subset table with explicit limits, two-tier detection, title derivation) plus a bullet in *What this PoC demonstrates*.
- `_bmad-output/implementation-artifacts/deferred-work.md` — modified. Four deferred items from this story.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — modified. Story status transitions.

## Change Log

| Date | Change |
|---|---|
| 2026-07-16 | Implemented story 1.1. YAML/JSON frontmatter now renders as a collapsible `<details>` metadata panel instead of leaking as `<hr>` + setext `<h2>`. Added a deliberate YAML subset parser (no library) with a loud raw fallback, two-tier detection to protect leading thematic breaks, and a single `deriveDocTitle()` helper that fixes a pre-existing bug where a `#`-prefixed YAML comment could hijack the download filename and export `<title>`. 71 assertions green in Chromium and Firefox; no regression in the demo document. Status → review. |
| 2026-07-16 | **Hands-on human review passed** (Ben, on the demo data): "besteht meinen test, sieht ordentlich aus". Status stays `review` pending the code-review workflow. |
