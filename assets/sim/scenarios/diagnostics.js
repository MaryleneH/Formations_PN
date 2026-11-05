// =====================================================================
// Mission 6 — Atelier de dépannage.
// Chaque exercice démarre dans une situation problématique, avec une
// cause identifiable. Structure : observer → vérifier une hypothèse →
// identifier la cause → agir. Les messages reproduits du logiciel sont
// affichés tels quels ; l'explication pédagogique est séparée.
// =====================================================================

import * as E from '../engine/engine.js';
import * as H from './helpers.js';
import { addDays } from '../engine/util.js';

const M = { ns: 'stagiaire', project: 'etude-entreprises' };
const quiz = (id, title, question, options) => ({ id, kind: 'quiz', title, question, options, tool: 'any' });
const viewedTokensAfter = (c, type) => { const f = c.ev(type).find((e) => e.reason === 'auth' || e.reason === 'scope'); return !!f && c.has('view', (e) => e.page === 'tokens' && e.n > f.n); };

const ACCESS_DENIED = 'remote: HTTP Basic: Access denied. If a password was provided for Git authentication, the password was incorrect or you\'re required to use a token instead of a password. If a token was provided, it was either incorrect, expired, or improperly scoped.';

const hypothesesAuth = (correct, fb) => [
  { id: 'url', text: 'L’URL du dépôt est fausse.', correct: correct === 'url', feedback: fb.url || 'Une URL fausse conduirait à « not found » ou à une erreur de connexion. Ici, GitLab a bien répondu et a refusé les identifiants.' },
  { id: 'value', text: 'La valeur du jeton fournie est incorrecte.', correct: correct === 'value', feedback: fb.value || 'Possible en général, mais vérifie ce que montre la liste des jetons.' },
  { id: 'state', text: 'Le jeton n’est plus actif (expiré ou révoqué).', correct: correct === 'state', feedback: fb.state || 'La liste des jetons indique l’état de chacun : regarde-la avant de conclure.' },
  { id: 'scope', text: 'Le jeton n’a pas le scope nécessaire.', correct: correct === 'scope', feedback: fb.scope || 'La colonne Scopes de la liste permet de le vérifier.' },
];

export const d1 = {
  id: 'd1', group: 'm6', num: '6.1', world: 'd1', mode: 'depannage', title: 'Un jeton mal copié', short: 'Jeton mal copié',
  params: M,
  situation: 'Tu as créé un jeton hier et tu as recopié sa valeur **à la main** dans ton gestionnaire de mots de passe. Aujourd’hui, tu veux cloner `etude-entreprises`.',
  objective: 'Cloner le projet malgré le refus d’authentification, en identifiant la cause.',
  setup(w) {
    H.makeProject(w, M);
    const t = E.createToken(w, { name: 'poste-formation', scopes: ['write_repository'], expiresAt: addDays(w.today, 30) }).token;
    E.hideTokenValue(w);
    w.vault.push({ id: 'v-old', label: 'GitLab — poste-formation (recopié à la main)', value: t.value.slice(0, -2) + (t.value.endsWith('x') ? 'y' : 'x'), day: w.today });
    t.lost = true;
  },
  steps: [
    { id: 'observe', title: 'Reproduire le problème', tool: 'ide', guide: 'Lance le clonage avec l’URL HTTPS et le jeton de ton gestionnaire de mots de passe. Lis le message obtenu.',
      done: (c) => c.has('clone-fail', (e) => e.reason === 'auth'),
      result: 'Git affiche `HTTP Basic: Access denied` puis `Authentication failed`.',
      explain: 'Ce message **générique** a plusieurs causes possibles : valeur incorrecte, jeton expiré ou révoqué, scope insuffisant. Il faut vérifier les hypothèses une à une.',
      software: ACCESS_DENIED,
      hints: ['Commence par reproduire l’erreur pour lire le message exact.', { vscode: 'Source Control › Clone Repository.', rstudio: 'File › New Project… › Version Control › Git.' }, { text: 'Clone avec l’URL HTTPS, puis colle le jeton du gestionnaire de mots de passe.', targets: { vscode: ['vs.scm', 'vs.clone-button'], rstudio: ['rs.menu-file', 'rs.new-project'] } }] },
    { id: 'verify', title: 'Vérifier l’état du jeton dans GitLab', tool: 'gitlab', guide: 'Ouvre la liste de tes jetons personnels : état, date d’expiration, scopes.',
      done: (c) => viewedTokensAfter(c, 'clone-fail'),
      result: 'Le jeton est **actif**, n’expire que dans un mois, et porte `write_repository`.',
      explain: 'Trois hypothèses sont écartées par cette seule page : expiration, révocation, scope.',
      hints: ['La page des jetons montre leur état et leurs permissions.', 'Avatar › Edit profile › Access › Personal access tokens.', { text: 'Ouvre la page des jetons personnels.', targets: ['gl.avatar', 'gl.edit-profile', 'gl.nav-access-tokens'] }] },
    quiz('cause', 'Identifier la cause', 'Avec ce que tu as observé, quelle est la cause la plus probable ?', hypothesesAuth('value', {
      value: 'Oui : jeton actif, bon scope, URL correcte… il reste la valeur. Une copie à la main omet ou modifie facilement un caractère.',
      state: 'La liste montre un jeton **actif** qui n’expire que dans un mois : cette hypothèse est écartée.',
      scope: 'Le jeton porte `write_repository`, qui permet de cloner : hypothèse écartée.',
    })),
    { id: 'fix', title: 'Obtenir une valeur sûre et cloner', tool: 'any', guide: 'La valeur d’origine ne peut pas être réaffichée. Révoque l’ancien jeton, génère-en un nouveau, **copie** sa valeur (sans la recopier) et range-la, puis clone.',
      done: (c) => c.has('clone-ok') && c.w.tokens.some((t) => t.id === c.w.tokens[0].id && t.revokedAt),
      warn: (c) => (c.has('clone-ok') && !c.w.tokens[0].revokedAt ? 'Le clonage a réussi. Pense aussi à révoquer l’ancien jeton : sa valeur exacte n’est plus connue de personne, il n’a plus d’utilité.' : null),
      result: 'Le clonage réussit avec le nouveau jeton ; l’ancien est révoqué.',
      explain: 'Bonne pratique : toujours utiliser le bouton de copie, et révoquer un jeton devenu inutile.',
      hints: ['On ne peut pas retrouver la valeur d’origine.', 'Page des jetons : menu ⋮ › **Revoke**, puis **Generate token** › **Legacy token**.', { text: 'Révoque, génère, copie, range dans Mots de passe, puis clone.', targets: ['gl.token-actions', 'gl.generate-token', 'tb.vault'] }] },
  ],
  debrief: { summary: 'Un même message (`Access denied`) recouvre plusieurs causes. La liste des jetons a permis d’en écarter trois avant de conclure.', questions: [{ q: 'Quelle page consultes-tu en premier face à `HTTP Basic: Access denied` ?', a: 'La liste des jetons personnels : état, expiration, scopes. Puis la valeur effectivement fournie.' }] },
};

