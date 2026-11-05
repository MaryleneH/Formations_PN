// =====================================================================
// Moteur de simulation — l'unique source de vérité du bac à sable.
//
// Un « monde » est un objet JSON sérialisable : serveur GitLab fictif,
// compte, jetons, presse-papiers, gestionnaire de mots de passe,
// gestionnaire d'identifiants Git, poste de travail et dépôts locaux.
// Les vues (GitLab, VS Code, RStudio, terminal) ne modifient le monde
// QUE par les opérations exportées ici. Aucune opération ne touche la
// machine réelle ni le réseau.
// =====================================================================

import { clone, hash40, short, addDays, daysBetween, makeTokenValue, isDemoTokenShape, joinPath, basename } from './util.js';
import { unifiedDiff, countChanges } from './diff.js';

export const HOST = 'gitlab.example.com';
export const ACCOUNT = { username: 'stagiaire', name: 'Camille Stagiaire', email: 'camille.stagiaire@example.com' };
export const START_DAY = '2026-03-09';
export const HOME = '/home/stagiaire';

export const ROLES = ['Guest', 'Planner', 'Reporter', 'Developer', 'Maintainer', 'Owner'];
const rank = (r) => ROLES.indexOf(r);

/** Scopes proposés par le formulaire « Legacy token » (descriptions abrégées de la documentation GitLab 19.x). */
export const SCOPES = [
  { id: 'api', desc: "Grants complete read and write access to the API for the token's scope. Includes the container registry, the dependency proxy, and the package registry." },
  { id: 'read_api', desc: "Grants read access to the API for the token's scope." },
  { id: 'read_user', desc: "Grants read-only access to the authenticated user's profile through the /user API endpoint." },
  { id: 'create_runner', desc: "Grants permission to create runners for the token's scope." },
  { id: 'manage_runner', desc: "Grants permission to manage runners for the token's scope." },
  { id: 'k8s_proxy', desc: 'Grants permission to perform Kubernetes API calls through the agent for Kubernetes.' },
  { id: 'self_rotate', desc: 'Grants permission to rotate this token.' },
  { id: 'read_repository', desc: "Grants read access (pull) to repositories for the token's scope. Uses Git-over-HTTP or the repository files API." },
  { id: 'write_repository', desc: "Grants read and write access (pull and push) to repositories for the token's scope. Uses Git-over-HTTP. Does not support API authentication." },
  { id: 'read_registry', desc: 'Grants read access (pull) to container registry images when authorization is required.' },
  { id: 'write_registry', desc: 'Grants write access (push) to container registry images.' },
  { id: 'ai_features', desc: 'Grants permission to perform API actions for GitLab Duo.' },
];

const README_TEMPLATE = (name) => `# ${name}

## Getting started

To make it easy for you to get started with GitLab, here's a list of recommended next steps.

## Add your files

- Create or upload files
- Add files using the command line or push an existing Git repository

## Name
Choose a self-explaining name for your project.

## Description
Let people know what your project can do specifically.
`;

// ---------------------------------------------------------------------
// Création d'un monde
// ---------------------------------------------------------------------

export function blankWorld(key = 'parcours', opts = {}) {
  return {
    v: 1,
    key,
    today: opts.today || START_DAY,
    account: { ...ACCOUNT },
    groups: { 'equipe-stats': { name: 'Équipe stats' } },
    remote: { projects: {} },
    tokens: [],
    clipboard: null,
    vault: [],
    credentials: [],
    gitconfig: opts.noIdentity ? { 'credential.helper': 'store' } : { 'user.name': ACCOUNT.name, 'user.email': ACCOUNT.email, 'credential.helper': 'store' },
    ws: {
      home: HOME,
      host: opts.host || 'poste',
      dirs: [HOME, HOME + '/projets', HOME + '/Documents'],
      cwd: HOME,
      repos: {},
      opened: { vscode: null, rstudio: null },
    },
    ui: { tool: 'gitlab', gitlab: { route: 'home' } },
    events: [],
    seq: 1,
  };
}

// ---------------------------------------------------------------------
// Événements : la trace des gestes, lue par les contrôles de mission.
// Aucun secret n'y est jamais inscrit.
// ---------------------------------------------------------------------

export function emit(w, type, data = {}) {
  const ev = { n: w.seq++, type, day: w.today, ...data };
  w.events.push(ev);
  if (w.events.length > 500) w.events.splice(0, w.events.length - 500);
  return ev;
}
export const eventsOf = (w, type, pred = () => true) => w.events.filter((e) => e.type === type && pred(e));
export const lastEvent = (w, type, pred) => eventsOf(w, type, pred).pop() || null;

// ---------------------------------------------------------------------
// URL de dépôt
// ---------------------------------------------------------------------

/**
 * Analyse une adresse de dépôt.
 * kind : 'https' | 'ssh' | 'other-host' | 'invalid'
 */
export function parseRepoUrl(raw) {
  const url = String(raw || '').trim();
  if (!url) return { kind: 'invalid', url };
  let m = url.match(/^git@([^:]+):([^/]+)\/([^/]+?)(\.git)?\/?$/) || url.match(/^ssh:\/\/git@([^/:]+)(?::\d+)?\/([^/]+)\/([^/]+?)(\.git)?\/?$/);
  if (m) return { kind: m[1] === HOST ? 'ssh' : 'other-host', url, host: m[1], ns: m[2], path: m[3] };
  m = url.match(/^(https?):\/\/(?:([^@/\s]+)@)?([^/\s]+)\/([^/\s]+)\/([^/\s]+?)(\.git)?\/?$/);
  if (m) {
    const userinfo = m[2] || '';
    const res = {
      kind: m[3] === HOST ? 'https' : 'other-host',
      url, scheme: m[1], host: m[3], ns: m[4], path: m[5],
      hasUser: !!userinfo,
      hasSecret: userinfo.includes(':'),
      clean: `https://${m[3]}/${m[4]}/${m[5]}.git`,
    };
    if (m[1] === 'http') res.kind = m[3] === HOST ? 'http' : 'other-host';
    return res;
  }
  return { kind: 'invalid', url };
}

