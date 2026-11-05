// =====================================================================
// Vue Visual Studio Code (simulée). Réplique simplifiée des zones utiles,
// sans lien avec Microsoft. Toutes les actions passent par le moteur.
// =====================================================================

import * as E from '../engine/engine.js';
import { short, tildify, basename, classifySecret } from '../engine/util.js';
import { h, btn, icon, md, dismissable, trapFocus } from './dom.js';
import { renderTerminal } from './terminal.js';
import { secretField, folderPicker, SECRET_MSG } from './tools.js';
import { withCredentials, gist } from './net.js';
import { lineOps } from '../engine/diff.js';

const IDE = 'vscode';

function st(app) {
  return (app.ui.vscode[app.w.key] ||= { side: 'explorer', panel: true, panelTab: 'terminal', tabs: [], active: -1, quick: null, picker: null, notifs: [], menu: null, commitMsg: '', dialog: null, mpane: 'side', output: [], newFile: null });
}

const repoOf = (app) => E.currentRepo(app.w, IDE);
const bufKey = (app, repo, file) => `${app.w.key}:${repo.path}:${file}`;

function log(s, lines) { s.output.push(...lines); if (s.output.length > 300) s.output.splice(0, s.output.length - 300); }

function notify(app, n) {
  const s = st(app);
  s.notifs = [{ id: Date.now() + Math.random(), ...n }, ...s.notifs].slice(0, 3);
}

// ---------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------

function openFile(app, file) {
  const s = st(app);
  const repo = repoOf(app);
  let i = s.tabs.findIndex((t) => t.kind === 'file' && t.file === file);
  if (i < 0) { s.tabs.push({ kind: 'file', file }); i = s.tabs.length - 1; }
  s.active = i;
  s.mpane = 'editor';
  app.ui.focusAfter = 'vs.editor';
  app.act((w) => { E.emit(w, 'open-file', { file, ide: IDE, path: repo && repo.path }); return {}; });
}

function openDiff(app, file, staged) {
  const s = st(app);
  let i = s.tabs.findIndex((t) => t.kind === 'diff' && t.file === file && t.staged === staged);
  if (i < 0) { s.tabs.push({ kind: 'diff', file, staged }); i = s.tabs.length - 1; }
  s.active = i;
  s.mpane = 'editor';
  app.act((w) => { E.emit(w, 'diff-view', { via: IDE, staged, file }); return {}; });
}

function closeTab(app, i) {
  const s = st(app);
  s.tabs.splice(i, 1);
  s.active = Math.min(s.active, s.tabs.length - 1);
  app.render();
}

function save(app, file) {
  const repo = repoOf(app);
  if (!repo) return;
  const b = app.ui.buffers[bufKey(app, repo, file)];
  if (!b) return;
  app.act((w) => E.writeFile(w, repo.path, file, b.text));
  b.dirty = false;
  app.render();
}

function startClone(app) {
  const s = st(app);
  s.menu = null;
  s.quick = { kind: 'clone-url', value: '', err: null };
  app.act((w) => { E.emit(w, 'clone-start', { via: IDE }); return {}; }, { render: false });
  app.ui.focusAfter = 'vs.quickinput';
  app.render();
}

function doClone(app, url, parentDir) {
  const s = st(app);
  log(s, [`> git clone ${url.replace(/\/\/[^@/]*@/, '//') } ${parentDir}/${basename(url).replace(/\.git$/, '')} --progress`]);
  withCredentials(app, (w, auth) => E.cloneRepo(w, { url, parentDir, auth, via: IDE }), {
    ask: (prompts, resolve, cancel) => askAuth(app, prompts, resolve, cancel),
    done: (r) => {
      log(s, r.out || []);
      if (r.ok) {
        notify(app, { kind: 'info', text: 'Would you like to open the cloned repository?', actions: [
          { label: 'Open', target: 'vs.notif-open', fn: () => openRepo(app, r.repo.path) },
          { label: 'Open in New Window', fn: () => openRepo(app, r.repo.path, true) },
        ] });
        app.ui.focusAfter = 'vs.notif-open';
      } else if (r.code === 'secret-in-url') {
        notify(app, { kind: 'warn', text: 'Simulation : une URL contenant un jeton est refusée ici. Elle l’enregistrerait en clair dans .git/config. Utilise l’URL HTTPS seule ; Git demandera le jeton.' });
      } else {
        notify(app, { kind: 'error', text: 'Git: ' + gist(r.out), actions: [{ label: 'Open Git Log', fn: () => { s.panel = true; s.panelTab = 'output'; s.mpane = 'panel'; app.render(); } }] });
      }
    },
    onCancel: () => { log(s, ['Git: canceled']); notify(app, { kind: 'warn', text: 'Git: Authentication canceled. (Simulation : le clonage a été interrompu.)' }); },
  });
}

function openRepo(app, path, newWindow) {
  const s = st(app);
  s.tabs = []; s.active = -1; s.side = 'explorer'; s.mpane = 'side';
  app.act((w) => E.openFolder(w, IDE, path), { summary: newWindow ? `VS Code a ouvert ${path} (dans la simulation, la « nouvelle fenêtre » remplace l’actuelle).` : null });
  app.ui.focusAfter = 'vs.explorer';
  app.render();
}

function askAuth(app, prompts, resolve, cancel) {
  const s = st(app);
  s.quick = { kind: 'auth-user', label: prompts.username, value: '', resolve, cancel, err: null };
  app.ui.focusAfter = 'vs.quickinput';
}

function stageFile(app, f) { const r = repoOf(app); app.act((w) => E.stage(w, r.path, [f], IDE)); }
function unstageFile(app, f) { const r = repoOf(app); app.act((w) => E.unstage(w, r.path, [f], IDE)); }
function discardFile(app, f) {
  const r = repoOf(app);
  app.confirm({ title: `Are you sure you want to discard changes in '${f}'?`, body: 'This action is irreversible! Tes modifications non enregistrées dans un commit seront perdues.', ok: 'Discard File', danger: true, onOk: () => app.act((w) => E.discard(w, r.path, [f], IDE)) });
}

