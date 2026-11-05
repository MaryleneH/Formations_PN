# Maintenance

## Principe

Tout passe par un **monde** : un objet JSON qui décrit le serveur GitLab fictif, le compte, les jetons, le presse-papiers, le gestionnaire de mots de passe, le gestionnaire d’identifiants de Git, le poste de travail et ses dépôts locaux (`assets/sim/engine/engine.js`, fonction `blankWorld`).

- Les **vues** (GitLab, VS Code, RStudio, terminal) ne modifient le monde qu’en appelant les opérations du moteur, via `app.act(fn)` (`assets/sim/ui/app.js`).
- Après chaque opération, la **progression** (`assets/sim/core/progress.js`) réévalue les étapes de la mission active à partir du monde et de son journal d’événements. Une étape validée le reste.
- Les **scénarios** (`assets/sim/scenarios/`) décrivent les missions : textes, situation de départ, prédicats de validation, aides.

Chaque mission désigne son monde (`world`). Les missions 1 à 5 partagent le monde `parcours` ; chaque exercice de dépannage et la mission 7 ont le leur. « Recommencer la mission » reconstruit le monde à partir de `setup`, sans toucher aux autres missions.

## Modifier une consigne

Les textes sont dans `assets/sim/scenarios/missions.js` (missions 1 à 5 et 7) et `diagnostics.js` (mission 6). Mise en forme autorisée : `` `code` `` et `**gras**`. Un texte propre à un IDE s’écrit `{ vscode: '…', rstudio: '…' }`.

Champs d’une étape :

| Champ | Rôle |
|---|---|
| `id`, `title` | identifiant (stable : il sert à la progression enregistrée) et titre court |
| `tool` | `'gitlab'`, `'ide'` ou `'any'` : où l’apprenant doit agir |
| `guide` | consigne détaillée (masquée en entraînement autonome) |
| `done(ctx)` | **prédicat de validation** : renvoie `true` quand l’état le prouve |
| `warn(ctx)` | remarque contextuelle (ex. : scope `api` coché, jeton perdu) |
| `result`, `explain` | résultat observable et explication, affichés après réussite |
| `software` | message reproduit du logiciel (affiché à part de l’explication) |
| `concepts` | clés de `glossary.js` à proposer à ce moment |
| `hints` | trois niveaux : indice, où regarder, `{ text, targets }` pour montrer le geste |

Une question de compréhension : `{ id, kind: 'quiz', title, question, options: [{ id, text, correct, feedback }] }`.

`ctx` fournit : `w` (le monde), `m` (paramètres de la mission), `ide`, `ev(type, pred)` et `has(type, pred)` (événements depuis le début de la mission). Les prédicats réutilisables sont dans `scenarios/helpers.js`.

## Ajouter une mission

1. Écrire l’objet mission (s’inspirer de `m4` ou de `d7`) avec `id`, `num`, `world`, `title`, `objective`, `setup(w, { ide })`, `steps`, `debrief`.
2. L’ajouter à `CATALOG` et à `GROUPS` dans `scenarios/index.js`.
3. Lancer `node --test tests/*.test.js` : le test « chaque mission démarre depuis sa situation initiale » et le contrôle des cibles s’appliquent automatiquement.

Pour la suite prévue (branches, merge requests, conflits), le moteur expose déjà `pull` (avance rapide) et `ahead` ; ajouter les opérations dans `engine.js`, les commandes dans `shell.js`, puis les écrans.

## Événements émis (lus par les prédicats)

`project-created`, `token-created`, `token-hidden`, `token-revoked`, `token-rotated`, `copy`, `vault-save`, `view` (`page`, `project`, `file`), `clone-start`, `auth-prompt`, `clone-ok` / `clone-fail` (`reason`), `open-folder`, `open-file`, `save`, `stage`, `unstage`, `discard`, `diff-view`, `status-view`, `log-view`, `remote-view`, `view-scm`, `ide-history`, `commit-ok` / `commit-fail`, `push-ok` / `push-fail` / `push-noop`, `pull-ok`, `fetch-ok`, `credential-stored`, `credential-rejected`, `credential-delete`, `config`, `clock`, `console-git`. Aucun événement ne contient de valeur de jeton.

## Cibles de « Montrer le geste »

Les éléments utiles portent un attribut `data-target`. Préfixes : `gl.` (GitLab), `vs.` (VS Code), `rs.` (RStudio), `tb.` (barre d’outils), `auth.` (demande d’identifiants), `vault.`, `cred.`, `pick.` (sélecteur de dossier), `coach.`, `top.`. Exemples : `gl.code-button`, `gl.clone-https-copy`, `gl.nav-access-tokens`, `gl.scope-write_repository`, `vs.clone-button`, `vs.stage-README.md`, `vs.sync`, `rs.new-project`, `rs.wiz-git`, `rs.staged-README.md`, `rs.git-push`, `tb.vault`. La liste complète se retrouve avec :

```bash
grep -ohE "(gl|vs|rs|tb|auth|vault|cred|pick)\.[A-Za-z0-9_.-]+" assets/sim/ui/*.js | sort -u
```

Le test `tests/scenarios.test.js` vérifie que chaque cible citée dans un scénario existe dans une vue.

## Sécurité des saisies

- `util.classifySecret` classe toute saisie destinée à un champ de jeton : seules les valeurs `DEMO-TOKEN-…` sont transmises au moteur ; les autres sont effacées sans être affichées ni stockées.
- Le gestionnaire d’identifiants simulé ne garde qu’une **référence** au jeton, jamais sa valeur.
- Le terminal masque dans son écho les jetons et les identifiants d’URL (`util.redact`), et n’est pas enregistré dans le stockage local.
- Tout texte saisi est inséré comme texte (`textContent`), jamais comme HTML.

## Mettre à jour une interface simulée

Quand GitLab, VS Code ou RStudio changent un libellé : modifier la vue concernée (`assets/sim/ui/*.js`), les textes des scénarios, la fiche `dans-mes-outils.qmd` et le tableau des versions de `a-propos.qmd`.
