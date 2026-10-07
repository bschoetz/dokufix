import { TRANSIENT_ATTR } from './transient.js';

// --- The notice while a diagram is laid out ----------------------------------
// While the layout of a BPMN diagram without coordinates runs in its worker,
// the page goes on, and the diagram's SVG container says what it waits for:
//
//   <p class="layout-notice" role="status" data-dokufix-transient style="…">
//     Diagramm wird angeordnet … <span aria-hidden="true">7 s</span>
//   </p>
//
// The seconds count up, once a second, so that a reader sees that something
// happens (Ben, 2026-10-07). The SVG or the warning replaces the notice; the
// caller stops its timer whatever the layout ends in.
//
//   - Transient: the notice is not the document. No export carries it, since
//     every export renders and waits for the render before it copies the
//     preview (src/app/downloads/export-body.js); a save of "Mit Editor"
//     during a layout takes the page along, without what is transient.
//   - Its look is its own style attribute, no rule of a stylesheet: the
//     document styles travel into every export, which never shows it, and the
//     app stylesheet may not style what stands in the preview
//     (tests/check-doc-styles.mjs). The seconds keep their width
//     (tabular-nums), so the line does not move as they count.
//   - For assistive technology: role status, a polite live region, meant to
//     be said once, as "Diagramm wird angeordnet …". A live region announces
//     a change of its content; one that comes into the page with its text
//     already in it may not be announced at all, since no region was known
//     there before. So the paragraph goes in empty, and its text follows a
//     frame later (options.frame), when the region is in the page. The tests
//     check that order, nothing more: whether a screen reader says it is not
//     tried, since this machine has none. The seconds are hidden from it: a
//     live region whose text changed every second would be read out every
//     second, and the number says nothing that the notice has not said.
//
// Pure logic: the element is made by the holder's document, the timer, the
// frame and the clock come from options; tests/layout-notice.test.mjs runs it
// with fakes.

export const LAYOUT_NOTICE_CLASS = 'layout-notice';
export const LAYOUT_NOTICE_TEXT = 'Diagramm wird angeordnet …';
const LAYOUT_NOTICE_STYLE = 'margin:0;padding:24px 0;text-align:center;color:#6e6e73;font-size:14px;font-variant-numeric:tabular-nums';
// The seconds as the notice shows them.
export const layoutSeconds = s => s + ' s';

// The next frame of the page, or, where there is none (Node), the next task.
const nextFrame = fn => typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 0);

// Puts the notice into holder, in place of what it holds, and starts its
// count; its text follows a frame later. options: timers, with setInterval()
// and clearInterval(); frame(fn), which calls fn once the page has drawn the
// empty notice; now(), the clock in ms. Returns { element, stop() }; stop()
// ends the count and may be called more than once. The notice stays until the
// caller replaces it.
export function showLayoutNotice(holder, { timers = globalThis, frame = nextFrame, now = () => performance.now() } = {}){
  const doc = holder.ownerDocument;
  const element = doc.createElement('p');
  element.className = LAYOUT_NOTICE_CLASS;
  element.setAttribute('role', 'status');
  element.setAttribute(TRANSIENT_ATTR, '');
  element.setAttribute('style', LAYOUT_NOTICE_STYLE);
  const count = doc.createElement('span');
  count.setAttribute('aria-hidden', 'true');
  count.textContent = layoutSeconds(0);
  // The region first, empty; its text is the change a screen reader says.
  holder.replaceChildren(element);
  frame(() => element.append(doc.createTextNode(LAYOUT_NOTICE_TEXT + ' '), count));
  // By the clock, not by the ticks: a tick that comes late shows the time
  // that has passed.
  const begun = now();
  let timer = timers.setInterval(() => { count.textContent = layoutSeconds(Math.round((now() - begun) / 1000)); }, 1000);
  const stop = () => {
    if (timer === null) return;
    timers.clearInterval(timer);
    timer = null;
  };
  return { element, stop };
}
