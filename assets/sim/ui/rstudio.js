// =====================================================================
// Vue RStudio (simulée) : réplique simplifiée inspirée de RStudio, sans
// lien avec Posit. Les quatre quadrants, l'assistant de projet,
// l'onglet Git, Review Changes, la Console R et le Terminal.
// =====================================================================

import * as E from '../engine/engine.js';
import { short, tildify, basename, dirname, classifySecret } from '../engine/util.js';
import { lineOps } from '../engine/diff.js';
import { h, btn, icon, md, trapFocus } from './dom.js';
import { renderTerminal } from './terminal.js';
import { secretField, folderPicker } from './tools.js';
import { withCredentials } from './net.js';
import { menuBox } from './vscode.js';

const IDE = 'rstudio';

function st(app) {
  return (app.ui.rstudio[app.w.key] ||= {
    left: 'console', rtop: 'environment', rbottom: 'files', docs: [], doc: -1, dialogs: [], menu: null,
    console: [{ text: 'R version 4.5.1 — Console simulée : elle ne fait pas tourner R.', cls: 'sim' }], consoleInput: '', filesDir: null, sel: null, mpane: 'console',
    review: { tab: 'changes', sel: null, show: 'unstaged', msg: '', amend: false },
  });
}

const projectPath = (app) => app.w.ws.opened.rstudio;
const repoOf = (app) => E.currentRepo(app.w, IDE);
const bufKey = (app, repo, file) => `${app.w.key}:${repo.path}:${file}`;

function pushDialog(app, d) { const s = st(app); s.dialogs.push(d); app.ui.focusAfter = d.focus || 'rsd-first'; }
function popDialog(app) { const s = st(app); s.dialogs.pop(); }

// ---------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------

function newProject(app) {
  const s = st(app);
  s.menu = null;
  s.dialogs = [];
  pushDialog(app, { kind: 'wizard', step: 'start', url: '', dirName: '', dirTouched: false, parent: app.w.ws.home, newSession: false, focus: 'rs.wiz-vc' });
  app.act((w) => { E.emit(w, 'clone-start', { via: IDE }); return {}; }, { render: false });
  app.render();
}

function openProjectDialog(app, existing = false) {
  const s = st(app);
  s.menu = null;
  if (!existing) s.dialogs = [];
  pushDialog(app, { kind: 'picker', title: existing ? 'Choose Directory' : 'Open Project', button: existing ? 'Choose' : 'Open', dir: app.w.ws.home, focus: 'pick.ok', onPick: (dir) => {
    s.dialogs = [];
    if (!app.w.ws.repos[dir]) {
      pushDialog(app, { kind: 'message', title: 'Open Project', text: 'Ce dossier n’est pas un dépôt Git. Dans ce parcours, ouvre le dossier du projet cloné (par exemple ~/projets/etude-entreprises).' });
      app.render();
      return;
    }
    openProject(app, dir);
  } });
  app.render();
}

function openProject(app, dir) {
  const s = st(app);
  s.docs = []; s.doc = -1; s.rtop = 'git'; s.filesDir = dir; s.left = 'console'; s.mpane = 'files';
  app.act((w) => E.openRStudioProject(w, dir), { summary: `RStudio a ouvert le projet ${basename(dir)}. Il a ajouté ${basename(dir)}.Rproj et complété .gitignore : ces fichiers apparaissent dans l’onglet Git.` });
  app.ui.focusAfter = 'rs.tab-git';
  app.render();
}

