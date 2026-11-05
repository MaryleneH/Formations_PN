// =====================================================================
// Contrôleur du bac à sable : relie le moteur, la progression et les vues.
// Toute modification passe par app.act(fn) : l'opération s'applique au
// monde, la progression est réévaluée, l'état est enregistré, les vues
// sont redessinées et « ce qui vient de changer » est annoncé.
// =====================================================================

import * as E from '../engine/engine.js';
import * as P from '../core/progress.js';
import { byId, modeFor, MODES, GROUPS, CATALOG } from '../scenarios/index.js';
import { h, btn, icon, md, mdEl, trapFocus, prefersReducedMotion, append } from './dom.js';
import { renderCoach } from './coach.js';
import { renderToolbar } from './tools.js';
import { renderGitLab } from './gitlab.js';
import { renderVSCode } from './vscode.js';
import { renderRStudio } from './rstudio.js';

const KEY = 'git-bac-a-sable/v1';
const IDE_LABEL = { vscode: 'VS Code', rstudio: 'RStudio' };

// ---------------------------------------------------------------------
// Stockage : facultatif. Sans stockage, la session continue en mémoire.
// ---------------------------------------------------------------------
const storage = {
  ok: null,
  load() {
    try { const t = window.localStorage.getItem(KEY); this.ok = true; return t ? P.deserialize(t) : null; } catch (e) { this.ok = false; return null; }
  },
  save(store) {
    try { window.localStorage.setItem(KEY, P.serialize(store)); this.ok = true; } catch (e) { this.ok = false; }
  },
  clear() { try { window.localStorage.removeItem(KEY); } catch (e) { /* rien */ } },
};

export class App {
  constructor(root) {
    this.root = root;
    this.store = storage.load() || P.blankStore();
    this.resumed = !!(storage.ok && this.store.progress && Object.keys(this.store.progress).length);
    this.ui = { gitlab: {}, vscode: {}, rstudio: {}, terms: {}, buffers: {}, mobile: 'stage', changed: null, spot: null, drawer: false, modal: null, flash: null };
    const q = new URLSearchParams(location.search);
    if (q.get('ide') && IDE_LABEL[q.get('ide')]) this.store.prefs.ide = q.get('ide');
    if (q.get('mode') && MODES[q.get('mode')]) this.store.prefs.mode = q.get('mode');
    const asked = q.get('mission');
    this.enter(asked && byId(asked) ? asked : this.store.active, { silent: true });
    this.bindKeys();
    window.addEventListener('resize', () => this.placeSpot());
  }

  // ---- accès ----
  get ide() { return this.store.prefs.ide; }
  get mission() { return byId(this.store.active); }
  get w() { return this.store.worlds[this.mission.world]; }
  get prog() { return this.store.progress[this.mission.id]; }
  get mode() { return modeFor(this.mission, this.store.prefs.mode); }
  get storageOk() { return storage.ok !== false; }

  // ---- missions ----
  enter(id, { silent = false } = {}) {
    const r = P.enter(this.store, id, this.ide);
    this.needsSetup = r.needsSetup;
    this.ui.spot = null;
    this.ui.changed = null;
    this.ui.hint = null;
    this.ui.drawer = false;
    if (!this.needsSetup) P.evaluate(this.store, this.mission, this.ide);
    this.save();
    const u = new URL(location.href);
    u.searchParams.set('mission', this.mission.id);
    try { history.replaceState(null, '', u); } catch (e) { /* file:// */ }
    if (!silent) { this.render(); this.focusCoach(); }
  }

  prepare() {
    P.restart(this.store, this.mission.id, this.ide);
    this.needsSetup = false;
    this.ui.terms = {}; this.ui.buffers = {}; this.ui.vscode = {}; this.ui.rstudio = {}; this.ui.gitlab = {};
    this.announce({ summary: 'La situation de départ de la mission est prête.' });
    this.save(); this.render(); this.focusCoach();
  }

  restart() {
    const m = this.mission;
    this.confirm({
      title: `Recommencer la mission ${m.num} ?`,
      body: m.world === 'parcours'
        ? 'Le simulateur repart de la situation de départ de cette mission. Les missions déjà réussies restent marquées comme réussies.'
        : 'L’exercice repart de sa situation de départ. Ta progression dans les autres missions est conservée.',
      ok: 'Recommencer',
      onOk: () => this.prepare(),
    });
  }

