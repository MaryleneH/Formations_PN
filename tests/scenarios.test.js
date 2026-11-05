// Chaque mission peut être menée à son terme en passant par les opérations
// du moteur (celles que déclenchent les vues), et seulement par elles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../assets/sim/engine/engine.js';
import * as S from '../assets/sim/engine/shell.js';
import * as P from '../assets/sim/core/progress.js';
import { byId, CATALOG } from '../assets/sim/scenarios/index.js';
import { addDays } from '../assets/sim/engine/util.js';

const PRJ = '/home/stagiaire/projets';
const view = (w, page, extra = {}) => E.emit(w, 'view', { page, ...extra });

function play(ide) {
  const store = P.blankStore();
  store.prefs.ide = ide;
  const step = (id) => { const r = P.evaluate(store, byId(id), ide); return r; };
  const answerAll = (id) => { const m = byId(id); for (const s of m.steps.filter((x) => x.kind === 'quiz')) P.answer(store, m, s.id, s.options.find((o) => o.correct).id); };

  // Mission 1
  let { world: w } = P.enter(store, 'm1', ide);
  view(w, 'new-blank');
  assert.ok(E.createProject(w, { name: 'etude-entreprises', visibility: 'private', readme: true }).ok);
  view(w, 'project', { project: 'stagiaire/etude-entreprises' });
  answerAll('m1');
  assert.ok(step('m1').complete, 'm1');

  // Mission 2
  w = P.enter(store, 'm2', ide).world;
  E.copy(w, { kind: 'url', text: E.httpsUrl('stagiaire', 'etude-entreprises') });
  view(w, 'tokens');
  // Montrer un indice ne valide rien.
  P.useHint(store, byId('m2'), 'token', 3);
  assert.equal(step('m2').complete, false);
  const t = E.createToken(w, { name: 'poste-formation', scopes: ['write_repository'], expiresAt: addDays(w.today, 30) }).token;
  E.copy(w, { kind: 'token', text: t.value, tokenId: t.id });
  E.vaultSave(w, { label: 'GitLab', value: t.value });
  E.hideTokenValue(w);
  answerAll('m2');
  assert.ok(step('m2').complete, 'm2');

  // Mission 3
  w = P.enter(store, 'm3', ide).world;
  let r = E.cloneRepo(w, { url: E.httpsUrl('stagiaire', 'etude-entreprises'), parentDir: PRJ, via: ide, rstudioProject: ide === 'rstudio' });
  assert.equal(r.needAuth, true);
  r = E.cloneRepo(w, { url: E.httpsUrl('stagiaire', 'etude-entreprises'), parentDir: PRJ, via: ide, rstudioProject: ide === 'rstudio', auth: { username: 'stagiaire', secret: t.value } });
  assert.ok(r.ok);
  E.openFolder(w, ide, r.repo.path);
  E.emit(w, 'open-file', { file: 'README.md' });
  S.run(w, 'git remote -v');
  answerAll('m3');
  assert.ok(step('m3').complete, 'm3');

  // Mission 4
  w = P.enter(store, 'm4', ide).world;
  const path = r.repo.path;
  E.writeFile(w, path, 'README.md', w.ws.repos[path].work['README.md'] + '\nÉtude fictive sur la démographie des entreprises.\n');
  E.emit(w, 'diff-view', { via: ide });
  E.stage(w, path, ['README.md'], ide);
  assert.ok(E.commit(w, path, { message: 'modif', via: ide }).ok);
  assert.equal(step('m4').complete, false, 'un message vague ne valide pas l’étape');
  assert.ok(E.commit(w, path, { message: 'Décrit l’objectif de l’étude dans le README', amend: true, via: ide }).ok);
  view(w, 'project', { project: 'stagiaire/etude-entreprises' });
  assert.ok(step('m4').complete, 'm4');
  assert.equal(E.getProject(w, 'stagiaire', 'etude-entreprises').commits.length, 1);

  // Mission 5
  w = P.enter(store, 'm5', ide).world;
  assert.ok(E.push(w, path, { via: ide }).ok);
  view(w, 'commits', { project: 'stagiaire/etude-entreprises' });
  view(w, 'file', { project: 'stagiaire/etude-entreprises', file: 'README.md' });
  assert.ok(step('m5').complete, 'm5');
  return store;
}

test('parcours complet depuis un état vierge — VS Code', () => { play('vscode'); });
test('parcours complet depuis un état vierge — RStudio', () => {
  const store = play('rstudio');
  const p = E.getProject(store.worlds.parcours, 'stagiaire', 'etude-entreprises');
  assert.ok(p.commits[1].tree['etude-entreprises.Rproj'] === undefined, 'seul README a été préparé');
});


