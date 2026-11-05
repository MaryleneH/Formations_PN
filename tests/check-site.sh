#!/bin/sh
# Contrôles du site rendu (_site/), exécutables sans Node : utilisés par la CI GitLab.
#  - les pages et les ressources du simulateur sont présentes ;
#  - aucun chemin absolu depuis la racine du domaine (le site doit fonctionner
#    dans un sous-répertoire de GitLab Pages) ;
#  - aucune ressource chargée depuis un domaine externe par le simulateur.
set -eu
SITE="${1:-_site}"
fail=0
for f in index.html bac-a-sable.html dans-mes-outils.html glossaire.html formatrice.html a-propos.html \
         assets/sim/ui/app.js assets/sim/engine/engine.js assets/sim/scenarios/index.js assets/sim/sim.css \
         assets/fonts/PublicSans-Regular.ttf assets/img/logo.svg; do
  if [ ! -s "$SITE/$f" ]; then echo "manquant : $f"; fail=1; fi
done
# Chemins absolus « /... » dans les attributs href/src et les url() CSS.
if grep -rEn '(href|src)="/[^/]' "$SITE"/*.html; then echo "chemin absolu trouvé dans une page"; fail=1; fi
if grep -rEn "url\(['\"]?/[^/]" "$SITE/assets" --include=*.css; then echo "chemin absolu trouvé dans une feuille de style"; fail=1; fi
if grep -rEn "from '/|import\('/" "$SITE/assets/sim"; then echo "import absolu trouvé"; fail=1; fi
if grep -rEn "https?://(cdn|fonts|unpkg|code)\." "$SITE/assets/sim"; then echo "ressource externe dans le simulateur"; fail=1; fi
# Chaque module importé existe.
for js in $(find "$SITE/assets/sim" -name '*.js'); do
  dir=$(dirname "$js")
  for rel in $(grep -oE "from '\./[^']+'|from '\.\./[^']+'" "$js" | sed -E "s/from '([^']+)'/\1/"); do
    [ -f "$dir/$rel" ] || { echo "import introuvable : $rel (dans $js)"; fail=1; }
  done
done
[ "$fail" -eq 0 ] && echo "Site : contrôles réussis."
exit "$fail"
