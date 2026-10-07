// Der Korpus der Messungen: alle Texte der Fixtures (tests/fixtures/bpmn-layout/*.sizes.json,
// Beschriftungen und Notizen) und heikle Texte dazu. korpus() → { labels: string[], notes: string[] }.
import fs from 'node:fs';
import path from 'node:path';

const R = '/home/user/dokufix/';
const DIR = R + 'tests/fixtures/bpmn-layout/';

// Heikle Texte: Umlaute, lange Wörter, Bindestriche, Zahlen, Zeilenumbrüche, Emoji, CJK, Leerzeichen.
export const HEIKEL = [
  'Überprüfung der Größenänderung',
  'Donaudampfschifffahrtsgesellschaftskapitän',
  'Rechnungsprüfungs-Workflow',
  'Ein-, Aus- und Durchgang',
  'Kunden-Nr. 4711-0815',
  '1234567890 €',
  '12.345,67 EUR überwiesen',
  'Erste Zeile\nzweite Zeile',
  'Zeile eins\r\nZeile zwei\n\nnach Leerzeile',
  'Abschluss 🎉 gefeiert',
  '請求書を確認する',
  '审核申请并转发给团队负责人',
  'Fehler!!! Sofort???',
  'a',
  'ab',
  ' führende Leerzeichen',
  'nachgestellte Leerzeichen   ',
  'doppelte  Leerzeichen  innen',
  'x'.repeat(40),
  'Qualitätssicherung abgeschlossen und freigegeben',
  'Soft­break im Wort',
  'Tab\tgetrennt',
  'ÄÖÜ äöü ß',
  'e-mail-benachrichtigung-versendet',
  'A B C D E F G H I J K L M N O P Q R S T U V W X Y Z',
  'WWWWWWWWWWWWWWW',
  'iiiiiiiiiiiiiiiiiiiiiiiiiiiiii',
  'AVATAR Wavy Toffee',
  'Team-Leitung informiert (Frist: 3 Tage)',
  '„Anführungszeichen“ und ‚einfache‘',
  'Prozentsatz 12,5 % – fertig',
];

export function korpus(){
  const labels = new Set(), notes = new Set();
  for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.sizes.json')).sort()){
    for (const k of Object.keys(JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')))){
      const m = /^note:(\d+):([\s\S]*)$/.exec(k);
      if (m) notes.add(m[2]); else labels.add(k);
    }
  }
  const fixtures = { labels: labels.size, notes: notes.size };
  for (const t of HEIKEL){ labels.add(t); notes.add(t); }
  return { labels: [...labels], notes: [...notes], fixtures };
}
