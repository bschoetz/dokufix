# dokufix — Resume

**Phase:** Discovery complete + working PoC. Ready for MVP planning (PRD, architecture).

## Identity

Single self-contained HTML file = viewer + editor + artifact for technical documentation. Markdown-native, Mermaid built-in, IndexedDB workbench (PoC: localStorage), explicit save (auto-save opt-in only), self-replicating, plain-MD escape hatch with user-chosen image strategy. Open-source side project on GitHub.

Frame: **"body for information"** — HTML is the current skin, can be shed (MD / future Confluence-Jira). Closest cousin = TiddlyWiki, but document-shaped not wiki-shaped.

## Artifacts

### Discovery
- `_bmad-output/brainstorming/brainstorming-session-2026-04-30-2055.md` — Carson brainstorming, 24 ideas, MVP convergence.
- `_bmad-output/planning-artifacts/product-brief-dokufix.md` — exec brief (status: complete).
- `_bmad-output/planning-artifacts/product-brief-dokufix-distillate.md` — detail pack with technical decisions, open questions, decided constraints (e.g. gzip-over-brotli rationale, source-smuggling caveats).

### Marketing
- `_bmad-output/planning-artifacts/one-pager-dokufix-users.md` (EN, PSB framework)
- `_bmad-output/planning-artifacts/one-pager-dokufix-users-de.md` (DE, Wolf-Schneider style, separate take rather than translation)
- `_bmad-output/planning-artifacts/landing-dokufix.html` — flashy single-file DE landing page with Ah-nee-Aggrobat satirical popup, links to the PoC

### Working Prototype
- `poc/dokufix-poc.html` — functional PoC. Default = view mode. Editor with Markdown+Mermaid. localStorage persistence. Heading numbering toggle (CSS counters). Mobile hamburger. Four download variants (Mit Editor, Ohne Editor offen/schlank/kompakt). All compression uses native `CompressionStream('gzip')`.
- `poc/README.md` — architecture notes, known limitations, escaping gotchas, deferred-to-MVP list.

## Key technical decisions captured

- **Compression: gzip** (not brotli — Chrome lacks `CompressionStream('brotli')` as of May 2026; revisit when caniuse goes green for Chrome).
- **DEMO vs SAMPLE separation** — DEMO is immutable original, SAMPLE is per-doc default. Reset always uses DEMO.
- **Auto-save: opt-in only** — explicit save is the default UX. Leaving edit mode does not save.
- **Self-replication via gzipped SAMPLE_GZ** — reproducible, small, preserves source for recipient editing.
- **Three read-only tiers** — offen (no JS), schlank (text plain + SVG gz), kompakt (everything gz).

## Next

Likely candidates:
- `bmad-create-prd` — formal PRD using brief + distillate + PoC learnings as input
- `bmad-create-architecture` — technical design (build pipeline, library inlining strategy, format-versioning, IndexedDB swap)
- Or: keep iterating PoC toward MVP-ready single-file build with inlined libraries
