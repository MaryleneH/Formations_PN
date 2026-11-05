# Publication : GitHub (sources) → GitLab Pages (site)

## Organisation

1. Les sources sont développées et relues dans le dépôt **GitHub** (`MaryleneH/Formations_PN`), par pull requests.
2. Un projet **GitLab** reçoit les sources à publier (copie de la branche `main`).
3. Sa pipeline (`.gitlab-ci.yml`) teste, rend le site avec Quarto et le publie avec **GitLab Pages**.

## Prérequis côté GitLab

| Élément | Exigence |
|---|---|
| Version de GitLab | **17.9 ou plus récente** (`pages.publish` sous le mot-clé `pages`). La version de référence du parcours est 19.5. |
| GitLab Pages | Activé sur l’instance (administrateur, pour GitLab Self-Managed). |
| Runner | Exécuteur Docker (ou Kubernetes) capable de récupérer `ghcr.io/quarto-dev/quarto:1.10.20` et `node:22-bookworm-slim`. |
| Droits | Maintainer du projet GitLab (pour pousser sur `main` et régler la visibilité de Pages). |

Les deux images ont été vérifiées dans leurs registres le 5 novembre 2026. Si le runner n’accède pas à `ghcr.io`, voir « Variante sans image Quarto » plus bas.

## Paramètres à renseigner

| Paramètre | Où | Valeur |
|---|---|---|
| URL du projet GitLab | remote `gitlab` (ci-dessous) | `https://<votre-gitlab>/<groupe>/<projet>.git` |
| URL publique du site | `_quarto.yml` › `website.site-url` (commenté) | affichée dans **Deploy › Pages** après la première publication |
| Visibilité du site | **Deploy › Pages** (contrôle d’accès, si l’instance le propose) | selon votre besoin |
| Branche publiée | `.gitlab-ci.yml` : `$CI_DEFAULT_BRANCH` | `main` par défaut |

Le site fonctionne **à la racine d’un domaine comme dans un sous-répertoire** (`https://<groupe>.<domaine-pages>/<projet>/`) : tous les chemins sont relatifs, ce que vérifient `tests/check-site.sh` (en CI) et `tests/e2e/run.mjs` (servi sous `/projet/`).

## Synchroniser par un second remote

Une fois, dans le clone local du dépôt GitHub :

```bash
git remote add gitlab https://<votre-gitlab>/<groupe>/<projet>.git
git remote -v
```

À chaque publication (après merge sur GitHub) :

```bash
git switch main
git pull origin main
git push gitlab main
```

Git demande un jeton GitLab (`write_repository`) ; c’est exactement le geste enseigné par le bac à sable.

Une automatisation pourra être ajoutée ensuite, selon les possibilités de l’instance : *pull mirroring* du projet GitLab depuis GitHub (selon l’offre), ou job GitHub Actions poussant vers GitLab avec un jeton de projet stocké en secret.

## Ce que fait la pipeline

| Job | Quand | Rôle |
|---|---|---|
| `moteur` | toutes les branches, merge requests | `node --test tests/*.test.js` |
| `rendu` | branches autres que `main`, merge requests | `quarto render` + `tests/check-site.sh` |
| `publier-site` | branche par défaut seulement | `quarto render` + contrôles, publication de `_site` via `pages.publish` |

Pour vérifier après un push : **Build › Pipelines** (jobs verts), puis **Deploy › Pages** (adresse du site).

## Variante sans image Quarto

Si `ghcr.io` n’est pas joignable, remplacer l’image des jobs `rendu` et `publier-site` par une Debian et installer le paquet officiel de la même version :

```yaml
  image: debian:bookworm-slim
  before_script:
    - apt-get update && apt-get install -y --no-install-recommends curl ca-certificates
    - curl -fsSL -o /tmp/quarto.deb https://github.com/quarto-dev/quarto-cli/releases/download/v1.10.20/quarto-1.10.20-linux-amd64.deb
    - apt-get install -y /tmp/quarto.deb
```

## État au moment de la livraison

- Site rendu et testé localement (Quarto 1.10.20) ; `.gitlab-ci.yml` validé syntaxiquement (YAML).
- Aucune pipeline GitLab n’a pu être exécutée depuis l’environnement de développement (pas d’instance GitLab ni d’accès de publication) : la première exécution réelle reste à observer.
