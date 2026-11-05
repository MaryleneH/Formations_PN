// Le petit robot du coach : décoratif (aria-hidden), son humeur suit l'état.
//   idle  : au repos, il respire et cligne des yeux
//   happy : une étape vient d'être réussie — il saute et agite le bras
//   think : une aide est ouverte — main au menton, bulles
//   oops  : une remarque attend l'apprenant — il hausse les épaules
//   proud : mission terminée — bras levés, voyant de poitrine allumé
const MOUTHS = {
  idle: '<path d="M27 31 q5 3 10 0" />',
  happy: '<path d="M26 30 q6 6 12 0" />',
  proud: '<path d="M26 29.5 q6 7 12 0 z" fill="#f2c46d" />',
  think: '<path d="M28 32 h8" />',
  oops: '<path d="M27 33 q5 -3 10 0" />',
};
const EYES = {
  idle: '<rect class="rb-eye" x="24.5" y="21" width="4" height="5" rx="2"/><rect class="rb-eye" x="35.5" y="21" width="4" height="5" rx="2"/>',
  happy: '<path d="M24 24 q2.5 -3 5 0 M35 24 q2.5 -3 5 0" fill="none"/>',
  proud: '<path d="M24 24 q2.5 -3 5 0 M35 24 q2.5 -3 5 0" fill="none"/>',
  think: '<rect class="rb-eye" x="26" y="20" width="4" height="5" rx="2"/><rect class="rb-eye" x="37" y="20" width="4" height="5" rx="2"/>',
  oops: '<rect class="rb-eye" x="24.5" y="22" width="4" height="4" rx="2"/><rect class="rb-eye" x="35.5" y="22" width="4" height="4" rx="2"/><path d="M23.5 18.5 q2.5 -2.5 5 -1 M35.5 17 h5" fill="none"/>',
};

export function robot(mood = 'idle') {
  const m = MOUTHS[mood] ? mood : 'idle';
  const span = document.createElement('span');
  span.className = `coach-robot is-${m}`;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 64 84" width="52" height="68">
    <ellipse class="rb-shadow" cx="32" cy="81" rx="13" ry="2.2" fill="#22262a" opacity=".12"/>
    <g class="rb-all">
      <g class="rb-wheel"><circle cx="32" cy="73" r="6" fill="#24553f"/><circle cx="32" cy="73" r="2.2" fill="#e5eee8"/><path d="M32 67.5 v3 M32 75.5 v3 M26.5 73 h3 M34.5 73 h3" stroke="#e5eee8" stroke-width="1.2"/></g>
      <g class="rb-arm rb-arm-l"><rect x="9" y="44" width="6" height="16" rx="3" fill="#24553f"/><circle cx="12" cy="61" r="3.4" fill="#f2c46d"/></g>
      <g class="rb-arm rb-arm-r"><rect x="49" y="44" width="6" height="16" rx="3" fill="#24553f"/><circle cx="52" cy="61" r="3.4" fill="#f2c46d"/></g>
      <g class="rb-body">
        <rect x="16" y="41" width="32" height="26" rx="8" fill="#2f6b4f"/>
        <rect x="22" y="47" width="20" height="12" rx="4" fill="#1d2a24"/>
        <circle class="rb-heart" cx="27.5" cy="53" r="2.4" fill="#e78f7a"/>
        <rect class="rb-bar" x="32" y="51.5" width="7" height="3" rx="1.5" fill="#9fd1b4"/>
      </g>
      <g class="rb-head">
        <rect x="29" y="37" width="6" height="5" fill="#24553f"/>
        <line class="rb-antenna" x1="32" y1="9" x2="32" y2="3" stroke="#2f6b4f" stroke-width="2" stroke-linecap="round"/>
        <circle class="rb-bulb" cx="32" cy="3" r="3" fill="#f2c46d"/>
        <rect x="14" y="17" width="4" height="10" rx="2" fill="#24553f"/>
        <rect x="46" y="17" width="4" height="10" rx="2" fill="#24553f"/>
        <rect x="17" y="9" width="30" height="29" rx="9" fill="#2f6b4f"/>
        <rect x="20.5" y="14.5" width="23" height="20" rx="6" fill="#1d2a24"/>
        <g fill="#e5eee8" stroke="#e5eee8" stroke-width="1.8" stroke-linecap="round">${EYES[m]}</g>
        <g fill="none" stroke="#e5eee8" stroke-width="1.8" stroke-linecap="round">${MOUTHS[m]}</g>
        ${m === 'happy' || m === 'proud' ? '<circle cx="23.5" cy="29" r="1.8" fill="#e78f7a" opacity=".8"/><circle cx="40.5" cy="29" r="1.8" fill="#e78f7a" opacity=".8"/>' : ''}
      </g>
      ${m === 'think' ? '<g class="rb-bubbles" fill="#f2c46d"><circle cx="51" cy="8" r="1.6"/><circle cx="56" cy="3.5" r="2.3"/></g>' : ''}
      ${m === 'proud' ? '<g class="rb-stars" fill="#f2c46d"><path d="M6 14 l1.2 2.6 2.8 .3 -2.1 1.9 .6 2.8 -2.5 -1.4 -2.5 1.4 .6 -2.8 -2.1 -1.9 2.8 -.3z"/><path d="M58 22 l1 2 2.2 .3 -1.6 1.5 .4 2.2 -2 -1.1 -2 1.1 .4 -2.2 -1.6 -1.5 2.2 -.3z"/></g>' : ''}
    </g>
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