function commit(app, { amend = false, all = false } = {}) {
  const s = st(app);
  const repo = repoOf(app);
  if (!repo) return;
  const msg = s.commitMsg.trim() || (amend ? repo.commits[repo.commits.length - 1].message : '');
  if (!msg) {
    notify(app, { kind: 'warn', text: 'Écris d’abord un message dans la zone Message. (VS Code ouvrirait sinon un éditeur dédié au message de commit.)' });
    app.ui.focusAfter = 'vs.commit-message';
    app.render();
    return;
  }
  const status = E.status(repo);
  if (!amend && !all && !status.staged.length && (status.unstaged.length || status.untracked.length)) {
    s.dialog = { kind: 'no-staged' };
    app.render();
    return;
  }
  log(s, [`> git commit${amend ? ' --amend' : ''} --quiet --allow-empty-message --file -`]);
  const r = app.act((w) => {
    if (all) E.stageAll(w, repo.path, IDE);
    return E.commit(w, repo.path, { message: msg, amend, via: IDE });
  }, { render: false });
  log(s, r.out || []);
  if (r.ok) s.commitMsg = '';
  else if (r.code === 'identity') notify(app, { kind: 'error', text: 'Make sure you configure your "user.name" and "user.email" in git.', actions: [{ label: 'Open Git Log', fn: () => { s.panel = true; s.panelTab = 'output'; app.render(); } }] });
  else if (r.code === 'nothing-staged') notify(app, { kind: 'info', text: 'There are no changes to commit.' });
  app.render();
}

function push(app, { sync = false } = {}) {
  const s = st(app);
  const repo = repoOf(app);
  if (!repo) return;
  s.menu = null;
  // Sans branche suivie, VS Code propose de publier la branche (git push -u origin main).
  const publish = !repo.upstream;
  if (publish) sync = false;
  if (!repo.remote) {
    notify(app, { kind: 'warn', text: 'Ce dépôt n’a pas encore de remote. Ajoute-le : … › Remote › Add Remote… (ou git remote add origin <URL>). VS Code proposerait aussi « Publish to GitHub », qui ne concerne pas GitLab.', actions: [{ label: 'Add Remote…', fn: () => startAddRemote(app) }] });
    app.render();
    return;
  }
  if (sync && !s.syncConfirmed) {
    s.dialog = { kind: 'sync' };
    app.render();
    return;
  }
  log(s, [sync ? `> git pull --tags origin ${repo.branch}` : publish ? `> git push -u origin ${repo.branch}` : `> git push origin ${repo.branch}:${repo.branch}`]);
  const run = (w, auth) => {
    if (sync) {
      const p = E.pull(w, repo.path, { auth, via: IDE });
      if (!p.ok) return p;
      log(s, p.out || []);
      log(s, [`> git push origin ${repo.branch}:${repo.branch}`]);
    }
    return E.push(w, repo.path, { auth, via: IDE, explicit: true, setUpstream: publish });
  };
  withCredentials(app, run, {
    ask: (prompts, resolve, cancel) => askAuth(app, prompts, resolve, cancel),
    done: (r) => {
      log(s, r.out || []);
      if (!r.ok) notify(app, { kind: 'error', text: 'Git: ' + gist(r.out), actions: [{ label: 'Open Git Log', fn: () => { s.panel = true; s.panelTab = 'output'; s.mpane = 'panel'; app.render(); } }] });
      else if (r.code === 'up-to-date' && !E.status(repo).clean) notify(app, { kind: 'info', text: 'Rien à envoyer : tes modifications ne sont pas encore dans un commit. (Message pédagogique de la simulation.)' });
    },
    onCancel: () => notify(app, { kind: 'warn', text: 'Git: Authentication canceled.' }),
  });
}

// ---------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------

export function renderVSCode(app) {
  const s = st(app);
  const repo = repoOf(app);
  const opened = app.w.ws.opened.vscode;
  const title = opened ? basename(opened) : 'Welcome';
  const frame = h('div', { class: 'sim-frame vs', id: 'sim-frame', role: 'tabpanel', 'aria-label': 'Visual Studio Code (simulé)', 'data-mpane': s.mpane, on: { keydown: (e) => onKeys(app, e) } },
    titleBar(app, title),
    h('div', { class: 'vs-mpanes', role: 'tablist', 'aria-label': 'Zone affichée' }, [['side', s.side === 'scm' ? 'Source Control' : 'Explorer'], ['editor', 'Éditeur'], ['panel', 'Terminal']].map(([k, l]) =>
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(s.mpane === k), class: s.mpane === k ? 'is-on' : '', fk: 'vs.mp-' + k, on: { click: () => { s.mpane = k; if (k === 'panel') s.panel = true; app.render(); } } }, l))),
    h('div', { class: 'vs-main' },
      activityBar(app, repo),
      h('div', { class: 'vs-side', 'aria-label': s.side === 'scm' ? 'Source Control' : 'Explorer', role: 'region' }, s.side === 'scm' ? scmView(app, repo) : explorerView(app, repo)),
      h('div', { class: ['vs-center', s.panel ? 'has-panel' : ''] },
        editorArea(app, repo),
        s.panel ? panel(app) : null)),
    statusBar(app, repo),
    s.quick ? quickInput(app) : null,
    s.picker ? h('div', { class: 'vs-overlay' }, h('div', { class: 'vs-dialog', 'data-anim': 'vs-picker', role: 'dialog', 'aria-modal': 'true', 'aria-label': s.picker.title, on: { keydown: (e) => { if (e.key === 'Escape') { e.stopPropagation(); s.picker = null; app.render(); } trapFocus(e.currentTarget, e); } } },
      folderPicker(app, { state: s.picker, title: s.picker.title, button: s.picker.button, note: s.picker.note, onCancel: () => { s.picker = null; app.render(); }, onPick: (dir) => { const p = s.picker; s.picker = null; p.onPick(dir); } }))) : null,
    s.dialog ? dialog(app, repo) : null,
    s.notifs.length ? h('div', { class: 'vs-notifs', role: 'region', 'aria-label': 'Notifications' }, s.notifs.map((n) => notif(app, n))) : null);
  return frame;
}

function onKeys(app, e) {
  const s = st(app);
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.shiftKey && (e.key === 'P' || e.key === 'p')) { e.preventDefault(); s.quick = { kind: 'palette', value: '>' }; app.ui.focusAfter = 'vs.quickinput'; app.render(); }
  else if (mod && e.key === '`') { e.preventDefault(); s.panel = !s.panel; s.panelTab = 'terminal'; app.ui.focusAfter = s.panel ? 'vsterm-input' : null; app.render(); }
}