function createProject(app, d) {
  const s = st(app);
  const url = d.url.trim();
  if (!url) { d.err = 'Indique l’URL du dépôt (Repository URL).'; app.ui.focusAfter = 'rs.repo-url'; app.render(); return; }
  if (/glpat-|DEMO-TOKEN-/.test(url) && !/^https?:\/\//.test(url)) { d.url = ''; d.err = 'Ce champ attend l’adresse du dépôt, pas un jeton. Ta saisie a été effacée.'; app.render(); return; }
  const dirName = (d.dirName || '').trim() || basename(url).replace(/\.git$/, '');
  const out = { kind: 'output', title: 'Clone Repository', lines: [`$ git clone --progress ${url.replace(/\/\/[^@/]*@/, '//')} '${tildify(d.parent, app.w.ws.home)}/${dirName}'`], running: true };
  s.dialogs = [out];
  withCredentials(app, (w, auth) => E.cloneRepo(w, { url, parentDir: d.parent, dirName, auth, via: IDE, rstudioProject: true }), {
    ask: (prompts, resolve, cancel) => askAuth(app, prompts, resolve, cancel),
    done: (r) => {
      out.running = false;
      out.lines.push(...(r.out || []));
      if (r.code === 'secret-in-url') out.lines.push('ⓘ Simulation : une URL contenant un jeton est refusée. Elle serait enregistrée en clair dans .git/config. Utilise l’URL HTTPS seule ; Git demandera le jeton.');
      if (r.ok) {
        s.dialogs = [];
        openProject(app, r.repo.path);
      } else { app.ui.focusAfter = 'rsd-close'; }
    },
    onCancel: () => { out.running = false; out.lines.push('Opération annulée.'); app.ui.focusAfter = 'rsd-close'; },
  });
}

function askAuth(app, prompts, resolve, cancel) {
  pushDialog(app, { kind: 'auth', step: 'user', title: prompts.username.trim(), value: '', resolve, cancel, focus: 'rs.auth-user' });
}

function toggleStage(app, item, staged) {
  const repo = repoOf(app);
  app.act((w) => (staged ? E.unstage(w, repo.path, [item.path], IDE) : E.stage(w, repo.path, [item.path], IDE)));
}

function openReview(app, file) {
  const s = st(app);
  const repo = repoOf(app);
  const st0 = E.status(repo);
  const first = file || s.sel || (st0.unstaged[0] || st0.untracked[0] || st0.staged[0] || {}).path || null;
  s.review.sel = first;
  s.review.tab = 'changes';
  s.dialogs = [{ kind: 'review', focus: first ? 'rs.review-file-' + first : 'rs.commit-message' }];
  app.ui.focusAfter = s.dialogs[0].focus;
  app.act((w) => { if (first) E.emit(w, 'diff-view', { via: IDE, file: first }); E.emit(w, 'status-view', { path: repo.path, via: IDE }); return {}; });
}

function doCommit(app) {
  const s = st(app);
  const repo = repoOf(app);
  const r = s.review;
  const msg = r.msg.trim() || (r.amend && repo.commits.length ? repo.commits[repo.commits.length - 1].message : '');
  const res = app.act((w) => E.commit(w, repo.path, { message: msg, amend: r.amend, via: IDE }), { render: false });
  const lines = [`>>> /usr/bin/git commit${r.amend ? ' --amend' : ''} -F /tmp/RtmpCommitMsg`];
  if (!msg) lines.push('Aborting commit due to empty commit message.');
  lines.push(...(res.out || []));
  if (res.ok) { r.msg = ''; r.amend = false; }
  pushDialog(app, { kind: 'output', title: 'Git Commit', lines, focus: 'rsd-close' });
  app.render();
}

function doPush(app, pull = false) {
  const s = st(app);
  const repo = repoOf(app);
  const out = { kind: 'output', title: pull ? 'Git Pull' : 'Git Push', lines: [pull ? '>>> /usr/bin/git pull' : `>>> /usr/bin/git push origin HEAD:refs/heads/${repo.branch}`], running: true, focus: 'rsd-close' };
  s.dialogs.push(out);
  withCredentials(app, (w, auth) => (pull ? E.pull(w, repo.path, { auth, via: IDE }) : E.push(w, repo.path, { auth, via: IDE })), {
    ask: (prompts, resolve, cancel) => askAuth(app, prompts, resolve, cancel),
    done: (r) => {
      out.running = false;
      out.lines.push(...(r.out || []));
      if (!pull && r.code === 'up-to-date' && !E.status(repo).clean) out.lines.push('', 'ⓘ Simulation : des modifications ne sont pas encore dans un commit. Un push n’envoie que des commits.');
      app.ui.focusAfter = 'rsd-close';
    },
    onCancel: () => { out.running = false; out.lines.push('Opération annulée.'); app.ui.focusAfter = 'rsd-close'; },
  });
}

function openDoc(app, file) {
  const s = st(app);
  const repo = repoOf(app);
  let i = s.docs.indexOf(file);
  if (i < 0) { s.docs.push(file); i = s.docs.length - 1; }
  s.doc = i;
  s.mpane = 'source';
  app.ui.focusAfter = 'rs.editor';
  app.act((w) => { E.emit(w, 'open-file', { file, ide: IDE, path: repo && repo.path }); return {}; });
}

function save(app) {
  const s = st(app);
  const repo = repoOf(app);
  const file = s.docs[s.doc];
  if (!repo || !file) return;
  const b = app.ui.buffers[bufKey(app, repo, file)];
  if (!b) return;
  app.act((w) => E.writeFile(w, repo.path, file, b.text));
  b.dirty = false;
  app.render();
}

// ---- Console R : elle n'exécute pas R ; elle aide à distinguer Console et Terminal ----
function evalArith(src) {
  let i = 0;
  const s = src.replace(/\s+/g, '');
  const num = () => { const m = s.slice(i).match(/^\d+(\.\d+)?/); if (!m) throw new Error(); i += m[0].length; return parseFloat(m[0]); };
  const atom = () => { if (s[i] === '(') { i++; const v = expr(); if (s[i++] !== ')') throw new Error(); return v; } if (s[i] === '-') { i++; return -atom(); } return num(); };
  const term = () => { let v = atom(); while (s[i] === '*' || s[i] === '/') { const op = s[i++]; const r = atom(); v = op === '*' ? v * r : v / r; } return v; };
  const expr = () => { let v = term(); while (s[i] === '+' || s[i] === '-') { const op = s[i++]; const r = term(); v = op === '+' ? v + r : v - r; } return v; };
  const v = expr();
  if (i !== s.length) throw new Error();
  return v;
}

function runConsole(app) {
  const s = st(app);
  const code = s.consoleInput;
  s.consoleInput = '';
  const out = s.console;
  out.push({ text: '> ' + code, cls: 'cmd' });
  const t = code.trim();
  if (!t) return app.render();
  if (/^(git|cd|ls|pwd|clear)\b/.test(t)) {
    out.push({ text: `Error: unexpected symbol in "${t.split(/\s+/).slice(0, 2).join(' ')}"`, cls: 'err' });
    out.push({ text: 'Cette commande s’adresse au shell (Git), pas à R. Tape-la dans l’onglet Terminal, à côté de Console.', cls: 'tip', action: 'terminal' });
    app.act((w) => { E.emit(w, 'console-git', {}); return {}; });
    return;
  }
  if (/^(system|system2|shell)\s*\(/.test(t)) out.push({ text: 'Ce simulateur n’exécute pas system(). Pour Git, utilise l’onglet Terminal.', cls: 'tip', action: 'terminal' });
  else if (t === 'getwd()') out.push({ text: `[1] "${projectPath(app) || app.w.ws.home}"` });
  else if (/^[\d\s+\-*/().]+$/.test(t)) { try { const v = evalArith(t); out.push({ text: `[1] ${Number.isFinite(v) ? +v.toFixed(6) : 'Inf'}` }); } catch (e) { out.push({ text: 'Error: unexpected end of input', cls: 'err' }); } }
  else out.push({ text: 'ⓘ La Console simulée n’exécute pas de code R : le bac à sable simule Git et ton espace de travail.', cls: 'sim' });
  if (out.length > 200) out.splice(0, out.length - 200);
  app.render();
}

// ---------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------

export function renderRStudio(app) {
  const s = st(app);
  const repo = repoOf(app);
  const proj = projectPath(app);
  const hasSource = s.docs.length > 0;
  return h('div', { class: 'sim-frame rs', id: 'sim-frame', role: 'tabpanel', 'aria-label': 'RStudio (simulé)', 'data-mpane': s.mpane, on: { keydown: (e) => onKeys(app, e) } },
    menuBar(app, proj),
    h('div', { class: 'rs-mpanes', role: 'tablist', 'aria-label': 'Panneau affiché' }, [['source', 'Source', hasSource], ['console', 'Console / Terminal', true], ['env', repo ? 'Git' : 'Environment', true], ['files', 'Files', true]].filter((x) => x[2]).map(([k, l]) =>
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(s.mpane === k), class: s.mpane === k ? 'is-on' : '', fk: 'rs.mp-' + k, on: { click: () => { s.mpane = k; app.render(); } } }, l))),
    h('div', { class: ['rs-grid', hasSource ? 'has-source' : ''] },
      h('div', { class: 'rs-col' },
        hasSource ? sourcePane(app, repo) : null,
        consolePane(app)),
      h('div', { class: 'rs-col' },
        envPane(app, repo),
        filesPane(app, repo))),
    s.dialogs.map((d, i) => dialogView(app, d, i === s.dialogs.length - 1)));
}

