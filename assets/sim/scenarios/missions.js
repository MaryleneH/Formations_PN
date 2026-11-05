// =====================================================================
// Missions du parcours principal (1 à 5) et mission 7 « Refaire seul ».
//
// Une mission = objectif → manipulations (étapes) → résultat observable
// → explication → débrief. Chaque étape est validée par l'ÉTAT du
// simulateur (fonction done), jamais par un clic sur « Continuer ».
//
// Mise en forme des textes : `code`, **gras**. Les textes propres à un
// IDE s'écrivent { vscode: '…', rstudio: '…' }.
// Cibles de « Montrer le geste » : attributs data-target des vues
// (liste dans docs/MAINTENANCE.md).
// =====================================================================

import * as E from '../engine/engine.js';
import * as H from './helpers.js';

const M = { ns: 'stagiaire', project: 'etude-entreprises' };

const quiz = (id, title, question, options, extra = {}) => ({ id, kind: 'quiz', title, question, options, tool: 'any', ...extra });

export const m1 = {
  id: 'm1', num: 1, world: 'parcours', title: 'Créer mon dépôt distant', short: 'Projet GitLab',
  params: M,
  objective: 'Créer sur GitLab un projet **privé** `etude-entreprises`, **vide** : la case README reste décochée.',
  why: 'Le dépôt distant est le point de rendez-vous de ton projet : c’est lui que tu cloneras, puis que tu mettras à jour.',
  setup() {},
  steps: [
    {
      id: 'form', title: 'Ouvrir le formulaire d’un projet vierge', tool: 'gitlab',
      guide: 'Dans GitLab, ouvre **Create new (+)** › **New project/repository**, puis choisis **Create blank project**.',
      done: (c) => c.has('view', (e) => e.page === 'new-blank') || !!H.project(c),
      result: 'Le formulaire « Create blank project » est ouvert.',
      explain: '**GitLab** est le service qui héberge le dépôt distant. Ce formulaire crée un projet sur le serveur, pas sur ton poste.',
      concepts: ['gitlab'],
      hints: [
        'Un nouveau projet se crée depuis un bouton de création, présent sur toutes les pages.',
        'Regarde en haut à droite de GitLab : le bouton **+** (Create new). La page **Projects** propose aussi **New project**.',
        { text: 'Clique sur **+**, puis **New project/repository**, puis la carte **Create blank project**.', targets: ['gl.create-new', 'gl.menu-new-project', 'gl.projects-new', 'gl.blank-card'] },
      ],
    },
    {
      id: 'create', title: 'Renseigner le projet et le créer', tool: 'gitlab',
      guide: 'Nom : `etude-entreprises`. Vérifie l’espace de noms (`stagiaire`) et le chemin (**Project slug**). Choisis **Private**, **décoche** **Initialize repository with a README** (elle est cochée par défaut), puis **Create project**.',
      done: (c) => !!H.project(c),
      warn: (c) => {
        const p = H.project(c);
        const other = Object.values(c.w.remote.projects).filter((x) => x.ns === 'stagiaire' && x.path !== M.project);
        if (!p && other.length) return `Un projet « ${other[0].path} » existe, mais la mission attend le chemin \`etude-entreprises\`. Tu peux créer un second projet avec ce chemin.`;
        return null;
      },
      result: 'GitLab affiche la page du projet `stagiaire/etude-entreprises` : « The repository for this project is empty ».',
      explain: 'Le **chemin** (slug) devient l’adresse du projet : `https://gitlab.example.com/stagiaire/etude-entreprises`. L’**espace de noms** `stagiaire` est ton espace personnel.',
      concepts: ['gitlab', 'url'],
      hints: [
        'Quatre réglages comptent ici : le nom, le chemin, la visibilité et la case README, cochée par défaut.',
        'Dans le formulaire : **Project name**, puis **Project URL** / **Project slug**, puis **Visibility Level**, puis **Project Configuration**.',
        { text: 'Saisis le nom, sélectionne **Private**, **décoche** **Initialize repository with a README**, puis clique sur **Create project**.', targets: ['gl.field-name', 'gl.visibility-private', 'gl.readme', 'gl.create-project'] },
      ],
    },
    {
      id: 'check', title: 'Vérifier : privé et vide', tool: 'gitlab',
      guide: 'Sur la page du projet, repère le badge **Private** et le message « The repository for this project is empty ». Lis les instructions proposées par GitLab.',
      done: (c) => { const p = H.project(c); return !!(p && p.visibility === 'private' && H.createdEmpty(c) && c.has('view', (e) => e.page === 'project' && e.project === 'stagiaire/etude-entreprises')); },
      warn: (c) => {
        const p = H.project(c);
        if (!p) return null;
        if (!H.createdEmpty(c) && p.commits.length) return 'Ce projet a été créé avec un README. Dans ce parcours, on laisse la case décochée : recommence la mission (bouton en haut) pour le recréer vide.';
        if (p.visibility !== 'private') return `Ce projet est « ${p.visibility} ». La mission demande un projet privé : recommence la mission pour le recréer.`;
        return null;
      },
      result: 'Le dépôt distant existe, sans aucun fichier ni commit. GitLab affiche son adresse et des instructions pour y envoyer un premier commit.',
      explain: 'Un dépôt **vide** ne contient aucun historique : le premier commit, et le README, viendront de ton environnement. On évite ainsi d’avoir deux historiques à réconcilier, par exemple quand on envoie un projet qui existe déjà. **Privé** : seuls les membres du projet peuvent le voir et le cloner.',
      concepts: ['commit', 'branche'],
      hints: [
        'La page d’accueil du projet résume son contenu.',
        'Regarde le badge de visibilité à côté du nom, puis le message sous l’en-tête.',
        { text: 'Ouvre la page du projet depuis **Projects** si tu l’as quittée.', targets: ['gl.project-link'] },
      ],
    },
    quiz('where', 'Où se trouve ce dépôt ?', 'À ce stade, où se trouve le dépôt `etude-entreprises` ?', [
      { id: 'a', text: 'Uniquement sur le serveur GitLab : c’est un dépôt distant.', correct: true, feedback: 'Exact. Rien n’existe encore dans ton environnement de travail : il faudra le cloner.' },
      { id: 'b', text: 'Sur GitLab et dans mon environnement de travail.', feedback: 'Pas encore : aucune copie locale n’a été créée. C’est le rôle du clonage (mission 3).' },
      { id: 'c', text: 'Dans VS Code ou RStudio.', feedback: 'L’IDE est l’interface où tu travailles ; il n’héberge pas le dépôt. Et rien n’a encore été cloné.' },
    ]),
  ],
  debrief: {
    summary: 'Tu as créé un **dépôt distant** privé et **vide**. Il n’existe que sur GitLab, sans aucun commit.',
    questions: [
      { q: 'Quel réglage empêche une personne extérieure au projet de le consulter ?', a: 'La visibilité **Private** : seuls les membres du projet y ont accès.' },
      { q: 'Pourquoi laisser la case README décochée ?', a: 'Le dépôt reste vide : tout l’historique partira de ton environnement, à commencer par le README. Aucun historique distant n’est à réconcilier, ce qui compte surtout quand on envoie un projet existant.' },
    ],
  },
};