function titleBar(app, title) {
  const s = st(app);
  const menus = {
    file: [
      { label: 'New File…', fn: () => newFile(app), disabled: !repoOf(app) },
      { label: 'Open Folder…', target: 'vs.open-folder', fn: () => openFolderDialog(app) },
      { label: 'Save', key: 'Ctrl+S', fn: () => { const t = s.tabs[s.active]; if (t && t.kind === 'file') save(app, t.file); } },
      { sep: true },
      { label: 'Close Folder', fn: () => { s.tabs = []; s.active = -1; app.act((w) => { w.ws.opened.vscode = null; return {}; }); }, disabled: !app.w.ws.opened.vscode },
    ],
    view: [
      { label: 'Command Palette…', key: 'Ctrl+Shift+P', target: 'vs.palette', fn: () => { s.quick = { kind: 'palette', value: '>' }; app.ui.focusAfter = 'vs.quickinput'; app.render(); } },
      { label: 'Explorer', fn: () => { s.side = 'explorer'; s.mpane = 'side'; app.render(); } },
      { label: 'Source Control', fn: () => showScm(app) },
      { label: 'Output', fn: () => { s.panel = true; s.panelTab = 'output'; s.mpane = 'panel'; app.render(); } },
    ],
    terminal: [
      { label: 'New Terminal', key: 'Ctrl+Shift+`', target: 'vs.new-terminal', fn: () => { s.panel = true; s.panelTab = 'terminal'; s.mpane = 'panel'; app.ui.focusAfter = 'vsterm-input'; app.render(); } },
    ],
  };
  const menuBtn = (k, label) => {
    const open = s.menu === k;
    const b = h('button', { type: 'button', class: ['vs-menubtn', open ? 'is-on' : ''], 'aria-expanded': String(open), 'aria-haspopup': 'menu', target: 'vs.menu-' + k, fk: 'vs.menu-' + k, on: { click: () => { s.menu = open ? null : k; app.render(); } } }, label);
    return h('div', { class: 'vs-menuwrap' }, b, open ? menuBox(app, menus[k], b) : null);
  };
  return h('div', { class: 'vs-title' },
    h('span', { class: 'vs-logo', 'aria-hidden': 'true' }, icon('code')),
    h('nav', { class: 'vs-menubar', 'aria-label': 'Menu' }, menuBtn('file', 'File'), h('span', { class: 'vs-menubtn is-oos', title: 'Non simulé' }, 'Edit'), h('span', { class: 'vs-menubtn is-oos', title: 'Non simulé' }, 'Selection'), menuBtn('view', 'View'), h('span', { class: 'vs-menubtn is-oos', title: 'Non simulé' }, 'Go'), menuBtn('terminal', 'Terminal')),
    h('button', { type: 'button', class: 'vs-command-center', target: 'vs.palette', fk: 'vs.cc', on: { click: () => { s.quick = { kind: 'palette', value: '>' }; app.ui.focusAfter = 'vs.quickinput'; app.render(); } } }, icon('search'), title),
    h('span', { class: 'vs-title-sim' }, 'Simulation'));
}

export function menuBox(app, items, opener, stateObj) {
  const s = stateObj || st(app);
  const box = h('div', { class: 'vs-menu', 'data-anim': 'vsm-' + (opener.dataset.fk || ''), role: 'menu' }, items.map((it) => it.sep ? h('div', { class: 'vs-menu-sep', role: 'separator' })
    : h('button', { type: 'button', role: 'menuitem', class: 'vs-menu-item', disabled: it.disabled, 'aria-disabled': it.oos ? 'true' : null, title: it.oos ? 'Hors du périmètre de la simulation' : null, target: it.target, fk: it.target || 'vsm-' + it.label,
      on: { click: () => { if (it.oos) return; s.menu = null; it.fn(); } } }, h('span', {}, it.label), it.key ? h('span', { class: 'vs-menu-key' }, it.key) : null, it.oos ? h('span', { class: 'vs-menu-key' }, 'non simulé') : null)));
  box.addEventListener('keydown', (e) => {
    const list = [...box.querySelectorAll('[role=menuitem]:not([disabled]):not([aria-disabled])')];
    const i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); (list[i + 1] || list[0]).focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); (list[i - 1] || list[list.length - 1]).focus(); }
    if (e.key === 'Escape') { e.stopPropagation(); s.menu = null; app.ui.focusAfter = opener.dataset.fk; app.render(); }
  });
  requestAnimationFrame(() => { if (document.activeElement === opener) { const f = box.querySelector('[role=menuitem]:not([disabled])'); if (f) f.focus(); } });
  dismissable(box, () => { if (s.menu) { s.menu = null; app.render(); } }, opener);
  return box;
}

function activityBar(app, repo) {
  const s = st(app);
  const n = repo && repo.git ? (() => { const x = E.status(repo); return x.staged.length + x.unstaged.length + x.untracked.length; })() : 0;
  const a = (k, label, ic, target, fn, badge) => h('button', { type: 'button', class: ['vs-act', s.side === k ? 'is-on' : ''], 'aria-label': label + (badge ? ` (${badge} changements)` : ''), title: label, 'aria-pressed': k ? String(s.side === k) : null, target, fk: target, on: { click: fn } }, icon(ic), badge ? h('span', { class: 'vs-badge', 'aria-hidden': 'true' }, String(badge)) : null);
  return h('nav', { class: 'vs-activity', 'aria-label': 'Barre d’activité' },
    a('explorer', 'Explorer', 'explorer', 'vs.explorer', () => { s.side = 'explorer'; s.mpane = 'side'; app.render(); }),
    h('button', { type: 'button', class: 'vs-act', 'aria-disabled': 'true', title: 'Search — non simulé' }, icon('search')),
    a('scm', 'Source Control', 'scm', 'vs.scm', () => showScm(app), n || null),
    h('button', { type: 'button', class: 'vs-act', 'aria-disabled': 'true', title: 'Run and Debug — non simulé' }, icon('run')),
    h('button', { type: 'button', class: 'vs-act', 'aria-disabled': 'true', title: 'Extensions — non simulé. Aucune extension n’est nécessaire pour cloner un dépôt par son URL.' }, icon('ext')));
}

function showScm(app) {
  const s = st(app);
  s.side = 'scm'; s.mpane = 'side';
  app.act((w) => { E.emit(w, 'view-scm', { ide: IDE }); return {}; });
}

function newFile(app) { const s = st(app); s.side = 'explorer'; s.newFile = { value: '' }; s.mpane = 'side'; app.ui.focusAfter = 'vs.newfile-input'; app.render(); }

function openFolderDialog(app) {
  const s = st(app);
  s.menu = null;
  s.picker = { title: 'Open Folder', button: 'Open', dir: app.w.ws.opened.vscode || app.w.ws.home, onPick: (dir) => openRepo(app, dir) };
  app.ui.focusAfter = 'pick.ok';
  app.render();
}

