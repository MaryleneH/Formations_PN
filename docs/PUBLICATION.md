# Publication sur GitHub Pages

Les sources sont développées et relues dans ce dépôt GitHub (`MaryleneH/Formations_PN`) ; le site est publié avec **GitHub Pages**, par GitHub Actions.

Adresse du site : <https://maryleneh.github.io/Formations_PN/>

## Ce qui se passe à chaque push sur `main`

Le workflow `.github/workflows/publish.yml` :

1. lance les tests du moteur (`node --test tests/*.test.js`) ;
2. installe Quarto **1.10.20** et rend le site (`quarto render`) ;
3. contrôle le site rendu (`tests/check-site.sh`) : pages présentes, aucun chemin absolu, aucune ressource externe ;
4. déploie `_site/` sur GitHub Pages.

Il peut aussi être lancé à la main : onglet **Actions** › **Publier le site sur GitHub Pages** › **Run workflow**.

Le workflow `.github/workflows/tests.yml` ajoute, sur chaque push et chaque pull request, les parcours dans un vrai navigateur (Playwright).

## Réglage à faire une fois

**Settings › Pages › Build and deployment › Source : *GitHub Actions***. Le workflow tente aussi de l'activer lui-même au premier passage (`configure-pages` avec `enablement: true`).

## Chemins

GitHub Pages publie le site dans un sous-répertoire (`/Formations_PN/`). Tous les chemins du site sont relatifs, ce que vérifient `tests/check-site.sh` et `tests/e2e/run.mjs` (site servi sous `/projet/`).

## Vérifier une publication

**Actions** : les jobs `rendre` et `deployer` sont verts ; le lien du site apparaît dans le job `deployer` et dans **Settings › Pages**.
