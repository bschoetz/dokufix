// --- The warning ---------------------------------------------------------
// What a reader sees where something could not be rendered: Markdown that
// could not be read, a pass that failed, a diagram with an error. It is a
// document construct like the metadata panel: its look is in src/doc.css, so
// it reads the same in the preview and in every export.
//
// Recognisable without colour: the word "Warnung" stands in the markup, not in
// a style. The text is German, like everything a reader sees; the detail is
// the message of whatever failed, as it came.
//
// Pure logic: the element is made by the document it is handed, so this loads
// and runs without a page.
export function buildWarning(doc, text, detail){
  const box = doc.createElement('div');
  box.className = 'dokufix-warning';
  box.setAttribute('role', 'note');
  const title = doc.createElement('p');
  title.className = 'dokufix-warning-title';
  const label = doc.createElement('strong');
  label.textContent = 'Warnung:';
  title.appendChild(label);
  title.appendChild(doc.createTextNode(' ' + text));
  box.appendChild(title);
  const shown = detail === undefined || detail === null ? '' : String(detail).trim();
  if (shown){
    const pre = doc.createElement('pre');
    pre.className = 'dokufix-warning-detail';
    pre.textContent = shown;
    box.appendChild(pre);
  }
  return box;
}

// The message of whatever was thrown, for the detail of a warning.
export function errorMessage(err){
  return err && err.message ? String(err.message) : String(err);
}
