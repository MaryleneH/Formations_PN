// =====================================================================
// Progression : relie les scénarios à l'état du simulateur.
// Fonctions pures (sans DOM) : testables sous Node.
// =====================================================================

import * as E from '../engine/engine.js';
import { CATALOG, byId, modeFor } from '../scenarios/index.js';

export const STORE_VERSION = 1;

export function blankStore() {
  return { v: STORE_VERSION, prefs: { ide: 'vscode', mode: 'guide', focus: false }, active: 'm1', worlds: {}, progress: {} };
}

export function freshProgress() {
  return { status: 'todo', since: null, steps: {}, answers: {}, hints: {}, startedAt: null, doneAt: null, notes: '' };
}

/** Construit le monde de départ d'une mission (monde vierge + situation initiale). */
export function buildWorld(mission, ide) {
  const w = E.blankWorld(mission.world, mission.worldOptions || {});
  if (mission.setup) mission.setup(w, { ide });
  for (const t of w.tokens) t.displayed = false;
  w.ui = { tool: mission.steps[0] && mission.steps[0].tool === 'ide' ? 'ide' : 'gitlab', gitlab: { route: 'projects' } };
  return w;
}

/** Contexte passé aux prédicats des étapes. */
export function makeCtx(w, mission, ide, prog) {
  const since = prog && prog.since !== null ? prog.since : 0;
  const ev = (type, pred = () => true) => w.events.filter((e) => e.type === type && e.n >= since && pred(e));
  return {
    w, ide, m: mission.params || {}, since,
    ev, has: (type, pred) => ev(type, pred).length > 0,
    answered: (id) => !!(prog && prog.answers[id] && isCorrect(mission, id, prog.answers[id])),
  };
}

export function isCorrect(mission, stepId, optionId) {
  const s = mission.steps.find((x) => x.id === stepId);
  const o = s && s.options && s.options.find((x) => x.id === optionId);
  return !!(o && o.correct);
}

/**
 * Entre dans une mission. Renvoie { mission, world, prog, needsSetup }.
 * Ne reconstruit jamais un monde existant sans demande explicite.
 */
export function enter(store, id, ide) {
  const mission = byId(id) || CATALOG[0];
  store.active = mission.id;
  const prog = (store.progress[mission.id] ||= freshProgress());
  let w = store.worlds[mission.world];
  if (!w) {
    w = store.worlds[mission.world] = buildWorld(mission, ide);
    prog.since = w.seq;
  }
  const needsSetup = prog.status !== 'done' && prog.since === null && !!mission.ready && !mission.ready(w);
  if (!needsSetup && prog.since === null) prog.since = w.seq;
  if (prog.status === 'todo' && !needsSetup) { prog.status = 'started'; prog.startedAt = w.today; }
  return { mission, world: w, prog, needsSetup };
}

/** Recommence une mission : reconstruit son monde, efface SA progression, garde les autres. */
export function restart(store, id, ide) {
  const mission = byId(id);
  store.progress[mission.id] = freshProgress();
  const w = store.worlds[mission.world] = buildWorld(mission, ide);
  const prog = store.progress[mission.id];
  prog.since = w.seq;
  prog.status = 'started';
  prog.startedAt = w.today;
  // Les missions qui partagent ce monde et qui ne sont pas terminées repartiront de là.
  for (const m of CATALOG) {
    if (m.id !== mission.id && m.world === mission.world && store.progress[m.id] && store.progress[m.id].status !== 'done') {
      store.progress[m.id] = freshProgress();
    }
  }
  return enter(store, id, ide);
}

/** Évalue les étapes. Une étape validée le reste (même si l'état évolue ensuite). */
export function evaluate(store, mission, ide) {
  const w = store.worlds[mission.world];
  const prog = store.progress[mission.id];
  if (!w || !prog || prog.since === null) return { newly: [], current: null, complete: false };
  const ctx = makeCtx(w, mission, ide, prog);
  const newly = [];
  for (const s of mission.steps) {
    if (prog.steps[s.id]) continue;
    let ok = false;
    if (s.kind === 'quiz') ok = ctx.answered(s.id);
    else { try { ok = !!s.done(ctx); } catch (e) { ok = false; } }
    if (ok) { prog.steps[s.id] = w.seq; newly.push(s.id); }
  }
  const complete = mission.steps.every((s) => prog.steps[s.id]);
  if (complete && prog.status !== 'done') { prog.status = 'done'; prog.doneAt = w.today; }
  const current = mission.steps.find((s) => !prog.steps[s.id]) || null;
  return { newly, current, complete, ctx };
}

/** Avertissement contextuel de l'étape courante (texte ou null). */
export function warningFor(store, mission, ide, step) {
  if (!step || !step.warn) return null;
  const w = store.worlds[mission.world];
  try { return step.warn(makeCtx(w, mission, ide, store.progress[mission.id])); } catch (e) { return null; }
}

export function answer(store, mission, stepId, optionId) {
  const prog = store.progress[mission.id];
  prog.answers[stepId] = optionId;
  return isCorrect(mission, stepId, optionId);
}

export function useHint(store, mission, stepId, level) {
  const prog = store.progress[mission.id];
  prog.hints[stepId] = Math.max(prog.hints[stepId] || 0, level);
}

/** Choix d'un texte selon l'IDE : 'x' ou { vscode, rstudio }. */
export const pick = (v, ide) => (v && typeof v === 'object' && !Array.isArray(v) && ('vscode' in v || 'rstudio' in v) ? v[ide] || v.vscode : v);

export { modeFor };

/** Résumé pour l'accueil et le menu : statut de chaque mission. */
export function summary(store) {
  return CATALOG.map((m) => {
    const p = store.progress[m.id];
    const done = p ? m.steps.filter((s) => p.steps[s.id]).length : 0;
    return { id: m.id, title: m.title, status: p ? p.status : 'todo', done, total: m.steps.length };
  });
}

// ---------------------------------------------------------------------
// Persistance : sérialisation défensive (le stockage peut être absent).
// Les mondes ne contiennent que des valeurs fictives : jetons DEMO-TOKEN-
// générés par le simulateur, jamais une saisie arbitraire.
// ---------------------------------------------------------------------

export function serialize(store) { return JSON.stringify(store); }

export function deserialize(text) {
  try {
    const s = JSON.parse(text);
    if (!s || s.v !== STORE_VERSION || typeof s.worlds !== 'object' || typeof s.progress !== 'object') return null;
    s.prefs = { ...blankStore().prefs, ...(s.prefs || {}) };
    if (!byId(s.active)) s.active = 'm1';
    return s;
  } catch (e) { return null; }
}