function explorerView(app, repo) {
  const s = st(app);
  const opened = app.w.ws.opened.vscode;
  if (!opened) {
    return [h('h2', { class: 'vs-side-title' }, 'Explorer'),
      h('div', { class: 'vs-welcome' },
        h('p', {}, 'You have not yet opened a folder.'),
        btn('Open Folder', { cls: 'vs-btn', target: 'vs.open-folder', fk: 'vs.open-folder-w', on: () => openFolderDialog(app) }),
        h('p', {}, 'You can clone a repository locally.'),
        btn('Clone Repository', { cls: 'vs-btn', target: 'vs.clone-button', fk: 'vs.clone-explorer', on: () => startClone(app) }))];
  }
  const head = [h('h2', { class: 'vs-side-title' }, 'Explorer'), h('div', { class: 'vs-folder-head' }, h('span', {}, basename(opened).toUpperCase()),
    repo ? btn('New File…', { icon: 'newfile', hideLabel: true, cls: 'vs-icon-btn', target: 'vs.new-file', on: () => newFile(app) }) : null)];
  if (!repo) {
    const kids = app.w.ws.dirs.filter((d) => d !== opened && d.startsWith(opened + '/') && !d.slice(opened.length + 1).includes('/'));
    return [...head, h('ul', { class: 'vs-tree' }, kids.map((d) => h('li', {}, h('span', { class: 'vs-tree-item is-dir' }, icon('folder'), basename(d))))),
      h('p', { class: 'vs-note' }, 'Ce dossier n’est pas un dépôt Git. Ouvre le dossier du projet cloné (File › Open Folder…).')];
  }
  const status = repo.git ? E.status(repo) : { untracked: [], unstaged: [], staged: [] };
  const mark = (f) => {
    if (!repo.git) return null;
    if (status.untracked.some((x) => x.path === f)) return ['U', 'is-u'];
    if (status.unstaged.some((x) => x.path === f) || status.staged.some((x) => x.path === f && x.kind === 'modified')) return ['M', 'is-m'];
    if (status.staged.some((x) => x.path === f && x.kind === 'new')) return ['A', 'is-a'];
    return null;
  };
  const files = Object.keys(repo.work).sort((a, b) => a.localeCompare(b));
  return [...head,
    h('ul', { class: 'vs-tree', role: 'tree', 'aria-label': basename(opened) },
      s.newFile ? h('li', { role: 'none' }, h('form', { class: 'vs-newfile', on: { submit: (e) => {
        e.preventDefault();
        const name = (s.newFile.value || '').trim();
        if (!/^[\w.-]+$/.test(name) || name.startsWith('-')) { s.newFile.err = 'Nom de fichier attendu, sans dossier (ex. synthese.qmd).'; app.render(); return; }
        if (repo.work[name] !== undefined) { s.newFile.err = `A file or folder ${name} already exists at this location.`; app.render(); return; }
        s.newFile = null;
        app.act((w) => E.writeFile(w, repo.path, name, ''), { render: false });
        openFile(app, name);
      } } }, icon('file'), h('input', { type: 'text', 'aria-label': 'Nom du nouveau fichier', value: s.newFile.value, fk: 'vs.newfile-input', on: { input: (e) => { s.newFile.value = e.target.value; }, keydown: (e) => { if (e.key === 'Escape') { s.newFile = null; app.render(); } } } }),
        s.newFile.err ? h('p', { class: 'vs-input-err', role: 'alert' }, s.newFile.err) : null)) : null,
      !files.length && !s.newFile ? h('li', { role: 'none' }, h('p', { class: 'vs-note' }, 'Ce dossier ne contient encore aucun fichier. Crée-en un avec l’icône New File… ci-dessus.')) : null,
      files.map((f) => {
        const m = mark(f);
        const t = s.tabs[s.active];
        return h('li', { role: 'none' }, h('button', { type: 'button', role: 'treeitem', class: ['vs-tree-item', t && t.file === f && t.kind === 'file' ? 'is-on' : '', m ? m[1] : ''], target: 'vs.file-' + f, fk: 'vs.file-' + f, on: { click: () => openFile(app, f) } },
          icon('file'), h('span', { class: 'vs-tree-name' }, f), m ? h('span', { class: 'vs-letter', title: m[0] === 'M' ? 'Modified' : m[0] === 'U' ? 'Untracked' : 'Index Added' }, m[0]) : null));
      })),
  ];
}

