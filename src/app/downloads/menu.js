import { state } from '../state.js';
import { downloadInFlight, setDownloadInFlight } from './download.js';
import { downloadWithEditor } from './with-editor.js';
import { downloadReadonlyOpen } from './readonly-open.js';
import { downloadReadonlySlim } from './readonly-slim.js';
import { downloadReadonlyCompact } from './readonly-compact.js';

// --- Download menu --------------------------------------------
const downloadWrap = document.getElementById('download-wrap');
const downloadBtn  = document.getElementById('download-btn');

function toggleMenu(force){
  const willOpen = (typeof force === 'boolean') ? force : !downloadWrap.classList.contains('open');
  downloadWrap.classList.toggle('open', willOpen);
  downloadBtn.setAttribute('aria-expanded', String(willOpen));
}
export function registerDownloadMenu(){
  downloadBtn.addEventListener('click', e => { e.stopPropagation(); toggleMenu(); });
  document.addEventListener('click', e => {
    if (!downloadWrap.contains(e.target)) toggleMenu(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && downloadWrap.classList.contains('open')) toggleMenu(false);
  });

  downloadWrap.querySelectorAll('button[data-download]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!state.initDone || downloadInFlight) return;
      toggleMenu(false);
      // For read-only downloads we set the in-flight gate here.
      // downloadWithEditor() manages its own gate (it can take more steps).
      const variant = btn.dataset.download;
      // Whatever a download throws ends here: an export step that failed, for
      // one. No file was handed over, so the user is told, with the reason.
      try {
        if (variant === 'full'){
          await downloadWithEditor();
          return;
        }
        setDownloadInFlight(true);
        try {
          if (variant === 'readonly-open')     await downloadReadonlyOpen();
          if (variant === 'readonly-slim')     await downloadReadonlySlim();
          if (variant === 'readonly-compact')  await downloadReadonlyCompact();
        } finally {
          setDownloadInFlight(false);
        }
      } catch (e) {
        console.error('Download failed:', e);
        alert('Der Download ist fehlgeschlagen — es wurde keine Datei erzeugt. (' + (e && e.message || e) + ')');
      }
    });
  });
}
