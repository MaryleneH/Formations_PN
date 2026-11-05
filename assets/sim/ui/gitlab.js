// =====================================================================
// Vue GitLab (simulée d'après GitLab 19.5). Elle ne lit et ne modifie
// que le monde du simulateur ; aucun serveur n'est contacté.
// =====================================================================

import * as E from '../engine/engine.js';
import { short, enDate, addDays, frDate } from '../engine/util.js';
import { unifiedDiff } from '../engine/diff.js';
import { h, btn, icon, md, dismissable } from './dom.js';

const OOS = 'Hors du périmètre de la simulation';

// ---------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------

export function nav(app, route) {
  app.ui.gitlab.menu = null;
  if (app.ui.gitlab.flashKeep) app.ui.gitlab.flashKeep = false; else app.ui.gitlab.flash = null;
  app.act((w) => {
    let res = {};
    const from = w.ui.gitlab;
    const displayed = w.tokens.find((t) => t.displayed);
    if (displayed && from.page === 'tokens') res = E.hideTokenValue(w); // quitter (ou recharger) la page des jetons
    w.ui.gitlab = route;
    E.emit(w, 'view', { page: route.page, project: route.project || null, file: route.file || null });
    return res;
  });
  const main = app.root.querySelector('.gl-main');
  if (main) main.scrollTop = 0;
  app.ui.focusAfter = 'gl-h1';
  app.render();
}

function pathFor(route) {
  const p = route.project;
  switch (route.page) {
    case 'projects': case 'home': return '/dashboard/projects';
    case 'new': return '/projects/new';
    case 'new-blank': return '/projects/new#blank_project';
    case 'project': return `/${p}`;
    case 'file': return `/${p}/-/blob/main/${route.file}`;
    case 'commits': return `/${p}/-/commits/main`;
    case 'commit': return `/${p}/-/commit/${route.commit}`;
    case 'members': return `/${p}/-/project_members`;
    case 'protected': return `/${p}/-/settings/repository#js-protected-branches-settings`;
    case 'profile': return '/-/user_settings/profile';
    case 'tokens': case 'token-new': return '/-/user_settings/personal_access_tokens';
    default: return '/';
  }
}

// ---------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------

export function renderGitLab(app) {
  const w = app.w;
  const route = w.ui.gitlab && w.ui.gitlab.page ? w.ui.gitlab : { page: 'projects' };
  const ui = app.ui.gitlab;
  const url = 'https://gitlab.example.com' + pathFor(route);
  const history = (ui.history ||= []);
  return h('div', { class: 'sim-frame gl-browser', id: 'sim-frame', role: 'tabpanel', 'aria-label': 'GitLab dans le navigateur' },
    h('div', { class: 'br-bar' },
      h('span', { class: 'br-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
      btn('Page précédente', { icon: 'back', hideLabel: true, cls: 'br-btn', disabled: !history.length, on: () => { const r = history.pop(); if (r) nav(app, r); } }),
      h('div', { class: 'br-url', title: url }, icon('lock'), h('span', { class: 'br-url-text' }, url)),
      h('span', { class: 'br-sim' }, 'gitlab.example.com · fictif')),
    h('div', { class: 'gl' },
      topBar(app, route),
      h('div', { class: 'gl-body' },
        sidebar(app, route),
        h('main', { class: 'gl-main', 'data-keep-scroll': 'gl-main' },
          h('div', { class: 'gl-page' }, page(app, route)),
          h('p', { class: 'gl-version-note' }, icon('info'), 'Interface simulée d’après GitLab 19.5 (novembre 2026). Certains libellés et emplacements peuvent varier selon la version de votre instance.')))));
}

function go(app, route) {
  const cur = app.w.ui.gitlab;
  if (cur && cur.page) (app.ui.gitlab.history ||= []).push(cur);
  if (app.ui.gitlab.history.length > 30) app.ui.gitlab.history.shift();
  nav(app, route);
}

function link(app, text, route, props = {}) {
  return h('a', { href: '#', ...props, on: { click: (e) => { e.preventDefault(); go(app, route); } } }, text);
}

function oos(label, props = {}) {
  return h('button', { type: 'button', class: ['gl-oos', props.cls || ''], 'aria-disabled': 'true', title: OOS, on: { click: (e) => e.preventDefault() } }, props.icon ? icon(props.icon) : null, h('span', {}, label), h('span', { class: 'sr-only' }, ` (${OOS})`));
}

// ---- barre supérieure ----
function topBar(app, route) {
  const ui = app.ui.gitlab;
  const menu = ui.menu;
  const toggle = (name) => { ui.menu = ui.menu === name ? null : name; app.render(); };
  const createBtn = h('button', { type: 'button', class: ['gl-top-btn', menu === 'create' ? 'is-on' : ''], 'aria-label': 'Create new…', title: 'Create new…', 'aria-expanded': String(menu === 'create'), 'aria-haspopup': 'menu', target: 'gl.create-new', fk: 'gl.create-new', on: { click: () => toggle('create') } }, icon('plus'), icon('down', 'ico-sm'));
  const avatarBtn = h('button', { type: 'button', class: ['gl-avatar-btn', menu === 'avatar' ? 'is-on' : ''], 'aria-label': 'Menu de l’utilisateur Camille Stagiaire', 'aria-expanded': String(menu === 'avatar'), 'aria-haspopup': 'menu', target: 'gl.avatar', fk: 'gl.avatar', on: { click: () => toggle('avatar') } }, h('span', { class: 'gl-avatar', 'aria-hidden': 'true' }, 'CS'));
  return h('header', { class: 'gl-top' },
    h('a', { href: '#', class: 'gl-logo', 'aria-label': 'Accueil GitLab (Your work)', on: { click: (e) => { e.preventDefault(); go(app, { page: 'projects' }); } } }, icon('gitlab')),
    h('button', { type: 'button', class: 'gl-search', 'aria-disabled': 'true', title: OOS }, icon('search'), h('span', {}, 'Search or go to…'), h('span', { class: 'sr-only' }, ` (${OOS})`)),
    h('div', { class: 'gl-top-right' },
      h('div', { class: 'gl-menu-wrap' }, createBtn, menu === 'create' ? menuBox(app, 'create', [
        { head: 'In GitLab' },
        { label: 'New project/repository', target: 'gl.menu-new-project', on: () => go(app, { page: 'new' }) },
        { label: 'New group', oos: true },
        { label: 'New snippet', oos: true },
      ], createBtn) : null),
      h('button', { type: 'button', class: 'gl-top-btn', 'aria-disabled': 'true', title: `Issues — ${OOS}` }, icon('issues')),
      h('button', { type: 'button', class: 'gl-top-btn', 'aria-disabled': 'true', title: `Merge requests — ${OOS}` }, icon('mr')),
      h('button', { type: 'button', class: 'gl-top-btn', 'aria-disabled': 'true', title: `To-Do List — ${OOS}` }, icon('todo')),
      h('div', { class: 'gl-menu-wrap' }, avatarBtn, menu === 'avatar' ? menuBox(app, 'avatar', [
        { head: 'Camille Stagiaire', sub: '@stagiaire' },
        { label: 'Edit profile', target: 'gl.edit-profile', on: () => go(app, { page: 'profile' }) },
        { label: 'Preferences', oos: true },
        { label: 'Sign out', oos: true },
      ], avatarBtn) : null)));
}

function menuBox(app, name, items, opener) {
  const ui = app.ui.gitlab;
  const box = h('div', { class: 'gl-menu', 'data-anim': 'glm-' + name, role: 'menu', 'aria-label': name === 'create' ? 'Create new' : 'Utilisateur' },
    items.map((it) => {
      if (it.head) return h('div', { class: 'gl-menu-head', role: 'presentation' }, h('strong', {}, it.head), it.sub ? h('span', {}, it.sub) : null);
      if (it.oos) return h('button', { type: 'button', role: 'menuitem', class: 'gl-menu-item is-oos', 'aria-disabled': 'true', title: OOS }, it.label, h('span', { class: 'gl-oos-tag' }, 'non simulé'));
      return h('button', { type: 'button', role: 'menuitem', class: 'gl-menu-item', target: it.target, fk: it.target, on: { click: () => { ui.menu = null; it.on(); } } }, it.label);
    }));
  box.addEventListener('keydown', (e) => {
    const list = [...box.querySelectorAll('[role=menuitem]:not([aria-disabled])')];
    const i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); (list[i + 1] || list[0]).focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); (list[i - 1] || list[list.length - 1]).focus(); }
    if (e.key === 'Escape') { e.stopPropagation(); ui.menu = null; app.ui.focusAfter = opener.dataset.fk; app.render(); }
  });
  requestAnimationFrame(() => { const f = box.querySelector('[role=menuitem]:not([aria-disabled])'); if (f && document.activeElement === opener) f.focus(); });
  dismissable(box, () => { if (ui.menu === name) { ui.menu = null; app.render(); } }, opener);
  return box;
}