export const m2 = {
  id: 'm2', num: 2, world: 'parcours', title: 'Préparer mon accès', short: 'URL et jeton',
  params: M,
  objective: 'Retrouver l’**URL HTTPS** du projet, puis créer un **jeton personnel** qui permet de cloner et d’envoyer des modifications, et conserver sa valeur.',
  why: 'Deux éléments différents : l’URL dit **où** est le dépôt ; le jeton prouve **qui** tu es quand Git contacte GitLab.',
  ready: (w) => !!E.getProject(w, 'stagiaire', 'etude-entreprises'),
  setup(w) { H.makeProject(w, M); },
  steps: [
    {
      id: 'url', title: 'Copier l’URL de clonage HTTPS', tool: 'gitlab',
      guide: 'Sur la page du projet, ouvre le bouton **Code** et copie l’adresse **Clone with HTTPS**.',
      done: (c) => c.has('copy', (e) => e.kind === 'url' && !e.ssh),
      warn: (c) => (c.has('copy', (e) => e.kind === 'url' && e.ssh) && !c.has('copy', (e) => e.kind === 'url' && !e.ssh) ? 'Tu as copié l’adresse **SSH** (`git@…`). Ce parcours utilise **HTTPS** avec un jeton : copie la ligne **Clone with HTTPS**.' : null),
      result: 'Le presse-papiers du bac à sable contient `https://gitlab.example.com/stagiaire/etude-entreprises.git`.',
      explain: 'L’**URL du dépôt** indique à Git où trouver le projet. Elle ne contient aucun secret : tu peux la retrouver à tout moment.',
      concepts: ['url'],
      hints: [
        'L’adresse de clonage est proposée sur la page d’accueil du projet.',
        'En haut à droite de la liste des fichiers : le bouton bleu **Code**.',
        { text: 'Clique sur **Code**, puis sur le bouton de copie à côté de **Clone with HTTPS**.', targets: ['gl.code-button', 'gl.clone-https-copy'] },
      ],
    },
    {
      id: 'page', title: 'Ouvrir la page des jetons personnels', tool: 'gitlab',
      guide: 'Ouvre ton **avatar** (en haut à droite) › **Edit profile**, puis dans la barre latérale **Access** › **Personal access tokens**.',
      done: (c) => c.has('view', (e) => e.page === 'tokens'),
      result: 'La page **Personal access tokens** liste tes jetons (aucun pour l’instant).',
      explain: 'Un **jeton personnel** est rattaché à ton compte. Un **jeton de projet** (Project access token) serait rattaché au projet, à un compte de service : utile pour une automatisation, pas pour ton travail quotidien.',
      concepts: ['jeton', 'jeton-projet'],
      hints: [
        'Les jetons personnels se gèrent dans les réglages de ton compte, pas dans ceux du projet.',
        'Avatar en haut à droite › **Edit profile** › section **Access** de la barre latérale.',
        { text: 'Clique sur l’avatar, **Edit profile**, puis **Personal access tokens**.', targets: ['gl.avatar', 'gl.edit-profile', 'gl.nav-access-tokens'] },
      ],
    },
    {
      id: 'token', title: 'Générer un jeton « Legacy token »', tool: 'gitlab',
      guide: 'Choisis **Generate token** › **Legacy token**. Donne un nom explicite (par exemple `poste-formation`), une date d’expiration proche (un mois), coche **write_repository**, puis **Generate token**.',
      done: (c) => H.writeTokens(c).length > 0,
      result: 'Un jeton actif apparaît, et sa valeur `DEMO-TOKEN-…` est affichée une seule fois.',
      explain: 'Pour cloner **puis envoyer** des modifications, il faut lire et écrire dans le dépôt : `write_repository` couvre les deux. `read_repository` suffirait pour cloner seulement.',
      concepts: ['scopes', 'jeton'],
      hints: [
        'Pose-toi la question : que dois-je pouvoir faire avec ce jeton ? Ici : cloner, puis pousser.',
        'Menu **Generate token** › **Legacy token**. Puis les champs **Token name**, **Expiration date** et la liste des scopes.',
        { text: 'Remplis le nom, choisis la date, coche **write_repository** seulement, puis **Generate token**.', targets: ['gl.generate-token', 'gl.legacy-token', 'gl.token-name', 'gl.token-expiry', 'gl.scope-write_repository', 'gl.generate'] },
      ],
    },
    {
      id: 'scopes', title: 'Limiter les permissions à l’objectif', tool: 'gitlab',
      guide: 'Vérifie dans la liste que ton jeton n’a que `write_repository`.',
      done: (c) => H.writeTokens(c).some(H.minimalWrite),
      warn: (c) => {
        const t = H.writeTokens(c).find((x) => !H.minimalWrite(x));
        if (t && !H.writeTokens(c).some(H.minimalWrite)) return `Le jeton « ${t.name} » a des scopes en plus (${t.scopes.filter((s) => s !== 'write_repository').join(', ')}). Pour un usage Git seul, \`api\` n’est pas nécessaire et donne bien plus de droits. Révoque ce jeton et crée-en un limité à \`write_repository\`.`;
        return null;
      },
      result: 'Le jeton porte un seul scope : `write_repository`.',
      explain: 'Les permissions du jeton **limitent** ce qu’il peut faire ; elles ne donnent jamais plus de droits que ton compte n’en a sur le projet.',
      concepts: ['scopes', 'autorisation'],
      hints: [
        'Moins un jeton peut faire, moins sa fuite est grave.',
        'La colonne **Scopes** de la liste des jetons actifs.',
        { text: 'Si un scope superflu est coché, révoque ce jeton (menu ⋮ › Revoke) et crée-en un nouveau.', targets: ['gl.token-list'] },
      ],
    },
    {
      id: 'save', title: 'Conserver la valeur du jeton', tool: 'any',
      guide: 'Copie la valeur affichée, ouvre le **gestionnaire de mots de passe** (barre d’outils du bac à sable) et enregistre-la.',
      done: (c) => H.writeTokens(c).some((t) => H.minimalWrite(t) && H.savedInVault(c, t)),
      warn: (c) => {
        const lost = H.writeTokens(c).filter((t) => t.lost && !H.savedInVault(c, t));
        if (lost.length && !H.writeTokens(c).some((t) => H.savedInVault(c, t))) return 'L’affichage du jeton a été fermé avant que tu conserves sa valeur : GitLab ne la montrera plus. C’est normal et voulu. Révoque ce jeton (⋮ › Revoke) et génère-en un nouveau, puis copie sa valeur **avant** de quitter la page.';
        return null;
      },
      result: 'La valeur est rangée dans le gestionnaire de mots de passe du bac à sable.',
      explain: 'GitLab ne stocke qu’une empreinte du jeton : après avoir quitté la page, **personne** ne peut réafficher sa valeur. Un gestionnaire de mots de passe évite de la coller dans un fichier ou un message.',
      concepts: ['jeton'],
      hints: [
        'La valeur ne sera plus jamais affichée après ce moment : range-la tout de suite.',
        'À côté de la valeur : le bouton de copie. Puis **Mots de passe** dans la barre d’outils au-dessus du simulateur.',
        { text: 'Copie la valeur, ouvre **Mots de passe**, puis **Enregistrer depuis le presse-papiers**.', targets: ['gl.token-copy', 'tb.vault', 'vault.save'] },
      ],
    },
    quiz('roles', 'URL ou jeton ?', 'Quelle phrase décrit le mieux le rôle de chacun ?', [
      { id: 'a', text: 'L’URL indique où se trouve le dépôt ; le jeton permet à GitLab de te reconnaître.', correct: true, feedback: 'Oui : l’URL est une adresse publique (même pour un projet privé), le jeton est un secret d’**authentification**.' },
      { id: 'b', text: 'Le jeton contient l’adresse du dépôt, l’URL n’est utile que dans le navigateur.', feedback: 'Non : le jeton ne désigne aucun projet ; il sert à t’authentifier. Git a besoin de l’URL pour savoir quoi cloner.' },
      { id: 'c', text: 'Les deux sont des secrets à ne jamais partager.', feedback: 'Seul le jeton est un secret. L’URL peut figurer dans une documentation ou un message.' },
    ]),
  ],
  debrief: {
    summary: 'Tu disposes de deux éléments : l’**URL HTTPS** (où est le dépôt) et un **jeton personnel** limité à `write_repository` (qui tu es, et ce que ce jeton autorise).',
    questions: [
      { q: 'Si tu ne voulais que consulter le projet, quel scope choisirais-tu ?', a: '`read_repository` : il permet de cloner et de récupérer, pas d’envoyer.' },
      { q: 'Que fais-tu si tu as fermé la page sans copier la valeur ?', a: 'Tu ne peux pas la retrouver. Tu révoques ce jeton et tu en crées un nouveau (ou tu fais une rotation).' },
    ],
  },
};

