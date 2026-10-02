# dokufix — Proof of Concept, built from sources

A working prototype of the **dokufix** vision: one HTML file that is simultaneously the viewer, the editor, and the artifact for technical documentation written in Markdown + Mermaid.

Open `dist/dokufix.html` in any modern browser. No install, no server, no account.

That file is built from the sources in this folder with one command (see *Build*). It succeeds `poc/dokufix-poc.html`, which was written by hand and stays frozen as story 2.1 left it, with its README and its checks. The built file looks the same and does the same; what changed underneath is under *Build* and *Self-replication mechanism*. This README succeeds `poc/README.md`.

## What this PoC demonstrates

- **Markdown + Mermaid rendering** in the browser via `marked` and `mermaid` (loaded from CDN at pinned versions — production will inline these; see *Libraries*).
- **Viewer ↔ Editor toggle.** Default mode is the reader experience; a discreet "Editor ↩" button in the corner reveals the editing UI.
- **IndexedDB persistence** — one record per dokufix file (keyed by UUID) holds the live markdown source, version history, and commit baseline. Image assets live in a separate object store, keyed by SHA-256 content hash. Documents that were saved by an older localStorage-based build of the PoC are migrated transparently on first open with the new code.
- **Image upload (paste, drag-and-drop, file picker)** — drop a file onto the editor, paste a screenshot from the clipboard, or use the `+ Bild` button. The image is decoded via `createImageBitmap` (with `imageOrientation: 'from-image'` so EXIF orientation is applied to the pixels), optionally downscaled to a max of 1600 px wide, re-encoded as WebP @ 0.85, hashed, and stored in IndexedDB. The canvas roundtrip is what strips EXIF metadata as a side effect; `createImageBitmap` itself doesn't strip anything. The markdown gets a `![alt](#asset-<hash>)` reference; the render pass swaps that reference for a Blob URL pulled from IndexedDB. Read-only exports replace `#asset-` and `blob:` URLs with inline `data:` URLs so the recipient has no IDB or runtime dependency. `Mit Editor` downloads include every asset referenced by the current source **or by any history snapshot** in a separate `<script type="application/json" id="dokufix-assets">` block — content-addressed, so a re-seed of an identical hash is a no-op.
- **Explicit save** — leaving edit mode does **not** auto-save; saving is a deliberate user action via the Download menu.
- **Self-replication** — the "Mit Editor" download produces a new HTML file with the user's content baked in (gzip-compressed). The receiver opens that file and starts from there.
- **Three read-only export tiers** — open / schlank / kompakt, each with different size-vs-portability tradeoffs.
- **Footnotes with hover previews** — GFM footnote syntax (`[^id]` / `[^id]:`) via `marked-footnote`, plus a preview that appears when the reader hovers or keyboard-focuses a marker, so an aside can be read without jumping to the bottom of the document. Pure CSS, so it works in the JS-free export. See *Footnotes* below.
- **Frontmatter metadata panel** — a leading YAML or JSON header block renders as a collapsible panel instead of leaking into the document as markup. Native `<details>`, so it collapses without JavaScript and survives the JS-free export. See *Frontmatter* below.
- **Callouts** — a blockquote that opens with `> [!NOTE]` or one of its four siblings, the alerts of GitHub Flavored Markdown, renders as a note or warning with a German label and a symbol. No new syntax, and no JavaScript in the exports. See *Callouts* below.
- **Status chips** — a code span that starts with a colour dot, a blank and a label, `` `🟢 Live` ``, renders as a small coloured label, in running text, in a table, in a heading. Five colours, each with a mark of its own shape and with its name as text for a screen reader, so the status does not hang on the colour. No new syntax, and no JavaScript in the exports. See *Status chips* below.
- **Licence information** — every variant has a small text link "license information" above the document. It opens a view that names what the file loads or carries of others' work: `marked`, `marked-footnote`, Mermaid and the Octicons, each with version, licence and copyright line, and the text of the MIT licence. A native `<details>`, so it opens in the JS-free export. See *Licence information* below.
- **Heading numbering toggle** — opt-in 1.2.3 outline numbering via pure CSS counters.
- **Two-layer Table of Contents** — author-placed inline `[[toc]]` marker (renders as a static nested list inside the document, ships through every export variant) plus a JS-driven right-side scrollspy rail in read mode on wide viewports.
- **Dirty-state indicator** — a header badge (and a `●` prefix in the browser tab title) shows whether the editor content matches what is baked into the file. Resets to clean after a "Mit Editor" download.
- **In-file version history with per-version source snapshots** — each "Mit Editor" download and each "commit-only" action appends a `{v, t (ISO), m (message), s (gzipped source)}` entry to a JSON block embedded in the file (`<script type="application/json" id="dokufix-history">` — non-executing, just data). A clickable `v{N}` badge in the header opens a modal listing every saved version, newest first. The full source of any prior version is recoverable from the file alone — the artifact is auditable on its own. Read-only exports inherit a small `Version N · DD.MM.YYYY HH:MM · message · exportiert <date>` footer at the end of the document.
- **Per-document identity** — each saved file carries a UUID in its history JSON. The IndexedDB doc record is keyed by this UUID, so two dokufix files in the same browser no longer share storage. Files without a UUID (older or never-saved) use a deterministic `loc-{hash}` fallback derived from `location.origin + location.pathname` (URL hash and query are deliberately excluded so ToC anchor clicks don't relocate the storage on the next reload); on first save the fallback upgrades to a real `crypto.randomUUID()` and the IndexedDB record is rekeyed to the new identifier.
- **Mobile-friendly** — hamburger menu collapses the editor toolbar on narrow viewports.

## Download variants

| Variant | What's in the file | Receiver can re-edit? | JS required to open? | Size (demo text) | Size (reference document) |
|---|---|---|---|---|---|
| **Mit Editor** | Full editor + gzipped Markdown source + immutable demo-text reset capability | ✅ Yes | ✅ (via CDN libs) | 89 365 B + libs | 93 166 B + libs |
| **Ohne Editor — offen** (`-nur-lesen.html`) | Pre-rendered HTML + inline SVG diagrams, no JavaScript at all | ❌ No | ❌ | 83 470 B | 122 940 B |
| **Ohne Editor — schlank** (`-schlank.html`) | Plaintext HTML + Mermaid SVGs gzip-compressed individually, tiny inline decoder | ❌ No | ⚠️ For diagrams only — text remains readable | 47 714 B | 68 201 B |
| **Ohne Editor — kompakt** (`-kompakt.html`) | Entire body gzip-compressed + tiny decoder | ❌ No | ✅ | 39 573 B | 60 138 B |

Measured 2026-10-02 in Chromium 153 with `tests/vergleich.mjs`, all four variants through one build per document; Firefox differs by a few hundred bytes because it serialises the Mermaid SVG differently. The reference document is `tests/referenz.md`; since story 2.2 it has five callouts and since story 2.3 status chips, so its figures are not those of the documents before. Since story 2.18 every variant carries the licence information (see *Licence information*, what it did to documents). Both documents carry two Mermaid diagrams, and those dominate the read-only exports. A `kompakt` file comes out a few bytes apart from run to run: two of today's runs on the unchanged file gave 4 B less than the figures recorded before them.

The built file beside the PoC, same run, same documents, same day:

| | Demo text: PoC → built | Reference document: PoC → built |
|---|---|---|
| The file itself (`poc/dokufix-poc.html` → `dist/dokufix.html`) | 133 353 → 87 754 B | the same file |
| `Mit Editor`, Chromium | 135 085 → 89 365 B | 139 367 → 93 166 B |
| `nur-lesen`, Chromium | 71 052 → 83 470 B | 111 318 → 122 940 B |
| `schlank`, Chromium | 35 296 → 47 714 B | 56 579 → 68 201 B |
| `kompakt`, Chromium | 28 983 → 39 573 B | 50 491 → 60 138 B |
| `Mit Editor`, Firefox | 135 069 → 89 357 B | 139 375 → 93 178 B |
| `nur-lesen`, Firefox | 71 138 → 83 556 B | 111 671 → 123 293 B |
| `schlank`, Firefox | 35 536 → 47 954 B | 56 527 → 68 149 B |
| `kompakt`, Firefox | 29 419 → 40 017 B | 50 487 → 60 134 B |

The built file is 45 599 B smaller than the PoC and a `Mit Editor` file 45 720 B; nearly all of it is the minifying of script and styles. In the demo column the two files no longer export the same text: with story 2.3 the demo text of the built file got a section on status chips, which the PoC's does not have. Eight changes moved these figures after the build: the split into modules added 972 B to the file (see *The script's modules*), story 2.15 added 2 800 B, the pass runner, the warning and the export path, the close button of the storage banner with the German footnotes heading added 571 B, story 2.2 added 5 930 B, the callouts: 4 634 B of document styles, 2 790 B of them the five symbols, and 1 296 B of script, and story 2.18 added 5 871 B, the licence information: 1 750 B of editor styles and 4 121 B of script, which holds the list, the text of the MIT licence and the frame rules for the exports, story 2.3 added 2 626 B, the status chips: 1 694 B of document styles and 932 B of script, the section on status chips in the demo text added 903 B, and the darker labels of the chips another 122 B of document styles. A read-only export of a document without callouts and chips is 9 684 B larger than the PoC's: 7 778 B of that is its stylesheet, and 1 906 B the licence element. The build took 96 B out, because an export embeds the document styles and esbuild minifies them a little further than `compactCss()` did (the export's stylesheet: 10 533 → 10 437 B); story 2.15 put 408 B in, the style of the warning (10 845 B), story 2.2 4 634 B, the styles of the callouts (15 479 B), story 2.18 1 016 B, the frame rules of the link "license information" (16 495 B), story 2.3 1 694 B, the rules of the status chips (18 189 B), and the darker labels 122 B, a colour of its own for each mark (18 311 B). Outside its `<style>` every read-only export of the demo text was the one the PoC writes as long as the two demo texts were the same, in both browsers, once the ids Mermaid generates are masked and apart from two things: the footnotes heading, which reads "Fußnoten" where the PoC has "Footnotes", and the licence element, which the PoC does not have. The ids differ because since story 2.15 diagrams are drawn one at a time. That held for the reference document as well as long as it had no callout (see *Callouts*, what they did to documents). With its five callouts and its status chips an export of it is another 1 938 B larger than the PoC's outside the stylesheet: the PoC writes the callouts as quotations that begin with their marker, which made 167 B before the chips came, and the chips as code spans. The PoC's own figures and how story 2.1 moved them are in `poc/README.md`.

Footnote hover previews add a material amount to every variant — roughly +30 % on the read-only ones for a document with three short footnotes, because each footnote's text is duplicated inline. Measured figures per variant are under [Footnotes → Size cost](#footnotes).

## Architecture notes

### Demo text and the file's document

Two distinct concepts, deliberately separated. Each lives in a data block of the page, a `<script type="application/json">` that is not executed:

- **`#dokufix-demo`** — the immutable original demo text. The "Demo zurücksetzen" button always restores from this. A save carries it along and never changes what it says.
- **`#dokufix-source`** — this file's document: what gets loaded on first open if no IndexedDB record exists yet for this document UUID. Empty in the built file. On `Mit Editor` download it is written with the user's current content.

A block holds `{"text": "…"}` or `{"gz": "…"}` (gzip, then base64), and the init reads either. The build writes the demo text as `{"text": …}` from `src/demo.md`; a save writes both blocks as `{"gz": …}`.

