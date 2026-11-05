// Tests du moteur : les comportements qui conditionnent l'apprentissage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../assets/sim/engine/engine.js';
import { classifySecret, redact, addDays } from '../assets/sim/engine/util.js';

const rng = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
const P = '/home/stagiaire/projets';
const URL = 'https://gitlab.example.com/stagiaire/etude-entreprises.git';

function withProject() {
  const w = E.blankWorld('t');
  assert.ok(E.createProject(w, { name: 'etude-entreprises', visibility: 'private', readme: true }).ok);
  return w;
}
function withToken(scopes = ['write_repository']) {
  const w = withProject();
  const t = E.createToken(w, { name: 'poste-formation', scopes, expiresAt: addDays(w.today, 30) }, rng).token;
  E.copy(w, { kind: 'token', text: t.value, tokenId: t.id });
  E.hideTokenValue(w);
  return { w, t };
}
function cloned(scopes) {
  const { w, t } = withToken(scopes);
  const r = E.cloneRepo(w, { url: URL, parentDir: P, auth: { username: 'stagiaire', secret: t.value } });
  assert.ok(r.ok, JSON.stringify(r.out));
  return { w, t, path: P + '/etude-entreprises' };
}

test('création de projet : README, branche main, premier commit, privé', () => {
  const w = withProject();
  const p = E.getProject(w, 'stagiaire', 'etude-entreprises');
  assert.equal(p.visibility, 'private');
  assert.equal(p.defaultBranch, 'main');
  assert.equal(p.commits.length, 1);
  assert.ok(p.commits[0].tree['README.md'].startsWith('# etude-entreprises'));
  assert.deepEqual(E.validateProject(w, { name: 'etude-entreprises', ns: 'stagiaire', slug: 'etude-entreprises' }).slug, 'Path has already been taken');
  assert.ok(E.validateProject(w, { name: '', ns: 'stagiaire', slug: '' }).name);
});

test('jeton : affiché une seule fois, valeur perdue si non conservée', () => {
  const w = withProject();
  const t = E.createToken(w, { name: 'a', scopes: ['write_repository'] }, rng).token;
  assert.ok(t.value.startsWith('DEMO-TOKEN-'));
  assert.equal(t.expiresAt, addDays(w.today, 365), 'sans date : 365 jours');
  assert.equal(t.displayed, true);
  const h = E.hideTokenValue(w);
  assert.equal(h.lost, true);
  assert.equal(t.displayed, false);
  assert.ok(E.validateToken(w, { name: 'x', scopes: [] }).scopes);
  assert.ok(E.validateToken(w, { name: 'x', scopes: ['api'], expiresAt: addDays(w.today, 400) }).expiresAt);
  assert.ok(E.validateToken(w, { name: 'x', scopes: ['api'], expiresAt: w.today }).expiresAt);
});

test('clonage : demande d’authentification, puis mémorisation par le gestionnaire', () => {
  const { w, t } = withToken();
  const first = E.cloneRepo(w, { url: URL, parentDir: P });
  assert.equal(first.needAuth, true);
  assert.match(first.prompts.username, /^Username for 'https:\/\/gitlab\.example\.com': $/);
  const ok = E.cloneRepo(w, { url: URL, parentDir: P, auth: { username: 'nimporte', secret: t.value } });
  assert.ok(ok.ok);
  assert.equal(ok.repo.remote.url, URL);
  assert.deepEqual(Object.keys(ok.repo.work), ['README.md']);
  assert.equal(w.credentials.length, 1);
  assert.equal(JSON.stringify(w.credentials).includes(t.value), false, 'le gestionnaire ne stocke qu’une référence');
});

test('jeton mal copié, expiré ou révoqué : HTTP Basic: Access denied', () => {
  const { w, t } = withToken();
  const bad = E.cloneRepo(w, { url: URL, parentDir: P, auth: { username: 'u', secret: t.value.slice(0, -1) } });
  assert.equal(bad.code, 'auth');
  assert.match(bad.out.join('\n'), /HTTP Basic: Access denied/);
  assert.match(bad.out.join('\n'), /fatal: Authentication failed for 'https:\/\/gitlab\.example\.com\/stagiaire\/etude-entreprises\.git\/'/);
  E.advanceClock(w, 30);
  assert.equal(E.tokenState(w, t), 'expired');
  assert.equal(E.cloneRepo(w, { url: URL, parentDir: P, auth: { username: 'u', secret: t.value } }).cause, 'token-expired');
  const w2 = withToken().w;
  const t2 = w2.tokens[0];
  E.revokeToken(w2, t2.id);
  assert.equal(E.cloneRepo(w2, { url: URL, parentDir: P, auth: { username: 'u', secret: t2.value } }).cause, 'token-revoked');
});

