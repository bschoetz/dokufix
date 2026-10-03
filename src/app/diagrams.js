import { documentHeadings, headingLabelText } from './toc.js';
import { buildWarning, errorMessage } from './warning.js';
import { renderBpmn, bpmnWarningText, BPMN_CREDIT } from './bpmn.js';
import { diagramFileNames, downloadsLine } from './diagram-downloads.js';

// --- Diagrams --------------------------------------------------------------
// Every diagram stands in one kind of figure, whatever draws it, with the
// controls of its large view (story 2.9) around its SVG container:
//
//   <figure class="dokufix-diagram dokufix-diagram-bpmn" aria-label="Rückgabe" style="--dokufix-diagram-width:812px">
//     <input type="checkbox" class="dokufix-diagram-toggle" id="dokufix-diagram-1-open" aria-label="Rückgabe groß anzeigen">
//     <input type="radio" class="dokufix-diagram-zoom" name="dokufix-diagram-1-zoom" value="fit" id="dokufix-diagram-1-fit" checked>
//     <input type="radio" class="dokufix-diagram-zoom" name="dokufix-diagram-1-zoom" value="100" id="dokufix-diagram-1-100">
//     … 150, 200
//     <div class="dokufix-diagram-view">
//       <div class="dokufix-diagram-bar">
//         <span class="dokufix-diagram-name">Rückgabe</span>
//         <span class="dokufix-diagram-steps" role="group" aria-label="Zoom">
//           <label class="dokufix-diagram-step" for="dokufix-diagram-1-fit">Einpassen</label> … 100 %, 150 %, 200 %
//         </span>
//         <label class="dokufix-diagram-close" for="dokufix-diagram-1-open">Schließen</label>
//       </div>
//       <label class="dokufix-diagram-stage" for="dokufix-diagram-1-open">
//         <div class="dokufix-diagram-svg"><svg role="img" aria-label="Rückgabe" …></svg></div>
//       </label>
//     </div>
//     <div class="dokufix-diagram-downloads" role="group" aria-label="Herunterladen">
//       <a download="Rückgabe.bpmn" href="data:application/xml;charset=utf-8,…" title="BPMN-XML herunterladen: Rückgabe.bpmn">.bpmn</a>
//     </div>
//     <figcaption class="dokufix-diagram-credit">Gezeichnet mit <a href="https://bpmn.io">bpmn-js</a></figcaption>
//   </figure>
//
// A Mermaid figure is the same with dokufix-diagram-mermaid and without the
// credit. The figure carries the diagram's title as its accessible name: the
// heading before the block, as the table of contents shows it, or "Diagramm"
// where no heading of the document comes before it. In the column the title
// is named, not shown; the bar of the large view shows it.
//
// The large view works without a script, by the document styles alone
// (src/doc.css): the checkbox opens it, a click on the diagram (the stage, a
// label of the checkbox) or on "Schließen" closes it, and the four radio
// buttons choose its zoom step. The ids carry the diagram's place in the
// document, n. "checked" is an attribute of "Einpassen" alone, so a file
// written while a view is open opens closed, at "Einpassen"; a script sets
// the property only (src/app/large-view.js). Where the app script runs, the
// large view of a BPMN diagram shows the live viewer of bpmn-js in place of
// the picture, outside the stage (src/app/live-viewer.js). After a diagram is drawn its
// width as drawn goes onto the figure as --dokufix-diagram-width, which the
// zoom steps multiply.
//
// Whatever handles diagrams goes by the figure and its SVG container: the
// document styles, the `schlank` export, which packs the container, and the
// checks. Nothing outside this module knows which library drew a diagram. A
// kind whose library asks for it gets a credit below the diagram, as a
// figcaption that stays outside the SVG container and the view.
//
// A drawn diagram gets the line of its downloads (story 2.10,
// src/app/diagram-downloads.js) between the view and the credit: its source
// as a data: URL, named after its title, the Mermaid text as written (.mmd)
// or the BPMN XML as drawn (.bpmn), the laid-out XML where the author's had
// no coordinates. A diagram that becomes a warning has none. The picture
// button beside it is added where a script runs (a run-time pass).
//
// Pure logic, apart from the renderer of each kind: the figure is made by the
// document it is handed, and diagramTitle() reads the root. The renderers are
// the exception to the rule for such modules (src/README.md): they need the
// page's library, mermaid or BpmnJS, and run only in a page; whatever document
// they work on is the holder's;
// tests/diagrams.test.mjs hands drawDiagrams() renderers of its own.