export const httpsUrl = (ns, path) => `https://${HOST}/${ns}/${path}.git`;
export const sshUrl = (ns, path) => `git@${HOST}:${ns}/${path}.git`;
export const projectKey = (ns, path) => `${ns}/${path}`;
export const getProject = (w, ns, path) => w.remote.projects[projectKey(ns, path)] || null;

// ---------------------------------------------------------------------
// Commits et arbres
// ---------------------------------------------------------------------

function makeCommit(w, { parent, message, tree, author, email }) {
  const date = w.today;
  const body = JSON.stringify({ parent, message, tree, author, email, date, n: w.seq });
  return { id: hash40(body), parent: parent || null, message, author, email, date, tree: clone(tree) };
}
export const headCommit = (commits) => (commits.length ? commits[commits.length - 1] : null);
export const headTree = (repo) => (repo.commits.length ? repo.commits[repo.commits.length - 1].tree : {});
const blobId = (content) => (content === null || content === undefined ? '0000000' : short(hash40('blob ' + content)));

// ---------------------------------------------------------------------
// GitLab : projets
// ---------------------------------------------------------------------

export function slugify(name) {
  return String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .replace(/-{2,}/g, '-');
}

/** Vérifie le formulaire de création de projet. Renvoie { field: message } (vide si valide). */
export function validateProject(w, { name, ns, slug }) {
  const errors = {};
  if (!name || !name.trim()) errors.name = "Project name can't be blank.";
  else if (!/^[\p{L}\p{N}_][\p{L}\p{N}_. +-]*$/u.test(name.trim())) errors.name = 'Name can contain only letters, digits, emoji, underscores, dots, pluses, dashes, or spaces. It must start with a letter, digit, emoji, or underscore.';
  if (!slug || !slug.trim()) errors.slug = "Project slug can't be blank.";
  else if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(slug) || /[._-]$/.test(slug) || /\.git$|\.atom$/.test(slug)) errors.slug = 'Project slug can contain only letters, digits, underscores, dashes and dots. It must start with a letter or digit, and must not end with a special character.';
  if (!ns) errors.ns = 'Pick a group or namespace.';
  if (!errors.slug && ns && getProject(w, ns, slug)) errors.slug = 'Path has already been taken';
  if (!errors.name && ns && Object.values(w.remote.projects).some((p) => p.ns === ns && p.name.toLowerCase() === name.trim().toLowerCase())) errors.name = 'Name has already been taken';
  return errors;
}

export function createProject(w, { name, ns = w.account.username, slug, visibility = 'private', readme = true, members, protectedBranches, files, message }) {
  slug = slug === undefined ? slugify(name) : slug;
  const errors = validateProject(w, { name, ns, slug });
  if (Object.keys(errors).length) return { ok: false, errors };
  const p = {
    ns, path: slug, name: name.trim(), visibility, defaultBranch: 'main', createdAt: w.today,
    members: members || { [w.account.username]: 'Owner' },
    protected: protectedBranches || { main: { push: 'Maintainer' } },
    commits: [],
  };
  if (readme) {
    const tree = files || { 'README.md': README_TEMPLATE(p.name) };
    p.commits.push(makeCommit(w, { parent: null, message: message || 'Initial commit', tree, author: w.account.name, email: w.account.email }));
  }
  w.remote.projects[projectKey(ns, slug)] = p;
  emit(w, 'project-created', { project: projectKey(ns, slug), visibility, readme });
  return { ok: true, project: p, summary: `Le projet ${ns}/${slug} existe maintenant sur le serveur GitLab${readme ? ', avec un README et un premier commit' : ', sans aucun commit'}.` };
}

export function roleOf(w, p) {
  if (!p) return null;
  return p.members[w.account.username] || (p.visibility === 'public' ? 'Guest' : null);
}

// ---------------------------------------------------------------------
// GitLab : jetons personnels (« Legacy token », à scopes)
// ---------------------------------------------------------------------

export const tokenState = (w, t) => (t.revokedAt ? 'revoked' : (t.expiresAt && w.today >= t.expiresAt ? 'expired' : 'active'));

export function validateToken(w, { name, expiresAt, scopes }) {
  const errors = {};
  if (!name || !name.trim()) errors.name = "Token name can't be blank";
  if (!scopes || !scopes.length) errors.scopes = 'Select at least one scope.';
  if (expiresAt) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) errors.expiresAt = 'Enter a date in the YYYY-MM-DD format.';
    else if (expiresAt <= w.today) errors.expiresAt = 'Expiration date must be in the future.';
    else if (daysBetween(w.today, expiresAt) > 365) errors.expiresAt = 'Expiration date must be within 365 days.';
  }
  return errors;
}

