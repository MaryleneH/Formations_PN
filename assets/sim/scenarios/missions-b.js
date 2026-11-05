// =====================================================================
// Parcours B « J'ai déjà du travail dans mon pod Onyxia » (B1 à B5)
// et sa mission « Refaire seul ».
//
// Le dossier de travail existe déjà (rapport, script, données). Le projet
// GitLab est créé SANS README : il reste vide, et tout l'historique part
// du pod (git init, remote, .gitignore, premier commit, git push -u).
// =====================================================================

import * as E from '../engine/engine.js';
import * as H from './helpers.js';
import { m2 } from './missions.js';

const M = { ns: 'stagiaire', project: 'etude-entreprises', folder: '/home/stagiaire/projets/etude-entreprises', data: 'entreprises.csv' };
const quiz = (id, title, question, options, extra = {}) => ({ id, kind: 'quiz', title, question, options, tool: 'any', ...extra });

/** Le travail déjà présent dans le pod : un rapport Quarto, un script R, des données fictives. */
export const FILES_ETUDE = {
  'rapport.qmd': '---\ntitle: "Démographie des entreprises"\nformat: html\n---\n\n## Contexte\n\nÉtude fictive sur les créations d’entreprises d’un territoire imaginaire.\n\n```{r}\nsource("analyse.R")\n```\n',
  'analyse.R': '# Lecture des données fictives et premier comptage par secteur\ndonnees <- read.csv2("entreprises.csv")\ntable(donnees$naf)\n',
  'entreprises.csv': 'id;naf;creation\n1;6201Z;2021\n2;4711D;2022\n3;6201Z;2023\n4;8559A;2023\n',
};

/** Dossier existant, ouvert dans les deux IDE (projet RStudio si RStudio). */
function existingWork(w, m, files, ide) {
  const f = E.makeFolder(w, m.folder, files, { rstudio: ide === 'rstudio' });
  w.ws.opened.vscode = f.path;
  w.ws.opened.rstudio = f.path;
  w.ws.cwd = f.path;
  return f;
}
const WORLD = { host: 'vscode-onyxia-4b2e' };

const folder = (c) => c.w.ws.repos[c.m.folder] || null;
const isGit = (c) => { const f = folder(c); return !!(f && f.git); };
const remoteOk = (c) => { const f = folder(c); return !!(f && f.remote && f.remote.url === E.httpsUrl(c.m.ns, c.m.project)); };
const dataIgnored = (c) => { const f = folder(c); return !!(f && f.git && E.isIgnored(f, c.m.data)); };
const lastCommit = (f) => (f && f.commits.length ? f.commits[f.commits.length - 1] : null);
const firstCommitOk = (c, files) => {
  const f = folder(c); const k = lastCommit(f);
  return !!(k && files.every((x) => k.tree[x] !== undefined) && k.tree[c.m.data] === undefined && E.messageQuality(k.message).ok);
};
const pushed = (c) => { const f = folder(c); const p = H.project(c); const k = lastCommit(f); return !!(k && p && p.commits.length && p.commits[p.commits.length - 1].id === k.id); };

// ---------------------------------------------------------------------