Loading order on open: IndexedDB doc record (live draft) > `#dokufix-source` (file's baked content) > `#dokufix-demo`.

In the PoC both were variables of the script, `DEMO` and `SAMPLE`. Why they moved is under *Self-replication mechanism*.

### Render passes

`render()` in `src/app/render.js` is four steps: parse the Markdown into the preview, run the document passes, run the run-time passes, rebuild the rail. A pass is one step that works on the rendered document, `{ name, run(root, context) }`. `root` is the element that holds the document; `context` is `{ frontmatter }`, what was split off the source before it was parsed; `run` may be async. The two lists stand in `render.js`, in the order they run:

| List | Pass (`name`) | Function |
|---|---|---|
| `DOCUMENT_PASSES` | `Metadaten` | `injectFrontmatterPanel()` |
| | `Hinweise` | `buildCallouts()` |
| | `Status-Chips` | `buildChips()` |
| | `Überschriften` | `assignHeadingIds()` |
| | `Inhaltsverzeichnis` | `processInlineToc()` |
| | `Fußnoten-Vorschau` | `attachFootnotePreviews()` |
| | `Fußnoten-Rücksprung` | `linkFootnoteReturnPaths()` |
| | `Diagramme` | `renderDiagrams()` |
| `RUNTIME_PASSES` | `Sprungmarken im Inhaltsverzeichnis` | `attachTocClicks()` |

- **This is where a component plugs in.** It adds its pass to a list, at its place in the order. Nothing else in `render()` changes. See *Where a new component goes*.
- **Two lists, not one.** A document pass produces the document: what a reader sees, and what an export takes along when it copies the preview. A run-time pass attaches what only a running page has: a listener today, later a filter field or a live viewer. Nothing a run-time pass does is part of the document, and an element it adds is transient (below).
- **Each pass is contained.** `runPasses()` in `src/app/passes.js` runs a list. A pass that throws, or whose promise is rejected, is logged to the console, and the passes after it still run. When the list is through, each failed pass gets one warning at the top of the document that names it: "Der Schritt „Inhaltsverzeichnis“ ist fehlgeschlagen. Das Dokument kann unvollständig sein." What the pass had done before it failed stays. The warning of a failed run-time pass is marked transient: the document is complete, so no export carries it.
- **The rail is rebuilt at the end of every render, whatever failed before it.** The browser runs take "the rail was rewritten" as "the render is finished". Markdown that cannot be parsed puts a warning in place of the content, and the rail is then rebuilt empty. Until story 2.15 that case returned before the rail and showed a box that only the editor had a style for.
- **One render at a time.** A render requested while another runs starts when that one has finished, and reads the source then; the preview ends as the last one's. The promise `render()` returns is fulfilled when its render is done and is never rejected. Before, two renders interleaved on the preview: the first built its rail from headings that were no longer in the page, and its Mermaid run failed on detached nodes.
- **Mermaid draws one diagram at a time.** `mermaid.initialize` sets `suppressErrorRendering`, so Mermaid throws instead of drawing its error picture into the block, which is what 12.0.0 does by default and what every export then carried. The pass runs each diagram on its own; one with an error becomes a warning with Mermaid's message in its place, and the others are drawn. Running per diagram changes the ids Mermaid takes from the clock and nothing else.
- **Which headings count** is said once: `documentHeadings()` in `src/app/toc.js`. Heading ids, the inline table of contents, the rail and the rail of an export ask there, each when it runs. A heading inside a callout does not count, which is why `Hinweise` runs before `Überschriften` (see *Callouts*).
- **What a heading is called** is said once as well: `headingLabelText()` in the same module. The anchor, the entry in the inline table of contents and the entries of both rails are made from it. It is the heading's text without two things that stand in the heading for other readers: the preview of a footnote, and the word a status chip carries for assistive technology. `Status-Chips` runs before `Überschriften`, so that a chip in a heading is a chip when its entry is written (see *Status chips*).

**The warning** (`buildWarning()` in `src/app/warning.js`, class `dokufix-warning`) is a document construct: its style is in `src/doc.css`, so it reads the same in the preview and in all four variants. It is recognisable without colour, because the word "Warnung:" stands in its markup. Its text is German; the detail below it is the message of whatever failed, as it came. Three things produce one: Markdown that cannot be parsed, a pass that failed, a diagram with an error.

**Transient elements.** An element that exists only while the page runs carries the attribute `data-dokufix-transient`. `Mit Editor` removes every such element from its clone of the page, wherever it stands; the read-only exports remove them from their copy of the preview (`removeTransient()` in `src/app/transient.js`). A component that puts something into the page that is not the document marks it, and touches neither download. What cannot be marked has to be named in the clean-up of the clone. Today that is one element: `.mermaidTooltip`, which Mermaid appends to `<body>` with the first diagram it draws.

**The export path.** The three read-only exports get their content from one function, `buildExportBody()` in `src/app/downloads/export-body.js`. It renders, takes a detached copy of the preview, runs the export steps on the copy in order, and returns title, body and rail. A step is a function that gets the copy and changes it; the live preview is never touched. `EXPORT_STEPS` holds what every export needs: transient elements out, images as `data:` URLs. An export hands in what only it does: `schlank` gzips each diagram. The export modules keep their templates and nothing else. Whatever a component has to strip or change when a document leaves the page is one step in that list, not a line in three files. A step that throws ends the export; a file with a step left out would be a wrong file that looks right. The menu catches whatever a download throws, logs it, and tells the user in a dialog that the download failed and why; the buttons are enabled again.

**What story 2.15 did to documents** is under *The script's modules*.

### Document styles (one source)

Every style that travels with a document is written in one place: `src/doc.css`. The build puts it, minified, into `<style id="dokufix-doc-css">`, the first stylesheet in `<head>`. From there on nothing changed against the PoC:

- The **preview** uses the block as an ordinary stylesheet.
- **`Mit Editor`** clones the whole document, so the block travels unchanged.
- The three **read-only exports** embed the block's text at the moment the file is written: `readonlyCss()` reads it from the page, removes comments and whitespace (after the build there is hardly any left), and appends the export frame. Nothing is derived when the file is opened, so `nur-lesen` still contains no script.

Until story 2.1 each of these rules existed twice, written by hand: `#preview`-prefixed in the app stylesheet and unprefixed in a string called `READONLY_CSS`. Nothing compared the two, and in epic 1 the anchor positioning of the footnote preview sat in the first and was missing from the second, so every read-only export shipped without it.

**Where a rule goes.**

| The rule styles … | It goes into … | Written as … |
|---|---|---|
| rendered document content: headings, tables, footnotes, a new `dokufix-` component | `src/doc.css` | `.dokufix-doc h2{…}`, `.dokufix-doc .dokufix-callout{…}` |
| the look of the rail | the same file | `.dokufix-rail a{…}`, unscoped, because the rail sits beside the content container |
| the editor interface, the preview pane as a box, where the rail stands in the editor, the link "license information" in the editor | `src/app.css`, the app stylesheet below the block | `#preview{…}`, `body.mode-view #preview{…}`, `.dokufix-rail a.active{…}`, `.header-actions>.dokufix-licences{…}` |
| the page of a read-only export: reset, margins, footer, rail grid, the link "license information" | `READONLY_FRAME_CSS` in `src/app/downloads/export-body.js` | `body{…}`, `.reader-body{…}`, `.dokufix-meta{…}`, `.dokufix-licences{…}` |

`.dokufix-doc` is the class on the content container: `#preview` in the editor, `<main class="reader-body dokufix-doc">` in an export. That class is the only change to the exported markup.

**The check.**

```
node tests/check-doc-styles.mjs
```

No dependencies, no browser. It reads the sources, because that is where a rule is written: the block is `doc.css`, the app stylesheet is `app.css`, the export frame and the export functions are in the modules under `src/app/downloads/` (the check reads every `.js` under `src/` and names the module a problem is in), the block's element and the preview are in `index.html`. It exits 1 and names file, line and selector

- when a document rule sits outside `doc.css`. In the export frame that is any selector other than the nineteen the frame has today, which the check lists one by one (`FRAME_SELECTORS`): ten of the page and nine of the link "license information". `.reader-body h5{…}` fails like a bare `h5{…}`, and so does `.dokufix-licences h5{…}`. In `app.css`, in a `<style>` an export writes itself and in a `<style>` somebody adds to the page it is a `.dokufix-doc` selector, a `#preview <descendant>` selector, a `dokufix-` name, or any class or attribute name that a selector of the block uses (`.footnotes li{…}`, `.mermaid svg{…}`, `a[data-footnote-ref]{…}`);
- when a selector in `doc.css` does not start with `.dokufix-doc`, `.numbered .dokufix-doc` or `.dokufix-rail`;
- when a read-only export no longer builds its stylesheet with `readonlyCss()` or its `<main>` lost the class;
- when the block's element is missing from the page or doubled, or holds anything but the slot for `doc.css`, and when `READONLY_CSS` comes back;
- when the built file does not have exactly one block, or an empty one. That is all the check reads from the built file: there the script is bundled and minified, and the names it looks for are gone.

The `dokufix-` prefix alone is not the test. dokufix's own components carry it, but what `marked`, `marked-footnote` and Mermaid produce does not (`.footnotes`, `.mermaid`, `[data-footnote-ref]`), so the check takes the class and attribute names from the block's own selectors. Three short allowlists name what a frame may use anyway: the frame names `.dokufix-meta`, `.dokufix-rail-pending`, `.dokufix-licences` and `.dokufix-licences-view`, each listed, so that `.dokufix-licences-x` still fails; `.dokufix-rail` together with `.has-items` or `a.active`; and three selectors that share a name with the block but style something else (`.version-modal[open]`, and `.mermaid[data-gz]` with its `::before` in the `<noscript>` style of `schlank`). The link has no rule for its open state: `.dokufix-licences[open]` would use an attribute the block uses and is not on that list. What the check cannot see: a rule that reaches document content through another ancestor and names none of these, such as `.pane-preview h5{…}`, and rules written with CSS nesting, which its reader does not unfold. Run it after every change to a style.

**Two things that are load-bearing.**

- *Order.* In `src/index.html` the block stands before the app stylesheet, and `readonlyCss()` puts the frame after the block. Where a frame rule and a document rule have the same specificity, the frame has to win: `.dokufix-meta p` against `.dokufix-doc p` in the exports, `.dokufix-rail a.active` against `.dokufix-rail .rail-h4 a` in the editor.
- *Specificity moved.* Document selectors dropped from id to class specificity in the preview and rose from element to class specificity in the exports. That was verified by screenshot, not assumed (below). One consequence needed a frame rule: the "needs JavaScript" notice of `kompakt` sits outside the content container, so `p{margin-bottom:1em}` no longer reached it and the rail beside it stood 17 px higher with JavaScript off; `noscript p{margin-bottom:1em}` in the frame restores that.

**What the change did to documents** (2026-10-02, `tests/vergleich.mjs`, Chromium 153 and Firefox 153, light and dark, 1400 and 1600 px, at rest and with every state switched on):

- Demo text, which has no image: all 68 screenshots are pixel-identical before and after.
- Reference document: `Mit Editor` and the preview pane are pixel-identical. The three read-only exports differ, and only by the decided image margin: the one source carries `margin:8px 0` on images, which the preview always had and the exports never did, so each of the two images in the reference document moves what follows down by 16 px. Control: the same build with that one declaration removed gives read-only exports that are pixel-identical to before.
- `object-fit:contain` on the missing-image placeholder was the other difference between the twins; it existed only in the exports and is now everywhere. It changes no pixel in the preview.
- With JavaScript switched off, the three read-only exports render as before, again apart from the image margin (checked in Chromium at 1400 and 1600 px).

### Libraries

Three libraries come from the CDN, each at a fixed version:

| Library | Version | URL below `https://cdn.jsdelivr.net/npm/` |
|---|---|---|
| `marked` | 18.0.14 | `marked@18.0.14/lib/marked.umd.js` |
| `marked-footnote` | 1.4.0 | `marked-footnote@1.4.0/dist/index.umd.min.js` |
| `mermaid` | 12.0.0 | `mermaid@12.0.0/dist/mermaid.min.js` |

Until story 2.1 the URLs carried no version. That did not mean "latest": `marked/marked.min.js` resolved to 15.0.12 and stayed there, because `marked.min.js` is no longer shipped from version 16 on, while the Mermaid URL followed every release. A file saved as `Mit Editor` carries these URLs with it, so an unpinned file renders differently next year without anyone having touched it.

**Raising a version** is a change to the look of every document. Change the URL and the version of its entry in `src/app/licences.js`, then run `tests/vergleich.mjs` against the state before and attribute every difference (see *Checks*). `npm test` fails as long as URL and entry disagree, and names the entry (see *Licence information*).

**Mermaid runs with `securityLevel: 'strict'`** instead of `'loose'`. Measured on 12.0.0 with a flowchart that uses everything `loose` allows:

| In the diagram source | `loose` | `strict` |
|---|---|---|
| `click X call fn()` — a click runs a JavaScript function of the page | runs | does nothing |
| `click X href "https://…"`, `"mailto:…"`, a relative address — a click follows an ordinary link | link | link |
| `click X href "javascript:…"` or `"data:…"` | link with that target | no target: the `href` is removed |
| HTML in a label (`<b>`, `<i>`, `<br>`, `<a>`, `<img>`) | rendered, sanitised | rendered, sanitised |
| `onerror=` and other event attributes in a label | removed | removed |

So `strict` removes two things: the JavaScript callback, and `javascript:` and `data:` link targets. Ordinary links stay, and nothing else that was measured changes. Only flowchart and sequence diagrams have been looked at under `strict`; other diagram types are unchecked (tracked in `_bmad-output/initiative-dokufix/deferred-work.md`).

**What the two changes did to documents** (2026-10-02, reference document and demo text, all four variants, Chromium 153 and Firefox 153): all 136 screenshots are pixel-identical before and after. `marked` 18.0.14 produces byte-identical HTML for both documents. `strict` changes one thing in the output: Mermaid's sanitiser trims the whitespace inside `class` attributes of the SVG (`class="node default  "` becomes `class="node default"`), which makes `nur-lesen` 22 B smaller for the reference document and 24 B for the demo text. With that whitespace normalised, the exports before and after are identical byte for byte. `Mit Editor` grows by the 547 B that the longer URLs and their comments add to the file itself.

### Footnotes

The heading `marked-footnote` puts above the footnotes is visually hidden, but it is a heading: it shows in the table of contents and in the rail. Its text is set to "Fußnoten" through the library's `description` option (`src/app.js`); the default is the English "Footnotes".

Standard GFM footnotes work: `[^id]` places a marker, `[^id]:` defines it, and `marked-footnote` (registered via the single `marked.use()` call in the file) renders the definition list at the document end with return arrows. dokufix adds no syntax here.

**Hover / focus preview.** Each marker carries a preview of its footnote, revealed on `:hover` or `:focus-within` of the host `<sup class="dokufix-fn-host">`. The reveal is **pure CSS** — there is no listener — which is what lets it work in the JS-free `nur-lesen` export. `attachFootnotePreviews()` only injects inert markup at render time; because every read-only export renders and then copies the preview (see *Render passes*), and a `Mit Editor` file renders again when it is opened, the previews travel into all four downloads without any export-specific code.

**Preview content is flattened to inline.** This is load-bearing, not cosmetic. The preview `<span>` lives in the `<sup>` that sits inside the paragraph carrying the marker. A footnote definition is block content (`<p>`, sometimes lists) — and a `<p>` nested inside a `<p>` makes the HTML parser close the outer paragraph early. In the live DOM you would not notice; in an *export*, where the markup is serialised and re-parsed by the recipient's browser, it would quietly shred the document structure. So `fnFlattenInline()` unwraps block elements (joining them with a space) and keeps only phrasing content. Links are unwrapped to their text as well, for a second reason: the preview is `aria-hidden="true"` (the footnote text is already reachable through the marker's own link, and announcing it twice is noise), and an `aria-hidden` subtree must not contain focusable elements. Backrefs and nested markers are stripped, the latter so a footnote citing a footnote cannot nest previews.

**Positioning, and the trade-off it carries.** A centred box cannot fit when its marker sits closer to the viewport edge than half the box width — at ~900 px (where the content column nearly fills the window) a right-edge marker pushed the preview ~200 px off-screen. Plain CSS cannot detect that without JavaScript.

CSS anchor positioning fixes it: `@position-try` keeps the box on screen at every tested width (1600/1200/900/800/600/390), each preview anchored to its own marker. The fallback chain covers **both axes** — `block-start` tries for the inline overflow, `block-end` tries for the block axis. An earlier version listed only `block-start` tries, which vary the inline axis alone, so a marker near the top of the viewport had nothing to flip to; the block axis had never been tested (the widths above are six numbers and no heights). The box also carries a `max-height` with a fade: a preview is a preview, and without a ceiling a long footnote grows past the viewport top, where content is unreachable because browsers do not make overflow above the scroll origin scrollable.

Three non-obvious requirements, all load-bearing:

- the block must reach **every** variant. For a while it did not: it sat in the app stylesheet twice and in the export stylesheet not at all, so the read-only exports, the artifacts that actually travel, kept the centred base and kept clipping. Since story 2.1 there is one copy, today in `src/doc.css`, and the exports embed the block built from it (see *Document styles*). `node tests/check-doc-styles.mjs` fails when a rule for it turns up anywhere else;
- the host `<sup>` must **not** be `position:relative` inside the `@supports` block — a tiny containing block leaves the try-fallbacks nothing to evaluate against and they silently never fire;
- the `transition` must stay — without it Firefox does not reveal the preview at all.

**The `@supports` gate is syntactic, not behavioural.** `@supports (anchor-name:--a) and (position-try-fallbacks:--b)` asks whether the engine *parses* these properties, not whether the fallbacks actually fire — and Firefox answers yes to the first while failing the second. So the gate cannot separate a working engine from a partial one, and any engine that parses the syntax gets the refinement whether or not it can honour it. This is why positioning is verified by **measurement** rather than by trusting the gate.

**Engine behaviour.** Chromium/Edge reveal in ~40–100 ms at every width. Firefox was initially reported here as slow (~700 ms) and as leaving previews stuck open — **both were artifacts of Playwright's synthetic mouse and do not reproduce for a human.** Confirmed by hands-on review (2026-07-16): with a real mouse in Firefox the preview appears immediately.

One real behaviour worth knowing: **clicking** a marker leaves its preview open, because the click focuses the anchor and the reveal rule is `:hover, :focus-within`. Clicking anywhere else in the document dismisses it. That is inherent to the JS-free design rather than a defect — `:focus-within` is exactly what makes the preview keyboard-reachable, and on touch devices (where `:hover` does not exist) it is the only way a preview can be seen at all. Accepted by the product owner after review.

Automated coverage of this feature is therefore only as good as synthetic input allows; the harness assertions around un-hover in Firefox are marked as known synthetic-input deviations rather than treated as product failures. Judge hover behaviour with a real pointer.

**Landing highlight and return-path disambiguation.** `marked-footnote` renders every reference to the same footnote with the *same visible number* and the *same href*: three citations of `[^norm]` all read `1` and all link to `#footnote-norm`, while the definition grows three return arrows `↩ ↩² ↩³`. On arrival you cannot tell which entry you landed on, nor which arrow leads back to where you came from.

