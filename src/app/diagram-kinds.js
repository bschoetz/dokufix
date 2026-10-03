// --- Diagrams: the languages ---------------------------------------------------
// The languages of a fenced block that dokufix draws as a diagram, each with
// what the search calls a diagram of it:
//
//   DIAGRAM_LANGUAGES.bpmn.label → 'BPMN-Diagramm'
//
// The one source of these names. diagrams.js draws a block of each language
// (its DIAGRAM_KINDS carries the renderers, under the same keys, which
// tests/diagrams.test.mjs holds equal) and gives its figure the class
// dokufix-diagram-<language>; the search (search-places.js) reads the
// language from that class and puts the label before the result, and leaves
// a fenced block of a language out of the code blocks, as the source of a
// diagram not yet drawn.
//
// Plain data, without an import: the reader bundle of `schlank` and `kompakt`
// carries the search and takes this module along, but no renderer.

// What the search calls a figure of a language not named here, which
// diagrams.js does not draw today.
export const DIAGRAM_LABEL = 'Diagramm';

export const DIAGRAM_LANGUAGES = {
  mermaid: { label: 'Mermaid-Diagramm' },
  bpmn: { label: 'BPMN-Diagramm' },
};