export const m1b = {
  id: 'm1b', num: 'B1', track: 'B', world: 'existant', title: 'Créer un dépôt distant vide', short: 'Projet GitLab vide',
  params: M, worldOptions: WORLD,
  objective: 'Ton étude existe déjà dans ton pod Onyxia. Crée sur GitLab un projet **privé** `etude-entreprises`, **vide** : la case README reste décochée.',
  why: 'Ton travail a déjà un contenu : c’est lui qui doit former le premier commit. Un projet vide n’a aucun historique à réconcilier avec le tien.',
  setup(w, { ide }) { existingWork(w, M, FILES_ETUDE, ide); },
  steps: [
    {
      id: 'form', title: 'Ouvrir le formulaire d’un projet vierge', tool: 'gitlab',
      guide: 'Dans GitLab, ouvre **Create new (+)** › **New project/repository**, puis choisis **Create blank project**.',
      done: (c) => c.has('view', (e) => e.page === 'new-blank') || !!H.project(c),
      result: 'Le formulaire « Create blank project » est ouvert.',
      explain: '**GitLab** est le service qui héberge le dépôt distant. Ce formulaire crée un projet sur le serveur ; ton pod n’est pas encore concerné.',
      concepts: ['gitlab'],
      hints: [
        'Un nouveau projet se crée depuis un bouton de création, présent sur toutes les pages.',
        'En haut à droite de GitLab : le bouton **+** (Create new). La page **Projects** propose aussi **New project**.',
        { text: 'Clique sur **+**, puis **New project/repository**, puis la carte **Create blank project**.', targets: ['gl.create-new', 'gl.menu-new-project', 'gl.projects-new', 'gl.blank-card'] },
      ],
    },
    {
      id: 'create', title: 'Créer le projet, case README décochée', tool: 'gitlab',
      guide: 'Nom : `etude-entreprises`. Vérifie l’espace de noms et le chemin, choisis **Private**, **décoche** **Initialize repository with a README** (elle est cochée par défaut), puis **Create project**.',
      done: (c) => !!H.project(c),
      result: 'GitLab affiche « The repository for this project is empty ».',
      explain: 'Le projet existe, mais son dépôt ne contient aucun commit. Le premier viendra de ton pod.',
      concepts: ['gitlab', 'url'],
      hints: [
        'Quatre réglages comptent : le nom, le chemin, la visibilité et la case README, cochée par défaut.',
        'Dans le formulaire : **Project name**, **Project slug**, **Visibility Level**, puis **Project Configuration**.',
        { text: 'Saisis le nom, sélectionne **Private**, **décoche** **Initialize repository with a README**, puis **Create project**.', targets: ['gl.field-name', 'gl.visibility-private', 'gl.readme', 'gl.create-project'] },
      ],
    },
    {
      id: 'check', title: 'Vérifier : privé et vide', tool: 'gitlab',
      guide: 'Sur la page du projet, repère le badge **Private** et le message « The repository for this project is empty ». Lis les instructions en ligne de commande proposées par GitLab.',
      done: (c) => { const p = H.project(c); return !!(p && p.visibility === 'private' && H.createdEmpty(c) && c.has('view', (e) => e.page === 'project' && e.project === 'stagiaire/etude-entreprises')); },
      warn: (c) => {
        const p = H.project(c);
        if (!p) return null;
        if (p.commits.length) return 'Ce projet a été créé avec un README : GitLab a déjà un commit, sans lien avec ton travail. Ton premier push serait refusé (l’exercice 6.10 le montre). Recommence la mission pour le recréer vide.';
        if (p.visibility !== 'private') return `Ce projet est « ${p.visibility} ». La mission demande un projet privé : recommence la mission pour le recréer.`;
        return null;
      },
      result: 'Le dépôt distant existe, sans fichier ni commit.',
      explain: 'Les instructions de GitLab pour un projet vide se terminent par `git push --set-upstream origin main` : c’est exactement ce que tu feras depuis ton pod.',
      concepts: ['commit'],
      hints: ['La page d’accueil du projet résume son contenu.', 'Le badge à côté du nom, puis le message sous l’en-tête.', { text: 'Ouvre la page du projet depuis **Projects**.', targets: ['gl.project-link'] }],
    },
    quiz('why', 'Pourquoi vide ?', 'Pourquoi laisser la case README décochée dans cette situation ?', [
      { id: 'a', text: 'Mon travail existe déjà : il formera le premier commit. Un README créé par GitLab ferait un second historique, sans lien avec le mien.', correct: true, feedback: 'Exact. Git refuserait d’envoyer ton historique sur un dépôt qui en a déjà un autre.' },
      { id: 'b', text: 'Parce qu’un README ne sert à rien dans un projet de statistiques.', feedback: 'Un README est très utile ! Simplement, tu l’ajouteras toi-même, depuis ton pod, dans ton historique.' },
      { id: 'c', text: 'Parce que GitLab interdit d’ajouter des fichiers à un projet qui a un README.', feedback: 'Non : c’est Git qui refuserait de mélanger deux historiques sans lien, pas GitLab qui interdirait des fichiers.' },
    ]),
  ],
  debrief: {
    summary: 'Tu as créé un **dépôt distant vide**, prêt à recevoir l’historique qui naîtra dans ton pod.',
    questions: [
      { q: 'Dans quel cas cocherais-tu la case README ?', a: 'Quand tu pars de zéro et que tu clones le projet tout de suite (parcours A).' },
      { q: 'Où se trouve ton travail à ce stade ?', a: 'Dans ton pod Onyxia uniquement, dans un dossier qui n’est pas encore un dépôt Git.' },
    ],
  },
};

export const m2b = {
  ...m2, id: 'm2b', num: 'B2', track: 'B', world: 'existant', worldOptions: WORLD, params: M,
  ready: (w) => !!E.getProject(w, 'stagiaire', 'etude-entreprises'),
  setup(w, { ide }) { existingWork(w, M, FILES_ETUDE, ide); H.makeProject(w, M); },
};

