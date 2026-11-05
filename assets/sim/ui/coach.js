// =====================================================================
// Le coach : objectif, consigne, aide à trois niveaux, ce qui vient de
// changer, visualisation des quatre zones et débrief.
// =====================================================================

import * as E from '../engine/engine.js';
import * as P from '../core/progress.js';
import { MODES } from '../scenarios/index.js';
import { GLOSSARY } from '../scenarios/glossary.js';
import { h, btn, icon, md, mdEl, append } from './dom.js';
import { frDate } from '../engine/util.js';

const TOOL_LABEL = { gitlab: 'Dans GitLab', ide: null, any: 'GitLab ou ton IDE' };
const pick = P.pick;

export function renderCoach(app) {
  const m = app.mission;
  const prog = app.prog;
  const mode = app.mode;
  const ide = app.ide;
  const ev = P.evaluate(app.store, m, ide);
  const current = ev.current;
  const kicker = m.group === 'm6' ? `Exercice ${m.num} · ${MODES.depannage.label}` : `Mission ${m.num} · ${MODES[mode].label}`;

  const parts = [
    h('div', { class: 'coach-head' },
      h('p', { class: 'coach-kicker' }, kicker),
      h('h2', { class: 'coach-title', tabindex: '-1' }, m.title)),
    h('section', { class: 'coach-objective', 'aria-label': 'Objectif' },
      h('h3', { class: 'coach-label' }, icon('target'), 'Objectif'),
      mdEl('p', pick(m.objective, ide)),
      m.why && mode !== 'autonome' ? mdEl('p', m.why, { class: 'coach-why' }) : null),
  ];

  if (app.needsSetup) {
    parts.push(h('section', { class: 'coach-card coach-setup' },
      mdEl('p', 'Cette mission part d’une situation précise (projet, jeton, dépôt…) que ton simulateur ne contient pas encore. Tu peux la préparer automatiquement, ou revenir à la mission précédente.'),
      btn('Préparer la situation de départ', { cls: 'sim-btn sim-btn-primary', target: 'coach.prepare', on: () => app.prepare() })));
    parts.push(renderFlow(app));
    return parts;
  }

  if (m.situation) {
    parts.push(h('section', { class: 'coach-situation', 'aria-label': 'Situation' }, h('h3', { class: 'coach-label' }, icon('alert'), 'Situation'), mdEl('p', m.situation),
      m.clockHint ? h('p', { class: 'coach-small' }, 'Date du scénario : ', h('strong', {}, frDate(app.w.today)), '. L’horloge de la barre d’outils permet de la faire avancer.') : null));
  }

  if (ev.complete) parts.push(renderDebrief(app));
  else if (mode === 'autonome') parts.push(renderAutonomous(app, current));
  else parts.push(renderSteps(app, current));

  if (!ev.complete && current) parts.push(renderHelp(app, current));
  parts.push(renderChanged(app));
  parts.push(renderFlow(app));
  return parts;
}

function toolChip(app, step) {
  if (!step.tool || step.tool === 'any') return h('span', { class: 'coach-tool' }, icon('hand'), 'Où agir : GitLab ou ton IDE');
  const label = step.tool === 'gitlab' ? 'GitLab' : (app.ide === 'rstudio' ? 'RStudio' : 'VS Code');
  const active = (step.tool === 'gitlab') === (app.w.ui.tool === 'gitlab');
  return h('span', { class: ['coach-tool', active ? '' : 'is-elsewhere'] }, icon('hand'), 'Où agir : ', h('strong', {}, label),
    active ? null : btn(`Ouvrir ${label}`, { cls: 'coach-tool-go', on: () => app.setTool(step.tool === 'gitlab' ? 'gitlab' : 'ide') }));
}

function concepts(step) {
  if (!step.concepts || !step.concepts.length) return null;
  return h('div', { class: 'coach-concepts' }, step.concepts.filter((k) => GLOSSARY[k]).map((k) => h('details', { class: 'coach-concept' },
    h('summary', {}, GLOSSARY[k].term),
    h('p', {}, GLOSSARY[k].def, ' ', h('a', { href: `glossaire.html#${k}`, target: '_blank', rel: 'noopener' }, 'Glossaire')))));
}

function warning(app, step) {
  const text = P.warningFor(app.store, app.mission, app.ide, step);
  const t = pick(text, app.ide);
  return t ? h('div', { class: 'coach-warn', role: 'note' }, icon('alert'), mdEl('p', t)) : null;
}