// ---- barre latérale ----
function sidebar(app, route) {
  const ctx = ['project', 'file', 'commits', 'commit', 'members', 'protected'].includes(route.page) ? 'project'
    : ['profile', 'tokens', 'token-new'].includes(route.page) ? 'user' : 'work';
  const item = (label, r, opts = {}) => {
    const cur = opts.match ? opts.match.includes(route.page) : r && (route.page === r.page || (opts.also || []).includes(route.page));
    return h('li', {}, h('a', { href: '#', class: ['gl-nav-item', cur ? 'is-current' : ''], 'aria-current': cur ? 'page' : null, target: opts.target, fk: opts.target || 'gln-' + label, on: { click: (e) => { e.preventDefault(); go(app, r); } } }, opts.icon ? icon(opts.icon) : null, h('span', {}, label)));
  };
  const off = (label, ic) => h('li', {}, oos(label, { icon: ic, cls: 'gl-nav-item' }));
  const group = (label, children, ic) => h('li', { class: 'gl-nav-group' }, h('span', { class: 'gl-nav-group-title' }, ic ? icon(ic) : null, label), h('ul', {}, children));
  let content;
  if (ctx === 'project') {
    const p = route.project;
    const proj = E.getProject(app.w, ...p.split('/'));
    content = [
      h('div', { class: 'gl-nav-ctx' }, h('span', { class: 'gl-proj-avatar', 'aria-hidden': 'true' }, (proj ? proj.name : 'P')[0].toUpperCase()), h('span', {}, proj ? proj.name : p)),
      h('ul', { class: 'gl-nav' },
        item(proj ? proj.name : p, { page: 'project', project: p }, { target: 'gl.project-link', icon: 'home', also: ['file'] }),
        group('Manage', [item('Members', { page: 'members', project: p }, { target: 'gl.nav-members' }), off('Activity'), off('Labels')], 'members'),
        group('Plan', [off('Issues'), off('Issue boards')], 'issues'),
        group('Code', [off('Merge requests'), item('Repository', { page: 'project', project: p }, { target: 'gl.nav-repository', match: ['file'] }), off('Branches'), item('Commits', { page: 'commits', project: p }, { target: 'gl.nav-commits', also: ['commit'] })], 'code'),
        group('Build', [off('Pipelines')], 'run'),
        group('Deploy', [off('Pages')], 'up'),
        group('Settings', [off('General'), item('Repository', { page: 'protected', project: p }, { target: 'gl.nav-protected' })], 'settings')),
    ];
  } else if (ctx === 'user') {
    content = [
      h('div', { class: 'gl-nav-ctx' }, h('span', { class: 'gl-proj-avatar is-user', 'aria-hidden': 'true' }, 'CS'), h('span', {}, 'User settings')),
      h('ul', { class: 'gl-nav' },
        item('Profile', { page: 'profile' }, { icon: 'user' }),
        off('Account', 'settings'),
        group('Access', [item('Personal access tokens', { page: 'tokens' }, { target: 'gl.nav-access-tokens', also: ['token-new'] }), off('SSH keys'), off('GPG keys')], 'key'),
        off('Preferences', 'settings'),
        off('Notifications', 'info')),
    ];
  } else {
    content = [
      h('div', { class: 'gl-nav-ctx' }, h('span', {}, 'Your work')),
      h('ul', { class: 'gl-nav' },
        item('Projects', { page: 'projects' }, { icon: 'book', target: 'gl.nav-projects', also: ['new', 'new-blank', 'home'] }),
        off('Groups', 'members'), off('Issues', 'issues'), off('Merge requests', 'mr'), off('To-Do List', 'todo'), off('Activity', 'history')),
    ];
  }
  return h('nav', { class: 'gl-side', 'aria-label': 'Navigation GitLab' }, content);
}

// ---------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------

function page(app, route) {
  switch (route.page) {
    case 'new': return pageNew(app);
    case 'new-blank': return pageNewBlank(app);
    case 'project': return pageProject(app, route);
    case 'file': return pageFile(app, route);
    case 'commits': return pageCommits(app, route);
    case 'commit': return pageCommit(app, route);
    case 'members': return pageMembers(app, route);
    case 'protected': return pageProtected(app, route);
    case 'profile': return pageProfile(app);
    case 'tokens': return pageTokens(app);
    case 'token-new': return pageTokenNew(app);
    default: return pageProjects(app);
  }
}