export const m3b = {
  id: 'm3b', num: 'B3', track: 'B', world: 'existant', title: 'Relier mon dossier au dépôt GitLab', short: 'git init et remote',
  params: M, worldOptions: WORLD,
  objective: 'Faire du dossier `etude-entreprises` de ton pod un **dépôt Git local**, puis le relier au projet GitLab avec le remote `origin`.',
  why: 'On ne clone pas ici : le dossier existe déjà. On l’initialise, puis on lui indique l’adresse du dépôt distant.',
  ready: (w) => !!E.getProject(w, 'stagiaire', 'etude-entreprises') && w.tokens.some((t) => E.tokenState(w, t) === 'active' && t.scopes.includes('write_repository') && w.vault.some((v) => v.value === t.value)),
  setup(w, { ide }) { existingWork(w, M, FILES_ETUDE, ide); H.makeProject(w, M); H.makeSavedToken(w); },
  steps: [
    {
      id: 'init', title: 'Initialiser le dépôt local', tool: 'ide',
      guide: { vscode: 'Ouvre **Source Control** : VS Code indique que le dossier n’a pas de dépôt Git. Clique sur **Initialize Repository** (ou tape `git init -b main` dans le terminal).', rstudio: 'Menu **Tools** › **Version Control** › **Project Setup…**, choisis **Git** comme système de gestion de versions, puis confirme (ou tape `git init -b main` dans l’onglet **Terminal**).' },
      done: isGit,
      result: { vscode: 'Source Control liste tous tes fichiers avec la lettre **U** (non suivis) ; la barre d’état affiche `main`.', rstudio: 'L’onglet **Git** apparaît ; tes fichiers y sont marqués **?** (non suivis).' },
      explain: '`git init` crée le sous-dossier caché `.git` : un historique vide, sans commit et sans aucun lien avec GitLab. Tes fichiers ne sont pas modifiés.',
      concepts: ['init', 'depot-local'],
      hints: [
        { vscode: 'Le dossier ouvert n’est pas encore un dépôt Git : la vue du contrôle de code source le signale.', rstudio: 'Dans RStudio, la gestion de versions d’un projet se règle dans les options du projet.' },
        { vscode: 'Barre d’activité : **Source Control**, puis le bouton bleu **Initialize Repository**.', rstudio: 'Menu **Tools** › **Version Control** › **Project Setup…**' },
        { text: { vscode: 'Clique sur **Source Control**, puis **Initialize Repository**.', rstudio: 'Ouvre **Tools** › **Version Control** › **Project Setup…**, choisis **Git**, **OK**, puis **Yes**.' }, targets: { vscode: ['vs.scm', 'vs.init'], rstudio: ['rs.menu-tools', 'rs.vc-setup', 'rs.vc-git', 'rs.vc-ok'] } },
      ],
    },
    {
      id: 'remote', title: 'Ajouter le remote origin', tool: 'ide',
      guide: { vscode: 'Copie l’URL HTTPS dans GitLab (bouton **Code**). Puis, dans VS Code, **…** › **Remote** › **Add Remote…** (ou la commande **Git: Add Remote…**) : colle l’URL, puis nomme le remote `origin`.', rstudio: 'Copie l’URL HTTPS dans GitLab (bouton **Code**). Puis, dans l’onglet **Terminal** : `git remote add origin <URL>`.' },
      done: remoteOk,
      warn: (c) => {
        const f = folder(c);
        const e = c.ev('remote-fail').pop();
        if (e && e.reason === 'secret-in-url') return 'N’insère pas le jeton dans l’URL : il serait enregistré en clair dans `.git/config`. Utilise l’URL HTTPS seule ; Git te demandera le jeton au push.';
        if (f && f.remote && f.remote.url.startsWith('git@')) return 'Ce remote utilise l’URL **SSH**. Ce parcours utilise HTTPS avec un jeton : corrige avec `git remote set-url origin <URL HTTPS>`.';
        if (f && f.remote && !remoteOk(c)) return 'Le remote `origin` ne pointe pas vers `https://gitlab.example.com/stagiaire/etude-entreprises.git`. Corrige-le avec `git remote set-url origin <URL>`.';
        return null;
      },
      result: 'Le dépôt local connaît maintenant le dépôt distant, sous le nom `origin`.',
      explain: 'Un **remote** est un raccourci vers l’adresse d’un dépôt distant. Le clonage le crée tout seul ; ici, on l’ajoute soi-même. Aucun échange avec GitLab n’a encore eu lieu : aucun jeton n’est demandé.',
      concepts: ['remote', 'url'],
      hints: [
        'Il faut donner à Git l’adresse du projet GitLab, sous le nom habituel `origin`.',
        { vscode: 'L’URL : GitLab › bouton **Code** › **Clone with HTTPS**. Le menu **…** de Source Control contient **Remote** › **Add Remote…**.', rstudio: 'L’URL : GitLab › bouton **Code** › **Clone with HTTPS**. RStudio n’a pas de bouton pour cela : onglet **Terminal**.' },
        { text: { vscode: 'Copie l’URL HTTPS, puis **…** › **Remote** › **Add Remote…**, colle l’URL et tape `origin`.', rstudio: 'Copie l’URL HTTPS, puis tape `git remote add origin ` et colle l’URL dans le Terminal.' }, targets: { vscode: ['tb.tool-gitlab', 'gl.code-button', 'gl.clone-https-copy', 'vs.more', 'vs.add-remote'], rstudio: ['tb.tool-gitlab', 'gl.code-button', 'gl.clone-https-copy', 'rs.tab-terminal', 'rs.terminal-input'] } },
      ],
    },
    {
      id: 'check', title: 'Vérifier le remote', tool: 'ide',
      guide: { vscode: 'Dans le terminal (**Terminal** › **New Terminal**), tape `git remote -v`.', rstudio: 'Dans l’onglet **Terminal**, tape `git remote -v`.' },
      done: (c) => { const r = c.ev('remote-add').pop(); return !!r && c.has('remote-view', (e) => e.n > r.n); },
      result: 'Le terminal affiche `origin  https://gitlab.example.com/stagiaire/etude-entreprises.git` (fetch et push).',
      explain: 'Même adresse pour récupérer (fetch) et envoyer (push).',
      concepts: ['remote'],
      hints: ['Demande à Git les remotes qu’il connaît.', { vscode: 'Panneau du bas, onglet **TERMINAL**.', rstudio: 'Onglet **Terminal**, à côté de la Console.' }, { text: 'Tape `git remote -v`.', targets: { vscode: ['vs.terminal-tab', 'vs.terminal-input'], rstudio: ['rs.tab-terminal', 'rs.terminal-input'] } }],
    },
    quiz('clone', 'Clone ou init ?', 'Pourquoi ne pas avoir cloné le projet, comme dans le parcours A ?', [
      { id: 'a', text: 'Le travail existait déjà dans le pod : on transforme ce dossier en dépôt, au lieu d’en créer un second à côté.', correct: true, feedback: 'Exact. Cloner aurait créé un autre dossier, vide, et il aurait fallu y recopier tes fichiers à la main.' },
      { id: 'b', text: 'On ne peut pas cloner un projet vide.', feedback: 'On peut cloner un projet vide (Git l’indique par un avertissement). Mais ton travail resterait dans l’ancien dossier.' },
      { id: 'c', text: 'git init télécharge le projet depuis GitLab.', feedback: 'Non : `git init` est entièrement local. C’est le remote qui fera le lien, et le push qui enverra.' },
    ]),
  ],
  debrief: {
    summary: 'Ton dossier est un **dépôt Git local**, relié au projet GitLab par le remote `origin`. Il n’a encore aucun commit.',
    questions: [
      { q: 'Qu’a changé `git init` dans ton dossier ?', a: 'Il a ajouté le dossier caché `.git` (l’historique, vide). Tes fichiers sont inchangés.' },
      { q: 'Pourquoi aucun jeton n’a-t-il été demandé ?', a: 'Ni `git init` ni `git remote add` ne contactent GitLab. Le jeton servira au push.' },
    ],
  },
};