function onKeys(app, e) {
  const s = st(app);
  if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S') && s.doc >= 0 && !s.dialogs.length) { e.preventDefault(); save(app); }
}

function menuBar(app, proj) {
  const s = st(app);
  const repo = repoOf(app);
  const open = s.menu;
  const fileBtn = h('button', { type: 'button', class: ['rs-menubtn', open === 'file' ? 'is-on' : ''], 'aria-expanded': String(open === 'file'), 'aria-haspopup': 'menu', target: 'rs.menu-file', fk: 'rs.menu-file', on: { click: () => { s.menu = open === 'file' ? null : 'file'; app.render(); } } }, 'File');
  const projBtn = h('button', { type: 'button', class: ['rs-project-btn', open === 'project' ? 'is-on' : ''], 'aria-expanded': String(open === 'project'), 'aria-haspopup': 'menu', target: 'rs.project-menu', fk: 'rs.project-menu', on: { click: () => { s.menu = open === 'project' ? null : 'project'; app.render(); } } }, icon('r'), proj ? basename(proj) : 'Project: (None)', icon('down', 'ico-sm'));
  const oosMenu = (l) => h('span', { class: 'rs-menubtn is-oos', title: 'Non simulé' }, l);
  const toolsBtn = h('button', { type: 'button', class: ['rs-menubtn', open === 'tools' ? 'is-on' : ''], 'aria-expanded': String(open === 'tools'), 'aria-haspopup': 'menu', target: 'rs.menu-tools', fk: 'rs.menu-tools', on: { click: () => { s.menu = open === 'tools' ? null : 'tools'; app.render(); } } }, 'Tools');
  return h('div', { class: 'rs-top' },
    h('nav', { class: 'rs-menubar', 'aria-label': 'Menu RStudio' },
      h('div', { class: 'vs-menuwrap' }, fileBtn, open === 'file' ? menuBox(app, [
        { label: 'New File', oos: true },
        { label: 'New Project…', target: 'rs.new-project', fn: () => newProject(app) },
        { label: 'Open Project…', target: 'rs.open-project', fn: () => openProjectDialog(app) },
        { sep: true },
        { label: 'Save', key: 'Ctrl+S', fn: () => save(app), disabled: s.doc < 0 },
        { sep: true },
        { label: 'Close Project', fn: () => { s.docs = []; s.doc = -1; s.rtop = 'environment'; app.act((w) => { w.ws.opened.rstudio = null; return {}; }); }, disabled: !proj },
      ], fileBtn, s) : null),
      oosMenu('Edit'), oosMenu('Code'), oosMenu('View'), oosMenu('Plots'), oosMenu('Session'), oosMenu('Build'), oosMenu('Debug'), oosMenu('Profile'),
      h('div', { class: 'vs-menuwrap' }, toolsBtn, open === 'tools' ? menuBox(app, [
        { label: 'Version Control › Project Setup…', target: 'rs.vc-setup', fn: () => vcSetup(app) },
        { label: 'Global Options…', oos: true },
      ], toolsBtn, s) : null),
      oosMenu('Help')),
    h('div', { class: 'rs-toolbar' },
      btn('Save current document', { icon: 'save', hideLabel: true, cls: 'rs-tool', target: 'rs.save-top', disabled: s.doc < 0, on: () => save(app) }),
      h('span', { class: 'rs-goto', 'aria-hidden': 'true' }, icon('search'), 'Go to file/function'),
      h('span', { class: 'vs-spacer' }),
      h('div', { class: 'vs-menuwrap' }, projBtn, open === 'project' ? menuBox(app, [
        { label: 'New Project…', fn: () => newProject(app) },
        { label: 'Open Project…', fn: () => openProjectDialog(app) },
        { label: 'Close Project', fn: () => { s.docs = []; s.doc = -1; app.act((w) => { w.ws.opened.rstudio = null; return {}; }); }, disabled: !proj },
      ], projBtn, s) : null)));
}

function paneTabs(app, key, tabs, current, label) {
  const s = st(app);
  return h('div', { class: 'rs-tabs', role: 'tablist', 'aria-label': label }, tabs.map(([k, l, target, oos]) => oos
    ? h('span', { class: 'rs-tab is-oos', title: 'Non simulé' }, l)
    : h('button', { type: 'button', role: 'tab', 'aria-selected': String(current === k), class: ['rs-tab', current === k ? 'is-on' : ''], target, fk: target || `rs.${key}-${k}`, on: { click: () => {
      s[key] = k;
      if (k === 'git') app.act((w) => { E.emit(w, 'view-scm', { ide: IDE }); return {}; });
      else app.render();
    } } }, l)));
}

function sourcePane(app, repo) {
  const s = st(app);
  const file = s.docs[s.doc];
  const b = repo && file ? (app.ui.buffers[bufKey(app, repo, file)] ||= { text: repo.work[file] ?? '', dirty: false }) : null;
  if (b && !b.dirty && repo.work[file] !== undefined) b.text = repo.work[file];
  const tabs = h('div', { class: 'rs-tabs rs-doc-tabs', role: 'tablist', 'aria-label': 'Documents ouverts' }, s.docs.map((f, i) => {
    const bb = repo ? app.ui.buffers[bufKey(app, repo, f)] : null;
    const dirty = bb && bb.dirty;
    return h('span', { class: ['rs-doc-tab', i === s.doc ? 'is-on' : '', dirty ? 'is-dirty' : ''] },
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(i === s.doc), fk: 'rs.doc-' + i, on: { click: () => { s.doc = i; app.render(); } } }, icon('file'), f + (dirty ? '*' : '')),
      btn(`Close ${f}`, { icon: 'x', hideLabel: true, cls: 'rs-x', fk: 'rs.docx-' + i, on: () => { s.docs.splice(i, 1); s.doc = Math.min(s.doc, s.docs.length - 1); app.render(); } }));
  }));
  let editor = null;
  if (b) {
    editor = h('div', { class: 'rs-editor-wrap' },
      h('div', { class: 'rs-source-tools' }, btn('Save current document', { icon: 'save', hideLabel: true, cls: 'rs-tool', target: 'rs.save', fk: 'rs.save', on: () => save(app) }),
        b.dirty ? h('span', { class: 'rs-unsaved', role: 'status' }, 'Modifié, non enregistré — Ctrl+S') : null),
      h('textarea', { class: 'rs-textarea', spellcheck: 'false', wrap: 'off', 'aria-label': `Éditeur : ${file}`, value: b.text, target: 'rs.editor', fk: 'rs.editor',
        on: { input: (e) => { b.text = e.target.value; if (!b.dirty) { b.dirty = true; app.render(); } }, keydown: (e) => { if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); e.stopPropagation(); save(app); } } } }));
  }
  return h('section', { class: 'rs-pane rs-source', 'aria-label': 'Source' }, tabs, editor);
}