export const DIAGRAM_CLASS = 'dokufix-diagram';
export const DIAGRAM_SVG_CLASS = 'dokufix-diagram-svg';
export const DIAGRAM_CREDIT_CLASS = 'dokufix-diagram-credit';
export const DIAGRAM_TITLE_DEFAULT = 'Diagramm';
// The controls of the large view.
export const DIAGRAM_TOGGLE_CLASS = 'dokufix-diagram-toggle';
export const DIAGRAM_ZOOM_CLASS = 'dokufix-diagram-zoom';
export const DIAGRAM_VIEW_CLASS = 'dokufix-diagram-view';
// The zoom steps, in their order: the value of each radio button and what its
// label says. The first is the one a file opens with.
export const DIAGRAM_ZOOM_STEPS = [
  { value: 'fit', label: 'Einpassen' },
  { value: '100', label: '100 %' },
  { value: '150', label: '150 %' },
  { value: '200', label: '200 %' },
];
export const DIAGRAM_CLOSE_TEXT = 'Schließen';
// The accessible name of the checkbox that opens the view.
export const diagramOpenName = title => title + ' groß anzeigen';
// The ids of the controls of the n-th diagram: …-open, …-fit, …-100 …
export const diagramControlId = (n, what) => DIAGRAM_CLASS + '-' + n + '-' + what;

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