export const m4b = {
  id: 'm4b', num: 'B4', track: 'B', world: 'existant', title: 'Choisir ce qui part dans le premier commit', short: '.gitignore et commit',
  params: M, worldOptions: WORLD,
  objective: 'Écarter les données (`entreprises.csv`) avec un fichier `.gitignore`, préparer le rapport et le script, puis créer le **premier commit**.',
  why: 'Un dépôt garde le code et les documents, pas les données : elles sont souvent volumineuses, parfois confidentielles, et se stockent ailleurs (par exemple dans le stockage S3 d’Onyxia).',
  ready: (w) => { const f = w.ws.repos[M.folder]; return !!(f && f.git && f.remote); },
  setup(w, { ide }) {
    const f = existingWork(w, M, FILES_ETUDE, ide); H.makeProject(w, M); H.makeSavedToken(w);
    E.initRepo(w, f.path); E.addRemote(w, f.path, 'origin', E.httpsUrl('stagiaire', 'etude-entreprises'));
  },
  steps: [
    {
      id: 'ignore', title: 'Écarter les données avec .gitignore', tool: 'ide',
      guide: { vscode: 'Crée à la racine un fichier `.gitignore` (icône **New File…** de l’explorateur) contenant la ligne `entreprises.csv` (ou `*.csv`), puis enregistre.', rstudio: 'RStudio a déjà créé un `.gitignore` : ouvre-le depuis **Files**, ajoute la ligne `entreprises.csv` (ou `*.csv`), puis enregistre.' },
      done: dataIgnored,
      result: { vscode: '`entreprises.csv` disparaît de la liste **Changes** de Source Control.', rstudio: '`entreprises.csv` disparaît de l’onglet **Git**.' },
      explain: '`.gitignore` liste ce que Git doit ignorer. Le fichier reste dans ton pod ; il n’entrera simplement jamais dans l’historique, ni sur GitLab.',
      concepts: ['gitignore'],
      hints: [
        'Git ignore les fichiers listés dans un fichier spécial, à la racine du projet.',
        { vscode: 'Explorateur : icône **New File…** ; le fichier s’appelle `.gitignore` (avec le point).', rstudio: 'Panneau **Files** : le fichier `.gitignore` existe déjà.' },
        { text: { vscode: 'Crée `.gitignore`, écris `entreprises.csv`, puis **Ctrl+S**.', rstudio: 'Ouvre `.gitignore`, ajoute la ligne `entreprises.csv`, puis **Ctrl+S**.' }, targets: { vscode: ['vs.explorer', 'vs.new-file'], rstudio: ['rs.files-.gitignore', 'rs.editor', 'rs.save'] } },
      ],
    },
    {
      id: 'stage', title: 'Préparer le rapport, le script et .gitignore', tool: 'ide',
      guide: { vscode: 'Dans **Source Control**, survole l’en-tête **Changes** et clique sur **+** (Stage All Changes), ou prépare chaque fichier. Vérifie que `entreprises.csv` n’y figure pas.', rstudio: 'Dans l’onglet **Git**, coche **Staged** pour chaque fichier listé (`entreprises.csv` n’y figure plus).' },
      done: (c) => { const f = folder(c); return !!f && f.git && ((f.index['rapport.qmd'] !== undefined && f.index['analyse.R'] !== undefined && f.index['.gitignore'] !== undefined && f.index[c.m.data] === undefined) || firstCommitOk(c, ['rapport.qmd', 'analyse.R', '.gitignore'])); },
      warn: (c) => { const f = folder(c); return f && f.index[c.m.data] !== undefined ? 'Les données sont préparées pour le commit. Retire-les (`git restore --staged entreprises.csv`, ou **−** dans VS Code), puis ajoute-les à `.gitignore`.' : null; },
      result: 'Le rapport, le script et `.gitignore` sont prêts pour le commit ; les données non.',
      explain: 'Le `.gitignore` lui-même est suivi par Git : toute personne qui clonera le projet héritera de la même règle.',
      concepts: ['staging'],
      hints: ['Tous les fichiers suivis doivent entrer dans ce premier commit, sauf les données.', { vscode: 'Source Control › en-tête **Changes** › **+**.', rstudio: 'Onglet **Git**, colonne **Staged**.' }, { text: { vscode: 'Clique sur **+** (Stage All Changes).', rstudio: 'Coche **Staged** pour chaque ligne.' }, targets: { vscode: ['vs.scm', 'vs.stage-all'], rstudio: ['rs.tab-git', 'rs.staged-rapport.qmd'] } }],
    },
    {
      id: 'commit', title: 'Créer le premier commit', tool: 'ide',
      guide: { vscode: 'Écris un message qui décrit ce que contient le projet, par exemple « Ajoute le rapport et le script d’analyse », puis **Commit**.', rstudio: 'Clique sur **Commit**, écris dans **Commit message** par exemple « Ajoute le rapport et le script d’analyse », puis **Commit**.' },
      done: (c) => firstCommitOk(c, ['rapport.qmd', 'analyse.R', '.gitignore']),
      warn: (c) => {
        const k = lastCommit(folder(c));
        if (!k) return null;
        if (k.tree[c.m.data] !== undefined) return 'Le commit contient les données. Tant qu’il n’est pas envoyé, tu peux le corriger : retire le fichier (`git rm --cached` est hors parcours ; recommence la mission) ou écarte-le avant de commiter.';
        if (!E.messageQuality(k.message).ok) return 'Le commit existe, mais son message ne dit pas ce qu’il contient. Corrige-le avant le push : `git commit --amend -m "…"`, **Commit (Amend)** dans VS Code, ou **Amend previous commit** dans RStudio.';
        return null;
      },
      result: 'Le premier commit (`root-commit`) existe dans ton pod.',
      explain: 'Ce commit porte ton identité (`user.name`, `user.email`). Il n’existe encore que dans le dépôt local.',
      concepts: ['commit', 'identite'],
      hints: ['Le message doit dire ce que contient ce premier enregistrement.', { vscode: 'Zone **Message**, puis **Commit**.', rstudio: 'Bouton **Commit** de l’onglet Git.' }, { text: 'Message : « Ajoute le rapport et le script d’analyse ».', targets: { vscode: ['vs.commit-message', 'vs.commit-button'], rstudio: ['rs.git-commit', 'rs.commit-message', 'rs.commit-button'] } }],
    },
    {
      id: 'remote', title: 'Constater que GitLab est toujours vide', tool: 'gitlab',
      guide: 'Retourne dans GitLab, sur la page du projet.',
      done: (c) => { const k = c.ev('commit-ok').pop(); const p = H.project(c); return !!(k && p && !p.commits.length && c.has('view', (e) => (e.page === 'project' || e.page === 'commits') && e.n > k.n)); },
      result: 'GitLab affiche toujours « The repository for this project is empty ».',
      explain: 'Le commit n’existe que dans ton pod. Rien ne part sans push.',
      concepts: ['push'],
      hints: ['Compare ton IDE et GitLab.', 'Onglet **GitLab**, page du projet.', { text: 'Ouvre l’onglet GitLab et la page du projet.', targets: ['tb.tool-gitlab', 'gl.project-link'] }],
    },
  ],
  debrief: {
    summary: 'Le premier commit contient le **rapport, le script et `.gitignore`**, sans les données. GitLab ne le connaît pas encore.',
    questions: [
      { q: 'Que deviendrait `entreprises.csv` si tu l’avais commité ?', a: 'Il entrerait dans l’historique et partirait sur GitLab au push. Le retirer ensuite de l’historique est délicat.' },
      { q: 'Où ranger les données sur Onyxia ?', a: 'Dans le stockage de données (S3) de ton espace, à part du dépôt Git ; le script les lit depuis cet emplacement.' },
    ],
  },
};