function playB(ide) {
  const store = P.blankStore();
  const step = (id) => P.evaluate(store, byId(id), ide);
  const answerAll = (id) => { const m = byId(id); for (const s of m.steps.filter((x) => x.kind === 'quiz')) P.answer(store, m, s.id, s.options.find((o) => o.correct).id); };
  const F = '/home/stagiaire/projets/etude-entreprises';
  // B1 : projet vide ; le dossier existe déjà dans le pod
  let { world: w } = P.enter(store, 'm1b', ide);
  assert.equal(w.ws.repos[F].git, false);
  view(w, 'new-blank');
  assert.ok(E.createProject(w, { name: 'etude-entreprises', readme: false }).ok);
  view(w, 'project', { project: 'stagiaire/etude-entreprises' });
  answerAll('m1b');
  assert.ok(step('m1b').complete, 'm1b');
  // B2 : accès
  w = P.enter(store, 'm2b', ide).world;
  E.copy(w, { kind: 'url', text: E.httpsUrl('stagiaire', 'etude-entreprises') });
  view(w, 'tokens');
  const t = E.createToken(w, { name: 'pod-onyxia', scopes: ['write_repository'] }).token;
  E.copy(w, { kind: 'token', text: t.value, tokenId: t.id });
  E.vaultSave(w, { label: 'GitLab', value: t.value });
  E.hideTokenValue(w);
  answerAll('m2b');
  assert.ok(step('m2b').complete, 'm2b');
  // B3 : git init + remote
  w = P.enter(store, 'm3b', ide).world;
  E.initRepo(w, F, { via: ide });
  E.addRemote(w, F, 'origin', E.httpsUrl('stagiaire', 'etude-entreprises'), { via: ide });
  S.run(w, 'git remote -v');
  answerAll('m3b');
  assert.ok(step('m3b').complete, 'm3b');
  // B4 : .gitignore, préparation, premier commit
  w = P.enter(store, 'm4b', ide).world;
  const f = w.ws.repos[F];
  E.writeFile(w, F, '.gitignore', (f.work['.gitignore'] || '') + '*.csv\n');
  assert.ok(!E.status(f).untracked.some((x) => x.path === 'entreprises.csv'));
  E.stageAll(w, F, ide);
  assert.ok(E.commit(w, F, { message: 'Ajoute le rapport et le script d’analyse', via: ide }).ok);
  view(w, 'project', { project: 'stagiaire/etude-entreprises' });
  assert.ok(step('m4b').complete, 'm4b');
  // B5 : premier push
  w = P.enter(store, 'm5b', ide).world;
  assert.equal(E.push(w, F, { via: ide }).code, 'no-upstream');
  const first = E.push(w, F, { via: ide, explicit: true, setUpstream: true });
  assert.equal(first.needAuth, true, 'premier échange avec GitLab : le jeton est demandé');
  assert.ok(E.push(w, F, { via: ide, explicit: true, setUpstream: true, auth: { username: 'stagiaire', secret: t.value } }).ok);
  view(w, 'commits', { project: 'stagiaire/etude-entreprises' });
  view(w, 'project', { project: 'stagiaire/etude-entreprises' });
  assert.ok(step('m5b').complete, 'm5b');
  const tree = E.getProject(w, 'stagiaire', 'etude-entreprises').commits[0].tree;
  assert.equal(tree['entreprises.csv'], undefined, 'les données restent dans le pod');
  assert.ok(tree['rapport.qmd'] && tree['analyse.R'] && tree['.gitignore']);
  return store;
}

test('parcours B complet (travail existant) — VS Code', () => { playB('vscode'); });
test('parcours B complet (travail existant) — RStudio', () => { playB('rstudio'); });

test('chaque mission démarre depuis sa situation initiale, et les exercices de dépannage reproduisent leur panne', () => {
  for (const ide of ['vscode', 'rstudio']) {
    for (const m of CATALOG) {
      const store = P.blankStore();
      const { world: w, needsSetup } = P.enter(store, m.id, ide);
      assert.equal(needsSetup, false, m.id);
      const res = P.evaluate(store, m, ide);
      assert.equal(res.complete, false, `${m.id} ne doit pas être réussie d’emblée`);
      const repo = Object.values(w.ws.repos)[0];
      if (['d2', 'd3', 'd5', 'd9'].includes(m.id)) {
        const pr = E.push(w, repo.path, { via: ide });
        assert.equal(pr.ok, false, m.id);
        assert.equal(pr.code, { d2: 'auth', d3: 'auth', d5: 'scope', d9: 'protected' }[m.id]);
      }
      if (m.id === 'd8') assert.equal(E.commit(w, repo.path, { message: 'Ajoute la source des données' }).code, 'identity');
      if (m.id === 'd1') {
        const val = w.vault[0].value;
        const c = E.cloneRepo(w, { url: E.httpsUrl('stagiaire', 'etude-entreprises'), parentDir: PRJ, auth: { username: 'u', secret: val } });
        assert.equal(c.code, 'auth');
      }
    }
  }
});

