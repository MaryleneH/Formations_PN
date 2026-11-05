// =====================================================================
// Barre d'outils du simulateur : choix de l'outil (GitLab / IDE),
// presse-papiers, gestionnaire de mots de passe, gestionnaire
// d'identifiants de Git, horloge du scénario. Et deux composants
// partagés : le champ de jeton et le sélecteur de dossier.
// =====================================================================

import * as E from '../engine/engine.js';
import { classifySecret, frDate, tildify, basename, dirname } from '../engine/util.js';
import { h, btn, icon, md, dismissable } from './dom.js';

const IDE_LABEL = { vscode: 'VS Code', rstudio: 'RStudio' };

export function renderToolbar(app) {
  const w = app.w;
  const tool = w.ui.tool;
  const tab = (key, label, ic, target) => h('button', {
    type: 'button', role: 'tab', 'aria-selected': String(tool === key), class: ['sim-tooltab', tool === key ? 'is-on' : ''], target, fk: target,
    tabindex: tool === key ? '0' : '-1', 'aria-controls': 'sim-frame',
    on: {
      click: () => app.setTool(key),
      keydown: (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); app.setTool(key === 'gitlab' ? 'ide' : 'gitlab'); } },
    },
  }, icon(ic), h('span', {}, label));
  const clip = w.clipboard;
  const clipLabel = !clip ? 'vide' : clip.kind === 'token' ? 'jeton' : clip.kind === 'url' ? (clip.text.startsWith('git@') ? 'URL SSH' : 'URL HTTPS') : 'texte';
  const pop = app.ui.pop;
  return h('div', { class: 'sim-toolbar' },
    h('div', { class: 'sim-tooltabs', role: 'tablist', 'aria-label': 'Outil affiché' },
      tab('gitlab', 'GitLab', 'gitlab', 'tb.tool-gitlab'),
      tab('ide', IDE_LABEL[app.ide], app.ide === 'rstudio' ? 'r' : 'code', 'tb.tool-ide')),
    h('div', { class: 'sim-utils', role: 'group', 'aria-label': 'Outils du poste simulé' },
      utilBtn(app, 'clipboard', `Presse-papiers : ${clip && clip.kind === 'token' ? 'jeton d’entraînement' : clipLabel}`, 'Presse-papiers', clip ? clipLabel : 'vide', 'tb.clipboard'),
      utilBtn(app, 'vault', 'Gestionnaire de mots de passe', 'Mots de passe', w.vault.length ? String(w.vault.length) : null, 'tb.vault'),
      utilBtn(app, 'credentials', 'Identifiants mémorisés par Git', 'Identifiants', w.credentials.length ? String(w.credentials.length) : null, 'tb.credentials'),
      utilBtn(app, 'clock', `Date du scénario : ${frDate(w.today)}`, 'Horloge', frDate(w.today), 'tb.clock')),
    pop ? renderPopover(app, pop) : null);
}

function utilBtn(app, key, aria, label, badge, target) {
  const open = app.ui.pop === key;
  return h('button', {
    type: 'button', class: ['sim-util', open ? 'is-on' : ''], target, fk: target, 'aria-expanded': String(open), 'aria-haspopup': 'dialog', 'aria-label': aria, title: aria,
    on: { click: () => { app.ui.pop = open ? null : key; app.render(); if (!open) { const p = app.root.querySelector('.sim-pop'); if (p) (p.querySelector('input, button') || p).focus(); } } },
  }, icon({ clipboard: 'clipboard', vault: 'vault', credentials: 'key', clock: 'clock' }[key]), h('span', { class: 'sim-util-lbl' }, label), badge ? h('span', { class: 'sim-util-badge' }, badge) : null);
}

