// =====================================================================
// Interpréteur du terminal simulé.
// Il ne lance AUCUNE commande réelle : il traduit un sous-ensemble
// documenté de commandes en opérations du moteur (engine.js).
// =====================================================================

import * as E from './engine.js';
import { shellSplit, joinPath, basename, dirname, tildify, short, redact, classifySecret } from './util.js';

export const SUPPORTED = [
  ['pwd', 'affiche le dossier courant'],
  ['ls [-a] [dossier]', 'liste le contenu d’un dossier'],
  ['cd <dossier>', 'change de dossier (cd .., cd ~)'],
  ['cat <fichier>', 'affiche un fichier'],
  ['echo "texte" >> <fichier>', 'ajoute une ligne à un fichier'],
  ['clear', 'efface l’écran'],
  ['git clone <url> [dossier]', 'copie un dépôt distant'],
  ['git status [-s]', 'état des fichiers'],
  ['git diff [--staged] [fichier]', 'différences ligne à ligne'],
  ['git add <fichier>|.|-A', 'prépare des changements'],
  ['git restore [--staged] <fichier>', 'retire de la préparation ou abandonne'],
  ['git commit -m "message" [--amend] [-a]', 'enregistre un commit local'],
  ['git push [origin main]', 'envoie les commits vers GitLab'],
  ['git pull / git fetch', 'récupère depuis GitLab'],
  ['git remote -v', 'affiche l’adresse du dépôt distant'],
  ['git log [--oneline] [-n N]', 'historique local'],
  ['git branch', 'branche courante'],
  ['git config [--global] user.name "Nom"', 'identité inscrite dans les commits'],
  ['git config --list', 'configuration'],
];

const line = (text, cls = '') => ({ text, cls });
const outLines = (arr, cls = '') => arr.map((t) => line(t, cls));

export function promptString(w) {
  return `${w.account.username}@${w.ws.host}:${tildify(w.ws.cwd, w.ws.home)}$`;
}

const notRepo = () => ({ out: [line('fatal: not a git repository (or any of the parent directories): .git', 'err')], code: 'not-repo' });
const limit = (msg) => line('ⓘ ' + msg, 'sim');

/**
 * Exécute une ligne. Renvoie { out, pending?, clear?, code? }.
 * pending = { kind: 'username'|'password', label, next(value) } pour les questions de Git.
 */