export const m3 = {
  id: 'm3', num: 3, world: 'parcours', title: 'Cloner dans mon environnement', short: 'Clonage',
  params: M,
  objective: { vscode: 'Créer dans VS Code une copie locale du projet `etude-entreprises`, en t’authentifiant avec ton jeton, puis ouvrir le projet.', rstudio: 'Créer dans RStudio un projet à partir du dépôt `etude-entreprises` (copie locale), en t’authentifiant avec ton jeton.' },
  why: 'Le clonage crée le **dépôt local** : les fichiers, tout l’historique, et un lien (`origin`) vers GitLab.',
  ready: (w) => !!E.getProject(w, 'stagiaire', 'etude-entreprises') && w.tokens.some((t) => E.tokenState(w, t) === 'active' && t.scopes.includes('write_repository') && w.vault.some((v) => v.value === t.value)),
  setup(w) { H.makeProject(w, M); H.makeSavedToken(w); },
  steps: [
    {
      id: 'start', title: 'Lancer le clonage avec l’URL HTTPS', tool: 'ide',
      guide: {
        vscode: 'Dans VS Code, ouvre **Source Control** (ou l’explorateur) et choisis **Clone Repository**. Colle l’URL HTTPS, puis choisis le dossier `projets` comme destination.',
        rstudio: 'Dans RStudio : **File** › **New Project…** › **Version Control** › **Git**. Colle l’URL dans **Repository URL**, puis choisis `~/projets` comme dossier parent.',
      },
      done: (c) => c.has('auth-prompt', (e) => e.op === 'clone') || c.has('clone-ok'),
      warn: (c) => {
        const f = c.ev('clone-fail').pop();
        if (!f) return null;
        if (f.reason === 'ssh') return 'Cette adresse est une URL **SSH** (`git@…`). Utilise l’adresse **HTTPS**, celle qui commence par `https://`.';
        if (f.reason === 'invalid-url' || f.reason === 'other-host') return 'Git ne reconnaît pas cette adresse. Retourne dans GitLab, bouton **Code**, et copie **Clone with HTTPS**.';
        if (f.reason === 'secret-in-url') return 'N’insère pas le jeton dans l’URL : il serait enregistré en clair dans la configuration du dépôt. Utilise l’URL HTTPS seule ; Git te demandera le jeton.';
        if (f.reason === 'exists') return 'Un dossier de ce nom existe déjà à cet endroit. Choisis un autre dossier parent, ou un autre nom.';
        return null;
      },
      result: 'Git contacte GitLab et demande des identifiants : le projet est privé.',
      explain: 'Git utilise l’URL pour joindre le serveur. Comme le projet est privé, GitLab exige une **authentification** avant de transmettre quoi que ce soit.',
      concepts: ['url', 'authentification'],
      hints: [
        { vscode: 'L’action de clonage se trouve dans la vue du contrôle de code source quand aucun dossier n’est ouvert. La palette de commandes la propose aussi (**Git: Clone**).', rstudio: 'Dans RStudio, un dépôt se clone en créant un **projet**.' },
        { vscode: 'Barre d’activité à gauche : l’icône **Source Control** (branches), puis le bouton **Clone Repository**.', rstudio: 'Menu **File** › **New Project…**, puis **Version Control**.' },
        { text: { vscode: 'Clique sur **Source Control**, puis **Clone Repository**, colle l’URL et valide.', rstudio: 'Ouvre **File** › **New Project…** › **Version Control** › **Git**, colle l’URL, choisis le dossier puis **Create Project**.' }, targets: { vscode: ['vs.scm', 'vs.clone-button', 'vs.quickinput'], rstudio: ['rs.menu-file', 'rs.new-project', 'rs.wiz-vc', 'rs.wiz-git', 'rs.repo-url', 'rs.browse', 'rs.create'] } },
      ],
    },
    {
      id: 'auth', title: 'S’authentifier avec le jeton', tool: 'ide',
      guide: 'À la demande **Username**, saisis ton nom d’utilisateur (`stagiaire`). À la demande **Password**, colle le **jeton** (pas un mot de passe de compte).',
      done: (c) => c.has('clone-ok', (e) => e.project === 'stagiaire/etude-entreprises'),
      warn: (c) => {
        const f = c.ev('clone-fail', (e) => e.reason === 'auth').pop();
        if (!f || c.has('clone-ok')) return null;
        return 'GitLab a refusé l’authentification. Vérifie la valeur collée : elle doit être celle du jeton actif rangé dans ton gestionnaire de mots de passe. Le nom d’utilisateur, lui, n’est pas vérifié par GitLab pour un jeton.';
      },
      result: 'Le clonage réussit avec l’avertissement `You appear to have cloned an empty repository.` : c’est normal, le projet est vide. Un dossier `etude-entreprises` apparaît dans `projets`.',
      explain: 'Le **jeton** sert de mot de passe pour Git sur HTTPS. Selon ton système, la demande prend une autre forme (fenêtre de VS Code, de RStudio, du gestionnaire d’identifiants de Windows ou macOS). Ici, le gestionnaire d’identifiants de Git mémorise ensuite ces informations.',
      concepts: ['authentification', 'gestionnaire'],
      hints: [
        'Le jeton joue le rôle du mot de passe ; le nom d’utilisateur peut être ton identifiant GitLab.',
        'Ton jeton est dans **Mots de passe** (barre d’outils). Le champ de mot de passe propose aussi **Coller le jeton d’entraînement**.',
        { text: 'Copie le jeton depuis **Mots de passe**, saisis `stagiaire` puis colle le jeton dans **Password**.', targets: ['tb.vault', 'auth.username', 'auth.paste', 'auth.ok'] },
      ],
    },
    {
      id: 'open', title: 'Ouvrir le projet cloné', tool: 'ide',
      guide: { vscode: 'Accepte d’ouvrir le dépôt cloné (**Open**), ou utilise **File** › **Open Folder…**.', rstudio: 'RStudio ouvre le projet automatiquement après le clonage. Vérifie son nom en haut à droite.' },
      done: (c) => { const r = H.repo(c); return !!(r && c.w.ws.opened[c.ide] === r.path); },
      result: { vscode: 'L’explorateur affiche un dossier vide, et la barre d’état affiche la branche `main`.', rstudio: 'Le panneau **Files** affiche le projet, et l’onglet **Git** est apparu.' },
      explain: { vscode: 'VS Code est l’interface : il affiche le dossier et dialogue avec Git. Le dépôt, lui, est le dossier et son sous-dossier caché `.git`.', rstudio: 'RStudio a ajouté deux fichiers : `etude-entreprises.Rproj` (le projet RStudio) et `.gitignore`. Ils apparaissent dans l’onglet Git comme des fichiers nouveaux.' },
      concepts: ['ide', 'depot-local'],
      hints: [
        { vscode: 'Après un clonage, VS Code propose d’ouvrir le dossier.', rstudio: 'Le nom du projet ouvert s’affiche en haut à droite de RStudio.' },
        { vscode: 'Une notification en bas à droite, ou **File** › **Open Folder…**.', rstudio: 'Menu **Project** en haut à droite ; sinon **File** › **Open Project…**.' },
        { text: { vscode: 'Clique sur **Open** dans la notification, ou ouvre **File** › **Open Folder…** et choisis `projets/etude-entreprises`.', rstudio: 'Ouvre le projet depuis **File** › **Open Project…**.' }, targets: { vscode: ['vs.notif-open', 'vs.menu-file', 'vs.open-folder'], rstudio: ['rs.menu-file', 'rs.open-project'] } },
      ],
    },
    {
      id: 'see', title: 'Reconnaître le dépôt local', tool: 'ide',
      guide: { vscode: 'Le dossier ne contient encore aucun fichier suivi. Ouvre le terminal (**Terminal** › **New Terminal**) et tape `git remote -v`.', rstudio: 'Le dossier ne contient que les fichiers ajoutés par RStudio. Ouvre l’onglet **Terminal** (pas la Console) et tape `git remote -v`.' },
      done: (c) => c.has('remote-view'),
      result: 'Le terminal affiche `origin  https://gitlab.example.com/stagiaire/etude-entreprises.git`.',
      explain: '`origin` est le nom du **remote** : le lien entre ton dépôt local et le dépôt distant. Il a été créé par le clonage.',
      concepts: ['remote', 'depot-local'],
      hints: [
        'Le dépôt local sait où se trouve le dépôt distant : demande-le à Git.',
        { vscode: 'Explorateur à gauche ; terminal dans le panneau du bas.', rstudio: 'Panneau **Files** en bas à droite ; onglet **Terminal** en bas à gauche, à côté de **Console**.' },
        { text: { vscode: 'Ouvre le terminal et tape `git remote -v`.', rstudio: 'Ouvre l’onglet **Terminal** et tape `git remote -v`.' }, targets: { vscode: ['vs.terminal-tab', 'vs.terminal-input'], rstudio: ['rs.tab-terminal', 'rs.terminal-input'] } },
      ],
    },
    quiz('local', 'Où est mon dépôt local ?', 'Où se trouve maintenant ton dépôt local ?', [
      { id: 'a', text: 'Dans le dossier `projets/etude-entreprises` de l’environnement où Git travaille : mon poste, ou un espace distant comme Coder ou Onyxia.', correct: true, feedback: 'Exact. « Local » veut dire « là où Git travaille », pas forcément sur l’ordinateur que tu as devant toi.' },
      { id: 'b', text: 'Sur GitLab, puisque je l’ai cloné depuis GitLab.', feedback: 'GitLab garde le dépôt **distant**. Le clonage a créé une seconde copie, complète, dans ton environnement.' },
      { id: 'c', text: 'Dans l’IDE, qui le conserve en mémoire.', feedback: 'L’IDE ne fait qu’afficher un dossier. Si tu fermes l’IDE, le dépôt local reste sur le disque.' },
    ]),
  ],
  debrief: {
    summary: 'Le dépôt existe maintenant **à deux endroits** : sur GitLab (distant) et dans ton environnement (local), reliés par le remote `origin`.',
    questions: [
      { q: 'Pourquoi GitLab a-t-il demandé une authentification ?', a: 'Le projet est privé : GitLab doit savoir qui demande la copie, et vérifier que ce compte y a accès.' },
      { q: 'Pourquoi ne pas écrire le jeton dans l’URL de clonage ?', a: 'Il serait enregistré en clair dans `.git/config` et pourrait réapparaître dans des journaux ou des captures d’écran.' },
    ],
  },
};