export const m5b = {
  id: 'm5b', num: 'B5', track: 'B', next: 'd1', world: 'existant', title: 'Envoyer et vérifier', short: 'Premier push',
  params: M, worldOptions: WORLD,
  objective: 'Faire le **premier push** de ton dépôt local vers GitLab, puis y vérifier le commit et les fichiers, sans les données.',
  why: 'Le premier push crée la branche `main` sur GitLab et l’enregistre comme branche suivie.',
  ready: (w) => { const f = w.ws.repos[M.folder]; return !!(f && f.git && f.remote && f.commits.length); },
  setup(w, { ide }) {
    const f = existingWork(w, M, FILES_ETUDE, ide); H.makeProject(w, M); H.makeSavedToken(w);
    E.initRepo(w, f.path); E.addRemote(w, f.path, 'origin', E.httpsUrl('stagiaire', 'etude-entreprises'));
    E.writeFile(w, f.path, '.gitignore', (f.work['.gitignore'] || '') + 'entreprises.csv\n');
    E.stageAll(w, f.path); E.commit(w, f.path, { message: 'Ajoute le rapport et le script d’analyse' });
  },
  steps: [
    {
      id: 'push', title: 'Faire le premier push', tool: 'ide',
      guide: { vscode: 'Dans **Source Control**, clique sur **Publish Branch** (ou tape `git push -u origin main` dans le terminal). Git te demandera ton jeton.', rstudio: 'Les boutons **Push** et **Pull** sont grisés : la branche n’est pas encore suivie. Dans l’onglet **Terminal**, tape `git push -u origin main` et fournis ton jeton.' },
      done: pushed,
      warn: (c) => {
        const f = c.ev('push-fail').pop();
        if (!f || pushed(c)) return null;
        if (f.reason === 'no-upstream') return 'Pour le premier envoi, précise la destination : `git push -u origin main`. `-u` enregistre la branche suivie.';
        if (f.reason === 'auth') return 'GitLab refuse l’authentification : vérifie la valeur du jeton, dans ton gestionnaire de mots de passe.';
        if (f.reason === 'non-fast-forward') return 'GitLab a déjà un historique dans ce projet (créé avec un README ?) : l’exercice 6.10 explique cette situation.';
        return null;
      },
      result: 'Git affiche `* [new branch] main -> main` puis `branch \'main\' set up to track \'origin/main\'.`',
      explain: 'C’est le premier échange avec GitLab : il demande ton jeton (le gestionnaire d’identifiants le mémorise). Les envois suivants se feront d’un simple `git push`, **Sync Changes** ou **Push**.',
      concepts: ['upstream', 'push', 'authentification'],
      hints: [
        'Le premier envoi d’une branche demande de dire à Git où l’envoyer.',
        { vscode: 'Le bouton bleu **Publish Branch** dans Source Control.', rstudio: 'L’onglet **Terminal**, en bas à gauche.' },
        { text: { vscode: 'Clique sur **Publish Branch**, puis fournis `stagiaire` et ton jeton.', rstudio: 'Tape `git push -u origin main`, puis `stagiaire` et ton jeton.' }, targets: { vscode: ['vs.scm', 'vs.publish', 'vs.status-sync'], rstudio: ['rs.tab-terminal', 'rs.terminal-input'] } },
      ],
    },
    {
      id: 'commits', title: 'Vérifier le commit dans GitLab', tool: 'gitlab',
      guide: 'Dans GitLab, ouvre **Code** › **Commits**.',
      done: (c) => { const ok = c.ev('push-ok').pop(); return !!ok && c.has('view', (e) => (e.page === 'commits' || e.page === 'commit') && e.n > ok.n); },
      result: 'Ton commit apparaît, avec ton message et ton nom.',
      hints: ['L’historique se consulte dans la partie **Code** du projet.', 'Barre latérale : **Code** › **Commits**.', { text: 'Ouvre **Code** › **Commits**.', targets: ['tb.tool-gitlab', 'gl.nav-commits'] }],
    },
    {
      id: 'files', title: 'Vérifier les fichiers : les données sont restées dans le pod', tool: 'gitlab',
      guide: 'Ouvre la page du projet : `rapport.qmd`, `analyse.R` et `.gitignore` y sont-ils ? Et `entreprises.csv` ?',
      done: (c) => { const ok = c.ev('push-ok').pop(); return !!ok && c.has('view', (e) => e.page === 'project' && e.n > ok.n); },
      result: 'GitLab liste le rapport, le script et `.gitignore` ; `entreprises.csv` n’y est pas.',
      explain: 'Le dépôt distant contient exactement ce que tu as choisi de commiter.',
      hints: ['La liste des fichiers est sur la page d’accueil du projet.', 'Nom du projet, dans la barre latérale.', { text: 'Ouvre la page du projet.', targets: ['gl.project-link'] }],
    },
  ],
  debrief: {
    summary: 'Ton travail existant est sur GitLab : **dossier → git init → remote → .gitignore → commit → push -u**. Les données sont restées dans le pod.',
    questions: [
      { q: 'Quelle différence avec le parcours A ?', a: 'En A, le dépôt naît sur GitLab (avec un README) et on le clone. En B, il naît dans le pod (git init) et on l’envoie vers un projet GitLab vide.' },
      { q: 'Pourquoi `-u` au premier push ?', a: 'Il enregistre `origin/main` comme branche suivie : ensuite, `git push` et les boutons Push/Pull savent où envoyer.' },
    ],
  },
};