  next() {
    const list = CATALOG.map((m) => m.id);
    const i = list.indexOf(this.mission.id);
    if (i >= 0 && i < list.length - 1) this.enter(list[i + 1]);
  }

  setPref(k, v) {
    this.store.prefs[k] = v;
    if (k === 'ide') { this.ui.spot = null; P.evaluate(this.store, this.mission, this.ide); }
    this.save();
    this.render();
  }

  resetAll() {
    this.confirm({
      title: 'Effacer toute la progression ?',
      body: 'Toutes les missions et tous les mondes simulés repartent de zéro, dans ce navigateur.',
      ok: 'Tout effacer', danger: true,
      onOk: () => { storage.clear(); this.store = P.blankStore(); this.ui.terms = {}; this.ui.buffers = {}; this.enter('m1'); },
    });
  }

  // ---- actions ----
  /** Applique une opération au monde courant, puis met tout à jour. */
  act(fn, opts = {}) {
    const w = this.w;
    const before = this.flowSnapshot();
    let res;
    try { res = fn(w) || {}; } catch (e) { console.error(e); res = { ok: false, summary: 'Une erreur interne du simulateur est survenue. Recommence la mission si l’affichage paraît incohérent.' }; }
    const ev = P.evaluate(this.store, this.mission, this.ide);
    const after = this.flowSnapshot();
    this.ui.pulse = Object.keys(after).filter((k) => after[k] !== before[k]);
    if (ev.newly.length || res.summary || opts.summary) {
      this.announce({ summary: opts.summary || res.summary, steps: ev.newly.map((id) => this.mission.steps.find((s) => s.id === id).title) });
    }
    if (ev.newly.length) { this.ui.spot = null; this.ui.justDone = ev.newly[ev.newly.length - 1]; this.ui.hint = null; }
    this.save();
    if (opts.render !== false) this.render();
    return res;
  }

  /** Événement sans changement d'état visible (ex. ouverture d'une page) — passe aussi par act. */
  track(type, data) { return this.act((w) => { E.emit(w, type, data); return {}; }); }

  announce(change) { this.ui.changed = { ...change, at: Date.now() }; }

  flowSnapshot() {
    const w = this.w;
    const repo = E.currentRepo(w, this.ide) || Object.values(w.ws.repos)[0];
    const f = repo ? E.flowOf(w, repo.path) : null;
    const p = this.mission.params && E.getProject(w, this.mission.params.ns || 'stagiaire', this.mission.params.project);
    return {
      working: f ? f.working.length : -1, staged: f ? f.staged.length : -1, local: f ? f.local * 100 + f.ahead : -1,
      remote: f ? f.remote : (p ? p.commits.length : -1),
    };
  }

  save() { storage.save(this.store); }

  // ---- outil actif ----
  setTool(tool) {
    if (this.w.ui.tool === tool) return;
    this.w.ui.tool = tool;
    this.save();
    this.render();
    const frame = this.root.querySelector('.sim-frame');
    if (frame && !prefersReducedMotion()) frame.classList.add('is-entering');
    const tab = this.root.querySelector(`[data-target="tb.tool-${tool === 'gitlab' ? 'gitlab' : 'ide'}"]`);
    if (tab) tab.focus();
  }