const h1 = (text, extra) => h('div', { class: 'gl-h1-row' }, h('h1', { class: 'gl-h1', tabindex: '-1', fk: 'gl-h1' }, text), extra || null);
const crumbs = (app, items) => h('nav', { class: 'gl-crumbs', 'aria-label': 'Fil d’Ariane' }, h('ol', {}, items.map(([t, r], i) => h('li', {}, r && i < items.length - 1 ? link(app, t, r) : h('span', { 'aria-current': i === items.length - 1 ? 'page' : null }, t)))));

function pageProjects(app) {
  const w = app.w;
  const list = Object.values(w.remote.projects).filter((p) => E.roleOf(w, p));
  return [
    h1('Projects', btn('New project', { cls: 'gl-btn gl-btn-confirm', target: 'gl.projects-new', on: () => go(app, { page: 'new' }) })),
    h('div', { class: 'gl-tabs', role: 'presentation' }, h('span', { class: 'gl-tab is-on' }, 'Member ', h('span', { class: 'gl-count' }, String(list.length))), oos('Starred'), oos('Inactive')),
    list.length ? h('ul', { class: 'gl-projects' }, list.map((p) => h('li', { class: 'gl-project-row' },
      h('span', { class: 'gl-proj-avatar', 'aria-hidden': 'true' }, p.name[0].toUpperCase()),
      h('div', {},
        h('p', { class: 'gl-project-name' }, link(app, `${p.ns === 'stagiaire' ? 'Camille Stagiaire' : 'Équipe stats'} / ${p.name}`, { page: 'project', project: E.projectKey(p.ns, p.path) }, { target: 'gl.project-link' }),
          h('span', { class: 'gl-vis', title: p.visibility }, icon(p.visibility === 'private' ? 'lock' : 'eye'), h('span', { class: 'sr-only' }, p.visibility)),
          h('span', { class: 'gl-badge' }, E.roleOf(w, p))),
        h('p', { class: 'gl-muted' }, `${p.commits.length} commit${p.commits.length > 1 ? 's' : ''} · Created ${enDate(p.createdAt)}`)))))
      : h('div', { class: 'gl-empty' }, h('h2', {}, 'Welcome to GitLab'), h('p', {}, 'You don’t have any projects yet. Create a project to store your files and collaborate on code.'), btn('Create a project', { cls: 'gl-btn gl-btn-confirm', on: () => go(app, { page: 'new' }) })),
  ];
}

function pageNew(app) {
  const card = (title, desc, onClick, target) => h('li', {}, onClick
    ? h('button', { type: 'button', class: 'gl-new-card', target, fk: target, on: { click: onClick } }, h('strong', {}, title), h('span', {}, desc))
    : h('button', { type: 'button', class: 'gl-new-card is-oos', 'aria-disabled': 'true', title: OOS }, h('strong', {}, title), h('span', {}, desc), h('span', { class: 'gl-oos-tag' }, 'non simulé')));
  return [
    crumbs(app, [['Your work', { page: 'projects' }], ['Projects', { page: 'projects' }], ['New project', null]]),
    h1('Create new project'),
    h('ul', { class: 'gl-new-cards' },
      card('Create blank project', 'Create a blank project to store your files, plan your work, and collaborate on code, among other things.', () => go(app, { page: 'new-blank' }), 'gl.blank-card'),
      card('Create from template', 'Create a project pre-populated with the necessary files to get you started quickly.'),
      card('Import project', 'Migrate your data from an external source like GitHub, Bitbucket, or another instance of GitLab.'),
      card('Run CI/CD for external repository', 'Connect your external repository to GitLab CI/CD.')),
  ];
}

function field(id, label, control, { help, error, optional } = {}) {
  return h('div', { class: ['gl-field', error ? 'has-error' : ''] },
    h('label', { for: id }, label, optional ? h('span', { class: 'gl-muted' }, ' (optional)') : null),
    control,
    error ? h('p', { class: 'gl-field-error', id: id + '-err', role: 'alert' }, icon('alert'), error) : null,
    help ? h('p', { class: 'gl-help', id: id + '-help' }, help) : null);
}