// ---------------------------------------------------------------------

const M7 = { ns: 'stagiaire', project: 'enquete-loyers', folder: '/home/stagiaire/projets/enquete-loyers', data: 'loyers.csv' };
const FILES_LOYERS = {
  'synthese.qmd': '---\ntitle: "Enquête loyers : synthèse"\n---\n\nPremiers résultats de l’enquête fictive sur les loyers.\n',
  'prepa.R': 'loyers <- read.csv2("loyers.csv")\nsummary(loyers$montant)\n',
  'loyers.csv': 'id;commune;montant\n1;A;650\n2;B;720\n3;A;590\n',
};

export const m7b = {
  id: 'm7b', num: '7B', track: 'B', world: 'autonome-b', title: 'Refaire seul : travail existant', short: 'Autonomie B', autonomousOnly: true,
  params: M7, worldOptions: { today: '2026-04-13', host: 'vscode-onyxia-9c71' },
  objective: 'Ton pod contient déjà `~/projets/enquete-loyers` (une synthèse, un script, des données). Crée sur GitLab un projet privé et vide `enquete-loyers`, prépare un accès adapté, fais de ce dossier un dépôt relié à GitLab, écarte `loyers.csv`, crée le premier commit, envoie-le et vérifie le résultat.',
  why: 'Même démarche que le parcours B, sans consignes détaillées. Les aides restent disponibles.',
  setup(w, { ide }) { existingWork(w, M7, FILES_LOYERS, ide); },
  steps: [
    { id: 'p', title: 'Projet privé, créé vide', tool: 'gitlab', done: (c) => { const p = H.project(c); return !!(p && p.visibility === 'private' && H.createdEmpty(c)); },
      hints: ['Comme en mission B1.', '**+** › New project/repository › Create blank project.', { text: 'Nom `enquete-loyers`, **Private**, case README **décochée**.', targets: ['gl.create-new', 'gl.menu-new-project', 'gl.blank-card'] }] },
    { id: 't', title: 'Jeton limité à write_repository, valeur conservée', tool: 'gitlab', done: (c) => H.writeTokens(c).some((t) => H.minimalWrite(t) && H.savedInVault(c, t)),
      hints: ['Que dois-tu pouvoir faire ? Envoyer.', 'Avatar › Edit profile › Access › Personal access tokens › Generate token › Legacy token.', { text: 'Coche `write_repository`, copie la valeur et range-la dans **Mots de passe**.', targets: ['gl.avatar', 'gl.edit-profile', 'gl.nav-access-tokens', 'tb.vault'] }] },
    { id: 'i', title: 'Dossier initialisé et relié à origin', tool: 'ide', done: (c) => isGit(c) && remoteOk(c),
      hints: ['git init, puis git remote add.', { vscode: 'Source Control › Initialize Repository, puis … › Remote › Add Remote….', rstudio: 'Tools › Version Control › Project Setup…, puis Terminal : git remote add origin <URL>.' }, { text: 'Initialise, puis ajoute le remote origin avec l’URL HTTPS.', targets: { vscode: ['vs.scm', 'vs.init', 'vs.more'], rstudio: ['rs.menu-tools', 'rs.tab-terminal'] } }] },
    { id: 'g', title: 'Données écartées par .gitignore', tool: 'ide', done: dataIgnored,
      hints: ['Un fichier spécial liste ce que Git ignore.', '`.gitignore`, à la racine.', { text: 'Ajoute la ligne `loyers.csv` à `.gitignore`.', targets: { vscode: ['vs.new-file'], rstudio: ['rs.files-.gitignore'] } }] },
    { id: 'k', title: 'Premier commit descriptif, sans les données', tool: 'ide', done: (c) => firstCommitOk(c, ['synthese.qmd', 'prepa.R', '.gitignore']),
      hints: ['Prépare tout sauf les données, puis commite.', { vscode: 'Stage All Changes, Message, Commit.', rstudio: 'Cases Staged, puis Commit.' }, { text: 'Un message comme « Ajoute la synthèse et le script de préparation ».', targets: { vscode: ['vs.stage-all', 'vs.commit-message'], rstudio: ['rs.git-commit'] } }] },
    { id: 'u', title: 'Premier push réussi', tool: 'ide', done: pushed,
      hints: ['Premier envoi de la branche.', { vscode: 'Publish Branch.', rstudio: 'Terminal : git push -u origin main.' }, { text: 'Envoie la branche.', targets: { vscode: ['vs.publish'], rstudio: ['rs.tab-terminal', 'rs.terminal-input'] } }] },
    { id: 'v', title: 'Résultat vérifié dans GitLab', tool: 'gitlab', done: (c) => { const ok = c.ev('push-ok').pop(); return !!ok && c.has('view', (e) => ['commits', 'commit', 'file', 'project'].includes(e.page) && e.n > ok.n); },
      hints: ['Le résultat se constate côté serveur.', 'Onglet GitLab, page du projet.', { text: 'Ouvre le projet dans GitLab.', targets: ['tb.tool-gitlab', 'gl.project-link'] }] },
  ],
  debrief: {
    summary: 'Tu as relié seul un travail existant à GitLab : **projet vide, git init, remote, .gitignore, commit, push -u, vérification**.',
    questions: [
      { q: 'Explique avec tes mots quand tu choisis le parcours A ou le parcours B.', a: 'A : je démarre de zéro, je crée le projet avec un README et je le clone dans mon pod. B : mon travail existe déjà dans le pod, je crée un projet vide et j’y envoie mon dossier après git init.' },
      { q: 'Que vérifierais-tu si le premier push était refusé avec `[rejected] … (fetch first)` ?', a: 'Que le projet GitLab est bien vide : s’il a été créé avec un README, son historique n’a aucun lien avec le mien.' },
    ],
  },
};

export const MAIN_B = [m1b, m2b, m3b, m4b, m5b];