  // ---- presse-papiers : interne, avec copie système en complément ----
  copy(kind, text, meta = {}) {
    this.act((w) => E.copy(w, { kind, text, source: meta.source, tokenId: meta.tokenId }), { summary: kind === 'token' ? 'Valeur du jeton copiée dans le presse-papiers du bac à sable.' : 'Adresse copiée dans le presse-papiers du bac à sable.' });
    try { if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).catch(() => {}); } catch (e) { /* repli : presse-papiers interne */ }
    this.flash(meta.el, 'Copié');
  }

  flash(el, text) {
    if (!el || !el.isConnected) return;
    const tip = h('span', { class: 'sim-flash', role: 'status' }, icon('check'), text);
    el.after(tip);
    setTimeout(() => tip.remove(), 1600);
  }

  // ---- modales ----
  /** Ouvre une fenêtre modale ; le focus revient à l'élément d'origine à la fermeture. */
  modal({ title, body, actions = [], cls = '', label, onClose, initial }) {
    const returnTo = document.activeElement;
    const close = () => {
      layer.remove();
      this.ui.modal = null;
      if (onClose) onClose();
      const back = returnTo && returnTo.isConnected ? returnTo : (returnTo && returnTo.dataset && returnTo.dataset.fk ? this.root.querySelector(`[data-fk="${returnTo.dataset.fk}"]`) : null);
      if (back) back.focus();
    };
    const titleId = 'mdl-' + Math.random().toString(36).slice(2, 8);
    const box = h('div', { class: ['sim-modal', cls], role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
      h('div', { class: 'sim-modal-head' }, h('h2', { id: titleId, class: 'sim-modal-title' }, title),
        btn('Fermer', { icon: 'x', hideLabel: true, cls: 'sim-icon-btn', on: () => close() })),
      h('div', { class: 'sim-modal-body' }, body),
      actions.length ? h('div', { class: 'sim-modal-actions' }, actions.map((a) => btn(a.label, { cls: a.cls || (a.primary ? 'sim-btn sim-btn-primary' : 'sim-btn'), on: () => { if (a.onClick && a.onClick() === false) return; close(); }, target: a.target }))) : null);
    if (label) box.setAttribute('aria-label', label);
    const layer = h('div', { class: 'sim-modal-layer', on: { mousedown: (e) => { if (e.target === layer) close(); } } }, box);
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } trapFocus(box, e); });
    this.root.append(layer);
    this.ui.modal = { close };
    requestAnimationFrame(() => {
      const f = (initial && box.querySelector(initial)) || box.querySelector('input, textarea, select, .sim-btn-primary, button');
      if (f) f.focus();
    });
    return { close, box };
  }

  confirm({ title, body, ok, onOk, danger }) {
    this.modal({ title, body: h('p', { html: md(body) }), actions: [{ label: 'Annuler' }, { label: ok, primary: true, cls: danger ? 'sim-btn sim-btn-danger' : null, onClick: onOk }] });
  }

  // ---- mise en évidence (« Montrer le geste ») ----
  showGesture(targets, text) {
    this.ui.spot = { targets, text };
    // Si l'élément visé appartient à l'autre outil, on l'indique sans basculer automatiquement.
    this.render();
    const el = this.spotEl();
    if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }
  spotEl() {
    if (!this.ui.spot) return null;
    for (const t of this.ui.spot.targets) {
      const el = this.root.querySelector(`[data-target="${t}"]`);
      if (el && el.getClientRects().length) return el;
    }
    return null;
  }
  placeSpot() {
    const old = this.root.querySelectorAll('.is-spotlit');
    old.forEach((x) => x.classList.remove('is-spotlit'));
    const ring = this.root.querySelector('.sim-spot');
    const el = this.spotEl();
    if (!el) { if (ring) ring.hidden = true; return; }
    el.classList.add('is-spotlit');
    if (!ring) return;
    const r = el.getBoundingClientRect();
    const base = this.root.getBoundingClientRect();
    ring.hidden = false;
    Object.assign(ring.style, { left: `${r.left - base.left - 4}px`, top: `${r.top - base.top - 4}px`, width: `${r.width + 8}px`, height: `${r.height + 8}px` });
  }

  // ---- rendu ----
  render() {
    const active = document.activeElement;
    const fk = active && active.dataset ? active.dataset.fk : null;
    const sel = active && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd, active.scrollTop] : null;
    const scrolls = [...this.root.querySelectorAll('[data-keep-scroll]')].map((el) => [el.dataset.keepScroll, el.scrollTop]);
    const seen = new Set([...this.root.querySelectorAll('[data-anim]')].map((el) => el.dataset.anim));

    const prefs = this.store.prefs;
    this.root.className = 'sim';
    this.root.dataset.ide = this.ide;
    this.root.dataset.focus = prefs.focus ? 'on' : 'off';
    this.root.dataset.mobile = this.ui.mobile;
    document.body.classList.toggle('sim-focus-mode', !!prefs.focus);
    const modalLayer = this.root.querySelector('.sim-modal-layer');
    this.root.replaceChildren();
    append(this.root, [
      this.renderTop(),
      this.renderMobileSwitch(),
      h('div', { class: 'sim-body' },
        h('div', { class: 'sim-coach', role: 'complementary', 'aria-label': 'Consigne et aide', id: 'sim-coach', tabindex: '-1' }, renderCoach(this)),
        h('div', { class: 'sim-stage', role: 'region', 'aria-label': 'Simulateur', id: 'sim-stage' },
          renderToolbar(this),
          h('div', { class: ['sim-surface', this.w.ui.tool === 'gitlab' ? 'is-gitlab' : 'is-ide'] }, this.renderTool()))),
      this.ui.drawer ? this.renderDrawer() : null,
      h('div', { class: 'sim-spot', hidden: true, 'aria-hidden': 'true' }),
      modalLayer,
    ]);
    if (fk) {
      const el = this.root.querySelector(`[data-fk="${CSS.escape(fk)}"]`);
      if (el) {
        el.focus({ preventScroll: true });
        if (sel && 'selectionStart' in el) { try { el.setSelectionRange(sel[0], sel[1]); el.scrollTop = sel[2]; } catch (e) { /* type sans sélection */ } }
      }
    }
    if (this.ui.focusAfter) {
      const el = this.root.querySelector(`[data-fk="${CSS.escape(this.ui.focusAfter)}"]`) || this.root.querySelector(`[data-target="${CSS.escape(this.ui.focusAfter)}"]`);
      this.ui.focusAfter = null;
      if (el) el.focus({ preventScroll: true });
    }
    for (const [k, top] of scrolls) { const el = this.root.querySelector(`[data-keep-scroll="${k}"]`); if (el) el.scrollTop = top; }
    this.root.querySelectorAll('[data-autoscroll]').forEach((el) => { el.scrollTop = el.scrollHeight; });
    // Les animations d'apparition ne jouent que pour un élément réellement nouveau.
    if (!prefersReducedMotion()) this.root.querySelectorAll('[data-anim]').forEach((el) => { if (!seen.has(el.dataset.anim)) el.classList.add('is-fresh'); });
    requestAnimationFrame(() => this.placeSpot());
  }

  renderTool() {
    if (this.w.ui.tool === 'gitlab') return renderGitLab(this);
    return this.ide === 'rstudio' ? renderRStudio(this) : renderVSCode(this);
  }

  renderTop() {
    const m = this.mission;
    const prefs = this.store.prefs;
    const seg = h('div', { class: 'sim-seg', role: 'radiogroup', 'aria-label': 'Mon environnement de travail' },
      ['vscode', 'rstudio'].map((k) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(this.ide === k), class: this.ide === k ? 'is-on' : '', fk: 'top.ide-' + k, target: 'top.ide-' + k,
        on: { click: () => this.setPref('ide', k), keydown: (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); this.setPref('ide', k === 'vscode' ? 'rstudio' : 'vscode'); } } },
        tabindex: this.ide === k ? '0' : '-1',
      }, IDE_LABEL[k])));
    const modeSeg = (m.mode === 'depannage' || m.autonomousOnly) ? h('span', { class: 'sim-chip' }, MODES[this.mode].short)
      : h('div', { class: 'sim-seg sim-seg-sm', role: 'radiogroup', 'aria-label': 'Niveau d’accompagnement' },
        ['guide', 'autonome'].map((k) => h('button', {
          type: 'button', role: 'radio', 'aria-checked': String(this.mode === k), class: this.mode === k ? 'is-on' : '', fk: 'top.mode-' + k, tabindex: this.mode === k ? '0' : '-1',
          title: MODES[k].desc,
          on: { click: () => this.setPref('mode', k), keydown: (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); this.setPref('mode', k === 'guide' ? 'autonome' : 'guide'); } } },
        }, MODES[k].short)));
    return h('header', { class: 'sim-top' },
      btn('Missions', { icon: 'list', cls: 'sim-btn sim-btn-ghost sim-missions-btn', target: 'top.missions', attrs: { 'aria-expanded': String(!!this.ui.drawer), 'aria-controls': 'sim-drawer' }, on: () => { this.ui.drawer = true; this.render(); const f = this.root.querySelector('.sim-drawer [aria-current="true"]') || this.root.querySelector('.sim-drawer button'); if (f) f.focus(); } }),
      h('div', { class: 'sim-top-title' },
        h('span', { class: 'sim-top-num' }, m.group === 'm6' ? `Exercice ${m.num}` : `Mission ${m.num}`),
        h('span', { class: 'sim-top-name' }, m.title)),
      h('div', { class: 'sim-top-actions' },
        modeSeg,
        h('span', { class: 'sim-top-sep', 'aria-hidden': 'true' }),
        h('span', { class: 'sim-top-label', id: 'lbl-env' }, 'Environnement'), seg,
        btn('Recommencer la mission', { icon: 'restart', cls: 'sim-btn sim-btn-ghost', hideLabel: true, target: 'top.restart', on: () => this.restart() }),
        btn(prefs.focus ? 'Quitter le mode concentration' : 'Mode concentration', { icon: prefs.focus ? 'unfocus' : 'focus', cls: 'sim-btn sim-btn-ghost', hideLabel: true, target: 'top.focus', attrs: { 'aria-pressed': String(!!prefs.focus) }, on: () => this.setPref('focus', !prefs.focus) })),
      h('p', { class: 'sim-badge', title: 'Aucune donnée réelle, aucun serveur contacté.' }, icon('info'), 'Simulation pédagogique — données fictives'));
  }

  renderMobileSwitch() {
    const opt = (k, label) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(this.ui.mobile === k), 'aria-controls': k === 'coach' ? 'sim-coach' : 'sim-stage', fk: 'mob.' + k, class: this.ui.mobile === k ? 'is-on' : '', on: { click: () => { this.ui.mobile = k; this.render(); } } }, label);
    return h('nav', { class: 'sim-mobile-switch', 'aria-label': 'Vue affichée' }, h('div', { role: 'tablist', class: 'sim-seg' }, opt('coach', 'Consigne et aide'), opt('stage', 'Simulateur')));
  }

  renderDrawer() {
    const close = () => { this.ui.drawer = false; this.render(); const b = this.root.querySelector('[data-target="top.missions"]'); if (b) b.focus(); };
    const status = (id) => (this.store.progress[id] || {}).status || 'todo';
    const label = { todo: 'À faire', started: 'En cours', done: 'Maîtrisé' };
    const item = (id) => {
      const m = byId(id);
      const st = status(id);
      return h('li', {}, h('button', {
        type: 'button', class: ['sim-drawer-item', 'is-' + st], 'aria-current': String(id === this.mission.id),
        on: { click: () => this.enter(id) },
      }, h('span', { class: 'sim-drawer-num' }, String(m.num)), h('span', { class: 'sim-drawer-title' }, m.title), h('span', { class: 'sim-drawer-status' }, st === 'done' ? icon('check') : null, label[st])));
    };
    const panel = h('div', { class: 'sim-drawer', 'data-anim': 'drawer', id: 'sim-drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Missions' },
      h('div', { class: 'sim-drawer-head' }, h('h2', {}, 'Missions'), btn('Fermer', { icon: 'x', hideLabel: true, cls: 'sim-icon-btn', on: close })),
      GROUPS.map((g) => h('section', {}, h('h3', {}, g.title), h('ol', { class: 'sim-drawer-list' }, g.items.map(item)))),
      h('div', { class: 'sim-drawer-foot' },
        h('p', { class: 'sim-note' }, this.storageOk ? 'Ta progression est enregistrée dans ce navigateur, sur cet appareil.' : 'Le stockage local est indisponible : ta progression est conservée pendant cette session seulement.'),
        btn('Effacer toute la progression', { cls: 'sim-btn sim-btn-ghost sim-btn-small', on: () => this.resetAll() })));
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } trapFocus(panel, e); });
    return h('div', { class: 'sim-drawer-layer', on: { mousedown: (e) => { if (e.target.classList.contains('sim-drawer-layer')) close(); } } }, panel);
  }

  focusCoach() {
    const c = this.root.querySelector('.coach-title');
    if (c) c.focus({ preventScroll: true });
  }

  bindKeys() {
    // Raccourcis limités à la zone concernée : chaque vue gère les siens sur ses propres éléments.
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.ui.spot) { this.ui.spot = null; this.placeSpot(); }
    });
  }
}

export function mount(el) {
  const app = new App(el);
  app.render();
  window.__simApp = app; // utilisé par les tests de parcours
  return app;
}

const root = document.getElementById('sim-app');
if (root) mount(root);