export function run(w, raw, ctx = {}) {
  const input = String(raw || '').trim();
  if (!input) return { out: [] };
  if (/(^|[^>])>(?!>)|>>/.test(input) && /^echo\b/.test(input)) return echo(w, input);
  if (/[|;&]/.test(input.replace(/"[^"]*"|'[^']*'/g, ''))) {
    return { out: [limit('Le simulateur exécute une commande à la fois, sans |, ; ni &&. Tape-les l’une après l’autre.')], code: 'unsupported' };
  }
  const sp = shellSplit(input);
  if (sp.error) return { out: [line('> ', ''), limit('Guillemet non refermé : vérifie que chaque " a son partenaire.')], code: 'quote' };
  const [cmd, ...args] = sp.args;
  switch (cmd) {
    case 'help': case 'aide': return help();
    case 'pwd': return { out: [line(w.ws.cwd)] };
    case 'ls': return ls(w, args);
    case 'cd': return cd(w, args);
    case 'cat': return cat(w, args);
    case 'clear': case 'cls': return { out: [], clear: true };
    case 'mkdir': return mkdir(w, args);
    case 'touch': return touch(w, args);
    case 'whoami': return { out: [line(w.account.username)] };
    case 'git': return git(w, args, ctx);
    case 'code': return { out: [limit('Dans ce simulateur, ouvre un dossier avec File › Open Folder… (ou le bouton Open Folder de l’explorateur).')], code: 'unsupported' };
    case 'nano': case 'vim': case 'vi': case 'emacs':
      return { out: [limit(`${cmd} n’est pas simulé. Ouvre le fichier dans l’éditeur, modifie-le, puis enregistre (Ctrl+S).`)], code: 'unsupported' };
    case 'R': case 'Rscript': case 'python': case 'python3': case 'quarto':
      return { out: [limit(`${cmd} n’est pas exécuté par le bac à sable : il simule uniquement Git et ton espace de travail.`)], code: 'unsupported' };
    default:
      return { out: [line(`bash: ${redact(cmd)}: command not found`, 'err'), limit('Commande hors du périmètre du simulateur. Tape help pour la liste des commandes reconnues.')], code: 'unknown' };
  }
}

function help() {
  const out = [line('Commandes reconnues par ce terminal simulé (rien n’est exécuté sur ta machine) :', 'sim')];
  for (const [c, d] of SUPPORTED) out.push(line(`  ${c.padEnd(40)} ${d}`, 'sim'));
  return { out };
}

function children(w, dir, all) {
  const dirs = w.ws.dirs.filter((d) => d !== dir && dirname(d) === dir).map((d) => basename(d) + '/');
  const repo = E.repoAt(w, dir);
  const files = repo ? Object.keys(repo.work).filter((f) => all || !f.startsWith('.')) : [];
  const res = [...dirs, ...files].sort((a, b) => a.localeCompare(b));
  if (all) res.unshift('./', '../', ...(repo ? ['.git/'] : []));
  return res;
}

function ls(w, args) {
  const all = args.some((a) => /^-[a-zA-Z]*a/.test(a));
  const target = args.find((a) => !a.startsWith('-'));
  const dir = target ? resolve(w, target) : w.ws.cwd;
  if (!w.ws.dirs.includes(dir)) {
    const repo = E.repoFor(w, dirname(dir));
    if (repo && repo.work[basename(dir)] !== undefined) return { out: [line(target)] };
    return { out: [line(`ls: cannot access '${target}': No such file or directory`, 'err')] };
  }
  const items = children(w, dir, all);
  return { out: items.length ? [line(items.join('  '), 'ls')] : [] };
}

function resolve(w, p) {
  if (p === '~' || p.startsWith('~/')) return joinPath(w.ws.home, p.slice(2));
  return joinPath(w.ws.cwd, p);
}

function cd(w, args) {
  const target = args[0] || '~';
  const dir = resolve(w, target);
  if (!w.ws.dirs.includes(dir)) {
    const repo = E.repoFor(w, dirname(dir));
    if (repo && repo.work[basename(dir)] !== undefined) return { out: [line(`bash: cd: ${target}: Not a directory`, 'err')] };
    return { out: [line(`bash: cd: ${target}: No such file or directory`, 'err')], code: 'no-dir' };
  }
  w.ws.cwd = dir;
  E.emit(w, 'cd', { path: dir });
  return { out: [] };
}

function fileRef(w, name) {
  const full = resolve(w, name);
  const repo = E.repoFor(w, dirname(full));
  if (!repo || dirname(full) !== repo.path) return null;
  return { repo, file: basename(full) };
}

function cat(w, args) {
  if (!args[0]) return { out: [limit('Indique un fichier : cat README.md')] };
  const ref = fileRef(w, args[0]);
  if (!ref || ref.repo.work[ref.file] === undefined) {
    if (w.ws.dirs.includes(resolve(w, args[0]))) return { out: [line(`cat: ${args[0]}: Is a directory`, 'err')] };
    return { out: [line(`cat: ${args[0]}: No such file or directory`, 'err')] };
  }
  E.emit(w, 'cat', { file: ref.file });
  return { out: ref.repo.work[ref.file].replace(/\n$/, '').split('\n').map((t) => line(t)) };
}

function mkdir(w, args) {
  const name = args.find((a) => !a.startsWith('-'));
  if (!name) return { out: [line('mkdir: missing operand', 'err')] };
  const dir = resolve(w, name);
  if (E.repoFor(w, dir)) return { out: [limit('Le simulateur ne gère pas de sous-dossiers dans un dépôt. Crée tes fichiers à la racine du projet.')] };
  if (w.ws.dirs.includes(dir)) return { out: [line(`mkdir: cannot create directory '${name}': File exists`, 'err')] };
  if (!w.ws.dirs.includes(dirname(dir))) return { out: [line(`mkdir: cannot create directory '${name}': No such file or directory`, 'err')] };
  w.ws.dirs.push(dir);
  return { out: [] };
}

function touch(w, args) {
  if (!args[0]) return { out: [line('touch: missing file operand', 'err')] };
  const ref = fileRef(w, args[0]);
  if (!ref) return { out: [limit('Dans ce simulateur, les fichiers se créent à la racine d’un dépôt cloné.')] };
  if (ref.repo.work[ref.file] === undefined) E.writeFile(w, ref.repo.path, ref.file, '');
  return { out: [] };
}

function echo(w, input) {
  const m = input.match(/^echo\s+(.*?)\s*(>>?)\s*(\S+)\s*$/);
  if (!m) return { out: [limit('Forme reconnue : echo "texte" >> fichier')] };
  const sp = shellSplit(m[1]);
  const text = (sp.args || []).join(' ');
  const ref = fileRef(w, m[3]);
  if (!ref) return { out: [limit('Dans ce simulateur, les fichiers se modifient à la racine d’un dépôt cloné.')] };
  const before = ref.repo.work[ref.file] || '';
  const content = m[2] === '>>' ? before + (before && !before.endsWith('\n') ? '\n' : '') + text + '\n' : text + '\n';
  E.writeFile(w, ref.repo.path, ref.file, content);
  return { out: [] };
}

// ---------------------------------------------------------------------
// git
// ---------------------------------------------------------------------

/** Suite d'une opération réseau : affiche les questions de Git puis relance l'opération. */
function withAuth(w, first, again, prefix = []) {
  if (!first.needAuth) return finish(first, prefix);
  const out = outLines(prefix.length ? prefix : first.out || []);
  return {
    out,
    pending: {
      kind: 'username',
      label: first.prompts.username,
      next: (username) => ({
        out: [],
        pending: {
          kind: 'password',
          label: E.authPrompts(username).password,
          next: (secret) => {
            const kind = classifySecret(secret);
            if (kind !== 'demo') {
              return { out: [limit(kind === 'real'
                ? 'Ce bac à sable n’accepte que des jetons d’entraînement (DEMO-TOKEN-…). Ta saisie a été effacée. Ne saisis jamais un vrai jeton ici.'
                : 'Ce champ attend un jeton d’entraînement (DEMO-TOKEN-…). Ta saisie a été effacée sans être conservée.')], code: 'not-demo' };
            }
            return finish(again({ username, secret }), []);
          },
        },
      }),
    },
  };
}

function finish(res, prefix) {
  const bad = (t) => !res.ok && /^(fatal|error|remote:|Author identity|\*\*\*| ! |git@)/.test(t);
  const out = [...outLines(prefix), ...(res.out || []).map((t) => line(t, bad(t) ? 'err' : ''))];
  if (res.code === 'secret-in-url') out.push(limit('Le simulateur refuse une adresse qui contient un jeton : il serait enregistré en clair dans .git/config. Utilise l’URL HTTPS sans identifiants ; Git te demandera le jeton.'));
  return { out, code: res.code, ok: res.ok, summary: res.summary };
}

function git(w, args, ctx) {
  const [sub, ...rest] = args;
  if (!sub || sub === '--help' || sub === 'help') return { out: [line('usage: git <command> [<args>]'), limit('Tape help pour les commandes Git reconnues par le simulateur.')] };
  if (sub === '--version' || sub === 'version') return { out: [line('git version 2.51.0 (simulation)')] };
  if (sub === 'config') return config(w, rest);
  if (sub === 'clone') return gitClone(w, rest, ctx);
  if (sub === 'init') return { out: [limit('git init crée un dépôt sans lien avec GitLab. Ce parcours part d’un projet GitLab que l’on clone : utilise git clone <url>.')], code: 'unsupported' };
  if (sub === 'credential' || sub === 'credential-cache' || sub === 'credential-store') {
    return { out: [limit('Pour effacer un jeton mémorisé, ouvre « Identifiants » dans la barre d’outils du bac à sable. Dans tes vrais outils, la méthode dépend du gestionnaire (voir la fiche « Je le fais dans mes outils »).')], code: 'unsupported' };
  }
  const repo = E.repoFor(w, w.ws.cwd);
  const known = ['status', 'diff', 'add', 'restore', 'reset', 'commit', 'push', 'pull', 'fetch', 'remote', 'log', 'branch', 'switch', 'checkout', 'merge', 'rebase', 'stash', 'show', 'rm', 'mv', 'tag'];
  if (!known.includes(sub)) {
    return { out: [line(`git: '${redact(sub)}' is not a git command. See 'git --help'.`, 'err'), limit('Tape help pour la liste des commandes reconnues.')], code: 'unknown' };
  }
  if (!repo) return notRepo();
  const via = ctx.via || 'terminal';
  switch (sub) {
    case 'status': return gitStatus(w, repo, rest);
    case 'diff': {
      const staged = rest.includes('--staged') || rest.includes('--cached');
      const file = rest.find((a) => !a.startsWith('-'));
      E.emit(w, 'diff-view', { staged, via, path: repo.path });
      return { out: E.diffText(repo, { staged, file }).map(diffLine) };
    }
    case 'add': {
      if (!rest.length) return { out: [line('Nothing specified, nothing added.'), line("hint: Maybe you wanted to say 'git add .'?")] };
      if (rest.some((a) => a === '.' || a === '-A' || a === '--all')) return finish(E.stageAll(w, repo.path, via), []);
      const res = E.stage(w, repo.path, rest.filter((a) => !a.startsWith('-')), via);
      return finish(res, []);
    }
    case 'restore': {
      const files = rest.filter((a) => !a.startsWith('-'));
      if (!files.length) return { out: [line('fatal: you must specify path(s) to restore', 'err')] };
      if (rest.includes('--staged') || rest.includes('-S')) return finish(E.unstage(w, repo.path, files, via), []);
      return finish(E.discard(w, repo.path, files, via), []);
    }
    case 'reset': {
      const files = rest.filter((a) => !a.startsWith('-') && a !== 'HEAD');
      if (files.length && !rest.some((a) => a === '--hard' || a === '--soft')) return finish(E.unstage(w, repo.path, files, via), []);
      return { out: [limit('git reset avec ces options n’est pas simulé. Pour retirer un fichier de la préparation : git restore --staged <fichier>.')], code: 'unsupported' };
    }
    case 'commit': return gitCommit(w, repo, rest, via);
    case 'push': {
      const pos = rest.filter((a) => !a.startsWith('-'));
      if (pos[0] && pos[0] !== 'origin') return { out: [line(`fatal: '${pos[0]}' does not appear to be a git repository`, 'err'), line('fatal: Could not read from remote repository.', 'err')] };
      if (pos[1] && pos[1] !== repo.branch && pos[1] !== 'HEAD') return { out: [line(`error: src refspec ${pos[1]} does not match any`, 'err'), line(`error: failed to push some refs to '${repo.remote.url}'`, 'err')] };
      if (rest.some((a) => a === '-f' || a === '--force')) return { out: [limit('Le push forcé réécrit l’historique partagé : il est hors du périmètre de ce parcours.')], code: 'unsupported' };
      return withAuth(w, E.push(w, repo.path, { via }), (auth) => E.push(w, repo.path, { via, auth }));
    }
    case 'pull': case 'fetch': {
      const fetchOnly = sub === 'fetch';
      return withAuth(w, E.pull(w, repo.path, { via, fetchOnly }), (auth) => E.pull(w, repo.path, { via, fetchOnly, auth }));
    }
    case 'remote': {
      E.emit(w, 'remote-view', { via });
      if (rest[0] === 'get-url') return { out: [line(repo.remote.url)] };
      if (rest.includes('-v') || rest.includes('--verbose')) return { out: [line(`origin\t${repo.remote.url} (fetch)`), line(`origin\t${repo.remote.url} (push)`)] };
      if (!rest.length) return { out: [line('origin')] };
      return { out: [limit('Modifier un remote est hors du périmètre de ce parcours. Commandes reconnues : git remote, git remote -v.')], code: 'unsupported' };
    }
    case 'log': return gitLog(w, repo, rest);
    case 'branch': {
      if (rest.filter((a) => !a.startsWith('-')).length) return { out: [limit('Créer des branches fera l’objet de la suite du parcours (branches et merge requests).')], code: 'unsupported' };
      const out = [line(`* ${repo.branch}`, 'ok')];
      if (rest.includes('-a') || rest.includes('-r')) out.push(line(`  remotes/origin/${repo.branch}`, rest.includes('-r') ? '' : 'err'));
      return { out };
    }
    default:
      return { out: [limit(`git ${sub} n’est pas simulé dans cette première version. Il sera ajouté avec la suite du parcours (branches, merge requests, conflits).`)], code: 'unsupported' };
  }
}

function diffLine(t) {
  let cls = '';
  if (t.startsWith('+') && !t.startsWith('+++')) cls = 'add';
  else if (t.startsWith('-') && !t.startsWith('---')) cls = 'del';
  else if (t.startsWith('@@')) cls = 'hunk';
  else if (/^(diff|index|---|\+\+\+|new file|deleted file)/.test(t)) cls = 'meta';
  return line(t, cls);
}

function gitStatus(w, repo, rest) {
  const st = E.status(repo);
  E.emit(w, 'status-view', { path: repo.path });
  if (rest.includes('-s') || rest.includes('--short')) {
    const map = {};
    for (const s of st.staged) map[s.path] = [s.kind === 'new' ? 'A' : s.kind === 'deleted' ? 'D' : 'M', ' '];
    for (const s of st.unstaged) (map[s.path] ||= [' ', ' '])[1] = s.kind === 'deleted' ? 'D' : 'M';
    const out = Object.keys(map).sort().map((p) => line(`${map[p][0]}${map[p][1]} ${p}`, map[p][0] !== ' ' ? 'ok' : 'err'));
    for (const u of st.untracked) out.push(line(`?? ${u.path}`, 'err'));
    return { out };
  }
  const out = [line(`On branch ${repo.branch}`)];
  const n = E.ahead(repo);
  if (repo.originHead !== null || repo.commits.length) {
    if (n) out.push(line(`Your branch is ahead of 'origin/${repo.branch}' by ${n} commit${n > 1 ? 's' : ''}.`), line('  (use "git push" to publish your local commits)'));
    else out.push(line(`Your branch is up to date with 'origin/${repo.branch}'.`));
  } else out.push(line(''), line('No commits yet'));
  const lab = { new: 'new file:   ', modified: 'modified:   ', deleted: 'deleted:    ' };
  if (st.staged.length) {
    out.push(line(''), line('Changes to be committed:'), line('  (use "git restore --staged <file>..." to unstage)'));
    for (const s of st.staged) out.push(line(`\t${lab[s.kind]}${s.path}`, 'ok'));
  }
  if (st.unstaged.length) {
    out.push(line(''), line('Changes not staged for commit:'), line('  (use "git add <file>..." to update what will be committed)'), line('  (use "git restore <file>..." to discard changes in working directory)'));
    for (const s of st.unstaged) out.push(line(`\t${lab[s.kind]}${s.path}`, 'err'));
  }
  if (st.untracked.length) {
    out.push(line(''), line('Untracked files:'), line('  (use "git add <file>..." to include in what will be committed)'));
    for (const s of st.untracked) out.push(line(`\t${s.path}`, 'err'));
  }
  out.push(line(''));
  if (st.clean) out.push(line('nothing to commit, working tree clean'));
  else if (!st.staged.length) out.push(line(st.unstaged.length ? 'no changes added to commit (use "git add" and/or "git commit -a")' : 'nothing added to commit but untracked files present (use "git add" to track)'));
  return { out };
}

function gitCommit(w, repo, rest, via) {
  let message = null, amend = false, all = false;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '-m' || a === '--message') { message = (message ? message + '\n\n' : '') + (rest[++i] ?? ''); }
    else if (a.startsWith('--message=')) message = a.slice(10);
    else if (a === '--amend') amend = true;
    else if (a === '-a' || a === '--all') all = true;
    else if (a === '-am') { all = true; message = rest[++i] ?? ''; }
    else if (/^-m./.test(a)) message = a.slice(2);
    else if (a === '--no-edit' && amend) message = repo.commits.length ? repo.commits[repo.commits.length - 1].message : '';
  }
  if (message === null) {
    return { out: [limit('Le simulateur n’ouvre pas d’éditeur de message. Écris le message dans la commande : git commit -m "Décris ton changement"')], code: 'no-message' };
  }
  return finish(E.commit(w, repo.path, { message, amend, all, via }), []);
}