export function createToken(w, { name, description = '', expiresAt, scopes }, rng = Math.random) {
  const errors = validateToken(w, { name, expiresAt, scopes });
  if (Object.keys(errors).length) return { ok: false, errors };
  for (const t of w.tokens) if (t.displayed) hideTokenValue(w);
  const t = {
    id: 't' + w.seq,
    name: name.trim(),
    description: description.trim(),
    scopes: [...scopes],
    createdAt: w.today,
    expiresAt: expiresAt || addDays(w.today, 365),
    revokedAt: null,
    lastUsed: null,
    value: makeTokenValue(rng),
    displayed: true,
    captured: null,
    lost: false,
  };
  w.tokens.push(t);
  emit(w, 'token-created', { token: t.id, scopes: t.scopes, expiresAt: t.expiresAt });
  return { ok: true, token: t, summary: `Le jeton « ${t.name} » existe (${t.scopes.join(', ')}). Sa valeur n'est affichée qu'une fois.` };
}

/** Fermeture de l'affichage unique de la valeur (navigation ou fermeture). */
export function hideTokenValue(w) {
  const t = w.tokens.find((x) => x.displayed);
  if (!t) return { ok: true };
  t.displayed = false;
  if (!t.captured) t.lost = true;
  emit(w, 'token-hidden', { token: t.id, lost: t.lost });
  return {
    ok: true, lost: t.lost,
    summary: t.lost
      ? `La valeur du jeton « ${t.name} » n'a pas été conservée. GitLab ne pourra plus l'afficher.`
      : `La valeur du jeton « ${t.name} » n'est plus affichée par GitLab. Tu l'as conservée.`,
  };
}

export function revokeToken(w, id) {
  const t = w.tokens.find((x) => x.id === id);
  if (!t || t.revokedAt) return { ok: false };
  t.revokedAt = w.today;
  t.displayed = false;
  emit(w, 'token-revoked', { token: id });
  return { ok: true, summary: `Le jeton « ${t.name} » est révoqué : il ne permet plus aucune authentification.` };
}

export function rotateToken(w, id, rng = Math.random) {
  const t = w.tokens.find((x) => x.id === id);
  if (!t || tokenState(w, t) !== 'active') return { ok: false };
  const span = Math.max(1, daysBetween(t.createdAt, t.expiresAt));
  revokeToken(w, id);
  const res = createToken(w, { name: t.name, description: t.description, scopes: t.scopes, expiresAt: addDays(w.today, Math.min(span, 365)) }, rng);
  if (res.ok) emit(w, 'token-rotated', { from: id, to: res.token.id });
  return res;
}

// ---------------------------------------------------------------------
// Presse-papiers interne, gestionnaire de mots de passe, horloge
// ---------------------------------------------------------------------

export function copy(w, { kind, text, source, tokenId }) {
  w.clipboard = { kind, text, source: source || '' };
  if (tokenId) {
    const t = w.tokens.find((x) => x.id === tokenId);
    if (t && t.displayed) t.captured = t.captured || 'clipboard';
  }
  emit(w, 'copy', { kind, source: source || '', token: tokenId || null, ssh: kind === 'url' && text.startsWith('git@') });
  return { ok: true };
}

export function vaultSave(w, { label, value }) {
  const v = String(value || '').trim();
  if (!isDemoTokenShape(v)) return { ok: false, code: 'not-demo' };
  const entry = { id: 'v' + w.seq, label: (label || 'Jeton GitLab').trim() || 'Jeton GitLab', value: v, day: w.today };
  w.vault.push(entry);
  const t = w.tokens.find((x) => x.value === v);
  if (t) { t.captured = 'vault'; if (!t.displayed) t.lost = false; }
  emit(w, 'vault-save', { token: t ? t.id : null });
  return { ok: true, entry, summary: `Valeur enregistrée dans le gestionnaire de mots de passe sous « ${entry.label} ».` };
}
export function vaultDelete(w, id) {
  const i = w.vault.findIndex((e) => e.id === id);
  if (i < 0) return { ok: false };
  w.vault.splice(i, 1);
  emit(w, 'vault-delete', {});
  return { ok: true };
}

export function advanceClock(w, days) {
  const before = w.today;
  w.today = addDays(w.today, days);
  emit(w, 'clock', { from: before, to: w.today });
  const expired = w.tokens.filter((t) => !t.revokedAt && t.expiresAt > before && t.expiresAt <= w.today);
  return { ok: true, summary: `La date du scénario passe au ${w.today}.` + (expired.length ? ` ${expired.length} jeton(s) ont expiré entre-temps.` : '') };
}

export function deleteCredential(w, host = HOST) {
  const before = w.credentials.length;
  w.credentials = w.credentials.filter((c) => c.host !== host);
  emit(w, 'credential-delete', { host });
  return { ok: before !== w.credentials.length, summary: `Identifiants mémorisés pour ${host} supprimés. Git les redemandera à la prochaine opération.` };
}

export function setConfig(w, key, value, repoPath) {
  const target = repoPath ? (w.ws.repos[repoPath].config ||= {}) : w.gitconfig;
  if (value === null) delete target[key]; else target[key] = value;
  emit(w, 'config', { key, scope: repoPath ? 'local' : 'global' });
  return { ok: true };
}
export function getConfig(w, key, repoPath) {
  const r = repoPath && w.ws.repos[repoPath];
  if (r && r.config && key in r.config) return r.config[key];
  return w.gitconfig[key];
}

// ---------------------------------------------------------------------
// Authentification et autorisation (Git sur HTTPS)
// ---------------------------------------------------------------------