function expiredOrRevoked(kind) {
  const isExp = kind === 'expired';
  return {
    id: isExp ? 'd2' : 'd3', group: 'm6', num: isExp ? '6.2' : '6.3', world: isExp ? 'd2' : 'd3', mode: 'depannage',
    title: isExp ? 'Un jeton expiré' : 'Un jeton révoqué', short: isExp ? 'Jeton expiré' : 'Jeton révoqué',
    params: M,
    situation: isExp
      ? 'Ton projet est cloné depuis plusieurs semaines ; Git a mémorisé ton jeton. Aujourd’hui, tu as commité une modification et tu veux l’envoyer.'
      : 'Ton projet est cloné et Git a mémorisé ton jeton. La semaine dernière, après un partage d’écran, ce jeton a été révoqué par précaution. Tu veux envoyer un commit.',
    objective: 'Envoyer le commit en attente, après avoir identifié pourquoi GitLab refuse l’authentification.',
    clockHint: isExp,
    setup(w, { ide }) {
      H.makeProject(w, M);
      const t = H.makeSavedToken(w, { days: 14 });
      const r = H.makeClone(w, M, t, ide);
      H.makeLocalCommit(w, r, { append: '', message: 'Crée le README de l’étude' });
      H.markPublished(w, r);
      H.makeLocalCommit(w, r, { message: 'Précise le périmètre des entreprises étudiées' });
      if (isExp) E.advanceClock(w, 16); else { E.advanceClock(w, 6); E.revokeToken(w, t.id); E.advanceClock(w, 2); }
    },
    steps: [
      { id: 'observe', title: 'Reproduire le problème', tool: 'ide', guide: 'Lance le push et lis le message.',
        done: (c) => c.has('push-fail', (e) => e.reason === 'auth'),
        result: 'Git affiche `HTTP Basic: Access denied`. Le gestionnaire d’identifiants a effacé le jeton mémorisé.',
        explain: 'Quand GitLab refuse des identifiants mémorisés, Git demande au gestionnaire de les oublier. Au prochain essai, il les redemandera.',
        software: ACCESS_DENIED,
        hints: ['Reproduis l’erreur pour lire le message.', { vscode: 'Sync Changes, ou … › Push.', rstudio: 'Bouton Push de l’onglet Git.' }, { text: 'Lance le push.', targets: { vscode: ['vs.sync', 'vs.more', 'vs.status-sync'], rstudio: ['rs.git-push'] } }] },
      { id: 'verify', title: 'Vérifier l’état du jeton', tool: 'gitlab', guide: isExp ? 'Ouvre la liste des jetons et compare la date d’expiration à la date du scénario (barre d’outils, **Horloge**).' : 'Ouvre la liste des jetons, y compris les jetons inactifs.',
        done: (c) => viewedTokensAfter(c, 'push-fail'),
        result: isExp ? 'Le jeton figure dans les jetons **inactifs**, avec l’état **Expired**.' : 'Le jeton figure dans les jetons **inactifs**, avec l’état **Revoked**.',
        explain: isExp ? 'Un jeton expire à minuit (UTC) à sa date d’expiration. Il ne peut pas être réactivé.' : 'Un jeton révoqué est définitivement inutilisable. GitLab le garde dans la liste pour l’historique.',
        hints: ['La liste des jetons distingue les jetons actifs et inactifs.', 'Avatar › Edit profile › Access › Personal access tokens.', { text: 'Ouvre la page des jetons personnels et regarde la section des jetons inactifs.', targets: ['gl.avatar', 'gl.edit-profile', 'gl.nav-access-tokens', 'gl.inactive-tokens'] }] },
      quiz('cause', 'Identifier la cause', 'Quelle est la cause du refus ?', hypothesesAuth('state', {
        state: isExp ? 'Oui : la date du scénario a dépassé la date d’expiration.' : 'Oui : le jeton a été révoqué ; plus aucune opération ne l’accepte.',
        value: 'La valeur est celle qui fonctionnait jusqu’ici, mémorisée par Git. C’est l’état du jeton qui a changé.',
      })),
      { id: 'fix', title: 'Créer un nouveau jeton et envoyer', tool: 'any', guide: 'Génère un nouveau jeton `write_repository`, range sa valeur, puis relance le push : Git te redemandera les identifiants.',
        done: (c) => H.remoteHasLocalHead(c),
        result: 'Le push réussit avec le nouveau jeton, que Git mémorise à son tour.',
        explain: 'Choisis une durée de validité adaptée : GitLab envoie un courriel avant l’expiration (7 jours avant, et 30 et 60 jours avant sur les versions récentes).',
        hints: ['Un jeton expiré ou révoqué ne se réactive pas.', 'Generate token › Legacy token, puis Mots de passe.', { text: 'Crée un jeton `write_repository`, range-le, puis relance le push.', targets: ['gl.generate-token', 'tb.vault'] }] },
    ],
    debrief: { summary: isExp ? 'Le jeton avait atteint sa date d’expiration. Le message de Git était le même que pour une valeur incorrecte : seule la liste des jetons permettait de trancher.' : 'Le jeton avait été révoqué. Révoquer est le bon réflexe dès qu’un jeton a pu être vu par d’autres.', questions: [{ q: 'Pourquoi Git a-t-il redemandé les identifiants au second essai ?', a: 'Après le refus, Git a demandé au gestionnaire d’identifiants d’effacer le jeton mémorisé.' }] },
  };
}
export const d2 = expiredOrRevoked('expired');
export const d3 = expiredOrRevoked('revoked');