function consolePane(app) {
  const s = st(app);
  const tabs = paneTabs(app, 'left', [['console', 'Console', 'rs.tab-console'], ['terminal', 'Terminal', 'rs.tab-terminal'], ['jobs', 'Background Jobs', null, true]], s.left, 'Console et Terminal');
  let body;
  if (s.left === 'terminal') {
    body = h('div', { class: 'rs-term-wrap' }, h('p', { class: 'rs-pane-hint' }, icon('terminal'), h('span', {}, h('strong', {}, 'Terminal'), ' — un shell (bash) : c’est ici que se tapent les commandes Git.')),
      renderTerminal(app, IDE, { fk: 'rsterm', label: 'Terminal bash' }));
  } else {
    body = h('div', { class: 'rs-console' },
      h('p', { class: 'rs-pane-hint' }, icon('r'), h('span', {}, h('strong', {}, 'Console R'), ' — elle attend du code R. Les commandes Git vont dans l’onglet Terminal.')),
      h('div', { class: 'rs-console-out', role: 'log', 'aria-live': 'polite', 'data-autoscroll': '', tabindex: '0', 'aria-label': 'Sortie de la Console R' },
        s.console.map((l) => l.action
          ? h('div', { class: 'rs-tip' }, icon('info'), h('span', {}, l.text), btn('Ouvrir le Terminal', { cls: 'sim-btn sim-btn-small', fk: 'rs.tip-term', on: () => { s.left = 'terminal'; app.ui.focusAfter = 'rsterm-input'; app.render(); } }))
          : h('div', { class: ['rs-line', l.cls ? 'r-' + l.cls : ''] }, l.text))),
      h('div', { class: 'rs-console-prompt' }, h('span', { 'aria-hidden': 'true' }, '>'),
        h('input', { type: 'text', 'aria-label': 'Commande R (Console)', value: s.consoleInput, spellcheck: 'false', autocomplete: 'off', fk: 'rs.console-input', target: 'rs.console-input',
          on: { input: (e) => { s.consoleInput = e.target.value; }, keydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); runConsole(app); } } } })));
  }
  return h('section', { class: ['rs-pane', 'rs-console-pane', s.left === 'terminal' ? 'is-terminal' : 'is-console'], 'aria-label': s.left === 'terminal' ? 'Terminal' : 'Console R' },
    tabs, h('div', { class: 'rs-pane-head' }, h('span', {}, s.left === 'terminal' ? 'Terminal 1' : `R 4.5.1 · ${tildify(projectPath(app) || app.w.ws.home, app.w.ws.home)}/`)), body);
}

function envPane(app, repo) {
  const s = st(app);
  const tabs = [['environment', 'Environment'], ['history', 'History', null, true], ['connections', 'Connections', null, true]];
  if (repo && repo.git) tabs.push(['git', 'Git', 'rs.tab-git']);
  tabs.push(['tutorial', 'Tutorial', null, true]);
  const cur = s.rtop === 'git' && !(repo && repo.git) ? 'environment' : s.rtop;
  return h('section', { class: 'rs-pane rs-env', 'aria-label': cur === 'git' ? 'Git' : 'Environment' },
    paneTabs(app, 'rtop', tabs, cur, 'Environnement et Git'),
    cur === 'git' ? gitPane(app, repo) : h('div', { class: 'rs-empty' }, h('p', {}, 'Environment is empty'), repo && repo.git ? null : h('p', { class: 'rs-note' }, repo ? 'Ce projet n’est pas encore un dépôt Git : l’onglet Git apparaîtra après Tools › Version Control › Project Setup… › Git.' : 'L’onglet Git apparaît quand un projet RStudio placé dans un dépôt Git est ouvert.'), repo ? null : openExisting(app)));
}

/** Un dépôt cloné existe (par exemple depuis l'autre IDE ou le terminal) : proposer de l'ouvrir. */
function openExisting(app) {
  const repos = Object.keys(app.w.ws.repos);
  if (!repos.length) return null;
  return h('div', { class: 'rs-tip' }, icon('info'), h('span', {}, `Un dépôt cloné existe : ${tildify(repos[repos.length - 1], app.w.ws.home)}. Pour l’ouvrir comme projet RStudio : File › Open Project…`),
    btn('Ouvrir ce projet', { cls: 'sim-btn sim-btn-small', target: 'rs.open-existing', fk: 'rs.open-existing', on: () => openProject(app, repos[repos.length - 1]) }));
}

const LETTER = { modified: 'M', new: 'A', deleted: 'D', untracked: '?' };