function pageNewBlank(app) {
  const w = app.w;
  const f = (app.ui.gitlab.newForm ||= { name: '', ns: 'stagiaire', slug: '', slugTouched: false, visibility: 'private', readme: true, sast: false, secret: false, errors: {} });
  const err = f.errors || {};
  const name = h('input', { id: 'gl-name', type: 'text', value: f.name, placeholder: 'My awesome project', autocomplete: 'off', target: 'gl.field-name', fk: 'gl.field-name', 'aria-invalid': err.name ? 'true' : null, 'aria-describedby': err.name ? 'gl-name-err gl-name-help' : 'gl-name-help',
    on: { input: (e) => { f.name = e.target.value; if (!f.slugTouched) { f.slug = E.slugify(f.name); const s = app.root.querySelector('#gl-slug'); if (s) s.value = f.slug; } } } });
  const ns = h('select', { id: 'gl-ns', target: 'gl.field-ns', fk: 'gl.field-ns', on: { change: (e) => { f.ns = e.target.value; } } },
    h('optgroup', { label: 'Users' }, h('option', { value: 'stagiaire', selected: f.ns === 'stagiaire' }, 'stagiaire')),
    h('optgroup', { label: 'Groups' }, h('option', { value: 'equipe-stats', disabled: true }, 'equipe-stats (rôle insuffisant pour créer un projet)')));
  const slug = h('input', { id: 'gl-slug', type: 'text', value: f.slug, placeholder: 'my-awesome-project', autocomplete: 'off', target: 'gl.field-slug', fk: 'gl.field-slug', 'aria-invalid': err.slug ? 'true' : null, 'aria-describedby': err.slug ? 'gl-slug-err' : null,
    on: { input: (e) => { f.slug = e.target.value; f.slugTouched = true; } } });
  const vis = (v, label, desc, ic) => h('label', { class: ['gl-radio', f.visibility === v ? 'is-on' : ''], target: v === 'private' ? 'gl.visibility-private' : null },
    h('input', { type: 'radio', name: 'gl-vis', value: v, checked: f.visibility === v, fk: 'gl-vis-' + v, on: { change: () => { f.visibility = v; app.render(); } } }),
    h('span', {}, h('strong', {}, icon(ic), label), h('span', { class: 'gl-help' }, desc)));
  const submit = (e) => {
    e.preventDefault();
    const res = app.act((x) => E.createProject(x, { name: f.name, ns: f.ns, slug: f.slug, visibility: f.visibility, readme: f.readme }), { render: false });
    if (!res.ok) { f.errors = res.errors; app.ui.focusAfter = res.errors.name ? 'gl.field-name' : 'gl.field-slug'; app.render(); return; }
    app.ui.gitlab.newForm = null;
    app.ui.gitlab.flash = `Project '${res.project.name}' was successfully created.`;
    app.ui.gitlab.flashKeep = true;
    go(app, { page: 'project', project: E.projectKey(res.project.ns, res.project.path) });
  };
  const errs = Object.values(err);
  return [
    crumbs(app, [['Your work', { page: 'projects' }], ['New project', { page: 'new' }], ['Create blank project', null]]),
    h1('Create blank project'),
    h('p', { class: 'gl-lead' }, 'Create a blank project to store your files, plan your work, and collaborate on code, among other things.'),
    errs.length ? h('div', { class: 'gl-alert gl-alert-danger', role: 'alert' }, h('strong', {}, 'The form contains the following errors:'), h('ul', {}, errs.map((x) => h('li', {}, x)))) : null,
    h('form', { class: 'gl-form', novalidate: true, on: { submit } },
      field('gl-name', 'Project name', name, { error: err.name, help: 'Must start with a lowercase or uppercase letter, digit, emoji, or underscore. Can also contain dots, pluses, dashes, or spaces.' }),
      h('div', { class: 'gl-url-row' },
        field('gl-ns', 'Project URL', h('div', { class: 'gl-input-group' }, h('span', { class: 'gl-prefix' }, 'https://gitlab.example.com/'), ns)),
        h('span', { class: 'gl-slash', 'aria-hidden': 'true' }, '/'),
        field('gl-slug', 'Project slug', slug, { error: err.slug })),
      h('p', { class: 'gl-help' }, 'Want to organize several dependent projects under the same namespace? ', oos('Create a group')),
      field('gl-target', 'Project deployment target', h('select', { id: 'gl-target', fk: 'gl-target' }, h('option', {}, 'Select the deployment target'), h('option', { disabled: true }, 'Kubernetes (non simulé)')), { optional: true }),
      h('fieldset', { class: 'gl-fieldset' }, h('legend', {}, 'Visibility Level'),
        vis('private', 'Private', 'Project access must be granted explicitly to each user. If this project is part of a group, access is granted to members of the group.', 'lock'),
        vis('internal', 'Internal', 'The project can be accessed by any logged in user except external users.', 'members'),
        vis('public', 'Public', 'The project can be accessed without any authentication.', 'eye')),
      h('fieldset', { class: 'gl-fieldset' }, h('legend', {}, 'Project Configuration'),
        h('label', { class: 'gl-check', target: 'gl.readme' }, h('input', { type: 'checkbox', checked: f.readme, fk: 'gl.readme', on: { change: (e) => { f.readme = e.target.checked; } } }),
          h('span', {}, h('strong', {}, 'Initialize repository with a README'), h('span', { class: 'gl-help' }, 'Allows you to immediately clone this project’s repository. Skip this if you plan to push up an existing repository.'))),
        h('label', { class: 'gl-check' }, h('input', { type: 'checkbox', checked: f.sast, fk: 'gl.sast', on: { change: (e) => { f.sast = e.target.checked; } } }), h('span', {}, h('strong', {}, 'Enable Static Application Security Testing (SAST)'), h('span', { class: 'gl-help' }, 'Analyze your source code for known security vulnerabilities. (Sans effet dans la simulation.)'))),
        h('label', { class: 'gl-check' }, h('input', { type: 'checkbox', checked: f.secret, fk: 'gl.secret', on: { change: (e) => { f.secret = e.target.checked; } } }), h('span', {}, h('strong', {}, 'Enable Secret Detection'), h('span', { class: 'gl-help' }, 'Analyze your source code for secrets and credentials. (Sans effet dans la simulation.)')))),
      h('div', { class: 'gl-form-actions' },
        h('button', { type: 'submit', class: 'gl-btn gl-btn-confirm', 'data-target': 'gl.create-project', 'data-fk': 'gl.create-project' }, 'Create project'),
        btn('Cancel', { cls: 'gl-btn', on: () => { app.ui.gitlab.newForm = null; go(app, { page: 'new' }); } }))),
  ];
}

function flash(app) {
  const msg = app.ui.gitlab.flash;
  if (!msg) return null;
  return h('div', { class: 'gl-alert gl-alert-info', role: 'status' }, h('span', {}, msg), btn('Dismiss', { icon: 'x', hideLabel: true, cls: 'gl-alert-x', on: () => { app.ui.gitlab.flash = null; app.render(); } }));
}

function projectHeader(app, p, extra) {
  return [
    crumbs(app, [[p.ns === 'stagiaire' ? 'Camille Stagiaire' : 'Équipe stats', null], [p.name, { page: 'project', project: E.projectKey(p.ns, p.path) }], ...(extra || [])]),
  ];
}