export const d4 = {
  id: 'd4', group: 'm6', num: '6.4', world: 'd4', mode: 'depannage', title: 'Un jeton perdu', short: 'Jeton perdu',
  params: M,
  situation: 'Hier, tu as généré un jeton, puis quitté la page sans copier sa valeur. Ton gestionnaire de mots de passe est vide. Tu veux cloner `etude-entreprises`.',
  objective: 'Retrouver un accès fonctionnel et cloner le projet.',
  setup(w) {
    H.makeProject(w, M);
    E.createToken(w, { name: 'poste-formation', scopes: ['write_repository'], expiresAt: addDays(w.today, 30) });
    E.hideTokenValue(w);
    E.advanceClock(w, 1);
  },
  steps: [
    { id: 'observe', title: 'Chercher la valeur dans GitLab', tool: 'gitlab', guide: 'Ouvre la liste de tes jetons. La valeur y est-elle affichée ?',
      done: (c) => c.has('view', (e) => e.page === 'tokens'),
      result: 'Le jeton est listé, actif, mais sa valeur n’apparaît nulle part.',
      explain: 'GitLab ne conserve qu’une empreinte du jeton : il peut vérifier une valeur, pas la reconstituer.',
      hints: ['La valeur n’est affichée qu’à la création.', 'Avatar › Edit profile › Access › Personal access tokens.', { text: 'Ouvre la page des jetons.', targets: ['gl.avatar', 'gl.edit-profile', 'gl.nav-access-tokens'] }] },
    quiz('cause', 'Que faire ?', 'Comment obtenir une valeur utilisable ?', [
      { id: 'a', text: 'La demander à un administrateur GitLab.', feedback: 'Personne ne peut réafficher la valeur, pas même un administrateur.' },
      { id: 'b', text: 'Créer un nouveau jeton (ou faire une rotation), et ne pas laisser l’ancien actif.', correct: true, feedback: 'Oui. La rotation crée un nouveau jeton aux mêmes permissions et désactive l’ancien ; sinon, révoque l’ancien et crée-en un nouveau.' },
      { id: 'c', text: 'Utiliser le mot de passe de mon compte à la place.', feedback: 'Sur beaucoup d’instances (authentification à deux facteurs, SSO), le mot de passe du compte n’est pas accepté par Git. Le jeton est la méthode prévue.' },
    ]),
    { id: 'fix', title: 'Nouveau jeton conservé, ancien désactivé', tool: 'gitlab', guide: 'Fais une **rotation** (⋮ › Rotate) ou révoque l’ancien et génère-en un nouveau. Copie la valeur avant de quitter l’écran et range-la.',
      done: (c) => !!c.w.tokens[0].revokedAt && H.writeTokens(c).some((t) => H.savedInVault(c, t)),
      result: 'Un nouveau jeton actif, dont la valeur est rangée ; l’ancien est inactif.',
      explain: 'Un jeton actif dont personne ne connaît la valeur ne sert à rien : mieux vaut le désactiver.',
      hints: ['Deux chemins possibles : rotation, ou révocation puis création.', 'Menu ⋮ à droite du jeton.', { text: 'Choisis ⋮ › **Rotate**, copie la nouvelle valeur, puis **Mots de passe** › Enregistrer.', targets: ['gl.token-actions', 'gl.token-copy', 'tb.vault'] }] },
    { id: 'clone', title: 'Cloner avec le nouveau jeton', tool: 'ide', guide: 'Clone le projet avec l’URL HTTPS et le nouveau jeton.',
      done: (c) => c.has('clone-ok'),
      result: 'Le dépôt local est créé.',
      hints: ['Comme en mission 3.', { vscode: 'Source Control › Clone Repository.', rstudio: 'File › New Project… › Version Control › Git.' }, { text: 'Lance le clonage.', targets: { vscode: ['vs.scm', 'vs.clone-button'], rstudio: ['rs.menu-file', 'rs.new-project'] } }] },
  ],
  debrief: { summary: 'Une valeur de jeton perdue ne se retrouve pas : on en crée une nouvelle. Le réflexe : copier et ranger **avant** de quitter l’écran de création.', questions: [{ q: 'Où ranges-tu la valeur d’un jeton dans tes vrais outils ?', a: 'Dans un gestionnaire de mots de passe, ou directement dans le gestionnaire d’identifiants au moment où Git la demande. Jamais dans un fichier du projet.' }] },
};

