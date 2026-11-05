# Git — Le bac à sable

*Prendre en main GitLab, un geste après l’autre.*

Site Quarto proposant un **bac à sable interactif** pour apprendre à connecter son environnement de travail à GitLab : créer un dépôt, préparer son accès (URL et **jeton personnel**), cloner dans **VS Code** ou **RStudio**, commiter, pousser, et diagnostiquer les erreurs fréquentes. Accompagnement individuel, en français.

> Simulation pédagogique — données fictives. Le site ne contacte aucun serveur GitLab et n’exécute aucune commande sur la machine.

## Contenu

| Page | Rôle |
|---|---|
| `index.qmd` | Accueil : les trois modalités, la reprise de session, les missions |
| `bac-a-sable.qmd` | Le simulateur (GitLab, VS Code, RStudio) |
| `dans-mes-outils.qmd` | Fiche de transfert vers les vrais outils (imprimable) |
| `glossaire.qmd` | Les notions du parcours |
| `formatrice.qmd` | Objectifs observables, débrief, points de vigilance |
| `a-propos.qmd` | Sources, versions de référence, choix techniques, limites |

Le parcours : 1. créer le dépôt distant ; 2. préparer l’accès ; 3. cloner ; 4. commiter ; 5. pousser et vérifier ; 6. neuf exercices de dépannage ; 7. refaire seul. Trois modalités (guidé, autonome, dépannage), trois niveaux d’aide (indice, où regarder, montrer le geste).

## Lancer et rendre le site

Il faut [Quarto](https://quarto.org/docs/get-started/) **1.10.20** (version fixée pour la CI). Ni R ni Python : rien n’est exécuté au rendu.

```bash
quarto preview      # aperçu en direct
quarto render       # rendu complet dans _site/
```

Le site est statique : `_site/` peut être servi par n’importe quel serveur, à la racine d’un domaine comme dans un sous-répertoire (tous les chemins sont relatifs). Les modules JavaScript ne se chargent pas en `file://` : utiliser `quarto preview` ou un petit serveur (`python3 -m http.server` dans `_site/`).

## Tester

```bash
node --test tests/*.test.js          # moteur, terminal, scénarios (Node ≥ 20, sans dépendance)
quarto render && sh tests/check-site.sh _site
node tests/e2e/run.mjs [--shots]     # parcours dans Chromium (Playwright requis)
```

Les tests de parcours servent `_site/` sous `/projet/` (comme GitLab Pages), jouent les missions 1 à 5 depuis un état vierge dans **VS Code** puis dans **RStudio**, un exercice de dépannage, la reprise et la réinitialisation, la saisie d’un faux secret, la création au clavier, et vérifient l’absence de défilement horizontal à 1368, 1440, 1024, 768 et 390 px. `--shots` enregistre des captures dans `tests/e2e/screens/` (ignoré par Git).

## Architecture

| Partie | Fichiers | Responsabilité |
|---|---|---|
| Pages | `*.qmd` | Objectifs, explications, aide-mémoire |
| Moteur | `assets/sim/engine/` | État du monde, opérations Git et GitLab, authentification, terminal (`shell.js`) |
| Progression | `assets/sim/core/progress.js` | Validation des étapes d’après l’état, reprise, réinitialisation |
| Scénarios | `assets/sim/scenarios/` | Missions, exercices de dépannage, glossaire court |
| Vues | `assets/sim/ui/` | GitLab, VS Code, RStudio, terminal, coach, barre d’outils |
| Styles | `assets/scss/theme.scss`, `assets/sim/sim.css` | Système graphique du site et du simulateur |
| Tests | `tests/` | Moteur, scénarios, site rendu, parcours navigateur |
| Documentation | `docs/` | Maintenance, publication |

Détails, ajout d’une mission et liste des cibles de « Montrer le geste » : [`docs/MAINTENANCE.md`](docs/MAINTENANCE.md).

## Publier sur GitLab Pages

Les sources sont développées et relues sur **GitHub** ; un projet **GitLab** reçoit les sources et sa pipeline (`.gitlab-ci.yml`) construit puis publie le site. Mise en place, synchronisation par un second remote et paramètres à renseigner : [`docs/PUBLICATION.md`](docs/PUBLICATION.md).

## Références et versions

Les versions des interfaces prises pour modèle (GitLab 19.5, Legacy token, VS Code, RStudio) et les documentations consultées sont détaillées dans `a-propos.qmd` (page « Sources et versions » du site).

## Crédits

- Polices : [Public Sans](https://github.com/uswds/public-sans), [Fraunces](https://github.com/undercasetype/Fraunces), [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono), licence SIL OFL 1.1 (textes dans `assets/fonts/`).
- Les interfaces simulées sont des répliques simplifiées, à but pédagogique, sans lien avec GitLab Inc., Microsoft ou Posit.