export const MSG = {
  basicDenied: `remote: HTTP Basic: Access denied. If a password was provided for Git authentication, the password was incorrect or you're required to use a token instead of a password. If a token was provided, it was either incorrect, expired, or improperly scoped. See https://${HOST}/help/topics/git/troubleshooting_git.md#error-on-git-fetch-http-basic-access-denied`,
  authFailed: (url) => `fatal: Authentication failed for '${url.replace(/\.git$/, '.git/')}'`,
  notFound: (url) => ["remote: The project you were looking for could not be found or you don't have permission to view it.", `fatal: repository '${url.replace(/\.git$/, '.git/')}' not found`],
  noUpload: (url) => ['remote: You are not allowed to upload code.', `fatal: unable to access '${url.replace(/\.git$/, '.git/')}': The requested URL returned error: 403`],
  noPush: (url) => ['remote: You are not allowed to push code to this project.', `fatal: unable to access '${url.replace(/\.git$/, '.git/')}': The requested URL returned error: 403`],
  ssh: [`git@${HOST}: Permission denied (publickey).`, 'fatal: Could not read from remote repository.', '', 'Please make sure you have the correct access rights', 'and the repository exists.'],
  identity: (host) => ['Author identity unknown', '', '*** Please tell me who you are.', '', 'Run', '', '  git config --global user.email "you@example.com"', '  git config --global user.name "Your Name"', '', "to set your account's default identity.", 'Omit --global to set the identity only in this repository.', '', `fatal: unable to auto-detect email address (got 'stagiaire@${host}.(none)')`],
};

/**
 * Résout les identifiants pour une opération sur HOST.
 * - auth fourni { username, secret } : saisie de l'apprenant (jamais stockée telle quelle) ;
 * - sinon, identifiants mémorisés par le gestionnaire d'identifiants ;
 * - sinon, { needAuth: true } : la vue doit afficher la demande d'authentification.
 */
function resolveAuth(w, auth) {
  if (auth) {
    if (!auth.username || !String(auth.username).trim()) return { ok: false, code: 'empty-username' };
    if (!isDemoTokenShape(auth.secret)) return { ok: false, code: 'not-demo' };
    const tok = w.tokens.find((t) => t.value === String(auth.secret).trim());
    if (!tok) return { ok: false, code: 'bad-token', fromHelper: false };
    const st = tokenState(w, tok);
    if (st !== 'active') return { ok: false, code: 'token-' + st, fromHelper: false, tokenId: tok.id };
    return { ok: true, tok, username: String(auth.username).trim(), fromHelper: false };
  }
  const cred = w.credentials.find((c) => c.host === HOST);
  if (!cred) return { needAuth: true };
  const tok = w.tokens.find((t) => t.id === cred.tokenId);
  if (!tok || tokenState(w, tok) !== 'active') {
    // Git signale l'échec au gestionnaire (« reject ») : les identifiants mémorisés sont effacés.
    w.credentials = w.credentials.filter((c) => c.host !== HOST);
    emit(w, 'credential-rejected', { token: cred.tokenId });
    return { ok: false, code: tok ? 'token-' + tokenState(w, tok) : 'bad-token', fromHelper: true, tokenId: cred.tokenId };
  }
  return { ok: true, tok, username: cred.username, fromHelper: true };
}

function rememberCredential(w, res) {
  if (res.fromHelper || !getConfig(w, 'credential.helper')) return;
  w.credentials = w.credentials.filter((c) => c.host !== HOST);
  w.credentials.push({ host: HOST, username: res.username, tokenId: res.tok.id, day: w.today });
  emit(w, 'credential-stored', { token: res.tok.id });
}

const can = (tok, need) => {
  const s = tok.scopes;
  if (need === 'read') return s.includes('read_repository') || s.includes('write_repository') || s.includes('api');
  return s.includes('write_repository') || s.includes('api');
};

export const authPrompts = (username) => ({
  username: `Username for 'https://${HOST}': `,
  password: `Password for 'https://${username || 'stagiaire'}@${HOST}': `,
});

/** Échec d'authentification : sortie Git + diagnostic interne (jamais affiché tel quel). */
function authFailure(w, res, url, op, via = 'terminal') {
  emit(w, op + '-fail', { reason: 'auth', cause: res.code, fromHelper: !!res.fromHelper, token: res.tokenId || null, via });
  return { ok: false, code: 'auth', cause: res.code, fromHelper: !!res.fromHelper, out: [MSG.basicDenied, MSG.authFailed(url)] };
}

// ---------------------------------------------------------------------
// Dépôts locaux
// ---------------------------------------------------------------------

export const repoAt = (w, path) => w.ws.repos[path] || null;

/** Dépôt contenant le chemin donné (le dossier lui-même ou un sous-dossier). */
export function repoFor(w, path) {
  if (!path) return null;
  const keys = Object.keys(w.ws.repos).filter((k) => path === k || path.startsWith(k + '/'));
  keys.sort((a, b) => b.length - a.length);
  return keys.length ? w.ws.repos[keys[0]] : null;
}

export function status(repo) {
  const head = headTree(repo);
  const staged = [], unstaged = [], untracked = [];
  const paths = new Set([...Object.keys(head), ...Object.keys(repo.index), ...Object.keys(repo.work)]);
  for (const p of [...paths].sort()) {
    const h = head[p], i = repo.index[p], wk = repo.work[p];
    if (i !== h) staged.push({ path: p, kind: h === undefined ? 'new' : (i === undefined ? 'deleted' : 'modified') });
    if (i === undefined && h === undefined) { if (wk !== undefined) untracked.push({ path: p, kind: 'untracked' }); continue; }
    if (wk !== i) unstaged.push({ path: p, kind: wk === undefined ? 'deleted' : 'modified' });
  }
  return { staged, unstaged, untracked, clean: !staged.length && !unstaged.length && !untracked.length };
}