export const d5 = {
  id: 'd5', group: 'm6', num: '6.5', world: 'd5', mode: 'depannage', title: 'Lecture seule : clonage réussi, push refusé', short: 'Push refusé (scope)',
  params: M,
  situation: 'Tu as cloné le projet avec un jeton créé « pour consulter ». Tu as ensuite commité une modification. Le push échoue.',
  objective: 'Envoyer le commit, avec un accès adapté à cet objectif.',
  setup(w, { ide }) {
    H.makeProject(w, M);
    const t = H.makeSavedToken(w, { name: 'consultation', scopes: ['read_repository'] });
    const r = H.makeClone(w, M, t, ide);
    H.makeLocalCommit(w, r, { append: '', message: 'Crée le README de l’étude' });
    H.markPublished(w, r);
    H.makeLocalCommit(w, r, { message: 'Ajoute la source des données dans le README' });
  },
  steps: [
    { id: 'observe', title: 'Reproduire le problème', tool: 'ide', guide: 'Lance le push et lis le message.',
      done: (c) => c.has('push-fail', (e) => e.reason === 'scope'),
      result: 'GitLab répond `You are not allowed to upload code.` (erreur 403).',
      explain: 'Ce n’est pas `Access denied` : l’authentification a réussi. C’est l’**autorisation** qui manque pour écrire.',
      software: "remote: You are not allowed to upload code.\nfatal: unable to access 'https://gitlab.example.com/stagiaire/etude-entreprises.git/': The requested URL returned error: 403",
      hints: ['Reproduis l’erreur.', { vscode: 'Sync Changes, ou … › Push.', rstudio: 'Push.' }, { text: 'Lance le push.', targets: { vscode: ['vs.sync', 'vs.more', 'vs.status-sync'], rstudio: ['rs.git-push'] } }] },
    { id: 'verify', title: 'Vérifier les scopes du jeton', tool: 'gitlab', guide: 'Dans la liste des jetons, lis la colonne des scopes du jeton utilisé.',
      done: (c) => viewedTokensAfter(c, 'push-fail'),
      result: 'Le jeton « consultation » porte seulement `read_repository`.',
      hints: ['Que permet exactement ce jeton ?', 'Page des jetons personnels, colonne Scopes.', { text: 'Ouvre la page des jetons.', targets: ['gl.avatar', 'gl.edit-profile', 'gl.nav-access-tokens'] }] },
    quiz('cause', 'Identifier la cause', 'Pourquoi le clonage a-t-il réussi et le push échoué ?', [
      { id: 'a', text: '`read_repository` autorise la lecture (clonage) mais pas l’écriture (push).', correct: true, feedback: 'Exact. Le jeton t’authentifie, mais ses permissions s’arrêtent à la lecture.' },
      { id: 'b', text: 'Le jeton a expiré entre le clonage et le push.', feedback: 'Un jeton expiré provoquerait `HTTP Basic: Access denied`. Ici le message parle d’upload : l’authentification a réussi.' },
      { id: 'c', text: 'Mon compte n’a pas le droit d’écrire dans ce projet.', feedback: 'Tu es propriétaire (Owner) de ce projet. Le message indique que c’est le jeton qui ne permet pas l’envoi.' },
    ]),
    { id: 'token', title: 'Créer un jeton adapté', tool: 'gitlab', guide: 'Génère un jeton `write_repository` et range sa valeur.',
      done: (c) => H.writeTokens(c).some((t) => H.savedInVault(c, t)),
      hints: ['L’objectif est maintenant d’écrire.', 'Generate token › Legacy token.', { text: 'Coche `write_repository`, génère, copie, range.', targets: ['gl.generate-token', 'tb.vault'] }] },
    { id: 'forget', title: 'Faire oublier l’ancien jeton à Git', tool: 'any', guide: 'Git a mémorisé le jeton en lecture seule et le réutilise. Ouvre **Identifiants** (barre d’outils) et supprime l’entrée de `gitlab.example.com`.',
      done: (c) => !c.w.credentials.some((x) => { const t = c.w.tokens.find((k) => k.id === x.tokenId); return t && !t.scopes.includes('write_repository'); }),
      result: 'Le gestionnaire d’identifiants ne contient plus le jeton en lecture seule.',
      explain: 'Un refus 403 n’efface pas les identifiants mémorisés (contrairement à un refus d’authentification). Il faut le faire soi-même, avec l’outil propre à son système.',
      concepts: ['gestionnaire'],
      hints: ['Sinon, Git renverra toujours le même jeton.', '**Identifiants** dans la barre d’outils du bac à sable.', { text: 'Ouvre Identifiants et supprime l’entrée.', targets: ['tb.credentials', 'cred.delete'] }] },
    { id: 'push', title: 'Envoyer le commit', tool: 'ide', guide: 'Relance le push et fournis le nouveau jeton quand Git le demande.',
      done: (c) => H.remoteHasLocalHead(c),
      hints: ['Relance le push.', { vscode: 'Sync Changes, ou … › Push.', rstudio: 'Push.' }, { text: 'Push, puis Username et nouveau jeton.', targets: { vscode: ['vs.sync', 'vs.more', 'vs.status-sync'], rstudio: ['rs.git-push'] } }] },
  ],
  debrief: { summary: '**Authentification** réussie, **autorisation** insuffisante : le jeton ne permettait que la lecture. Et Git réutilisait ce jeton tant qu’on ne lui faisait pas oublier.', questions: [{ q: 'Quel scope choisir pour cloner puis pousser ?', a: '`write_repository`, qui inclut la lecture.' }] },
};