function scmView(app, repo) {
  const s = st(app);
  if (repo && repo.git === false) {
    return [h('h2', { class: 'vs-side-title' }, 'Source Control'),
      h('div', { class: 'vs-welcome' },
        h('p', {}, 'The folder currently open doesn’t have a Git repository. You can initialize a repository which will enable source control features powered by Git.'),
        btn('Initialize Repository', { cls: 'vs-btn', target: 'vs.init', on: () => initRepo(app) }),
        h('p', {}, 'You can directly publish this folder to a GitHub repository.'),
        h('button', { type: 'button', class: 'vs-btn', 'aria-disabled': 'true', title: 'Non simulé : ce bouton crée un dépôt sur GitHub, pas sur GitLab.' }, 'Publish to GitHub'),
        h('p', { class: 'vs-note' }, 'Pour GitLab : initialise le dépôt, puis ajoute le remote origin (… › Remote › Add Remote…).'))];
  }
  if (!repo) {
    return [h('h2', { class: 'vs-side-title' }, 'Source Control'),
      h('div', { class: 'vs-welcome' },
        h('p', {}, 'In order to use Git features, you can open a folder containing a Git repository or clone from a URL.'),
        btn('Open Folder', { cls: 'vs-btn', fk: 'vs.open-folder-scm', on: () => openFolderDialog(app) }),
        btn('Clone Repository', { cls: 'vs-btn', target: 'vs.clone-button', fk: 'vs.clone-scm', on: () => startClone(app) }),
        h('p', { class: 'vs-note' }, 'Aucune extension GitLab n’est nécessaire pour cloner un dépôt à partir de son URL.'))];
  }
  const x = E.status(repo);
  const ahead = E.ahead(repo);
  const changes = [...x.unstaged, ...x.untracked];
  const letter = (k) => ({ modified: 'M', new: 'A', deleted: 'D', untracked: 'U' }[k]);
  const row = (it, staged) => h('li', { class: 'vs-change' },
    h('button', { type: 'button', class: 'vs-change-main', target: (staged ? 'vs.staged-' : 'vs.change-') + it.path, fk: (staged ? 'vs.staged-' : 'vs.change-') + it.path, on: { click: () => openDiff(app, it.path, staged) }, title: `${it.path} — ouvrir le diff` },
      icon('file'), h('span', { class: 'vs-change-name' }, it.path), h('span', { class: ['vs-letter', 'is-' + letter(it.kind).toLowerCase()] }, letter(it.kind))),
    h('span', { class: 'vs-change-actions' },
      btn('Open File', { icon: 'file', hideLabel: true, cls: 'vs-icon-btn', fk: 'vs.of-' + it.path + staged, on: () => openFile(app, it.path) }),
      staged ? btn('Unstage Changes', { icon: 'x', hideLabel: true, cls: 'vs-icon-btn', target: 'vs.unstage-' + it.path, on: () => unstageFile(app, it.path) })
        : [btn('Discard Changes', { icon: 'restart', hideLabel: true, cls: 'vs-icon-btn', fk: 'vs.discard-' + it.path, on: () => discardFile(app, it.path) }),
          btn('Stage Changes', { icon: 'plus', hideLabel: true, cls: 'vs-icon-btn', target: 'vs.stage-' + it.path, on: () => stageFile(app, it.path) })]));
  const moreOpen = s.menu === 'more';
  const moreBtn = h('button', { type: 'button', class: 'vs-icon-btn', 'aria-label': 'More Actions…', title: 'More Actions…', 'aria-expanded': String(moreOpen), 'aria-haspopup': 'menu', target: 'vs.more', fk: 'vs.more', on: { click: () => { s.menu = moreOpen ? null : 'more'; app.render(); } } }, icon('more'));
  const more = moreOpen ? menuBox(app, [
    { label: 'Pull', fn: () => pullOnly(app) },
    { label: 'Push', target: 'vs.push', fn: () => push(app) },
    { label: 'Fetch', fn: () => pullOnly(app, true) },
    { label: 'Clone', fn: () => startClone(app) },
    { label: 'Remote › Add Remote…', target: 'vs.add-remote', fn: () => startAddRemote(app) },
    { label: 'Checkout to…', oos: true },
    { sep: true },
    { label: 'Commit', fn: () => commit(app) },
    { label: 'Commit All', fn: () => commit(app, { all: true }) },
    { label: 'Commit (Amend)', target: 'vs.amend', fn: () => commit(app, { amend: true }) },
    { sep: true },
    { label: 'Stage All Changes', fn: () => app.act((w) => E.stageAll(w, repo.path, IDE)) },
    { label: 'Unstage All Changes', fn: () => app.act((w) => E.unstage(w, repo.path, x.staged.map((y) => y.path), IDE)) },
  ], moreBtn) : null;
  const hasChanges = x.staged.length || changes.length;
  const action = !hasChanges && repo.commits.length && !repo.upstream
    ? btn('Publish Branch', { icon: 'up', cls: 'vs-btn vs-btn-primary', target: 'vs.publish', on: () => push(app) })
    : hasChanges || !ahead
    ? h('div', { class: 'vs-commit-split' },
      btn('Commit', { icon: 'check', cls: 'vs-btn vs-btn-primary', target: 'vs.commit-button', disabled: !hasChanges, on: () => commit(app) }),
      btn('Commit (Amend)', { icon: 'down', hideLabel: true, cls: 'vs-btn vs-btn-primary vs-btn-drop', fk: 'vs.commit-drop', disabled: !repo.commits.length, on: () => { s.menu = 'more'; app.render(); } }))
    : btn(`Sync Changes ${ahead}↑`, { icon: 'sync', cls: 'vs-btn vs-btn-primary', target: 'vs.sync', on: () => push(app, { sync: true }) });
  return [
    h('div', { class: 'vs-side-head' }, h('h2', { class: 'vs-side-title' }, 'Source Control'),
      h('span', { class: 'vs-side-actions' },
        btn('Commit', { icon: 'check', hideLabel: true, cls: 'vs-icon-btn', fk: 'vs.commit-icon', on: () => commit(app) }),
        btn('Refresh', { icon: 'sync', hideLabel: true, cls: 'vs-icon-btn', fk: 'vs.refresh', on: () => app.act((w) => { E.emit(w, 'status-view', { path: repo.path, via: IDE }); return {}; }) }),
        h('span', { class: 'vs-menuwrap' }, moreBtn, more))),
    h('div', { class: 'vs-commit-box' },
      h('label', { class: 'sr-only', for: 'vs-msg' }, 'Message de commit'),
      h('textarea', { id: 'vs-msg', rows: '2', placeholder: `Message (Ctrl+Enter to commit on "${repo.branch}")`, value: s.commitMsg, target: 'vs.commit-message', fk: 'vs.commit-message',
        on: { input: (e) => { s.commitMsg = e.target.value; }, keydown: (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(app); } } } }),
      action),
    x.staged.length ? h('section', { class: 'vs-group' }, h('h3', {}, 'Staged Changes', h('span', { class: 'vs-count' }, String(x.staged.length))), h('ul', {}, x.staged.map((it) => row(it, true)))) : null,
    h('section', { class: 'vs-group' }, h('h3', {}, 'Changes', h('span', { class: 'vs-count' }, String(changes.length)),
      changes.length ? btn('Stage All Changes', { icon: 'plus', hideLabel: true, cls: 'vs-icon-btn vs-group-act', target: 'vs.stage-all', fk: 'vs.stage-all', on: () => app.act((w) => E.stageAll(w, repo.path, IDE)) }) : null),
    changes.length ? h('ul', {}, changes.map((it) => row(it, false))) : h('p', { class: 'vs-note' }, 'Aucune modification.')),
    graph(app, repo),
  ];
}

function pullOnly(app, fetchOnly = false) {
  const s = st(app);
  const repo = repoOf(app);
  log(s, [fetchOnly ? '> git fetch' : `> git pull --tags origin ${repo.branch}`]);
  withCredentials(app, (w, auth) => E.pull(w, repo.path, { auth, via: IDE, fetchOnly }), {
    ask: (prompts, resolve, cancel) => askAuth(app, prompts, resolve, cancel),
    done: (r) => { log(s, r.out || []); if (!r.ok) notify(app, { kind: 'error', text: 'Git: ' + gist(r.out) }); },
  });
}

function graph(app, repo) {
  const list = [...repo.commits].reverse().slice(0, 6);
  const headId = repo.commits.length ? repo.commits[repo.commits.length - 1].id : null;
  return h('section', { class: 'vs-group vs-graph' }, h('h3', {}, 'Graph'),
    h('ol', {}, list.map((c) => h('li', {},
      h('span', { class: 'vs-graph-dot', 'aria-hidden': 'true' }),
      h('span', { class: 'vs-graph-msg' }, c.message.split('\n')[0]),
      c.id === headId ? h('span', { class: 'vs-ref is-local' }, 'main') : null,
      c.id === repo.originHead ? h('span', { class: 'vs-ref is-remote' }, 'origin/main') : null))));
}

