# dokufix — Resume

**Phase:** Working PoC, extended story by story. Epic 1 (metadata header, footnote previews) is done; epic 2 (document components and BPMN diagrams) is under way, story 2.1 built on 2026-10-02. No PRD and no architecture document yet.

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
- `poc/dokufix-poc.html` — functional PoC. Default = view mode. Editor with Markdown+Mermaid, images, frontmatter panel, footnotes with previews, table of contents. IndexedDB persistence with in-file version history. Heading numbering toggle (CSS counters). Mobile hamburger. Four download variants (Mit Editor, Ohne Editor offen/schlank/kompakt). All compression uses native `CompressionStream('gzip')`.
- `poc/README.md` — architecture notes, known limitations, escaping gotchas, deferred-to-MVP list.
- `poc/tests/` — checks that look at the PoC from outside: `check-doc-styles.mjs` (fails when a document style sits outside its one source, no dependencies), its test, and `vergleich.mjs` (builds all four variants from `referenz.md`, screenshots them in Chromium and Firefox, compares against an earlier run). See `poc/README.md`, "Checks".

### Planning and tracking
- `_bmad-output/` is a ticket store in the BMad v7 layout and a git repository of its own; this repository ignores it. The paths in this file resolve on a checkout that has the store beside it.
- `_bmad-output/initiative-dokufix/` — the initiative with its requirements (FR1–FR25, NFR1–NFR11), both epics as ticket trees, the plan of every built story, and `deferred-work.md`.
- `docs/komponenten-aus-markdown.md` — analysis, measurements and decisions behind epic 2 (German).
- `spikes/komponenten-aus-markdown/` — the spike epic 2 is derived from; reference for behaviour, not code to merge.

## Key technical decisions captured

- **Compression: gzip** (not brotli — Chrome lacks `CompressionStream('brotli')` as of May 2026; revisit when caniuse goes green for Chrome).
- **DEMO vs SAMPLE separation** — DEMO is immutable original, SAMPLE is per-doc default. Reset always uses DEMO.
- **Auto-save: opt-in only** — explicit save is the default UX. Leaving edit mode does not save.
- **Self-replication via gzipped SAMPLE_GZ** — reproducible, small, preserves source for recipient editing.
- **Three read-only tiers** — offen (no JS), schlank (text plain + SVG gz), kompakt (everything gz).
- **Libraries pinned** — `marked` 18.0.14, `marked-footnote` 1.4.0, Mermaid 12.0.0 with `securityLevel: 'strict'`; still loaded from the CDN.
- **One source for document styles** — `<style id="dokufix-doc-css">`, used by the preview and embedded by the read-only exports; a check fails when a document rule sits anywhere else.

## Next

- Story 2.2 and the ten after it; `uv run _bmad/method/scripts/tickets.py next` lists what is ready.
- Open: whether the single source file becomes a build pipeline with inlined libraries, which the distillate names as the production target ("no CDN dependencies anywhere").
- Open from epic 1 and story 2.1, in `deferred-work.md`: Safari never opened, the screen-reader trade-off of the footnote return arrow, other Mermaid diagram types under `strict`.
