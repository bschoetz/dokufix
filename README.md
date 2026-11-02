# dokufix
Make documentation available. Fast.

dokufix is one HTML file that is the viewer, the editor and the document at once. Write Markdown with Mermaid and BPMN diagrams, save, and pass the file on. No install, no server, no account. The interface is in German.

Open [`dist/dokufix.html`](dist/dokufix.html) in a browser. For a first look open [`dist/dokufix-showcase.html`](dist/dokufix-showcase.html): the same file with a short text that shows each feature once.

Status: working prototype. The editor loads its libraries from a CDN at pinned versions; the read-only exports open offline.

## What it does

- **Markdown** with tables (filter per column), code blocks, footnotes with previews, a YAML or JSON metadata header, callouts (`> [!NOTE]`), status chips (`` `🟢 Live` ``), cards and step lists, images (paste, drop or pick; stored as WebP), a two-level table of contents.
- **Diagrams**: Mermaid, and BPMN 2.0 XML drawn with bpmn-js. BPMN without coordinates, as a language model writes it, is laid out automatically: lanes, pools, gateways, loops, boundary events, notes, data objects. Each diagram opens in a large view and downloads as its source (`.mmd`, `.bpmn`) or as `.svg`.
- **Search** across text, tables, diagrams, metadata and code.
- **Editor**: a discreet "Editor" button switches from reading to writing. Changes stay in the browser (IndexedDB), with a version history.
- **Documents in parts**: a document can hold several parts, each with its own header.
- **Download variants** from the menu:

  | Variant | Receiver can edit | Needs JavaScript |
  |---|---|---|
  | Mit Editor | yes, the file carries the editor and the history | yes |
  | nur-lesen | no | no |
  | schlank | no | for diagrams and search only |
  | kompakt | no | yes |

## dokufix for language models

[`skill/dokufix/dokufix.py`](skill/dokufix/dokufix.py) lets a language model write and read dokufix files without the HTML entering its context. Python 3, standard library only.

```
python3 skill/dokufix/dokufix.py inject <markdown> <target>      # new file, or new document in an existing one
python3 skill/dokufix/dokufix.py extract <file> [--part <n|name>] # print the Markdown
python3 skill/dokufix/dokufix.py overview <file>                  # parts, headers and headings as JSON
```

## BPMN tools

Two pages beside the product, for working on the automatic layout:

- [`dist/bpmn-assistant.html`](dist/bpmn-assistant.html): lay out BPMN XML and compare it with other layouters.
- [`dist/bpmn-layout-werkbank.html`](dist/bpmn-layout-werkbank.html): the layout workbench with test cases, status and rating.

## Build and checks

Node 20.19+, 22.13+ or 24+.

```
npm install
npm run build      # src/ → dist/dokufix.html and dist/dokufix-showcase.html
npm run watch      # readable build on every change
npm run check      # built file current, style check, lint
npm test           # unit tests, including the Python script
npm run pruefung   # browser runs (Chromium and Firefox via Playwright)
npm run assistant  # build the BPMN tool pages (also: werkbank)
```

## Layout

```
src/           sources of the product and the tool pages; src/README.md has architecture, build and checks
dist/          built files, committed
skill/dokufix/ the script for language models
tests/         tests and browser runs
tools/         page builder and BPMN layout tools
docs/          concepts and audits
poc/           the first hand-written prototype, frozen
spikes/        experiments
```

Details on every feature, the build and the checks: [`src/README.md`](src/README.md).

## License

dokufix is under the [MIT License](LICENSE). It uses work of others under their own licences, mostly MIT, bpmn-js under the bpmn.io License: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
