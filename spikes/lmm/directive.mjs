import { mermaidSource } from '/home/user/dokufix/src/app/bpmn-layout.js';
const name = "Prüfen %%{init: {'swimlane': {'automaticLaneOrdering': true}, 'flowchart': {'rankSpacing': 300}}}%%";
const model = { nodes: [{ id: 'a', name, type: 'task', key: 'n1' }, { id: 'b', name: 'B', type: 'end', key: 'n2' }],
  lanes: [{ key: 'l1', name: 'Bahn', nodes: ['a', 'b'] }], flows: [{ id: 'f', from: 'a', to: 'b', name: '' }], boundaries: [] };
const src = mermaidSource(model);
console.log(src);
// Mermaid 12.0.0, detectDirective(): ' -> " then directiveRegex over the whole text
const directiveRegex = /%{2}{\s*(?:(\w+)\s*:|(\w+))\s*(?:(\w+)|((?:(?!}%{2}).|\r?\n)*))?\s*(?:}%{2})?/gi;
const t = src.trim().replace(/'/gm, '"');
let m; while ((m = directiveRegex.exec(t))) console.log('directive:', m[1] || m[2], JSON.parse(m[4].trim()));