function editorArea(app, repo) {
  const s = st(app);
  if (!s.tabs.length || s.active < 0) {
    return h('div', { class: 'vs-editor-empty' }, h('div', {}, icon('code', 'vs-watermark'),
      h('p', {}, app.w.ws.opened.vscode ? 'Ouvre un fichier dans l’explorateur.' : 'Clone un dépôt ou ouvre un dossier pour commencer.'),
      h('dl', { class: 'vs-shortcuts' }, h('dt', {}, 'Show All Commands'), h('dd', {}, 'Ctrl+Shift+P'), h('dt', {}, 'Toggle Terminal'), h('dd', {}, 'Ctrl+`'))));
  }
  const tabs = h('div', { class: 'vs-tabs', role: 'tablist', 'aria-label': 'Fichiers ouverts' }, s.tabs.map((t, i) => {
    const b = repo && t.kind === 'file' ? app.ui.buffers[bufKey(app, repo, t.file)] : null;
    const label = t.kind === 'diff' ? `${t.file} (${t.staged ? 'Index' : 'Working Tree'})` : t.file;
    return h('div', { class: ['vs-tab', i === s.active ? 'is-on' : '', b && b.dirty ? 'is-dirty' : ''], role: 'presentation' },
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(i === s.active), class: 'vs-tab-btn', fk: 'vs.tab-' + i, on: { click: () => { s.active = i; app.render(); } } }, icon(t.kind === 'diff' ? 'diff' : 'file'), label, b && b.dirty ? h('span', { class: 'sr-only' }, ' (non enregistré)') : null),
      h('span', { class: 'vs-tab-dirty', 'aria-hidden': 'true' }),
      btn(`Close ${label}`, { icon: 'x', hideLabel: true, cls: 'vs-tab-x', fk: 'vs.tabx-' + i, on: () => closeTab(app, i) }));
  }));
  const t = s.tabs[s.active];
  let body;
  if (!repo || (t.kind === 'file' && repo.work[t.file] === undefined)) body = h('p', { class: 'vs-note' }, 'Ce fichier n’existe plus.');
  else if (t.kind === 'diff') body = diffView(repo, t);
  else body = fileEditor(app, repo, t.file);
  return h('div', { class: 'vs-editor' }, tabs, body);
}

function fileEditor(app, repo, file) {
  const key = bufKey(app, repo, file);
  const b = (app.ui.buffers[key] ||= { text: repo.work[file], dirty: false });
  if (!b.dirty) b.text = repo.work[file];
  const lines = b.text.split('\n').length;
  const gutter = h('div', { class: 'vs-gutter', 'aria-hidden': 'true' }, Array.from({ length: lines }, (_, i) => h('span', {}, String(i + 1))));
  const ta = h('textarea', {
    class: 'vs-textarea', spellcheck: 'false', 'aria-label': `Éditeur : ${file}`, value: b.text, target: 'vs.editor', fk: 'vs.editor', wrap: 'off',
    on: {
      input: (e) => {
        b.text = e.target.value;
        if (!b.dirty) { b.dirty = true; const tab = app.root.querySelector('.vs-tab.is-on'); if (tab) tab.classList.add('is-dirty'); }
        const n = b.text.split('\n').length;
        if (gutter.children.length !== n) gutter.replaceChildren(...Array.from({ length: n }, (_, i) => h('span', {}, String(i + 1))));
      },
      scroll: (e) => { gutter.scrollTop = e.target.scrollTop; },
      keydown: (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); save(app, file); }
        if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey) { /* Tab garde son rôle de navigation clavier */ }
      },
    },
  });
  return h('div', { class: 'vs-code' }, gutter, ta, b.dirty ? h('p', { class: 'vs-unsaved', role: 'status' }, '● Non enregistré — Ctrl+S ou File › Save') : null);
}

function diffView(repo, t) {
  const head = E.headTree(repo);
  const [a, b] = t.staged ? [head[t.file], repo.index[t.file]] : [repo.index[t.file] ?? head[t.file], repo.work[t.file]];
  const ops = lineOps(a || '', b || '');
  return h('div', { class: 'vs-diff', role: 'region', 'aria-label': `Diff de ${t.file}`, tabindex: '0' },
    h('p', { class: 'vs-diff-legend' }, h('span', { class: 'is-del' }, '− ligne supprimée'), h('span', { class: 'is-add' }, '+ ligne ajoutée')),
    h('pre', {}, ops.map((o) => h('span', { class: ['vs-diff-line', o.t === '+' ? 'is-add' : o.t === '-' ? 'is-del' : ''] },
      h('span', { class: 'vs-diff-ln', 'aria-hidden': 'true' }, o.t === '+' ? '' : String(o.a)), h('span', { class: 'vs-diff-ln', 'aria-hidden': 'true' }, o.t === '-' ? '' : String(o.b)),
      h('span', { class: 'vs-diff-sign' }, o.t === ' ' ? ' ' : o.t === '+' ? '+' : '−'), o.line + '\n'))));
}

function panel(app) {
  const s = st(app);
  const tab = (k, label, target) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(s.panelTab === k), class: s.panelTab === k ? 'is-on' : '', target, fk: target, on: { click: () => { s.panelTab = k; app.render(); } } }, label);
  return h('div', { class: 'vs-panel', role: 'region', 'aria-label': 'Panneau' },
    h('div', { class: 'vs-panel-tabs', role: 'tablist' },
      h('span', { class: 'vs-panel-oos', title: 'Non simulé' }, 'PROBLEMS'),
      tab('output', 'OUTPUT', 'vs.output-tab'),
      tab('terminal', 'TERMINAL', 'vs.terminal-tab'),
      h('span', { class: 'vs-spacer' }),
      btn('Close Panel', { icon: 'x', hideLabel: true, cls: 'vs-icon-btn', fk: 'vs.panel-x', on: () => { s.panel = false; app.render(); } })),
    s.panelTab === 'output'
      ? h('div', { class: 'vs-output', role: 'log', 'aria-label': 'Git (sortie)', 'data-autoscroll': '', tabindex: '0' }, h('p', { class: 'vs-output-head' }, 'Git'), s.output.length ? s.output.map((l) => h('div', {}, l)) : h('div', {}, 'Aucune commande Git lancée depuis l’interface.'))
      : renderTerminal(app, IDE, { fk: 'vsterm', label: 'Terminal bash' }));
}