export const d6 = {
  id: 'd6', group: 'm6', num: '6.6', world: 'd6', mode: 'depannage', title: 'Une URL SSH dans un parcours HTTPS', short: 'URL SSH',
  params: M,
  situation: 'Tu as copié l’adresse du projet dans GitLab, puis lancé le clonage. Ton jeton est prêt dans le gestionnaire de mots de passe.',
  objective: 'Cloner le projet en HTTPS.',
  setup(w) {
    H.makeProject(w, M);
    H.makeSavedToken(w);
    E.copy(w, { kind: 'url', text: E.sshUrl('stagiaire', 'etude-entreprises'), source: 'gitlab' });
    w.events = [];
  },
  steps: [
    { id: 'observe', title: 'Reproduire le problème', tool: 'ide', guide: 'Lance le clonage avec l’adresse présente dans le presse-papiers.',
      done: (c) => c.has('clone-fail', (e) => e.reason === 'ssh'),
      result: 'Git affiche `Permission denied (publickey)` sans avoir demandé de jeton.',
      software: `git@gitlab.example.com: Permission denied (publickey).\nfatal: Could not read from remote repository.`,
      explain: 'Une URL `git@…` utilise le protocole **SSH**, qui s’authentifie avec une **clé**, pas avec un jeton. Aucune clé n’est configurée ici.',
      hints: ['Commence par regarder l’adresse utilisée.', 'Le presse-papiers est affiché dans la barre d’outils.', { text: 'Lance le clonage et observe l’adresse.', targets: { vscode: ['tb.clipboard', 'vs.scm', 'vs.clone-button'], rstudio: ['tb.clipboard', 'rs.menu-file', 'rs.new-project'] } }] },
    quiz('cause', 'Identifier la cause', 'Pourquoi Git n’a-t-il même pas demandé le jeton ?', [
      { id: 'a', text: 'L’adresse est une URL SSH : Git cherche une clé SSH, pas un jeton.', correct: true, feedback: 'Exact. Pour utiliser un jeton, il faut l’URL **HTTPS** (`https://…`).' },
      { id: 'b', text: 'Le jeton est expiré.', feedback: 'Git n’a pas utilisé de jeton du tout : la connexion SSH a échoué avant.' },
      { id: 'c', text: 'Le projet n’existe pas.', feedback: 'Le message parle de clé publique (`publickey`), pas de projet introuvable.' },
    ]),
    { id: 'fix', title: 'Cloner avec l’URL HTTPS', tool: 'any', guide: 'Retourne dans GitLab, bouton **Code** › **Clone with HTTPS**, puis clone avec cette adresse.',
      done: (c) => c.has('clone-ok'),
      hints: ['Il te faut l’autre adresse.', 'Bouton **Code** du projet.', { text: 'Copie **Clone with HTTPS**, puis relance le clonage.', targets: ['tb.tool-gitlab', 'gl.code-button', 'gl.clone-https-copy'] }] },
  ],
  debrief: { summary: 'Le protocole se lit dans l’URL : `https://` → jeton ; `git@` → clé SSH.', questions: [{ q: 'Où retrouver l’URL HTTPS d’un projet ?', a: 'Sur la page du projet, bouton **Code**, ligne **Clone with HTTPS**.' }] },
};

export const d7 = {
  id: 'd7', group: 'm6', num: '6.7', world: 'd7', mode: 'depannage', title: 'Un commit qui n’est pas sur GitLab', short: 'Commit non poussé',
  params: M,
  situation: 'Tu as modifié le README et « enregistré » ta modification. Une collègue te dit qu’elle ne la voit pas sur GitLab.',
  objective: 'Comprendre où se trouve ta modification, puis la rendre visible sur GitLab.',
  setup(w, { ide }) {
    H.makeProject(w, M);
    const t = H.makeSavedToken(w);
    const r = H.makeClone(w, M, t, ide);
    H.makeLocalCommit(w, r, { append: '', message: 'Crée le README de l’étude' });
    H.markPublished(w, r);
    H.makeLocalCommit(w, r, { message: 'Ajoute le calendrier de l’étude' });
  },
  steps: [
    { id: 'gitlab', title: 'Observer GitLab', tool: 'gitlab', guide: 'Regarde l’historique des commits du projet dans GitLab.',
      done: (c) => c.has('view', (e) => e.page === 'commits' || e.page === 'project'),
      result: 'GitLab n’affiche que le commit **Crée le README de l’étude**, pas ta modification.',
      hints: ['Que voit ta collègue ?', 'Code › Commits.', { text: 'Ouvre l’historique du projet.', targets: ['gl.project-link', 'gl.nav-commits'] }] },
    { id: 'local', title: 'Observer le dépôt local', tool: 'ide', guide: { vscode: 'Regarde la barre d’état (↑) ou tape `git status` dans le terminal.', rstudio: 'Regarde l’onglet Git (« Your branch is ahead… ») ou tape `git status` dans le Terminal.' },
      done: (c) => c.has('status-view') || c.has('log-view') || c.has('view-scm') || c.has('ide-history'),
      result: '`Your branch is ahead of \'origin/main\' by 1 commit.`',
      hints: ['Ton dépôt local sait combien de commits GitLab n’a pas.', { vscode: 'Indicateur ↑1 dans la barre d’état, ou `git status`.', rstudio: 'Onglet Git, ou `git status` dans le Terminal.' }, { text: 'Tape `git status` dans le terminal.', targets: { vscode: ['vs.terminal-tab', 'vs.terminal-input'], rstudio: ['rs.tab-terminal', 'rs.terminal-input'] } }] },
    quiz('cause', 'Identifier la cause', 'Pourquoi ta collègue ne voit-elle pas ta modification ?', [
      { id: 'a', text: 'Le commit existe seulement dans mon dépôt local : il n’a pas été envoyé (push).', correct: true, feedback: 'Exact. Un commit est local tant qu’on ne l’envoie pas.' },
      { id: 'b', text: 'Ma collègue n’a pas les droits pour voir mon commit.', feedback: 'GitLab n’affiche le commit à personne : il ne l’a jamais reçu.' },
      { id: 'c', text: 'Le fichier n’a pas été enregistré.', feedback: 'Le fichier a été enregistré et commité : `git status` le confirme. C’est l’envoi qui manque.' },
    ]),
    { id: 'push', title: 'Envoyer et vérifier', tool: 'any', guide: 'Fais le push, puis vérifie l’historique dans GitLab.',
      done: (c) => { const ok = c.ev('push-ok').pop(); return !!ok && c.has('view', (e) => (e.page === 'commits' || e.page === 'project' || e.page === 'commit') && e.n > ok.n); },
      hints: ['Le geste manquant.', { vscode: 'Sync Changes.', rstudio: 'Push.' }, { text: 'Push, puis Code › Commits dans GitLab.', targets: { vscode: ['vs.sync', 'vs.status-sync', 'tb.tool-gitlab'], rstudio: ['rs.git-push', 'tb.tool-gitlab'] } }] },
  ],
  debrief: { summary: '« Enregistrer » peut désigner trois gestes : enregistrer le fichier, commiter, pousser. Seul le dernier rend le travail visible sur GitLab.', questions: [{ q: 'Quelle commande montre qu’un commit attend d’être envoyé ?', a: '`git status` : « Your branch is ahead of \'origin/main\' by 1 commit ».' }] },
};