`:target` only ever knows the current fragment, so CSS cannot distinguish the three cases. The only JS-free fix is to give each marker a **distinct** target: `linkFootnoteReturnPaths()` gives every arrow a stable id (`footnote-back-<id>[-N]`) and points the matching marker at it. Then

- `a[data-footnote-backref]:target` marks exactly the arrow that leads back, and
- `li:has(a[data-footnote-backref]:target)` shades the definition around it, while
- `li:target` still shades when arriving via the plain `#footnote-<id>` anchor (external bookmarks, copied URLs).

All pure CSS, so it works in the JS-free export. `attachFootnotePreviews()` must run **before** the retarget, which is its place in `DOCUMENT_PASSES` — it resolves each definition through the marker's href, so retargeting first would build every preview out of the `↩` anchor instead of the footnote. That ordering used to be guarded by a comment alone, with a silent failure mode (every preview rendering as `↩`, no error); the lookup is now scoped `li#…`, so a wrong order resolves to nothing and skips the preview instead of producing a confidently wrong one.

**Pairing goes through the definition, not the marker's id.** The obvious implementation — read the arrow's `href`, `querySelector` that id, retarget it — is wrong, because `marked-footnote` does not guarantee those ids are unique. A document containing both `[^bgb]` (cited twice) and `[^bgb-2]` mints `id="footnote-ref-bgb-2"` **twice**; `querySelector` takes the first, and `[^bgb-2]`'s marker gets repointed at footnote `bgb`'s arrow — the reader clicks and lands on the wrong footnote, while the hover preview still shows the right text. A marker's *href* names its definition unambiguously, so each definition pairs its Nth marker with its Nth arrow; both are in reference order. Ids generated this way share one flat namespace with the definitions (`footnote-<label>`), so `[^back-x]` beside `[^x]` can still collide — on a collision the marker keeps pointing at its definition, which keeps the jump correct and loses only the arrow marking for that one reference.

**Accessibility trade-off — the cost of doing this without JavaScript.** The marker now lands on the return arrow, which sits at the *end* of the footnote text. Measured on a real export: `:target` resolves to `<a id="footnote-back-norm-2" aria-label="Back to reference norm">`, so a screen-reader user activating a footnote marker hears *"Back to reference"* before the footnote's prose, and must navigate backwards to read it. It is shipped knowingly, not overlooked.

Two costs that a first write-up of this trade-off missed, and that anyone weighing the reversal should have in front of them:

- **Sighted readers are not unaffected.** Fragment navigation start-aligns the target, and the target is now the arrow at the *end* of the definition. A footnote taller than the 90 px `scroll-margin-top` therefore lands the reader on `↩` with its own prose scrolled above the viewport top — they must scroll **up** to read what they came for. The `li`'s `scroll-margin-top` cannot compensate, because the `li` is no longer the target. Short footnotes are unaffected; long ones are exactly the case policy and audit documents produce.
- **Assistive-technology users pay the cost and get none of the benefit.** All arrows of a multi-referenced footnote carry the same accessible name — `[^bgb]`'s two arrows both read `aria-label="Back to reference bgb"`. Telling the arrows apart is the entire point of the feature, and the only signal that distinguishes them is colour. So the group that pays the reading-order cost is the one group the feature cannot help.

*Reversal (≈15 lines):* drop `linkFootnoteReturnPaths()` and the `:has()` selector, keep `li:target`. The landing highlight survives intact and JS-free; only "which arrow is mine" is lost. *Heavier alternative:* one empty landing anchor per reference at the **start** of each definition, paired to its arrow through a bounded set of static rules (`li:has(.dokufix-fn-landing-2:target) .dokufix-fn-back-2`), which restores reading order at the cost of N rule pairs in the document styles. Tracked in `_bmad-output/initiative-dokufix/deferred-work.md`.

**Size cost.** The preview duplicates each footnote's text inline, roughly doubling it. Measured 2026-07-16 on a document with three short footnotes (two definitions, one cited twice), all four variants through the same build and the same document, `b74cfce` (frontmatter panel merged, previews not yet added) as the baseline:

| variant | before | after | delta |
|---|---|---|---|
| `nur-lesen` | 8 838 B | 12 045 B | +3 207 B (+36.3 %) |
| `schlank` | 8 840 B | 12 047 B | +3 207 B (+36.3 %) |
| `kompakt` | 8 705 B | 11 268 B | +2 563 B (+29.4 %) |
| `Mit Editor` | 113 056 B | 136 431 B | +23 375 B (+20.7 %) |

Read these carefully, because they are not the numbers an earlier draft carried. They span **story 1.2 and story 1.3 and the review patches**, not the preview alone, and they are larger than the first figures partly because the read-only exports now actually carry the `@supports` block they were always meant to have — the earlier measurement was taken on exports that silently lacked it. `Mit Editor` is a different animal again: it embeds the whole application, so its delta is mostly the source growth of the branch, not the cost of the feature.

gzip absorbs much of the duplication, which is exactly the kind of redundancy it is good at. Footnote-heavy documents pay proportionally more; the per-footnote marginal cost is about the length of the footnote's own text.

### Frontmatter (YAML / JSON metadata header)

A metadata block at the very top of the document renders as a collapsible panel above the first heading, not as document content.

Without this, marked treats the block as ordinary Markdown: per CommonMark a lone `---` is a thematic break, *except* when it follows paragraph text, where it becomes a setext H2 underline. So `---\ntitle: Foo\n---` rendered as `<hr>` plus `<h2>title: Foo</h2>` — visible garbage in the preview and in every export.

**Delimiters.** The first line must be exactly `---` (sniffed as JSON when the content starts with `{`, YAML otherwise), or explicitly `---json` / `---yaml`. A closing `---` line must follow. TOML (`+++`) is not supported.

**Panel.** `<details class="dokufix-frontmatter">`, collapsed by default — the document should read as a document on first open. The summary line shows a digest of whichever of `title`, `version`, `date`, `author` are present (case-insensitive), in that order, joined with `·` — all of them, not just the first — falling back to an entry count when none is. Expanding reveals every key/value pair; nested maps become indented sub-rows, sequences become lists. Everything is HTML-escaped. Because it's a native `<details>`, it is keyboard-operable and needs no JavaScript — it works in the `nur-lesen` export.

**The YAML subset — and its limits.** dokufix does *not* bundle a YAML library. One (~30 KB) against a ~16 KB artifact fails the "body for information" test. Instead there is a deliberate subset covering what document frontmatter actually contains:

| Supported | Not supported |
|---|---|
| `key: value` pairs | block scalars (`\|`, `>`) |
| nested maps by indentation | anchors / aliases (`&`, `*`) |
| sequences of scalars (`- item`), indented or flush with the key | sequences of maps (`- key: value`) |
| single- and double-quoted scalars | tags (`!!str`) |
| `#` comments, full-line and trailing | flow collections (`{a: 1}`, `[a, b]`) — except as the JSON path |
| | tab indentation, multi-document streams |

Anything outside the subset makes the parser fail **loudly rather than partially**: the panel then shows the raw block verbatim under a "nicht lesbar" summary. A half-parsed panel that silently dropped a key would be a data-integrity failure; showing the original text is honest and loses nothing. There is deliberately no type coercion — values stay strings, so YAML's `no`-becomes-`false` class of surprises can't occur. The values are displayed, never computed on.

Fail-loudly is a claim worth auditing, because it quietly failed in five places at once and every one of them looked fine from the outside: duplicate keys overwrote each other, `__proto__` disappeared through `Object.prototype`'s setter, `{a: 1}` under an explicit `---yaml` fence half-parsed into key `{a` / value `1}`, `- Autor Name: Ben` slipped past a sequence guard whose alphabet was narrower than the parser's, and an unknown escape like `é` rendered literally. Four of them now throw. The fifth is kept: on a map without a prototype `__proto__` is an entry like any other, and the panel shows it. `tests/frontmatter.test.mjs` holds all five as cases, beside the rest of this section. The lesson generalises: **every regex that recognises a key must use the same alphabet.** Three used to disagree, and each disagreement was a silent bug.

**Multi-document streams** are listed as unsupported above and are worth spelling out, because the failure is not loud: the closing-`---` search stops at the first delimiter, so `---\na: 1\n---\nb: 2\n---` parses document 1 into a confident-looking panel and leaks `b: 2` into the body as a setext `<h2>`. That is standard frontmatter behaviour and is not going to change; it is simply not the raw panel this section otherwise promises.

**Not mistaken for a thematic break, and not swallowing prose.** A document may legitimately open with `---`, so detection is separate from parsing — and it needs **two** signals, not one. "First meaningful line is a `key:`" is not enough on its own, because that shape is equally an ordinary sentence: `---\nNote: this is a draft.\n---` used to be reinterpreted as a one-entry mapping, which moved the author's prose out of the body into a collapsed panel. The tie must never break toward hiding body text. So a block is frontmatter when it holds **two or more entries, or one recognized metadata key** (`title`/`version`/`date`/`author`) — one prose line satisfies neither, while a lone `title: X` still gets its panel. A `{` first line is JSON and unambiguous on its own.

The second way body text used to disappear was an **unterminated** block: the closing-`---` search is document-wide, so it latched onto the next thematic break and dragged whole paragraphs into the candidate, which then failed to parse and buried them under "nicht lesbar". Frontmatter never contains blank-line-separated prose; a document does. That signature now disqualifies the block, so the malformed source renders as what it is and the prose stays where the author put it.

`---\nSome intro.\n---` and an empty `---\n---` are left completely untouched. An explicit but empty header (`---json\n---`) is consumed and renders nothing — announcing "nicht lesbar" over an empty `<pre>` would be a lie. A block that looks like frontmatter but fails to parse gets the raw panel; a block that doesn't look like frontmatter at all is not frontmatter.

**Title derivation.** `deriveDocTitle()` is the single source of truth for "what is this document called?", used by the download filename and all three read-only export `<title>`s. It is handed the source and reads the **body**, i.e. the source with frontmatter split off. Previously each of those four sites ran `/^#\s+(.+?)\s*$/m` against the raw source, so a YAML comment like `# internal draft` won against the document's real `# Heading` — files downloaded as `internal-draft.html`. Splitting the frontmatter off fixes that.

### Callouts

A blockquote whose first line is only an alert marker renders as a callout: a note or a warning that reads as one.

```markdown
> [!NOTE]
> Der Automat druckt den Beleg auf Wunsch ein zweites Mal.
```

| Marker | Label | Symbol (Octicon) | Colour of edge, label and symbol |
|---|---|---|---|
| `[!NOTE]` | Hinweis | `info` | `#0969da` |
| `[!TIP]` | Tipp | `light-bulb` | `#1a7f37` |
| `[!IMPORTANT]` | Wichtig | `report` | `#8250df` |
| `[!WARNING]` | Achtung | `alert` | `#9a6700` |
| `[!CAUTION]` | Vorsicht | `stop` | `#cf222e` |

**The convention is GitHub's:** the alerts of GitHub Flavored Markdown, these five types and no others. dokufix adds no syntax. A callout at the top level of a document renders as an alert on GitHub, with GitHub's English labels, and in a renderer that does not know the convention as a quotation that begins with the line `[!NOTE]`, which is what dokufix itself showed until story 2.2. One thing dokufix does and GitHub does not: GitHub's documentation says that alerts cannot be nested within other elements, and dokufix builds a callout at any depth. A marker in a quote inside a quote, in a list item or in another callout is a callout in dokufix and a plain quotation on GitHub.

**What is recognised.** `buildCallouts()` in `src/app/callouts.js` is the document pass `Hinweise`. It works on the markup `marked` emits, not on the Markdown, and leaves the tokens of `marked` alone.

| Source | Result |
|---|---|
| `> [!NOTE]`, then `> text` | callout; the marker is gone, the content keeps its formatting, lists and nested blocks |
| `> [!note]`, `> [!Note]` | callout: the case does not matter |
| `> [!WARNING]`, then a list, a new paragraph or a code block | callout; no empty paragraph is left where the marker stood |
| `> [!IMPORTANT]` with a hard break behind it (two blanks or a backslash) | callout; the line break is gone |
| `> [!CAUTION]` and nothing else | callout with its label alone |
| a marker in a quote inside a quote, in a list item, in another callout | callout; on GitHub a plain quotation |
| `> [!NOTE] text`, anything else on the marker's line | ordinary blockquote, unchanged; the one exception is a raw `<br>`, see the known limits |
| `> [!FOO]`, an unknown type | ordinary blockquote, unchanged |
| a marker that is not the first line of its quote | ordinary blockquote, unchanged |

**The markup** is `<div class="dokufix-callout dokufix-callout-note" role="note">`, and its first child is `<p class="dokufix-callout-label">Hinweis</p>`. The type is that word, text in the markup; colour and symbol are decoration from `src/doc.css`. A callout is document content like the metadata panel: the pass produces it in the preview, every export copies the preview, so it is in all four variants, and `nur-lesen` needs no script for it.

**Beside the product's warning.** `[!WARNING]` reads "Achtung", so that the word "Warnung" belongs to the product's own warning alone (see *Render passes*). The two differ in more than colour: a callout has an edge on its left and nothing else around it, and its label is a line of its own with a symbol; the warning is a box with a border all round and a background, and "Warnung:" opens its first line.

**A heading inside a callout is no document heading.** `> ### Titel` in a callout is styled as a heading and is nothing else: it gets no id, so a link to it has no target; it is not in the inline table of contents, not in the rail of the editor and not in the rail of an export; with numbering switched on it gets no number, and the headings after it are numbered as they are without it. The first three follow from `documentHeadings()`. The numbering is switched off in `src/doc.css`, by rules for headings inside `.dokufix-callout` that outweigh the numbering rules: where a heading stands is something a selector sees, so no class is set for it. A heading in an ordinary blockquote counts as before.

**The symbols** are Octicons, the ones GitHub shows for the five alert types: `info`, `light-bulb`, `report`, `alert` and `stop`, each in its 16 px form, from the npm package `@primer/octicons` in version 19.38.0 (MIT licence, "Copyright (c) 2026 GitHub Inc."). The package is not a dependency. The path data of `build/svg/<name>-16.svg` stands unchanged in `src/doc.css`, each icon as a `data:` URI on the `::before` of the label, with `<`, `>` and `#` percent-encoded and the colour of the type as `fill`. So a symbol looks the same on every system, travels with the document styles into all four variants, and the markup stays text. The URIs pass through esbuild, the build's guard against `</style`, the style check and `compactCss()` of the export path as they are written: `tests/callouts.test.mjs` compares the built file with the source, and the comparison run loads each symbol in each variant and expects a picture of 16 × 16 px.

**The licence notice** for the icons is in every file since story 2.18: the Octicons are one of the four entries behind the link "license information", with the copyright line above and the text of the MIT licence. Until then `dist/dokufix.html` and every file written from it carried the path data of the five icons and no notice; `src/doc.css` names set, version and licence in a comment, which the build removes. See *Licence information*.

**What callouts did to documents** (2026-10-02, `tests/vergleich.mjs`, the built file before story 2.2 against the one after, Chromium 153 and Firefox 153, with the reference document as it was before the story and with the demo text, neither of which has a callout): all 136 screenshots are pixel-identical, and all assertions are green. Outside its `<style>` each of the twelve read-only exports is the file it was, byte for byte; the stylesheet in it grew by 4 634 B, the rules for callouts. The file itself and every `Mit Editor` file grew by 5 930 B (72 302 → 78 232 B). Then the reference document got its five callouts; with it all assertions are green in all four variants and both browsers, and its sizes are under *Download variants*. Control: built with the two numbering rules for headings inside a callout and the filter in `documentHeadings()` taken out, the run fails in every variant (Chromium) on the three checks that concern them: the heading has an id and stands in table of contents and rail, it counts, and the page with numbering on equals the one with the heading forced into the count.