export const m4 = {
  id: 'm4', num: 4, world: 'parcours', title: 'Enregistrer une modification', short: 'Commit',
  params: M,
  objective: 'Créer le fichier `README.md` avec un titre et une phrase qui décrit l’étude, observer le changement, le préparer, puis créer le **premier commit** avec un message descriptif.',
  why: 'Un commit enregistre une version dans l’historique **local**. Il est la condition pour pouvoir partager un changement.',
  ready: (w) => Object.values(w.ws.repos).some((r) => r.remote.url === E.httpsUrl('stagiaire', 'etude-entreprises')),
  setup(w, { ide }) { H.makeProject(w, M); const t = H.makeSavedToken(w); H.makeClone(w, M, t, ide); },
  steps: [
    {
      id: 'edit', title: 'Créer le README et l’enregistrer', tool: 'ide',
      guide: { vscode: 'Dans l’explorateur, crée un fichier `README.md` (icône **New File…**). Écris un titre, `# etude-entreprises`, puis une phrase, par exemple : « Étude fictive sur la démographie des entreprises d’un territoire. » Enregistre (**Ctrl+S**).', rstudio: 'Dans **Files**, choisis **New Blank File** › **Markdown File** et nomme-le `README.md`. Écris un titre, `# etude-entreprises`, puis une phrase, par exemple : « Étude fictive sur la démographie des entreprises d’un territoire. » Enregistre (**Ctrl+S**).' },
      done: (c) => H.fileChanged(H.repo(c), 'README.md') || H.committedFile(H.repo(c), 'README.md'),
      result: { vscode: 'Le fichier apparaît avec la lettre **U** (untracked, non suivi) dans l’explorateur et dans **Source Control**.', rstudio: 'Le fichier apparaît avec le statut **?** (non suivi) dans l’onglet **Git**.' },
      explain: 'Tu as créé un fichier dans le **répertoire de travail**. Git le voit, mais ne le suit pas encore : il n’a encore rien enregistré.',
      concepts: ['depot-local'],
      hints: [
        'Un fichier ne compte pour Git qu’une fois enregistré sur le disque.',
        { vscode: 'L’en-tête de l’explorateur propose **New File…** ; un point sur l’onglet signale un fichier non enregistré.', rstudio: 'Le panneau **Files** propose **New Blank File** ; un titre d’onglet en rouge avec * signale un fichier non enregistré.' },
        { text: 'Crée `README.md`, écris le titre et la phrase, puis appuie sur **Ctrl+S**.', targets: { vscode: ['vs.new-file', 'vs.file-README.md', 'vs.editor'], rstudio: ['rs.new-file', 'rs.files-README.md', 'rs.editor', 'rs.save'] } },
      ],
    },
    {
      id: 'diff', title: 'Observer le diff', tool: 'ide',
      guide: { vscode: 'Dans **Source Control**, clique sur `README.md` dans **Changes** : le diff s’ouvre.', rstudio: 'Dans l’onglet **Git**, sélectionne `README.md` puis **Diff** (ou **Commit**, qui ouvre la même fenêtre).' },
      done: (c) => c.has('diff-view'),
      result: 'Toutes les lignes du fichier apparaissent en vert, précédées d’un `+` : elles sont nouvelles.',
      explain: 'Le **diff** compare ton fichier à la dernière version enregistrée, ligne par ligne ; pour un nouveau fichier, tout est ajout. Au terminal, `git diff` n’affiche rien pour un fichier non suivi : après `git add`, utilise `git diff --staged`.',
      concepts: ['diff'],
      hints: [
        'Avant d’enregistrer une version, on relit ce qui a changé.',
        { vscode: 'Vue **Source Control**, section **Changes**.', rstudio: 'Onglet **Git** en haut à droite, bouton **Diff**.' },
        { text: { vscode: 'Clique sur `README.md` dans **Changes** (ou tape `git diff` dans le terminal).', rstudio: 'Sélectionne `README.md` puis clique sur **Diff** (ou tape `git diff` dans le Terminal).' }, targets: { vscode: ['vs.scm', 'vs.change-README.md'], rstudio: ['rs.tab-git', 'rs.git-diff'] } },
      ],
    },
    {
      id: 'stage', title: 'Préparer le changement', tool: 'ide',
      guide: { vscode: 'Dans **Changes**, clique sur **+** (Stage Changes) à côté de `README.md`.', rstudio: 'Coche la case **Staged** de `README.md`.' },
      done: (c) => { const r = H.repo(c); return !!r && (E.status(r).staged.some((s) => s.path === 'README.md') || H.committedFile(r, 'README.md')); },
      result: { vscode: '`README.md` passe dans la section **Staged Changes**, avec la lettre **A** (added).', rstudio: 'La case **Staged** est cochée ; le statut passe à **A** (added).' },
      explain: 'Préparer (*stage*) un changement, c’est choisir ce qui entrera dans le prochain commit. La commande équivalente est `git add README.md`.',
      concepts: ['staging'],
      hints: [
        'Un commit n’enregistre que ce qui a été préparé.',
        { vscode: 'Survole `README.md` dans **Changes** : une icône **+** apparaît (ou clic droit › **Stage Changes**).', rstudio: 'Colonne **Staged** de l’onglet Git, ou fenêtre **Review Changes** (bouton Commit).' },
        { text: { vscode: 'Clique sur **+** à droite de `README.md`.', rstudio: 'Coche **Staged** devant `README.md`.' }, targets: { vscode: ['vs.stage-README.md'], rstudio: ['rs.staged-README.md'] } },
      ],
    },
    {
      id: 'commit', title: 'Créer le commit avec un message descriptif', tool: 'ide',
      guide: { vscode: 'Écris dans la zone **Message** une phrase qui décrit le changement, puis clique sur **Commit**.', rstudio: 'Clique sur **Commit** : dans **Review Changes**, écris le message dans **Commit message**, puis **Commit**.' },
      done: (c) => { const r = H.repo(c); return !!r && E.localCommits(r) > 0 && E.messageQuality(r.commits[r.commits.length - 1].message).ok && H.committedFile(r, 'README.md'); },
      warn: (c) => {
        const r = H.repo(c);
        const f = c.ev('commit-fail').pop();
        if (f && f.reason === 'nothing-staged' && !(r && E.localCommits(r) > 0)) return 'Rien n’était préparé : prépare d’abord `README.md` (étape précédente).';
        if (r && E.localCommits(r) > 0 && !E.messageQuality(r.commits[r.commits.length - 1].message).ok) {
          return { vscode: 'Le commit existe, mais son message ne dit pas ce qui a changé. Tu peux le corriger tant qu’il n’est pas envoyé : menu **…** › **Commit** › **Commit (Amend)**, ou `git commit --amend -m "Nouveau message"` dans le terminal.', rstudio: 'Le commit existe, mais son message ne dit pas ce qui a changé. Tu peux le corriger tant qu’il n’est pas envoyé : coche **Amend previous commit** dans Review Changes, ou tape `git commit --amend -m "Nouveau message"` dans le Terminal.' };
        }
        return null;
      },
      result: 'Le commit apparaît dans l’historique local. La section des changements est vide.',
      explain: 'Le commit porte ton **identité Git** (`user.name`, `user.email`) : c’est une signature dans l’historique, pas une authentification. Un bon message dit ce que le changement apporte : « Décrit l’objectif de l’étude dans le README ».',
      concepts: ['commit', 'identite'],
      hints: [
        'Le message sera relu par d’autres (et par toi dans six mois) : il doit dire ce qui change.',
        { vscode: 'La zone **Message** en haut de **Source Control**, puis le bouton **Commit**.', rstudio: 'Bouton **Commit** de l’onglet Git : la zone **Commit message** est à droite.' },
        { text: { vscode: 'Écris par exemple « Décrit l’objectif de l’étude dans le README », puis **Commit**.', rstudio: 'Écris par exemple « Décrit l’objectif de l’étude dans le README », puis **Commit**.' }, targets: { vscode: ['vs.commit-message', 'vs.commit-button'], rstudio: ['rs.git-commit', 'rs.commit-message', 'rs.commit-button'] } },
      ],
    },
    {
      id: 'remote', title: 'Constater que GitLab n’a pas changé', tool: 'gitlab',
      guide: 'Retourne dans GitLab, sur la page du projet : le README contient-il ta phrase ? Combien de commits sont affichés ?',
      done: (c) => { const r = H.repo(c); const lc = c.ev('commit-ok').pop(); return !!(r && lc && E.ahead(r) > 0 && c.has('view', (e) => (e.page === 'project' || e.page === 'commits' || e.page === 'file') && e.n > lc.n)); },
      result: 'GitLab affiche toujours un projet vide.',
      explain: 'Ton commit n’existe que dans le **dépôt local**. Rien n’est envoyé à GitLab tant que tu ne fais pas de **push**.',
      concepts: ['depot-local', 'push'],
      hints: [
        'Compare ce que tu vois dans l’IDE et ce que montre GitLab.',
        'Onglet **GitLab** au-dessus du simulateur, puis la page du projet ou **Code** › **Commits**.',
        { text: 'Ouvre l’onglet GitLab et affiche la page du projet.', targets: ['tb.tool-gitlab', 'gl.project-link', 'gl.nav-commits'] },
      ],
    },
  ],
  debrief: {
    summary: 'Ton dépôt local contient le **premier commit** du projet ; GitLab est toujours vide. C’est normal : commit et partage sont deux gestes différents.',
    questions: [
      { q: 'Que contient ton dépôt local que GitLab n’a pas ?', a: 'Le premier commit, avec le README.' },
      { q: 'Quelle différence entre l’identité du commit et le jeton ?', a: 'L’identité (`user.name`, `user.email`) est inscrite dans le commit. Le jeton sert à s’authentifier auprès de GitLab ; il n’apparaît jamais dans l’historique.' },
    ],
  },
};

