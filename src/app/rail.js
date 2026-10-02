import { escapeHtml } from './render.js';
import { headingLabelText } from './toc.js';
import { tocLinkHandler } from './footnotes.js';

// --- Right-side scrollspy rail --------------------------------
const railEl = document.getElementById('dokufix-rail');
export const RAIL_MIN_HEADINGS = 4;
// Click handler is attached ONCE at init; the rail's children are
// rebuilt on each render() but the rail element itself persists.
export function registerRailClicks(){
  if (railEl) railEl.addEventListener('click', tocLinkHandler);
}
// Reading line: where in the viewport we consider "what the reader is currently looking at".
// 25 % from the top — under the eye-line of someone scanning new content.
const READING_LINE_RATIO = 0.25;

// One scroll handler at a time; track it so buildRail can swap it on re-render.
let railScrollHandler = null;
let railResizeHandler = null;

export function buildRail(headings){
  if (!railEl) return;

  // Detach previous handlers before rebuilding (re-render of editor source).
  if (railScrollHandler){
    window.removeEventListener('scroll', railScrollHandler);
    railScrollHandler = null;
  }
  if (railResizeHandler){
    window.removeEventListener('resize', railResizeHandler);
    railResizeHandler = null;
  }

  const items = Array.from(headings).filter(h => /^H[234]$/.test(h.tagName));
  if (items.length < RAIL_MIN_HEADINGS){
    railEl.classList.remove('has-items');
    railEl.innerHTML = '';
    return;
  }

  let html = '<ol>';
  for (const h of items){
    html += '<li class="rail-' + h.tagName.toLowerCase() + '">' +
            '<a href="#' + h.id + '">' + escapeHtml(headingLabelText(h)) + '</a></li>';
  }
  html += '</ol>';
  railEl.innerHTML = html;
  railEl.classList.add('has-items');

  // Scrollspy: pick the last heading whose top edge is at or above the reading line.
  // Guarantees a non-empty active state in every position — before the first heading
  // we pick the first; after the last heading we keep the last; mid-section we keep
  // the one we just scrolled past.
  const linksByHash = new Map();
  railEl.querySelectorAll('a').forEach(a => linksByHash.set(a.getAttribute('href'), a));

  let lastActiveHref = null;
  function updateActive(){
    const lineY = window.innerHeight * READING_LINE_RATIO;
    let active = items[0];
    for (const h of items){
      const top = h.getBoundingClientRect().top;
      if (top <= lineY) active = h;
      else break;
    }
    const href = '#' + active.id;
    if (href === lastActiveHref) return;
    lastActiveHref = href;
    for (const [h, a] of linksByHash){
      a.classList.toggle('active', h === href);
    }
    // Keep the active entry visible inside the rail's own scroll container,
    // without nudging the page scroll position.
    const link = linksByHash.get(href);
    if (link){
      const lr = link.getBoundingClientRect();
      const rr = railEl.getBoundingClientRect();
      if (lr.top < rr.top || lr.bottom > rr.bottom){
        railEl.scrollTop += (lr.top + lr.height / 2) - (rr.top + rr.height / 2);
      }
    }
  }

  // rAF-throttled scroll handler — at most one update per frame.
  let pending = false;
  railScrollHandler = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; updateActive(); });
  };
  railResizeHandler = railScrollHandler;
  window.addEventListener('scroll', railScrollHandler, { passive: true });
  window.addEventListener('resize', railResizeHandler, { passive: true });

  updateActive(); // initial state, before any scroll
}