function gitLog(w, repo, rest) {
  E.emit(w, 'log-view', { path: repo.path });
  if (!repo.commits.length) return { out: [line(`fatal: your current branch '${repo.branch}' does not have any commits yet`, 'err')] };
  let n = Infinity;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '-n') n = parseInt(rest[++i], 10);
    else if (/^-\d+$/.test(rest[i])) n = parseInt(rest[i].slice(1), 10);
    else if (/^--max-count=\d+$/.test(rest[i])) n = parseInt(rest[i].split('=')[1], 10);
  }
  const list = [...repo.commits].reverse().slice(0, n);
  const headId = repo.commits[repo.commits.length - 1].id;
  const deco = (c) => {
    const tags = [];
    if (c.id === headId) tags.push(`HEAD -> ${repo.branch}`);
    if (c.id === repo.originHead) tags.push(`origin/${repo.branch}`);
    return tags.length ? ` (${tags.join(', ')})` : '';
  };
  const out = [];
  if (rest.includes('--oneline')) {
    for (const c of list) out.push(line(`${short(c.id)}${deco(c)} ${c.message.split('\n')[0]}`, c.id === headId ? 'ok' : ''));
    return { out };
  }
  for (const c of list) {
    out.push(line(`commit ${c.id}${deco(c)}`, 'hunk'), line(`Author: ${c.author} <${c.email}>`), line(`Date:   ${c.date}`), line(''));
    for (const l of c.message.split('\n')) out.push(line('    ' + l));
    out.push(line(''));
  }
  return { out };
}