export const d8 = {
  id: 'd8', group: 'm6', num: '6.8', world: 'd8', mode: 'depannage', title: 'Identité Git non configurée', short: 'Identité absente',
  params: M,
  situation: 'Tu travailles dans un **nouvel environnement** (par exemple un nouveau service Onyxia). Le projet, vide, est cloné ; tu viens de créer `README.md` et de le préparer. Tu crées ton premier commit.',
  objective: 'Créer le commit, après avoir identifié ce qui manque.',
  worldOptions: { noIdentity: true, host: 'vscode-onyxia-7f3c' },
  setup(w, { ide }) {
    H.makeProject(w, M);
    const t = H.makeSavedToken(w);
    const r = H.makeClone(w, M, t, ide);
    E.writeFile(w, r.path, 'README.md', '# etude-entreprises\n\nDonnées : fichier fictif d’entreprises (2025).\n');
    E.stage(w, r.path, ['README.md']);
  },
  steps: [
    { id: 'observe', title: 'Reproduire le problème', tool: 'ide', guide: 'Écris un message et lance le commit.',
      done: (c) => c.has('commit-fail', (e) => e.reason === 'identity'),
      result: 'Git refuse : `Author identity unknown`.',
      software: 'Author identity unknown\n\n*** Please tell me who you are.\n\nRun\n\n  git config --global user.email "you@example.com"\n  git config --global user.name "Your Name"',
      hints: ['Reproduis l’erreur.', { vscode: 'Message puis Commit.', rstudio: 'Commit, puis Review Changes.' }, { text: 'Lance le commit.', targets: { vscode: ['vs.commit-message', 'vs.commit-button'], rstudio: ['rs.git-commit'] } }] },
    quiz('cause', 'Identifier la cause', 'Que manque-t-il ?', [
      { id: 'a', text: 'Le nom et l’adresse à inscrire dans le commit (`user.name`, `user.email`).', correct: true, feedback: 'Oui. Ce n’est pas une question d’accès à GitLab : le commit est local et ne contacte aucun serveur.' },
      { id: 'b', text: 'Un jeton d’accès valide.', feedback: 'Un commit ne contacte pas GitLab : aucun jeton n’intervient. Le jeton sert au clonage, au pull et au push.' },
      { id: 'c', text: 'Les droits d’écriture sur le projet GitLab.', feedback: 'Les droits sur GitLab ne comptent qu’au push. Le commit, lui, est local.' },
    ]),
    { id: 'config', title: 'Configurer l’identité', tool: 'ide', guide: 'Dans le terminal, tape `git config --global user.name "Prénom Nom"` puis `git config --global user.email "adresse@example.com"`.',
      done: (c) => !!(E.getConfig(c.w, 'user.name') && E.getConfig(c.w, 'user.email')),
      explain: 'Utilise l’adresse associée à ton compte GitLab : GitLab relie alors tes commits à ton profil. `--global` s’applique à tous les dépôts de cet environnement.',
      concepts: ['identite'],
      hints: ['Deux réglages de configuration.', { vscode: 'Terminal du panneau du bas.', rstudio: 'Onglet **Terminal** (pas la Console R).' }, { text: 'Tape les deux commandes `git config --global …`.', targets: { vscode: ['vs.terminal-tab', 'vs.terminal-input'], rstudio: ['rs.tab-terminal', 'rs.terminal-input'] } }] },
    { id: 'commit', title: 'Créer le commit', tool: 'ide', guide: 'Relance le commit.',
      done: (c) => c.has('commit-ok'),
      hints: ['Même geste qu’au début.', { vscode: 'Commit.', rstudio: 'Commit.' }, { text: 'Relance le commit.', targets: { vscode: ['vs.commit-button'], rstudio: ['rs.git-commit'] } }] },
  ],
  debrief: { summary: 'Trois notions distinctes : l’**identité** du commit (qui l’a écrit), l’**authentification** (le jeton, qui te fait reconnaître par GitLab), l’**autorisation** (ce que tu as le droit de faire).', questions: [{ q: 'L’identité Git suffit-elle pour pousser ?', a: 'Non : le push demande aussi une authentification (le jeton) et une autorisation (droits du compte et permissions du jeton).' }] },
};