export const m5 = {
  id: 'm5', num: 5, world: 'parcours', title: 'Envoyer et vérifier', short: 'Push',
  params: M,
  objective: 'Envoyer ton commit vers GitLab (**push**), puis vérifier dans GitLab le commit, son message et le contenu du README.',
  why: 'Le push est le seul geste qui publie tes commits sur le dépôt distant.',
  ready: (w) => Object.values(w.ws.repos).some((r) => r.remote.url === E.httpsUrl('stagiaire', 'etude-entreprises') && E.ahead(r) > 0),
  setup(w, { ide }) { H.makeProject(w, M); const t = H.makeSavedToken(w); const r = H.makeClone(w, M, t, ide); H.makeLocalCommit(w, r); },
  steps: [
    {
      id: 'push', title: 'Envoyer le commit', tool: 'ide',
      guide: { vscode: 'C’est le premier envoi : la branche `main` n’existe pas encore sur GitLab. Dans **Source Control**, clique sur **Publish Branch**.', rstudio: 'C’est le premier envoi : la branche `main` n’a pas encore d’équivalent sur GitLab, et RStudio grise les boutons **Push** et **Pull** tant qu’elle n’est pas suivie. Dans l’onglet **Terminal**, tape `git push -u origin main`. Les boutons fonctionneront ensuite.' },
      done: (c) => H.remoteHasLocalHead(c),
      warn: (c) => {
        const f = c.ev('push-fail').pop();
        if (!f || H.remoteHasLocalHead(c)) return null;
        if (f.reason === 'auth') return 'GitLab refuse l’authentification. Le jeton fourni est-il bien celui de ton gestionnaire de mots de passe, et est-il encore actif ?';
        if (f.reason === 'scope') return 'Le jeton utilisé ne permet pas d’écrire (`write_repository` absent). La mission 6 explique comment corriger cela.';
        if (f.reason === 'no-upstream') return 'Git ne sait pas encore où envoyer la branche : pour ce premier envoi, précise-le avec `git push -u origin main` (`-u` enregistre la branche suivie).';
        return null;
      },
      result: { vscode: 'La branche est publiée : la barre d’état affiche `0↓ 0↑`.', rstudio: 'Le Terminal affiche `* [new branch] main -> main` puis `branch \'main\' set up to track \'origin/main\'.`' },
      explain: 'Le push envoie les commits que GitLab n’a pas encore. Ce premier push crée la branche `main` sur GitLab et l’enregistre comme branche **suivie** : les envois suivants se feront d’un simple `git push` (ou **Sync Changes**, **Push**). Git réutilise les identifiants mémorisés lors du clonage.',
      concepts: ['push', 'gestionnaire'],
      hints: [
        'Le premier envoi d’une branche demande de dire à Git où l’envoyer.',
        { vscode: 'Le bouton bleu **Publish Branch** dans Source Control, ou dans la barre d’état.', rstudio: 'L’onglet **Terminal**, en bas à gauche, à côté de la Console.' },
        { text: { vscode: 'Clique sur **Publish Branch**.', rstudio: 'Tape `git push -u origin main` dans le Terminal.' }, targets: { vscode: ['vs.publish', 'vs.status-sync'], rstudio: ['rs.tab-terminal', 'rs.terminal-input'] } },
      ],
    },
    {
      id: 'commits', title: 'Vérifier le commit dans GitLab', tool: 'gitlab',
      guide: 'Dans GitLab, ouvre **Code** › **Commits** : ton commit est-il en tête, avec ton message ?',
      done: (c) => { const ok = c.ev('push-ok').pop(); return !!ok && c.has('view', (e) => (e.page === 'commits' || e.page === 'commit') && e.n > ok.n); },
      result: 'Ton commit apparaît en premier, avec ton message et ton nom.',
      explain: 'GitLab affiche maintenant le même historique que ton dépôt local.',
      concepts: ['commit'],
      hints: [
        'L’historique se consulte dans la partie **Code** du projet.',
        'Barre latérale du projet : **Code** › **Commits**.',
        { text: 'Ouvre l’onglet GitLab, puis **Code** › **Commits**.', targets: ['tb.tool-gitlab', 'gl.nav-commits'] },
      ],
    },
    {
      id: 'content', title: 'Vérifier le contenu du README', tool: 'gitlab',
      guide: 'Ouvre la page du projet : GitLab y affiche maintenant ton `README.md`. Ta phrase y figure-t-elle ?',
      done: (c) => { const ok = c.ev('push-ok').pop(); return !!ok && c.has('view', (e) => (e.page === 'project' || (e.page === 'file' && e.file === 'README.md')) && e.n > ok.n); },
      result: 'Le projet n’est plus vide : GitLab affiche ton README, avec ta phrase.',
      explain: 'La réussite est visible des deux côtés : l’IDE n’a plus rien à envoyer, et GitLab affiche la nouvelle version.',
      concepts: ['push'],
      hints: [
        'Le README est affiché sur la page d’accueil du projet.',
        'Barre latérale : le nom du projet, ou **Code** › **Repository**, puis `README.md`.',
        { text: 'Clique sur le nom du projet dans la barre latérale.', targets: ['gl.project-link', 'gl.readme-file'] },
      ],
    },
  ],
  debrief: {
    summary: 'Ta modification a fait le trajet complet : **fichier → préparation → commit local → push → GitLab**.',
    questions: [
      { q: 'À quel moment ta modification est-elle arrivée sur GitLab ?', a: 'Au push, et seulement à ce moment-là.' },
      { q: 'Que contenait ton dépôt local avant le push ?', a: 'Le commit, que GitLab n’avait pas encore : le dépôt local avait un commit d’avance.' },
      { q: 'Qu’aurais-tu observé si tu t’étais arrêté après le commit ?', a: 'Un historique local à jour, mais un GitLab inchangé : ta collègue n’aurait rien vu.' },
    ],
  },
};

