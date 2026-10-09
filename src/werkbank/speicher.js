// Der Speicher der Layout-Werkbank (Story 2.39): IndexedDB `dokufix-layout-werkbank`, ein eigener Name, denn Seiten,
// die vom Datenträger geöffnet sind, teilen eine IndexedDB über alle Ordner (gemessen 2026-10-09 in Chromium und
// Firefox). Die Datenbank der alten Feedback-Seite (`dokufix-layout-feedback`) liest die Werkbank nie.
//
//   const sp = await speicherOeffnen();      IndexedDB, sonst im Arbeitsspeicher (sp.warnung sagt es)
//   sp.faelle(), sp.fall(fall), sp.legeFall(f)
//   sp.anordnung(fall, stand), sp.anordnungen(fall), sp.einfrieren(a)
//   sp.feedback(fall, stand), sp.feedbacks(fall?), sp.legeFeedback(e)
//   sp.archiv(fall), sp.legeArchiv(x)
//   sp.aufnehmen(xml, opts)                  eine Eingabe: einordnen() aus faelle.js, dann ablegen
//   sp.zuordnen(xml, fall, opts)             eine Eingabe dem Fall, den Ben gewählt hat: zuordnen() aus faelle.js
//   sp.importieren(imp)                      der Import aus tools/werkbank/import.mjs, einmal oder wieder: ohne Dubletten
//   sp.zustand(), sp.laden(zustand)          der Arbeitsstand als Objekt, für die Datei
//   sp.leeren()
//
// Vier Ablagen: faelle (Schlüssel fall), anordnungen und feedback (Schlüssel [fall, stand]), archiv (Schlüssel
// [fall, id]: frühere Fassungen, nur zum Lesen, aus dem Import von tools/werkbank/import.mjs). Die Logik liegt über einer Schnittstelle
// (alle, vonFall, hole, lege, legeViele, ersetze); speicherImArbeitsspeicher() gibt sie ohne Browser, für die Tests und als
// Ausweg, wo IndexedDB verweigert wird.
import { einordnen, zuordnen } from './faelle.js';

export const DB_NAME = 'dokufix-layout-werkbank';
const DB_VERSION = 1;
export const ZUSTAND_FORMAT = 'dokufix-layout-werkbank';
export const IMPORT_FORMAT = 'dokufix-layout-werkbank-import';
const ABLAGEN = { faelle: ['fall'], anordnungen: ['fall', 'stand'], feedback: ['fall', 'stand'], archiv: ['fall', 'id'] };
const schluessel = (ablage, rec) => { const k = ABLAGEN[ablage].map(p => rec[p]); return k.length === 1 ? k[0] : k; };

// ---------- die Schnittstelle, im Arbeitsspeicher ----------
export function arbeitsspeicher(){
  const maps = Object.fromEntries(Object.keys(ABLAGEN).map(a => [a, new Map()]));
  const key = k => JSON.stringify(k);
  const copy = x => x === undefined ? undefined : structuredClone(x);
  return {
    async alle(ablage){ return [...maps[ablage].values()].map(copy); },
    async vonFall(ablage, fall){ return [...maps[ablage].values()].filter(r => r.fall === fall).map(copy); },
    async hole(ablage, k){ return copy(maps[ablage].get(key(k))); },
    async lege(ablage, rec){ maps[ablage].set(key(schluessel(ablage, rec)), copy(rec)); },
    async legeViele(ablage, recs){ for (const rec of recs) maps[ablage].set(key(schluessel(ablage, rec)), copy(rec)); },
    async ersetze(daten){
      for (const a of Object.keys(ABLAGEN)){
        maps[a].clear();
        for (const rec of daten[a] || []) maps[a].set(key(schluessel(a, rec)), copy(rec));
      }
    },
  };
}

// ---------- die Schnittstelle über IndexedDB ----------
const anfrage = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
const fertig = tx => new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Transaktion abgebrochen')); });