function readmeHtml(text) {
  const out = [];
  let list = null;
  for (const raw of text.split('\n')) {
    const l = raw.trimEnd();
    const m = l.match(/^(#{1,3})\s+(.*)$/);
    if (m) { list = null; out.push(h('h' + (m[1].length + 1), {}, m[2])); continue; }
    if (/^[-*]\s+/.test(l)) { if (!list) { list = h('ul'); out.push(list); } list.append(h('li', {}, l.replace(/^[-*]\s+/, ''))); continue; }
    list = null;
    if (l.trim()) out.push(h('p', {}, l));
  }
  return out;
}

function pageProject(app, route) {
  const w = app.w;
  const [ns, path] = route.project.split('/');
  const p = E.getProject(w, ns, path);
  if (!p) return [h1('404: Page not found'), h('p', {}, 'Make sure the address is correct and the page has not moved.')];
  const ui = app.ui.gitlab;
  const head = E.headCommit(p.commits);
  const files = head ? Object.keys(head.tree).sort((a, b) => (a.startsWith('.') - b.startsWith('.')) || a.localeCompare(b)) : [];
  const codeOpen = ui.menu === 'code';
  const codeBtn = h('button', { type: 'button', class: ['gl-btn gl-btn-confirm', codeOpen ? 'is-on' : ''], 'aria-expanded': String(codeOpen), 'aria-controls': 'gl-code-panel', target: 'gl.code-button', fk: 'gl.code-button', on: { click: () => { ui.menu = codeOpen ? null : 'code'; app.render(); } } }, 'Code', icon('down', 'ico-sm'));
  return [
    flash(app),
    ...projectHeader(app, p),
    h('div', { class: 'gl-proj-head' },
      h('span', { class: 'gl-proj-avatar gl-proj-avatar-lg', 'aria-hidden': 'true' }, p.name[0].toUpperCase()),
      h('div', {}, h('h1', { class: 'gl-h1', tabindex: '-1', fk: 'gl-h1' }, p.name, h('span', { class: 'gl-vis-badge' }, icon(p.visibility === 'private' ? 'lock' : 'eye'), p.visibility === 'private' ? 'Private' : p.visibility === 'internal' ? 'Internal' : 'Public')),
        h('p', { class: 'gl-muted' }, `Project ID: ${1000 + Object.keys(w.remote.projects).indexOf(route.project)}`))),
    !head ? emptyRepo(app, p) : [
      h('div', { class: 'gl-repo-bar' },
        h('span', { class: 'gl-branch' }, icon('branch'), 'main', icon('down', 'ico-sm')),
        h('span', { class: 'gl-path' }, p.path, ' /'),
        h('span', { class: 'gl-spacer' }),
        oos('Find file'),
        h('div', { class: 'gl-menu-wrap' }, codeBtn, codeOpen ? codePanel(app, p, codeBtn) : null)),
      h('div', { class: 'gl-last-commit', target: 'gl.last-commit' },
        h('span', { class: 'gl-avatar gl-avatar-sm', 'aria-hidden': 'true' }, initials(head.author)),
        h('div', {}, h('p', {}, link(app, head.message.split('\n')[0], { page: 'commit', project: route.project, commit: head.id })), h('p', { class: 'gl-muted' }, `${head.author} authored ${enDate(head.date)}`)),
        h('span', { class: 'gl-spacer' }),
        h('code', { class: 'gl-sha' }, short(head.id)),
        link(app, `${p.commits.length} Commit${p.commits.length > 1 ? 's' : ''}`, { page: 'commits', project: route.project }, { class: 'gl-btn gl-btn-small' })),
      h('table', { class: 'gl-files' },
        h('caption', { class: 'sr-only' }, 'Fichiers de la branche main'),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Name'), h('th', { scope: 'col' }, 'Last commit'), h('th', { scope: 'col' }, 'Last update'))),
        h('tbody', {}, files.map((f) => {
          const last = [...p.commits].reverse().find((c, i, arr) => { const prev = arr[i + 1]; return !prev || prev.tree[f] !== c.tree[f]; });
          return h('tr', {}, h('td', {}, icon('file'), link(app, f, { page: 'file', project: route.project, file: f }, { target: f === 'README.md' ? 'gl.readme-file' : null })),
            h('td', { class: 'gl-muted' }, last ? last.message.split('\n')[0] : ''), h('td', { class: 'gl-muted' }, last ? enDate(last.date) : ''));
        }))),
      head.tree['README.md'] !== undefined ? h('article', { class: 'gl-readme', 'aria-label': 'README.md' }, h('header', {}, icon('file'), 'README.md'), h('div', { class: 'gl-md' }, readmeHtml(head.tree['README.md']))) : null,
    ],
  ];
}

function emptyRepo(app, p) {
  return h('div', { class: 'gl-empty' }, h('h2', {}, 'The repository for this project is empty'),
    h('p', {}, 'You can get started by cloning the repository or start adding files to it with one of the following options.'),
    h('p', { class: 'gl-muted' }, 'Dans ce parcours, le projet doit être créé avec un README : recommence la mission pour le recréer.'));
}

const initials = (name) => (name || '?').split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase();

function codePanel(app, p, opener) {
  const ui = app.ui.gitlab;
  const ssh = E.sshUrl(p.ns, p.path), https = E.httpsUrl(p.ns, p.path);
  const row = (label, value, target) => h('div', { class: 'gl-clone-row' },
    h('label', { for: target }, label),
    h('div', { class: 'gl-input-group' }, h('input', { id: target, type: 'text', readOnly: true, value, fk: target + '-input', on: { focus: (e) => e.target.select() } }),
      btn(`Copy URL (${label})`, { icon: 'copy', hideLabel: true, cls: 'gl-btn gl-btn-icon', target, fk: target, on: (e) => app.copy('url', value, { source: 'gitlab', el: e.currentTarget }) })));
  const box = h('div', { class: 'gl-menu gl-code-panel', 'data-anim': 'glm-code', id: 'gl-code-panel', role: 'dialog', 'aria-label': 'Code' },
    row('Clone with SSH', ssh, 'gl.clone-ssh-copy'),
    row('Clone with HTTPS', https, 'gl.clone-https-copy'),
    h('div', { class: 'gl-menu-head' }, h('strong', {}, 'Open in your IDE')),
    h('div', { class: 'gl-code-ides' }, oos('Visual Studio Code (SSH)'), oos('Visual Studio Code (HTTPS)'), oos('IntelliJ IDEA (SSH)'), oos('IntelliJ IDEA (HTTPS)')),
    h('p', { class: 'gl-help' }, 'Ces raccourcis ouvrent une application installée : ils ne sont pas simulés. Le parcours utilise l’action de clonage de ton IDE, qui ne nécessite aucune extension.'),
    h('div', { class: 'gl-menu-head' }, h('strong', {}, 'Download source code')),
    h('div', { class: 'gl-code-ides' }, oos('zip'), oos('tar.gz')));
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); ui.menu = null; app.ui.focusAfter = 'gl.code-button'; app.render(); } });
  dismissable(box, () => { if (ui.menu === 'code') { ui.menu = null; app.render(); } }, opener);
  return box;
}

function pageFile(app, route) {
  const [ns, path] = route.project.split('/');
  const p = E.getProject(app.w, ns, path);
  const head = p && E.headCommit(p.commits);
  const content = head ? head.tree[route.file] : undefined;
  if (content === undefined) return [h1('404: Page not found')];
  const ui = app.ui.gitlab;
  const rendered = route.file.endsWith('.md') && ui.raw !== route.file;
  const lines = content.replace(/\n$/, '').split('\n');
  return [
    ...projectHeader(app, p, [[route.file, null]]),
    h1(route.file),
    h('div', { class: 'gl-file' },
      h('header', {}, icon('file'), h('strong', {}, route.file), h('span', { class: 'gl-muted' }, ` ${new Blob([content]).size} B`),
        h('span', { class: 'gl-spacer' }),
        route.file.endsWith('.md') ? btn(rendered ? 'Display source' : 'Display rendered file', { cls: 'gl-btn gl-btn-small', on: () => { ui.raw = rendered ? route.file : null; app.render(); } }) : null),
      rendered ? h('div', { class: 'gl-md' }, readmeHtml(content))
        : h('pre', { class: 'gl-code' }, lines.map((l, i) => h('span', { class: 'gl-code-line' }, h('span', { class: 'gl-ln', 'aria-hidden': 'true' }, String(i + 1)), l + '\n')))),
  ];
}