function config(w, rest) {
  const global = rest.includes('--global');
  const args = rest.filter((a) => a !== '--global' && a !== '--local');
  const repo = E.repoFor(w, w.ws.cwd);
  const scopePath = !global && repo ? repo.path : null;
  if (args[0] === '--list' || args[0] === '-l') {
    const merged = { ...w.gitconfig, ...((repo && repo.config) || {}) };
    if (repo && !global) Object.assign(merged, { 'remote.origin.url': repo.remote.url, [`branch.${repo.branch}.remote`]: 'origin' });
    const out = Object.entries(global ? w.gitconfig : merged).map(([k, v]) => line(`${k}=${v}`));
    E.emit(w, 'config-view', {});
    return { out };
  }
  if (args[0] === '--unset') {
    if (!args[1]) return { out: [line('error: wrong number of arguments', 'err')] };
    E.setConfig(w, args[1], null, scopePath);
    return { out: [] };
  }
  if (args[0] === '--get') args.shift();
  const [key, ...vals] = args;
  if (!key) return { out: [line('usage: git config [<options>]', 'err')] };
  if (!/^[a-z]+(\.[a-zA-Z0-9-]+)+$/.test(key)) return { out: [line(`error: key does not contain a section: ${key}`, 'err')] };
  if (!vals.length) {
    const v = E.getConfig(w, key, repo && !global ? repo.path : null);
    E.emit(w, 'config-view', { key });
    return v === undefined ? { out: [] } : { out: [line(v)] };
  }
  if (!global && !repo) return { out: [line('fatal: --local can only be used inside a git repository', 'err'), limit('Hors d’un dépôt, ajoute --global : git config --global user.name "Ton nom"')] };
  const value = vals.join(' ');
  if (key === 'user.email' && !/^[^\s@]+@[^\s@]+$/.test(value)) {
    E.setConfig(w, key, value, scopePath);
    return { out: [limit('Valeur enregistrée. Remarque : elle n’a pas la forme d’une adresse électronique.')] };
  }
  E.setConfig(w, key, value, scopePath);
  return { out: [] };
}

function gitClone(w, rest, ctx) {
  const pos = rest.filter((a) => !a.startsWith('-'));
  if (!pos.length) return { out: [line('fatal: You must specify a repository to clone.', 'err')] };
  const [url, dir] = pos;
  const via = ctx.via || 'terminal';
  const first = E.cloneRepo(w, { url, parentDir: w.ws.cwd, dirName: dir, via });
  return withAuth(w, first, (auth) => {
    const r = E.cloneRepo(w, { url, parentDir: w.ws.cwd, dirName: dir, auth, via });
    if (r.out && /^Cloning into/.test(r.out[0])) r.out = r.out.slice(1); // déjà affiché
    return r;
  });
}