export function oeffneIdb(idb, name = DB_NAME){
  return new Promise((resolve, reject) => {
    let req;
    try { req = idb.open(name, DB_VERSION); } catch (e){ reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [a, keyPath] of Object.entries(ABLAGEN)){
        if (db.objectStoreNames.contains(a)) continue;
        const s = db.createObjectStore(a, { keyPath: keyPath.length === 1 ? keyPath[0] : keyPath });
        if (keyPath.length > 1) s.createIndex('fall', 'fall');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB lässt sich nicht öffnen'));
    req.onblocked = () => reject(new Error('IndexedDB ist von einem anderen Tab blockiert'));
  });
}

function idbSchnittstelle(db){
  const store = (a, mode = 'readonly') => db.transaction(a, mode).objectStore(a);
  return {
    alle: a => anfrage(store(a).getAll()),
    vonFall: (a, fall) => anfrage(store(a).index('fall').getAll(fall)),
    hole: (a, k) => anfrage(store(a).get(k)),
    async lege(a, rec){ const tx = db.transaction(a, 'readwrite'); tx.objectStore(a).put(rec); await fertig(tx); },
    async legeViele(a, recs){ const tx = db.transaction(a, 'readwrite'), st = tx.objectStore(a); for (const rec of recs) st.put(rec); await fertig(tx); },
    // Alles in einer Transaktion: schlägt ein Datensatz fehl, bleibt der Speicher, wie er war.
    async ersetze(daten){
      const names = Object.keys(ABLAGEN), tx = db.transaction(names, 'readwrite');
      for (const a of names){
        const s = tx.objectStore(a);
        s.clear();
        for (const rec of daten[a] || []) s.put(rec);
      }
      await fertig(tx);
    },
  };
}

// ---------- der Speicher ----------
// Über einer Schnittstelle s. art: 'indexeddb' oder 'arbeitsspeicher'; warnung: der Grund, warum es nicht IndexedDB ist.
export function speicher(s, { art = 'arbeitsspeicher', warnung = null } = {}){
  const ablegen = (r, faelle, opts) => ablegenIn(sp, r, faelle, opts);
  const sp = {
    art, warnung,
    faelle: () => s.alle('faelle'),
    fall: fall => s.hole('faelle', fall),
    legeFall: f => s.lege('faelle', f),
    anordnung: (fall, stand) => s.hole('anordnungen', [fall, stand]),
    anordnungen: fall => fall === undefined ? s.alle('anordnungen') : s.vonFall('anordnungen', fall),
    // Eine Anordnung je Fall und Stand, eingefroren: die erste bleibt. Gibt die gespeicherte.
    async einfrieren(a){
      const da = await s.hole('anordnungen', [a.fall, a.stand]);
      if (da) return da;
      await s.lege('anordnungen', a);
      return a;
    },
    feedback: (fall, stand) => s.hole('feedback', [fall, stand]),
    feedbacks: fall => fall === undefined ? s.alle('feedback') : s.vonFall('feedback', fall),
    // Mischt in das Feedback am Stand: was e nicht nennt, bleibt.
    async legeFeedback(e){
      const da = await s.hole('feedback', [e.fall, e.stand]);
      const rec = { kommentar: '', bearbeitet: null, ...da, ...e };
      await s.lege('feedback', rec);
      return rec;
    },
    archiv: fall => fall === undefined ? s.alle('archiv') : s.vonFall('archiv', fall),
    legeArchiv: x => s.lege('archiv', x),
    // Eine Eingabe aufnehmen. opts: { name, herkunft, modus, stand, jetzt, referenz, soll }. Ein neuer Fall wird
    // angelegt (mit referenz, wo gegeben); Positionen, die die Eingabe mitbringt, werden Bens Fassung am stand; eine
    // offene (modus 'zuordnen', kein Fall passt) legt nichts an. Gibt das Ergebnis von einordnen().
    async aufnehmen(xml, { jetzt, ...opts } = {}){
      return (await sp.aufnehmenViele([{ xml, ...opts }], jetzt))[0];
    },
    // Viele Eingaben auf einmal, die Fälle einmal gelesen: [{ xml, ...opts von aufnehmen() }] → die Ergebnisse.
    async aufnehmenViele(items, jetzt = new Date().toISOString()){
      const faelle = await sp.faelle(), out = [];
      for (const { xml, stand, referenz, soll, ...opts } of items){
        const r = einordnen(xml, faelle, { ...opts, jetzt });
        out.push(r);
        await ablegen(r, faelle, { stand, referenz, soll, jetzt });
      }
      return out;
    },
    // Eine Eingabe dem Fall fall zuordnen, den Ben gewählt hat (zuordnen() in faelle.js). opts: { herkunft, stand, jetzt, soll }.
    async zuordnen(xml, fall, { stand, soll, jetzt = new Date().toISOString(), ...opts } = {}){
      const faelle = await sp.faelle(), ziel = faelle.find(f => f.fall === fall);
      if (!ziel) return { fehler: 'Den gewählten Fall gibt es nicht.' };
      const r = zuordnen(xml, ziel, faelle, { ...opts, jetzt });
      await ablegen(r, faelle, { stand, soll, jetzt });
      return r;
    },
    // Der Import (tools/werkbank/import.mjs): die externen Eingaben und die Fälle ohne heutige Eingabe als Fälle, Bens
    // letzte Fassungen als Feedback an ihrem Stand (eine neuere am selben Stand bleibt), das Archiv je Fall. Ein zweiter
    // Import derselben Datei legt nichts doppelt an. Wirft bei falschem Format, bevor etwas geschrieben ist.
    // { neu, fassungen, archiv, ohneFall }.
    async importieren(imp){
      pruefeImport(imp);
      const r = await sp.aufnehmenViele([
        ...imp.eingaben.map(e => ({ xml: e.xml, name: e.name, herkunft: e.satz, referenz: e.referenz })),
        ...(imp.faelle || []).map(f => ({ xml: f.eingabe, name: f.name, herkunft: f.herkunft || 'archiv' })),
      ]);
      const da = new Set((await sp.faelle()).map(f => f.fall));
      let fassungen = 0, ohneFall = 0;
      for (const f of imp.fassungen){
        if (!da.has(f.fall)){ ohneFall++; continue; }
        const e = await sp.feedback(f.fall, f.stand);
        if (e && String(e.geaendert) > String(f.geaendert)) continue;
        await sp.legeFeedback({ fall: f.fall, stand: f.stand, bearbeitet: f.bearbeitet, kommentar: f.kommentar || '', geaendert: f.geaendert, soll: f.soll ?? false, quelle: f.quelle });
        fassungen++;
      }
      const archiv = imp.archiv.filter(x => da.has(x.fall));
      ohneFall += imp.archiv.length - archiv.length;
      await s.legeViele('archiv', archiv);
      return { neu: r.filter(x => x.art === 'neu' || x.art === 'revision').length, fassungen, archiv: archiv.length, ohneFall };
    },
    async zustand(jetzt = new Date().toISOString()){
      return { format: ZUSTAND_FORMAT, version: 1, gespeichert: jetzt, faelle: await s.alle('faelle'), anordnungen: await s.alle('anordnungen'), feedback: await s.alle('feedback'), archiv: await s.alle('archiv') };
    },
    // Ersetzt den Speicher durch einen Arbeitsstand; wirft bei falschem Format, der Speicher bleibt dann unverändert.
    async laden(z){
      pruefeZustand(z);
      await s.ersetze(z);
    },
    leeren: () => s.ersetze({}),
  };
  return sp;
}

// Wirft mit einer Meldung für die Seite, wo z kein Arbeitsstand der Werkbank ist.
export function pruefeZustand(z){
  const bad = text => { throw new Error('Kein Arbeitsstand der Werkbank: ' + text + '.'); };
  if (!z || typeof z !== 'object' || z.format !== ZUSTAND_FORMAT) bad('falsches Format');
  if (z.version !== 1) bad('Version ' + z.version + ' unbekannt');
  const str = x => typeof x === 'string' && x.length > 0;
  for (const a of Object.keys(ABLAGEN)){
    if (z[a] !== undefined && !Array.isArray(z[a])) bad(a + ' ist keine Liste');
    for (const rec of z[a] || []) if (!rec || ABLAGEN[a].some(p => !str(rec[p]))) bad('ein Eintrag in ' + a + ' ohne ' + ABLAGEN[a].join(' und '));
  }
  const faelle = new Set((z.faelle || []).map(f => f.fall));
  for (const f of z.faelle || []) if (!str(f.name) || typeof f.eingabe !== 'string') bad('ein Fall ohne Name oder Eingabe');
  for (const a of ['anordnungen', 'feedback', 'archiv']) for (const rec of z[a] || []) if (!faelle.has(rec.fall)) bad('ein Eintrag in ' + a + ' zu einem unbekannten Fall');
}

// Legt ab, was einordnen() oder zuordnen() ergab: einen neuen Fall in faelle und im Speicher, Bens Fassung am stand.
async function ablegenIn(sp, r, faelle, { stand, referenz, soll, jetzt }){
  if (r.fehler || r.art === 'offen') return;
  if (r.art !== 'bekannt'){
    if (referenz) r.fall.referenz = referenz;
    faelle.push(r.fall);
    await sp.legeFall(r.fall);
  }
  // soll null: nicht gesagt, ob die Fassung das Ziel ist.
  if (r.fassung && stand) await sp.legeFeedback({ fall: r.fall.fall, stand, bearbeitet: r.fassung, geaendert: jetzt, soll: soll ?? null });
}

// Wirft mit einer Meldung für die Seite, wo imp kein Import der Werkbank ist.
export function pruefeImport(imp){
  const bad = text => { throw new Error('Kein Import der Werkbank: ' + text + '.'); };
  if (!imp || typeof imp !== 'object' || imp.format !== IMPORT_FORMAT) bad('falsches Format');
  if (imp.version !== 1) bad('Version ' + imp.version + ' unbekannt');
  for (const k of ['eingaben', 'fassungen', 'archiv']) if (!Array.isArray(imp[k])) bad(k + ' ist keine Liste');
  if (imp.faelle !== undefined && !Array.isArray(imp.faelle)) bad('faelle ist keine Liste');
  const str = x => typeof x === 'string' && x.length > 0;
  if (imp.eingaben.some(e => !e || !str(e.name) || !str(e.xml))) bad('eine Eingabe ohne Name oder XML');
  if (imp.fassungen.some(f => !f || !str(f.fall) || !str(f.stand) || !str(f.bearbeitet))) bad('eine Fassung ohne Fall, Stand oder XML');
  if (imp.archiv.some(x => !x || !str(x.fall) || !str(x.id))) bad('ein Eintrag im Archiv ohne Fall oder ID');
}

export const speicherImArbeitsspeicher = opts => speicher(arbeitsspeicher(), opts);

// Der Speicher der Seite: IndexedDB, sonst der Arbeitsspeicher mit einer Warnung. idb: die Fabrik (indexedDB).
export async function speicherOeffnen({ idb = globalThis.indexedDB, name = DB_NAME } = {}){
  if (!idb) return speicherImArbeitsspeicher({ warnung: 'IndexedDB gibt es hier nicht' });
  try { return speicher(idbSchnittstelle(await oeffneIdb(idb, name)), { art: 'indexeddb' }); }
  catch (e){ return speicherImArbeitsspeicher({ warnung: 'IndexedDB verweigert (' + (e && e.message ? e.message : String(e)) + ')' }); }
}
