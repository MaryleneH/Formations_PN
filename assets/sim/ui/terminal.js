// Terminal intégré (VS Code et RStudio) : affiche, n'exécute rien de réel.
import * as S from '../engine/shell.js';
import { redact, classifySecret } from '../engine/util.js';
import { h, btn, icon } from './dom.js';
import { SECRET_MSG } from './tools.js';

export function termState(app, ide) {
  const key = `${app.w.key}:${ide}`;
  return (app.ui.terms[key] ||= {
    lines: [{ text: 'Terminal simulé : tape help pour la liste des commandes reconnues. Rien n’est exécuté sur ta machine.', cls: 'sim' }],
    pending: null, input: '', history: [], hidx: -1,
  });
}

/** Exécute une ligne comme si elle avait été tapée (utilisé aussi par « Montrer » dans les tests). */
export function submit(app, ide, raw) {
  const t = termState(app, ide);
  const value = raw ?? t.input;
  t.input = '';
  t.hidx = -1;
  app.act((w) => {
    let res;
    if (t.pending) {
      const p = t.pending;
      t.pending = null;
      if (p.kind === 'password') {
        t.lines.push({ text: p.label, cls: 'prompt-q' });
        const k = classifySecret(value);
        if (k !== 'demo') {
          t.lines.push({ text: 'ⓘ ' + (SECRET_MSG[k] || SECRET_MSG.other), cls: 'sim' });
          t.lines.push({ text: 'fatal: Authentication failed (saisie écartée par le simulateur)', cls: 'err' });
          return { summary: null };
        }
      } else t.lines.push({ text: p.label + redact(value), cls: 'prompt-q' });
      res = p.next(value);
    } else {
      if (value.trim()) { t.history.push(value); if (t.history.length > 50) t.history.shift(); }
      t.lines.push({ text: `${S.promptString(w)} ${redact(value)}`, cls: 'cmd' });
      res = S.run(w, value, { via: 'terminal', ide });
    }
    if (res.clear) t.lines = [];
    for (const l of res.out || []) t.lines.push(l);
    if (t.lines.length > 400) t.lines.splice(0, t.lines.length - 400);
    t.pending = res.pending || null;
    return { summary: res.summary };
  });
}

export function renderTerminal(app, ide, { fk = 'term', label = 'Terminal' } = {}) {
  const w = app.w;
  const t = termState(app, ide);
  const isPw = t.pending && t.pending.kind === 'password';
  const input = h('input', {
    type: isPw ? 'password' : 'text', class: 'term-input', value: t.input, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    'aria-label': t.pending ? t.pending.label : `Commande (${S.promptString(w)})`, fk: fk + '-input', target: ide === 'rstudio' ? 'rs.terminal-input' : 'vs.terminal-input',
    on: {
      input: (e) => { t.input = e.target.value; },
      keydown: (e) => {
        if (e.key === 'Enter') { e.preventDefault(); submit(app, ide); }
        else if (e.key === 'ArrowUp' && !t.pending && t.history.length) { e.preventDefault(); t.hidx = t.hidx < 0 ? t.history.length - 1 : Math.max(0, t.hidx - 1); e.target.value = t.input = t.history[t.hidx]; }
        else if (e.key === 'ArrowDown' && !t.pending && t.hidx >= 0) { e.preventDefault(); t.hidx = t.hidx + 1 >= t.history.length ? -1 : t.hidx + 1; e.target.value = t.input = t.hidx < 0 ? '' : t.history[t.hidx]; }
        else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); t.lines = []; app.render(); }
        else if (e.key === 'c' && e.ctrlKey && t.pending) { e.preventDefault(); t.pending = null; t.lines.push({ text: '^C', cls: '' }); app.render(); }
      },
    },
  });
  const promptText = t.pending ? t.pending.label : S.promptString(w) + ' ';
  return h('div', { class: 'term', role: 'group', 'aria-label': label },
    h('div', { class: 'term-out', role: 'log', 'aria-live': 'polite', 'data-autoscroll': '', tabindex: '0', 'aria-label': 'Sortie du terminal' },
      t.lines.map((l) => h('div', { class: ['term-line', l.cls ? 't-' + l.cls : ''] }, l.text || ' '))),
    h('div', { class: 'term-prompt' }, h('label', { class: 'term-ps', 'aria-hidden': 'true' }, promptText), input),
    isPw ? h('div', { class: 'term-pw-help' }, h('span', {}, 'Saisie masquée, comme dans un vrai terminal.'),
      btn('Coller le jeton d’entraînement', { icon: 'clipboard', cls: 'sim-btn sim-btn-small', target: 'auth.paste', fk: fk + '-paste', on: () => {
        const c = app.w.clipboard;
        if (c && classifySecret(c.text) === 'demo') { t.input = c.text.trim(); app.render(); }
        else { t.lines.push({ text: 'ⓘ ' + SECRET_MSG.noclip, cls: 'sim' }); app.render(); }
      } })) : null);
}
