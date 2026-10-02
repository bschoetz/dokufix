# dokufix — Resume

**Phase:** Working PoC, extended story by story. Epic 1 (metadata header, footnote previews) is done; epic 2 (document components and BPMN diagrams) is under way, story 2.1 and the build pipeline (entry 13, "2.1-A") built on 2026-10-02. No PRD and no architecture document yet.

## Identity

Single self-contained HTML file = viewer + editor + artifact for technical documentation. Markdown-native, Mermaid built-in, IndexedDB workbench, explicit save (auto-save opt-in only), self-replicating, plain-MD escape hatch with user-chosen image strategy. Open-source side project on GitHub.

Frame: **"body for information"** — HTML is the current skin, can be shed (MD / future Confluence-Jira). Closest cousin = TiddlyWiki, but document-shaped not wiki-shaped.

## Artifacts

### Discovery
- `_bmad-output/initiative-dokufix/brainstorm-session/brainstorm-session.md` — Carson brainstorming, 24 ideas, MVP convergence.
- `_bmad-output/initiative-dokufix/brief-dokufix/brief-dokufix.md` — exec brief (status: complete).
- `_bmad-output/initiative-dokufix/distillate-dokufix/distillate-dokufix.md` — detail pack with technical decisions, open questions, decided constraints (e.g. gzip-over-brotli rationale, source-smuggling caveats).

### Marketing
- `_bmad-output/inbox/one-pager-dokufix-users.md` (EN, PSB framework)
- `_bmad-output/inbox/one-pager-dokufix-users-de.md` (DE, Wolf-Schneider style, separate take rather than translation)
- `_bmad-output/inbox/landing-dokufix.html` — flashy single-file DE landing page with Ah-nee-Aggrobat satirical popup, links to the PoC

### Working Prototype
- `dist/dokufix.html` — the functional prototype, one file, built and committed. Default = view mode. Editor with Markdown+Mermaid, images, frontmatter panel, footnotes with previews, table of contents. IndexedDB persistence with in-file version history. Heading numbering toggle (CSS counters). Mobile hamburger. Four download variants (Mit Editor, Ohne Editor offen/schlank/kompakt). All compression uses native `CompressionStream('gzip')`.
- `src/` — its sources: `index.html` (the page), `doc.css` (document styles), `app.css` (editor styles), `app.js` (the script, one file), `demo.md` (the demo text). `npm run build` (`build.mjs`, esbuild) puts them into `dist/dokufix.html`, script and styles minified.
- `src/README.md` — architecture notes, the build, the checks, known limitations, escaping gotchas, deferred-to-MVP list.
- `tests/` — checks that look at the sources and the built file from outside: `check-doc-styles.mjs` (fails when a document style sits outside `src/doc.css`, no dependencies), `build.test.mjs` and `check-doc-styles.test.mjs` (`npm test`), `vergleich.mjs` (builds all four variants from `referenz.md`, screenshots them in Chromium and Firefox, compares against an earlier run or against the PoC), `speichern.mjs` (a saved file and a file saved from it hold their document). See `src/README.md`, "Checks".
- `poc/` — the hand-written single file as story 2.1 left it, with its README and its checks. Frozen; the built file is compared against it.

### Planning and tracking
- `_bmad-output/` is a ticket store in the BMad v7 layout and a git repository of its own; this repository ignores it. The paths in this file resolve on a checkout that has the store beside it.
- `_bmad-output/initiative-dokufix/` — the initiative with its requirements (FR1–FR25, NFR1–NFR11), both epics as ticket trees, the plan of every built story, and `deferred-work.md`.
- `docs/komponenten-aus-markdown.md` — analysis, measurements and decisions behind epic 2 (German).
- `spikes/komponenten-aus-markdown/` — the spike epic 2 is derived from; reference for behaviour, not code to merge.

## Key technical decisions captured

- **Compression: gzip** (not brotli — Chrome lacks `CompressionStream('brotli')` as of May 2026; revisit when caniuse goes green for Chrome).
- **Demo text and the file's document are separate** — `#dokufix-demo` is the immutable original, `#dokufix-source` is the per-doc default; both are data blocks of the page. Reset always uses the demo text.
- **Auto-save: opt-in only** — explicit save is the default UX. Leaving edit mode does not save.
- **Self-replication through data blocks** — "Mit Editor" writes the gzipped source into `#dokufix-source` of the cloned page; reproducible, small, preserves source for recipient editing. No code searches or rewrites script text: the PoC did, and that broke as soon as the script was minified.
- **One built file from sources** — `src/` → `dist/dokufix.html` with esbuild 0.28.2, script bundled as one IIFE, script and styles minified, the built file committed, a second build byte-identical.
- **Three read-only tiers** — offen (no JS), schlank (text plain + SVG gz), kompakt (everything gz).
- **Libraries pinned** — `marked` 18.0.14, `marked-footnote` 1.4.0, Mermaid 12.0.0 with `securityLevel: 'strict'`; still loaded from the CDN.
- **One source for document styles** — `src/doc.css`, built into `<style id="dokufix-doc-css">`, used by the preview and embedded by the read-only exports; a check fails when a document rule sits anywhere else.

## Next

- Entry 14 ("2.1-B"): split `src/app.js` into ES modules, compared with the unchanged checks. Then story 2.2 and the ten after it; `uv run _bmad/method/scripts/tickets.py next` lists what is ready.
- Open: whether the libraries are inlined, which the distillate names as the production target ("no CDN dependencies anywhere"). The build exists; the libraries still come from the CDN.
- Open from epic 1 and story 2.1, in `deferred-work.md`: Safari never opened, the screen-reader trade-off of the footnote return arrow, other Mermaid diagram types under `strict`.
