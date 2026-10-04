import { sourceEl, btnEl, resetEl } from './dom.js';
import { licencesHtml } from './licences.js';
import { state } from './state.js';
import { persistDoc, scheduleSave, updateDirtyState } from './persistence.js';
import { render } from './render.js';
import { TRANSIENT_ATTR } from './transient.js';

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
}

// The step of Escape (src/app/escape.js), the last of the list: read mode is
// left, as by "Editor ↩", and the focus goes to the source.
export const readModeStep = {
  applies: () => document.body.classList.contains('mode-view'),
  close: () => {
    document.body.classList.remove('mode-view');
    sourceEl.focus();
  },
};

// "license information": the link and its view (licences.js). It is frame, not
// document, so it stands twice: in the toolbar, as the first of the actions,
// and in the page itself for read mode, where the toolbar is hidden. Both are
// made here, at load, and marked transient: a saved file takes neither along,
// so it stays the built file, and an open view does not travel. The list
// exists once in the file, in the script. Opening and closing is the
// <details> element's own; there is no listener.
export function registerLicences(){
  const make = () => {
    const holder = document.createElement('template');
    holder.innerHTML = licencesHtml();
    const el = holder.content.firstElementChild;
    el.setAttribute(TRANSIENT_ATTR, '');
    return el;
  };
  document.getElementById('header-actions').prepend(make());
  const editBtn = document.getElementById('edit-btn');
  editBtn.parentNode.insertBefore(make(), editBtn);
}