// The figure of one diagram, empty, with the controls of its large view:
// { figure, holder }. The renderer draws into holder, the SVG container.
// credit: { before, href, text }, a line below it: the words before, then the
// link. n: the diagram's place in the document, from 1, which its ids carry.
export function diagramFigure(doc, kind, title, credit, n){
  const el = (tag, className, text) => {
    const e = doc.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const figure = el('figure', DIAGRAM_CLASS + ' ' + DIAGRAM_CLASS + '-' + kind);
  figure.setAttribute('aria-label', title);
  const openId = diagramControlId(n, 'open');
  const toggle = el('input', DIAGRAM_TOGGLE_CLASS);
  toggle.setAttribute('type', 'checkbox');
  toggle.setAttribute('id', openId);
  toggle.setAttribute('aria-label', diagramOpenName(title));
  figure.appendChild(toggle);
  for (const step of DIAGRAM_ZOOM_STEPS){
    const radio = el('input', DIAGRAM_ZOOM_CLASS);
    radio.setAttribute('type', 'radio');
    radio.setAttribute('name', diagramControlId(n, 'zoom'));
    radio.setAttribute('value', step.value);
    radio.setAttribute('id', diagramControlId(n, step.value));
    if (step === DIAGRAM_ZOOM_STEPS[0]) radio.setAttribute('checked', '');
    figure.appendChild(radio);
  }
  const view = el('div', DIAGRAM_VIEW_CLASS);
  const bar = el('div', DIAGRAM_CLASS + '-bar');
  const steps = el('span', DIAGRAM_CLASS + '-steps');
  steps.setAttribute('role', 'group');
  steps.setAttribute('aria-label', 'Zoom');
  for (const step of DIAGRAM_ZOOM_STEPS){
    const label = el('label', DIAGRAM_CLASS + '-step', step.label);
    label.setAttribute('for', diagramControlId(n, step.value));
    steps.appendChild(label);
  }
  const close = el('label', DIAGRAM_CLASS + '-close', DIAGRAM_CLOSE_TEXT);
  close.setAttribute('for', openId);
  bar.append(el('span', DIAGRAM_CLASS + '-name', title), steps, close);
  const stage = el('label', DIAGRAM_CLASS + '-stage');
  stage.setAttribute('for', openId);
  const holder = el('div', DIAGRAM_SVG_CLASS);
  stage.appendChild(holder);
  view.append(bar, stage);
  figure.appendChild(view);
  if (credit){
    const caption = el('figcaption', DIAGRAM_CREDIT_CLASS);
    if (credit.before) caption.appendChild(doc.createTextNode(credit.before));
    const link = el('a', '', credit.text);
    link.setAttribute('href', credit.href);
    caption.appendChild(link);
    figure.appendChild(caption);
  }
  return { figure, holder };
}

// The width of the diagram in holder as drawn, "812px", or '' where it says
// none: the largest width its SVG allows itself (Mermaid and finishBpmnSvg()
// in bpmn.js both write it as max-width), else the width of its viewBox.
export function drawnWidth(holder){
  const svg = holder.querySelector('svg');
  if (!svg) return '';
  const max = String((svg.style && svg.style.maxWidth) || '').trim();
  const px = /^\d+(\.\d+)?px$/.test(max) ? parseFloat(max) : NaN;
  if (px > 0) return px + 'px';
  const box = String(svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  return box.length === 4 && box[2] > 0 ? box[2] + 'px' : '';
}

export const MERMAID_NO_LIBRARY = 'Die Bibliothek Mermaid wurde nicht geladen.';

// Mermaid: the source goes into the holder as text, and mermaid.run() replaces
// it with the SVG. Mermaid runs with suppressErrorRendering (src/app.js), so a
// diagram with an error throws instead of drawing its error picture. A page
// whose script tag of Mermaid failed has no mermaid: refused with that reason.
async function renderMermaid({ holder }){
  const doc = holder.ownerDocument;
  try {
    if (typeof mermaid === 'undefined' || !mermaid || typeof mermaid.run !== 'function') throw new Error(MERMAID_NO_LIBRARY);
    await mermaid.run({ nodes: [holder] });
  } catch (err){
    console.error('Mermaid error:', err);
    // Mermaid draws into a temporary element named after the diagram's id.
    // Handed a node, it puts that element into the node, which is about to
    // go; one that a failed render left in <body> is removed here.
    doc.querySelectorAll('body > [id^="dmermaid-"], body > [id^="imermaid-"]').forEach(el => el.remove());
    throw err;
  }
}

// The kinds, by the language of their fenced block: the languages of
// diagram-kinds.js, the one source of their names, and no other (a test in
// tests/diagrams.test.mjs holds the keys equal). Each: render(diagram),
// which draws into diagram.holder or throws; warning(diagram), the text of the
// warning that stands where a diagram that threw would have been; credit, the
// link below the diagram, if its library asks for one.
// download, what the line below a drawn diagram offers as its source: the
// extension of the file, its MIME type in the data: URL, what it is, in the
// link's title, and its text, read after the diagram is drawn. A kind
// without one gets no line.
// diagram: { kind, figure, holder, source, title, index }, index its place
// among the diagrams of the document, from 1; a BPMN diagram also has xml
// once it is drawn, the XML bpmn-js drew (src/app/bpmn.js).
export const DIAGRAM_KINDS = {
  mermaid: {
    render: renderMermaid,
    warning: () => 'Ein Diagramm konnte nicht gezeichnet werden.',
    download: { ext: '.mmd', mime: 'text/plain;charset=utf-8', what: 'Mermaid-Text', text: diagram => diagram.source },
  },
  bpmn: {
    render: renderBpmn,
    warning: diagram => bpmnWarningText(diagram.title),
    // "Gezeichnet mit bpmn-js" under every BPMN diagram (Ben, 2026-10-01 and 2026-10-03).
    credit: BPMN_CREDIT,
    download: { ext: '.bpmn', mime: 'application/xml;charset=utf-8', what: 'BPMN-XML', text: diagram => diagram.xml || diagram.source },
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
// failed, without the controls of a large view, and the others are drawn. A
// drawn diagram's figure gets its width as drawn and the line of its
// downloads, named by the titles of all diagrams of the document, the ones
// that fail included, so that a name does not change with whether another
// diagram is drawn. The tests hand in kinds of their own.
export async function drawDiagrams(root, kinds){
  const doc = root.ownerDocument;
  const selector = Object.keys(kinds).map(kind => 'pre code.language-' + kind).join(', ');
  const diagrams = [];
  for (const code of root.querySelectorAll(selector)){
    const kind = Object.keys(kinds).find(k => code.classList.contains('language-' + k));
    const title = diagramTitle(code, root);
    const index = diagrams.length + 1;
    const { figure, holder } = diagramFigure(doc, kind, title, kinds[kind].credit, index);
    holder.textContent = code.textContent;
    code.parentElement.replaceWith(figure);
    diagrams.push({ kind, figure, holder, source: code.textContent, title, index });
  }
  const names = diagramFileNames(diagrams.map(d => d.title));
  for (const [i, diagram] of diagrams.entries()){
    const kind = kinds[diagram.kind];
    try {
      await kind.render(diagram);
      const width = drawnWidth(diagram.holder);
      if (width) diagram.figure.setAttribute('style', '--dokufix-diagram-width:' + width);
      if (kind.download){
        const line = downloadsLine(doc, names[i], { ...kind.download, text: kind.download.text(diagram) });
        const credit = Array.from(diagram.figure.children).find(el => el.classList.contains(DIAGRAM_CREDIT_CLASS)) || null;
        diagram.figure.insertBefore(line, credit);
      }
    } catch (err){
      diagram.figure.replaceWith(buildWarning(doc, kind.warning(diagram), errorMessage(err)));
    }
  }
}

// What a library leaves in the page outside the document, for a save to leave
// behind: Mermaid appends its tooltip to <body> with the first diagram it
// draws; the live viewer of a BPMN diagram (bpmn-js, src/app/live-viewer.js)
// leaves what removeViewerLeftovers() names. None of it is ours to mark
// transient, so it is named here.
export function removeRendererLeftovers(root){
  root.querySelectorAll('.mermaidTooltip').forEach(el => el.remove());
  removeViewerLeftovers(root);
}

// What bpmn-js puts outside the container it draws in, which its destroy()
// leaves: the lightbox its logo opens, appended to <body>, and the cursor
// class it sets on <body> while the diagram is dragged (djs-cursor-grab and
// the like). root: a document, or the root element of a copy of one.
export const VIEWER_LIGHTBOX_CLASS = 'bjs-powered-by-lightbox';
export function removeViewerLeftovers(root){
  root.querySelectorAll('.' + VIEWER_LIGHTBOX_CLASS).forEach(el => el.remove());
  const body = root.querySelector('body');
  if (!body) return;
  for (const name of Array.from(body.classList)) if (/^djs-cursor-/.test(name)) body.classList.remove(name);
}
