import { sourceEl } from '../dom.js';
import { deriveDocTitle } from '../frontmatter.js';

// --- What every download needs ----------------------------------
// The file's name, handing the file to the browser, and the gate that keeps a
// second download from starting while one runs. The menu and the four
// downloads import from here; none of them imports the menu.
const downloadWrap = document.getElementById('download-wrap');

// Filename helper — pull title from the first H1 of the markdown
export function safeFilenameBase(){
  let base = deriveDocTitle(sourceEl.value, 'dokufix-dokument');
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

export let downloadInFlight = false;
export function setDownloadInFlight(flag){
  downloadInFlight = flag;
  downloadWrap.querySelectorAll('button[data-download]').forEach(b => {
    b.disabled = flag;
  });
}