function pageCommits(app, route) {
  const [ns, path] = route.project.split('/');
  const p = E.getProject(app.w, ns, path);
  if (!p) return [h1('404: Page not found')];
  const list = [...p.commits].reverse();
  return [
    ...projectHeader(app, p, [['Commits', null]]),
    h1('Commits'),
    h('div', { class: 'gl-repo-bar' }, h('span', { class: 'gl-branch' }, icon('branch'), 'main', icon('down', 'ico-sm'))),
    h('ol', { class: 'gl-commits', target: 'gl.commit-list' }, list.map((c) => h('li', { class: 'gl-commit-row' },
      h('span', { class: 'gl-avatar gl-avatar-sm', 'aria-hidden': 'true' }, initials(c.author)),
      h('div', {}, h('p', { class: 'gl-commit-msg' }, link(app, c.message.split('\n')[0], { page: 'commit', project: route.project, commit: c.id })),
        h('p', { class: 'gl-muted' }, `${c.author} authored ${enDate(c.date)}`)),
      h('span', { class: 'gl-spacer' }),
      h('code', { class: 'gl-sha' }, short(c.id)),
      btn('Copy commit SHA', { icon: 'copy', hideLabel: true, cls: 'gl-btn gl-btn-icon', on: (e) => app.copy('text', c.id, { el: e.currentTarget }) })))),
  ];
}

function pageCommit(app, route) {
  const [ns, path] = route.project.split('/');
  const p = E.getProject(app.w, ns, path);
  const c = p && p.commits.find((x) => x.id === route.commit);
  if (!c) return [h1('404: Page not found')];
  const parent = c.parent ? p.commits.find((x) => x.id === c.parent) : null;
  const before = parent ? parent.tree : {};
  const files = [...new Set([...Object.keys(before), ...Object.keys(c.tree)])].filter((f) => before[f] !== c.tree[f]).sort();
  return [
    ...projectHeader(app, p, [['Commits', { page: 'commits', project: route.project }], [short(c.id), null]]),
    h1(c.message.split('\n')[0]),
    h('p', { class: 'gl-muted' }, `Commit ${short(c.id)} authored ${enDate(c.date)} by ${c.author}`, parent ? ` · Parent ${short(parent.id)}` : ''),
    h('p', {}, h('strong', {}, `${files.length} file${files.length > 1 ? 's' : ''}`), ' changed'),
    files.map((f) => {
      const lines = unifiedDiff(f, before[f] === undefined ? null : before[f], c.tree[f] === undefined ? null : c.tree[f]).slice(4);
      return h('section', { class: 'gl-diff' }, h('header', {}, icon('file'), f),
        h('pre', {}, lines.map((l) => h('span', { class: ['gl-diff-line', l.startsWith('+') ? 'is-add' : l.startsWith('-') ? 'is-del' : l.startsWith('@@') ? 'is-hunk' : ''] }, l + '\n'))));
    }),
  ];
}

function pageMembers(app, route) {
  const [ns, path] = route.project.split('/');
  const p = E.getProject(app.w, ns, path);
  if (!p) return [h1('404: Page not found')];
  return [
    ...projectHeader(app, p, [['Members', null]]),
    h1('Project members', oos('Invite members')),
    h('p', { class: 'gl-lead' }, 'You can invite a new member to this project or invite another group.'),
    h('table', { class: 'gl-table' },
      h('caption', { class: 'sr-only' }, 'Membres du projet'),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Account'), h('th', { scope: 'col' }, 'Source'), h('th', { scope: 'col' }, 'Role'))),
      h('tbody', {}, Object.entries(p.members).map(([u, r]) => h('tr', { class: u === 'stagiaire' ? 'is-me' : '' },
        h('td', {}, h('strong', {}, u === 'stagiaire' ? 'Camille Stagiaire' : 'Responsable stats'), h('br'), h('span', { class: 'gl-muted' }, `@${u}`), u === 'stagiaire' ? h('span', { class: 'gl-badge' }, 'It’s you') : null),
        h('td', {}, p.ns === 'stagiaire' ? 'Direct member' : 'Équipe stats'),
        h('td', {}, h('span', { class: 'gl-badge' }, r)))))),
  ];
}

function pageProtected(app, route) {
  const [ns, path] = route.project.split('/');
  const p = E.getProject(app.w, ns, path);
  if (!p) return [h1('404: Page not found')];
  return [
    ...projectHeader(app, p, [['Settings', null], ['Repository', null]]),
    h1('Repository settings'),
    h('section', { class: 'gl-settings-block' },
      h('h2', {}, 'Protected branches'),
      h('p', { class: 'gl-help' }, 'Keep stable branches secure and force developers to use merge requests.'),
      h('table', { class: 'gl-table' },
        h('caption', { class: 'sr-only' }, 'Branches protégées'),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Branch'), h('th', { scope: 'col' }, 'Allowed to merge'), h('th', { scope: 'col' }, 'Allowed to push and merge'), h('th', { scope: 'col' }, 'Allowed to force push'))),
        h('tbody', {}, Object.entries(p.protected).map(([b, rule]) => h('tr', {},
          h('td', {}, h('code', {}, b), ' ', h('span', { class: 'gl-badge' }, 'default')),
          h('td', {}, 'Maintainers'), h('td', {}, rule.push === 'Maintainer' ? 'Maintainers' : 'Developers + Maintainers'), h('td', {}, 'Off'))))),
      h('p', { class: 'gl-help' }, 'Modifier ces règles demande le rôle Maintainer : hors du périmètre de cet exercice.')),
  ];
}

function pageProfile(app) {
  return [
    crumbs(app, [['User settings', null], ['Profile', null]]),
    h1('Edit profile'),
    h('div', { class: 'gl-settings-block' },
      field('gl-prof-name', 'Full name', h('input', { id: 'gl-prof-name', type: 'text', value: 'Camille Stagiaire', readOnly: true })),
      field('gl-prof-user', 'Username', h('input', { id: 'gl-prof-user', type: 'text', value: 'stagiaire', readOnly: true })),
      field('gl-prof-mail', 'Email', h('input', { id: 'gl-prof-mail', type: 'text', value: E.ACCOUNT.email, readOnly: true }), { help: 'Utilise cette adresse pour user.email : GitLab relie alors tes commits à ton profil.' })),
    h('p', { class: 'gl-help' }, 'Les jetons se gèrent dans la section ', h('strong', {}, 'Access'), ' de la barre latérale.'),
  ];
}

// ---- jetons ----

