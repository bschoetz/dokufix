// Spike: BPMN 2.0 im Dokument. Zwei Eingänge, ein Ausgang:
//   fromXml()      BPMN-XML mit Koordinaten (aus einem Modeler)            ─┐
//   fromMermaid()  Mermaid-Swimlane-Text → Modell → Mermaids Layout → XML  ─┴→ bpmn-js → statisches SVG
// Im Dokument bleibt ein SVG, das ohne JavaScript auskommt. enhance() ersetzt es in der großen Ansicht
// durch den Viewer selbst, wenn bpmn-js in der Seite geladen ist.
// Braucht die Globals `mermaid` und `BpmnJS` (bpmn-js Viewer).
const DokufixBpmn = (() => {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const TAG = { start: 'startEvent', end: 'endEvent', inter: 'intermediateThrowEvent', gateway: 'exclusiveGateway', task: 'task' };
  // Die Mermaid-Form legt die Grundart fest, ein Zeichen am Textanfang die genaue BPMN-Art (wie beim Status-Chip).
  // Reines Mermaid zeigt das Zeichen als Text im Knoten: `{+}` ist dort eine Raute mit Plus, `((✉ …))` ein Kreis mit Umschlag.
  const MARKER = /^(✉|📧|📨|📩|📥|📤|⏱|⏲|⏰|⏳|⌛|👤|⚙|✋)\uFE0F?\s*/u;
  const KIND = { '✉': 'message', '📧': 'message', '📨': 'receive', '📩': 'receive', '📥': 'receive', '📤': 'send', '⏱': 'timer', '⏲': 'timer', '⏰': 'timer', '⏳': 'timer', '⌛': 'timer', '👤': 'user', '⚙': 'service', '✋': 'manual' };
  const TASK = { message: 'sendTask', send: 'sendTask', receive: 'receiveTask', user: 'userTask', service: 'serviceTask', manual: 'manualTask' };
  const GATEWAY = { '+': 'parallelGateway', 'o': 'inclusiveGateway', 'O': 'inclusiveGateway' };
  // Grundart + Zeichen → BPMN-Element und Ereignisdefinition. null: Das Zeichen passt nicht zur Form, dann bleibt es im Namen stehen.
  function refine(type, kind) {
    const message = kind === 'message' || kind === 'send' || kind === 'receive';
    if (type === 'task') return TASK[kind] ? { tag: TASK[kind] } : null;
    if (type === 'start') return message ? { tag: 'startEvent', def: 'message' } : kind === 'timer' ? { tag: 'startEvent', def: 'timer' } : null;
    if (type === 'end') return message ? { tag: 'endEvent', def: 'message' } : null;
    if (type === 'inter') return kind === 'send' ? { tag: 'intermediateThrowEvent', def: 'message' } : message ? { tag: 'intermediateCatchEvent', def: 'message' } : kind === 'timer' ? { tag: 'intermediateCatchEvent', def: 'timer' } : null;
    return null;
  }
  const HEAD = 30;                       // Breite des Pool-Kopfs in bpmn-js
  const R = n => Math.round(n);
  let seq = 0;

  function offscreen() {
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-99999px;top:0;width:4000px;height:3000px';
    document.body.append(host);
    return host;
  }

  // Mermaid-Quelltext → Modell. Nutzt Mermaids eigenen Parser, kein zweiter Parser.
  async function parseMermaid(src, name) {
    const diagram = await mermaid.mermaidAPI.getDiagramFromText(src);
    const db = diagram.db;
    const ta = document.createElement('textarea');
    const text = t => { ta.innerHTML = String(t || '').replace(/<br\s*\/?>/gi, ' '); return ta.value.replace(/\s+/g, ' ').trim(); };
    const vertices = [...db.getVertices().values()];
    const edges = db.getEdges();
    const subs = db.getSubGraphs();
    // XML-ids: eigener Namensraum, damit Mermaid-ids wie „1“ oder „Process_1“ nichts kaputt machen
    const xmlId = new Map();
    vertices.forEach((v, i) => xmlId.set(v.id, 'N' + (i + 1) + '_' + String(v.id).replace(/[^A-Za-z0-9_]/g, '_')));
    const hasIn = new Set(edges.map(e => e.end)), hasOut = new Set(edges.map(e => e.start));
    const typeOf = v => {
      if (v.type === 'doublecircle') return 'end';
      if (v.type === 'circle') return !hasIn.has(v.id) ? 'start' : !hasOut.has(v.id) ? 'end' : 'inter';
      if (v.type === 'diamond') return 'gateway';
      return 'task';
    };
    const nodes = vertices.map(v => {
      const type = typeOf(v), full = text(v.text), call = v.type === 'subroutine', m = !call && MARKER.exec(full);
      const r = type === 'gateway' ? (GATEWAY[full] ? { tag: GATEWAY[full] } : null) : m ? refine(type, KIND[m[1]]) : null;
      const name = !r ? full : type === 'gateway' ? '' : full.slice(m[0].length);
      return { id: xmlId.get(v.id), src: v.id, name, type, tag: r ? r.tag : call ? 'callActivity' : TAG[type], def: r && r.def || null, classes: v.classes || [] };
    });
    const flows = edges.filter(e => xmlId.has(e.start) && xmlId.has(e.end)).map((e, i) => ({
      id: 'F' + (i + 1), from: xmlId.get(e.start), to: xmlId.get(e.end), srcFrom: e.start, srcTo: e.end, srcId: e.id, name: text(e.text), dotted: e.stroke === 'dotted'
    }));
    const lanes = subs.map((s, i) => ({ id: 'L' + (i + 1), src: s.id, name: text(s.title), nodes: s.nodes.filter(n => xmlId.has(n)).map(n => xmlId.get(n)) }));
    if (!lanes.length) throw new Error('Kein subgraph gefunden. Jede Bahn ist ein subgraph.');
    if (subs.some(s => s.nodes.some(n => subs.some(o => o.id === n)))) throw new Error('Verschachtelte subgraphs lassen sich nicht als Bahnen abbilden.');
    const dir = String(db.getDirection ? db.getDirection() : 'TB').trim().toUpperCase();
    return { name: name || (db.getAccTitle && db.getAccTitle()) || '', vertical: dir !== 'LR' && dir !== 'RL', nodes, flows, lanes };
  }

  // Ein Kantenende an das BPMN-Symbol heranführen. Kreis und Raute werden auf ihrer Mittelachse getroffen,
  // eine Aufgabe irgendwo auf ihrer Kante.
  function attach(pts, atStart, c, side) {
    const i = atStart ? 0 : pts.length - 1, j = atStart ? 1 : pts.length - 2, k = atStart ? 2 : pts.length - 3;
    const p = pts[i], q = pts[j];
    const ins = (...extra) => pts.splice(atStart ? 1 : pts.length - 1, 0, ...(atStart ? extra : extra.reverse()));
    const aim = (v, mid, half) => c.task ? Math.min(mid + half - 12, Math.max(mid - half + 12, v)) : mid;
    // Läuft das Endstück NEBEN dem Symbol vorbei, dockt die Kante seitlich an (kurzer Stummel),
    // statt durch das Symbol und seine Nachbarn in derselben Spalte gezogen zu werden.
    const dock = pt => pts.splice(atStart ? 0 : pts.length, 0, pt);
    // `side` kommt aus Mermaids ungestauchten Koordinaten: dort lag das Endstück außerhalb des eigenen Knotens.
    if (side && side.axis === 'x') { p.x = q.x = c.cx + side.sign * (c.w / 2 + 12); p.y = c.cy; dock({ x: c.cx + side.sign * c.w / 2, y: c.cy }); return; }
    if (side && side.axis === 'y') { p.y = q.y = c.cy + side.sign * (c.h / 2 + 12); p.x = c.cx; dock({ x: c.cx, y: c.cy + side.sign * c.h / 2 }); return; }
    if (Math.abs(p.x - q.x) < 1 && Math.abs(p.x - c.cx) > c.w / 2 + 0.5) { p.y = c.cy; dock({ x: c.cx + Math.sign(p.x - c.cx) * c.w / 2, y: c.cy }); return; }
    if (Math.abs(p.y - q.y) < 1 && Math.abs(p.y - c.cy) > c.h / 2 + 0.5) { p.x = c.cx; dock({ x: c.cx, y: c.cy + Math.sign(p.y - c.cy) * c.h / 2 }); return; }
    if (Math.abs(p.x - q.x) < 1) {                               // senkrechtes Endstück
      const dir = Math.sign(q.y - c.cy) || 1, tx = aim(p.x, c.cx, c.w / 2);
      if (Math.abs(p.x - tx) > 1) {
        if (pts[k] && Math.abs(pts[k].y - q.y) < 1) q.x = tx;    // Nachbarstück liegt quer: Endstück verschieben
        else { const my = (p.y + q.y) / 2; ins({ x: tx, y: my }, { x: q.x, y: my }); }
      }
      p.x = tx; p.y = c.cy + dir * c.h / 2;
    } else if (Math.abs(p.y - q.y) < 1) {                        // waagerechtes Endstück
      const dir = Math.sign(q.x - c.cx) || 1, ty = aim(p.y, c.cy, c.h / 2);
      if (Math.abs(p.y - ty) > 1) {
        if (pts[k] && Math.abs(pts[k].x - q.x) < 1) q.y = ty;
        else { const mx = (p.x + q.x) / 2; ins({ x: mx, y: ty }, { x: mx, y: q.y }); }
      }
      p.y = ty; p.x = c.cx + dir * c.w / 2;
    }
  }

  // Mermaid entscheidet die Anordnung, Dokufix die Maße: Mermaids Knoten sind groß (Text im Kreis, breite Kästen),
  // BPMN-Symbole sind klein. Die Achse wird stückweise linear gestaucht: jede Spalte auf die Breite ihres größten
  // BPMN-Symbols, jede Lücke auf ein festes Maß. Reihenfolgen bleiben erhalten, rechte Winkel auch.
  function axisMap(items, minGap, maxGap) {
    const ranks = [];
    for (const it of [...items].sort((a, b) => a.lo - b.lo)) {
      const last = ranks[ranks.length - 1];
      if (last && it.lo < last.hi - 1) { last.hi = Math.max(last.hi, it.hi); last.size = Math.max(last.size, it.size); }
      else ranks.push({ lo: it.lo, hi: it.hi, size: it.size });
    }
    let cur = ranks[0].lo;
    ranks.forEach((r, i) => {
      r.nlo = cur; r.nhi = cur + r.size;
      const next = ranks[i + 1];
      if (next) cur = r.nhi + Math.min(maxGap, Math.max(minGap, (next.lo - r.hi) * 0.6));
    });
    return v => {
      const first = ranks[0], last = ranks[ranks.length - 1];
      if (v <= first.lo) return first.nlo - (first.lo - v);
      if (v >= last.hi) return last.nhi + (v - last.hi);
      for (let i = 0; i < ranks.length; i++) {
        const r = ranks[i], n = ranks[i + 1];
        if (v <= r.hi) return r.nlo + (v - r.lo) / (r.hi - r.lo || 1) * (r.nhi - r.nlo);
        if (v < n.lo) return r.nhi + (v - r.hi) / (n.lo - r.hi) * (n.nlo - r.nhi);
      }
    };
  }
  const SIZE = { task: [120, 80], gateway: [50, 50], start: [36, 36], end: [36, 36], inter: [36, 36] };
  const EVENT_LABEL = 84;               // Platz für die Beschriftung unter einem Ereignis

  // Mermaid führt Kanten an SEINEN (größeren) Knoten vorbei. Nach dem Stauchen kann ein inneres Kantenstück
  // auf oder in einem fremden Symbol liegen. Dann rückt es neben dessen nächste Kante.
  function nudge(pts, obstacles) {
    for (let i = 1; i < pts.length - 2; i++) {
      const a = pts[i], b = pts[i + 1];
      if (Math.abs(a.x - b.x) < 1) {
        const lo = Math.min(a.y, b.y), hi = Math.max(a.y, b.y);
        for (const o of obstacles) if (a.x > o.x1 - 8 && a.x < o.x2 + 8 && hi > o.y1 && lo < o.y2) a.x = b.x = (a.x - o.x1 < o.x2 - a.x) ? o.x1 - 12 : o.x2 + 12;
      } else if (Math.abs(a.y - b.y) < 1) {
        const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
        for (const o of obstacles) if (a.y > o.y1 - 8 && a.y < o.y2 + 8 && hi > o.x1 && lo < o.x2) a.y = b.y = (a.y - o.y1 < o.y2 - a.y) ? o.y1 - 12 : o.y2 + 12;
      }
    }
  }

  // Mermaid lässt Kanten gern knapp innerhalb der Kante eines Nachbarknotens laufen. Führt ein Endstück dadurch
  // durch ein fremdes Symbol, dockt die Kante stattdessen seitlich an und läuft außen an beiden vorbei.
  function detour(pts, atStart, c, obstacles) {
    if (pts.length < 3) return;
    const p = pts[atStart ? 0 : pts.length - 1], q = pts[atStart ? 1 : pts.length - 2];
    const dock = pt => pts.splice(atStart ? 0 : pts.length, 0, pt);
    if (Math.abs(p.x - q.x) < 1) {
      const lo = Math.min(p.y, q.y), hi = Math.max(p.y, q.y);
      const hit = obstacles.filter(o => p.x > o.x1 - 2 && p.x < o.x2 + 2 && hi > o.y1 && lo < o.y2);
      if (!hit.length) return;
      const sign = p.x >= c.cx ? 1 : -1;
      const x = sign > 0 ? Math.max(c.cx + c.w / 2, ...hit.map(o => o.x2)) + 12 : Math.min(c.cx - c.w / 2, ...hit.map(o => o.x1)) - 12;
      p.x = q.x = x; p.y = c.cy; dock({ x: c.cx + sign * c.w / 2, y: c.cy });
    } else if (Math.abs(p.y - q.y) < 1) {
      const lo = Math.min(p.x, q.x), hi = Math.max(p.x, q.x);
      const hit = obstacles.filter(o => p.y > o.y1 - 2 && p.y < o.y2 + 2 && hi > o.x1 && lo < o.x2);
      if (!hit.length) return;
      const sign = p.y >= c.cy ? 1 : -1;
      const y = sign > 0 ? Math.max(c.cy + c.h / 2, ...hit.map(o => o.y2)) + 12 : Math.min(c.cy - c.h / 2, ...hit.map(o => o.y1)) - 12;
      p.y = q.y = y; p.x = c.cx; dock({ x: c.cx, y: c.cy + sign * c.h / 2 });
    }
  }

  // Mermaid versetzt Kanten, die sich einen Anschluss teilen, um wenige Pixel. Nach dem Stauchen bleiben davon Zacken
  // von 1 bis 5 px. Sie werden geglättet, ohne die Kantenenden zu bewegen. Punkte auf einer Geraden entfallen.
  function tidy(pts) {
    const same = (a, b, k) => Math.abs(a[k] - b[k]) < 0.5;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const k = same(a, b, 'y') ? 'x' : same(a, b, 'x') ? 'y' : null;      // Achse, auf der der Zacken liegt
      if (!k || Math.abs(a[k] - b[k]) > 5 || same(a, b, k)) continue;
      let hi = i + 1, lo = i;
      while (hi + 1 < pts.length && same(pts[hi + 1], b, k)) hi++;
      while (lo > 0 && same(pts[lo - 1], a, k)) lo--;
      if (hi < pts.length - 1) { const v = a[k]; for (let j = i + 1; j <= hi; j++) pts[j][k] = v; }
      else if (lo > 0) { const v = b[k]; for (let j = lo; j <= i; j++) pts[j][k] = v; }
    }
    for (let i = pts.length - 2; i > 0; i--) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1];
      if ((same(a, b, 'x') && same(b, c, 'x')) || (same(a, b, 'y') && same(b, c, 'y'))) pts.splice(i, 1);
    }
  }

  const exitSide = pts => Math.abs(pts[0].y - pts[1].y) < 0.5 ? (pts[1].x > pts[0].x ? 'x+' : 'x-') : Math.abs(pts[0].x - pts[1].x) < 0.5 ? (pts[1].y > pts[0].y ? 'y+' : 'y-') : '';
  const blocked = (a, b, obstacles) => obstacles.some(o => Math.max(a.x, b.x) > o.x1 - 2 && Math.min(a.x, b.x) < o.x2 + 2 && Math.max(a.y, b.y) > o.y1 - 2 && Math.min(a.y, b.y) < o.y2 + 2);

  // Verlassen zwei Kanten ein Gateway an derselben Ecke, liegen sie auf dem ersten Stück übereinander.
  // Biegt eine davon gleich ab, nimmt sie stattdessen die freie Ecke in ihrer Richtung.
  function fanOut(routes, box, gateways) {
    for (const id of gateways) {
      const c = box[id], outs = routes.filter(r => r.f.from === id);
      const used = new Set(outs.map(r => exitSide(r.pts)));
      routes.filter(r => r.f.to === id).forEach(r => used.add(exitSide([...r.pts].reverse())));
      for (const r of outs) {
        const pts = r.pts, side = exitSide(pts);
        if (pts.length < 3 || !side || !outs.some(o => o !== r && exitSide(o.pts) === side)) continue;
        const u = side[0], v = u === 'x' ? 'y' : 'x', cu = 'c' + u, cv = 'c' + v, sv = v === 'x' ? 'w' : 'h', su = u === 'x' ? 'w' : 'h';
        if (Math.abs(pts[1][u] - pts[2][u]) > 0.5) continue;                 // zweites Stück muss abbiegen
        const dir = Math.sign(pts[2][v] - pts[1][v]), corner = v + (dir > 0 ? '+' : '-');
        if (!dir || used.has(corner)) continue;
        const start = { [u]: c[cu], [v]: c[cv] + dir * c[sv] / 2 };
        let next;
        if (pts.length === 3) {                                              // endete von oben oder unten im Ziel: jetzt seitlich
          const t = box[r.f.to], du = Math.sign(pts[1][u] - pts[0][u]), edge = t[cu] - du * t[su] / 2;
          if ((edge - c[cu]) * du < 12) continue;
          next = [start, { [u]: c[cu], [v]: t[cv] }, { [u]: edge, [v]: t[cv] }];
        } else {
          if (Math.abs(pts[2][v] - pts[3][v]) > 0.5) continue;
          next = [start, { [u]: c[cu], [v]: pts[2][v] }, ...pts.slice(3)];
        }
        if (blocked(next[0], next[1], r.obstacles) || blocked(next[1], next[2], r.obstacles)) continue;
        pts.splice(0, pts.length, ...next);
        used.add(corner);
      }
      // Ein Abgang auf der Seite, an der eine Kante ankommt, sieht aus, als zweige er schon vor dem Gateway ab.
      // Er startet stattdessen an der Ecke in seiner Richtung und teilt dort notfalls ein kurzes Stück mit einem anderen Abgang.
      const arriving = new Set(routes.filter(r => r.f.to === id).map(r => exitSide([...r.pts].reverse())));
      for (const r of outs) {
        const pts = r.pts, side = exitSide(pts);
        if (pts.length < 4 || !side || !arriving.has(side)) continue;
        const u = side[0], v = u === 'x' ? 'y' : 'x', cu = 'c' + u, cv = 'c' + v, sv = v === 'x' ? 'w' : 'h';
        if (Math.abs(pts[1][u] - pts[2][u]) > 0.5) continue;
        const dir = Math.sign(pts[2][v] - pts[1][v]);
        const start = { [u]: c[cu], [v]: c[cv] + dir * c[sv] / 2 }, stem = start[v] + dir * 14;
        if (!dir || (pts[2][v] - stem) * dir <= 0) continue;
        const next = [start, { [u]: c[cu], [v]: stem }, { [u]: pts[1][u], [v]: stem }];
        if (blocked(next[0], next[1], r.obstacles) || blocked(next[1], next[2], r.obstacles) || blocked(next[2], pts[2], r.obstacles)) continue;
        pts.splice(0, 2, ...next);
      }
    }
  }

  // Trifft an derselben Seite einer Aufgabe ein eingehender auf einen ausgehenden Pfeil, sieht das aus wie ein Doppelpfeil.
  // Der verschiebbare von beiden rückt zur Seite.
  function spreadPorts(routes, box) {
    const ends = [];
    for (const r of routes) for (const atStart of [true, false]) {
      const c = box[atStart ? r.f.from : r.f.to];
      if (!c.task) continue;
      const pts = r.pts, p = pts[atStart ? 0 : pts.length - 1], q = pts[atStart ? 1 : pts.length - 2];
      const vertical = Math.abs(p.x - q.x) < 1;
      if (!vertical && Math.abs(p.y - q.y) >= 1) continue;
      ends.push({ p, q, c, vertical, out: atStart, side: (vertical ? (p.y < c.cy ? 'oben' : 'unten') : (p.x < c.cx ? 'links' : 'rechts')), movable: pts.length >= 3 });
    }
    for (const a of ends) for (const b of ends) {
      if (a === b || a.c !== b.c || a.side !== b.side || a.out === b.out) continue;
      const va = a.vertical ? a.p.x : a.p.y, vb = b.vertical ? b.p.x : b.p.y;
      if (Math.abs(va - vb) >= 14) continue;
      const m = a.movable ? a : b.movable ? b : null;
      if (!m) continue;
      const other = m === a ? vb : va, mid = m.vertical ? m.c.cx : m.c.cy, half = (m.vertical ? m.c.w : m.c.h) / 2 - 10;
      let v = other + (other <= mid ? 18 : -18);
      v = Math.min(mid + half, Math.max(mid - half, v));
      if (m.vertical) m.p.x = m.q.x = v; else m.p.y = m.q.y = v;
    }
  }

  // Beschriftung einer Kante: hinter einem Gateway direkt am Abgang („ja“, „nein“), sonst mittig am längsten Stück.
  function flowLabel(pts, text, atGateway) {
    const w = Math.max(24, Math.round(text.length * 6.2) + 8);
    let a = pts[0], b = pts[1];
    if (!atGateway) {
      let best = -1;
      for (let i = 0; i < pts.length - 1; i++) {
        const len = Math.abs(pts[i].x - pts[i + 1].x) + Math.abs(pts[i].y - pts[i + 1].y);
        if (len > best) { best = len; a = pts[i]; b = pts[i + 1]; }
      }
    }
    if (Math.abs(a.y - b.y) < 1) {                                   // waagerecht: darüber
      const dir = Math.sign(b.x - a.x) || 1;
      const x = atGateway ? (dir > 0 ? a.x + 10 : a.x - 10 - w) : (a.x + b.x) / 2 - w / 2;
      return [R(x), R(a.y - 18), w, 14];
    }
    const dir = Math.sign(b.y - a.y) || 1;                           // senkrecht: rechts daneben
    const y = atGateway ? (dir > 0 ? a.y + 8 : a.y - 22) : (a.y + b.y) / 2 - 7;
    return [R(a.x + 6), R(y), w, 14];
  }

  // Mermaids Swimlane-Layout als Koordinatenquelle für das BPMN-DI.
  async function layoutFromMermaid(src, model) {
    const host = offscreen();
    try {
      const { svg } = await mermaid.render('dokufix-bpmn-layout-' + (++seq), src);
      host.innerHTML = svg;
      const root = host.querySelector('svg');
      const gNodes = [...root.querySelectorAll('g.node')];
      const raw = {};
      for (const n of model.nodes) {
        const g = gNodes.find(e => e.dataset.id === n.src) || gNodes.find(e => e.id.includes('-flowchart-' + n.src + '-'));
        if (!g) throw new Error('Knoten nicht gefunden: ' + n.src);
        const m = /translate\(\s*([-\d.eE]+)[ ,]+([-\d.eE]+)\s*\)/.exec(g.getAttribute('transform') || '');
        if (!m) throw new Error('Knoten ohne Position: ' + n.src);
        const bb = g.getBBox();
        const isEvent = n.type === 'start' || n.type === 'end' || n.type === 'inter';
        raw[n.id] = { cx: +m[1], cy: +m[2], w: bb.width, h: bb.height, size: SIZE[n.type], reserveX: isEvent && !model.vertical ? EVENT_LABEL : SIZE[n.type][0] };
      }
      const all = Object.values(raw);
      const mapX = axisMap(all.map(r => ({ lo: r.cx - r.w / 2, hi: r.cx + r.w / 2, size: r.reserveX })), 36, 70);
      const mapY = axisMap(all.map(r => ({ lo: r.cy - r.h / 2, hi: r.cy + r.h / 2, size: r.size[1] })), 36, 70);

      const di = { lanes: {}, nodes: {}, labels: {}, flows: {}, flowLabels: {} };
      const box = {};
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      for (const l of model.lanes) {
        const g = [...root.querySelectorAll('g.cluster.swimlane')].find(e => e.dataset.id === l.src);
        if (!g) throw new Error('Bahn nicht gefunden: ' + l.src);
        const rects = [...g.querySelectorAll('rect.swimlane-body, rect.swimlane-title')].map(r => r.getBBox());
        const a = mapX(Math.min(...rects.map(r => r.x))), b = mapY(Math.min(...rects.map(r => r.y)));
        const c = mapX(Math.max(...rects.map(r => r.x + r.width))), d = mapY(Math.max(...rects.map(r => r.y + r.height)));
        di.lanes[l.id] = [R(a), R(b), R(c - a), R(d - b)];
        x1 = Math.min(x1, a); y1 = Math.min(y1, b); x2 = Math.max(x2, c); y2 = Math.max(y2, d);
      }
      di.pool = model.vertical ? [R(x1), R(y1 - HEAD), R(x2 - x1), R(y2 - y1 + HEAD)] : [R(x1 - HEAD), R(y1), R(x2 - x1 + HEAD), R(y2 - y1)];
      for (const n of model.nodes) {
        const r = raw[n.id], cx = mapX(r.cx), cy = mapY(r.cy), [w, h] = r.size;
        di.nodes[n.id] = [R(cx - w / 2), R(cy - h / 2), w, h];
        box[n.id] = { cx, cy, w, h, task: n.type === 'task' };
        // Beschriftung dorthin, wo keine Kante entlangläuft: quer über dem Gateway, hochkant rechts daneben
        if (n.type === 'gateway') { if (n.name) di.labels[n.id] = model.vertical ? [R(cx + 30), R(cy - 46), 96, 28] : [R(cx - 48), R(cy - 56), 96, 28]; }
        else if (n.type !== 'task' && model.vertical) {
          const lane = model.lanes.find(l => l.nodes.includes(n.id));
          const room = lane ? di.lanes[lane.id][0] + di.lanes[lane.id][2] - (cx + 26) - 6 : EVENT_LABEL;
          di.labels[n.id] = [R(cx + 26), R(cy - 21), Math.max(40, Math.min(EVENT_LABEL, R(room))), 42];
        }
      }
      const paths = [...root.querySelectorAll('path[data-edge="true"]')];
      const taken = new Set();
      const routes = [];
      for (const f of model.flows) {
        const path = paths.find(e => !taken.has(e) && e.dataset.id === f.srcId) ||
          paths.find(e => !taken.has(e) && (e.dataset.id || '').startsWith('L_' + f.srcFrom + '_' + f.srcTo + '_'));
        if (!path) throw new Error('Kante nicht gefunden: ' + f.srcFrom + ' → ' + f.srcTo);
        taken.add(path);
        const orig = JSON.parse(atob(path.dataset.points));
        if (orig.length < 2) throw new Error('Kante ohne Verlauf: ' + f.srcFrom + ' → ' + f.srcTo);
        const beside = (o, o2, r) =>
          Math.abs(o.x - o2.x) < 1 && Math.abs(o.x - r.cx) > r.w / 2 + 0.5 ? { axis: 'x', sign: Math.sign(o.x - r.cx) } :
          Math.abs(o.y - o2.y) < 1 && Math.abs(o.y - r.cy) > r.h / 2 + 0.5 ? { axis: 'y', sign: Math.sign(o.y - r.cy) } : null;
        const sideFrom = beside(orig[0], orig[1], raw[f.from]), sideTo = beside(orig[orig.length - 1], orig[orig.length - 2], raw[f.to]);
        const pts = orig.map(p => ({ x: mapX(p.x), y: mapY(p.y) }));
        attach(pts, true, box[f.from], sideFrom);
        attach(pts, false, box[f.to], sideTo);
        const obstacles = model.nodes.filter(n => n.id !== f.from && n.id !== f.to).map(n => {
          const c = box[n.id];
          return { x1: c.cx - c.w / 2, x2: c.cx + c.w / 2, y1: c.cy - c.h / 2, y2: c.cy + c.h / 2 };
        });
        detour(pts, true, box[f.from], obstacles);
        detour(pts, false, box[f.to], obstacles);
        nudge(pts, obstacles);
        tidy(pts);
        routes.push({ f, pts, obstacles });
      }
      const gateways = new Set(model.nodes.filter(n => n.type === 'gateway').map(n => n.id));
      fanOut(routes, box, gateways);
      spreadPorts(routes, box);
      for (const { f, pts } of routes) {
        di.flows[f.id] = pts.map(p => [R(p.x), R(p.y)]);
        // Teilen sich zwei Abgänge eine Ecke des Gateways, stünden ihre Beschriftungen dort übereinander.
        const alone = !routes.some(o => o.f !== f && o.f.from === f.from && exitSide(o.pts) === exitSide(pts));
        if (f.name) di.flowLabels[f.id] = flowLabel(pts, f.name, gateways.has(f.from) && alone);
      }
      return di;
    } finally { host.remove(); }
  }

  function toXml(model, di) {
    const inc = {}, out = {};
    model.flows.forEach(f => { (out[f.from] ||= []).push(f.id); (inc[f.to] ||= []).push(f.id); });
    let x = '<?xml version="1.0" encoding="UTF-8"?>\n<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn" exporter="dokufix-spike">\n';
    x += '  <bpmn:collaboration id="Collaboration_1">\n    <bpmn:participant id="Participant_1" name="' + esc(model.name) + '" processRef="Process_1"/>\n  </bpmn:collaboration>\n';
    x += '  <bpmn:process id="Process_1" isExecutable="false">\n    <bpmn:laneSet id="LaneSet_1">\n';
    model.lanes.forEach(l => { x += '      <bpmn:lane id="' + l.id + '" name="' + esc(l.name) + '">' + l.nodes.map(n => '<bpmn:flowNodeRef>' + n + '</bpmn:flowNodeRef>').join('') + '</bpmn:lane>\n'; });
    x += '    </bpmn:laneSet>\n';
    const tagOf = n => n.tag || TAG[n.type];        // tag: genaue BPMN-Art, sonst die Grundart
    model.nodes.forEach(n => {
      x += '    <bpmn:' + tagOf(n) + ' id="' + n.id + '"' + (n.name ? ' name="' + esc(n.name) + '"' : '') + '>' +
        (inc[n.id] || []).map(f => '<bpmn:incoming>' + f + '</bpmn:incoming>').join('') +
        (out[n.id] || []).map(f => '<bpmn:outgoing>' + f + '</bpmn:outgoing>').join('') +
        (n.def ? '<bpmn:' + n.def + 'EventDefinition id="' + n.id + '_def"/>' : '') + '</bpmn:' + tagOf(n) + '>\n';
    });
    model.flows.forEach(f => { x += '    <bpmn:sequenceFlow id="' + f.id + '" sourceRef="' + f.from + '" targetRef="' + f.to + '"' + (f.name ? ' name="' + esc(f.name) + '"' : '') + '/>\n'; });
    return x + '  </bpmn:process>\n' + diXml(model, di, 'Collaboration_1', 'Participant_1') + '</bpmn:definitions>\n';
  }

  // Die Koordinaten (BPMN-DI) zu einem Modell. plane: Collaboration oder Prozess, pool: Participant oder leer.
  function diXml(model, di, plane, pool, ns = '') {
    const b = r => '<dc:Bounds x="' + r[0] + '" y="' + r[1] + '" width="' + r[2] + '" height="' + r[3] + '"/>';
    const hz = ' isHorizontal="' + (model.vertical ? 'false' : 'true') + '"';
    let x = '  <bpmndi:BPMNDiagram' + ns + ' id="Diagram_1">\n    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="' + plane + '">\n';
    for (const [id, r] of Object.entries(di.pools || (pool ? { [pool]: di.pool } : {}))) x += '      <bpmndi:BPMNShape id="' + id + '_di" bpmnElement="' + id + '"' + hz + '>' + b(r) + '</bpmndi:BPMNShape>\n';
    model.lanes.forEach(l => { if (!l.synthetic) x += '      <bpmndi:BPMNShape id="' + l.id + '_di" bpmnElement="' + l.id + '"' + hz + '>' + b(di.lanes[l.id]) + '</bpmndi:BPMNShape>\n'; });
    model.nodes.forEach(n => {
      x += '      <bpmndi:BPMNShape id="' + n.id + '_di" bpmnElement="' + n.id + '"' + ((n.tag || TAG[n.type]) === 'exclusiveGateway' ? ' isMarkerVisible="true"' : '') + '>' + b(di.nodes[n.id]) +
        (di.labels[n.id] ? '<bpmndi:BPMNLabel>' + b(di.labels[n.id]) + '</bpmndi:BPMNLabel>' : '') + '</bpmndi:BPMNShape>\n';
    });
    model.flows.forEach(f => {
      x += '      <bpmndi:BPMNEdge id="' + f.id + '_di" bpmnElement="' + f.id + '">' + di.flows[f.id].map(p => '<di:waypoint x="' + p[0] + '" y="' + p[1] + '"/>').join('') +
        (di.flowLabels && di.flowLabels[f.id] ? '<bpmndi:BPMNLabel>' + b(di.flowLabels[f.id]) + '</bpmndi:BPMNLabel>' : '') + '</bpmndi:BPMNEdge>\n';
    });
    return x + '    </bpmndi:BPMNPlane>\n  </bpmndi:BPMNDiagram>\n';
  }

  // BPMN-XML ohne Koordinaten: Die Anordnung kommt wie bei fromMermaid() aus Mermaids Swimlane-Layout.
  // Das XML wird dazu gelesen (Bahnen, Knoten, Sequenzflüsse), als Mermaid-Text nachgebaut und angeordnet.
  // Das Original bleibt, wie es ist. Es bekommt nur den Koordinatenteil angehängt.
  async function layoutXml(xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('Das XML ist nicht lesbar.');
    const all = (name, root = doc) => [...root.getElementsByTagNameNS('*', name)];
    const processes = all('process'), participants = all('participant'), collab = all('collaboration')[0] || null;
    if (!processes.length) throw new Error('Das XML enthält keinen Prozess.');
    if (processes.length > 1 && !participants.length) throw new Error('Mehrere Prozesse brauchen eine Collaboration mit je einem Participant.');
    // Ein Pool je Participant, in der Reihenfolge des XML. Ohne Collaboration gibt es nur den Prozess, ohne Pool.
    const pools = participants.length
      ? participants.map(el => ({ key: el.id, el, name: el.getAttribute('name') || '', proc: processes.find(pr => pr.id === el.getAttribute('processRef')) }))
      : [{ key: processes[0].id, el: null, name: '', proc: processes[0] }];
    if (pools.some(pl => !pl.proc)) throw new Error('Ein Pool ohne eigenen Prozess lässt sich ohne Koordinaten nicht anordnen.');
    const type = el => {
      const t = el.localName;
      return t === 'startEvent' ? 'start' : t === 'endEvent' ? 'end' : /Event$/.test(t) ? 'inter' : /Gateway$/.test(t) ? 'gateway' :
        /^(task|\w+Task|callActivity|subProcess|transaction)$/.test(t) ? 'task' : null;
    };
    const clean = t => (t || '').replace(/\s+/g, ' ').trim();
    const nodes = [], lanes = [];
    for (const pl of pools) {
      const mine = [...pl.proc.children].filter(el => type(el) && el.id).map(el => ({ id: el.id, src: 'n' + (nodes.length + 1), name: clean(el.getAttribute('name')), type: type(el), tag: el.localName, classes: [] }));
      mine.forEach((n, i) => { n.src = 'n' + (nodes.length + i + 1); });
      const ids = new Set(mine.map(n => n.id));
      const own = all('lane', pl.proc).map(el => ({ id: el.id, name: el.getAttribute('name') || '', pool: pl.key, nodes: [...el.children].filter(c => c.localName === 'flowNodeRef').map(c => c.textContent.trim()).filter(id => ids.has(id)) }));
      const placed = new Set(own.flatMap(l => l.nodes)), stray = mine.filter(n => !placed.has(n.id));
      if (!own.length) own.push({ id: '__' + pl.key, name: pl.name, pool: pl.key, nodes: mine.map(n => n.id), synthetic: true });   // Pool ohne Bahnen
      else if (stray.length) throw new Error('Ohne Bahn: ' + stray.map(n => n.id).join(', ') + '. Jedes Element braucht ein flowNodeRef in einer Bahn.');
      nodes.push(...mine); lanes.push(...own);
    }
    if (!nodes.length) throw new Error('Das XML enthält kein darstellbares Element.');
    lanes.forEach((l, i) => { l.src = 'l' + (i + 1); });
    const byId = new Map(nodes.map(n => [n.id, n]));
    // Sequenzflüsse aller Prozesse, dazu Nachrichtenflüsse zwischen den Pools. Für die Anordnung sind beides Kanten.
    const flowEls = [...pools.flatMap(pl => [...pl.proc.children].filter(el => el.localName === 'sequenceFlow')), ...(collab ? [...collab.children].filter(el => el.localName === 'messageFlow') : [])];
    const flows = [];
    for (const el of flowEls) {
      const from = byId.get(el.getAttribute('sourceRef')), to = byId.get(el.getAttribute('targetRef')), message = el.localName === 'messageFlow';
      if (message && !(from && to)) throw new Error('Nachrichtenfluss ' + el.id + ' muss zwei Elemente verbinden, nicht einen ganzen Pool.');
      if (from && to) flows.push({ id: el.id, from: from.id, to: to.id, srcFrom: from.src, srcTo: to.src, name: clean(el.getAttribute('name')), message });
    }
    const model = { name: pools[0].name, vertical: false, nodes, flows, lanes };
    const q = t => '"' + (String(t).replace(/["<>&#]/g, ' ').trim() || ' ') + '"';
    const shape = n => n.src + (n.type === 'task' ? '[' + q(n.name) + ']' : n.type === 'gateway' ? '{' + q(n.name || '+') + '}' : '((' + q(n.name) + '))');
    const src = 'swimlane-beta LR\n' + lanes.map(l => '  subgraph ' + l.src + '[' + q(l.name) + ']\n' + l.nodes.map(id => '    ' + shape(byId.get(id)) + '\n').join('') + '  end\n').join('') +
      flows.map(f => '  ' + f.srcFrom + (f.message ? ' -.->' : ' -->') + (f.name ? '|' + q(f.name) + '|' : '') + ' ' + f.srcTo + '\n').join('');
    const di = await layoutFromMermaid(src, model);
    if (participants.length) spreadPools(di, model, pools);
    const ns = ' xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI"';
    const close = /<\/(?:[\w.-]+:)?definitions>\s*$/.exec(xml);
    if (!close) throw new Error('Das XML endet nicht mit </definitions>.');
    const plane = collab ? collab.id : pools[0].proc.id;
    if (!plane) throw new Error('Prozess oder Collaboration ohne id.');
    return xml.slice(0, close.index) + diXml(model, di, plane, '', ns) + close[0];
  }

  // Mermaid kennt nur Bahnen. Die Bahnen eines Pools liegen dort direkt untereinander, die Pools also auch.
  // Jeder Pool bekommt hier seinen eigenen Rahmen, zwischen zwei Pools kommt ein Abstand: Alles darunter rückt nach unten,
  // Kanten über die Grenze werden entsprechend länger.
  function spreadPools(di, model, pools) {
    const GAP = 40;
    const frames = pools.map(pl => {
      const rects = model.lanes.filter(l => l.pool === pl.key).map(l => di.lanes[l.id]);
      return { key: pl.key, x1: Math.min(...rects.map(r => r[0])), x2: Math.max(...rects.map(r => r[0] + r[2])), y1: Math.min(...rects.map(r => r[1])), y2: Math.max(...rects.map(r => r[1] + r[3])) };
    }).sort((a, b) => a.y1 - b.y1);
    for (let i = 1; i < frames.length; i++) if (frames[i].y1 < frames[i - 1].y2 - 1) throw new Error('Die Bahnen eines Pools liegen nicht zusammen.');
    const cuts = frames.slice(1).map(f => f.y1);
    const dy = y => GAP * cuts.filter(c => y >= c - 0.5).length;
    for (const l of model.lanes) di.lanes[l.id][1] += dy(di.lanes[l.id][1]);
    for (const n of model.nodes) { const d = dy(di.nodes[n.id][1]); di.nodes[n.id][1] += d; if (di.labels[n.id]) di.labels[n.id][1] += d; }
    const frameOf = id => frames.find(fr => fr.key === model.lanes.find(l => l.nodes.includes(id)).pool);
    for (const f of model.flows) {
      if (f.message) di.flows[f.id].forEach(p => { p[1] += dy(p[1]); });
      else {
        // Ein Sequenzfluss gehört ganz zu seinem Pool. Mermaid führt ihn manchmal genau auf dessen Rand entlang:
        // Dort rückt er nach innen, sonst läge er nach dem Auseinanderziehen im Zwischenraum oder auf dem Rahmen.
        const fr = frameOf(f.from), d = dy(fr.y1);
        di.flows[f.id].forEach(p => { p[1] = Math.min(fr.y2 - 9, Math.max(fr.y1 + 9, p[1])) + d; });
      }
      if (di.flowLabels[f.id]) di.flowLabels[f.id][1] += dy(di.flowLabels[f.id][1] + 7);
    }
    di.pools = Object.fromEntries(frames.map(f => [f.key, [R(f.x1 - HEAD), R(f.y1 + dy(f.y1)), R(f.x2 - f.x1 + HEAD), R(f.y2 - f.y1)]]));

    // Mermaid führt jede Kante von der Seite ins Ziel. Ein Nachrichtenfluss läge dann auf dem Sequenzfluss, der dort ankommt.
    // Er dockt stattdessen von der Seite an, aus der er kommt: von unten oder oben, auf der Mittelachse des Ziels.
    const rectOf = id => { const b = di.nodes[id]; return { x1: b[0], y1: b[1], x2: b[0] + b[2], y2: b[1] + b[3] }; };
    let channel = 0;
    for (const f of model.flows.filter(f => f.message)) {
      const pts = di.flows[f.id], n = pts.length;
      if (n < 3 || Math.abs(pts[n - 1][1] - pts[n - 2][1]) > 0.5 || Math.abs(pts[n - 2][0] - pts[n - 3][0]) > 0.5) continue;
      const t = di.nodes[f.to], tx = R(t[0] + t[2] / 2), below = pts[n - 3][1] > t[1] + t[3] / 2, end = [tx, below ? t[1] + t[3] : t[1]];
      let next;
      if (n === 3) {                                        // kam ohne Umweg: Der Querweg läuft im Abstand zwischen den Pools
        const pool = di.pools[model.lanes.find(l => l.nodes.includes(f.to)).pool];
        const y = (below ? pool[1] + pool[3] + GAP / 2 : pool[1] - GAP / 2) + (channel++ % 3 - 1) * 10;
        next = [pts[0], [pts[0][0], y], [tx, y], end];
      } else {
        if (Math.abs(pts[n - 4][1] - pts[n - 3][1]) > 0.5) continue;
        next = [...pts.slice(0, n - 3), [tx, pts[n - 3][1]], end];
      }
      const obstacles = model.nodes.filter(o => o.id !== f.from && o.id !== f.to).map(o => rectOf(o.id));
      const P = q => ({ x: q[0], y: q[1] });
      if (next.slice(1).some((q, i) => blocked(P(next[i]), P(q), obstacles))) continue;
      di.flows[f.id] = next;
      if (f.name) di.flowLabels[f.id] = flowLabel(next.map(P), f.name, false);
      const node = model.nodes.find(o => o.id === f.to);
      if (below && node.type !== 'task' && node.name) di.labels[f.to] = [tx - 45, t[1] - 34, 90, 28];   // Beschriftung nach oben, unten kommt die Kante an
    }
  }

  // Farben sind CSS-Variablen der Seite: Bild und Viewer folgen dem Farbschema ohne neues Rendern.
  const VIEWER = {
    bpmnRenderer: { defaultFillColor: 'var(--surface)', defaultStrokeColor: 'var(--ink-soft)', defaultLabelColor: 'var(--ink)' },
    textRenderer: { defaultStyle: { fontFamily: '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif', fontSize: 12 }, externalStyle: { fontSize: 11 } }
  };

  // Öffnet das XML in einem bpmn-js-Viewer im Container. Jedes Element bekommt eine Klasse nach seiner Art.
  // marks: { elementId: ['klasse', …] } für Dinge, die BPMN nicht kennt (geplant, gestrichelt).
  async function mount(container, xml, marks = {}) {
    const viewer = new BpmnJS({ container, ...VIEWER });
    try {
      const { warnings } = await viewer.importXML(xml);
      const reg = viewer.get('elementRegistry');
      let shapes = 0;
      reg.forEach(el => {
        const gfx = reg.getGraphics(el);
        if (!gfx || el.type === 'label' || !/^bpmn:/.test(el.type) || el.type === 'bpmn:Collaboration' || el.type === 'bpmn:Process') return;
        shapes++;
        gfx.classList.add('dokufix-bpmn-' + el.type.slice(5).toLowerCase(), ...(marks[el.id] || []).map(m => 'dokufix-bpmn-' + m));
        if (el.type === 'bpmn:Participant' && !(el.children || []).some(c => c.type === 'bpmn:Lane')) gfx.classList.add('dokufix-bpmn-ohnebahnen');
      });
      if (!shapes) throw new Error('Das XML enthält kein darstellbares Element. Fehlen die Koordinaten (BPMN-DI)?');
      return { viewer, warnings: warnings.map(w => String(w.message || w)), shapes };
    } catch (err) { viewer.destroy(); throw err; }
  }

  // BPMN-XML → SVG-Text über saveSVG(), die Exportfunktion von bpmn-js. Das ist die Fassung ohne JavaScript.
  async function render(xml, marks = {}) {
    const host = offscreen();
    try {
      const { viewer, warnings, shapes } = await mount(host, xml, marks);
      try {
        const { svg } = await viewer.saveSVG();
        const el = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
        el.querySelectorAll('.djs-hit').forEach(e => e.remove());       // nur für die Bedienung im Viewer nötig
        el.setAttribute('role', 'img');
        return { svg: new XMLSerializer().serializeToString(el), warnings, shapes };
      } finally { viewer.destroy(); }
    } finally { host.remove(); }
  }

  async function fromXml(xml) {
    const laidOut = !/<(?:[\w.-]+:)?BPMNShape\b/.test(xml);          // kein BPMN-DI: selbst anordnen
    if (laidOut) xml = await layoutXml(xml);
    const r = await render(xml);
    return { ...r, xml, marks: {}, laidOut };
  }

  async function fromMermaid(src, name) {
    const model = await parseMermaid(src, name);
    const di = await layoutFromMermaid(src, model);
    const xml = toXml(model, di);
    const marks = {};
    model.nodes.forEach(n => { if (n.classes.includes('geplant')) marks[n.id] = ['geplant']; });
    model.flows.forEach(f => { if (f.dotted) marks[f.id] = ['gestrichelt']; });
    const r = await render(xml, marks);
    return { ...r, xml, marks, model };
  }

  // Laufzeit: Ist bpmn-js in der Seite, zeigt die große Ansicht den Viewer selbst statt des Bildes.
  // Mausrad mit Strg zoomt, Ziehen verschiebt, das bpmn.io-Logo steht unten rechts.
  // Ohne JavaScript oder ohne Bibliothek bleibt die große Ansicht beim Bild und den CSS-Zoomstufen.
  const wired = new WeakSet();
  function enhance(doc) {
    if (typeof BpmnJS === 'undefined') return;
    doc.querySelectorAll('figure.dokufix-diagram-bpmn').forEach(fig => {
      const toggle = fig.querySelector('.dokufix-zoom-toggle'), viewport = fig.querySelector('.dokufix-viewport');
      const bar = fig.querySelector('.dokufix-zoom-bar'), link = fig.querySelector('figcaption a[download]');
      if (wired.has(fig) || !toggle || !viewport || !bar || !link) return;
      wired.add(fig);
      let live = null;
      const zoom = () => {
        if (!live) return;
        const value = bar.querySelector('input[type="radio"]:checked').value;
        const canvas = live.viewer.get('canvas');
        // „Einpassen“ lässt rundum 24 px Rand und vergrößert höchstens auf 150 %.
        const { inner, outer } = canvas.viewbox();
        const scale = value === 'fit' ? Math.min((outer.width - 48) / inner.width, (outer.height - 48) / inner.height, 1.5) : +value / 100;
        // Passt das Diagramm in die Fläche, steht es mittig. Sonst beginnt es links oben, wo der Prozess anfängt.
        const w = outer.width / scale, h = outer.height / scale;
        canvas.viewbox({ x: w >= inner.width ? inner.x - (w - inner.width) / 2 : inner.x - 20, y: h >= inner.height ? inner.y - (h - inner.height) / 2 : inner.y - 20, width: w, height: h });
      };
      const close = () => {
        if (!live) return;
        live.viewer.destroy(); live.box.remove(); live.hint.remove();
        live = null;
        fig.classList.remove('dokufix-live');
      };
      toggle.addEventListener('change', async () => {
        if (!toggle.checked) { close(); return; }
        if (live) return;
        const box = doc.createElement('div');
        box.className = 'dokufix-live-canvas';
        const hint = doc.createElement('span');
        hint.className = 'dokufix-live-hint';
        hint.textContent = 'Strg + Mausrad zoomt, Ziehen verschiebt';
        viewport.append(box);
        fig.classList.add('dokufix-live');
        try {
          const xml = decodeURIComponent(link.getAttribute('href').split(',').slice(1).join(','));
          const marks = fig.dataset.bpmnMarks ? JSON.parse(fig.dataset.bpmnMarks) : {};
          const opened = await mount(box, xml, marks);
          if (!toggle.checked) { opened.viewer.destroy(); box.remove(); fig.classList.remove('dokufix-live'); return; }
          bar.querySelector('fieldset').after(hint);
          live = { ...opened, box, hint };
          zoom();
        } catch (err) {                      // Viewer nicht startbar: die Bild-Ansicht bleibt
          box.remove();
          fig.classList.remove('dokufix-live');
          console.error(err);
        }
      });
      bar.addEventListener('change', zoom);
    });
  }

  return { fromXml, fromMermaid, parseMermaid, toXml, diXml, enhance };
})();
