// Opérations réseau simulées (clone, push, pull) avec demande d'identifiants.
// La forme de la demande (quick input VS Code, fenêtre RStudio) est fournie
// par la vue ; ce module enchaîne : essai → demande → nouvel essai.

/**
 * run(w, auth) : opération du moteur. ask(prompts, resolve, cancel) : affiche
 * la demande ; resolve({ username, secret }) relance l'opération.
 * done(result) : reçoit le résultat final (réussite ou échec).
 */
export function withCredentials(app, run, { ask, done, onCancel }) {
  const first = app.act((w) => run(w, null), { render: false });
  if (!first.needAuth) { done(first); app.render(); return; }
  ask(first.prompts, (auth) => {
    const r = app.act((w) => run(w, auth), { render: false });
    done(r);
    app.render();
  }, () => { if (onCancel) onCancel(); app.render(); });
  app.render();
}

/** Lignes d'une sortie Git utiles pour une notification courte. */
export function gist(out = []) {
  const keep = out.filter((l) => /^(fatal|error|remote: (HTTP|You|GitLab|The)|git@|Author identity| ! )/.test(l));
  return (keep.length ? keep : out.slice(-2)).join('\n');
}