function renderPopover(app, key) {
  const w = app.w;
  const close = (refocus = true) => { app.ui.pop = null; app.ui.focusAfter = refocus ? `tb.${key}` : null; app.render(); };
  const box = h('div', { class: 'sim-pop', 'data-anim': 'pop-' + key, role: 'dialog', 'aria-label': { clipboard: 'Presse-papiers', vault: 'Gestionnaire de mots de passe', credentials: 'Identifiants mémorisés par Git', clock: 'Horloge du scénario' }[key], tabindex: '-1' },
    h('div', { class: 'sim-pop-head' }, h('h2', {}, { clipboard: 'Presse-papiers', vault: 'Mots de passe', credentials: 'Identifiants mémorisés par Git', clock: 'Horloge du scénario' }[key]),
      btn('Fermer', { icon: 'x', hideLabel: true, cls: 'sim-icon-btn', on: () => close() })),
    ...({ clipboard: popClipboard, vault: popVault, credentials: popCredentials, clock: popClock }[key](app, close)));
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  return box;
}

function popClipboard(app) {
  const c = app.w.clipboard;
  const reveal = app.ui.clipReveal;
  return [
    h('p', { class: 'sim-pop-note' }, 'Le presse-papiers du bac à sable garde la dernière valeur copiée, comme celui de ton ordinateur.'),
    !c ? h('p', {}, 'Vide.') : h('div', { class: 'sim-clip' },
      h('span', { class: 'sim-clip-kind' }, c.kind === 'token' ? 'Jeton d’entraînement' : 'Adresse'),
      h('code', { class: 'sim-clip-val' }, c.kind === 'token' && !reveal ? 'DEMO-TOKEN-' + '•'.repeat(12) : c.text),
      c.kind === 'token' ? btn(reveal ? 'Masquer' : 'Afficher', { icon: reveal ? 'eyeOff' : 'eye', cls: 'sim-btn sim-btn-small', on: () => { app.ui.clipReveal = !reveal; app.render(); } }) : null),
    c ? btn('Vider le presse-papiers', { cls: 'sim-btn sim-btn-small sim-btn-ghost', on: () => app.act((w) => { w.clipboard = null; return { summary: 'Presse-papiers vidé.' }; }) }) : null,
  ];
}

function popVault(app) {
  const w = app.w;
  const ui = app.ui;
  const clip = w.clipboard;
  const label = h('input', { id: 'vault-label', type: 'text', value: ui.vaultLabel ?? 'GitLab — jeton personnel', fk: 'vault.label', autocomplete: 'off', on: { input: (e) => { ui.vaultLabel = e.target.value; } } });
  const msg = ui.vaultMsg ? h('p', { class: 'sim-field-error', role: 'alert' }, ui.vaultMsg) : null;
  return [
    h('p', { class: 'sim-pop-note' }, 'Simulation d’un gestionnaire de mots de passe (KeePass, Bitwarden, trousseau…). Il ne contient que des valeurs fictives.'),
    w.vault.length ? h('ul', { class: 'sim-vault' }, w.vault.map((v) => h('li', {},
      h('span', { class: 'sim-vault-label' }, icon('lock'), v.label),
      h('code', {}, ui['reveal-' + v.id] ? v.value : 'DEMO-TOKEN-' + '•'.repeat(10)),
      h('span', { class: 'sim-vault-actions' },
        btn(ui['reveal-' + v.id] ? 'Masquer' : 'Afficher', { icon: ui['reveal-' + v.id] ? 'eyeOff' : 'eye', hideLabel: true, cls: 'sim-icon-btn', on: () => { ui['reveal-' + v.id] = !ui['reveal-' + v.id]; app.render(); } }),
        btn('Copier', { icon: 'copy', cls: 'sim-btn sim-btn-small', target: 'vault.copy', fk: 'vault.copy-' + v.id, on: (e) => app.copy('token', v.value, { source: 'vault', el: e.currentTarget }) }),
        btn('Supprimer', { icon: 'x', hideLabel: true, cls: 'sim-icon-btn', on: () => app.act((x) => E.vaultDelete(x, v.id), { summary: 'Entrée supprimée du gestionnaire de mots de passe.' }) }))))) : h('p', {}, 'Aucune entrée.'),
    h('form', { class: 'sim-vault-form', on: { submit: (e) => {
      e.preventDefault();
      if (!clip || classifySecret(clip.text) !== 'demo') { ui.vaultMsg = 'Le presse-papiers ne contient pas de jeton d’entraînement. Copie d’abord la valeur du jeton dans GitLab.'; app.render(); return; }
      ui.vaultMsg = null;
      app.act((x) => E.vaultSave(x, { label: ui.vaultLabel ?? 'GitLab — jeton personnel', value: clip.text }));
    } } },
    h('label', { for: 'vault-label' }, 'Nom de l’entrée'), label, msg,
    h('button', { type: 'submit', class: 'sim-btn sim-btn-primary sim-btn-small', 'data-target': 'vault.save', 'data-fk': 'vault.save' }, icon('save'), 'Enregistrer depuis le presse-papiers')),
  ];
}