**Two known limits,** both because the pass sees the markup and not the tokens; telling these cases apart needs an extension of `marked` on token level.

- *A masked marker becomes a callout.* `> \[!NOTE\]` is how Markdown writes a quotation that begins with the literal text `[!NOTE]`. `marked` emits the same markup for it as for `> [!NOTE]`. Until then a quotation that is to begin with that text writes it as code (`` > `[!NOTE]` ``) or puts more on the marker's line (`> [!NOTE] text`); both stay quotations.
- *A raw `<br>` on the marker's line becomes a callout too.* `> [!NOTE]<br>text` has something else on the marker's line and should stay a quotation. It arrives as `<p>[!NOTE]<br>text</p>`, the markup of a marker with a hard break behind it, so it becomes a callout and the `<br>` is removed.

### Status chips

A code span that starts with a colour dot, a blank and a label renders as a status chip: a small coloured label that marks the state of a process or a system, in running text, in a table cell, in a heading.

```markdown
| Automat 1 | Eingang | `🟢 in Betrieb` |
```

| Dot | Class | Word for assistive technology | Label | Mark | Tint | Contrast of label, of mark | Shape of the mark |
|---|---|---|---|---|---|---|---|
| 🟢 | `dokufix-chip-green` | grün | `#116329` | `#1a7f37` | `#dafbe1` | 6.64 : 1, 4.56 : 1 | filled circle |
| 🟡 | `dokufix-chip-yellow` | gelb | `#7d4e00` | `#9a6700` | `#fff8c5` | 6.58 : 1, 4.52 : 1 | triangle |
| 🔴 | `dokufix-chip-red` | rot | `#a40e26` | `#cf222e` | `#ffebe9` | 6.86 : 1, 4.67 : 1 | square |
| ⚪ | `dokufix-chip-grey` | grau | `#424a53` | `#57606a` | `#eaeef2` | 7.71 : 1, 5.48 : 1 | ring |
| 🔵 | `dokufix-chip-blue` | blau | `#0550ae` | `#0969da` | `#ddf4ff` | 6.68 : 1, 4.56 : 1 | diamond |

**The convention is a starting point** (decision D2, 2026-10-01): dokufix adds no syntax, and a better one may replace this. What counts as a chip is decided in one module, `src/app/chips.js`; nothing else tests for a colour dot, and `tests/chips.test.mjs` fails when another module of the script starts to. In a renderer that does not know the convention, GitHub among them, the span stays what it is in Markdown: inline code that begins with the emoji, `🟢 Live` in a monospace font. The status is still readable there, by the dot and the label.

**What is recognised.** `buildChips()` is the document pass `Status-Chips`. Like the callout pass it works on the markup `marked` emits, not on the Markdown, and leaves the tokens of `marked` alone.

| Source | Result |
|---|---|
| `` `🟢 Live` ``, `` `🟡 Live` ``, `` `🔴 Live` ``, `` `⚪ Live` ``, `` `🔵 Live` `` | chip with the class of its colour; the dot is gone, the label stays |
| the dot with a variation selector behind it (U+FE0F, as an emoji keyboard writes ⚪) | chip |
| `` `🟢  Live` ``, more blanks behind the dot; blanks behind the label | chip; they do not belong to the label |
| in running text, a table cell, a heading, a link, bold or emphasised text, a list item, a quotation, a callout, a footnote | chip; in a link it is underlined |
| `` `x` ``, `` `x 🟢` `` | ordinary code, unchanged |
| `` `🟢` ``, `` `🟢x` ``: no label, or no blank | ordinary code, unchanged |
| a tab or a no-break space in place of the blank; a dot that is none of the five (🟣, 🟠, ⚫) | ordinary code, unchanged |
| a line `🟢 Live` in a code block, fenced or indented | unchanged |
| `<code>` written as HTML that holds markup, `<code>🟢 <b>Live</b></code>` | unchanged |

**The markup** is `<span class="dokufix-chip dokufix-chip-green"><span class="dokufix-chip-status">grün: </span>Live</span>`. A chip is document content like a callout: the pass produces it in the preview, every export copies the preview, so it is in all four variants, and `nur-lesen` needs no script for it. In a footnote it is a chip in the footnote's preview as well, because the preview keeps `<span>` elements.

**The look** is in `src/doc.css`: a pill in small capitals of the monospace stack the document already uses, 11 px, on a light tint. The mark has a colour of the callouts' palette (grey has none there); the label is a darker shade of it, so that it reads well at that size (Ben, 2026-10-02: the text a little darker). The contrast against the tint is at least 6.5 : 1 for the label and at least 4.5 : 1 for the mark; `tests/chips.test.mjs` works both out from the rules. A chip does not make its line higher: measured in a table row, a heading and a callout, in Chromium 153 and Firefox 153, the block is as high with the chip as with plain text in its place. A chip in a link carries an underline of its own: the link's underline does not reach a box that sets its own colour, and without one nothing would say that the chip leads somewhere. In print the tint and the mark stay (`print-color-adjust`), as the symbols of the callouts do: an export printed to PDF from Chromium 153 without background graphics shows both.

**Not by colour alone.** Two things say the status besides the colour.

- *A mark before the label, a different shape per colour:* a filled circle, a triangle, a square, a ring, a diamond. They are drawn in the document styles, the `::before` of the chip, with no font and no image. The spike gave ⚪ and 🔵 one look; here the five differ pairwise. The comparison run photographs them all in one colour and expects every pair to differ. Where the system replaces the colours (`forced-colors`), backgrounds are dropped; the marks are kept by a rule of their own, and the chip's border, transparent otherwise, outlines it (looked at in Chromium 153 with forced colours emulated; no check holds it).
- *The name of the colour as text:* the inner `<span class="dokufix-chip-status">` holds "grün: ", visually hidden and not `display:none`, so a screen reader says "grün: Live" and two chips with the same label and different colours are two different texts. The word is text of the page in two more ways (probed in Chromium 153 and Firefox 153): the text search of a browser finds it, and a selection over a chip carries it, "grün: in Betrieb" in Firefox and "grün:IN BETRIEB" in Chromium, which takes the label as it is shown. The hidden word is placed against its chip, which is `position:relative` for that reason alone. Placed against the page it does not scroll with the preview pane of the editor and makes the page behind the pane as high as the document, so that a click on an entry of the table of contents scrolls the toolbar out of the window; the comparison run checks both.

**A chip in a heading.** That word is part of neither the heading's entries nor its anchor. `## Bestellung` with the chip `🟢 Live` behind it is "Bestellung Live" in the table of contents and in both rails, and its anchor is `bestellung-live`; a heading that is only a chip is "Live" with the anchor `live`, never an empty entry. Both come from `headingLabelText()` in `src/app/toc.js`, which leaves the word out by the class `chips.js` exports. A chip that touches the text before it gets a blank there, one and no more: `## Bestellung:` with the chip directly behind the colon reads "Bestellung: Live" and keeps the anchor `bestellung-live`, because as a code span it held that blank itself, behind the dot. A chip with a blank before it, or at the start of the heading, gets none. The anchors are the ones these headings had before there were chips, when the dot fell out of the slug as every character does that is no letter or digit: a document that already wrote a status into a heading keeps its links, and no other anchor moved. In the entries the chip is its label as plain text, without pill and mark.

