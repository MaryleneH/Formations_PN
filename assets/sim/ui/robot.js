// Le petit robot du coach : décoratif (aria-hidden), son humeur suit l'état.
//   idle   : au repos          happy : une étape vient d'être réussie
//   think  : une aide est ouverte   oops : une remarque attend l'apprenant
//   proud  : mission terminée
const MOUTHS = {
  idle: '<path d="M19 33 q5 3 10 0" />',
  happy: '<path d="M18 32 q6 6 12 0" />',
  proud: '<path d="M18 31 q6 7 12 0 z" fill="#f2c46d" />',
  think: '<path d="M20 34 h8" />',
  oops: '<path d="M19 35 q5 -3 10 0" />',
};
const EYES = {
  idle: '<rect class="rb-eye" x="16.5" y="23" width="4" height="5" rx="2"/><rect class="rb-eye" x="27.5" y="23" width="4" height="5" rx="2"/>',
  happy: '<path d="M16 26 q2.5 -3 5 0 M27 26 q2.5 -3 5 0" fill="none"/>',
  proud: '<path d="M16 26 q2.5 -3 5 0 M27 26 q2.5 -3 5 0" fill="none"/>',
  think: '<rect class="rb-eye" x="18" y="22" width="4" height="5" rx="2"/><rect class="rb-eye" x="29" y="22" width="4" height="5" rx="2"/>',
  oops: '<rect class="rb-eye" x="16.5" y="24" width="4" height="4" rx="2"/><rect class="rb-eye" x="27.5" y="24" width="4" height="4" rx="2"/><path d="M15 20 l5 1.5 M33 20 l-5 1.5" fill="none"/>',
};

export function robot(mood = 'idle') {
  const m = MOUTHS[mood] ? mood : 'idle';
  const span = document.createElement('span');
  span.className = `coach-robot is-${m}`;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 48 48" width="48" height="48">
    <line class="rb-antenna" x1="24" y1="11" x2="24" y2="5" stroke="#2f6b4f" stroke-width="2" stroke-linecap="round"/>
    <circle class="rb-bulb" cx="24" cy="4.5" r="3" fill="#f2c46d"/>
    <rect x="6" y="20" width="4" height="10" rx="2" fill="#24553f"/>
    <rect x="38" y="20" width="4" height="10" rx="2" fill="#24553f"/>
    <rect x="9" y="11" width="30" height="31" rx="9" fill="#2f6b4f"/>
    <rect x="12.5" y="17" width="23" height="22" rx="6" fill="#1d2a24"/>
    <g fill="#e5eee8" stroke="#e5eee8" stroke-width="1.8" stroke-linecap="round">${EYES[m]}</g>
    <g fill="none" stroke="#e5eee8" stroke-width="1.8" stroke-linecap="round">${MOUTHS[m]}</g>
    ${m === 'think' ? '<g fill="#f2c46d"><circle cx="40" cy="9" r="1.6"/><circle cx="44" cy="5" r="2.2"/></g>' : ''}
    ${m === 'happy' || m === 'proud' ? '<circle cx="15.5" cy="31" r="1.8" fill="#e78f7a" opacity=".8"/><circle cx="32.5" cy="31" r="1.8" fill="#e78f7a" opacity=".8"/>' : ''}
  </svg>`;
  return span;
}

/** Humeur selon l'état du coach. */
export function moodFor(app, { complete, warned }) {
  if (complete) return 'proud';
  const c = app.ui.changed;
  if (c && c.steps && c.steps.length && Date.now() - c.at < 8000) return 'happy';
  if (app.ui.hint && app.ui.hint.mission === app.mission.id) return 'think';
  if (warned) return 'oops';
  return 'idle';
}