function statusBar(app, repo) {
  const ahead = repo ? E.ahead(repo) : 0;
  return h('footer', { class: 'vs-status', 'aria-label': 'Barre d’état' },
    repo && repo.git ? h('span', { class: 'vs-status-item', target: 'vs.statusbar-branch', title: 'Branche courante' }, icon('branch'), repo.branch) : null,
    repo && !repo.upstream ? h('button', { type: 'button', class: 'vs-status-item', target: 'vs.status-sync', fk: 'vs.status-sync', title: 'Publish Branch', 'aria-label': 'Publier la branche', disabled: !repo.commits.length, on: { click: () => push(app) } }, icon('up'), 'Publish Branch') : null,
    repo && repo.upstream ? h('button', { type: 'button', class: 'vs-status-item', target: 'vs.status-sync', fk: 'vs.status-sync', title: `Synchronize Changes : ${ahead} commit(s) à envoyer`, 'aria-label': `Synchroniser : 0 à recevoir, ${ahead} à envoyer`, on: { click: () => push(app, { sync: true }) } }, icon('sync'), `0↓ ${ahead}↑`) : null,
    h('span', { class: 'vs-spacer' }),
    h('span', { class: 'vs-status-item' }, `${app.w.account.username}@${app.w.ws.host}`),
    h('span', { class: 'vs-status-item' }, 'Simulation'));
}

function notif(app, n) {
  const s = st(app);
  const close = () => { s.notifs = s.notifs.filter((x) => x.id !== n.id); app.render(); };
  return h('div', { class: ['vs-notif', 'is-' + n.kind], 'data-anim': 'vsn-' + n.id, role: n.kind === 'error' ? 'alert' : 'status' },
    h('div', { class: 'vs-notif-body' }, icon(n.kind === 'error' ? 'alert' : n.kind === 'warn' ? 'alert' : 'info'), h('pre', { class: 'vs-notif-text' }, n.text),
      btn('Clear Notification', { icon: 'x', hideLabel: true, cls: 'vs-icon-btn', fk: 'vs.nx-' + n.id, on: close })),
    n.actions ? h('div', { class: 'vs-notif-actions' }, n.actions.map((a) => btn(a.label, { cls: 'vs-btn vs-btn-primary vs-btn-small', target: a.target, fk: a.target || 'vs.na-' + a.label, on: () => { s.notifs = s.notifs.filter((x) => x.id !== n.id); a.fn(); } }))) : null);
}

const COMMANDS = [
  { id: 'clone', label: 'Git: Clone', run: (app) => startClone(app) },
  { id: 'init', label: 'Git: Initialize Repository', run: (app) => initRepo(app) },
  { id: 'remote', label: 'Git: Add Remote…', run: (app) => startAddRemote(app) },
  { id: 'open', label: 'File: Open Folder…', run: (app) => openFolderDialog(app) },
  { id: 'push', label: 'Git: Push', run: (app) => push(app) },
  { id: 'pull', label: 'Git: Pull', run: (app) => pullOnly(app) },
  { id: 'sync', label: 'Git: Sync', run: (app) => push(app, { sync: true }) },
  { id: 'commit', label: 'Git: Commit', run: (app) => commit(app) },
  { id: 'amend', label: 'Git: Commit (Amend)', run: (app) => commit(app, { amend: true }) },
  { id: 'term', label: 'Terminal: Create New Terminal', run: (app) => { const s = st(app); s.panel = true; s.panelTab = 'terminal'; s.mpane = 'panel'; app.ui.focusAfter = 'vsterm-input'; app.render(); } },
  { id: 'scm', label: 'View: Show Source Control', run: (app) => showScm(app) },
];

