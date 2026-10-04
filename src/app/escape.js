// --- Escape: one listener, one order -----------------------------------------
// Every Escape the page and the reader bundle handle goes through here. The
// caller hands one list of steps, in the order Escape closes things; a step is
// a pair
//
//   applies(e)   whether it has something to close, read from the page and e
//   close(e)     closes it
//
// One Escape closes one thing: the first step that applies closes, the event
// gets preventDefault and stopPropagation, and no later step runs. Where no
// step applies nothing happens and the event goes on, to the browser (a
// <dialog> opened with showModal() closes on it) and to every other listener.
//
// The modules export their step and keep no Escape listener of their own:
// src/app.js lists all five, src/reader.js the three of the exports. See the
// README, "Keys and events".
//
// The listener is on window, in the capture phase: it hears the key before
// every listener on the document and before the keyboard of bpmn-js on the
// canvas of the live viewer. It skips a key of an input method that is still
// composing and a key some listener before it has already taken.
//
// It must not import src/app/dom.js: the reader bundle carries it.

// Runs the first step of steps that applies to e and stops the event there.
// Whether a step closed something.
export function runEscape(steps, e){
  if (e.key !== 'Escape' || e.isComposing || e.defaultPrevented) return false;
  for (const step of steps){
    if (!step.applies(e)) continue;
    e.preventDefault();
    e.stopPropagation();
    step.close(e);
    return true;
  }
  return false;
}

export function registerEscape(doc, steps){
  doc.defaultView.addEventListener('keydown', e => { runEscape(steps, e); }, true);
}

// The document an event was fired in: its target is an element, the document
// itself or the window.
export function documentOf(e){
  const t = e.target;
  return (t && (t.ownerDocument || t.document)) || t;
}
