# Third-party notices

dokufix itself is under the MIT License, see [LICENSE](LICENSE). Its files carry or load work of others, listed here. Tools that only run for the build or the tests (esbuild, ESLint, Playwright, linkedom, bpmnlint, bpmn-moddle) are in no file and are not listed.

Written by `node tools/notices.mjs` from `src/app/licences.js` and `tools/bpmn-assistant/vendor/bpmn-auto-layout.LIZENZEN.txt`; `npm run check` fails when it is out of date.

## dokufix

`dist/dokufix.html`, `dist/dokufix-showcase.html` and every file they save or export. Each of these files shows the same list behind its link "license information".

| Component | Version | Licence | Copyright | How |
| --- | --- | --- | --- | --- |
| marked | 18.0.14 | MIT License | Copyright (c) 2018+, MarkedJS (https://github.com/markedjs/)<br>Copyright (c) 2011-2018, Christopher Jeffrey (https://github.com/chjj/) | loaded by the editor from a CDN |
| marked-footnote | 1.4.0 | MIT License | Copyright (c) 2023-2024 Stilearning (https://stilearning.com) | loaded by the editor from a CDN |
| Mermaid | 12.0.0 | MIT License | Copyright (c) 2014 - 2022 Knut Sveidqvist | loaded by the editor from a CDN |
| bpmn-js | 18.31.0 | bpmn.io License | Copyright (c) 2014-present Camunda Services GmbH | loaded by the editor from a CDN |
| diagram-js | 15.28.0 | MIT License | Copyright (c) 2014-present Camunda Services GmbH | carried by the file |
| Mermaid's swimlane layout | 12.0.0 | MIT License | Copyright (c) 2014 - 2022 Knut Sveidqvist | carried by the file |
| Octicons | 19.38.0 | MIT License | Copyright (c) 2026 GitHub Inc. | carried by the file |

## BPMN tool pages

`dist/bpmn-assistant.html`, `dist/bpmn-layout-werkbank.html` and `dist/bpmn-layouter-audi.html`. Their code is embedded, so the pages work offline. The bundle of bpmn-auto-layout carries its licence texts in `tools/bpmn-assistant/vendor/bpmn-auto-layout.LIZENZEN.txt`.

| Component | Version | Licence | Copyright | Pages |
| --- | --- | --- | --- | --- |
| bpmn-js (viewer; modeler in Assistant and workbench) | 18.31.0 | bpmn.io License | Copyright (c) 2014-present Camunda Services GmbH | all three |
| diagram-js, its text layout replicated | 15.28.0 | MIT License | Copyright (c) 2014-present Camunda Services GmbH | Assistant, workbench |
| Mermaid's swimlane layout, replicated | 12.0.0 | MIT License | Copyright (c) 2014 - 2022 Knut Sveidqvist | Assistant, workbench |
| Octicons | 19.38.0 | MIT License | Copyright (c) 2026 GitHub Inc. | all three |
| bpmn-auto-layout | 2.0.0-alpha.2 | MIT License | bpmn.io contributors (the package has no licence file) | Assistant |
| bpmn-moddle | 10.3.1 | MIT License | Copyright (c) 2014 camunda Services GmbH | Assistant |
| moddle | 8.2.1 | MIT License | Copyright (c) 2014-present Camunda Services GmbH | Assistant |
| moddle-xml | 12.3.1 | MIT License | Copyright (c) 2014-present Camunda Services GmbH | Assistant |
| saxen | 11.2.0 | MIT License | Copyright (c) 2012 Vopilovskii Konstantin <flash.vkv@gmail.com><br>Copyright (c) 2017-present Nico Rehwaldt | Assistant |
| min-dash | 5.1.0 | MIT License | Copyright (c) 2017-present camunda Services GmbH | Assistant |

## Licence texts

### MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### bpmn.io License

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

The source code responsible for displaying the bpmn.io project watermark that links back to https://bpmn.io as part of rendered diagrams MUST NOT be removed or changed. When this software is being used in a website or application, the watermark must stay fully visible and not visually overlapped by other elements.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