function quickInput(app) {
  const s = st(app);
  const q = s.quick;
  const close = (cancelled = true) => {
    const cb = q.cancel;
    s.quick = null;
    if (cancelled && cb) cb(); else app.render();
  };
  let placeholder = '', items = [], prompt = null, password = false, field;
  if (q.kind === 'palette') {
    const filter = q.value.replace(/^>\s*/, '').toLowerCase();
    items = COMMANDS.filter((c) => !filter || c.label.toLowerCase().includes(filter));
    placeholder = 'Type the name of a command to run.';
  } else if (q.kind === 'clone-url') {
    placeholder = 'Provide repository URL or pick a repository source.';
    items = [{ id: 'url', label: q.value.trim() ? `Clone from URL ${q.value.trim()}` : 'Repository URL', disabled: !q.value.trim() }, { id: 'gh', label: 'Clone from GitHub', oos: true }];
  } else if (q.kind === 'remote-url') {
    placeholder = 'Provide repository URL';
  } else if (q.kind === 'remote-name') {
    placeholder = 'Provide remote name';
    prompt = `URL : ${q.url}`;
  } else if (q.kind === 'auth-user') {
    prompt = q.label;
    placeholder = 'Username';
  } else if (q.kind === 'auth-pass') {
    prompt = q.label;
    password = true;
  }
  const accept = (item) => {
    if (q.kind === 'palette') { const c = item || items[0]; if (!c) return; s.quick = null; c.run(app); return; }
    if (q.kind === 'clone-url') {
      const url = q.value.trim();
      if (!url) { q.err = 'Indique l’URL du dépôt (bouton Code de GitLab › Clone with HTTPS).'; app.render(); return; }
      if (classifySecret(url) === 'real' || /glpat-|DEMO-TOKEN-/.test(url)) {
        if (!/^https?:\/\//.test(url) && !/^git@/.test(url)) { q.value = ''; q.err = 'Ce champ attend l’adresse du dépôt, pas un jeton. Ta saisie a été effacée.'; app.render(); return; }
      }
      s.quick = null;
      s.picker = { title: 'Select as Repository Destination', button: 'Select as Repository Destination', dir: app.w.ws.home, note: 'Git créera dans ce dossier un sous-dossier portant le nom du dépôt.', onPick: (dir) => doClone(app, url, dir) };
      app.ui.focusAfter = 'pick.ok';
      app.render();
      return;
    }
    if (q.kind === 'remote-url') {
      const url = q.value.trim();
      if (!url) { q.err = 'Indique l’URL du dépôt (bouton Code de GitLab › Clone with HTTPS).'; app.render(); return; }
      s.quick = { kind: 'remote-name', value: 'origin', url, err: null };
      app.ui.focusAfter = 'vs.quickinput';
      app.render();
      return;
    }
    if (q.kind === 'remote-name') {
      const name = q.value.trim();
      const repo = repoOf(app);
      if (name !== 'origin') { q.err = 'Dans ce parcours, le dépôt distant s’appelle origin.'; app.render(); return; }
      s.quick = null;
      log(s, [`> git remote add ${name} ${q.url.replace(/\/\/[^@/]*@/, '//')}`]);
      const r = app.act((w) => E.addRemote(w, repo.path, name, q.url, { via: IDE }), { render: false });
      if (r.code === 'secret-in-url') notify(app, { kind: 'warn', text: 'Simulation : une URL contenant un jeton est refusée. Elle serait enregistrée en clair dans .git/config. Utilise l’URL HTTPS seule ; Git demandera le jeton au push.' });
      else if (!r.ok) notify(app, { kind: 'error', text: 'Git: ' + gist(r.out) });
      app.render();
      return;
    }
    if (q.kind === 'auth-user') {
      if (!q.value.trim()) { q.err = 'Le nom d’utilisateur ne doit pas être vide (GitLab ne le vérifie pas avec un jeton, mais Git l’exige).'; app.render(); return; }
      s.quick = { kind: 'auth-pass', label: E.authPrompts(q.value.trim()).password, username: q.value.trim(), resolve: q.resolve, cancel: q.cancel, secret: '', err: null };
      app.ui.focusAfter = 'vs.quickinput';
      app.render();
      return;
    }
    if (q.kind === 'auth-pass') {
      const v = field.read();
      if (!v) { app.render(); return; }
      const r = q.resolve;
      s.quick = null;
      r({ username: q.username, secret: v });
    }
  };
  if (password) {
    field = secretField(app, { id: 'vs-qi-pass', state: q, key: 'secret', fk: 'vs.quickinput', onEnter: () => accept() });
  }
  const input = password ? null : h('input', {
    type: 'text', class: 'vs-qi-input', value: q.value, placeholder, 'aria-label': prompt || placeholder, target: 'vs.quickinput', fk: 'vs.quickinput', autocomplete: 'off', spellcheck: 'false',
    target2: null,
    on: {
      input: (e) => { q.value = e.target.value; q.err = null; if (q.kind === 'palette' || q.kind === 'clone-url') { const pos = e.target.selectionStart; app.render(); const el = app.root.querySelector('[data-fk="vs.quickinput"]'); if (el) { el.focus(); el.setSelectionRange(pos, pos); } } },
      paste: (e) => {
        const t = (e.clipboardData || window.clipboardData).getData('text');
        if (q.kind === 'auth-user' && classifySecret(t) !== 'other' && classifySecret(t) !== 'empty') { e.preventDefault(); q.err = 'Ce champ attend le nom d’utilisateur. Le jeton se colle à l’étape suivante (Password).'; app.render(); }
      },
      keydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); accept(); } },
    },
  });
  const box = h('div', { class: 'vs-quick', 'data-anim': 'vsq-' + q.kind, role: 'dialog', 'aria-modal': 'true', 'aria-label': prompt || 'Quick input', on: { keydown: (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } trapFocus(e.currentTarget, e); } } },
    prompt ? h('p', { class: 'vs-qi-prompt' }, prompt) : null,
    input || field.wrap,
    q.err && !password ? h('p', { class: 'vs-input-err', role: 'alert' }, q.err) : null,
    items.length ? h('ul', { class: 'vs-qi-list', role: 'listbox', 'aria-label': 'Suggestions' }, items.map((it, i) => h('li', { role: 'option', 'aria-selected': String(i === 0) },
      h('button', { type: 'button', class: ['vs-qi-item', i === 0 ? 'is-on' : ''], disabled: it.disabled, 'aria-disabled': it.oos ? 'true' : null, fk: 'vs.qi-' + it.id, title: it.oos ? 'Hors du périmètre de la simulation' : null, on: { click: () => { if (!it.oos) accept(q.kind === 'palette' ? it : null); } } }, it.label, it.oos ? h('span', { class: 'vs-menu-key' }, 'non simulé') : null)))) : null,
    (q.kind === 'auth-user' || q.kind === 'auth-pass') ? h('p', { class: 'vs-qi-note' }, icon('info'), 'Simulation : selon ton système, cette demande peut prendre la forme d’une fenêtre du gestionnaire d’identifiants. Le jeton se saisit à la place du mot de passe ; tape Entrée pour valider, Échap pour annuler.') : null,
    q.kind === 'auth-pass' ? null : h('p', { class: 'vs-qi-note' }, 'Entrée pour valider · Échap pour annuler'));
  return h('div', { class: 'vs-quick-layer' }, box);
}

function dialog(app, repo) {
  const s = st(app);
  const d = s.dialog;
  const close = () => { s.dialog = null; app.render(); };
  let title, body, actions;
  if (d.kind === 'no-staged') {
    title = 'Visual Studio Code';
    body = [h('p', {}, h('strong', {}, 'There are no staged changes to commit.')), h('p', {}, 'Would you like to stage all your changes and commit them directly?')];
    actions = [['Yes', () => { s.dialog = null; commit(app, { all: true }); }, true], ['Never', close]];
  } else {
    title = 'Visual Studio Code';
    body = [h('p', {}, `This action will pull and push commits from and to "origin/${repo.branch}".`), h('p', { class: 'vs-note' }, 'Sync = récupérer (pull) puis envoyer (push). Pour envoyer seulement : … › Push.')];
    actions = [['OK', () => { s.dialog = null; s.syncConfirmed = true; push(app, { sync: true }); s.syncConfirmed = false; }, true], ['OK, Don’t Show Again', () => { s.dialog = null; s.syncConfirmed = true; push(app, { sync: true }); }], ['Cancel', close]];
  }
  return h('div', { class: 'vs-overlay' }, h('div', { class: 'vs-dialog', 'data-anim': 'vsd-' + d.kind, role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title, on: { keydown: (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } trapFocus(e.currentTarget, e); } } },
    h('div', { class: 'vs-dialog-body' }, icon('info'), h('div', {}, body)),
    h('div', { class: 'vs-dialog-actions' }, actions.map(([l, fn, primary], i) => btn(l, { cls: primary ? 'vs-btn vs-btn-primary' : 'vs-btn', fk: 'vs.dlg-' + i, target: primary ? 'vs.dialog-ok' : null, on: fn })))));
}

function initRepo(app) {
  const s = st(app);
  const repo = repoOf(app);
  s.menu = null;
  if (!repo) { notify(app, { kind: 'info', text: 'Ouvre d’abord un dossier (File › Open Folder…).' }); app.render(); return; }
  log(s, ['> git init -b main']);
  app.act((w) => E.initRepo(w, repo.path, { via: IDE }));
}

function startAddRemote(app) {
  const s = st(app);
  const repo = repoOf(app);
  s.menu = null;
  if (!repo || !repo.git) { notify(app, { kind: 'info', text: 'Il faut d’abord un dépôt Git : Initialize Repository.' }); app.render(); return; }
  s.quick = { kind: 'remote-url', value: '', err: null };
  app.ui.focusAfter = 'vs.quickinput';
  app.render();
}