/** Nombre de commits locaux absents du dernier état connu du distant (origin/main). */
export function ahead(repo) {
  if (!repo.commits.length) return 0;
  const idx = repo.commits.findIndex((c) => c.id === repo.originHead);
  return idx < 0 ? repo.commits.length : repo.commits.length - 1 - idx;
}

function makeRepo(w, path, project, url) {
  const commits = clone(project.commits);
  const tree = commits.length ? commits[commits.length - 1].tree : {};
  return {
    path, name: basename(path),
    remote: { name: 'origin', url },
    branch: project.defaultBranch,
    commits,
    originHead: commits.length ? commits[commits.length - 1].id : null,
    index: clone(tree),
    work: clone(tree),
    config: {},
  };
}

export function cloneRepo(w, { url, parentDir, dirName, auth, via = 'terminal', rstudioProject = false }) {
  const u = parseRepoUrl(url);
  const shown = String(url || '').trim();
  if (u.kind === 'invalid') { emit(w, 'clone-fail', { reason: 'invalid-url', via }); return { ok: false, code: 'invalid-url', out: [`fatal: repository '${shown}' does not exist`] }; }
  if (u.kind === 'other-host') { emit(w, 'clone-fail', { reason: 'other-host', via }); return { ok: false, code: 'other-host', out: [`fatal: unable to access '${shown}': Could not resolve host: ${u.host}`] }; }
  if (u.kind === 'http') { emit(w, 'clone-fail', { reason: 'http', via }); return { ok: false, code: 'http', out: [`fatal: unable to access '${shown}': The requested URL returned error: 301`] }; }
  if (u.kind === 'https' && u.hasSecret) { emit(w, 'clone-fail', { reason: 'secret-in-url', via }); return { ok: false, code: 'secret-in-url', out: [] }; }
  const name = dirName || u.path;
  const dest = joinPath(parentDir || w.ws.cwd, name);
  if (w.ws.repos[dest] || w.ws.dirs.includes(dest)) {
    emit(w, 'clone-fail', { reason: 'exists', via });
    return { ok: false, code: 'exists', out: [`fatal: destination path '${name}' already exists and is not an empty directory.`] };
  }
  if (!w.ws.dirs.includes(parentDir || w.ws.cwd)) return { ok: false, code: 'no-parent', out: [`fatal: could not create work tree dir '${name}': No such file or directory`] };
  const head = [`Cloning into '${name}'...`];
  if (u.kind === 'ssh') {
    emit(w, 'clone-fail', { reason: 'ssh', via });
    return { ok: false, code: 'ssh', out: [...head, ...MSG.ssh] };
  }
  const a = resolveAuth(w, auth);
  if (a.needAuth) { emit(w, 'auth-prompt', { op: 'clone', via, url: u.clean }); return { ok: false, needAuth: true, prompts: authPrompts(), out: head }; }
  const cleanUrl = u.url.replace(/^https:\/\/[^@/]+@/, 'https://');
  if (!a.ok) {
    if (a.code === 'empty-username' || a.code === 'not-demo') return { ok: false, code: a.code, out: head };
    return { ...authFailure(w, a, cleanUrl, 'clone', via), out: [...head, MSG.basicDenied, MSG.authFailed(cleanUrl)] };
  }
  const p = getProject(w, u.ns, u.path);
  if (!p || !roleOf(w, p)) {
    rememberCredential(w, a);
    emit(w, 'clone-fail', { reason: 'not-found', via });
    return { ok: false, code: 'not-found', out: [...head, ...MSG.notFound(cleanUrl)] };
  }
  if (!can(a.tok, 'read')) {
    emit(w, 'clone-fail', { reason: 'scope', via, token: a.tok.id });
    return { ok: false, code: 'scope', out: [...head, 'remote: You are not allowed to download code.', `fatal: unable to access '${cleanUrl.replace(/\.git$/, '.git/')}': The requested URL returned error: 403`] };
  }
  rememberCredential(w, a);
  a.tok.lastUsed = w.today;
  const repo = makeRepo(w, dest, p, cleanUrl);
  if (rstudioProject) addRStudioFiles(repo);
  w.ws.repos[dest] = repo;
  w.ws.dirs.push(dest);
  const n = p.commits.length;
  const out = [...head];
  if (!n) out.push('warning: You appear to have cloned an empty repository.');
  else {
    const objs = n * 3;
    out.push(`remote: Enumerating objects: ${objs}, done.`, `remote: Counting objects: 100% (${objs}/${objs}), done.`, `remote: Compressing objects: 100% (${n * 2}/${n * 2}), done.`, `remote: Total ${objs} (delta 0), reused 0 (delta 0), pack-reused 0`, `Receiving objects: 100% (${objs}/${objs}), done.`);
  }
  emit(w, 'clone-ok', { project: projectKey(p.ns, p.path), path: dest, via, token: a.tok.id, scopes: a.tok.scopes, rstudio: rstudioProject });
  return { ok: true, repo, out, summary: `Un dépôt local est apparu dans ${dest} : ${Object.keys(repo.work).length} fichier(s), ${n} commit(s), un remote « origin ».` };
}