const M7 = { ns: 'stagiaire', project: 'enquete-loyers', file: 'synthese.qmd' };

export const m7 = {
  id: 'm7', num: 7, world: 'autonome', title: 'Refaire seul', short: 'Autonomie', autonomousOnly: true,
  params: M7,
  objective: 'Nouveau projet : crée sur GitLab un projet privé et vide `enquete-loyers` (case README décochée), prépare un accès adapté, clone-le dans ton environnement, ajoute un fichier `synthese.qmd` avec un titre, enregistre-le dans un commit au message descriptif, envoie-le, puis vérifie le résultat dans GitLab.',
  why: 'Même parcours, autres noms, sans consignes détaillées. Les aides restent disponibles si tu en as besoin.',
  worldOptions: { today: '2026-04-13' },
  setup() {},
  steps: [
    { id: 'p', title: 'Projet privé, créé vide', tool: 'gitlab', done: (c) => { const p = H.project(c); return !!(p && p.visibility === 'private' && H.createdEmpty(c)); },
      hints: ['Comme en mission 1.', '**+** › New project/repository › Create blank project.', { text: 'Nom `enquete-loyers`, **Private**, case README **décochée**, **Create project**.', targets: ['gl.create-new', 'gl.menu-new-project', 'gl.blank-card'] }] },
    { id: 't', title: 'Jeton limité à write_repository, valeur conservée', tool: 'gitlab', done: (c) => H.writeTokens(c).some((t) => H.minimalWrite(t) && H.savedInVault(c, t)),
      hints: ['Que dois-tu pouvoir faire ? Cloner puis envoyer.', 'Avatar › Edit profile › Access › Personal access tokens › Generate token › Legacy token.', { text: 'Coche `write_repository`, génère, copie la valeur et range-la dans **Mots de passe**.', targets: ['gl.avatar', 'gl.edit-profile', 'gl.nav-access-tokens', 'tb.vault'] }] },
    { id: 'c', title: 'Dépôt cloné et ouvert dans l’IDE', tool: 'ide', done: (c) => { const r = H.repo(c); return !!(r && c.w.ws.opened[c.ide] === r.path); },
      hints: ['L’URL HTTPS est dans le bouton **Code** du projet.', { vscode: 'Source Control › Clone Repository.', rstudio: 'File › New Project… › Version Control › Git.' }, { text: 'Colle l’URL, choisis `projets`, authentifie-toi avec le jeton, puis ouvre le projet.', targets: { vscode: ['vs.scm', 'vs.clone-button'], rstudio: ['rs.menu-file', 'rs.new-project'] } }] },
    { id: 'f', title: 'Fichier synthese.qmd créé', tool: 'ide', done: (c) => { const r = H.repo(c); return !!r && (r.work['synthese.qmd'] !== undefined || H.committedFile(r, 'synthese.qmd')); },
      hints: ['Un nouveau fichier, à la racine du projet.', { vscode: 'Explorateur : icône **New File…**', rstudio: 'Panneau Files : **New Blank File** › Quarto Doc…' }, { text: 'Crée `synthese.qmd`, écris un titre (par exemple `# Synthèse de l’enquête`) et enregistre.', targets: { vscode: ['vs.new-file'], rstudio: ['rs.new-file'] } }] },
    { id: 'k', title: 'Commit descriptif contenant synthese.qmd', tool: 'ide', done: (c) => { const r = H.repo(c); return !!r && H.committedFile(r, 'synthese.qmd') && E.messageQuality(r.commits[r.commits.length - 1].message).ok; },
      hints: ['Prépare puis commite.', { vscode: 'Source Control : **+** puis Message et **Commit**.', rstudio: 'Onglet Git : case Staged, puis Commit.' }, { text: 'Un message comme « Ajoute une première synthèse de l’enquête ».', targets: { vscode: ['vs.commit-message', 'vs.commit-button'], rstudio: ['rs.git-commit'] } }] },
    { id: 'u', title: 'Commit envoyé sur GitLab', tool: 'ide', done: (c) => { const p = H.project(c); return !!(p && p.commits.some((x) => x.tree['synthese.qmd'] !== undefined)); },
      hints: ['Un commit local n’est pas encore sur GitLab ; c’est le premier envoi de la branche.', { vscode: 'Publish Branch dans Source Control.', rstudio: 'Terminal : git push -u origin main.' }, { text: 'Envoie le commit.', targets: { vscode: ['vs.publish', 'vs.status-sync'], rstudio: ['rs.tab-terminal', 'rs.terminal-input'] } }] },
    { id: 'v', title: 'Résultat vérifié dans GitLab', tool: 'gitlab', done: (c) => { const ok = c.ev('push-ok').pop(); return !!ok && c.has('view', (e) => ['commits', 'commit', 'file', 'project'].includes(e.page) && e.n > ok.n); },
      hints: ['Le résultat se constate côté serveur.', 'Onglet GitLab : Code › Commits, ou la liste des fichiers.', { text: 'Ouvre le projet dans GitLab.', targets: ['tb.tool-gitlab', 'gl.nav-commits'] }] },
  ],
  debrief: {
    summary: 'Tu as refait seul le parcours complet : **projet, accès, clonage, modification, commit, push, vérification**.',
    questions: [
      { q: 'Explique avec tes mots, en trois ou quatre phrases, comment un fichier passe de ton environnement à GitLab.', a: 'Tu modifies ou crées le fichier et tu l’enregistres ; tu le prépares ; tu crées un commit local avec un message clair ; tu fais un push, authentifié par ton jeton ; tu vérifies le commit dans GitLab.' },
      { q: 'Quelles vérifications ferais-tu si le push échouait demain ?', a: 'L’URL du remote (`git remote -v`) ; l’état et les scopes du jeton dans GitLab ; les identifiants mémorisés ; tes droits sur le projet et la protection de la branche.' },
    ],
  },
};

export const MAIN = [m1, m2, m3, m4, m5];