function pageTokens(app) {
  const w = app.w;
  const ui = app.ui.gitlab;
  const shown = w.tokens.find((t) => t.displayed);
  const active = w.tokens.filter((t) => E.tokenState(w, t) === 'active');
  const inactive = w.tokens.filter((t) => E.tokenState(w, t) !== 'active');
  const genOpen = ui.menu === 'gen';
  const genBtn = h('button', { type: 'button', class: 'gl-btn gl-btn-confirm', 'aria-expanded': String(genOpen), 'aria-haspopup': 'menu', target: 'gl.generate-token', fk: 'gl.generate-token', on: { click: () => { ui.menu = genOpen ? null : 'gen'; app.render(); } } }, 'Generate token', icon('down', 'ico-sm'));
  let genMenu = null;
  if (genOpen) {
    genMenu = h('div', { class: 'gl-menu gl-gen-menu', 'data-anim': 'glm-gen', role: 'menu', 'aria-label': 'Generate token' },
      h('button', { type: 'button', role: 'menuitem', class: 'gl-menu-item', target: 'gl.legacy-token', fk: 'gl.legacy-token', on: { click: () => { ui.menu = null; ui.tokenForm = null; go(app, { page: 'token-new' }); } } },
        h('strong', {}, 'Legacy token'), h('span', { class: 'gl-help' }, 'Access is granted by scopes. Utilisé dans ce parcours.')),
      h('button', { type: 'button', role: 'menuitem', class: 'gl-menu-item is-oos', 'aria-disabled': 'true', title: OOS },
        h('strong', {}, 'Fine-grained token'), h('span', { class: 'gl-help' }, 'Permissions par ressource (GitLab 19.2 et plus). Autre formulaire : non simulé ici.')));
    genMenu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); ui.menu = null; app.ui.focusAfter = 'gl.generate-token'; app.render(); } });
    dismissable(genMenu, () => { if (ui.menu === 'gen') { ui.menu = null; app.render(); } }, genBtn);
  }
  return [
    crumbs(app, [['User settings', null], ['Personal access tokens', null]]),
    h1('Personal access tokens', h('div', { class: 'gl-menu-wrap' }, genBtn, genMenu)),
    h('p', { class: 'gl-lead' }, 'You can generate a personal access token for each application you use that needs access to the GitLab API. You can also use personal access tokens to authenticate against Git over HTTP.'),
    shown ? tokenDisplay(app, shown) : null,
    h('section', { class: 'gl-settings-block', target: 'gl.token-list' },
      h('h2', {}, `Active personal access tokens `, h('span', { class: 'gl-count' }, String(active.length))),
      active.length ? tokenTable(app, active, true) : h('p', { class: 'gl-muted' }, 'This user has no active personal access tokens.')),
    h('section', { class: 'gl-settings-block', target: 'gl.inactive-tokens' },
      h('h2', {}, 'Inactive personal access tokens ', h('span', { class: 'gl-count' }, String(inactive.length))),
      inactive.length ? tokenTable(app, inactive, false) : h('p', { class: 'gl-muted' }, 'This user has no inactive personal access tokens.')),
  ];
}

function tokenDisplay(app, t) {
  const ui = app.ui.gitlab;
  const reveal = !!ui.reveal;
  return h('div', { class: 'gl-alert gl-alert-success gl-new-token', 'data-anim': 'newtok-' + t.id, role: 'region', 'aria-label': 'Your new personal access token' },
    h('h2', {}, 'Your new personal access token'),
    h('div', { class: 'gl-input-group' },
      h('input', { type: reveal ? 'text' : 'password', readOnly: true, value: t.value, 'aria-label': 'Valeur du nouveau jeton (fictive)', fk: 'gl.token-value', on: { focus: (e) => e.target.select() } }),
      btn(reveal ? 'Hide token' : 'Click to reveal', { icon: reveal ? 'eyeOff' : 'eye', hideLabel: true, cls: 'gl-btn gl-btn-icon', fk: 'gl.token-reveal', on: () => { ui.reveal = !reveal; app.render(); } }),
      btn('Copy personal access token', { icon: 'copy', hideLabel: true, cls: 'gl-btn gl-btn-icon', target: 'gl.token-copy', fk: 'gl.token-copy', on: (e) => app.copy('token', t.value, { source: 'gitlab', tokenId: t.id, el: e.currentTarget }) })),
    h('p', {}, h('strong', {}, 'Make sure you save it - you won’t be able to access it again.')),
    h('p', { class: 'gl-help' }, t.captured ? 'Valeur copiée. Range-la dans ton gestionnaire de mots de passe avant de quitter cette page.' : 'Valeur fictive (préfixe DEMO-TOKEN-). Dès que tu quittes cette page, GitLab ne pourra plus l’afficher.'),
    btn('Dismiss', { cls: 'gl-btn gl-btn-small', target: 'gl.token-dismiss', on: () => { ui.reveal = false; app.act((w) => E.hideTokenValue(w)); } }));
}

function tokenTable(app, list, isActive) {
  const w = app.w;
  const ui = app.ui.gitlab;
  return h('div', { class: 'gl-table-wrap' }, h('table', { class: 'gl-table gl-token-table' },
    h('caption', { class: 'sr-only' }, isActive ? 'Jetons actifs' : 'Jetons inactifs'),
    h('thead', {}, h('tr', {}, ['Token name', 'Scopes', 'Created', 'Last Used', isActive ? 'Expires' : 'Status', isActive ? 'Action' : ''].map((x) => h('th', { scope: 'col' }, x)))),
    h('tbody', {}, list.map((t) => {
      const st = E.tokenState(w, t);
      const menuOpen = ui.menu === 'tok-' + t.id;
      const kb = h('button', { type: 'button', class: 'gl-btn gl-btn-icon', 'aria-label': `Actions pour le jeton ${t.name}`, 'aria-expanded': String(menuOpen), 'aria-haspopup': 'menu', target: 'gl.token-actions', fk: 'gl.tok-' + t.id, on: { click: () => { ui.menu = menuOpen ? null : 'tok-' + t.id; app.render(); } } }, icon('kebab'));
      let menu = null;
      if (menuOpen) {
        menu = h('div', { class: 'gl-menu gl-menu-right', 'data-anim': 'glm-tok-' + t.id, role: 'menu', 'aria-label': `Actions ${t.name}` },
          h('button', { type: 'button', role: 'menuitem', class: 'gl-menu-item', fk: 'gl.rotate-' + t.id, target: 'gl.token-rotate', on: { click: () => { ui.menu = null; confirmToken(app, t, 'rotate'); } } }, icon('restart'), 'Rotate'),
          h('button', { type: 'button', role: 'menuitem', class: 'gl-menu-item is-danger', fk: 'gl.revoke-' + t.id, target: 'gl.token-revoke', on: { click: () => { ui.menu = null; confirmToken(app, t, 'revoke'); } } }, icon('x'), 'Revoke'));
        menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); ui.menu = null; app.ui.focusAfter = 'gl.tok-' + t.id; app.render(); } });
        dismissable(menu, () => { if (ui.menu === 'tok-' + t.id) { ui.menu = null; app.render(); } }, kb);
      }
      const near = isActive && t.expiresAt && (Date.parse(t.expiresAt) - Date.parse(w.today)) / 86400000 <= 7;
      return h('tr', {},
        h('th', { scope: 'row' }, t.name, t.description ? h('span', { class: 'gl-muted gl-block' }, t.description) : null),
        h('td', {}, t.scopes.map((s) => h('code', { class: 'gl-scope' }, s))),
        h('td', {}, enDate(t.createdAt)),
        h('td', {}, t.lastUsed ? enDate(t.lastUsed) : 'Never'),
        h('td', {}, isActive ? h('span', { class: near ? 'gl-warn-text' : '' }, enDate(t.expiresAt)) : h('span', { class: 'gl-badge ' + (st === 'expired' ? 'is-warn' : 'is-danger') }, st === 'expired' ? `Expired ${enDate(t.expiresAt)}` : `Revoked ${enDate(t.revokedAt)}`)),
        h('td', { class: 'gl-cell-actions' }, isActive ? h('div', { class: 'gl-menu-wrap' }, kb, menu) : null));
    }))));
}