function renderSteps(app, current) {
  const m = app.mission;
  const prog = app.prog;
  const ide = app.ide;
  const total = m.steps.length;
  const doneCount = m.steps.filter((s) => prog.steps[s.id]).length;
  const list = h('ol', { class: 'coach-steps' });
  m.steps.forEach((s, i) => {
    const done = !!prog.steps[s.id];
    const isCur = current && s.id === current.id;
    const li = h('li', { class: ['coach-step', done ? 'is-done' : isCur ? 'is-current' : 'is-next'], 'aria-current': isCur ? 'step' : null });
    const mark = h('span', { class: 'coach-step-mark', 'aria-hidden': 'true' }, done ? icon('check') : String(i + 1));
    if (done) {
      const res = pick(s.result, ide), exp = pick(s.explain, ide);
      append(li, [h('details', { class: 'coach-step-done', open: app.ui.justDone === s.id ? true : null },
        h('summary', {}, mark, h('span', { class: 'coach-step-title' }, s.title), h('span', { class: 'sr-only' }, ' — réussie')),
        res ? h('p', { class: 'coach-result' }, h('span', { class: 'coach-mini' }, 'Résultat observé'), h('span', { html: md(res) })) : null,
        s.software ? h('pre', { class: 'coach-software', 'aria-label': 'Message reproduit du logiciel' }, s.software) : null,
        exp ? h('p', { class: 'coach-explain' }, h('span', { class: 'coach-mini' }, 'Pourquoi'), h('span', { html: md(exp) })) : null,
        s.kind === 'quiz' ? quizFeedback(m, s, prog) : null)]);
    } else if (isCur) {
      append(li, [h('div', { class: 'coach-step-head' }, mark, h('h3', { class: 'coach-step-title' }, s.title)),
        s.kind === 'quiz' ? null : toolChip(app, s),
        s.kind === 'quiz' ? renderQuiz(app, s) : (s.guide ? mdEl('p', pick(s.guide, ide), { class: 'coach-guide' }) : null),
        warning(app, s),
        concepts(s)]);
    } else {
      li.append(h('div', { class: 'coach-step-head' }, mark, h('span', { class: 'coach-step-title' }, s.title)));
      const later = s.kind === 'quiz' ? null : warning(app, s);
      if (later) { li.classList.add('has-warn'); li.append(later); }
    }
    list.append(li);
  });
  return h('section', { class: 'coach-progress', 'aria-label': 'Étapes' },
    h('div', { class: 'coach-meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(doneCount), 'aria-label': 'Étapes réussies' },
      h('span', { style: { width: `${(doneCount / total) * 100}%` } })),
    list);
}

function renderAutonomous(app, current) {
  const m = app.mission;
  const prog = app.prog;
  const done = m.steps.filter((s) => prog.steps[s.id] && s.kind !== 'quiz');
  const actions = m.steps.filter((s) => s.kind !== 'quiz');
  const quizzes = m.steps.filter((s) => s.kind === 'quiz');
  return h('section', { class: 'coach-progress coach-auto', 'aria-label': 'Résultats vérifiés' },
    h('p', { class: 'coach-auto-count' }, h('strong', {}, `${done.length} / ${actions.length}`), ' résultats vérifiés'),
    h('div', { class: 'coach-meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(actions.length), 'aria-valuenow': String(done.length), 'aria-label': 'Résultats vérifiés' }, h('span', { style: { width: `${(done.length / actions.length) * 100}%` } })),
    done.length ? h('ul', { class: 'coach-auto-list' }, done.map((s) => h('li', {}, icon('check'), s.title))) : h('p', { class: 'coach-small' }, 'Les résultats apparaîtront ici à mesure que le simulateur les constate.'),
    current && current.kind !== 'quiz' ? warning(app, current) : null,
    quizzes.length ? h('div', { class: 'coach-auto-quiz' }, h('h3', { class: 'coach-label' }, icon('help'), 'Questions de compréhension'),
      quizzes.map((q) => (prog.steps[q.id] ? h('p', { class: 'coach-small' }, icon('check'), q.title) : renderQuiz(app, q)))) : null);
}

function renderQuiz(app, s) {
  const m = app.mission;
  const prog = app.prog;
  const name = `quiz-${m.id}-${s.id}`;
  const chosen = app.ui['quiz-' + name];
  const answered = prog.answers[s.id];
  const fb = answered ? s.options.find((o) => o.id === answered) : null;
  const form = h('form', { class: 'coach-quiz', on: { submit: (e) => {
    e.preventDefault();
    const val = form.querySelector('input:checked');
    if (!val) return;
    P.answer(app.store, m, s.id, val.value);
    app.act(() => ({}), { summary: P.isCorrect(m, s.id, val.value) ? 'Réponse juste.' : null });
    app.ui.focusAfter = 'quizfb-' + s.id;
    app.render();
  } } },
  h('fieldset', {}, h('legend', { html: md(s.question) }),
    s.options.map((o) => h('label', { class: ['coach-opt', answered === o.id ? (o.correct ? 'is-right' : 'is-wrong') : ''] },
      h('input', { type: 'radio', name, value: o.id, checked: (chosen || answered) === o.id, fk: `${name}-${o.id}`, on: { change: () => { app.ui['quiz-' + name] = o.id; } } }),
      h('span', { html: md(o.text) })))),
  fb ? h('div', { class: ['coach-fb', fb.correct ? 'is-right' : 'is-wrong'], role: 'status', tabindex: '-1', fk: 'quizfb-' + s.id }, icon(fb.correct ? 'check' : 'info'), h('span', { html: md(fb.feedback) })) : null,
  h('button', { type: 'submit', class: 'sim-btn sim-btn-primary sim-btn-small', fk: 'quizgo-' + s.id }, answered && !fb.correct ? 'Vérifier une autre réponse' : 'Vérifier'));
  return form;
}

function quizFeedback(m, s, prog) {
  const o = s.options.find((x) => x.id === prog.answers[s.id]);
  return o ? h('p', { class: 'coach-explain' }, h('span', { class: 'coach-mini' }, 'Réponse'), h('span', { html: md(o.text + ' — ' + o.feedback) })) : null;
}

const LEVELS = [
  { n: 1, label: 'Un indice', ic: 'light' },
  { n: 2, label: 'Où regarder', ic: 'search' },
  { n: 3, label: 'Montrer le geste', ic: 'hand' },
];

function renderHelp(app, step) {
  const m = app.mission;
  const ide = app.ide;
  const hint = app.ui.hint && app.ui.hint.step === step.id && app.ui.hint.mission === m.id ? app.ui.hint : null;
  const hints = step.hints || [];
  let body = null;
  if (hint) {
    const raw = hints[hint.level - 1];
    if (hint.level < 3) body = mdEl('p', pick(raw, ide) || 'Aucune indication supplémentaire pour cette étape.');
    else if (raw) {
      const text = pick(raw.text, ide);
      body = h('div', {}, mdEl('p', text),
        h('p', { class: 'coach-small' }, 'L’élément concerné est entouré dans le simulateur, quand il est visible à l’écran. Ce geste reste à faire : l’aide ne valide pas l’étape.'));
    }
  }
  return h('section', { class: 'coach-help', 'aria-label': 'Aide' },
    h('h3', { class: 'coach-label' }, icon('help'), 'Besoin d’aide ?'),
    h('div', { class: 'coach-help-btns' }, LEVELS.map((L) => btn(L.label, {
      icon: L.ic, cls: ['sim-btn', 'sim-btn-small', hint && hint.level === L.n ? 'is-on' : ''].join(' '), fk: `help-${L.n}`, target: `coach.help-${L.n}`,
      attrs: { 'aria-pressed': String(!!(hint && hint.level === L.n)) },
      on: () => {
        app.ui.hint = { mission: m.id, step: step.id, level: L.n };
        P.useHint(app.store, m, step.id, L.n);
        app.save();
        if (L.n === 3 && hints[2]) {
          const t = hints[2].targets;
          app.showGesture(Array.isArray(t) ? t : (t ? t[ide] || [] : []), pick(hints[2].text, ide));
        } else { app.ui.spot = null; app.render(); }
      },
    }))),
    body ? h('div', { class: 'coach-hint', 'data-anim': `hint-${m.id}-${step.id}-${hint.level}`, role: 'status' }, body) : null,
    step.kind !== 'quiz' && step.tool === 'ide' ? equivalent(app, step) : null);
}

/** L'équivalent dans l'autre IDE (consultable sans changer d'interface). */
function equivalent(app, step) {
  const other = app.ide === 'vscode' ? 'rstudio' : 'vscode';
  const g = step.guide && typeof step.guide === 'object' ? step.guide[other] : null;
  if (!g) return null;
  return h('details', { class: 'coach-equiv' }, h('summary', {}, `Le même geste dans ${other === 'rstudio' ? 'RStudio' : 'VS Code'}`), mdEl('p', g));
}

function renderChanged(app) {
  const c = app.ui.changed;
  return h('section', { class: 'coach-changed', 'aria-label': 'Ce qui vient de changer' },
    h('h3', { class: 'coach-label' }, icon('sync'), 'Ce qui vient de changer'),
    h('div', { role: 'status', 'aria-live': 'polite', class: 'coach-changed-body', key: c ? c.at : 0 },
      c ? [
        c.steps && c.steps.length ? h('p', { class: 'coach-validated', 'data-anim': 'val-' + c.at }, icon('check'), c.steps.length > 1 ? 'Étapes réussies : ' : 'Étape réussie : ', h('strong', {}, c.steps.join(' · '))) : null,
        c.summary ? mdEl('p', c.summary) : null,
      ] : h('p', { class: 'coach-small' }, 'Les effets de tes gestes sur le projet s’afficheront ici.')));
}

function renderFlow(app) {
  const w = app.w;
  const m = app.mission;
  const repo = E.currentRepo(w, app.ide) || Object.values(w.ws.repos).find((r) => m.params && r.remote.url === E.httpsUrl(m.params.ns || 'stagiaire', m.params.project)) || null;
  const f = repo ? E.flowOf(w, repo.path) : null;
  const p = m.params && E.getProject(w, m.params.ns || 'stagiaire', m.params.project);
  const pulse = new Set(app.ui.pulse || []);
  app.ui.pulse = [];
  const zone = (key, title, value, detail, ic) => h('li', { class: ['flow-zone', 'flow-' + key, pulse.has(key) ? 'is-pulse' : ''] },
    h('span', { class: 'flow-ico' }, icon(ic)), h('span', { class: 'flow-title' }, title), h('strong', { class: 'flow-value' }, value), h('span', { class: 'flow-detail' }, detail));
  const items = f ? [
    zone('working', 'Fichiers', String(f.working.length), f.working.length ? f.working.map((x) => x.path).join(', ') : 'rien à préparer', 'file'),
    zone('staged', 'Préparé', String(f.staged.length), f.staged.length ? f.staged.map((x) => x.path).join(', ') : 'vide', 'check'),
    zone('local', 'Local', `${f.local}`, f.ahead ? `${f.ahead} à envoyer` : 'à jour', 'commit'),
    zone('remote', 'GitLab', `${f.remote}`, f.remoteHead ? `dernier : ${f.remoteHead}` : '—', 'gitlab'),
  ] : [
    zone('working', 'Fichiers', '—', 'pas de dépôt local', 'file'),
    zone('staged', 'Préparé', '—', '', 'check'),
    zone('local', 'Local', '—', 'non cloné', 'commit'),
    zone('remote', 'GitLab', p ? String(p.commits.length) : '—', p ? 'commit(s)' : 'pas de projet', 'gitlab'),
  ];
  return h('section', { class: 'coach-flow', 'aria-label': 'Où en est mon travail' },
    h('h3', { class: 'coach-label' }, 'Où en est mon travail', repo ? h('span', { class: 'flow-path' }, repo.path.replace('/home/stagiaire', '~')) : null),
    h('ol', { class: 'flow' }, items));
}

function renderDebrief(app) {
  const m = app.mission;
  const prog = app.prog;
  const hints = Object.entries(prog.hints || {});
  const isLast = m.id === 'm7';
  const notesKey = 'notes';
  return h('section', { class: 'coach-debrief', 'aria-label': 'Débrief' },
    h('p', { class: 'coach-done' }, icon('check'), m.group === 'm6' ? 'Exercice réussi' : 'Mission réussie'),
    mdEl('p', m.debrief.summary, { class: 'coach-debrief-sum' }),
    h('ol', { class: 'coach-steps coach-steps-compact' }, m.steps.map((s) => h('li', { class: 'coach-step is-done' }, h('span', { class: 'coach-step-mark' }, icon('check')), h('span', { class: 'coach-step-title' }, s.title),
      prog.hints[s.id] ? h('span', { class: 'coach-hint-used' }, prog.hints[s.id] === 3 ? 'geste montré' : prog.hints[s.id] === 2 ? 'avec repère' : 'avec indice') : null))),
    h('h3', { class: 'coach-label' }, icon('help'), 'Pour le débrief'),
    m.debrief.questions.map((q) => h('details', { class: 'coach-q' }, h('summary', { html: md(q.q) }), h('p', { html: md(q.a) }))),
    isLast ? h('div', { class: 'coach-notes' },
      h('label', { for: 'coach-notes' }, 'Explique la démarche avec tes mots'),
      h('textarea', { id: 'coach-notes', rows: '5', fk: 'coach-notes', value: prog.notes || '', on: { input: (e) => { prog.notes = e.target.value.slice(0, 2000); app.save(); } } }),
      h('p', { class: 'coach-small' }, 'Ce texte reste dans ce navigateur. N’y écris aucun identifiant réel.')) : null,
    h('div', { class: 'coach-debrief-actions' },
      isLast ? h('a', { class: 'sim-btn sim-btn-primary', href: 'dans-mes-outils.html' }, 'Je le fais dans mes outils', icon('arrowR'))
        : btn('Mission suivante', { icon: 'arrowR', cls: 'sim-btn sim-btn-primary', target: 'coach.next', on: () => app.next() }),
      hints.length ? h('p', { class: 'coach-small' }, `Aides consultées : ${hints.length} étape(s). Rejouer la mission sans aide est un bon entraînement.`) : null));
}
