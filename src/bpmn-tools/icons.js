// --- The icons of the BPMN tools -------------------------------------------
// Small symbols for the buttons of the BPMN Assistant, the Layouter Audi and
// the layout workbench, 16 px, in the colour of the text. One source for the
// page's markup and its script: tools/seiten.mjs fills {{icon:<name>}} in a
// page's index.html from ICON, the scripts import it. Pure data, nothing done
// on loading; Node imports it too.
const svgIcon = d => '<svg class="ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';

export const ICON = {
  pencil: svgIcon('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>'),
  play: svgIcon('<path d="M7 4l13 8-13 8z" fill="currentColor"/>'),
  upload: svgIcon('<path d="M12 16V4M6 10l6-6 6 6M4 20h16"/>'),
  download: svgIcon('<path d="M12 4v12M6 10l6 6 6-6M4 20h16"/>'),
  copy: svgIcon('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
  doc: svgIcon('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
  palette: svgIcon('<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.9 1.2-1.8-.5-1-.1-2.2 1.1-2.2H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10.5" cy="7" r="1.2" fill="currentColor"/><circle cx="15" cy="7.5" r="1.2" fill="currentColor"/>'),
};