**What chips did to documents** (2026-10-02, `tests/vergleich.mjs --strict`, the built file before story 2.3 against the one after, Chromium 153 and Firefox 153, with the reference document as it was before the story and with the demo text, neither of which has a chip): all 136 screenshots are pixel-identical, and all assertions are green. Outside its `<style>` each of the twelve read-only exports is the file it was, once the ids Mermaid generates are masked (in this pair of runs the Chromium exports of the reference document fell on the two forms described under *The script's modules*); the stylesheet in it grew by 1 694 B, the rules for chips. The file itself and every `Mit Editor` file grew by 2 626 B (84 103 → 86 729 B). Then the reference document got its chips; with it all assertions are green in all four variants and both browsers, and its sizes are under *Download variants*. `tests/speichern.mjs` and `tests/durchlaeufe.mjs` are green in both browsers; a chip cannot fail, so the failure-case run has no case for it. Afterwards the demo text got a section on status chips (Ben, 2026-10-02), so that they can be seen and tried in the file as it opens: the five colours in running text, a table, a heading, bold text and a link. The file grew by another 903 B (86 729 → 87 632 B); with the new demo text all assertions are green in all four variants and both browsers, and so are the save round trip and the failure-case run. Then the labels got a darker shade than the marks (Ben, 2026-10-02), which gives each mark a colour of its own: another 122 B in the document styles of every variant (87 632 → 87 754 B), and all assertions green again with both documents. Three controls, each a copy of the sources built and run in Chromium on the new reference document: with the mark of blue drawn like the one of grey, and the word set to `display:none`, the run fails in every variant on the pictures of the marks ("grey and blue: 0 px"), on the word and on the accessible text; with `headingLabelText()` leaving the word in, it fails on the anchors (`automat-im-eingang-gruen-in-betrieb`) and on the entries; with the pass moved behind the table of contents, it fails on the entries, which then carry the dot.

**Known limits,** because the pass sees the markup and not the tokens, and because the convention borrows the code span.

- *A code span that only happens to start like a status becomes a chip.* `` `🔴 = Fehler` `` in a legend that explains the dots is meant as code and renders as a red chip reading "= Fehler". The way round it is anything before the dot; a blank is enough: `` ` 🔴 = Fehler` `` stays code. (A blank at both ends does not help: Markdown strips one from each end of a code span.) A legend can also put the dot outside the span.
- *A `<code>` element written as HTML with text alone becomes a chip too.* `<code>🟢 Live</code>` arrives as the markup of a code span.
- *The label is shown in capitals,* by `text-transform`. The text in the markup keeps its case, and so does the word for assistive technology; a browser may hand the label to a screen reader in capitals.

### Licence information

A dokufix file uses work of others, and the MIT licence, which all of it is under, permits that on one condition: the copyright notice and the permission notice are included in all copies or substantial portions. So every variant has a small text link, "license information", and behind it a view with the notices.

**The list** is `NOTICES` in `src/app/licences.js`, the one place the notices stand in:

| Entry | Version | Licence | Copyright lines, as published | How it gets into a file |
|---|---|---|---|---|
| `marked` | 18.0.14 | MIT | "Copyright (c) 2018+, MarkedJS (https://github.com/markedjs/)" and "Copyright (c) 2011-2018, Christopher Jeffrey (https://github.com/chjj/)" | the editor loads it from the CDN |
| `marked-footnote` | 1.4.0 | MIT | "Copyright (c) 2023-2024 Stilearning (https://stilearning.com)" | the editor loads it from the CDN |
| Mermaid | 12.0.0 | MIT | "Copyright (c) 2014 - 2022 Knut Sveidqvist" | the editor loads it from the CDN |
| Octicons (`@primer/octicons`) | 19.38.0 | MIT | "Copyright (c) 2026 GitHub Inc." | the path data of five icons is in the document styles |

- **What is on it** is what a file loads or carries. The tools of the build (esbuild, ESLint, Playwright, linkedom) are in no file and are not listed.
- **The lines** were fetched on 2026-10-02 from jsDelivr and GitHub. The npm package of `marked-footnote` has no licence file; its line is from the file `license` of its repository, `bent10/marked-extensions`. The licence file of `marked` also carries the notice of the original Markdown ("Copyright © 2004, John Gruber"); that one is not shown (decision of 2026-10-02).
- **The view** shows the four entries, each with name, version, licence and copyright lines, one sentence on how they get into a file, and below them the permission notice of the MIT licence once, in its wording (`LICENCE_TEXTS`). The words around the entries are English, like the link.
- **A read-only export loads nothing from the CDN.** It carries what the libraries produced, and the icons. The view is the same in all four variants all the same: it says what the editor loads, and an export is written by that editor.

**A story that adds a library** adds one entry to `NOTICES`: `name`, `package` (its name on npm), `version`, `licence`, `copyright` (one line per holder, as published) and `use` (`'cdn'` or `'embedded'`). If its licence is not the MIT licence, the text goes into `LICENCE_TEXTS` under the key the entry names; the view shows every licence text once. Nothing else has to change: the editor and the three exports take the markup from `licencesHtml()`. `tests/licences.test.mjs` compares the list with what the sources pin: every jsDelivr npm URL in `src/index.html`, whatever tag and attribute it stands in (`<script src>`, `<link href>`), and the Octicons version in the comment of `src/doc.css`. A URL without an entry, an entry without a URL, a URL without a version and two versions that differ each fail a case, which names the entry. What the test does not see: a library loaded from another host, and one the script itself imports or loads; nothing does either today, and a story that starts to has to extend the test. An entry the test does not know fails until its published lines are added there as well, a second copy on purpose. Story 2.7 adds `bpmn-js` this way.

**The element** is `<details class="dokufix-licences">`: its `<summary>` is the link, a `<div class="dokufix-licences-view">` the view. Opening and closing is the browser's. There is no listener: no Escape, no click outside. Every text in it is escaped, and it contains no script, so `nur-lesen` stays without one.

**Where it stands.**

| Where | The element | The link | The view |
|---|---|---|---|
| `nur-lesen`, `schlank`, `kompakt` | written by the export directly after `<body>`, outside `<main>` | in the empty top margin, above the first line, its right edge on the right edge of the text column | a box below the link, right-aligned with it, at most 560 px wide and 70 % of the window high, scrolling inside; it lies over the document |
| `Mit Editor`, read mode | made by the script at load, in `<body>` before "Editor ↩" | the same place. In a window up to 820 px, where "Editor ↩" stands in that corner, left of the button | the same; in a narrow window it reaches back to the right edge of the text column |
| `Mit Editor`, edit mode | made by the script at load, the first of the toolbar's actions | in the dark toolbar, a flex item of the row | below the toolbar, at its right edge |
| `Mit Editor`, edit mode, window up to 820 px | the same element | in the hamburger panel, its first line | inline in the panel, like the download menu; at most half the window high. The panel ends at the window's lower edge and scrolls inside itself, so with the view and the download menu both open every action stays in reach |

- **It takes no room.** In read mode and in the exports the element is `position:absolute`, so it is out of the flow, and in the rail grid it is no grid item. The document starts where it starts without it; the comparison run measures that with the element taken out, closed and open.
- **It is placed against the page, not against `<body>`.** No ancestor of it is positioned. A positioned `<body>` was the first design and was measured on 2026-10-02: it becomes the containing block of every footnote preview too, and at 390, 600 and 900 px their fallbacks then put them elsewhere (in Chromium 153, 15 of 45 placements). So the right edge of the text column is worked out from the page's width, and the numbers of the layout stand in these rules once more: `max(32px, 50% - 443px)` for the column of 950 px with its padding of 32 px, 22 px in a narrow window, and beside a rail `max(0px, 50% - 781px) + 530px`, the grid of at most 1562 px with padding, rail and gap. Change the layout, and these change with it; the comparison run fails when they do not, at thirteen widths from 320 to 1900 px.
- **In the toolbar it costs about 110 px of the row.** To make up for that the hint "Strg+Enter rendert" is hidden up to 1300 px, where before it was hidden up to 820 px. Measured in Chromium 153, pixel by pixel from 1400 down to 821: before the link the toolbar stayed in one row down to 1160 px, and "Lesen" stayed inside the window down to 995 px. With the link and the hint as it was, those limits are 1271 and 1106 px; with the hint hidden up to 1300 px they are 1111 and 989 px. Not taken: leaving the hint alone, which costs a window between 995 and 1105 px its "Lesen" button.
- **It prints with the page.** There is no print rule.

**Why it is frame, not document.** The link belongs to the page a document is shown in, like the export's footer. It is no part of what the author wrote, no document pass produces it, and `src/doc.css` has no rule for it (decision of 2026-10-02; the alternative was a document pass with styles in `src/doc.css`). The cost is accepted: its styles stand twice, in `src/app.css` for the editor and in `READONLY_FRAME_CSS` for the exports, kept alike by hand. The style check treats the two places differently (see *Document styles*). In the export frame it lists the link's selectors one by one, and any other selector fails, `.dokufix-licences h5{…}` included. In `src/app.css` it only allows the two names, `.dokufix-licences` and `.dokufix-licences-view`: a rule there that uses them passes whatever else it selects, `.dokufix-licences h5{…}` too, and fails only when it uses another `dokufix-` name or a name of the document styles. And nothing compares the two copies with each other: a rule changed in one place and not in the other passes every check, and shows only where the comparison run measures the link.

**An open view does not travel.** In the editor both elements are made by `registerLicences()` in `src/app/editor.js` when the page loads, and both carry `data-dokufix-transient` (see *Render passes*). `Mit Editor` removes them from its clone like every transient element, so the save needs no line of its own, a saved file stays the built file with other data blocks, and the list exists once in the file, in the script. The exports write the element fresh from `licencesHtml()`, so it is closed whatever the editor shows. In `kompakt` it stands outside the packed body: it is there before the decoder has run, and with JavaScript off.

**What the licence information did to documents** (2026-10-02, `tests/vergleich.mjs`, the built file before story 2.18 against the one after, reference document and demo text, Chromium 153 and Firefox 153): all assertions are green, and each of the 136 screenshots differs from the one before in one place, the link: rows 60 to 70 and about 100 columns that end at the right edge of the text column, in read mode and in the three exports, and rows 28 to 39 in the toolbar of the edit-mode screenshot. Control: the same sources with one rule more, `.dokufix-licences{visibility:hidden}` at the end of `src/app.css` and of the export frame, compared with `--strict` by the comparison run as it was before the story: all 136 screenshots are pixel-identical to before. Outside its `<style>` each of the twelve read-only exports is the file it was plus the one element, once the ids Mermaid generates are masked. The element is 1 906 B and the frame rules of the link 1 016 B, so every export grew by 2 922 B; `kompakt` by the same, because the element stands outside what it packs. The file itself and every `Mit Editor` file grew by 5 871 B (78 232 → 84 103 B). `tests/speichern.mjs` and `tests/durchlaeufe.mjs` are green in both browsers. Controls (Chromium): on the build with the invisible link the comparison run fails in every variant, on every check that needs the link to be seen, and still writes its screenshots and sizes; built without the transient mark on the editor's two elements, the save round trip fails in every save on the comparison with the built file, and shows the element, and the failure-case run fails on the check that the saved file has no licence element.

### Table of Contents (two layers)

Two complementary mechanisms, deliberately separate:

- **Inline `[[toc]]` marker** — write `[[toc]]` (default H2+H3) or `[[toc:N]]` for `N` in 1–6 (depth) on its own line in the markdown. The marker only fires when the paragraph contains nothing but the literal text — wrapping it in inline elements (e.g., `` `[[toc]]` `` to *talk about* the marker) leaves it as visible content. At render time, the matching paragraph is replaced with a nested `<nav class="dokufix-toc">` list. The list is **static HTML** — it travels through every export variant including the JS-free `nur-lesen` one, and the numbering toggle reaches it via a dedicated `tocH2/tocH3/tocH4` counter scope (no double-counting with body headings).
- **Right-side rail** — auto-generated from H2/H3/H4 headings, visible above ~1500 px viewport when the document has ≥ 4 such headings. At wide viewports the body switches to a 2-column **grid**: a 1000 px content column (centered in its track) and a 425 px rail column, sharing the same horizontal budget with a 73 px gap instead of overlapping. The body caps at 1562 px (1000 + 73 + 425 + 64 padding), so from 1562 px upward both columns hit their exact target widths; between 1500 and 1561 px the content track flexes a little while the rail stays pinned. The rail uses `position: sticky; top: 80px` so it stays in view during scroll while still participating in the grid for sizing. Two flavors of the same UI:
  - **Live (editor / `Mit Editor` downloads):** scroll-based "reading line" scrollspy picks the last heading whose top edge sits at or above 25 % of the viewport — so there is always exactly one active entry (the first heading before scrolling, the last after the document ends, the just-scrolled-past one in between). The active link is auto-scrolled into view inside the rail's own scroll container so it stays visible in long tables of contents. Smooth-scrolls on click. Visible only in read mode.
  - **Static (read-only downloads — `nur-lesen`, `schlank`, `kompakt`):** pre-built HTML emitted at export time with the same heading list and CSS, but no JS dependency. Clicking jumps via native anchor — no scrollspy, no smooth scroll. Survives the JS-free `nur-lesen` variant.

Heading IDs are slugified deterministically, from the text the heading's entries show (`headingLabelText()`; see *Render passes*). German `ä/ö/ü/ß` (and uppercase variants) are explicitly spelled out, then `String.prototype.normalize('NFKD')` folds the remaining Latin diacritics (`é → e`, `à → a`, `ñ → n`, `ç → c`) before stripping combining marks. CJK and other non-Latin scripts that don't decompose under NFKD collapse to `section`, deduped with `-N` suffixes. Anchor links remain stable across re-renders for the same heading text.

### Version history

The history block (`#dokufix-history`) shape:

```json
{
  "uuid": "987d2a3b-d26c-4d07-b3ff-b4e3ae0c6615",
  "version": 3,
  "history": [
    { "v": 1, "t": "2026-05-13T14:32:00.000Z", "m": "Erste Fassung",   "s": "<gzip+base64>" },
    { "v": 2, "t": "2026-05-13T15:45:00.000Z", "m": "",                "s": "<gzip+base64>" },
    { "v": 3, "t": "2026-05-14T09:12:00.000Z", "m": "Audit ergänzt",   "s": "<gzip+base64>" }
  ]
}
```

The `s` field of each entry is `gzipB64()` of the markdown source at that version — captured at commit time. Every prior version is fully recoverable from the file alone (basis of the audit story).

Two ways to create a new entry:

1. **"Mit Editor" download (canonical save).** Asks for an optional message via `prompt()`. Cancel aborts entirely; Enter on an empty input proceeds without a message. The counter bumps, the entry lands in the history list (including a gzipped snapshot of the current source), and the file is emitted with everything baked in. Counter increment and persistence happen *after* `triggerDownload` returns, so a popup-blocker or serialization failure can't leave a phantom version with no on-disk artifact.
2. **Commit-only (button in the version modal).** Same prompt, same bump, same history append — but no file is produced. The new state is persisted to `localStorage` (under the UUID-scoped versions key) so it survives a reload. Later "Mit Editor" downloads pick up all accumulated commits in a single file.

Both flows are **skipped silently when the source matches the last committed/saved state** (the `commitBaseline`). Clicking "Mit Editor" on an unchanged document re-emits the same version without a prompt or counter bump; clicking the commit button when nothing has changed shake-animates instead of prompting. By design, every prompt corresponds to actual uncommitted changes.

On load, version state comes from whichever of two sources is more recent: the file's baked-in `<script type="application/json" id="dokufix-history">` block, or `localStorage`. localStorage wins when commit-onlys have happened since the last download. History entries are shape-validated on load (well-formed `{v, t}` minimum); malformed entries are silently filtered out rather than crashing init. `null`, negative, or fractional `version` values normalize to `0`. Files without the history block (older dokufix files predating this feature) load as `version: 0, history: []`; the first save bootstraps the history at `v1`.

Every `<` in commit messages or source snapshots is written as `\u003c` before it goes into the JSON block, so a `</script>` in a message cannot close the block early, and a `<!--` followed by `<script` cannot keep it from closing (see *`</script>` escaping*).

If `localStorage` setItem fails (quota exhausted, private-mode disabled), the version badge gains a red `.persist-failed` class with a pulse animation and an accessible title attribute — silent data loss is no longer possible.

Read-only downloads do *not* bump the version — they ship a `Version N · DD.MM.YYYY HH:MM · message · exportiert <date>` footer at the end of the document. Files with `version: 0` still emit a footer carrying just the export timestamp (the spec wants timestamps as always-present metadata). For the `kompakt` variant the footer lives inside the gzip payload so it survives decompression.

### Dirty-state baseline

The dirty indicator compares the live editor against `cleanBaseline`, which is set to the file's document, or to the demo text where the file has none, at load time — i.e. whatever is actually baked into *this* HTML file on disk. Consequences:

- An IndexedDB draft that differs from the baked content reads as **geändert** immediately on open. That's the intended "you have unsynced work" signal after a crash or tab close.
- A successful "Mit Editor" download resets `cleanBaseline` to the just-saved content → badge flips to clean. The downloaded HTML file also carries the new baseline, so the receiver opens it as clean.
- The other download variants (read-only) don't touch the baseline, since they don't carry editable source out the door.

### Persistence (IndexedDB)

One database per origin, named `dokufix-v1`, with two object stores:

- **`docs`** (keyPath: `uuid`) — one record per dokufix file: `{ uuid, source, version, history, commitBaseline, updatedAt }`. The whole record is rewritten on every persist; markdown + history JSON is small enough that this is cheap.
- **`assets`** (keyPath: `hash`) — image Blobs, keyed by SHA-256 hex. Content-addressed → uploading the same image twice deduplicates automatically; no GC needed in the PoC.

On first load of a doc whose UUID has a pre-existing `dokufix-doc-<uuid>-source` / `…-versions` pair in the old localStorage layout, the data is migrated into the IDB doc record and the legacy keys are deleted. Idempotent — the migration only fires when no IDB record exists yet for the UUID.

The heading-numbering preference (`dokufix-poc-numbering`) deliberately stays in localStorage. It's doc-independent UX state and has no business cluttering the per-document IDB record.

If IndexedDB is unavailable (some browser private modes, restrictive site settings), the init code surfaces a banner and continues in a degraded read-only mode — the baked document or demo text is still loaded into the editor so the user can read what they just opened, but `persistDoc` calls will keep flipping the persist-failed flag. There is no localStorage fallback in this PoC, since storing images there would be a non-starter anyway. The banner lies over the top of the page, the "Editor" button included, so it has a close button; closing hides it for as long as the page is open.

### Image assets

Images live in IndexedDB and are referenced from the markdown source via `![alt](#asset-<sha256>)`. Three input pathways converge on a single pipeline:

1. **Paste** — clipboard `paste` event on the textarea. Captures `it.kind === 'file' && it.type.startsWith('image/')`. Lets normal text paste through untouched.
2. **Drag & drop** — `dragenter`/`dragover`/`drop` on the source pane. A drop overlay highlights the target during the drag.
3. **`+ Bild` button** — hidden `<input type="file" accept="image/*" multiple>` triggered by a toolbar button.

The pipeline: `createImageBitmap({ imageOrientation: 'from-image' })` decodes and applies EXIF orientation. Two size guards run before allocating the canvas: a 5 MB per-file input cap (cheap to check, blocks pathological inputs early) and a 25-megapixel decoded-pixel cap (a 4.9 MB heavily-compressed JPEG can decode to 12000×8000 = 96 MP and OOM the tab during `drawImage`; the encoded-byte cap doesn't protect against that). If the bitmap is wider than 1600 px, it's downscaled. The result is drawn to an `OffscreenCanvas` and re-encoded as WebP @ 0.85 (fallback to `<canvas>.toBlob` if OffscreenCanvas isn't available). The output bytes are SHA-256-hashed via `crypto.subtle.digest`; the hex digest becomes both the IDB key and the markdown reference. The decoded `ImageBitmap` is released via `bitmap.close()` in a `finally` block so a failed encoding pass doesn't leak the native buffer. Alt-text derived from the filename is sanitized — characters that would otherwise break out of the markdown image syntax (`[`, `]`, `(`, `)`, `\`, `` ` ``, `<`, `>`) are stripped, so a malicious filename like `x](http://attacker.com/track.png).png` can't inject an attacker-controlled `src`.

**Render-time resolution.** After `marked.parse(md)`, the HTML string is run through `resolveAssetRefsInHtml`, which `idbBatchGetAssets`-fetches every `#asset-<hash>` referenced in the document. Each match is rewritten to a Blob URL via `URL.createObjectURL`. Unresolved hashes get a transparent 1×1 GIF data URL as the `src` plus a `data-missing-asset` attribute; CSS turns those into a red "Bild fehlt" placeholder. (Using `src=""` for missing assets would trigger the browser to fetch the document URL itself, which is a footgun.) After each render, `pruneAssetUrlCache` revokes Blob URLs whose hashes are no longer referenced from the source — without this, every distinct image inserted in a session would hold its decoded pixels in memory until tab close. The missing-asset rule is a document style, so every read-only export carries it too: a recipient who opens an export with a stale or missing asset sees the same "Bild fehlt" placeholder rather than an empty image element.

**Heading-slug guard.** Heading anchors and asset references share the `#`-fragment namespace. `slugify` explicitly rejects any heading slug that would start with `asset-` (or be exactly `asset`), prefixing it to `h-asset-…`. Without this, a heading literally titled "Asset Inventory" could otherwise be resolved as an image ref.

**Baking on "Mit Editor" download.** `bakeAssetsForDocument` collects every asset hash referenced by the current source *and by every history snapshot* (each snapshot is gzipped markdown — we decompress and re-scan). Every matched Blob is Base64-encoded into a JSON map `{ hash → { m: mime, d: base64 } }` and serialized into the `<script type="application/json" id="dokufix-assets">` block in the document clone. If the bake fails (transaction abort, base64 conversion error on a corrupt asset), the download is aborted with a user-facing message rather than silently emitting a broken file. On the receiver's first open, `seedAssetsFromBakedBlock` parses that block and writes each entry into IndexedDB — but only after **re-hashing the decoded bytes** and verifying the result matches the asserted hash. Mismatched entries are logged and skipped: a hostile sender can't pair an attacker-supplied blob with an arbitrary lookup key. Content-addressed dedup keeps re-seeds of identical hashes idempotent.

**Read-only export inlining.** `inlineAssetRefsAsDataUrls` runs on the cloned preview HTML before serialization for all three read-only variants. It handles both `src="#asset-<hash>"` (unresolved) and `src="blob:<url>"` (already resolved by the live render pass — the cache's reverse map gives back the hash). Output is `src="data:image/webp;base64,…"`. Missing assets keep the same transparent placeholder + `data-missing-asset` shape used in the live preview, so the receiver sees the same "Bild fehlt" treatment in the export. For the `kompakt` variant this is further gzipped along with the rest of the body; binary image bytes don't compress meaningfully a second time, but the Base64 envelope itself shrinks by ~30 %.

### Compression

All compression uses native browser **`CompressionStream('gzip')`** — no library dependency.

Brotli would compress 15–25% better, but is currently *missing* from `CompressionStream` in Chrome / Edge as of May 2026 (Firefox 147 and Safari 18.4 have shipped it). We stay on gzip until Chrome catches up. Migration is a one-line swap.

### `</script>` escaping

Template literals embedded inside the main `<script>` element use `<\/script>` to avoid the HTML parser prematurely closing the outer script tag. Classic gotcha — escape both the payload-holder tag and the inner decoder script.

The build guards the same thing twice. esbuild writes `<\/script` wherever it meets `</script` in the script, and `build.mjs` refuses to write a file whose minified script still contains `</script` or whose minified styles contain `</style`.

`<!--` is the second trap, and the quieter one. Inside a script element, `<!--` followed by `<script` keeps the real `</script>` from closing the element: the page's script then never runs, and a data block swallows the blocks behind it. The script contains `<script` in the templates of the read-only exports, and esbuild does not guard this case; minifying, it even prints `"<"+"!--"` and `"\x3c!--"` as `"<!--"` again. So `build.mjs` writes every `<!--` of the bundled script as `\x3c!--`, which is the same character in a string, a template and a regular expression, and refuses a script that still contains one. In the data blocks every `<` is written as `\u003c`: by the build for the demo text, by `encodeJsonForScript()` for everything a save writes. A demo text, a document or a version description may therefore contain `</script>`, `<!--` and `<script>`.

### Self-replication mechanism

"Mit Editor" clones the page (`document.documentElement.cloneNode(true)`), takes out what belongs to the running page, writes four data blocks of the clone through the DOM, and serialises the clone. What is taken out: every element marked `data-dokufix-transient` (see *Render passes*), the two elements of the link "license information" among them, Mermaid's `.mermaidTooltip`, the rendered preview and the rail; and state on elements of the page itself is reset one by one: an open menu, the open hamburger panel of a narrow window, disabled download buttons, the dirty mark with the title and the badge's text, the drop highlight, the storage banner with its reason, the warning on the version mark. The data blocks:

| Block | What a save writes into it |
|---|---|
| `#dokufix-history` | UUID, version and history, each entry with its gzipped source |
| `#dokufix-assets` | every image the source or a history entry refers to |
| `#dokufix-demo` | `{"gz": …}`, the demo text; taken over as it is from a file that already carried it gzipped |
| `#dokufix-source` | `{"gz": …}`, the current source |

The receiver's async init reads both text blocks before the first render. The script travels as it is: in a saved file, and in a file saved from that one, it is the script of `dist/dokufix.html` byte for byte. `tests/speichern.mjs` checks exactly that, and that both generations hold their document.

A saved file is the built file with other data blocks, and nothing else: that is what keeps a file from growing with every generation. `tests/speichern.mjs` compares the two as a whole and allows five differences, each listed with its reason (see *Save round trip*). Leftovers were found that way on 2026-10-02 and removed: the badge still read "geändert" in a file that opens clean, and Mermaid's tooltip element came along; a file saved in a narrow window opened with the hamburger panel open; a file saved while IndexedDB was unavailable carried the sender's storage reason and the warning on the version mark. Heading numbering travels with a saved file on purpose (the class `numbered` on `<body>` and the state of its button); that is among the five.

**Why not as the PoC did it.** The PoC kept both texts in the script, as `DEMO`/`DEMO_GZ` and `SAMPLE`/`SAMPLE_GZ` between comment marks, and a save rewrote the text of the script between those marks with a regular expression. That works as long as the script in the file is the script as written. Measured on 2026-10-02: once esbuild touches the script, saving breaks, because esbuild removes the comment marks; minified, the saved file opens without an error and carries the demo text instead of the document. Hence the rule for everything that follows: no code searches or rewrites script text. What a save has to change lives in a data block.

### `<script type="text/plain">` payload

The "kompakt" variant ships gzip+base64-encoded HTML inside a `<script type="text/plain">` element. This works because the browser does not execute the script (wrong MIME), but the contents are accessible via `textContent`. Decoder reads, decompresses via `DecompressionStream`, sets `innerHTML`.

## Build

```
npm install        # once, in the repository root: esbuild, eslint, globals, linkedom and playwright-core, all pinned exactly
npm run build      # writes dist/dokufix.html
npm run watch      # writes dist/dokufix.dev.html, readable, again on every change under src/
```

`build.mjs` puts five sources into one file:

| Source | What it is | What the build does with it |
|---|---|---|
| `src/index.html` | the page: head, markup, the data blocks, the three CDN tags | taken as written, not minified |
| `src/doc.css` | the document styles | minified, into `<style id="dokufix-doc-css">` |
| `src/app.css` | the editor's styles | minified, into the `<style>` after it |
| `src/app.js` with `src/app/` | the script: the entry and the modules it imports | bundled into one IIFE and minified |
| `src/demo.md` | the demo text, plain Markdown | written as `{"text": …}` into `#dokufix-demo` |

The page names each of the other four once, as a slot: `{{slot:doc.css}}`, `{{slot:app.css}}`, `{{slot:app.js}}`, `{{slot:demo.md}}`.

- **The built file is committed.** Two builds of the same sources are byte-identical, so `git status` stays clean after `npm run build` unless a source changed. Change a source, build, commit both. Never edit `dist/dokufix.html` by hand; the next build overwrites it.
- **`node build.mjs --check`** builds in memory, writes nothing, and exits 1 with "is stale" when `dist/dokufix.html` is not what the sources give.
- **The build exits 1 and writes nothing** when a source is missing, when a slot is missing from the page, stands there twice or is not one of the four, when the minified script contains `</script` or `<!--` or a minified stylesheet `</style`, and when the modules do not fit together: one imports a name the other does not export, or a file that is not there, or assigns to a name it imported. The message names the module, line and name.
- **`node build.mjs --dev`** writes a second file, `dist/dokufix.dev.html`: the same page with script and styles not minified, and with a source map at the end of the script, as a `data:` URL, so it is still one file. It is for reading and debugging: the browser's debugger shows the modules under `src/app/` by name. The file is in `.gitignore`. `--dev` refuses to write `dist/dokufix.html`, `--check` does not look at the readable file, and the two options do not go together. **`npm run watch`** is `node build.mjs --dev --watch`: it builds the readable file and builds it again whenever a file under `src/` changes; a build that fails prints why, leaves the last file, and the watch goes on.
- **Node.** `package.json` names what the tools need under `engines`: `^20.19.0 || ^22.13.0 || >=24`, the range of ESLint 10. The watch uses recursive `fs.watch`, the comparison run `zlib.crc32`; both are in that range.
- **`<!--` in the script is written as `\x3c!--`** after bundling; why is under *`</script>` escaping*.
- **esbuild 0.28.2**, through its API: `bundle`, `format: 'iife'`, `minify` and `charset: 'utf8'` for the script, `minify` and `charset: 'utf8'` for the two stylesheets. Without `charset: 'utf8'` esbuild writes every non-ASCII character as an escape.
- **The code in the file is minified**, in the built file and in every `Mit Editor` file saved from it. The readable code is here, under `src/`.
- **The script's names are not global any more.** Bundled into an IIFE, `render()` or `initDone` cannot be reached from outside. Nothing in the page needs that; a check that wants to know what the page is doing looks at the DOM (see *Comparison run*).
- **The libraries are not embedded.** `marked`, `marked-footnote` and Mermaid stay on the CDN at their pinned versions and stay free globals of the script (see *Libraries*).
- **The script is written as ES modules** and still arrives as one script. See *The script's modules*.

**What the build did to documents** (2026-10-02, `tests/vergleich.mjs`, PoC against built file, reference document and demo text, Chromium 153 and Firefox 153, light and dark, 1400 and 1600 px, at rest and with every state switched on): all 136 screenshots are pixel-identical, and all assertions are green in both. The same run on the PoC gives the screenshots the PoC's own harness gave before (`poc/tests/out/03-nach-review`, all 136 identical, byte counts equal), so the successor sees what its predecessor saw. Sizes are under *Download variants*.

### The script's modules

Until story 2.14 the script was one file of 2111 lines in which every function and every variable was visible to every other. It became `src/app.js` and nineteen modules under `src/app/`, cut along the sections the one file had; story 2.15 added five and renamed one, and stories 2.2, 2.18 and 2.3 added one each, so there are twenty-seven. esbuild bundles them into the one script of the built file, as before. The split moved code and rewrote none: every line of the old file stands in a module, apart from the three things described below (how shared state is reached, what runs at load, three comments that said "above" or "at the bottom").

| Module | What it owns |
|---|---|
| `app.js` | the entry: the library setup (`mermaid.initialize`, `marked.use`), the call of every `register…()` in a fixed order, the async init |
| `app/state.js` | `state`, the values that more than one module assigns to |
| `app/dom.js` | the elements more than one module works on: `sourceEl`, `previewEl`, `btnEl`, `resetEl` |
| `app/gzip.js` | `gzipB64()`, `ungzipB64()` |
| `app/idb.js` | the IndexedDB layer (`openDB()`, `idbGetDoc()` and the others) and the storage-error banner |
| `app/assets.js` | images: the pipeline from a file to a stored asset, resolving `#asset-` references in the rendered HTML, inlining them for the exports, baking and seeding them for `Mit Editor`; and the three ways an image comes in (paste, drop, `+ Bild`) |
| `app/document.js` | reading a data block (`readTextBlock()`), the document's identity (`generateDocUuid()`, `fallbackUuidFromLocation()`) |
| `app/persistence.js` | loading and persisting the document record, the migration from localStorage, versions and the history dialog, the dirty state |
| `app/html.js` | `escapeHtml()` |
| `app/warning.js` | `buildWarning()`, the warning a reader sees where something could not be rendered |
| `app/passes.js` | `runPasses()`, the runner of a list of passes, each in its own containment |
| `app/transient.js` | the attribute `data-dokufix-transient` and `removeTransient()` |
| `app/frontmatter.js` | the YAML subset, `splitFrontmatter()`, the metadata panel as a pass, `deriveDocTitle()` |
| `app/callouts.js` | callouts as a pass: recognising the alert marker of a blockquote, the callout element with its label; the class by which `toc.js` leaves out headings inside one |
| `app/chips.js` | status chips as a pass: what counts as a status (`readChip()`), the chip element with its word for assistive technology; the class by which `toc.js` leaves that word out of a heading's label |
| `app/licences.js` | the licence information: the list of notices (`NOTICES`), the licence texts (`LICENCE_TEXTS`), and `licencesHtml()`, the link with its view as markup |
| `app/render.js` | `render()`: parse, the two pass lists (`DOCUMENT_PASSES`, `RUNTIME_PASSES`), the rail; one render at a time; the Mermaid pass |
| `app/toc.js` | `documentHeadings()`, heading ids and the inline `[[toc]]` as passes, `headingLabelText()`, the label of a heading for its entries and its anchor, `tocLinkHandler()` and the run-time pass that attaches it |
| `app/footnotes.js` | footnote previews and return paths as passes; also `buildStaticRailHtml()`, which stood in that section of the one file |
| `app/rail.js` | the scrollspy rail |
| `app/editor.js` | the toolbar: render button and typing, "Demo zurücksetzen", heading numbering, hamburger, the switch between view and editor; the link "license information", put into the toolbar and into the page of read mode |
| `app/downloads/menu.js` | the download menu: it opens, closes and starts the download that was chosen |
| `app/downloads/download.js` | what every download needs: `safeFilenameBase()`, `triggerDownload()`, the in-flight gate |
| `app/downloads/with-editor.js` | `Mit Editor` |
| `app/downloads/export-body.js` | what the three read-only exports share: `buildExportBody()` with the export steps, the export frame, `readonlyCss()`, the footer |
| `app/downloads/readonly-open.js`, `readonly-slim.js`, `readonly-compact.js` | one read-only export each: its template, and what only it does to the copy |

**Five rules.**

- *A module imports what it uses and exports what others need.* Nothing is shared as a global, and no `window.` or `globalThis.` property passes a value from one module to another. Imports are named (`import { render } from './render.js'`), never `import * as`; the lint fails on one, see *Lint*.
- *Shared state is one object.* An imported name cannot be assigned to. So a value belongs in `state` when a module other than the one it belongs to assigns to it. That is true of nine: `docUuid`, `currentVersion`, `versionHistory`, `commitBaseline`, `storedSource` and `cleanBaseline`, which the async init in `src/app.js` sets and, all but `storedSource`, `Mit Editor` as well; and `demoText`, `demoGz` and `initDone`, which only the async init sets, for the modules that read them. They are the properties of `state` in `app/state.js`; a module imports `state` and reads and writes `state.currentVersion`, which a search finds. A value that only its own module assigns to stays a `let` there (`_dbPromise`, `saveTimer`, `persistFailedFlag`, `mermaidId`, the rail's two handlers, `downloadInFlight`). Such a `let` may be exported: `Mit Editor` imports `saveTimer` and reads its current value, and could not assign to it.
- *A module does nothing when it is loaded.* Its top level holds functions, constants and element lookups. What acts at load stands in `src/app.js`: the library setup and the async init are written there, and every listener and the restoring of the numbering preference is a `register…()` function of its module, which `src/app.js` calls in the order the statements had in the one file: `registerAssetUrlCleanup()`, `registerVersionDialog()`, `registerRailClicks()`, `registerEditorInput()`, `registerImageInput()`, `registerReset()`, `registerDownloadMenu()`, `registerNumbering()`, `registerHamburger()`, `registerViewToggle()`; and behind them the two that came later, `registerStorageBanner()` and `registerLicences()`. Without that the order would follow from who imports whom, and change whenever an import is added; two listeners on `document` for the same event (the download menu and the hamburger on `click`, the menu and the view mode on `Escape`) would swap silently. One thing did move: the element lookups of the modules now run before the library setup, because a module's top level runs before the entry's. They only read the page.
- *Modules may import each other in a circle,* as long as it is for functions that are called later. One circle is left: `render()` calls the asset pipeline, and the image input calls `render()`. That works because of the rule before: no module reads another's export while it loads. Until story 2.15 there were two larger ones. `escapeHtml()` stood in `render.js`, and six modules imported it from there; it is in `html.js` now. And the download helpers stood in the menu, which imports the downloads; they are in `downloads/download.js` now.
- *A module of pure logic loads without a page.* It imports no module that looks up an element when it is loaded (`dom.js`, `rail.js`, `persistence.js`, `editor.js`, the downloads), and nothing at its top level touches the page. What a test is to reach works on what it is handed: a pass gets its root and makes elements with `root.ownerDocument`. A function in such a module that only ever runs from a listener may use the page's globals, and says so in its comment: `tocLinkHandler()` in `toc.js` uses `document` and `history`. Today these are `html.js`, `warning.js`, `passes.js`, `transient.js`, `frontmatter.js`, `toc.js`, `callouts.js`, `chips.js` and `licences.js`. A test imports such a module in Node as it is (`tests/frontmatter.test.mjs`, `tests/passes.test.mjs`, `tests/callouts.test.mjs`, `tests/chips.test.mjs`, `tests/licences.test.mjs`); where it needs a DOM it takes `linkedom`. So logic that a test should reach is written into such a module. What needs layout, Mermaid or storage stays in the browser runs.

**Where a new component goes.** Into a module of its own under `src/app/`. It exports its pass, a function of `(root, context)` that works on the rendered document as `attachFootnotePreviews()` does, and `render.js` gets one line: the pass in `DOCUMENT_PASSES`, with a German name, at its place in the order (see *Render passes*). Every export copies the preview, so the component reaches all four downloads from there. Its styles go into `src/doc.css` (see *Document styles*). What it needs only in a running page, a listener or a control, is a second function in `RUNTIME_PASSES`; an element that function adds carries `data-dokufix-transient`. What it has to change when a document leaves the page is a step in `EXPORT_STEPS`. Where its logic can be written without a page, it is, and gets a test in Node. `app/callouts.js` is the first component built this way, `app/chips.js` the second. If the component brings a library or other work of somebody else into the file, it adds an entry to the list in `app/licences.js` (see *Licence information*). A listener that is attached once for the whole page is still a `register…()` that `src/app.js` calls, after the ones that are there. If it shares a value with another module that both assign to, the value becomes a property of `state`.

**What the split did to documents** (2026-10-02, `tests/vergleich.mjs`, the built file before the split against the one after, reference document and demo text, Chromium 153 and Firefox 153): all 136 screenshots are pixel-identical, all assertions are green, and the three read-only exports are byte-identical in both browsers for both documents. One thing about the run itself showed here: in Chromium the exports of the reference document come out in one of two forms from run to run, for the file before the split as for the one after. The run types the document and clicks `Mit Editor` about 250 ms later, which is the delay of the editor's debounced save; whether that save runs first decides how often the clock is read, and Mermaid takes its diagram ids from the clock (`mermaid-…016` or `mermaid-…018`). Nothing else differs, and runs that fell the same way are byte-identical, old file against new. The file itself and every `Mit Editor` file grew by 972 B (67 959 → 68 931 B): `state.currentVersion` cannot be shortened by the minifier the way a variable can, and ten functions were added. `tests/speichern.mjs` is green in both browsers.

**What story 2.15 did to documents** (2026-10-02, `tests/vergleich.mjs`, the built file before the story against the one after, reference document and demo text, Chromium 153 and Firefox 153): all 136 screenshots are pixel-identical, and all assertions are green. The three read-only exports are the text they were, in both browsers and for both documents, apart from two things: the ids Mermaid generates, because diagrams are drawn one at a time now, and 408 B in the stylesheet, which are the rules of the warning. With the ids masked, the payload of `kompakt` and the diagrams of `schlank` unpacked, each export equals its counterpart outside its `<style>`, and the new stylesheet is the old one with those 408 B put in. The file itself grew by 2 800 B (68 931 → 71 731 B). A `Mit Editor` file grew by 2 537 B, which is 263 B less: it no longer carries Mermaid's tooltip element. `tests/speichern.mjs` and `tests/durchlaeufe.mjs` are green in both browsers.

## Checks

Six tools, all run from the repository root: five in `tests/`, and ESLint with `eslint.config.mjs`. They look at the sources and at the built file from outside; the product contains no hook for any of them.

| Command | What it answers | Needs |
|---|---|---|
| `npm run check` | Is `dist/` what the sources give, does every document style sit in `doc.css`, and does every module declare or import each name it uses? | Node, `npm install` |
| `npm test` | Do the build, the style check and the lint fail where they have to, do the frontmatter parser, the pass runner, the callouts and the status chips do what they say, and is the list of licence notices complete and at the versions the file uses? | Node, `npm install` |
| `node tests/vergleich.mjs …` | Does a document still look the same in all four variants? | `npm install`, Chromium, Firefox, the CDN |
| `node tests/speichern.mjs` | Does a saved file hold its document, and a file saved from it, and is it the built file otherwise? | `npm install`, Chromium, Firefox, the CDN |
| `node tests/durchlaeufe.mjs` | Does a failure end as a warning in the document and in every export, do two renders run one after the other, does a transient element stay out of a saved file? | `npm install`, Chromium, Firefox, the CDN |

### Style check (`tests/check-doc-styles.mjs`)

`node tests/check-doc-styles.mjs` — fails when a style for document content sits anywhere but in `src/doc.css`. Described under *Document styles (one source)*. It reads the sources and the built file as text and needs neither a browser nor `npm install`. `npm run check` runs `node build.mjs --check` first, so a stale `dist/` is reported before the styles are looked at.

### Lint (`eslint src`)

`npx eslint src`, the third step of `npm run check`: ESLint 10.11.0 with four rules over every `.js` under `src/`. It is there for what esbuild does not see. Bundling, esbuild takes a name that a module neither declares nor imports for a global and says nothing, and the page fails when that line runs, which for a download or an error path may be never in a test.

| A module … | The build | The lint |
|---|---|---|
| uses a name it neither declares nor imports | passes | fails: `no-undef` |
| imports a name the other module does not export, and uses it | fails | passes |
| imports a file that does not exist | fails | passes |
| assigns to a name it imported | fails | fails: `no-import-assign` |
| imports a name and does not use it, exported or not | passes, the import is dropped unread | fails: `dokufix/no-unused-imports` |
| imports another as a namespace (`import * as x`) and reads `x.name`, which that module does not export | passes with a warning; `x.name` is `undefined` when the line runs | fails on the `import * as` itself: `no-restricted-syntax` |

- **Globals.** A name counts as declared when it is one of the browser's (the list of the `globals` package, 17.13.0) or one of `marked`, `markedFootnote`, `mermaid`, which the page loads from the CDN.
- **`dokufix/no-unused-imports`** is written in `eslint.config.mjs`, a dozen lines on ESLint's own scope analysis. ESLint's `no-unused-vars` has no option that limits it to imports; it would also report a function nobody calls and a local nobody reads, and those are not this check's business.
- **`import * as` is refused as a form,** used or not, by `no-restricted-syntax` on `ImportNamespaceSpecifier`. Neither tool can tell which member of a namespace exists, so the modules import by name, where both can.
- **One thing it cannot see.** A missing import of a name that is also a browser global (`name`, `status`, `open`, `history`) passes `no-undef`; none of the script's top-level names is one (checked 2026-10-02), and a new one should not be.

### Tests (`npm test`)

`node --test tests/*.test.mjs`, 219 cases. The cases about the build, the style check and the lint work on a copy of `src/` in a temporary folder; the sources and `dist/` are never written to. The cases about the product's logic import its modules as they are (see *The script's modules*, the rule for modules of pure logic).

- `tests/check-doc-styles.test.mjs` proves the style check: it breaks a copy once per case (a `#preview h5` or `.dokufix-x` rule in `app.css` or the export frame, `.reader-body h5` in the export frame, each named with the module the frame stands in, `.footnotes li` in `app.css`, `body.mode-view .dokufix-doc h5` in `doc.css`, a rule of the link "license information" that is not listed: `.dokufix-licences-x` and `.dokufix-licences[open] summary` in `app.css`, `.dokufix-licences h5` in the export frame, and `.dokufix-licences .dokufix-callout`, which names a document construct, an export without `readonlyCss()`, the block's element missing or doubled in the page, a document rule in a `<style>` of the page or in the block's element, a built file without the block, with an empty one, with two) and expects exit 1 with file, line and culprit named.
- `tests/build.test.mjs` proves the build: unchanged sources give the committed file byte for byte; `--check` fails with "is stale" when any of the five sources or a module under `src/app/` changed; a module that imports a name another does not export, or a file that is not there, or assigns to an import ends the build with module and name and nothing written; a slot missing, doubled or unknown ends the build with the slot named and nothing written; so do a missing source and `</style` in a minified stylesheet; a script with `<!--` in a string, a template and a regular expression is built without it and gives the same values; the build runs when started through a symlink; a demo text containing `</script>`, `<!--` and `$&` leaves its block and everything behind it intact. One case cannot be reached through the sources: esbuild escapes every `</script` it meets, so the refusal of a script containing it is shown on the step that assembles the page, and so is the refusal of a script that still contains `<!--`. For the readable build: `--dev` writes a file that is the committed page outside its script and its styles, not minified, with a source map that names the modules; it never writes the committed file; `--dev --watch` builds again when a source changes and goes on after a build that failed.
- `tests/frontmatter.test.mjs` runs the frontmatter parser in Node: what is read (pairs, nested maps, sequences, quoting, comments, JSON), what is not frontmatter and stays untouched (a thematic break, one prose line, a block that is never closed), what is shown raw with its reason, the five inputs of *Frontmatter* among them, and `deriveDocTitle()`.
- `tests/passes.test.mjs` runs the pass runner in Node over a fragment that `linkedom` 0.18.13 parses: the order of the list, a pass that returns a promise, a pass that throws or whose promise is rejected (the others run, one warning each at the top in the order of the list, the error on the console, the runner does not reject), the markup of the warning, `removeTransient()`, and real passes driven by the runner: metadata panel, heading ids, inline table of contents; and with the callout pass in front, which headings count: one inside a callout gets no id and no entry, at any depth, one in an ordinary blockquote does. And with the chip pass between the two: a heading with a chip has the entry and the anchor of its text with the chip's label, for each of the five colours; a heading that is only a chip has both, never empty; the anchors are the ones the same headings have without the chip pass, also where the status touches the text before it (`Bestellung:`, `Stand` or a slash directly before the code span), and those of other headings do not move; with the passes in the wrong order the entry carries the dot.
- `tests/callouts.test.mjs` runs the callout pass in Node over markup as `marked` 18.0.14 emits it; `marked` comes from the CDN and is not installed, so each case carries the measured markup with its Markdown beside it. The table of *Callouts* line by line: the five types with class, label and role, the marker in any case, a list, a paragraph, a code block or a hard break behind the marker, the marker alone, a callout in a quote, in a list item and in another callout; eleven inputs that stay as they are, byte for byte; the masked marker as the known limit. And the symbols: each type has a `data:` URI in `src/doc.css` that is an escaped SVG of 16 px with one path in the colour of its edge and label, and the built file carries each URI unchanged.
- `tests/chips.test.mjs` runs the chip pass in Node over markup as `marked` 18.0.14 emits it, measured like that of the callouts. The table of *Status chips* line by line: the five colours with class, word and label, the dot gone; the variation selector; blanks around the label; a label with `<` and `&`; a chip in running text, a table cell, a heading, a link, bold, emphasised and struck text, a list item, a quotation and a callout; fifteen inputs that stay as they are, among them the dot at the end, no label, no blank, a blank before the dot, a tab, a no-break space, another dot, code blocks, a `<code>` that holds markup; the same label in two colours; the false positive as the known limit. That `render.js` lists the pass after `Hinweise` and before `Überschriften`, and that no other module under `src/` uses a colour dot outside a comment. And the look: each colour has a rule with a text colour on a tint at a contrast of at least 4.5 : 1, a mark whose shape no other colour has, drawn with no image and no character; tint and mark are kept in print; the word is hidden from the eye and not from a screen reader; the built file carries the rules.
- `tests/licences.test.mjs` runs the licence information in Node: the list has its four entries, each complete, with the copyright lines their projects publish; every version is the one the sources pin, which are the jsDelivr npm URLs in `src/index.html`, in whatever tag and attribute, and the Octicons version in the comment of `src/doc.css`; a version raised in the sources alone, a library the page loads without an entry, as a script or as a stylesheet, a URL without a version and an entry the sources do not know are each reported with the entry's name; a library from another host or one the script itself would load is not seen; every licence an entry names has its text, and the MIT text is the permission notice in its wording, checked by its hash; the markup is one closed `<details>` with the link as its summary, no `<script>`, no style and no handler, names every entry and each licence text once, and escapes its text, shown on a list that carries markup; the built file holds every copyright line.
- `tests/lint.test.mjs` proves the lint: a module that lost an import, one that uses a name of the shared state without `state.`, one that uses a name nobody declares, one that assigns to an import, one that imports what it does not use and one that imports a namespace each give exit 1 with module, line and name; a function nobody calls and a local nobody reads pass.

### Comparison run (`tests/vergleich.mjs`)

Builds all four download variants from one document in one run, reopens each the way a recipient would, and records what they look like and how big they are. It is the tool for any change that must not alter the look of a document.

```
node tests/vergleich.mjs --out tests/out/vorher                              # before the change
node tests/vergleich.mjs --out tests/out/nachher --compare tests/out/vorher  # after it
```

- **File under test.** `dist/dokufix.html`; `--file <file>` (alias `--poc`) takes any other dokufix editor file. The built file against the PoC:

  ```
  node tests/vergleich.mjs --file poc/dokufix-poc.html --demo --out tests/out/00-poc-demo
  node tests/vergleich.mjs --demo --out tests/out/01-dist-demo --compare tests/out/00-poc-demo
  ```

  The first exits 1, on the checks of the licence information, which the PoC does not have; its screenshots and sizes are written all the same. The second exits 0 and lists every screenshot as differing: since the footnotes heading reads "Fußnoten", the built file no longer looks like the PoC. So this pair is run without `--strict`, which would make the second exit 1 too, and with the demo text: with the reference document the PoC run fails on the checks of callouts and status chips as well, because the PoC has neither. `--strict` is for the file before a change against the file after it.
- **Document.** `tests/referenz.md`, an invented text that contains every construct dokufix styles: frontmatter, a footnote cited three times, `[[toc]]`, headings down to h4, table, code, blockquote, the five callouts, one of them with a list and one with a heading inside, status chips in the five colours, in running text, a table, a list, a link, bold text, a callout, a footnote and two headings, beside code spans that stay code, lists, an image as `data:` URI, a missing `#asset-` reference and two Mermaid diagrams. `--demo` builds from the built-in demo text instead, `--doc <file>` from any other Markdown file.
- **Screenshots.** Each variant in light and dark at 1400 and 1600 px, once at rest and once with every state switched on (`-zustand`: heading numbering, open metadata panel, a revealed footnote preview, landing highlight with its marked arrow), plus the preview pane inside the editor. `--compare` reports the differing pixels per image and writes a red-on-white mask of them to `<browser>/diff/`. Two runs of the same file are pixel-identical in Chromium and in Firefox, so every reported pixel is a real difference.
- **Sizes.** `sizes.json` per browser, with the library versions the CDN actually served. `--compare` prints the delta per variant. Two runs of the same file give the same byte counts.
- **Assertions.** In every variant: metadata panel, footnote preview on focus, landing highlight and marked return arrow, heading numbering, rail at 1600 px and not at 1400 px; callouts, status chips and the licence information (below); `nur-lesen` contains no `<script>`; no read-only export carries a rule of the editor interface. A failed assertion exits 1. Differing pixels do not, unless `--strict` is given, because some differences are decided ones. An image that only the run or only the baseline has counts as differing. A `--compare` folder without a run for the browser, or one that is the `--out` folder itself, stops the run with exit 1 before anything is built or deleted.
- **Callouts.** The run reads from the Markdown how many callouts of which type the document has and which headings stand inside one, as far as the reference document needs it: a quote that starts at the beginning of its line and opens with a marker, and the `#` headings in it. It does not read a callout in a list item or in a nested quote, nor a masked marker, which the product turns into a callout; a document given with `--doc` that has one of these fails the count although the build is right. The run expects in every variant: one callout per alert blockquote, in order, and no blockquote left that opens with a marker; each labelled with the word of its type, visible, as its first line; an edge on the left only, edge and label in the colour of the type; a symbol that the browser loads as a picture of 16 × 16 px, one per type; the heading inside a callout without an id and in neither table of contents nor rail; a `[!WARNING]` callout and the product's warning, which the run puts beside it for the measurement, apart in more than colour. The checks of the numbering run when a callout holds a heading of level 2 to 4, the levels that are numbered. For the numbering a browser does not say which number a counter shows. So the page is photographed three times with numbering on: as it is, with the heading inside the callout forced out of the count by a style, and with it forced in. As it is, the page has to equal the first and differ from the second. A document without callouts is checked for having none. A file that predates callouts, the PoC among them, fails these checks on the reference document; its screenshots and sizes are written all the same.
- **Status chips.** Which code span of the Markdown is a status, with which colour and label, the run asks `readChip()` of `src/app/chips.js`, and which anchor a label gives `slugify()` of `src/app/toc.js`: the run does not say a second time what a status is. It reads the Markdown as far as the reference document needs it: a code span on one line, outside fenced code, and a heading written with `#` whose only inline markup is code spans. It does not read an indented code block, a code span across two lines or a `<code>` written as HTML; a document given with `--doc` that has one of these fails the count although the build is right. The run expects in every variant: one chip per status code span, in the order of the document, with the colour of its dot and its label, and no inline code left that is a status; the chips of the footnotes among the footnotes, and as many in each footnote's preview as in its definition; every chip visible and styled, a pill in small capitals of the monospace stack with label and mark in the colour of its class on its tint, the mark drawn without an image; in every chip the name of its colour as text, before the label, rendered, at most one pixel large and clipped, and the accessible text of a chip, as Playwright reads it from the page, the word and the label; two chips with the same label and different colours with different words; the word placed against its chip (the chip positioned, the word's offset parent the chip); a chip in a link underlined, and no other, as many as the Markdown has links whose text is a status. In `Mit Editor`, in edit mode, the preview is scrolled to its end and the page itself must not be scrollable. That is measured with the footnote previews taken out of the page: they are placed against the page themselves, and with them the editor's page can be scrolled, in both browsers and on the built file before status chips; the run prints that as a note and does not fail on it. It predates status chips and is not fixed by them. For the marks it puts a copy of the first chip of each colour into the page, all with the label "x" and all in black on white, each at a whole pixel of its own, and photographs them: two copies of the same chip have to be the same picture, and every two colours have to differ in at least eight pixels. The copies and the style are removed again; the pictures stay beside the exports as `marken-<variant>-<colour>.png`. For a heading with a chip: its entry in the table of contents and in the rail reads the heading's text with the chip's label, its anchor is the one of that text, and the heading itself still holds the word. No entry of the table of contents or the rail is empty. A document without chips is checked for having none. A file that predates chips fails these checks on the reference document, as one that predates callouts fails theirs.
- **Licence information.** What the view has to name the run takes from the list itself, `NOTICES` and `LICENCE_TEXTS` in `src/app/licences.js`; that the list is right is the business of `tests/licences.test.mjs`. The run expects in every variant: the link visible, reading "license information", in the empty top margin above the first line, inside the window, its right edge on the right edge of the text column and so never above the rail, at 1400 and 1600 px where the screenshots are taken and at thirteen widths from 320 to 1900 px on one page that is resized; the document standing where it stands with the element taken out of the page, with the view closed and with it open; a click on the link opening the view, which names the four entries with version, licence and copyright lines and the licence text, lies on top of the page and is inside the window, at 1400 and at 600 px; a second click closing it. A read-only export carries the element once in its text, directly after `<body>` and closed, and is opened once more with scripts switched off, where the link has to open and close as well. In `Mit Editor` the element is there twice, each marked transient; the link never overlaps "Editor ↩" and stands left of it up to 820 px; in edit mode it stands in the toolbar, its view hangs below the toolbar and moves nothing; at 600 px it is in the hamburger panel and nowhere else, and its view opens inside the panel; with the download menu open as well the panel stays inside the window, and every action in it can be brought between the window's upper and lower edge by scrolling the panel alone. The right edge of an action is not judged there: in the panel the download menu stands beside its button and runs past the window's right edge, as it did before story 2.18. A file that predates the licence information fails these checks, as one that predates callouts fails theirs.
- **Browsers.** Chromium from `/usr/bin/chromium` and Firefox from the Playwright cache (`--browser chromium|firefox|all`; `CHROMIUM` and `FIREFOX` override the paths). WebKit is not run.

Four things the run does on purpose, each because the obvious way gave wrong results or none:

- **It waits on the DOM, not on names of the script.** The PoC's harness read `initDone`, called `render()` and read `downloadInFlight`. A bundle has no such names. Instead: init is done when `#dokufix-rail` has the class `has-items`, because the rail is the last thing the first render builds. A render is finished when a marker element the run put into the rail before pressing "Rendern" is gone, because every render ends by rewriting the rail. A download is through when no `button[data-download]` is disabled. All three hold for the PoC as well, which is how the two can be compared by one run.
- **`Date` and `Math.random` are deterministic stand-ins.** The read-only exports print their export time, Mermaid derives its SVG ids from `Date.now()`, and Mermaid 12 draws node outlines with randomised control points. The clock still ticks, one millisecond per reading: with a frozen `Date.now()` both diagrams of a document get the same id and Mermaid draws the second into the first.
- **The footnote preview is revealed by focus, not by hover.** Hover under Playwright's synthetic mouse is what produced the retracted Firefox numbers (see *Footnotes*).
- **Known deviation in the Playwright Firefox build.** Once a page has been open for about a second, focusing a marker no longer reveals its preview: the host matches `:focus-within`, the rule on its child does not take effect. With `position-try-fallbacks` switched off on the preview it appears. This was measured on the file before any change of story 2.1 and has not been checked by hand in a real Firefox. Where it happens the run switches the fallbacks off with a style tag and prints a note instead of failing.

### Save round trip (`tests/speichern.mjs`)

`node tests/speichern.mjs` — the check for the one thing no screenshot shows: that a saved file carries its document. Per browser, each opening in a browser context of its own, so with fresh storage:

1. open `dist/dokufix.html`: the editor holds `src/demo.md`; type document A, save as `Mit Editor`;
2. open that file: the editor holds A, version `v1`, not marked as changed; type document B, save;
3. open that file: the editor holds B, version `v2`; "Demo zurücksetzen" gives the original demo text;
4. build a copy of `src/` whose demo text contains `</script>`, `<!--` and `<script>`, open it: the editor holds that text unchanged.

Every save types a version description that contains `<!-- <script>` and `</script>`; the second save is made with heading numbering switched on, and the second generation has to open numbered. The run also reads both saved files as text: `#dokufix-history` parses and holds that description as typed, `#dokufix-source` and `#dokufix-demo` hold `{"gz": …}` that unpack to the document and to the demo text, and the script is the script of the file under test, byte for byte. A and B contain what could break a block or a replacement: `</script>`, `<!--`, backticks, `${…}`, `$&`, backslashes, quotes, non-ASCII. The saved files stay in `tests/out/speichern/`. Exit 1 when anything fails. Controls: with the line that writes `#dokufix-source` taken out of the save, the run fails in both generations; with `encodeJsonForScript()` escaping only `</script>`, as it did in the PoC, the run ends with a timeout while opening the second generation (Chromium).

**The saved file as a whole.** A save clones the running page, so whatever the page gained while it ran can end up in the file. The run compares each saved file with the built file. A saved file is the browser's serialisation of the clone, so its text is not the built file's even when nothing leaked: `hidden` becomes `hidden=""`, and the line breaks around `<html>` and `</body>` move. So both files are opened with scripts switched off and read back from the DOM, which gives two texts in the same form. They must be equal apart from five differences, which the run lists with their reasons (`ALLOWED`): the content of the data blocks, the version mark, heading numbering, which is the class `numbered` on `<body>` and the state of its button, and where `hidden` stands among the attributes of the storage banner, because a banner that was shown lost the attribute and the save puts it back behind the others; that it is there is compared. Three more saves visit states that leave marks on the page's own elements, and each is compared the same way: a narrow window saved with the hamburger panel open, a page without IndexedDB, which the run takes away with an init script before the page's script runs, and a page whose licence view is open, in read mode and in the toolbar. That last file has no licence element; opened, it makes both again, closed. Anything else fails the run, which prints the place and both texts. A difference that is not on the list is a leftover; the place to remove it is the clean-up of the clone in `with-editor.js`, not the list. Controls: with the line that resets the badge's text taken out of the save, or the one that removes Mermaid's tooltip element, the comparison fails in both generations and shows the text or the element; with the clean-up as it was before the two states were visited, it fails in both of them; and in every run a copy of the first generation with one element more has to be reported as different.

### Failure cases (`tests/durchlaeufe.mjs`)

`node tests/durchlaeufe.mjs` — the check for what a render and an export do when something fails. The comparison run shows that a valid document looks as it did; it says nothing about one that is not valid. Per browser, six cases:

1. *A diagram with an error.* One Mermaid block with a syntax error between two valid ones: that block is a warning with Mermaid's message, the other two are drawn, there is no error picture, and nothing of Mermaid's is left outside the preview. Then all four downloads, reopened: the warning is in each, styled.
2. *Overlapping renders.* A second render is requested while the first is in its passes. Each rail is built from the document the preview shows at that moment, and the preview ends as the second one's.
3. *A transient element.* Elements marked `data-dokufix-transient` in `<head>`, in `<body>` and inside the interface: none is in the saved `Mit Editor` file. An element that is not marked is. The two elements of the link "license information" are transient elements of the page itself; their views are open while the files are written. The saved file has neither, and each of the three read-only exports carries the element it writes itself: once, directly after `<body>`, closed.
4. *Markdown cannot be parsed.* `marked` is given a hook that throws: the warning is all the preview holds, and the rail is rebuilt and empty. The three read-only exports carry the warning.
5. *A pass throws.* A copy of `src/` is built with two passes more, as the save round trip builds a copy with another demo text; the product has no switch for this. A document pass that throws stands in the middle of the list: one warning names it at the top, every other pass did its work, the rail is built, and the three read-only exports carry the warning. A run-time pass adds a transient element and then throws: its warning and its element are in the page and in no export.
6. *An export step throws.* A second copy is built with one export step more. Each of the three read-only downloads ends in a dialog that says the download failed, with the step's message; no file is handed over, and the download buttons are enabled again.

In every case the error is on the console and no promise is rejected. The run waits on the DOM as the comparison run does; `marked` is the library's global and not a name of the script, which is why case 4 can reach it from outside. Exports and saved files stay in `tests/out/durchlaeufe/`. Exit 1 when anything fails. Control: run on the built file as it was before story 2.15 (`--file`), cases 1 to 4 fail. The error picture is in the preview and in all four downloads; the first render builds its rail while the preview already shows the second document; the marked elements are in the saved file; and case 4 ends with a timeout, because that render never rebuilt the rail.

## Known PoC limitations (deferred to MVP)

- **CDN-loaded libraries** — pinned to fixed versions (see *Libraries*), but still loaded from the network. Production target is single-file inline. That turns the editor variant from about 70 KB into several megabytes: `mermaid.min.js` 12.0.0 alone is 5.6 MB before compression.
- **No File System Access API integration** — Chromium-only, optional power-user path. Not in PoC. See product brief distillate for design.
- **Mermaid SVG bloat unaddressed** — each SVG ships a redundant 1.5–3 KB `<style>` block. Future optimization: dedupe to a single document-level `<style>`.
- **Heading ID stability** — slugify is deterministic per heading text, but reordering or renaming headings shifts the `-N` dedupe suffix for other slugs. External bookmarks to `#einleitung-2` go stale when an earlier colliding heading is renamed. Tracked in `_bmad-output/initiative-dokufix/deferred-work.md`; a content-addressed slug (hash of text + position) would be the principled fix.
- **Per-version history grows linearly with snapshots** — full gzip snapshots per version dominate file size once a document accumulates many versions. A diff-based encoding (gzipped patch against prior version, ~10× smaller) is in the backlog for the MVP build pipeline.

## File layout

```
build.mjs               The build. One command, see "Build".
package.json            esbuild, eslint, globals, linkedom and playwright-core, pinned exactly; scripts build, watch, check, test, vergleich.
eslint.config.mjs       The lint: four rules over src/. See "Lint".
dist/
├── dokufix.html        The product. Built, committed, never edited by hand. Open in browser.
└── dokufix.dev.html    The readable build (node build.mjs --dev). Not in git.
src/
├── index.html          The page: head, markup, data blocks, CDN tags, one slot per other source.
├── doc.css             Document styles, the one source for everything that travels with a document.
├── app.css             Styles of the editor interface.
├── app.js              The script's entry: library setup, the register…() calls in order, the async init.
├── app/                The script's modules. See "The script's modules".
│   ├── state.js        The values more than one module assigns to.
│   ├── dom.js          The elements more than one module works on.
│   ├── gzip.js, idb.js, assets.js, document.js, persistence.js
│   ├── html.js, warning.js, passes.js, transient.js
│   ├── frontmatter.js, callouts.js, chips.js, licences.js, render.js, toc.js, footnotes.js, rail.js, editor.js
│   └── downloads/      menu.js, download.js, with-editor.js, export-body.js, readonly-open.js, readonly-slim.js, readonly-compact.js
├── demo.md             The demo text.
└── README.md           This file.
tests/                  Checks that look at sources and built file from outside. See "Checks".
├── check-doc-styles.mjs       Fails when a document style sits outside doc.css.
├── check-doc-styles.test.mjs  Breaks copies of src/ and expects the check to fail.
├── build.test.mjs      Breaks copies of src/ and expects the build to fail; same sources, same file; the readable build.
├── lint.test.mjs       Breaks copies of src/ and expects the lint to fail.
├── frontmatter.test.mjs  The frontmatter parser, in Node.
├── passes.test.mjs     The pass runner over a parsed fragment, in Node; which headings count; headings with a chip.
├── callouts.test.mjs   Callouts over markup as marked emits it, in Node; the symbols in the document styles.
├── chips.test.mjs      Status chips over markup as marked emits it, in Node; colours, contrast and marks in the document styles.
├── licences.test.mjs   The list of licence notices against the versions the sources pin, in Node; the markup of the link and its view.
├── vergleich.mjs       Comparison run: four variants, screenshots, sizes, assertions.
├── speichern.mjs       Save round trip: two generations of "Mit Editor", each compared with the built file; saves in a narrow window, without storage, with the licence view open.
├── durchlaeufe.mjs     Failure cases: a diagram with an error, a pass that throws, two renders at once, transient elements, the licence view open while files are written.
├── referenz.md         Neutral reference document, the one input of every comparison.
└── out/                Exports and screenshots of the runs. Not in git.
poc/                    The hand-written single file of story 2.1 with its README and checks. Frozen.
```

The product is a single file. Everything you see when you open it (HTML, CSS, JS, demo content, assets) lives inside `dist/dokufix.html`, and a file saved from it needs nothing from this repository. `src/`, `build.mjs` and `tests/` are how that file is made and checked, not part of it.

## Related artifacts

- Product brief: `../_bmad-output/initiative-dokufix/brief-dokufix/brief-dokufix.md`
- Distillate (technical decisions, open questions): `../_bmad-output/initiative-dokufix/distillate-dokufix/distillate-dokufix.md`
- One-pager pitches (DE/EN): `../_bmad-output/inbox/one-pager-dokufix-users*.md`
- Landing page: `../_bmad-output/inbox/landing-dokufix.html`
- Original brainstorming: `../_bmad-output/initiative-dokufix/brainstorm-session/brainstorm-session.md`