export const d9 = {
  id: 'd9', group: 'm6', num: '6.9', world: 'd9', mode: 'depannage', title: 'Authentifié, mais refusé par le projet', short: 'Branche protégée',
  params: { ns: 'equipe-stats', project: 'etude-entreprises' },
  situation: 'Tu participes au projet d’équipe `equipe-stats/etude-entreprises`. Ton jeton est valide, le clonage a réussi, tu as commité sur `main`. Le push échoue.',
  objective: 'Identifier pourquoi le push est refusé, et choisir la bonne suite.',
  setup(w, { ide }) {
    const m = { ns: 'equipe-stats', project: 'etude-entreprises' };
    H.makeProject(w, m, { readme: true, members: { stagiaire: 'Developer', 'responsable-stats': 'Maintainer' }, protectedBranches: { main: { push: 'Maintainer' } } });
    const t = H.makeSavedToken(w);
    const r = H.makeClone(w, m, t, ide);
    H.makeLocalCommit(w, r, { message: 'Ajoute la liste des variables de l’étude' });
  },
  steps: [
    { id: 'observe', title: 'Reproduire le problème', tool: 'ide', guide: 'Lance le push et lis le message.',
      done: (c) => c.has('push-fail', (e) => e.reason === 'protected'),
      result: 'GitLab refuse : `You are not allowed to push code to protected branches on this project.`',
      software: 'remote: GitLab: You are not allowed to push code to protected branches on this project.\n ! [remote rejected] main -> main (pre-receive hook declined)',
      explain: 'L’authentification a réussi et le jeton permet d’écrire : c’est une règle du **projet** qui refuse l’envoi.',
      hints: ['Reproduis l’erreur.', { vscode: 'Sync Changes, ou … › Push.', rstudio: 'Push.' }, { text: 'Lance le push.', targets: { vscode: ['vs.sync', 'vs.more', 'vs.status-sync'], rstudio: ['rs.git-push'] } }] },
    { id: 'verify', title: 'Vérifier ton rôle et la protection de main', tool: 'gitlab', guide: 'Dans le projet : **Manage** › **Members** (ton rôle) et **Settings** › **Repository** › **Protected branches**.',
      done: (c) => c.has('view', (e) => e.page === 'members') && c.has('view', (e) => e.page === 'protected'),
      result: 'Ton rôle est **Developer** ; `main` n’accepte de push que des **Maintainers**.',
      hints: ['Deux informations : ton rôle, la règle de la branche.', 'Barre latérale du projet : Manage › Members ; Settings › Repository.', { text: 'Ouvre ces deux pages.', targets: ['gl.nav-members', 'gl.nav-protected'] }] },
    quiz('cause', 'Identifier la cause', 'Quelle est la cause ?', [
      { id: 'a', text: 'La branche `main` est protégée : mon rôle (Developer) ne permet pas d’y pousser directement.', correct: true, feedback: 'Exact. Authentification et permissions du jeton sont correctes ; c’est l’autorisation sur le projet qui bloque.' },
      { id: 'b', text: 'Mon jeton n’a pas le scope `write_repository`.', feedback: 'Le message serait alors « You are not allowed to upload code ». Ici, il parle de branches protégées.' },
      { id: 'c', text: 'Mon jeton est expiré.', feedback: 'Le message serait `HTTP Basic: Access denied`. GitLab t’a reconnu.' },
    ]),
    quiz('next', 'Choisir la suite', 'Que fais-tu ?', [
      { id: 'a', text: 'Créer un jeton avec le scope `api` pour avoir plus de droits.', feedback: 'Les permissions d’un jeton ne dépassent jamais les droits du compte. Et `api` n’est pas nécessaire pour Git.' },
      { id: 'b', text: 'Pousser mon travail sur une autre branche et proposer une merge request, ou en parler à un Maintainer.', correct: true, feedback: 'Oui. C’est le fonctionnement prévu par l’équipe ; les branches et les merge requests feront l’objet de la suite du parcours.' },
      { id: 'c', text: 'Forcer le push (`git push --force`).', feedback: 'Un push forcé est aussi refusé sur une branche protégée, et il réécrit l’historique partagé.' },
    ]),
  ],
  debrief: { summary: 'Être reconnu (authentification) ne suffit pas : il faut aussi le droit d’effectuer l’opération (autorisation). Ce droit dépend de ton rôle et des règles du projet, pas du jeton.', questions: [{ q: 'Un jeton peut-il donner plus de droits que ton compte ?', a: 'Non. Il ne peut que les restreindre.' }] },
};

const FOLDER = '/home/stagiaire/projets/etude-entreprises';
const pushedNew = (c) => {
  const f = c.w.ws.repos[FOLDER];
  if (!f || !f.remote || !f.commits.length) return false;
  const u = E.parseRepoUrl(f.remote.url);
  const p = E.getProject(c.w, u.ns, u.path);
  return !!(p && p.commits.length && p.commits[p.commits.length - 1].id === f.commits[f.commits.length - 1].id);
};