test('jeton expiré mémorisé : échec, puis identifiants effacés et redemandés', () => {
  const { w, path } = cloned();
  E.writeFile(w, path, 'README.md', 'nouveau\n');
  E.stage(w, path, ['README.md']);
  E.commit(w, path, { message: 'Décrit l’objectif de l’étude' });
  E.advanceClock(w, 40);
  const r = E.push(w, path);
  assert.equal(r.code, 'auth');
  assert.equal(r.fromHelper, true);
  assert.equal(w.credentials.length, 0);
  assert.equal(E.push(w, path).needAuth, true);
});

test('jeton en lecture seule : clonage possible, push refusé (403)', () => {
  const { w, path, t } = cloned(['read_repository']);
  E.writeFile(w, path, 'README.md', 'x\n');
  E.stage(w, path, ['README.md']);
  E.commit(w, path, { message: 'Précise le périmètre des entreprises' });
  const r = E.push(w, path);
  assert.equal(r.code, 'scope');
  assert.deepEqual(r.out[0], 'remote: You are not allowed to upload code.');
  assert.match(r.out[1], /403/);
  // Le jeton en lecture reste mémorisé : il faut l'effacer pour en donner un autre.
  assert.equal(w.credentials[0].tokenId, t.id);
  const t2 = E.createToken(w, { name: 'b', scopes: ['write_repository'] }, rng).token;
  E.deleteCredential(w);
  assert.ok(E.push(w, path, { auth: { username: 'x', secret: t2.value } }).ok);
});

test('un commit local ne modifie pas GitLab ; le push le publie', () => {
  const { w, path } = cloned();
  const p = E.getProject(w, 'stagiaire', 'etude-entreprises');
  E.writeFile(w, path, 'README.md', '# etude-entreprises\n\nÉtude fictive.\n');
  assert.equal(E.status(w.ws.repos[path]).unstaged.length, 1);
  const nothing = E.commit(w, path, { message: 'Ajoute la description' });
  assert.equal(nothing.code, 'nothing-staged', 'un commit dépend de changements préparés');
  E.stage(w, path, ['README.md']);
  const c = E.commit(w, path, { message: 'Ajoute la description de l’étude' });
  assert.ok(c.ok);
  assert.equal(p.commits.length, 1, 'le distant est inchangé après le commit');
  assert.equal(E.ahead(w.ws.repos[path]), 1);
  const r = E.push(w, path);
  assert.ok(r.ok);
  assert.equal(p.commits.length, 2);
  assert.equal(p.commits[1].tree['README.md'], '# etude-entreprises\n\nÉtude fictive.\n');
  assert.equal(E.ahead(w.ws.repos[path]), 0);
});

test('un push ne publie pas les modifications non commitées', () => {
  const { w, path } = cloned();
  E.writeFile(w, path, 'rapport.qmd', '---\ntitle: Rapport\n---\n');
  const r = E.push(w, path);
  assert.equal(r.code, 'up-to-date');
  assert.deepEqual(r.out, ['Everything up-to-date']);
  assert.equal(E.getProject(w, 'stagiaire', 'etude-entreprises').commits[0].tree['rapport.qmd'], undefined);
});

test('identité absente : commit refusé avec le message de Git', () => {
  const { w, path } = cloned();
  w.gitconfig = {};
  E.writeFile(w, path, 'README.md', 'y\n');
  E.stage(w, path, ['README.md']);
  const r = E.commit(w, path, { message: 'Ajoute le contexte' });
  assert.equal(r.code, 'identity');
  assert.equal(r.out[0], 'Author identity unknown');
  E.setConfig(w, 'user.name', 'Camille');
  E.setConfig(w, 'user.email', 'c@example.com');
  assert.ok(E.commit(w, path, { message: 'Ajoute le contexte' }).ok);
});

test('URL SSH dans un exercice HTTPS : Permission denied (publickey)', () => {
  const { w } = withToken();
  const r = E.cloneRepo(w, { url: 'git@gitlab.example.com:stagiaire/etude-entreprises.git', parentDir: P });
  assert.equal(r.code, 'ssh');
  assert.match(r.out.join('\n'), /Permission denied \(publickey\)/);
});

test('jeton dans l’URL : refusé par le simulateur', () => {
  const { w, t } = withToken();
  const r = E.cloneRepo(w, { url: `https://oauth2:${t.value}@gitlab.example.com/stagiaire/etude-entreprises.git`, parentDir: P });
  assert.equal(r.code, 'secret-in-url');
  assert.equal(Object.keys(w.ws.repos).length, 0);
});