/** Ce que RStudio ajoute en créant un projet : un fichier .Rproj et des entrées dans .gitignore. */
export function addRStudioFiles(repo) {
  repo.work[`${repo.name}.Rproj`] = 'Version: 1.0\n\nRestoreWorkspace: Default\nSaveWorkspace: Default\nAlwaysSaveHistory: Default\n\nEnableCodeIndexing: Yes\nUseSpacesForTab: Yes\nNumSpacesForTab: 2\nEncoding: UTF-8\n';
  const gi = repo.work['.gitignore'] || '';
  const add = ['.Rproj.user', '.Rhistory', '.RData', '.Ruserdata'].filter((l) => !gi.split('\n').includes(l));
  repo.work['.gitignore'] = gi + (gi && !gi.endsWith('\n') ? '\n' : '') + add.join('\n') + '\n';
  repo.rstudio = true;
}

export function openFolder(w, ide, path) {
  if (!w.ws.dirs.includes(path)) return { ok: false };
  w.ws.opened[ide] = path;
  w.ws.cwd = path;
  emit(w, 'open-folder', { ide, path, repo: !!w.ws.repos[path] });
  return { ok: true, summary: `${ide === 'rstudio' ? 'RStudio' : 'VS Code'} a ouvert ${path}.` };
}

/** Projet RStudio sur un dossier existant (File > Open Project) : ajoute .Rproj si besoin. */
export function openRStudioProject(w, path) {
  const repo = w.ws.repos[path];
  if (repo && !repo.rstudio) addRStudioFiles(repo);
  return openFolder(w, 'rstudio', path);
}

export function writeFile(w, repoPath, file, content) {
  const repo = w.ws.repos[repoPath];
  if (!repo) return { ok: false };
  const before = repo.work[file];
  if (before === content) return { ok: true, unchanged: true };
  repo.work[file] = content;
  emit(w, 'save', { path: repoPath, file, created: before === undefined });
  return { ok: true, summary: before === undefined ? `Nouveau fichier ${file} enregistré sur le disque (il n'est pas encore suivi par Git).` : `${file} est enregistré : il diffère maintenant de la version du dernier commit.` };
}

export function deleteFile(w, repoPath, file) {
  const repo = w.ws.repos[repoPath];
  if (!repo || repo.work[file] === undefined) return { ok: false };
  delete repo.work[file];
  emit(w, 'delete-file', { path: repoPath, file });
  return { ok: true };
}

export function stage(w, repoPath, files, via = 'terminal') {
  const repo = w.ws.repos[repoPath];
  const done = [];
  for (const f of files) {
    if (repo.work[f] === undefined && repo.index[f] === undefined) return { ok: false, out: [`fatal: pathspec '${f}' did not match any files`] };
    if (repo.work[f] === undefined) delete repo.index[f]; else repo.index[f] = repo.work[f];
    done.push(f);
  }
  emit(w, 'stage', { path: repoPath, files: done, via });
  return { ok: true, out: [], summary: done.length ? `Préparé pour le prochain commit : ${done.join(', ')}.` : '' };
}

export function stageAll(w, repoPath, via) {
  const st = status(w.ws.repos[repoPath]);
  const files = [...st.unstaged, ...st.untracked].map((x) => x.path);
  return stage(w, repoPath, files, via);
}

export function unstage(w, repoPath, files, via = 'terminal') {
  const repo = w.ws.repos[repoPath];
  const head = headTree(repo);
  for (const f of files) { if (head[f] === undefined) delete repo.index[f]; else repo.index[f] = head[f]; }
  emit(w, 'unstage', { path: repoPath, files, via });
  return { ok: true, out: [], summary: `Retiré de la préparation : ${files.join(', ')}. Les modifications restent dans le fichier.` };
}

export function discard(w, repoPath, files, via = 'terminal') {
  const repo = w.ws.repos[repoPath];
  for (const f of files) {
    if (repo.index[f] === undefined) delete repo.work[f]; else repo.work[f] = repo.index[f];
  }
  emit(w, 'discard', { path: repoPath, files, via });
  return { ok: true, out: [], summary: `Modifications abandonnées : ${files.join(', ')}.` };
}

export function diffText(repo, { staged = false, file = null } = {}) {
  const head = headTree(repo);
  const [A, B] = staged ? [head, repo.index] : [repo.index, repo.work];
  const paths = [...new Set([...Object.keys(A), ...Object.keys(B)])].sort().filter((p) => !file || p === file);
  const out = [];
  for (const p of paths) {
    const a = A[p], b = B[p];
    if (a === b) continue;
    if (!staged && a === undefined && head[p] === undefined) continue; // non suivi : absent de git diff
    out.push(...unifiedDiff(p, a === undefined ? null : a, b === undefined ? null : b, { a: blobId(a), b: blobId(b) }));
  }
  return out;
}

