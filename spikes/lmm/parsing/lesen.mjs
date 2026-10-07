// Der eine Weg vom XML zum Modell, in jeder Umgebung derselbe: parse() gibt
// ein DOM-artiges Dokument oder wirft; ein <parsererror> im Dokument zählt als
// Parserfehler, wie in layoutBpmn() (src/app/bpmn.js) und im BPMN-Assistenten;
// dann readProcess(). Läuft in Node, Bun und im Browser (keine Imports).
//   lesen(parse, readProcess, xml) → { status, ms, model, leftOut, message }
//   status: ok | null (kein definitions) | parsererror | error (readProcess wirft)

export function lesen(parse, readProcess, xml){
  const now = () => (globalThis.performance ? performance.now() : Date.now());
  const t0 = now();
  let doc;
  try { doc = parse(xml); } catch (e){ return { status: 'parsererror', message: kurz(e), ms: now() - t0 }; }
  const t1 = now();
  const pe = doc && typeof doc.getElementsByTagName === 'function' ? doc.getElementsByTagName('parsererror') : [];
  // Firefox stellt ein <parsererror> als Wurzel in einen eigenen Namensraum; Chromium setzt es in das Dokument.
  if ((pe && pe.length) || (doc && doc.documentElement && String(doc.documentElement.localName).replace(/^.*:/, '') === 'parsererror')){
    return { status: 'parsererror', message: kurz((pe[0] || doc.documentElement).textContent), msParse: t1 - t0, ms: now() - t0 };
  }
  try {
    const r = readProcess(doc);
    if (r === null) return { status: 'null', msParse: t1 - t0, ms: now() - t0 };
    return { status: 'ok', model: r.model, leftOut: r.leftOut, msParse: t1 - t0, ms: now() - t0 };
  } catch (e){ return { status: 'error', message: kurz(e), msParse: t1 - t0, ms: now() - t0 }; }
}

function kurz(e){
  return String(e && e.message !== undefined ? e.message : e).replace(/\s+/g, ' ').trim().slice(0, 240);
}
