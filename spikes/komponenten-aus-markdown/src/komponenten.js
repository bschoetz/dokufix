// Spike: Komponenten aus reinem Markdown.
// Muster wie im PoC: marked.parse() liefert HTML, danach laufen kleine DOM-Pässe darüber.
// render()  = statische Umformung. Ergebnis ist reines HTML/CSS und überlebt den JS-freien Export.
// enhance() = Laufzeit-Komfort (Freitextfilter, Scrollspy). Fehlt im JS-freien Export ersatzlos.
const DokufixKomponenten = (() => {
  const CHIP = { '🟢': 'ok', '🟡': 'warn', '🔴': 'danger', '⚪': 'neutral', '🔵': 'info' };
  const CALLOUT = { NOTE: 'note', TIP: 'tip', IMPORTANT: 'important', WARNING: 'warning', CAUTION: 'caution' };
  // Bekannte Markierungen und der Block, den sie direkt danach erwarten.
  const PRAGMAS = { cards: 'UL', steps: 'OL', filter: 'TABLE', facets: 'TABLE', bpmn: 'PRE' };
  const BLOCK_NAME = { UL: 'eine Aufzählung', OL: 'eine nummerierte Liste', TABLE: 'eine Tabelle', PRE: 'einen Mermaid-Codeblock' };
  let uid = 0;

  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  function slugify(text) {
    const s = String(text).normalize('NFC').toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return s || 'section';
  }

  // Erster Knoten, der nicht nur Leerraum ist.
  function firstReal(node) {
    let n = node.firstChild;
    while (n && n.nodeType === 3 && !n.data.trim()) n = n.nextSibling;
    return n;
  }
  function prevReal(node) {
    let n = node.previousSibling;
    while (n && n.nodeType === 3 && !n.data.trim()) n = n.previousSibling;
    return n;
  }
  // Listeneinträge mit Leerzeilen dazwischen tragen ihren Inhalt in einem <p>.
  function itemHost(li) {
    const first = firstReal(li);
    return first && first.nodeType === 1 && first.tagName === 'P' ? first : li;
  }

  function warnung(text) {
    const p = document.createElement('p');
    p.className = 'dokufix-warnung';
    p.setAttribute('role', 'note');
    p.textContent = text;
    return p;
  }

  // <!-- dokufix: name [argument] --> markiert den direkt folgenden Block.
  // Renderer, die Roh-HTML durchlassen (GitHub, marked, Pandoc), zeigen den Kommentar nicht.
  // Tippfehler und falsche Blockart fallen sichtbar auf statt still zu verpuffen.
  function applyPragmas(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
    const comments = [];
    while (walker.nextNode()) comments.push(walker.currentNode);
    for (const c of comments) {
      const m = /^\s*dokufix:\s*([a-z-]+)\s*([\s\S]*?)\s*$/.exec(c.data);
      if (!m) continue;
      const name = m[1], want = PRAGMAS[name];
      if (!want) { c.replaceWith(warnung('Unbekannte Markierung „dokufix: ' + name + '“.')); continue; }
      let el = c.nextSibling;
      while (el && (el.nodeType === 8 || (el.nodeType === 3 && !el.data.trim()))) el = el.nextSibling;
      if (!el || el.nodeType !== 1 || el.tagName !== want) {
        c.replaceWith(warnung('Markierung „dokufix: ' + name + '“ erwartet direkt danach ' + BLOCK_NAME[want] + '.'));
        continue;
      }
      el.classList.add('dokufix-' + name);
      if (m[2]) el.setAttribute('data-' + name, m[2].replace(/^"([\s\S]*)"$/, '$1'));
      c.remove();
    }
  }

  // GitHub-Alerts: > [!NOTE] / > [!WARNING] … Der Marker muss wie bei GitHub allein in der ersten Zeile stehen.
  function callouts(root) {
    root.querySelectorAll('blockquote').forEach(bq => {
      const p = bq.firstElementChild;
      const t = p && p.tagName === 'P' ? p.firstChild : null;
      if (!t || t.nodeType !== 3) return;
      const m = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(\n|$)/i.exec(t.data);
      if (!m) return;
      t.data = t.data.slice(m[0].length);
      if (!t.data) t.remove();
      const lead = firstReal(p);
      if (lead && lead.nodeType === 1 && lead.tagName === 'BR') lead.remove();
      if (!firstReal(p)) p.remove();
      const box = document.createElement('div');
      box.className = 'dokufix-callout dokufix-callout-' + CALLOUT[m[1].toUpperCase()];
      box.setAttribute('role', 'note');
      box.append(...bq.childNodes);
      bq.replaceWith(box);
    });
  }

  // `🟢 in Betrieb` → Status-Chip. Ohne Dokufix bleibt es ein lesbarer Code-Span mit Emoji.
  function chips(root) {
    root.querySelectorAll('code').forEach(code => {
      if (code.closest('pre')) return;
      const m = /^(🟢|🟡|🔴|⚪|🔵)️?\s*(.+)$/u.exec(code.textContent);
      if (!m) return;
      const chip = document.createElement('span');
      chip.className = 'dokufix-chip dokufix-chip-' + CHIP[m[1]];
      chip.textContent = m[2];
      code.replaceWith(chip);
    });
  }

  // Karten: der Eintrag beginnt mit einem fetten Titel.
  function cards(root) {
    root.querySelectorAll('ul.dokufix-cards > li').forEach(li => {
      const first = firstReal(itemHost(li));
      if (!first || first.nodeType !== 1 || first.tagName !== 'STRONG') return;
      first.classList.add('dokufix-card-title');
      let next = first.nextSibling;
      while (next && next.nodeType === 3 && !next.data.trim()) next = next.nextSibling;
      if (next && next.nodeType === 1 && next.tagName === 'BR') next.remove();
    });
  }

  // Schritte: führendes *Akteur:* (mit Doppelpunkt) wird zum Etikett über dem Schritt.
  function steps(root) {
    root.querySelectorAll('ol.dokufix-steps').forEach(ol => {
      if (ol.start > 1) ol.style.counterReset = 's ' + (ol.start - 1);
      for (const li of ol.children) {
        const first = firstReal(itemHost(li));
        if (first && first.nodeType === 1 && first.tagName === 'EM' && /:\s*$/.test(first.textContent)) {
          first.className = 'dokufix-who';
          first.textContent = first.textContent.replace(/:\s*$/, '');
        }
      }
    });
  }

  function firstLineText(cell) {
    let out = '';
    for (const n of cell ? cell.childNodes : []) {
      if (n.nodeType === 1 && n.tagName === 'BR') break;
      out += n.textContent;
    }
    return out.trim();
  }

  // Facetten-Filter ohne JavaScript: Radio-Buttons + generierte :has()-Regeln je Wert.
  function buildFacets(wrap, table, column) {
    const head = table.tHead && table.tHead.rows[0];
    const idx = head ? [...head.cells].findIndex(th => th.textContent.trim().toLowerCase() === column.trim().toLowerCase()) : -1;
    if (idx < 0 || !table.tBodies[0]) {
      wrap.prepend(warnung('Markierung „dokufix: facets ' + column + '“: Spalte nicht gefunden.'));
      return;
    }
    const id = 'dokufix-facets-' + (++uid);
    wrap.id = id;
    const values = new Map();   // Schlüssel ist der Zellentext selbst, nicht sein Slug: „C“ und „C++“ bleiben getrennt
    for (const tr of table.tBodies[0].rows) {
      const label = firstLineText(tr.cells[idx]) || '—';
      let v = values.get(label);
      if (!v) { v = { key: 'f' + (values.size + 1), n: 0 }; values.set(label, v); }
      v.n++;
      tr.dataset.facet = v.key;
    }
    const total = table.tBodies[0].rows.length;
    const fs = document.createElement('fieldset');
    fs.className = 'dokufix-facet-ui';
    let html = '<legend>' + esc(head.cells[idx].textContent.trim()) + '</legend>' +
      '<label><input type="radio" name="' + id + '" value="*" checked> Alle <span>' + total + '</span></label>';
    let css = '';
    for (const [label, v] of values) {
      html += '<label><input type="radio" name="' + id + '" value="' + v.key + '"> ' + esc(label) + ' <span>' + v.n + '</span></label>';
      css += '#' + id + ':has(input[value="' + v.key + '"]:checked) tbody tr:not([data-facet="' + v.key + '"]){display:none}';
    }
    fs.innerHTML = html;
    const style = document.createElement('style');
    style.textContent = css;
    wrap.prepend(fs, style);
  }

  function tables(root) {
    root.querySelectorAll('table').forEach(table => {
      const wrap = document.createElement('div');
      wrap.className = 'dokufix-table';
      const scroll = document.createElement('div');
      scroll.className = 'dokufix-scroll';
      table.replaceWith(wrap);
      scroll.append(table);
      wrap.append(scroll);
      // Unterzeile: ein *kursiver* Text direkt nach einem Zeilenumbruch in der Zelle
      table.querySelectorAll('td > em, th > em').forEach(em => {
        const prev = prevReal(em);
        if (prev && prev.nodeType === 1 && prev.tagName === 'BR') em.classList.add('dokufix-sub');
      });
      if (table.classList.contains('dokufix-facets')) buildFacets(wrap, table, table.dataset.facets || '');
      if (table.classList.contains('dokufix-filter')) wrap.dataset.filter = table.dataset.filter || 'Filtern …';
    });
  }

  // Handbuch-Layout: H1 = Marke in der Navigation, H2 mit H3 darunter = Gruppe, H3 = Abschnitt.
  // Eine H2 ohne H3 darunter ist selbst ein Abschnitt und bleibt sichtbar.
  // Es zählen nur Überschriften auf oberster Ebene, nicht die in Hinweisen oder Listen.
  function layout(root, nav) {
    const h1 = root.querySelector(':scope > h1');
    if (h1) {
      const sub = h1.nextElementSibling;
      h1.classList.add('dokufix-brand');
      nav.append(h1);
      if (sub && sub.tagName === 'P' && sub.textContent.length <= 120) { sub.classList.add('dokufix-brand-sub'); nav.append(sub); }
    }
    const heads = [...root.querySelectorAll(':scope > h2, :scope > h3, :scope > h4')];
    const used = new Set([...root.querySelectorAll('[id]')].map(e => e.id));
    let group = '';
    let opening = true;
    heads.forEach((h, i) => {
      const clean = h.cloneNode(true);
      clean.querySelectorAll('.dokufix-chip').forEach(c => c.remove());
      const text = clean.textContent.trim() || h.textContent.trim();
      if (!h.id) {                                   // vom Autor gesetzte ids bleiben
        const base = slugify(text);
        let id = base, n = 1;
        while (used.has(id)) id = base + '-' + (++n);
        used.add(id);
        h.id = id;
      }
      const next = heads.slice(i + 1).find(x => x.tagName !== 'H4');
      const isGroup = h.tagName === 'H2' && next && next.tagName === 'H3';
      if (isGroup) {
        group = text;
        h.classList.add('dokufix-group');
        const g = document.createElement('p');
        g.className = 'dokufix-navgrp';
        g.textContent = text;
        nav.append(g);
      } else if (h.tagName !== 'H4') {
        if (h.tagName === 'H2') group = '';
        h.classList.add('dokufix-section');
        const a = document.createElement('a');
        a.href = '#' + encodeURIComponent(h.id);
        a.textContent = text;
        nav.append(a);
        const eyebrow = document.createElement('p');
        eyebrow.className = 'dokufix-eyebrow';
        eyebrow.setAttribute('aria-hidden', 'true');
        eyebrow.textContent = group;
        h.before(eyebrow);
        if (opening) {
          opening = false;
          eyebrow.classList.add('dokufix-first');
          h.classList.add('dokufix-opening');
          if (h.nextElementSibling && h.nextElementSibling.tagName === 'P') h.nextElementSibling.classList.add('dokufix-lede');
        }
      }
    });
  }

  // Diagramm-Rahmen mit großer Ansicht. Reines HTML und CSS: eine Checkbox schaltet auf Vollbild,
  // Radio-Buttons wählen die Zoomstufe. Deshalb funktioniert beides auch im JS-freien Export.
  // `svg` ist die Ausgabe von Mermaid oder bpmn-js, kein Autorentext.
  const ZOOM = [['fit', 'Einpassen'], ['100', '100 %'], ['150', '150 %'], ['200', '200 %']];
  let figId = 0;
  function diagramFigure(svg, opts = {}) {
    const id = 'dokufix-diagramm-' + (++figId);
    const fig = document.createElement('figure');
    fig.className = 'dokufix-diagram' + (opts.kind ? ' dokufix-diagram-' + opts.kind : '');
    fig.id = id;
    fig.innerHTML =
      '<input type="checkbox" class="dokufix-zoom-toggle" id="' + id + '-gross" aria-label="Diagramm in großer Ansicht zeigen">' +
      '<div class="dokufix-zoom-bar"><strong>' + esc(opts.title || 'Diagramm') + '</strong>' +
      '<fieldset><legend>Zoom</legend>' + ZOOM.map(([v, t], i) =>
        '<label><input type="radio" name="' + id + '-zoom" value="' + v + '"' + (i ? '' : ' checked') + '> ' + t + '</label>').join('') + '</fieldset>' +
      '<label class="dokufix-zoom-close" for="' + id + '-gross">Schließen</label></div>' +
      '<div class="dokufix-viewport"><label class="dokufix-stage" for="' + id + '-gross" title="Anklicken für die große Ansicht"></label></div>' +
      '<figcaption><span>Anklicken für die große Ansicht</span></figcaption>';
    const stage = fig.querySelector('.dokufix-stage');
    stage.innerHTML = svg;
    const el = stage.querySelector('svg');
    if (el) {
      const w = el.viewBox.baseVal.width || parseFloat(el.getAttribute('width')) || 800;
      fig.style.setProperty('--w', Math.round(w) + 'px');
      el.removeAttribute('height');
      el.setAttribute('width', '100%');
      el.style.maxWidth = 'none';
    }
    const cap = fig.querySelector('figcaption');
    for (const l of opts.links || []) {
      const a = document.createElement('a');
      a.textContent = l.text;
      a.href = l.href;
      if (l.download) a.download = l.download;
      cap.append(a);
    }
    return fig;
  }

  function render(root, nav) {
    applyPragmas(root);
    callouts(root);
    chips(root);
    cards(root);
    steps(root);
    tables(root);
    if (nav) layout(root, nav);
  }

  // Ab hier Laufzeit-JavaScript. Wird im JS-freien Export nicht mitgeliefert.
  function enhance(doc) {
    doc.querySelectorAll('.dokufix-table[data-filter]').forEach(wrap => {
      if (wrap.querySelector('.dokufix-filter-ui')) return;
      const rows = [...wrap.querySelectorAll('tbody tr')];
      const ui = doc.createElement('div');
      ui.className = 'dokufix-filter-ui';
      const input = doc.createElement('input');
      input.type = 'search';
      input.placeholder = wrap.dataset.filter;
      input.setAttribute('aria-label', wrap.dataset.filter);
      input.autocomplete = 'off';
      const count = doc.createElement('span');
      count.setAttribute('aria-live', 'polite');
      ui.append(input, count);
      wrap.prepend(ui);
      const update = () => {
        const q = input.value.trim().toLowerCase();
        rows.forEach(r => { r.hidden = !!q && !r.textContent.toLowerCase().includes(q); });
        const shown = rows.filter(r => r.getClientRects().length > 0).length;
        count.textContent = shown === rows.length ? rows.length + ' Zeilen' : shown + ' von ' + rows.length + ' Zeilen';
      };
      input.addEventListener('input', update);
      wrap.addEventListener('change', update);
      update();
    });

    // Große Diagrammansicht: Esc schließt, + und − wechseln die Zoomstufe. Ohne JS bleiben Maus und Tab.
    if (!doc.documentElement.dataset.dokufixZoomKeys) {
      doc.documentElement.dataset.dokufixZoomKeys = '1';
      doc.addEventListener('keydown', e => {
        const open = doc.querySelector('.dokufix-zoom-toggle:checked');
        if (!open) return;
        const changed = el => el.dispatchEvent(new Event('change', { bubbles: true }));
        if (e.key === 'Escape') { open.checked = false; changed(open); open.focus(); return; }
        if (e.key !== '+' && e.key !== '-') return;
        const radios = [...open.parentElement.querySelectorAll('.dokufix-zoom-bar input[type="radio"]')];
        const i = radios.findIndex(r => r.checked);
        const next = radios[Math.min(radios.length - 1, Math.max(0, i + (e.key === '+' ? 1 : -1)))];
        if (next && !next.checked) { next.checked = true; changed(next); }
      });
    }

    const links = [...doc.querySelectorAll('.dokufix-nav > a[href^="#"]')];
    const heads = links.map(a => doc.getElementById(decodeURIComponent(a.hash.slice(1))));
    if (links.length) {
      const spy = () => {
        const line = innerHeight * 0.25;
        let active = 0;
        heads.forEach((h, i) => { if (h && h.getBoundingClientRect().top <= line) active = i; });
        links.forEach((a, i) => {
          a.classList.toggle('on', i === active);
          if (i === active) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
        });
      };
      addEventListener('scroll', spy, { passive: true });
      spy();
    }
  }

  return { render, enhance, slugify, diagramFigure, warnung };
})();