function confirmToken(app, t, kind) {
  const isRev = kind === 'revoke';
  app.modal({
    title: isRev ? `Revoke the '${t.name}' personal access token?` : `Rotate the '${t.name}' personal access token?`,
    cls: 'gl-modal',
    body: h('p', {}, isRev
      ? `Are you sure you want to revoke the personal access token '${t.name}'? This action cannot be undone. Any tools that rely on this access token will stop working.`
      : `Are you sure you want to rotate the personal access token '${t.name}'? This action cannot be undone. Any tools that rely on this access token will stop working.`),
    actions: [
      { label: 'Cancel', cls: 'gl-btn' },
      { label: isRev ? 'Revoke' : 'Rotate', cls: 'gl-btn gl-btn-danger', target: isRev ? 'gl.confirm-revoke' : 'gl.confirm-rotate', onClick: () => {
        app.ui.gitlab.reveal = false;
        if (isRev) app.act((w) => E.revokeToken(w, t.id));
        else app.act((w) => { const r = E.rotateToken(w, t.id); return r.ok ? { summary: `Rotation effectuée : l’ancien jeton est révoqué, un nouveau jeton « ${r.token.name} » est affiché une seule fois.` } : r; });
        app.ui.focusAfter = 'gl-h1';
      } },
    ],
  });
}

function pageTokenNew(app) {
  const w = app.w;
  const ui = app.ui.gitlab;
  const f = (ui.tokenForm ||= { name: '', desc: '', expiry: addDays(w.today, 30), scopes: [], errors: {} });
  const err = f.errors || {};
  const submit = (e) => {
    e.preventDefault();
    const res = app.act((x) => E.createToken(x, { name: f.name, description: f.desc, expiresAt: f.expiry, scopes: f.scopes }), { render: false });
    if (!res.ok) { f.errors = res.errors; app.ui.focusAfter = res.errors.name ? 'gl.token-name' : res.errors.expiresAt ? 'gl.token-expiry' : 'gl.scope-first'; app.render(); return; }
    ui.tokenForm = null;
    ui.reveal = false;
    nav(app, { page: 'tokens' });
    app.ui.focusAfter = 'gl.token-copy';
    app.render();
  };
  return [
    crumbs(app, [['User settings', null], ['Personal access tokens', { page: 'tokens' }], ['Legacy token', null]]),
    h1('Add a personal access token'),
    h('p', { class: 'gl-lead' }, 'Legacy token : les droits sont définis par des scopes. Formulaire de référence du parcours.'),
    h('form', { class: 'gl-form', novalidate: true, on: { submit } },
      field('gl-tname', 'Token name', h('input', { id: 'gl-tname', type: 'text', value: f.name, autocomplete: 'off', target: 'gl.token-name', fk: 'gl.token-name', 'aria-invalid': err.name ? 'true' : null, 'aria-describedby': err.name ? 'gl-tname-err gl-tname-help' : 'gl-tname-help', on: { input: (e) => { f.name = e.target.value; } } }),
        { error: err.name, help: 'For example, the application using the token or the purpose of the token. Exemple : poste-formation.' }),
      field('gl-tdesc', 'Token description', h('textarea', { id: 'gl-tdesc', rows: '2', value: f.desc, fk: 'gl.token-desc', on: { input: (e) => { f.desc = e.target.value; } } }), { optional: true }),
      field('gl-texp', 'Expiration date', h('input', { id: 'gl-texp', type: 'date', value: f.expiry, min: addDays(w.today, 1), max: addDays(w.today, 365), target: 'gl.token-expiry', fk: 'gl.token-expiry', 'aria-invalid': err.expiresAt ? 'true' : null, 'aria-describedby': err.expiresAt ? 'gl-texp-err gl-texp-help' : 'gl-texp-help', on: { input: (e) => { f.expiry = e.target.value; } } }),
        { error: err.expiresAt, help: `The token expires at midnight UTC on that date. Sans date : 365 jours. Date du scénario : ${frDate(w.today)}.` }),
      h('fieldset', { class: ['gl-fieldset', err.scopes ? 'has-error' : ''], 'aria-describedby': err.scopes ? 'gl-scopes-err' : null },
        h('legend', {}, 'Select scopes'),
        h('p', { class: 'gl-help' }, 'Scopes set the permission levels granted to the token.'),
        err.scopes ? h('p', { class: 'gl-field-error', id: 'gl-scopes-err', role: 'alert' }, icon('alert'), err.scopes) : null,
        E.SCOPES.map((s, i) => h('label', { class: 'gl-check gl-scope-row', target: 'gl.scope-' + s.id },
          h('input', { type: 'checkbox', value: s.id, checked: f.scopes.includes(s.id), fk: i === 0 ? 'gl.scope-first' : 'gl.scope-' + s.id, on: { change: (e) => { f.scopes = e.target.checked ? [...f.scopes, s.id] : f.scopes.filter((x) => x !== s.id); } } }),
          h('span', {}, h('code', {}, s.id), h('span', { class: 'gl-help' }, s.desc))))),
      h('div', { class: 'gl-form-actions' },
        h('button', { type: 'submit', class: 'gl-btn gl-btn-confirm', 'data-target': 'gl.generate', 'data-fk': 'gl.generate' }, 'Generate token'),
        btn('Cancel', { cls: 'gl-btn', on: () => { ui.tokenForm = null; go(app, { page: 'tokens' }); } }))),
  ];
}