test('branche protégée : authentifié mais refusé', () => {
  const w = E.blankWorld('t');
  E.createProject(w, { name: 'etude-entreprises', ns: 'equipe-stats', members: { stagiaire: 'Developer' }, protectedBranches: { main: { push: 'Maintainer' } } });
  const t = E.createToken(w, { name: 'a', scopes: ['write_repository'] }, rng).token;
  const r = E.cloneRepo(w, { url: 'https://gitlab.example.com/equipe-stats/etude-entreprises.git', parentDir: P, auth: { username: 'u', secret: t.value } });
  assert.ok(r.ok);
  const path = P + '/etude-entreprises';
  E.writeFile(w, path, 'README.md', 'z\n'); E.stage(w, path, ['README.md']); E.commit(w, path, { message: 'Ajoute la source des données' });
  const p = E.push(w, path);
  assert.equal(p.code, 'protected');
  assert.match(p.out.join('\n'), /You are not allowed to push code to protected branches on this project/);
  assert.equal(E.getProject(w, 'equipe-stats', 'etude-entreprises').commits.length, 1);
});

test('saisies secrètes : seules les valeurs DEMO-TOKEN- sont utilisables', () => {
  assert.equal(classifySecret('DEMO-TOKEN-abc123'), 'demo');
  assert.equal(classifySecret('glpat-xxxxxxxxxxxxxxxxxxxx'), 'real');
  assert.equal(classifySecret('motdepasse'), 'other');
  assert.equal(redact('git clone https://u:glpat-abc@gitlab.example.com/a/b.git'), 'git clone https://u:••••••@gitlab.example.com/a/b.git');
  assert.equal(redact('DEMO-TOKEN-abcdef'), 'DEMO-TOKEN-••••');
  const w = withProject();
  assert.equal(E.vaultSave(w, { label: 'x', value: 'glpat-123' }).ok, false);
  assert.equal(w.vault.length, 0);
});

test('RStudio : le projet ajoute .Rproj et .gitignore', () => {
  const { w, t } = withToken();
  const r = E.cloneRepo(w, { url: URL, parentDir: P, auth: { username: 'u', secret: t.value }, rstudioProject: true });
  const st = E.status(r.repo);
  assert.deepEqual(st.untracked.map((x) => x.path).sort(), ['.gitignore', 'etude-entreprises.Rproj']);
});

test('messages de commit : descriptifs acceptés sous plusieurs formes', () => {
  for (const ok of ['Ajoute l’objectif de l’étude au README', 'Décrit les sources de données', 'Précise le périmètre des entreprises', 'Add study goal to README']) assert.ok(E.messageQuality(ok).ok, ok);
  for (const ko of ['maj', 'modif README', 'update', 'test', 'Mise à jour du fichier', 'wip']) assert.equal(E.messageQuality(ko).ok, false, ko);
});

test('projet vide : clonage, premier commit, premier push qui crée la branche', () => {
  const w = E.blankWorld('t');
  E.createProject(w, { name: 'etude-entreprises', readme: false });
  const t = E.createToken(w, { name: 'a', scopes: ['write_repository'] }, rng).token;
  const r = E.cloneRepo(w, { url: URL, parentDir: P, auth: { username: 'u', secret: t.value } });
  assert.ok(r.ok);
  assert.match(r.out.join('\n'), /You appear to have cloned an empty repository/);
  const path = r.repo.path;
  assert.equal(E.push(w, path).code, 'no-commit');
  E.writeFile(w, path, 'README.md', '# etude-entreprises\n');
  E.stage(w, path, ['README.md']);
  const c = E.commit(w, path, { message: 'Crée le README de l’étude' });
  assert.match(c.out[0], /^\[main \(root-commit\) [0-9a-f]{7}\]/);
  const np = E.push(w, path);
  assert.equal(np.code, 'no-upstream');
  assert.match(np.out.join('\n'), /git push --set-upstream origin main/);
  const ok = E.push(w, path, { explicit: true, setUpstream: true });
  assert.ok(ok.ok);
  assert.ok(ok.out.includes(' * [new branch]      main -> main'));
  assert.ok(ok.out.includes("branch 'main' set up to track 'origin/main'."));
  assert.equal(E.getProject(w, 'stagiaire', 'etude-entreprises').commits.length, 1);
  E.writeFile(w, path, 'README.md', '# etude-entreprises\n\nSuite.\n');
  E.stage(w, path, ['README.md']);
  E.commit(w, path, { message: 'Ajoute la suite du README' });
  assert.ok(E.push(w, path).ok, 'ensuite, un simple push suffit');
});
