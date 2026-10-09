// Die Layout-Werkbank (dist/bpmn-layout-werkbank.html, Story 2.38): der Rahmen. Links die Liste der Fälle, rechts die
// Leinwand, beide leer; im Kopf der Layout-Stand, die Prüfsumme der Module des Layouts, mit denen die Seite gebaut ist
// (logikOf() in tools/bpmn-layout/lib.mjs, dieselbe Zahl, die tools/bpmn-layout/lauf.mjs als Logik nennt). Die Seite
// trägt den Viewer von bpmn-js und den Worker des Layouts (#dokufix-layout-js); Fälle, Speicher, Import und die
// gestaltete Ansicht kommen mit den Einträgen 39 bis 41 und nehmen dazu die Module aus src/bpmn-tools/ (das Layout im
// Worker: makeA2Client() in src/bpmn-tools/layout.js).
//
// Der Einstieg des Skripts der Seite, gebündelt über tools/seiten.mjs (tools/werkbank/bauen.mjs). Er startet keinen
// Worker: eine Seite, der der Browser einen Worker aus einer Blob-URL verweigert, öffnet und zeigt ihren Stand wie
// jede andere; der Stand steht ohne Skript im Markup.
const stand = document.getElementById('stand');
// Der Stand auch im Titel des Tabs, damit zwei offene Werkbänke verschiedener Stände unterscheidbar sind.
if (stand) document.title += ' · ' + stand.textContent.trim();
