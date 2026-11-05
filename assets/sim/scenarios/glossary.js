// Définitions courtes, affichées dans le simulateur au moment où une notion
// devient utile. La page glossaire.qmd en donne la version complète.

export const GLOSSARY = {
  git: { term: 'Git', def: 'L’outil qui gère les versions du projet. Il travaille dans ton environnement (poste ou espace distant).' },
  gitlab: { term: 'GitLab', def: 'Le service qui héberge notamment le dépôt distant, et gère les comptes, les droits et les jetons.' },
  ide: { term: 'VS Code ou RStudio', def: 'L’interface dans laquelle tu travailles. Elle affiche les fichiers et pilote Git, mais n’héberge pas le dépôt.' },
  url: { term: 'URL du dépôt', def: 'L’adresse du projet à cloner. Elle n’est pas secrète. En HTTPS : https://gitlab.example.com/stagiaire/etude-entreprises.git' },
  jeton: { term: 'Jeton personnel d’accès', def: 'Un secret rattaché à ton compte, utilisé comme mot de passe par Git sur HTTPS. Sa valeur n’est affichée qu’une fois.' },
  'jeton-projet': { term: 'Jeton de projet', def: 'Rattaché à un projet (et à un compte de service), pour des automatisations. Ce parcours utilise un jeton personnel.' },
  scopes: { term: 'Permissions du jeton (scopes)', def: 'read_repository : lire (cloner, récupérer). write_repository : lire et écrire (pousser). api n’est pas utile pour un usage Git seul.' },
  authentification: { term: 'Authentification', def: 'Être reconnu : GitLab vérifie que le jeton est valide et à qui il appartient.' },
  autorisation: { term: 'Autorisation', def: 'Avoir le droit d’effectuer l’opération : permissions du jeton ET droits du compte sur le projet (rôle, branches protégées).' },
  identite: { term: 'Identité de commit', def: 'user.name et user.email, inscrits dans chaque commit. Ce n’est pas une authentification.' },
  'depot-local': { term: 'Dépôt local', def: 'La copie du dépôt dans l’environnement où Git travaille : ton poste, ou un espace distant comme Coder ou Onyxia.' },
  remote: { term: 'Remote (origin)', def: 'Le lien enregistré entre le dépôt local et le dépôt distant. Le clonage le crée sous le nom origin.' },
  init: { term: 'git init', def: 'Fait d’un dossier existant un dépôt Git local (sous-dossier caché .git, historique vide). Les fichiers ne changent pas.' },
  gitignore: { term: '.gitignore', def: 'Liste ce que Git ignore (données, fichiers temporaires). Un fichier ignoré reste sur le disque mais n’entre jamais dans l’historique.' },
  upstream: { term: 'Branche suivie', def: 'La branche distante associée (origin/main). Le premier envoi l’enregistre avec git push -u origin main ; ensuite git push suffit.' },
  commit: { term: 'Commit', def: 'Une version enregistrée dans l’historique, avec un message, un auteur et une date. Il est local tant qu’il n’est pas envoyé.' },
  branche: { term: 'Branche', def: 'Une ligne d’historique. Ce parcours n’utilise que main ; les autres branches viendront dans la suite.' },
  staging: { term: 'Préparation (staging)', def: 'Le choix des changements qui entreront dans le prochain commit (git add).' },
  diff: { term: 'Diff', def: 'La comparaison ligne à ligne entre deux versions d’un fichier : + ajouté, − supprimé.' },
  push: { term: 'Push', def: 'L’envoi vers GitLab des commits qu’il n’a pas encore. Les modifications non commitées ne partent pas.' },
  gestionnaire: { term: 'Gestionnaire d’identifiants', def: 'L’outil qui mémorise les identifiants pour Git (Gestionnaire d’identification Windows, Trousseau macOS, credential helper sous Linux…).' },
};
