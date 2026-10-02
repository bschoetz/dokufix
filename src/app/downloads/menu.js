import { state } from '../state.js';
import { deriveDocTitle } from '../frontmatter.js';
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
    });
  });
}

// Filename helper — pull title from the first H1 of the markdown
export function safeFilenameBase(){
  let base = deriveDocTitle('dokufix-dokument');
  base = base.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/\s+/g, '-').slice(0, 80);
  return base || 'dokufix-dokument';
}
export function triggerDownload(filename, content, mime='text/html;charset=utf-8'){
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

let downloadInFlight = false;
export function setDownloadInFlight(flag){
  downloadInFlight = flag;
  downloadWrap.querySelectorAll('button[data-download]').forEach(b => {
    b.disabled = flag;
  });
}
