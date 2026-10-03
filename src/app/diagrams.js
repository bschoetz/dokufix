import { documentHeadings, headingLabelText } from './toc.js';
import { buildWarning, errorMessage } from './warning.js';
import { renderBpmn, bpmnWarningText, BPMN_CREDIT } from './bpmn.js';

// --- Diagrams --------------------------------------------------------------
// Every diagram stands in one kind of figure, whatever draws it:
//
//   <figure class="dokufix-diagram dokufix-diagram-mermaid" aria-label="Ablauf">
//     <div class="dokufix-diagram-svg"><svg …></svg></div>
//   </figure>
//   <figure class="dokufix-diagram dokufix-diagram-bpmn" aria-label="Rückgabe">
//     <div class="dokufix-diagram-svg"><svg role="img" aria-label="Rückgabe" …></svg></div>
//     <figcaption class="dokufix-diagram-credit">Gezeichnet mit <a href="https://bpmn.io">bpmn-js</a></figcaption>
//   </figure>
//
// The figure carries the diagram's title as its accessible name: the heading
// before the block, as the table of contents shows it, or "Diagramm" where no
// heading of the document comes before it. The title is named, not shown.
// Whatever handles diagrams goes by the figure and its SVG container: the
// document styles, the `schlank` export, which packs the container, and the
// checks. Nothing outside this module knows which library drew a diagram. A
// kind whose library asks for it gets a credit below the diagram, as a
// figcaption that stays outside the SVG container.
//
// Pure logic, apart from the renderer of each kind: the figure is made by the
// document it is handed, and diagramTitle() reads the root. The renderers use
// the page's globals (mermaid, BpmnJS, document) and run only in a page;
// tests/diagrams.test.mjs hands drawDiagrams() renderers of its own.

export const DIAGRAM_CLASS = 'dokufix-diagram';
export const DIAGRAM_SVG_CLASS = 'dokufix-diagram-svg';
export const DIAGRAM_CREDIT_CLASS = 'dokufix-diagram-credit';
export const DIAGRAM_TITLE_DEFAULT = 'Diagramm';

// The title of the diagram at element: the label of the last heading of the
// document before it, at any level, or the default. A heading inside a callout
// is no heading of the document (documentHeadings()), so it does not count.
export function diagramTitle(element, root){
  const headings = new Set(documentHeadings(root));
  let last = null;
  // Every element of the root, in the order of the document, up to element.
  for (const el of root.querySelectorAll('*')){
    if (el === element) break;
    if (headings.has(el)) last = el;
  }
  const label = last ? headingLabelText(last).replace(/\s+/g, ' ').trim() : '';
  return label || DIAGRAM_TITLE_DEFAULT;
}

// The figure of one diagram, empty: { figure, holder }. The renderer draws
// into holder, the SVG container. credit: { before, href, text }, a line
// below it: the words before, then the link.
export function diagramFigure(doc, kind, title, credit){
  const figure = doc.createElement('figure');
  figure.className = DIAGRAM_CLASS + ' ' + DIAGRAM_CLASS + '-' + kind;
  figure.setAttribute('aria-label', title);
  const holder = doc.createElement('div');
  holder.className = DIAGRAM_SVG_CLASS;
  figure.appendChild(holder);
  if (credit){
    const caption = doc.createElement('figcaption');
    caption.className = DIAGRAM_CREDIT_CLASS;
    if (credit.before) caption.appendChild(doc.createTextNode(credit.before));
    const link = doc.createElement('a');
    link.setAttribute('href', credit.href);
    link.textContent = credit.text;
    caption.appendChild(link);
    figure.appendChild(caption);
  }
  return { figure, holder };
}

// Mermaid: the source goes into the holder as text, and mermaid.run() replaces
// it with the SVG. Mermaid runs with suppressErrorRendering (src/app.js), so a
// diagram with an error throws instead of drawing its error picture.
async function renderMermaid({ holder }){
  try {
    await mermaid.run({ nodes: [holder] });
  } catch (err){
    console.error('Mermaid error:', err);
    // Mermaid draws into a temporary element named after the diagram's id.
    // Handed a node, it puts that element into the node, which is about to
    // go; one that a failed render left in <body> is removed here.
    document.querySelectorAll('body > [id^="dmermaid-"], body > [id^="imermaid-"]').forEach(el => el.remove());
    throw err;
  }
}

// The kinds, by the language of their fenced block. Each: render(diagram),
// which draws into diagram.holder or throws; warning(diagram), the text of the
// warning that stands where a diagram that threw would have been; credit, the
// link below the diagram, if its library asks for one.
// diagram: { kind, figure, holder, source, title, index }, index its place
// among the diagrams of the document, from 1.
export const DIAGRAM_KINDS = {
  mermaid: {
    render: renderMermaid,
    warning: () => 'Ein Diagramm konnte nicht gezeichnet werden.',
  },
  bpmn: {
    render: renderBpmn,
    warning: diagram => bpmnWarningText(diagram.title),
    // "Gezeichnet mit bpmn-js" under every BPMN diagram (Ben, 2026-10-01 and 2026-10-03).
    credit: BPMN_CREDIT,
  },
};

// Document pass: every fenced block of a known kind becomes its figure, and
// the figure its diagram. See drawDiagrams().
export function renderDiagrams(root){
  return drawDiagrams(root, DIAGRAM_KINDS);
}

// All blocks of the given kinds become figures first, then the diagrams are
// drawn one at a time, in the order of the document, each in its own
// containment: one that throws becomes the warning with the message of what
// failed, and the others are drawn. The tests hand in kinds of their own.
export async function drawDiagrams(root, kinds){
  const doc = root.ownerDocument;
  const selector = Object.keys(kinds).map(kind => 'pre code.language-' + kind).join(', ');
  const diagrams = [];
  for (const code of root.querySelectorAll(selector)){
    const kind = Object.keys(kinds).find(k => code.classList.contains('language-' + k));
    const title = diagramTitle(code, root);
    const { figure, holder } = diagramFigure(doc, kind, title, kinds[kind].credit);
    holder.textContent = code.textContent;
    code.parentElement.replaceWith(figure);
    diagrams.push({ kind, figure, holder, source: code.textContent, title, index: diagrams.length + 1 });
  }
  for (const diagram of diagrams){
    const kind = kinds[diagram.kind];
    try {
      await kind.render(diagram);
    } catch (err){
      diagram.figure.replaceWith(buildWarning(doc, kind.warning(diagram), errorMessage(err)));
    }
  }
}

// What a library leaves in the page outside the document, for a save to leave
// behind: Mermaid appends its tooltip to <body> with the first diagram it
// draws. It is not ours to mark transient, so it is named here.
export function removeRendererLeftovers(root){
  root.querySelectorAll('.mermaidTooltip').forEach(el => el.remove());
}