function popCredentials(app) {
  const w = app.w;
  return [
    h('p', { class: 'sim-pop-note', html: md('Git confie les identifiants à un **gestionnaire d’identifiants** (credential helper). Selon le système : Gestionnaire d’identification Windows (Git Credential Manager), Trousseau macOS, ou un helper `cache` / `store` sous Linux et dans Onyxia ou Coder.') }),
    w.credentials.length ? h('ul', { class: 'sim-creds' }, w.credentials.map((c) => {
      const t = w.tokens.find((x) => x.id === c.tokenId);
      return h('li', {}, h('span', {}, h('strong', {}, `https://${c.host}`), h('br'), `utilisateur : ${c.username} · jeton : « ${t ? t.name : '?'} »`),
        btn('Supprimer', { cls: 'sim-btn sim-btn-small', target: 'cred.delete', on: () => app.act((x) => E.deleteCredential(x, c.host)) }));
    })) : h('p', {}, 'Aucun identifiant mémorisé : Git les demandera à la prochaine opération sur GitLab.'),
    h('p', { class: 'sim-pop-note' }, 'Le jeton lui-même n’est pas affiché ici.'),
  ];
}

function popClock(app) {
  const w = app.w;
  return [
    h('p', {}, 'Date du scénario : ', h('strong', {}, frDate(w.today))),
    h('p', { class: 'sim-pop-note' }, 'Cette horloge ne concerne que la simulation. Elle permet d’observer l’expiration d’un jeton sans attendre.'),
    h('div', { class: 'sim-clock-btns' }, [1, 7, 30].map((d) => btn(`+${d} jour${d > 1 ? 's' : ''}`, { cls: 'sim-btn sim-btn-small', fk: 'clock+' + d, on: () => app.act((x) => E.advanceClock(x, d)) }))),
  ];
}

// ---------------------------------------------------------------------
// Champ de jeton : n'accepte que des jetons d'entraînement.
// Toute autre saisie est effacée sans être conservée ni reproduite.
// ---------------------------------------------------------------------

export const SECRET_MSG = {
  real: 'Ce bac à sable n’accepte que les jetons d’entraînement (DEMO-TOKEN-…). Ta saisie a été effacée. Ne saisis jamais un vrai jeton ici.',
  other: 'Ce champ attend un jeton d’entraînement (DEMO-TOKEN-…). Ta saisie a été effacée sans être conservée.',
  empty: 'Colle la valeur du jeton.',
  noclip: 'Le presse-papiers ne contient pas de jeton d’entraînement. Retrouve ton jeton dans « Mots de passe » (barre d’outils) et copie-le.',
};

/**
 * Construit un champ mot de passe sûr. state : objet d'interface où ranger
 * la valeur courante (jamais persistée). Renvoie { wrap, input, read() }.
 */
