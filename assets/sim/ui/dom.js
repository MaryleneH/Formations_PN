// Petits utilitaires DOM. Tout texte fourni par l'apprenant est inséré
// comme TEXTE (textContent), jamais comme HTML.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v; // réservé aux constantes du code (icônes, mini-markdown échappé)
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden' || k === 'readOnly' || k === 'multiple') el[k] = !!v;
    else if (k === 'target') el.dataset.target = v;
    else if (k === 'fk') el.dataset.fk = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false || c === '') continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Mini-markdown des scénarios : `code` et **gras**. Le texte est échappé d'abord. */
export function md(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}
export const mdEl = (tag, text, props = {}) => h(tag, { ...props, html: md(text) });

let uid = 0;
export const nextId = (p = 'id') => `${p}-${++uid}`;

// Icônes : traits simples, dessinées pour le bac à sable (pas de dépendance externe).
const P = {
  gitlab: '<path d="M12 21 3.5 13.5 5 6l2.5 5h9L19 6l1.5 7.5z" fill="currentColor" stroke="none"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15V6a1 1 0 0 1 1-1h9"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 6.1A9 9 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.6M6.5 7.6A16 16 0 0 0 2.5 12S6 18 12 18a9 9 0 0 0 4-.9"/>',
  file: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>',
  folder: '<path d="M3 6h6l2 2h10v11H3z"/>',
  branch: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 7v10M18 10c0 4-6 3-12 7"/>',
  commit: '<circle cx="12" cy="12" r="3.5"/><path d="M3 12h5.5M15.5 12H21"/>',
  explorer: '<path d="M8 3h7l4 4v11H8z"/><path d="M5 7v14h11"/>',
  scm: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 7v10M18 10c0 4-6 3-12 7"/>',
  run: '<path d="M7 5v14l11-7z"/>',
  ext: '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><path d="M15 4h5v5"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M12 15h5"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14-4.5L4 9M4 13a8 8 0 0 0 14 4.5L20 15"/><path d="M4 4v5h5M20 20v-5h-5"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  more: '<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>',
  kebab: '<circle cx="12" cy="5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="19" r="1.3" fill="currentColor"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M16 7l2 2M14 9l2 2"/>',
  vault: '<rect x="4" y="5" width="16" height="15" rx="2"/><circle cx="12" cy="12.5" r="3"/><path d="M12 9.5v-1M8 20v1.5M16 20v1.5"/>',
  clipboard: '<rect x="6" y="5" width="12" height="16" rx="2"/><path d="M9 5V3.5h6V5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5V14M12 17.2v.1"/>',
  light: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v7.5c0 4-2.5 7-6 7S5.5 18 4.5 15.5l-1-3a1.5 1.5 0 0 1 2.8-1L8 14"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  focus: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  unfocus: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
  restart: '<path d="M4 12a8 8 0 1 0 2.3-5.6L4 9"/><path d="M4 4v5h5"/>',
  save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  home: '<path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/>',
  issues: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
  mr: '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M6 8v8M18 16V9a3 3 0 0 0-3-3h-4M13 4l-2 2 2 2"/>',
  todo: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  members: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5"/><circle cx="17" cy="8.5" r="2.5"/><path d="M17 14c2 0 3.6 1.2 4.5 3.5"/>',
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.1"/>',
  alert: '<path d="M12 3 2.5 20h19z"/><path d="M12 10v4.5M12 17.2v.1"/>',
  arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  dot: '<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
  r: '<circle cx="12" cy="12" r="9.5" fill="currentColor" stroke="none"/><text x="12" y="16.2" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="12" fill="#fff" stroke="none">R</text>',
  pull: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  diff: '<path d="M7 4v10M2 9h10M14 15h8M12 20h10" />',
  history: '<path d="M4 12a8 8 0 1 0 2.3-5.6L4 9"/><path d="M4 4v5h5M12 8v4l3 2"/>',
  newfile: '<path d="M7 3h7l4 4v14H7z"/><path d="M12 11v6M9 14h6"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
};
export function icon(name, cls = '') {
  const span = document.createElement('span');
  span.className = 'ico ' + cls;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${P[name] || P.dot}</svg>`;
  return span;
}

/** Bouton accessible avec icône et libellé (visible ou non). */
export function btn(label, { icon: ic, cls = '', on, target, fk, title, hideLabel, disabled, attrs = {} } = {}) {
  return h('button', {
    type: 'button', class: cls, target, fk: fk || target, title: title || (hideLabel ? label : null), disabled,
    'aria-label': hideLabel ? label : null, on: on ? { click: on } : null, ...attrs,
  }, ic ? icon(ic) : null, hideLabel ? null : h('span', { class: 'lbl' }, label));
}

/**
 * Ferme un élément flottant au clic extérieur. L'écouteur se retire de
 * lui-même quand l'élément a été remplacé par un nouveau rendu.
 * opener : bouton d'ouverture (identifié par data-fk) exclu du clic extérieur.
 */
export function dismissable(el, close, opener) {
  const fk = opener && opener.dataset ? opener.dataset.fk : null;
  const cleanup = () => document.removeEventListener('click', onDoc, true);
  function onDoc(e) {
    if (!el.isConnected) { cleanup(); return; }
    if (el.contains(e.target)) return;
    if (fk && e.target.closest && e.target.closest(`[data-fk="${fk}"]`)) return;
    cleanup();
    close();
  }
  setTimeout(() => document.addEventListener('click', onDoc, true), 0);
  return cleanup;
}

/** Piège de focus pour une fenêtre modale. */
export function trapFocus(container, e) {
  if (e.key !== 'Tab') return;
  const f = [...container.querySelectorAll('button:not([disabled]), [href], input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null || x === document.activeElement);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

export const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