export const d10 = {
  id: 'd10', group: 'm6', num: '6.10', world: 'd10', mode: 'depannage', title: 'Un README de trop', short: 'Historiques sans lien',
  params: M, worldOptions: { host: 'vscode-onyxia-4b2e' },
  situation: 'Ton étude existait déjà dans ton pod. Tu as créé le projet GitLab `etude-entreprises` en laissant la case README cochée, puis initialisé ton dossier, ajouté le remote et créé ton premier commit. Le premier push échoue.',
  objective: 'Comprendre pourquoi le push est refusé, puis envoyer ton travail vers un projet vide.',
  setup(w, { ide }) {
    H.makeProject(w, M, { readme: true });
    H.makeSavedToken(w);
    const f = E.makeFolder(w, FOLDER, { 'rapport.qmd': '---\ntitle: "Démographie des entreprises"\n---\n\nÉtude fictive.\n', 'analyse.R': 'table(donnees$naf)\n' }, { rstudio: ide === 'rstudio' });
    w.ws.opened.vscode = FOLDER; w.ws.opened.rstudio = FOLDER; w.ws.cwd = FOLDER;
    E.initRepo(w, FOLDER);
    E.addRemote(w, FOLDER, 'origin', E.httpsUrl('stagiaire', 'etude-entreprises'));
    E.stageAll(w, FOLDER);
    E.commit(w, FOLDER, { message: 'Ajoute le rapport et le script d’analyse' });
  },
  steps: [
    { id: 'observe', title: 'Reproduire le problème', tool: 'ide', guide: { vscode: 'Lance le premier push (**Publish Branch**) et lis le message.', rstudio: 'Dans l’onglet **Terminal**, tape `git push -u origin main` et lis le message.' },
      done: (c) => c.has('push-fail', (e) => e.reason === 'non-fast-forward'),
      result: 'Git refuse : `! [rejected] main -> main (fetch first)`.',
      software: " ! [rejected]        main -> main (fetch first)\nerror: failed to push some refs to 'https://gitlab.example.com/stagiaire/etude-entreprises.git'\nhint: Updates were rejected because the remote contains work that you do not\nhint: have locally.",
      explain: 'L’authentification a réussi. Git refuse parce que la branche `main` de GitLab contient un commit que ton dépôt n’a pas.',
      hints: ['Reproduis l’erreur.', { vscode: 'Publish Branch dans Source Control.', rstudio: 'Terminal : git push -u origin main.' }, { text: 'Lance le push.', targets: { vscode: ['vs.scm', 'vs.publish', 'vs.status-sync'], rstudio: ['rs.tab-terminal', 'rs.terminal-input'] } }] },
    { id: 'verify', title: 'Regarder ce que contient GitLab', tool: 'gitlab', guide: 'Ouvre la page du projet et son historique (**Code** › **Commits**).',
      done: (c) => { const f = c.ev('push-fail').pop(); return !!f && c.has('view', (e) => (e.page === 'commits' || e.page === 'project') && e.n > f.n); },
      result: 'GitLab contient un commit **Initial commit** avec un `README.md`, que ton dépôt local n’a jamais eu.',
      hints: ['Que contient déjà le dépôt distant ?', 'Code › Commits du projet.', { text: 'Ouvre l’historique du projet.', targets: ['tb.tool-gitlab', 'gl.project-link', 'gl.nav-commits'] }] },
    { id: 'cause', kind: 'quiz', tool: 'any', title: 'Identifier la cause', question: 'Pourquoi le push est-il refusé ?', options: [
      { id: 'a', text: 'Le projet a été créé avec un README : GitLab a un historique sans lien avec le mien, et Git refuse d’écraser ce commit.', correct: true, feedback: 'Exact. Deux historiques indépendants : Git ne les mélange pas tout seul.' },
      { id: 'b', text: 'Mon jeton n’a pas le droit d’écrire.', feedback: 'Ce serait « You are not allowed to upload code » (403). Ici GitLab t’a reconnu et autorisé.' },
      { id: 'c', text: 'Il faut forcer le push (`git push --force`).', feedback: 'Cela effacerait le commit de GitLab. Sur un vrai projet partagé, c’est dangereux, et souvent interdit sur `main`.' },
    ] },
    { id: 'fix', title: 'Envoyer vers un projet vide', tool: 'any', guide: 'Crée sur GitLab un projet **vide** (case README décochée), par exemple `etude-entreprises-v2`. Puis change l’adresse du remote : `git remote set-url origin <URL HTTPS du nouveau projet>`, et refais `git push -u origin main`.',
      done: pushedNew,
      result: 'Le push réussit vers le projet vide : ton historique y est seul.',
      explain: 'Autre solution, hors de ce parcours : récupérer le README avec `git pull origin main --allow-unrelated-histories`, puis pousser. Le plus simple reste de ne pas cocher la case quand le travail existe déjà.',
      concepts: ['remote'],
      hints: ['Il faut un dépôt distant sans historique, et dire à Git sa nouvelle adresse.', 'GitLab : Create blank project (case décochée). Puis Terminal : git remote set-url origin <URL>.', { text: 'Crée le projet vide, copie son URL HTTPS, puis `git remote set-url origin <URL>` et `git push -u origin main`.', targets: ['tb.tool-gitlab', 'gl.create-new', 'gl.code-button'] }] },
  ],
  debrief: { summary: 'Un README créé par GitLab est un commit. Pour envoyer un travail **existant**, le projet doit être **vide** ; pour **démarrer de zéro**, le README est utile et on clone.', questions: [{ q: 'Comment éviter cette situation ?', a: 'Choisir le bon parcours à la création : case décochée si le travail existe déjà dans le pod.' }] },
};

export const DIAGNOSTICS = [d1, d2, d3, d4, d5, d6, d7, d8, d9, d10];
