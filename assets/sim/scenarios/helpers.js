// Briques communes aux scénarios : constructions de situations de départ
// et prédicats de validation. Les fichiers de missions n'utilisent que ces
// fonctions et les opérations du moteur : ils ne contiennent aucune logique
// d'interface.

import * as E from '../engine/engine.js';
import { addDays } from '../engine/util.js';

export const PROJETS = '/home/stagiaire/projets';

// ---------------------------------------------------------------------
// Constructions (setup) : chaque fonction fait avancer un monde vierge
// en passant par les mêmes opérations que l'apprenant.
// ---------------------------------------------------------------------

export function makeProject(w, m, extra = {}) {
  return E.createProject(w, { name: m.project, ns: m.ns || 'stagiaire', visibility: 'private', readme: true, ...extra }).project;
}

/** Jeton créé, copié puis enregistré dans le gestionnaire de mots de passe. */
export function makeSavedToken(w, { name = 'poste-formation', scopes = ['write_repository'], days = 30, label } = {}) {
  const t = E.createToken(w, { name, scopes, expiresAt: addDays(w.today, days) }).token;
  E.copy(w, { kind: 'token', text: t.value, source: 'gitlab', tokenId: t.id });
  E.vaultSave(w, { label: label || `GitLab — ${name}`, value: t.value });
  E.hideTokenValue(w);
  w.clipboard = null;
  return t;
}

export function makeClone(w, m, t, ide = 'vscode') {
  const url = E.httpsUrl(m.ns || 'stagiaire', m.project);
  const r = E.cloneRepo(w, { url, parentDir: PROJETS, auth: { username: w.account.username, secret: t.value }, rstudioProject: ide === 'rstudio', via: ide });
  if (!r.ok) throw new Error('setup clone: ' + (r.out || []).join(' '));
  E.openFolder(w, ide, r.repo.path);
  if (ide === 'rstudio') E.openFolder(w, 'vscode', r.repo.path);
  else w.ws.opened.vscode = r.repo.path;
  return r.repo;
}

export function makeLocalCommit(w, repo, { file = 'README.md', append = 'Étude fictive : démographie des entreprises d’un territoire imaginaire.\n', message = 'Décrit l’objectif de l’étude dans le README' } = {}) {
  const before = repo.work[file] || '';
  E.writeFile(w, repo.path, file, before + (before && !before.endsWith('\n') ? '\n' : '') + append);
  E.stage(w, repo.path, [file]);
  return E.commit(w, repo.path, { message });
}

/** Remet les compteurs d'événements à zéro sans perdre l'état (début de mission). */
export function settle(w) {
  w.events = [];
  w.ui = { tool: w.ui.tool, gitlab: { route: 'projects' } };
}

// ---------------------------------------------------------------------
// Prédicats (lus par le coach). ctx est fourni par le coach :
// { w, m, ide, since, ev(type, pred), has(type, pred), answered(stepId) }
// ---------------------------------------------------------------------

export const project = (ctx) => E.getProject(ctx.w, ctx.m.ns || 'stagiaire', ctx.m.project);

/** Le dépôt local qui pointe vers le projet de la mission (le plus récent). */
export function repo(ctx) {
  const url = E.httpsUrl(ctx.m.ns || 'stagiaire', ctx.m.project);
  const list = Object.values(ctx.w.ws.repos).filter((r) => r.remote.url === url);
  return list.length ? list[list.length - 1] : null;
}

export const activeTokens = (ctx) => ctx.w.tokens.filter((t) => E.tokenState(ctx.w, t) === 'active');
export const writeTokens = (ctx) => activeTokens(ctx).filter((t) => t.scopes.includes('write_repository'));
export const EXTRA_SCOPES = ['api', 'read_api', 'read_user', 'create_runner', 'manage_runner', 'k8s_proxy', 'read_registry', 'write_registry', 'ai_features', 'sudo', 'admin_mode'];
export const minimalWrite = (t) => t.scopes.includes('write_repository') && !t.scopes.some((s) => EXTRA_SCOPES.includes(s));
export const savedInVault = (ctx, t) => ctx.w.vault.some((v) => v.value === t.value);

export function fileChanged(r, file) {
  if (!r) return false;
  const head = E.headTree(r);
  return r.work[file] !== head[file] || r.index[file] !== head[file];
}
/** Le fichier a été modifié puis commité localement depuis le clonage. */
export function committedFile(r, file) {
  if (!r || r.commits.length < 2) return false;
  const base = r.commits[0].tree;
  return r.commits.slice(1).some((c, i) => c.tree[file] !== (i === 0 ? base : r.commits[i].tree)[file]);
}
export const localCommitsAfterClone = (r) => (r ? r.commits.length - 1 : 0);
export const remoteHasLocalHead = (ctx) => {
  const r = repo(ctx), p = project(ctx);
  return !!(r && p && r.commits.length && p.commits.length && p.commits[p.commits.length - 1].id === r.commits[r.commits.length - 1].id && r.commits.length > 1);
};
