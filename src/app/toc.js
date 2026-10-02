import { previewEl } from './dom.js';
import { escapeHtml } from './render.js';
import { tocLinkHandler } from './footnotes.js';

// --- Table of Contents ----------------------------------------
// Two layers, see README:
//   1. Inline [[toc]] (or [[toc:N]]) marker in markdown → static nested list.
//   2. Right-side scrollspy rail in read mode (wide viewports only).
// Both feed off the same set of generated heading IDs.

function slugify(text, used){
  // Fold most Latin diacritics via NFKD decomposition (é → e, ç → c, ñ → n).
  // German-specific letters are spelled out explicitly because NFKD splits
  // them differently (ä → "a" + combining diaeresis, which would collapse to
  // "a" — we want "ae" instead, the conventional German romanization).
  let slug = String(text)
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')  // strip remaining combining marks
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  if (!slug) slug = 'section';
  // Guard: never let a heading produce an "asset-…" slug — that namespace is
  // reserved for image refs (#asset-<hash>) in the rendered preview, and a
  // collision would let the asset-resolver target a heading anchor.
  if (slug.startsWith('asset-') || slug === 'asset') slug = 'h-' + slug;
  let candidate = slug, i = 1;
  while (used.has(candidate)) candidate = slug + '-' + (++i);
  used.add(candidate);
  return candidate;
}

export function assignHeadingIds(headings){
  const used = new Set();
  headings.forEach(h => { if (h.id) used.add(h.id); });
  headings.forEach(h => { if (!h.id) h.id = slugify(h.textContent, used); });
}

function buildTocHtml(headings, maxLevel){
  const items = Array.from(headings).filter(h => {
    const lv = parseInt(h.tagName.substring(1), 10);
    return lv >= 2 && lv <= maxLevel;
  });
  if (!items.length) return '';
  const minLv = Math.min(...items.map(h => parseInt(h.tagName.substring(1), 10)));
  let html = '';
  const open = []; // stack of (relative) levels currently open
  for (const h of items){
    const lv = parseInt(h.tagName.substring(1), 10) - minLv;
    while (open.length && open[open.length-1] > lv){ html += '</li></ol>'; open.pop(); }
    if (!open.length || open[open.length-1] < lv){ html += '<ol>'; open.push(lv); }
    else { html += '</li>'; }
    html += '<li><a href="#' + h.id + '">' + escapeHtml(headingLabelText(h)) + '</a>';
  }
  while (open.length){ html += '</li></ol>'; open.pop(); }
  return html;
}

// Heading text for a ToC or rail label. Not h.textContent: attachFootnotePreviews()
// appends the whole footnote into a <span> inside the marker's <sup>, so a marker
// in a heading drags the entire footnote into the label. textContent is DOM-level
// and does not care that the span is visibility:hidden. processInlineToc() happens
// to run before the preview pass and would escape today, but that is call ordering,
// not a guarantee — buildRail() and buildStaticRailHtml() run after it.
export function headingLabelText(h){
  const clone = h.cloneNode(true);
  clone.querySelectorAll('.dokufix-fn-preview').forEach(n => n.remove());
  return clone.textContent;
}

export function processInlineToc(headings){
  const paras = previewEl.querySelectorAll('p');
  for (const p of paras){
    // Stricter than textContent.trim(): the paragraph must contain ONLY a
    // text node matching the marker — no inline elements (e.g., <code>,
    // <em>) wrapping it. That way a doc explaining the marker by writing
    // `[[toc]]` (which marked renders as <p><code>[[toc]]</code></p>)
    // doesn't accidentally invoke the feature.
    if (p.children.length !== 0) continue;
    const txt = (p.textContent || '').trim();
    const m = txt.match(/^\[\[toc(?::([1-6]))?\]\]$/);
    if (!m) continue;
    const maxLevel = m[1] ? parseInt(m[1], 10) : 3;
    const inner = buildTocHtml(headings, maxLevel);
    if (!inner){ p.remove(); continue; }
    const nav = document.createElement('nav');
    nav.className = 'dokufix-toc';
    nav.setAttribute('aria-label', 'Inhaltsverzeichnis');
    nav.innerHTML = inner;
    // Smooth scroll on click + update hash without jumping
    nav.addEventListener('click', tocLinkHandler);
    p.replaceWith(nav);
  }
}