function gitRows(repo) {
  const x = E.status(repo);
  const map = new Map();
  for (const it of x.staged) map.set(it.path, { path: it.path, staged: it.kind, unstaged: null });
  for (const it of x.unstaged) { const r = map.get(it.path) || { path: it.path, staged: null }; r.unstaged = it.kind; map.set(it.path, r); }
  for (const it of x.untracked) map.set(it.path, { path: it.path, staged: null, unstaged: 'untracked' });
  return [...map.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function gitTable(app, repo, { review = false } = {}) {
  const s = st(app);
  const rows = gitRows(repo);
  if (!rows.length) return h('p', { class: 'rs-note' }, 'Aucune modification : le répertoire de travail correspond au dernier commit.');
  return h('table', { class: 'rs-git-table' },
    h('caption', { class: 'sr-only' }, 'Fichiers modifiés'),
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Staged'), h('th', { scope: 'col' }, 'Status'), h('th', { scope: 'col' }, 'Path'))),
    h('tbody', {}, rows.map((r) => {
      const full = !!r.staged && !r.unstaged;
      const partial = !!r.staged && !!r.unstaged;
      const sel = review ? s.review.sel === r.path : s.sel === r.path;
      const cb = h('input', { type: 'checkbox', checked: full, 'aria-label': `Staged : ${r.path}`, target: 'rs.staged-' + r.path, fk: (review ? 'rs.rstaged-' : 'rs.staged-') + r.path, on: { change: () => toggleStage(app, { path: r.path }, full || partial && false) } });
      if (partial) cb.indeterminate = true;
      const letters = r.unstaged === 'untracked' ? h('span', { class: 'rs-st is-u' }, '?', h('span', {}, '?')) : h('span', { class: 'rs-st' }, h('span', { class: r.staged ? 'is-' + LETTER[r.staged].toLowerCase() : '' }, r.staged ? LETTER[r.staged] : ''), h('span', { class: r.unstaged ? 'is-' + LETTER[r.unstaged].toLowerCase() : '' }, r.unstaged ? LETTER[r.unstaged] : ''));
      return h('tr', { class: sel ? 'is-sel' : '' },
        h('td', {}, cb),
        h('td', {}, letters),
        h('td', {}, h('button', { type: 'button', class: 'rs-path', fk: (review ? 'rs.review-file-' : 'rs.row-') + r.path, target: review ? null : 'rs.row-' + r.path, on: { click: () => {
          if (review) { s.review.sel = r.path; app.act((w) => { E.emit(w, 'diff-view', { via: IDE, file: r.path }); return {}; }); }
          else { s.sel = r.path; app.render(); }
        }, dblclick: () => { if (!review) openReview(app, r.path); } } }, r.path)));
    })));
}

function gitPane(app, repo) {
  const s = st(app);
  const moreOpen = s.menu === 'gitmore';
  const moreBtn = h('button', { type: 'button', class: 'rs-gbtn', 'aria-expanded': String(moreOpen), 'aria-haspopup': 'menu', fk: 'rs.git-more', on: { click: () => { s.menu = moreOpen ? null : 'gitmore'; app.render(); } } }, icon('settings'), 'More', icon('down', 'ico-sm'));
  return h('div', { class: 'rs-git' },
    h('div', { class: 'rs-git-tools', role: 'toolbar', 'aria-label': 'Git' },
      h('button', { type: 'button', class: 'rs-gbtn', target: 'rs.git-diff', fk: 'rs.git-diff', on: { click: () => openReview(app, s.sel) } }, icon('diff'), 'Diff'),
      h('button', { type: 'button', class: 'rs-gbtn', target: 'rs.git-commit', fk: 'rs.git-commit', on: { click: () => openReview(app, s.sel) } }, icon('check'), 'Commit'),
      h('span', { class: 'rs-sep', 'aria-hidden': 'true' }),
      h('button', { type: 'button', class: 'rs-gbtn rs-pull', target: 'rs.git-pull', fk: 'rs.git-pull', 'aria-label': 'Pull', title: repo.upstream ? 'Pull' : NO_UPSTREAM, disabled: !repo.upstream, on: { click: () => doPush(app, true) } }, icon('pull'), h('span', { class: 'rs-gbtn-lbl' }, 'Pull')),
      h('button', { type: 'button', class: 'rs-gbtn rs-push', target: 'rs.git-push', fk: 'rs.git-push', 'aria-label': 'Push', title: repo.upstream ? 'Push' : NO_UPSTREAM, disabled: !repo.upstream, on: { click: () => doPush(app) } }, icon('up'), h('span', { class: 'rs-gbtn-lbl' }, 'Push')),
      h('button', { type: 'button', class: 'rs-gbtn', fk: 'rs.git-history', on: { click: () => { openReview(app); s.review.tab = 'history'; app.act((w) => { E.emit(w, 'ide-history', {}); return {}; }); } } }, icon('history'), 'History'),
      h('span', { class: 'vs-menuwrap' }, moreBtn, moreOpen ? menuBox(app, [
        { label: 'Revert…', fn: () => { if (s.sel) revert(app, s.sel); } },
        { label: 'Ignore…', oos: true },
        { label: 'Shell…', fn: () => { s.left = 'terminal'; app.ui.focusAfter = 'rsterm-input'; app.render(); } },
      ], moreBtn, s) : null),
      h('span', { class: 'vs-spacer' }),
      btn('Refresh', { icon: 'sync', hideLabel: true, cls: 'rs-tool', fk: 'rs.git-refresh', on: () => app.act((w) => { E.emit(w, 'status-view', { path: repo.path, via: IDE }); return {}; }) }),
      h('span', { class: 'rs-branch' }, icon('branch'), repo.branch)),
    !repo.upstream ? h('p', { class: 'rs-note' }, icon('info'), h('span', {}, 'Push et Pull sont grisés : la branche ', h('code', {}, repo.branch), ' n’a pas encore de branche suivie sur GitLab. Premier envoi dans l’onglet Terminal : ', h('code', {}, `git push -u origin ${repo.branch}`), '.')) : null,
    gitTable(app, repo));
}

const NO_UPSTREAM = 'Aucune branche suivie : fais le premier envoi dans le Terminal avec git push -u origin main';

function revert(app, file) {
  const repo = repoOf(app);
  app.confirm({ title: 'Revert Changes', body: `Changes to the selected file will be lost, including staged changes.\n\nAre you sure you want to continue? (${file})`, ok: 'Yes', danger: true, onOk: () => app.act((w) => { E.unstage(w, repo.path, [file], IDE); return E.discard(w, repo.path, [file], IDE); }) });
}

function filesPane(app, repo) {
  const s = st(app);
  const w = app.w;
  const dir = s.filesDir && w.ws.dirs.includes(s.filesDir) ? s.filesDir : (projectPath(app) || w.ws.home);
  const crumbParts = tildify(dir, w.ws.home).split('/');
  const kids = w.ws.dirs.filter((d) => d !== dir && dirname(d) === dir).sort();
  const r = E.repoAt(w, dir);
  const files = r ? Object.keys(r.work).sort((a, b) => a.localeCompare(b)) : [];
  const nfOpen = s.menu === 'newfile';
  const nfBtn = h('button', { type: 'button', class: 'rs-gbtn', 'aria-expanded': String(nfOpen), 'aria-haspopup': 'menu', target: 'rs.new-file', fk: 'rs.new-file', disabled: !r || r !== repo, on: { click: () => { s.menu = nfOpen ? null : 'newfile'; app.render(); } } }, icon('newfile'), 'New Blank File', icon('down', 'ico-sm'));
  const nf = (ext, label) => ({ label, fn: () => pushDialog(app, { kind: 'newfile', ext, value: ext === '.qmd' ? 'synthese.qmd' : ext === '.md' ? 'README.md' : 'notes' + ext, focus: 'rs.newfile-input' }) || app.render() });
  return h('section', { class: 'rs-pane rs-files', 'aria-label': 'Files' },
    paneTabs(app, 'rbottom', [['files', 'Files', 'rs.tab-files'], ['plots', 'Plots', null, true], ['packages', 'Packages', null, true], ['help', 'Help', null, true], ['viewer', 'Viewer', null, true]], 'files', 'Fichiers'),
    h('div', { class: 'rs-files-tools' }, h('span', { class: 'vs-menuwrap' }, nfBtn, nfOpen ? menuBox(app, [nf('.md', 'Markdown File'), nf('.qmd', 'Quarto Doc…'), nf('.R', 'R Script'), nf('.txt', 'Text File')], nfBtn, s) : null)),
    h('nav', { class: 'rs-crumbs', 'aria-label': 'Dossier affiché' }, crumbParts.map((p, i) => {
      const target = i === 0 ? w.ws.home : w.ws.home + '/' + crumbParts.slice(1, i + 1).join('/');
      return [i ? h('span', { 'aria-hidden': 'true' }, ' › ') : null, i < crumbParts.length - 1 ? h('button', { type: 'button', class: 'rs-crumb', fk: 'rs.crumb-' + i, on: { click: () => { s.filesDir = target; app.render(); } } }, p === '~' ? 'Home' : p) : h('span', {}, p === '~' ? 'Home' : p)];
    })),
    h('ul', { class: 'rs-file-list' },
      kids.map((d) => h('li', {}, h('button', { type: 'button', class: 'rs-file', fk: 'rs.dir-' + d, on: { click: () => { s.filesDir = d; app.render(); } } }, icon('folder'), basename(d)))),
      files.map((f) => h('li', {}, h('button', { type: 'button', class: 'rs-file', target: 'rs.files-' + f, fk: 'rs.files-' + f, disabled: r !== repo, title: r !== repo ? 'Ouvre d’abord ce projet (File › Open Project…)' : null, on: { click: () => openDoc(app, f) } }, icon(f.endsWith('.Rproj') ? 'r' : 'file'), f))),
      !kids.length && !files.length ? h('li', { class: 'rs-note' }, 'Dossier vide.') : null));
}

// ---------------------------------------------------------------------
// Fenêtres
// ---------------------------------------------------------------------

function dialogView(app, d, top) {
  const s = st(app);
  const close = () => { popDialog(app); if (d.onClose) d.onClose(); app.render(); };
  let title = d.title, body, actions = [], cls = '';
  if (d.kind === 'wizard') ({ title, body, actions, cls } = wizard(app, d));
  else if (d.kind === 'picker') {
    title = d.title;
    body = folderPicker(app, { state: d, title: d.title, button: d.button, onCancel: close, onPick: (dir) => { popDialog(app); d.onPick(dir); } });
  } else if (d.kind === 'auth') ({ title, body, actions } = authDialog(app, d));
  else if (d.kind === 'output') {
    body = h('pre', { class: 'rs-output', role: 'log', tabindex: '0', 'data-autoscroll': '' }, d.lines.join('\n') + (d.running ? '\n…' : ''));
    actions = [['Close', close, true, 'rsd-close']];
  } else if (d.kind === 'message') {
    body = h('p', {}, d.text);
    actions = [['OK', close, true, 'rsd-first']];
  } else if (d.kind === 'newfile') {
    title = 'New File';
    const submit = () => {
      const name = (d.value || '').trim();
      const repo = repoOf(app);
      if (!/^[\w.-]+$/.test(name)) { d.err = 'Nom de fichier attendu, sans dossier (ex. synthese.qmd).'; app.render(); return; }
      if (repo.work[name] !== undefined) { d.err = 'Un fichier de ce nom existe déjà.'; app.render(); return; }
      popDialog(app);
      const tpl = name.endsWith('.qmd') ? '---\ntitle: "Untitled"\nformat: html\n---\n\n' : '';
      app.act((w) => E.writeFile(w, repo.path, name, tpl), { render: false });
      openDoc(app, name);
    };
    body = h('div', { class: 'rs-form' }, h('label', { for: 'rs-nf' }, 'File name:'), h('input', { id: 'rs-nf', type: 'text', value: d.value, fk: 'rs.newfile-input', on: { input: (e) => { d.value = e.target.value; }, keydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } } } }),
      d.err ? h('p', { class: 'sim-field-error', role: 'alert' }, d.err) : null);
    actions = [['OK', submit, true, 'rsd-first'], ['Cancel', close]];
  } else if (d.kind === 'vcsetup') {
    title = 'Project Options';
    body = h('div', { class: 'rs-form' }, h('p', { class: 'rs-wiz-h' }, 'Git/SVN'),
      h('label', { for: 'rs-vcs' }, 'Version control system:'),
      h('select', { id: 'rs-vcs', target: 'rs.vc-git', fk: 'rs.vc-git', on: { change: (e) => { d.value = e.target.value; } } },
        h('option', { value: 'none', selected: d.value !== 'git' }, '(None)'), h('option', { value: 'git', selected: d.value === 'git' }, 'Git')));
    actions = [['OK', () => {
      if (d.value !== 'git') { close(); return; }
      s.dialogs = [{ kind: 'vcconfirm', focus: 'rs.vc-yes' }];
      app.ui.focusAfter = 'rs.vc-yes';
      app.render();
    }, true, 'rs.vc-ok', 'rs.vc-ok'], ['Cancel', close]];
  } else if (d.kind === 'vcconfirm') {
    title = 'Confirm New Git Repository';
    body = h('p', {}, 'Do you want to initialize a new git repository for this project?');
    actions = [['Yes', () => {
      s.dialogs = [];
      const repo = repoOf(app);
      app.act((w) => E.initRepo(w, repo.path, { via: IDE }), { summary: 'Dépôt Git initialisé (git init). RStudio redémarre la session : l’onglet Git apparaît.' });
      s.rtop = 'git';
      app.ui.focusAfter = 'rs.tab-git';
      app.render();
    }, true, 'rs.vc-yes', 'rs.vc-yes'], ['No', close]];
  } else if (d.kind === 'review') return reviewWindow(app, d, top);
  return h('div', { class: ['rs-overlay', top ? '' : 'is-under'] }, h('div', { class: ['rs-dialog', cls], 'data-anim': 'rsd-' + d.kind + (d.title || ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title, on: { keydown: (e) => { if (e.key === 'Escape') { e.stopPropagation(); if (d.kind === 'auth' && d.cancel) { popDialog(app); d.cancel(); } else close(); } trapFocus(e.currentTarget, e); } } },
    h('div', { class: 'rs-dialog-title' }, h('span', {}, title)),
    h('div', { class: 'rs-dialog-body' }, body),
    actions.length ? h('div', { class: 'rs-dialog-actions' }, actions.map(([l, fn, primary, fk, target]) => btn(l, { cls: primary ? 'rs-btn rs-btn-primary' : 'rs-btn', fk: fk || 'rsd-' + l, target, on: fn }))) : null));
}

function wizard(app, d) {
  const s = st(app);
  const close = () => { s.dialogs = []; app.render(); };
  const choice = (title, desc, ic, target, fn, oos) => h('button', { type: 'button', class: ['rs-choice', oos ? 'is-oos' : ''], target, fk: target || 'rs.choice-' + title, 'aria-disabled': oos ? 'true' : null, title: oos ? 'Non simulé' : null, on: { click: () => { if (!oos) fn(); } } },
    icon(ic), h('span', {}, h('strong', {}, title), h('span', {}, desc)), icon('chevron'));
  if (d.step === 'start') {
    return {
      title: 'New Project Wizard', cls: 'rs-wizard',
      body: [h('h3', { class: 'rs-wiz-h' }, 'Create Project'),
        choice('New Directory', 'Start a project in a brand new working directory', 'folder', null, null, true),
        choice('Existing Directory', 'Associate a project with an existing working directory', 'folder', 'rs.wiz-existing', () => { s.dialogs = []; openProjectDialog(app, true); }),
        choice('Version Control', 'Checkout a project from a version control repository', 'branch', 'rs.wiz-vc', () => { d.step = 'vc'; app.ui.focusAfter = 'rs.wiz-git'; app.render(); })],
      actions: [['Cancel', close]],
    };
  }
  if (d.step === 'vc') {
    return {
      title: 'New Project Wizard', cls: 'rs-wizard',
      body: [h('h3', { class: 'rs-wiz-h' }, 'Create Project from Version Control'),
        choice('Git', 'Clone a project from a Git repository', 'branch', 'rs.wiz-git', () => { d.step = 'git'; app.ui.focusAfter = 'rs.repo-url'; app.render(); }),
        choice('Subversion', 'Checkout a project from a Subversion repository', 'branch', null, null, true)],
      actions: [['Back', () => { d.step = 'start'; app.render(); }], ['Cancel', close]],
    };
  }
  // Clone Git Repository
  const parentShown = tildify(d.parent, app.w.ws.home);
  return {
    title: 'New Project Wizard', cls: 'rs-wizard',
    body: [h('h3', { class: 'rs-wiz-h' }, 'Clone Git Repository'),
      h('div', { class: 'rs-form' },
        h('label', { for: 'rs-url' }, 'Repository URL:'),
        h('input', { id: 'rs-url', type: 'text', value: d.url, autocomplete: 'off', spellcheck: 'false', target: 'rs.repo-url', fk: 'rs.repo-url', 'aria-invalid': d.err ? 'true' : null, 'aria-describedby': d.err ? 'rs-url-err' : null,
          on: { input: (e) => { d.url = e.target.value; d.err = null; if (!d.dirTouched) { d.dirName = basename(d.url.trim()).replace(/\.git$/, ''); const el = app.root.querySelector('#rs-dir'); if (el) el.value = d.dirName; } } } }),
        d.err ? h('p', { class: 'sim-field-error', id: 'rs-url-err', role: 'alert' }, d.err) : null,
        h('label', { for: 'rs-dir' }, 'Project directory name:'),
        h('input', { id: 'rs-dir', type: 'text', value: d.dirName, autocomplete: 'off', target: 'rs.dir-name', fk: 'rs.dir-name', on: { input: (e) => { d.dirName = e.target.value; d.dirTouched = true; } } }),
        h('label', { for: 'rs-parent' }, 'Create project as subdirectory of:'),
        h('div', { class: 'rs-row' }, h('input', { id: 'rs-parent', type: 'text', readOnly: true, value: parentShown, target: 'rs.parent' }),
          btn('Browse…', { cls: 'rs-btn', target: 'rs.browse', fk: 'rs.browse', on: () => pushDialog(app, { kind: 'picker', title: 'Choose Directory', button: 'Choose', dir: d.parent, focus: 'pick.ok', onPick: (dir) => { d.parent = dir; app.ui.focusAfter = 'rs.browse'; app.render(); } }) || app.render() })),
        h('label', { class: 'rs-check' }, h('input', { type: 'checkbox', checked: d.newSession, fk: 'rs.newsession', on: { change: (e) => { d.newSession = e.target.checked; } } }), 'Open in new session'))],
    actions: [['Back', () => { d.step = 'vc'; app.render(); }], ['Create Project', () => createProject(app, d), true, 'rs.create', 'rs.create'], ['Cancel', close]],
  };
}

function authDialog(app, d) {
  const s = st(app);
  const cancel = () => { popDialog(app); if (d.cancel) d.cancel(); };
  if (d.step === 'user') {
    const ok = () => {
      if (!d.value.trim()) { d.err = 'Le nom d’utilisateur ne doit pas être vide.'; app.render(); return; }
      d.username = d.value.trim();
      d.step = 'pass';
      d.title = E.authPrompts(d.username).password.trim();
      d.secret = '';
      d.err = null;
      app.ui.focusAfter = 'rs.auth-pass';
      app.render();
    };
    return {
      title: d.title,
      body: [h('label', { for: 'rs-auth-user', class: 'sr-only' }, d.title),
        h('input', { id: 'rs-auth-user', type: 'text', value: d.value, autocomplete: 'off', target: 'auth.username', fk: 'rs.auth-user', on: { input: (e) => { d.value = e.target.value; }, keydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } } } }),
        d.err ? h('p', { class: 'sim-field-error', role: 'alert' }, d.err) : null,
        h('p', { class: 'rs-note' }, icon('info'), 'Simulation : selon ton système, cette demande peut venir d’une autre fenêtre (gestionnaire d’identifiants).')],
      actions: [['OK', ok, true, 'rs.auth-ok', 'auth.ok'], ['Cancel', cancel]],
    };
  }
  const field = secretField(app, { id: 'rs-auth-pass', state: d, key: 'secret', fk: 'rs.auth-pass', onEnter: () => ok() });
  function ok() {
    const v = field.read();
    if (!v) { app.render(); return; }
    popDialog(app);
    d.resolve({ username: d.username, secret: v });
  }
  return {
    title: d.title,
    body: [field.wrap, h('p', { class: 'rs-note' }, icon('info'), 'Colle ici le jeton personnel, à la place du mot de passe.')],
    actions: [['OK', ok, true, 'rs.auth-ok2', 'auth.ok'], ['Cancel', cancel]],
  };
}

