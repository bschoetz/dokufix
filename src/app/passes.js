import { buildWarning, errorMessage } from './warning.js';

// --- The pass runner -------------------------------------------------------
// A pass is one step that works on the rendered document:
//
//   { name: 'Inhaltsverzeichnis', run(root, context){ … } }
//
// root is the element that holds the document, context what the render hands
// to every pass (see render.js). run may return a promise; the next pass
// starts when it has settled. name is what a reader is told when the pass
// fails, so it is German.
//
// Every pass runs in its own containment. One that throws, or whose promise is
// rejected, is logged to the console; the passes after it still run. When the
// list is through, each failed pass gets one warning at the top of root, in
// the order of the list. A pass that failed half way has left what it had done
// so far; the warning says that the document may be incomplete.
//
// Returns the failures, [{ name, error, warning }], and never rejects.
//
// Pure logic: no page is needed to load this or to run it. tests/passes.test.mjs
// drives it in Node over a parsed fragment.
export async function runPasses(root, passes, context){
  const failed = [];
  for (const pass of passes){
    try {
      await pass.run(root, context);
    } catch (error){
      console.error('Pass "' + pass.name + '" failed:', error);
      failed.push({ name: pass.name, error });
    }
  }
  for (const f of failed){
    f.warning = buildWarning(root.ownerDocument,
      'Der Schritt „' + f.name + '“ ist fehlgeschlagen. Das Dokument kann unvollständig sein.',
      errorMessage(f.error));
  }
  if (failed.length) root.prepend(...failed.map(f => f.warning));
  return failed;
}