export function commit(w, repoPath, { message, amend = false, all = false, via = 'terminal' }) {
  const repo = w.ws.repos[repoPath];
  const name = getConfig(w, 'user.name', repoPath);
  const email = getConfig(w, 'user.email', repoPath);
  if (!name || !email) {
    emit(w, 'commit-fail', { reason: 'identity', via, path: repoPath });
    return { ok: false, code: 'identity', out: MSG.identity(w.ws.host) };
  }
  const msg = String(message || '').trim();
  if (!msg) {
    emit(w, 'commit-fail', { reason: 'empty-message', via, path: repoPath });
    return { ok: false, code: 'empty-message', out: ['Aborting commit due to empty commit message.'] };
  }
  if (all) {
    for (const f of status(repo).unstaged.map((x) => x.path)) { if (repo.work[f] === undefined) delete repo.index[f]; else repo.index[f] = repo.work[f]; }
  }
  const parentCommit = amend ? repo.commits[repo.commits.length - 2] || null : headCommit(repo.commits);
  const base = parentCommit ? parentCommit.tree : {};
  const st = status(repo);
  if (!amend && !st.staged.length) {
    emit(w, 'commit-fail', { reason: 'nothing-staged', via, path: repoPath });
    const out = [`On branch ${repo.branch}`];
    if (st.unstaged.length || st.untracked.length) out.push(st.unstaged.length ? 'no changes added to commit (use "git add" and/or "git commit -a")' : 'nothing added to commit but untracked files present (use "git add" to track)');
    else out.push('nothing to commit, working tree clean');
    return { ok: false, code: 'nothing-staged', out };
  }
  if (amend && !repo.commits.length) return { ok: false, code: 'nothing-to-amend', out: ['fatal: You have nothing to amend.'] };
  const replaced = amend ? repo.commits.pop() : null;
  const c = makeCommit(w, { parent: parentCommit ? parentCommit.id : null, message: msg, tree: repo.index, author: name, email });
  repo.commits.push(c);
  const files = [...new Set([...Object.keys(base), ...Object.keys(repo.index)])].filter((p) => base[p] !== repo.index[p]).sort();
  let ins = 0, del = 0;
  const modes = [];
  for (const f of files) {
    const k = countChanges(base[f] || '', repo.index[f] || '');
    ins += k.ins; del += k.del;
    if (base[f] === undefined) modes.push(` create mode 100644 ${f}`);
    if (repo.index[f] === undefined) modes.push(` delete mode 100644 ${f}`);
  }
  const plural = (n, s) => `${n} ${s}${n > 1 ? 's' : ''}`;
  let line = ` ${files.length} file${files.length > 1 ? 's' : ''} changed`;
  if (ins) line += `, ${plural(ins, 'insertion')}(+)`;
  if (del) line += `, ${plural(del, 'deletion')}(-)`;
  const out = [`[${repo.branch}${parentCommit ? '' : ' (root-commit)'} ${short(c.id)}] ${msg.split('\n')[0]}`, line, ...modes];
  emit(w, 'commit-ok', { path: repoPath, id: c.id, message: msg, files, via, amend, replacedPushed: !!(replaced && replaced.id === repo.originHead) });
  return { ok: true, commit: c, out, summary: `Nouveau commit ${short(c.id)} dans l'historique LOCAL (${files.join(', ')}). GitLab ne le connaît pas encore.` };
}

const isAncestor = (commits, id) => !id || commits.some((c) => c.id === id);

export function push(w, repoPath, { auth, via = 'terminal' } = {}) {
  const repo = w.ws.repos[repoPath];
  const u = parseRepoUrl(repo.remote.url);
  if (u.kind === 'ssh') { emit(w, 'push-fail', { reason: 'ssh', via }); return { ok: false, code: 'ssh', out: [...MSG.ssh] }; }
  const a = resolveAuth(w, auth);
  if (a.needAuth) { emit(w, 'auth-prompt', { op: 'push', via }); return { ok: false, needAuth: true, prompts: authPrompts() }; }
  if (!a.ok) {
    if (a.code === 'empty-username' || a.code === 'not-demo') return { ok: false, code: a.code, out: [] };
    return authFailure(w, a, repo.remote.url, 'push', via);
  }
  const p = getProject(w, u.ns, u.path);
  if (!can(a.tok, 'write')) {
    rememberCredential(w, a);
    emit(w, 'push-fail', { reason: 'scope', via, token: a.tok.id });
    return { ok: false, code: 'scope', out: MSG.noUpload(repo.remote.url) };
  }
  if (!p || !roleOf(w, p)) {
    rememberCredential(w, a);
    emit(w, 'push-fail', { reason: 'not-found', via });
    return { ok: false, code: 'not-found', out: MSG.notFound(repo.remote.url) };
  }
  const role = roleOf(w, p);
  if (rank(role) < rank('Developer')) {
    rememberCredential(w, a);
    emit(w, 'push-fail', { reason: 'role', via, role });
    return { ok: false, code: 'role', out: MSG.noPush(repo.remote.url) };
  }
  rememberCredential(w, a);
  a.tok.lastUsed = w.today;
  const remoteHead = headCommit(p.commits);
  const localHead = headCommit(repo.commits);
  const to = `To ${repo.remote.url}`;
  if (!localHead || (remoteHead && remoteHead.id === localHead.id)) {
    emit(w, 'push-noop', { via, path: repoPath, dirty: !status(repo).clean });
    repo.originHead = remoteHead ? remoteHead.id : null;
    return { ok: true, code: 'up-to-date', out: ['Everything up-to-date'], summary: "Rien à envoyer : GitLab a déjà tous tes commits. Les modifications non commitées ne partent jamais avec un push." };
  }
  if (remoteHead && !isAncestor(repo.commits, remoteHead.id)) {
    emit(w, 'push-fail', { reason: 'non-fast-forward', via });
    return { ok: false, code: 'non-fast-forward', out: [to, ` ! [rejected]        ${repo.branch} -> ${repo.branch} (fetch first)`, `error: failed to push some refs to '${repo.remote.url}'`, 'hint: Updates were rejected because the remote contains work that you do not', 'hint: have locally.'] };
  }
  const n = remoteHead ? repo.commits.length - 1 - repo.commits.findIndex((c) => c.id === remoteHead.id) : repo.commits.length;
  const objs = n * 3;
  const head = [`Enumerating objects: ${objs + 2}, done.`, `Counting objects: 100% (${objs + 2}/${objs + 2}), done.`, 'Delta compression using up to 4 threads', `Compressing objects: 100% (${n * 2}/${n * 2}), done.`, `Writing objects: 100% (${objs}/${objs}), ${300 + n * 52} bytes | ${300 + n * 52}.00 KiB/s, done.`, `Total ${objs} (delta 0), reused 0 (delta 0), pack-reused 0 (from 0)`];
  const prot = p.protected[repo.branch];
  if (prot && rank(role) < rank(prot.push)) {
    emit(w, 'push-fail', { reason: 'protected', via, role });
    return { ok: false, code: 'protected', out: [...head, 'remote: GitLab: You are not allowed to push code to protected branches on this project.', to, ` ! [remote rejected] ${repo.branch} -> ${repo.branch} (pre-receive hook declined)`, `error: failed to push some refs to '${repo.remote.url}'`] };
  }
  p.commits = clone(repo.commits);
  repo.originHead = localHead.id;
  emit(w, 'push-ok', { via, path: repoPath, project: projectKey(p.ns, p.path), count: n, head: localHead.id, dirty: !status(repo).clean });
  return {
    ok: true, out: [...head, to, `   ${short(remoteHead && remoteHead.id)}..${short(localHead.id)}  ${repo.branch} -> ${repo.branch}`],
    summary: `${n} commit(s) envoyé(s) : GitLab affiche maintenant ${short(localHead.id)} sur ${repo.branch}.`,
  };
}