export function secretField(app, { id, state, key = 'secret', label, onEnter, cls = '', fk }) {
  const errId = id + '-err';
  const input = h('input', {
    id, type: state.show ? 'text' : 'password', class: 'sim-secret-input', autocomplete: 'off', spellcheck: 'false', fk: fk || id, target: 'auth.password',
    value: state[key] || '', 'aria-describedby': state.err ? errId : null, 'aria-invalid': state.err ? 'true' : null,
    on: {
      input: (e) => { state[key] = e.target.value; },
      paste: (e) => {
        const t = (e.clipboardData || window.clipboardData).getData('text');
        const k = classifySecret(t);
        if (k !== 'demo') { e.preventDefault(); state[key] = ''; state.err = SECRET_MSG[k === 'empty' ? 'empty' : k]; app.render(); }
      },
      keydown: (e) => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(); } },
    },
  });
  const paste = btn('Coller le jeton d’entraînement', { icon: 'clipboard', cls: 'sim-btn sim-btn-small', target: 'auth.paste', fk: (fk || id) + '-paste', on: () => {
    const c = app.w.clipboard;
    if (c && classifySecret(c.text) === 'demo') { state[key] = c.text.trim(); state.err = null; } else state.err = SECRET_MSG.noclip;
    app.render();
  } });
  const toggle = btn(state.show ? 'Masquer la saisie' : 'Afficher la saisie', { icon: state.show ? 'eyeOff' : 'eye', hideLabel: true, cls: 'sim-icon-btn', fk: (fk || id) + '-show', on: () => { state.show = !state.show; app.render(); } });
  const wrap = h('div', { class: ['sim-secret', cls] },
    label ? h('label', { for: id }, label) : null,
    h('div', { class: 'sim-secret-row' }, input, toggle),
    state.err ? h('p', { class: 'sim-field-error', id: errId, role: 'alert' }, state.err) : null,
    paste);
  /** Lit et valide : renvoie la valeur si c'est un jeton d'entraînement, sinon efface et signale. */
  const read = () => {
    const v = state[key] || '';
    const k = classifySecret(v);
    if (k === 'demo') { state.err = null; return v.trim(); }
    state[key] = '';
    state.err = SECRET_MSG[k];
    return null;
  };
  return { wrap, input, read };
}

// ---------------------------------------------------------------------
// Sélecteur de dossier (destination d'un clonage, ouverture d'un dossier)
// ---------------------------------------------------------------------

export function folderPicker(app, { state, title, button, onPick, onCancel, cls = '', note }) {
  const w = app.w;
  const cur = state.dir || w.ws.home;
  const kids = w.ws.dirs.filter((d) => d !== cur && dirname(d) === cur).sort();
  const go = (d) => { state.dir = d; app.render(); };
  return h('div', { class: ['sim-picker', cls] },
    h('p', { class: 'sim-picker-title' }, title),
    h('div', { class: 'sim-picker-path' }, icon('folder'), h('code', {}, tildify(cur, w.ws.home)),
      cur !== '/' && cur !== '/home' ? btn('Dossier parent', { icon: 'up', cls: 'sim-btn sim-btn-small', fk: 'pick.up', on: () => go(dirname(cur)) }) : null),
    h('ul', { class: 'sim-picker-list', role: 'list' }, kids.length ? kids.map((d) => h('li', {}, h('button', { type: 'button', class: 'sim-picker-item', fk: 'pick.' + d, target: 'pick.' + basename(d), on: { click: () => go(d) } }, icon('folder'), basename(d), w.ws.repos[d] ? h('span', { class: 'sim-picker-tag' }, 'dépôt Git') : null))) : h('li', { class: 'sim-picker-empty' }, 'Aucun sous-dossier')),
    note ? h('p', { class: 'sim-pop-note' }, note) : null,
    h('div', { class: 'sim-picker-actions' },
      btn('Annuler', { cls: 'sim-btn', fk: 'pick.cancel', on: onCancel }),
      btn(button, { cls: 'sim-btn sim-btn-primary', target: 'pick.ok', fk: 'pick.ok', on: () => onPick(cur) })));
}