function reviewWindow(app, d, top) {
  const s = st(app);
  const repo = repoOf(app);
  const r = s.review;
  const close = () => { s.dialogs = s.dialogs.filter((x) => x !== d); app.ui.focusAfter = 'rs.git-commit'; app.render(); };
  const ahead = E.ahead(repo);
  let main;
  if (r.tab === 'history') {
    const list = [...repo.commits].reverse();
    main = h('div', { class: 'rs-history' }, h('table', { class: 'rs-git-table' }, h('caption', { class: 'sr-only' }, 'Historique'),
      h('thead', {}, h('tr', {}, ['Subject', 'Author', 'Date', 'SHA'].map((x) => h('th', { scope: 'col' }, x)))),
      h('tbody', {}, list.map((c) => h('tr', {}, h('td', {}, c.message.split('\n')[0], c.id === repo.commits[repo.commits.length - 1].id ? h('span', { class: 'rs-ref' }, 'HEAD → main') : null, c.id === repo.originHead ? h('span', { class: 'rs-ref is-remote' }, 'origin/main') : null),
        h('td', {}, c.author), h('td', {}, c.date), h('td', {}, h('code', {}, short(c.id))))))));
  } else {
    const sel = r.sel;
    const head = E.headTree(repo);
    let diff = null;
    if (sel) {
      const [a, b] = r.show === 'staged' ? [head[sel], repo.index[sel]] : [repo.index[sel] ?? head[sel], repo.work[sel]];
      const ops = lineOps(a || '', b || '');
      diff = h('pre', { class: 'rs-diff', tabindex: '0', 'aria-label': `Diff de ${sel}` }, ops.length ? ops.map((o) => h('span', { class: ['rs-diff-line', o.t === '+' ? 'is-add' : o.t === '-' ? 'is-del' : ''] },
        h('span', { class: 'rs-diff-ln', 'aria-hidden': 'true' }, o.t === '+' ? '' : String(o.a)), h('span', { class: 'rs-diff-ln', 'aria-hidden': 'true' }, o.t === '-' ? '' : String(o.b)), (o.t === ' ' ? '  ' : o.t + ' ') + o.line + '\n')) : 'Aucune différence pour cette vue.');
    }
    main = [
      h('div', { class: 'rs-review-top' },
        h('div', { class: 'rs-review-files' }, gitTable(app, repo, { review: true })),
        h('div', { class: 'rs-review-commit' },
          h('label', { for: 'rs-msg' }, 'Commit message'),
          h('textarea', { id: 'rs-msg', rows: '5', value: r.msg, target: 'rs.commit-message', fk: 'rs.commit-message', on: { input: (e) => { r.msg = e.target.value; } } }),
          h('label', { class: 'rs-check' }, h('input', { type: 'checkbox', checked: r.amend, fk: 'rs.amend', target: 'rs.amend', on: { change: (e) => { r.amend = e.target.checked; } } }), 'Amend previous commit'),
          btn('Commit', { cls: 'rs-btn rs-btn-primary', target: 'rs.commit-button', fk: 'rs.commit-button', on: () => doCommit(app) }))),
      h('div', { class: 'rs-review-diff' },
        h('div', { class: 'rs-review-diff-tools' }, h('span', {}, 'Show'),
          h('div', { class: 'sim-seg sim-seg-sm', role: 'radiogroup', 'aria-label': 'Afficher' }, ['unstaged', 'staged'].map((k) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(r.show === k), class: r.show === k ? 'is-on' : '', fk: 'rs.show-' + k, on: { click: () => { r.show = k; app.render(); } } }, k === 'staged' ? 'Staged' : 'Unstaged'))),
          sel ? btn(r.show === 'staged' ? 'Unstage' : 'Stage', { cls: 'rs-btn rs-btn-small', fk: 'rs.review-stage', on: () => toggleStage(app, { path: sel }, r.show === 'staged') }) : null,
          sel ? btn('Discard All', { cls: 'rs-btn rs-btn-small', fk: 'rs.review-revert', on: () => revert(app, sel) }) : null),
        diff || h('p', { class: 'rs-note' }, 'Sélectionne un fichier pour voir ses différences.')),
    ];
  }
  const box = h('div', { class: 'rs-review', 'data-anim': 'rs-review', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'RStudio: Review Changes', on: { keydown: (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } trapFocus(e.currentTarget, e); } } },
    h('div', { class: 'rs-dialog-title' }, h('span', {}, 'RStudio: Review Changes'), btn('Fermer Review Changes', { icon: 'x', hideLabel: true, cls: 'rs-x', fk: 'rs.review-close', on: close })),
    h('div', { class: 'rs-review-bar' },
      h('div', { class: 'sim-seg sim-seg-sm', role: 'radiogroup', 'aria-label': 'Vue' }, [['changes', 'Changes'], ['history', 'History']].map(([k, l]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(r.tab === k), class: r.tab === k ? 'is-on' : '', fk: 'rs.rtab-' + k, on: { click: () => { r.tab = k; if (k === 'history') app.act((w) => { E.emit(w, 'ide-history', {}); return {}; }); else app.render(); } } }, l))),
      h('span', { class: 'rs-review-status' }, !repo.upstream ? (repo.commits.length ? `On branch ${repo.branch} (no upstream).` : 'No commits yet.') : ahead ? `Your branch is ahead of 'origin/${repo.branch}' by ${ahead} commit${ahead > 1 ? 's' : ''}.` : `Your branch is up to date with 'origin/${repo.branch}'.`),
      h('span', { class: 'vs-spacer' }),
      h('button', { type: 'button', class: 'rs-gbtn rs-pull', fk: 'rs.review-pull', disabled: !repo.upstream, title: repo.upstream ? 'Pull' : NO_UPSTREAM, on: { click: () => doPush(app, true) } }, icon('pull'), 'Pull'),
      h('button', { type: 'button', class: 'rs-gbtn rs-push', fk: 'rs.review-push', target: 'rs.git-push', disabled: !repo.upstream, title: repo.upstream ? 'Push' : NO_UPSTREAM, on: { click: () => doPush(app) } }, icon('up'), 'Push')),
    h('div', { class: 'rs-review-main' }, main));
  return h('div', { class: ['rs-overlay rs-overlay-review', top ? '' : 'is-under'] }, box);
}

function vcSetup(app) {
  const s = st(app);
  s.menu = null;
  if (!projectPath(app)) { pushDialog(app, { kind: 'message', title: 'Project Options', text: 'Ouvre d’abord un projet RStudio (File › Open Project…).' }); app.render(); return; }
  const repo = repoOf(app);
  if (repo && repo.git) { pushDialog(app, { kind: 'message', title: 'Project Options', text: 'Ce projet est déjà suivi par Git.' }); app.render(); return; }
  pushDialog(app, { kind: 'vcsetup', value: 'none', focus: 'rs.vc-git' });
  app.render();
}