/** Pull / fetch : n'intègre que des avances rapides (le parcours n'a jamais de travail concurrent). */
export function pull(w, repoPath, { auth, via = 'terminal', fetchOnly = false } = {}) {
  const repo = w.ws.repos[repoPath];
  const u = parseRepoUrl(repo.remote.url);
  if (u.kind === 'ssh') return { ok: false, code: 'ssh', out: [...MSG.ssh] };
  const a = resolveAuth(w, auth);
  if (a.needAuth) { emit(w, 'auth-prompt', { op: 'pull', via }); return { ok: false, needAuth: true, prompts: authPrompts() }; }
  if (!a.ok) {
    if (a.code === 'empty-username' || a.code === 'not-demo') return { ok: false, code: a.code, out: [] };
    return authFailure(w, a, repo.remote.url, fetchOnly ? 'fetch' : 'pull', via);
  }
  rememberCredential(w, a);
  const p = getProject(w, u.ns, u.path);
  if (!p) return { ok: false, code: 'not-found', out: MSG.notFound(repo.remote.url) };
  const remoteHead = headCommit(p.commits);
  emit(w, fetchOnly ? 'fetch-ok' : 'pull-ok', { via });
  if (!remoteHead || isAncestor(repo.commits, remoteHead.id)) {
    repo.originHead = remoteHead ? remoteHead.id : repo.originHead;
    return { ok: true, out: fetchOnly ? [] : ['Already up to date.'] };
  }
  if (fetchOnly) return { ok: true, out: [`From https://${HOST}/${u.ns}/${u.path}`] };
  const st = status(repo);
  if (!st.clean || ahead(repo)) return { ok: false, code: 'diverged', out: ['hint: Le simulateur ne traite pas encore l\'intégration de travaux divergents (prévu avec les branches).'] };
  repo.commits = clone(p.commits);
  repo.originHead = remoteHead.id;
  repo.index = clone(remoteHead.tree);
  repo.work = clone(remoteHead.tree);
  return { ok: true, out: ['Fast-forward'] };
}

// ---------------------------------------------------------------------
// Lecture de synthèse (pour la visualisation et les contrôles)
// ---------------------------------------------------------------------

/** Les quatre zones du parcours : fichiers de travail, préparation, historique local, GitLab. */
export function flowOf(w, repoPath) {
  const repo = repoPath && w.ws.repos[repoPath];
  if (!repo) return null;
  const st = status(repo);
  const u = parseRepoUrl(repo.remote.url);
  const p = getProject(w, u.ns, u.path);
  return {
    working: [...st.unstaged, ...st.untracked],
    staged: st.staged,
    local: repo.commits.length,
    ahead: ahead(repo),
    remote: p ? p.commits.length : 0,
    remoteHead: p && p.commits.length ? short(p.commits[p.commits.length - 1].id) : null,
    localHead: repo.commits.length ? short(repo.commits[repo.commits.length - 1].id) : null,
  };
}

/** Le dépôt « courant » de l'IDE choisi (ou à défaut le premier dépôt). */
export function currentRepo(w, ide) {
  const opened = w.ws.opened[ide];
  return (opened && repoFor(w, opened)) || null;
}

// ---------------------------------------------------------------------
// Qualité d'un message de commit (indicatif : Git accepte tout message non vide)
// ---------------------------------------------------------------------

const VAGUE = new Set(('update updated updates maj mise jour a au aux modif modifs modification modifications modifier modifie modifié change changes changed changement changements '
  + 'test tests commit wip fix fixes correction corrections corrige divers ok save sauvegarde new nouveau nouvelle version final finale edit edits '
  + 'le la les l du de des d un une et en sur dans pour par file files fichier fichiers readme md qmd txt ajout ajoute ajouter add added adds premier first trucs truc chose choses').split(' '));

export function messageQuality(msg) {
  const m = String(msg || '').trim();
  if (!m) return { ok: false, reason: 'vide' };
  const words = m.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const content = words.filter((x) => x.length >= 3 && !VAGUE.has(x));
  if (m.length < 10 || words.length < 2) return { ok: false, reason: 'court' };
  if (!content.length) return { ok: false, reason: 'vague' };
  return { ok: true };
}
