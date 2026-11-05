// Tests du terminal simulé : commandes, variantes, limites, questions de Git.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../assets/sim/engine/engine.js';
import * as S from '../assets/sim/engine/shell.js';

const txt = (r) => r.out.map((l) => l.text).join('\n');

function world() {
  const w = E.blankWorld('t');
  E.createProject(w, { name: 'etude-entreprises' }); // avec README : branche déjà suivie
  const t = E.createToken(w, { name: 'a', scopes: ['write_repository'] }).token;
  E.hideTokenValue(w);
  return { w, t };
}

test('parcours complet au terminal, avec les questions Username / Password', () => {
  const { w, t } = world();
  assert.equal(txt(S.run(w, 'pwd')), '/home/stagiaire');
  S.run(w, 'cd projets');
  let r = S.run(w, 'git clone https://gitlab.example.com/stagiaire/etude-entreprises.git');
  assert.equal(txt(r), "Cloning into 'etude-entreprises'...");
  assert.equal(r.pending.kind, 'username');
  assert.equal(r.pending.label, "Username for 'https://gitlab.example.com': ");
  r = r.pending.next('stagiaire');
  assert.equal(r.pending.kind, 'password');
  assert.equal(r.pending.label, "Password for 'https://stagiaire@gitlab.example.com': ");
  r = r.pending.next(t.value);
  assert.ok(r.ok);
  assert.doesNotMatch(txt(r), /Cloning into/);
  S.run(w, 'cd etude-entreprises');
  assert.match(txt(S.run(w, 'git remote -v')), /origin\thttps:\/\/gitlab\.example\.com\/stagiaire\/etude-entreprises\.git \(push\)/);
  S.run(w, 'echo "Étude fictive sur des entreprises." >> README.md');
  assert.match(txt(S.run(w, 'git status')), /modified:   README.md/);
  assert.match(txt(S.run(w, 'git diff')), /\+Étude fictive sur des entreprises\./);
  S.run(w, 'git add README.md');
  assert.match(txt(S.run(w, 'git status')), /Changes to be committed/);
  r = S.run(w, 'git commit -m "Ajoute une phrase de description"');
  assert.match(txt(r), /^\[main [0-9a-f]{7}\] Ajoute une phrase de description\n 1 file changed, 1 insertion\(\+\)$/);
  assert.match(txt(S.run(w, 'git status')), /ahead of 'origin\/main' by 1 commit/);
  r = S.run(w, 'git push');
  assert.ok(r.ok, txt(r)); // identifiants mémorisés : pas de nouvelle question
  assert.match(txt(r), /main -> main/);
  assert.match(txt(S.run(w, 'git log --oneline')), /\(HEAD -> main, origin\/main\) Ajoute une phrase/);
});

test('variantes et limites', () => {
  const { w } = world();
  assert.equal(S.run(w, 'git status').code, 'not-repo');
  assert.equal(S.run(w, 'rm -rf /').code, 'unknown');
  assert.equal(S.run(w, 'git rebase -i').code, 'not-repo');
  assert.equal(S.run(w, 'ls | grep x').code, 'unsupported');
  assert.match(txt(S.run(w, 'ls')), /projets\//);
  assert.match(txt(S.run(w, 'git config --global user.name')), /Camille Stagiaire/);
  S.run(w, 'git config --global user.name "Alex Martin"');
  assert.equal(w.gitconfig['user.name'], 'Alex Martin');
  assert.match(txt(S.run(w, 'help')), /git clone <url>/);
});

test('une saisie qui n’est pas un jeton d’entraînement est écartée sans être reproduite', () => {
  const { w } = world();
  S.run(w, 'cd projets');
  let r = S.run(w, 'git clone https://gitlab.example.com/stagiaire/etude-entreprises.git');
  r = r.pending.next('stagiaire').pending.next('glpat-SECRETVALUE1234');
  assert.equal(r.code, 'not-demo');
  assert.doesNotMatch(txt(r), /SECRETVALUE/);
  assert.doesNotMatch(JSON.stringify(w), /SECRETVALUE/);
});

test('dépôt vide : git push demande --set-upstream, git push -u origin main crée la branche', () => {
  const w = E.blankWorld('t');
  E.createProject(w, { name: 'etude-entreprises', readme: false });
  const t = E.createToken(w, { name: 'a', scopes: ['write_repository'] }).token;
  S.run(w, 'cd projets');
  let r = S.run(w, 'git clone https://gitlab.example.com/stagiaire/etude-entreprises.git');
  r = r.pending.next('stagiaire').pending.next(t.value);
  assert.match(txt(r), /You appear to have cloned an empty repository/);
  S.run(w, 'cd etude-entreprises');
  assert.match(txt(S.run(w, 'git status')), /No commits yet/);
  S.run(w, 'echo "# etude-entreprises" > README.md');
  S.run(w, 'git add README.md');
  S.run(w, 'git commit -m "Crée le README de l’étude"');
  assert.match(txt(S.run(w, 'git push')), /has no upstream branch/);
  r = S.run(w, 'git push -u origin main');
  assert.ok(r.ok, txt(r));
  assert.match(txt(r), /\* \[new branch\]      main -> main/);
  assert.match(txt(S.run(w, 'git status')), /up to date with 'origin\/main'/);
});