test('reprise : sérialisation puis relecture conservent un état cohérent', () => {
  const store = play('vscode');
  const back = P.deserialize(P.serialize(store));
  assert.deepEqual(back.progress.m5.steps, store.progress.m5.steps);
  assert.equal(P.deserialize('{pas du json'), null);
  assert.equal(P.deserialize('{"v":99}'), null);
});

test('recommencer une mission conserve la progression des autres', () => {
  const store = play('vscode');
  P.restart(store, 'm4', 'vscode');
  assert.equal(store.progress.m1.status, 'done');
  assert.equal(store.progress.m4.status, 'started');
  assert.deepEqual(store.progress.m4.steps, {});
  const w = store.worlds.parcours;
  const repo = Object.values(w.ws.repos)[0];
  assert.equal(repo.commits.length, 1, 'le monde repart du début de la mission 4 (clone du projet avec README)');
});

test('exercice 6.5 de bout en bout : 403, nouveau jeton, oubli des identifiants, push', () => {
  const store = P.blankStore();
  const m = byId('d5');
  const { world: w } = P.enter(store, 'd5', 'vscode');
  const repo = Object.values(w.ws.repos)[0];
  assert.equal(E.push(w, repo.path).code, 'scope');
  view(w, 'tokens');
  P.answer(store, m, 'cause', 'a');
  const t = E.createToken(w, { name: 'ecriture', scopes: ['write_repository'] }).token;
  E.vaultSave(w, { label: 'x', value: t.value });
  E.hideTokenValue(w);
  assert.equal(E.push(w, repo.path).code, 'scope', 'Git réutilise le jeton mémorisé');
  E.deleteCredential(w);
  assert.ok(E.push(w, repo.path, { auth: { username: 'stagiaire', secret: t.value } }).ok);
  assert.ok(P.evaluate(store, m, 'vscode').complete);
});

test('chaque cible de « Montrer le geste » existe dans une vue', async () => {
  const fs = await import('node:fs');
  const src = ['gitlab', 'vscode', 'rstudio', 'tools', 'terminal', 'coach', 'app'].map((f) => fs.readFileSync(new URL(`../assets/sim/ui/${f}.js`, import.meta.url), 'utf8')).join('\n');
  const targets = new Set();
  for (const m of CATALOG) for (const s of m.steps) {
    const h3 = (s.hints || [])[2];
    if (!h3 || !h3.targets) continue;
    const t = h3.targets;
    for (const x of (Array.isArray(t) ? t : [...(t.vscode || []), ...(t.rstudio || [])])) targets.add(x);
  }
  const missing = [...targets].filter((t) => {
    if (src.includes(`'${t}'`)) return false;
    // cibles calculées : préfixe + nom de fichier ou de scope
    const m = t.match(/^((?:gl|vs|rs)\.[a-z-]+-)(.+)$/);
    return !(m && src.includes(`'${m[1]}'`));
  });
  assert.deepEqual(missing, []);
});

test('mission 7 : le parcours complet sur un nouveau projet, sans aide', () => {
  const store = P.blankStore();
  const m = byId('m7');
  const { world: w } = P.enter(store, 'm7', 'rstudio');
  E.createProject(w, { name: 'enquete-loyers', readme: false });
  const t = E.createToken(w, { name: 'poste', scopes: ['write_repository'] }).token;
  E.copy(w, { kind: 'token', text: t.value, tokenId: t.id });
  E.vaultSave(w, { label: 'x', value: t.value });
  E.hideTokenValue(w);
  const r = E.cloneRepo(w, { url: E.httpsUrl('stagiaire', 'enquete-loyers'), parentDir: PRJ, auth: { username: 's', secret: t.value }, rstudioProject: true });
  E.openFolder(w, 'rstudio', r.repo.path);
  E.writeFile(w, r.repo.path, 'synthese.qmd', '# Synthèse de l’enquête\n');
  E.stage(w, r.repo.path, ['synthese.qmd']);
  E.commit(w, r.repo.path, { message: 'Ajoute une première synthèse de l’enquête' });
  assert.ok(E.push(w, r.repo.path, { explicit: true, setUpstream: true }).ok);
  view(w, 'commits', { project: 'stagiaire/enquete-loyers' });
  assert.ok(P.evaluate(store, m, 'rstudio').complete);
  assert.deepEqual(store.progress.m7.hints, {});
});
