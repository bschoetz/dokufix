import { sourceEl, btnEl, resetEl } from './dom.js';
import { state } from './state.js';
import { persistDoc, scheduleSave, updateDirtyState } from './persistence.js';
import { render } from './render.js';

// --- Render button and typing ----------------------------------
export function registerEditorInput(){
  btnEl.addEventListener('click', render);

  sourceEl.addEventListener('input', () => { scheduleSave(); updateDirtyState(); });
  sourceEl.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      render();
    }
  });
}

// "Demo zurücksetzen" — restore the immutable demo text (not this file's document, which a download overwrites)
export function registerReset(){
  resetEl.addEventListener('click', () => {
    if (sourceEl.value === state.demoText || confirm('Demo-Text zurücksetzen? Aktuelle Änderungen gehen verloren.')){
      sourceEl.value = state.demoText;
      persistDoc();
      updateDirtyState();
      render();
      sourceEl.focus();
    }
  });
}

// --- Gliederungsnummerierung (Heading numbering) ----------------
const NUMBERING_KEY = 'dokufix-poc-numbering';
const numberingBtn  = document.getElementById('numbering-btn');
function applyNumbering(on){
  document.body.classList.toggle('numbered', on);
  numberingBtn.classList.toggle('toggle-on', on);
  numberingBtn.setAttribute('aria-pressed', String(on));
  try { localStorage.setItem(NUMBERING_KEY, on ? '1' : '0'); } catch(e){}
}
export function registerNumbering(){
  numberingBtn.addEventListener('click', () => {
    applyNumbering(!document.body.classList.contains('numbered'));
  });
  // Restore saved preference on load
  try {
    if (localStorage.getItem(NUMBERING_KEY) === '1') applyNumbering(true);
  } catch(e){}
}

// Hamburger menu (mobile)
export function registerHamburger(){
  const hamburgerBtn  = document.getElementById('hamburger');
  const headerActions = document.getElementById('header-actions');
  hamburgerBtn.addEventListener('click', e => {
    e.stopPropagation();
    const willOpen = !headerActions.classList.contains('open');
    headerActions.classList.toggle('open', willOpen);
    hamburgerBtn.setAttribute('aria-expanded', String(willOpen));
  });
  document.addEventListener('click', e => {
    if (!headerActions.contains(e.target) && e.target !== hamburgerBtn){
      headerActions.classList.remove('open');
      hamburgerBtn.setAttribute('aria-expanded', 'false');
    }
  });
}

// View / Editor toggle
export function registerViewToggle(){
  const viewBtn = document.getElementById('view-btn');
  const editBtn = document.getElementById('edit-btn');
  viewBtn.addEventListener('click', async () => {
    await render();              // make sure preview reflects latest source
    document.body.classList.add('mode-view');
    window.scrollTo(0, 0);
    document.getElementById('preview').scrollTop = 0;
  });
  editBtn.addEventListener('click', () => {
    document.body.classList.remove('mode-view');
    sourceEl.focus();
  });
  // ESC leaves view mode
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.body.classList.contains('mode-view')) {
      document.body.classList.remove('mode-view');
      sourceEl.focus();
    }
  });
}
