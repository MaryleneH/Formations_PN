// =====================================================================
// Tests de parcours dans un vrai navigateur (Playwright + Chromium).
// Le site rendu (_site/) est servi SOUS UN SOUS-RÉPERTOIRE (/projet/)
// pour vérifier qu’il fonctionne comme sur GitHub Pages.
//
//   quarto render && node tests/e2e/run.mjs [--shots]
// =====================================================================

import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../_site');
const PREFIX = '/projet';
const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'screens');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webp': 'image/webp', '.jpg': 'image/jpeg' };

function serve() {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!u.startsWith(PREFIX + '/')) { res.writeHead(404); return res.end('hors du sous-répertoire'); }
    let f = path.join(ROOT, u.slice(PREFIX.length));
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end('not found'); }
    const type = TYPES[path.extname(f)] || 'application/octet-stream';
    const size = fs.statSync(f).size;
    // Requêtes partielles (Range), comme GitHub Pages : nécessaires pour se déplacer dans la vidéo.
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m && (m[1] || m[2])) {
      let start = m[1] ? Number(m[1]) : size - Number(m[2]);
      let end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
      if (start < 0) start = 0;
      if (start > end) { res.writeHead(416, { 'content-range': `bytes */${size}` }); return res.end(); }
      res.writeHead(206, { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
      return fs.createReadStream(f, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': size });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((ok) => srv.listen(0, () => ok(srv)));
}

let failures = 0;
const results = [];
async function check(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push(`ok   ${name} (${Date.now() - t0} ms)`); }
  catch (e) { failures++; results.push(`FAIL ${name}\n     ${String(e && e.stack || e).split('\n').slice(0, 4).join('\n     ')}`); }
}
function assert(c, msg) { if (!c) throw new Error(msg); }

// ---- aides ----
const T = (t) => `[data-target="${t}"]`;
async function click(p, t) { const l = p.locator(T(t)).first(); await l.waitFor({ state: 'visible', timeout: 4000 }); await l.click(); }
async function fill(p, t, v) { const l = p.locator(T(t)).first(); await l.waitFor({ state: 'visible', timeout: 4000 }); await l.fill(v); }
const prog = (p, id) => p.evaluate((m) => (window.__simApp.store.progress[m] || {}), id);
const world = (p) => p.evaluate(() => JSON.parse(JSON.stringify(window.__simApp.w)));
async function answerQuiz(p) {
  // Répond juste à la question affichée (lit la bonne réponse dans le scénario).
  const ok = await p.evaluate(() => {
    const app = window.__simApp;
    const s = app.mission.steps.find((x) => x.kind === 'quiz' && !app.prog.steps[x.id]);
    return s ? s.options.find((o) => o.correct).id : null;
  });
  assert(ok, 'aucune question en attente');
  await p.locator(`.coach-quiz input[value="${ok}"]`).first().check();
  await p.locator('.coach-quiz button[type=submit]').first().click();
}
async function expectDone(p, id) {
  await p.waitForFunction((m) => (window.__simApp.store.progress[m] || {}).status === 'done', id, { timeout: 4000 }).catch(async () => {
    const pr = await prog(p, id);
    throw new Error(`${id} non terminée : étapes validées = ${JSON.stringify(Object.keys(pr.steps || {}))}`);
  });
}
async function shot(p, name) { if (SHOTS) { fs.mkdirSync(SHOT_DIR, { recursive: true }); await p.screenshot({ path: path.join(SHOT_DIR, name + '.png') }); } }

async function newPage(browser, base, { width = 1368, height = 820, query = '' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') p.errors.push(m.text()); });
  await p.goto(`${base}/bac-a-sable.html${query}`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => !!window.__simApp);
  return p;
}

// ---- parcours ----
async function mission1(p) {
  await click(p, 'gl.create-new');
  await click(p, 'gl.menu-new-project');
  await click(p, 'gl.blank-card');
  await fill(p, 'gl.field-name', 'etude-entreprises');
  assert(await p.locator(T('gl.field-slug')).inputValue() === 'etude-entreprises', 'slug automatique');
  await click(p, 'gl.create-project');
  await p.locator('.gl-readme').waitFor();
  await answerQuiz(p);
  await expectDone(p, 'm1');
}

async function mission2(p, id = 'm2') {
  await click(p, 'gl.code-button');
  await click(p, 'gl.clone-https-copy');
  await click(p, 'gl.avatar');
  await click(p, 'gl.edit-profile');
  await click(p, 'gl.nav-access-tokens');
  await click(p, 'gl.generate-token');
  await click(p, 'gl.legacy-token');
  await fill(p, 'gl.token-name', 'poste-formation');
  await p.locator(`${T('gl.scope-write_repository')} input`).check();
  await click(p, 'gl.generate');
  await p.locator('.gl-new-token').waitFor();
  await click(p, 'gl.token-copy');
  await click(p, 'tb.vault');
  await click(p, 'vault.save');
  await p.keyboard.press('Escape');
  await answerQuiz(p);
  await expectDone(p, id);
}

async function authWithVault(p, ide) {
  // Nom d'utilisateur, puis jeton copié depuis le gestionnaire de mots de passe.
  if (ide === 'vscode') {
    await p.locator(T('vs.quickinput')).fill('stagiaire');
    await p.locator(T('vs.quickinput')).press('Enter');
  } else {
    await fill(p, 'auth.username', 'stagiaire');
    await p.locator(T('auth.username')).press('Enter');
  }
  await click(p, 'tb.vault');
  await p.locator(T('vault.copy')).last().click();
  await p.keyboard.press('Escape');
  await click(p, 'auth.paste');
  await p.locator(T('auth.password')).press('Enter');
}

async function mission3(p, ide) {
  await click(p, 'tb.tool-ide');
  const url = 'https://gitlab.example.com/stagiaire/etude-entreprises.git';
  if (ide === 'vscode') {
    await click(p, 'vs.scm');
    await click(p, 'vs.clone-button');
    await p.locator(T('vs.quickinput')).fill(url);
    await p.locator(T('vs.quickinput')).press('Enter');
    await click(p, 'pick.projets');
    await click(p, 'pick.ok');
    await authWithVault(p, ide);
    await click(p, 'vs.notif-open');
    await click(p, 'vs.file-README.md');
    await click(p, 'vs.terminal-tab');
    await p.locator(T('vs.terminal-input')).fill('git remote -v');
    await p.locator(T('vs.terminal-input')).press('Enter');
  } else {
    await click(p, 'rs.menu-file');
    await click(p, 'rs.new-project');
    await click(p, 'rs.wiz-vc');
    await click(p, 'rs.wiz-git');
    await fill(p, 'rs.repo-url', url);
    assert(await p.locator(T('rs.dir-name')).inputValue() === 'etude-entreprises', 'nom du dossier proposé');
    await click(p, 'rs.browse');
    await click(p, 'pick.projets');
    await click(p, 'pick.ok');
    await click(p, 'rs.create');
    await authWithVault(p, ide);
    await p.locator(T('rs.tab-git')).waitFor();
    await click(p, 'rs.files-README.md');
    // Une commande Git tapée dans la Console R : retour pédagogique.
    await click(p, 'rs.tab-console');
    await p.locator(T('rs.console-input')).fill('git remote -v');
    await p.locator(T('rs.console-input')).press('Enter');
    await p.locator('.rs-tip').waitFor();
    await click(p, 'rs.tab-terminal');
    await p.locator(T('rs.terminal-input')).fill('git remote -v');
    await p.locator(T('rs.terminal-input')).press('Enter');
  }
  await answerQuiz(p);
  await expectDone(p, 'm3');
}

async function mission4(p, ide) {
  const editor = ide === 'vscode' ? 'vs.editor' : 'rs.editor';
  if (ide === 'vscode') await click(p, 'vs.file-README.md'); else await click(p, 'rs.files-README.md');
  const ed = p.locator(T(editor));
  await ed.click();
  await ed.press('Control+End');
  await ed.type('\nÉtude fictive sur la démographie des entreprises d’un territoire.\n');
  await ed.press('Control+s');
  if (ide === 'vscode') {
    await click(p, 'vs.scm');
    await click(p, 'vs.change-README.md');
    await click(p, 'vs.stage-README.md');
    await fill(p, 'vs.commit-message', 'Décrit l’objectif de l’étude dans le README');
    await click(p, 'vs.commit-button');
  } else {
    await click(p, 'rs.tab-git');
    await p.locator(`${T('rs.staged-README.md')}`).first().check();
    await click(p, 'rs.git-commit');
    await fill(p, 'rs.commit-message', 'Décrit l’objectif de l’étude dans le README');
    await click(p, 'rs.commit-button');
    await p.locator('.rs-dialog .rs-output').waitFor();
    await p.locator('[data-fk="rsd-close"]').click();
    await p.locator('.rs-review [data-fk="rs.review-close"]').click();
  }
  const w = await world(p);
  assert(w.remote.projects['stagiaire/etude-entreprises'].commits.length === 1, 'le distant ne doit pas changer après un commit');
  await click(p, 'tb.tool-gitlab');
  await p.locator('.gl-logo').click();
  await click(p, 'gl.project-link');
  await expectDone(p, 'm4');
}

async function mission5(p, ide) {
  await click(p, 'tb.tool-ide');
  if (ide === 'vscode') {
    await click(p, 'vs.sync');
    await click(p, 'vs.dialog-ok');
  } else {
    await click(p, 'rs.git-push');
    await p.locator('.rs-dialog .rs-output').waitFor();
    await p.locator('[data-fk="rsd-close"]').click();
  }
  const w = await world(p);
  assert(w.remote.projects['stagiaire/etude-entreprises'].commits.length === 2, 'le push met à jour le distant');
  await click(p, 'tb.tool-gitlab');
  await click(p, 'gl.nav-commits');
  await click(p, 'gl.project-link');
  await expectDone(p, 'm5');
}

async function fullJourney(browser, base, ide) {
  const p = await newPage(browser, base, { query: `?mission=m1&ide=${ide}` });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle' });
  await mission1(p); await shot(p, `${ide}-m1`);
  await click(p, 'coach.next');
  await mission2(p); await shot(p, `${ide}-m2`);
  await click(p, 'coach.next');
  await mission3(p, ide); await shot(p, `${ide}-m3`);
  await click(p, 'coach.next');
  await mission4(p, ide); await shot(p, `${ide}-m4`);
  await click(p, 'coach.next');
  await mission5(p, ide); await shot(p, `${ide}-m5`);
  assert(!p.errors.length, 'erreurs JS : ' + p.errors.join(' | '));
  return p;
}

// ---- parcours B : travail existant dans le pod ----
const URL_HTTPS = 'https://gitlab.example.com/stagiaire/etude-entreprises.git';
async function missionB1(p) {
  await click(p, 'gl.create-new');
  await click(p, 'gl.menu-new-project');
  await click(p, 'gl.blank-card');
  await fill(p, 'gl.field-name', 'etude-entreprises');
  await p.locator(`${T('gl.readme')} input`).uncheck();
  await click(p, 'gl.create-project');
  await p.locator('.gl-empty-repo').waitFor();
  await answerQuiz(p);
  await expectDone(p, 'm1b');
}
async function copyHttpsUrl(p) {
  await click(p, 'tb.tool-gitlab');
  await p.locator('.gl-logo').click();
  await click(p, 'gl.project-link');
  await click(p, 'gl.code-button');
  await click(p, 'gl.clone-https-copy');
  await p.keyboard.press('Escape');
}
async function termRun(p, ide, cmd) {
  const t = p.locator(T(ide === 'vscode' ? 'vs.terminal-input' : 'rs.terminal-input'));
  await t.fill(cmd);
  await t.press('Enter');
}
async function missionB3(p, ide) {
  await click(p, 'tb.tool-ide');
  if (ide === 'vscode') {
    await click(p, 'vs.scm');
    await click(p, 'vs.init');
  } else {
    await click(p, 'rs.menu-tools');
    await click(p, 'rs.vc-setup');
    await p.locator(T('rs.vc-git')).selectOption('git');
    await click(p, 'rs.vc-ok');
    await click(p, 'rs.vc-yes');
    await p.locator(T('rs.tab-git')).waitFor();
  }
  await copyHttpsUrl(p);
  await click(p, 'tb.tool-ide');
  if (ide === 'vscode') {
    await click(p, 'vs.scm');
    await click(p, 'vs.more');
    await click(p, 'vs.add-remote');
    await p.locator(T('vs.quickinput')).fill(URL_HTTPS);
    await p.locator(T('vs.quickinput')).press('Enter');
    await p.locator(T('vs.quickinput')).press('Enter'); // nom proposé : origin
    await click(p, 'vs.terminal-tab');
  } else {
    await click(p, 'rs.tab-terminal');
    await termRun(p, ide, `git remote add origin ${URL_HTTPS}`);
  }
  await termRun(p, ide, 'git remote -v');
  await answerQuiz(p);
  await expectDone(p, 'm3b');
}
async function missionB4(p, ide) {
  if (ide === 'vscode') {
    await click(p, 'vs.explorer');
    await click(p, 'vs.new-file');
    await p.locator('[data-fk="vs.newfile-input"]').fill('.gitignore');
    await p.locator('[data-fk="vs.newfile-input"]').press('Enter');
  } else {
    await click(p, 'rs.files-.gitignore');
  }
  const ed = p.locator(T(ide === 'vscode' ? 'vs.editor' : 'rs.editor'));
  await ed.click();
  await ed.press('Control+End');
  await ed.type('entreprises.csv\n');
  await ed.press('Control+s');
  if (ide === 'vscode') {
    await click(p, 'vs.scm');
    assert(!(await p.locator('[data-fk="vs.change-entreprises.csv"]').count()), 'les données doivent être ignorées');
    await click(p, 'vs.stage-all');
    await fill(p, 'vs.commit-message', 'Ajoute le rapport et le script d’analyse');
    await click(p, 'vs.commit-button');
  } else {
    await click(p, 'rs.tab-git');
    for (let k = 0; k < 6; k++) {
      const box = p.locator('.rs-git .rs-git-table input[type=checkbox]:not(:checked)').first();
      if (!(await box.count())) break;
      await box.click();
      await p.waitForTimeout(50);
    }
    await click(p, 'rs.git-commit');
    await fill(p, 'rs.commit-message', 'Ajoute le rapport et le script d’analyse');
    await click(p, 'rs.commit-button');
    await p.locator('[data-fk="rsd-close"]').click();
    await p.locator('.rs-review [data-fk="rs.review-close"]').click();
  }
  await click(p, 'tb.tool-gitlab');
  await p.locator('.gl-logo').click();
  await click(p, 'gl.project-link');
  await expectDone(p, 'm4b');
}
async function missionB5(p, ide) {
  await click(p, 'tb.tool-ide');
  if (ide === 'vscode') {
    await click(p, 'vs.scm');
    await click(p, 'vs.publish');
    await authWithVault(p, ide);
  } else {
    await click(p, 'rs.tab-git');
    assert(await p.locator(T('rs.git-push')).first().isDisabled(), 'Push grisé sans branche suivie');
    await click(p, 'rs.tab-terminal');
    await termRun(p, ide, 'git push -u origin main');
    await termRun(p, ide, 'stagiaire');
    await click(p, 'tb.vault');
    await p.locator(T('vault.copy')).last().click();
    await p.keyboard.press('Escape');
    await click(p, 'auth.paste');
    await p.locator(T('rs.terminal-input')).press('Enter');
  }
  const w = await world(p);
  const tree = w.remote.projects['stagiaire/etude-entreprises'].commits[0].tree;
  assert(tree['rapport.qmd'] && !tree['entreprises.csv'], 'le premier push contient le travail, sans les données');
  await click(p, 'tb.tool-gitlab');
  await click(p, 'gl.nav-commits');
  await click(p, 'gl.project-link');
  await expectDone(p, 'm5b');
}
async function fullJourneyB(browser, base, ide) {
  const p = await newPage(browser, base, { query: `?mission=m1b&ide=${ide}` });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle' });
  await missionB1(p); await shot(p, `${ide}-b1`);
  await click(p, 'coach.next');
  await mission2(p, 'm2b'); await shot(p, `${ide}-b2`);
  await click(p, 'coach.next');
  await missionB3(p, ide); await shot(p, `${ide}-b3`);
  await click(p, 'coach.next');
  await missionB4(p, ide); await shot(p, `${ide}-b4`);
  await click(p, 'coach.next');
  await missionB5(p, ide); await shot(p, `${ide}-b5`);
  assert(!p.errors.length, 'erreurs JS : ' + p.errors.join(' | '));
  return p;
}

// ---- lancement ----
const srv = await serve();
const base = `http://localhost:${srv.address().port}${PREFIX}`;
const browser = await chromium.launch();

await check('le site fonctionne sous un sous-répertoire (pages, modules, styles, polices, icônes)', async () => {
  const p = await newPage(browser, base);
  const bad = [];
  p.on('response', (r) => { if (r.status() >= 400) bad.push(r.url()); });
  await p.reload({ waitUntil: 'networkidle' });
  for (const page of ['index.html', 'dans-mes-outils.html', 'glossaire.html', 'formatrice.html', 'a-propos.html']) {
    await p.goto(`${base}/${page}`, { waitUntil: 'networkidle' });
  }
  assert(!bad.length, 'ressources introuvables : ' + bad.join(', '));
  assert(!p.errors.length, p.errors.join(' | '));
});

await check('parcours A (de zéro) depuis un état vierge — VS Code', async () => { const p = await fullJourney(browser, base, 'vscode'); await p.context().close(); });
await check('parcours A (de zéro) depuis un état vierge — RStudio', async () => { const p = await fullJourney(browser, base, 'rstudio'); await p.context().close(); });
await check('parcours B (travail existant) depuis un état vierge — VS Code', async () => { const p = await fullJourneyB(browser, base, 'vscode'); await p.context().close(); });
await check('parcours B (travail existant) depuis un état vierge — RStudio', async () => { const p = await fullJourneyB(browser, base, 'rstudio'); await p.context().close(); });

await check('le jeton n’est plus affiché après avoir quitté sa page ; les indices ne valident rien', async () => {
  const p = await newPage(browser, base, { query: '?mission=m2' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle' });
  await click(p, 'coach.prepare').catch(() => {});
  await click(p, 'coach.help-1'); await click(p, 'coach.help-2'); await click(p, 'coach.help-3');
  assert(Object.keys((await prog(p, 'm2')).steps).length === 0, 'une aide a validé une étape');
  await click(p, 'gl.avatar'); await click(p, 'gl.edit-profile'); await click(p, 'gl.nav-access-tokens');
  await click(p, 'gl.generate-token'); await click(p, 'gl.legacy-token');
  await fill(p, 'gl.token-name', 'essai');
  await p.locator(`${T('gl.scope-read_repository')} input`).check();
  await click(p, 'gl.generate');
  assert(await p.locator('.gl-new-token').count() === 1, 'valeur affichée après création');
  await p.locator('.gl-logo').click();
  await click(p, 'gl.avatar'); await click(p, 'gl.edit-profile'); await click(p, 'gl.nav-access-tokens');
  assert(await p.locator('.gl-new-token').count() === 0, 'la valeur ne doit plus être affichée');
  const html = await p.locator('.gl-main').innerHTML();
  const w = await world(p);
  assert(!html.includes(w.tokens[0].value), 'la valeur du jeton apparaît encore dans la page');
  assert(w.tokens[0].lost === true, 'jeton marqué perdu');
  await p.locator('.coach-warn').waitFor({ timeout: 2000 }).catch(() => {});
  await p.context().close();
});

await check('une saisie qui n’est pas un jeton d’entraînement est écartée, jamais stockée', async () => {
  const p = await newPage(browser, base, { query: '?mission=m3&ide=vscode' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle' });
  await click(p, 'tb.tool-ide');
  await click(p, 'vs.terminal-tab').catch(async () => { await p.keyboard.press('Control+`'); });
  const term = p.locator(T('vs.terminal-input'));
  await term.fill('cd projets'); await term.press('Enter');
  await term.fill('git clone https://gitlab.example.com/stagiaire/etude-entreprises.git'); await term.press('Enter');
  await term.fill('stagiaire'); await term.press('Enter');
  await term.fill('glpat-VRAIJETONSECRET123'); await term.press('Enter');
  const text = await p.locator('.term-out').innerText();
  assert(!text.includes('VRAIJETONSECRET'), 'le secret est reproduit dans le terminal');
  const stored = await p.evaluate(() => localStorage.getItem('git-bac-a-sable/v1') || '');
  assert(!stored.includes('VRAIJETONSECRET'), 'le secret est stocké');
  await p.context().close();
});

await check('reprise de session et réinitialisation d’une mission', async () => {
  const p = await newPage(browser, base, { query: '?mission=m1' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle' });
  await mission1(p);
  await click(p, 'top.home');
  await p.waitForURL(/\/projet\/index\.html$/);
  await p.locator('#gbs-resume.is-on').waitFor();
  await p.locator('#gbs-resume a').click();
  await p.waitForFunction(() => !!window.__simApp);
  assert((await prog(p, 'm1')).status === 'done', 'progression perdue à la reprise');
  await click(p, 'top.restart');
  await p.getByRole('button', { name: 'Recommencer', exact: true }).click();
  const w = await world(p);
  assert(Object.keys(w.remote.projects).length === 0, 'la mission 1 repart d’un GitLab vide');
  await p.context().close();
});

await check('dépannage 6.5 : clonage en lecture, push refusé, correction', async () => {
  const p = await newPage(browser, base, { query: '?mission=d5&ide=vscode' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle' });
  await click(p, 'tb.tool-ide');
  await click(p, 'vs.scm');
  await click(p, 'vs.sync'); await click(p, 'vs.dialog-ok');
  await p.locator('.vs-notif.is-error').waitFor();
  assert((await p.locator('.vs-notif.is-error').innerText()).includes('You are not allowed to upload code.'), 'message 403');
  await click(p, 'tb.tool-gitlab');
  await click(p, 'gl.avatar'); await click(p, 'gl.edit-profile'); await click(p, 'gl.nav-access-tokens');
  await answerQuiz(p);
  await click(p, 'gl.generate-token'); await click(p, 'gl.legacy-token');
  await fill(p, 'gl.token-name', 'ecriture');
  await p.locator(`${T('gl.scope-write_repository')} input`).check();
  await click(p, 'gl.generate'); await click(p, 'gl.token-copy');
  await click(p, 'tb.vault'); await click(p, 'vault.save'); await p.keyboard.press('Escape');
  await click(p, 'tb.credentials'); await click(p, 'cred.delete'); await p.keyboard.press('Escape');
  await click(p, 'tb.tool-ide');
  await click(p, 'vs.sync'); await click(p, 'vs.dialog-ok');
  await authWithVault(p, 'vscode');
  await expectDone(p, 'd5');
  await p.context().close();
});

await check('clavier : créer le projet GitLab sans souris', async () => {
  const p = await newPage(browser, base, { query: '?mission=m1' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle' });
  await p.locator(T('gl.create-new')).focus();
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => document.activeElement && document.activeElement.dataset.target === 'gl.menu-new-project');
  await p.keyboard.press('Enter');
  await p.locator(T('gl.blank-card')).focus();
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => document.activeElement && document.activeElement.dataset.fk === 'gl-h1');
  await p.keyboard.press('Tab');
  await p.keyboard.type('etude-entreprises');
  await p.keyboard.press('Enter');
  await p.locator('.gl-readme').waitFor();
  const w = await world(p);
  assert(w.remote.projects['stagiaire/etude-entreprises'], 'projet créé au clavier');
  await p.context().close();
});

// ---- Accueil : le film ----
const filmState = (p) => p.evaluate(() => {
  const v = document.querySelector('#film video');
  return {
    t: v.currentTime, paused: v.paused,
    cover: !document.querySelector('.gbs-player-cover').hidden,
    error: !document.querySelector('.gbs-player-error').hidden,
    current: [...document.querySelectorAll('#film .gbs-chapter')].findIndex((a) => a.getAttribute('aria-current') === 'time'),
  };
});
// Attend que le film soit lancé au-delà de t secondes ; en cas d’échec, décrit l’état du lecteur.
async function filmAt(p, t) {
  try {
    await p.waitForFunction((x) => { const v = document.querySelector('#film video'); return v.currentTime >= x && !v.paused; }, t, { timeout: 15000 });
  } catch (e) {
    const st = await p.evaluate(() => {
      const v = document.querySelector('#film video');
      return { t: v.currentTime, paused: v.paused, readyState: v.readyState, networkState: v.networkState, erreur: v.error && v.error.code, panneau: !document.querySelector('.gbs-player-error').hidden };
    }).catch(() => ({}));
    throw new Error(`film attendu en lecture au-delà de ${t} s : ${JSON.stringify(st)}`);
  }
}

await check('accueil : le film se lit, se parcourt par chapitres et se reprend', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1368, height: 820 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(`${base}/index.html`, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle' });
  let s = await filmState(p);
  assert(s.cover && !s.error, 'couverture du film absente');
  assert(await p.locator('#film .gbs-chapter').count() === 6, 'six chapitres attendus');
  assert((await p.locator('.gbs-player-cover').getAttribute('aria-label')).startsWith('Lire le film'), 'nom accessible de la couverture');
  const h264 = await p.evaluate(() => document.createElement('video').canPlayType('video/mp4; codecs="avc1.640028, mp4a.40.2"'));
  if (!h264) {
    // Navigateur sans H.264 : le lecteur doit proposer le téléchargement, sans erreur JS.
    await p.locator('#film .gbs-chapter').nth(3).click();
    await p.locator('.gbs-player-error').waitFor({ state: 'visible', timeout: 15000 });
    assert(!errors.length, 'erreurs JS : ' + errors.join(' | '));
    results.push('     (navigateur sans H.264 : seul le message de repli a été vérifié)');
    return ctx.close();
  }
  // Un chapitre : la lecture part de son début, le chapitre est signalé comme en cours.
  await p.locator('#film .gbs-chapter').nth(3).click();
  await filmAt(p, 248.5);
  s = await filmState(p);
  assert(!s.cover && s.current === 3, `chapitre en cours : ${s.current}`);
  await shot(p, 'accueil-film-lecture');
  // La position est conservée, puis proposée à la reprise.
  await p.evaluate(() => document.querySelector('#film video').pause());
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('git-bac-a-sable/film')));
  assert(saved && saved.t >= 248 && saved.fin === false, 'position non conservée : ' + JSON.stringify(saved));
  await p.reload({ waitUntil: 'networkidle' });
  assert((await p.locator('.gbs-player-action').innerText()) === 'Reprendre', 'reprise non proposée');
  assert((await filmState(p)).current === 3, 'chapitre de reprise non signalé');
  await shot(p, 'accueil-film-reprise');
  await p.locator('.gbs-player-cover').click();
  await filmAt(p, 248);
  assert(await p.evaluate(() => document.activeElement === document.querySelector('#film video')), 'le focus doit passer au lecteur');
  // Après une pause plus loin, le bouton du bandeau reprend là où l’on s’est arrêté.
  await p.evaluate(() => { const v = document.querySelector('#film video'); v.currentTime = 300; v.pause(); window.scrollTo(0, 0); });
  await p.locator('[data-film-play]').click();
  await filmAt(p, 299.5);
  await p.waitForFunction(() => Math.abs(document.getElementById('film').getBoundingClientRect().top) < 80, null, { timeout: 5000 });
  assert(!errors.length, 'erreurs JS : ' + errors.join(' | '));
  await ctx.close();
});

await check('accueil : après une erreur passagère, « Réessayer » relance le film au même endroit', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1368, height: 820 } });
  const p = await ctx.newPage();
  await p.goto(`${base}/index.html`, { waitUntil: 'networkidle' });
  const h264 = await p.evaluate(() => document.createElement('video').canPlayType('video/mp4; codecs="avc1.640028, mp4a.40.2"'));
  if (!h264) { results.push('     (navigateur sans H.264 : reprise après erreur non vérifiée)'); return ctx.close(); }
  await p.locator('#film .gbs-chapter').nth(2).click();
  await filmAt(p, 151);
  // Erreur réseau simulée : le panneau propose de réessayer et de télécharger.
  await p.evaluate(() => document.querySelector('#film video').dispatchEvent(new Event('error')));
  await p.locator('.gbs-player-error').waitFor({ state: 'visible' });
  assert(await p.locator('[data-film-retry]').isVisible(), 'bouton « Réessayer » absent');
  await p.locator('[data-film-retry]').click();
  await filmAt(p, 150);
  assert(await p.locator('.gbs-player-error').isHidden(), 'le panneau d’erreur doit disparaître');
  await ctx.close();
});

await check('accueil : format refusé par le navigateur, téléchargement proposé sans « Réessayer »', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1368, height: 820 } });
  const p = await ctx.newPage();
  await p.addInitScript(() => { HTMLMediaElement.prototype.canPlayType = () => ''; });
  await p.goto(`${base}/index.html`, { waitUntil: 'networkidle' });
  assert(await p.locator('.gbs-player-error').isVisible(), 'message de repli absent');
  assert(await p.locator('[data-film-retry]').isHidden(), '« Réessayer » ne doit pas être proposé');
  assert(await p.locator('.gbs-player-cover').isHidden(), 'la couverture doit être masquée');
  await p.locator('[data-film-play]').click();
  await p.waitForFunction(() => location.hash === '#film');
  await ctx.close();
});

await check('accueil sans JavaScript : lecteur natif et liens de chapitres', async () => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const p = await ctx.newPage();
  await p.goto(`${base}/index.html`);
  assert(await p.locator('#film video[controls]').isVisible(), 'lecteur natif visible');
  assert(!(await p.locator('.gbs-player-cover').isVisible()), 'couverture masquée sans script');
  const href = await p.locator('#film .gbs-chapter').nth(2).getAttribute('href');
  assert(href === 'assets/film/synchroniser-onyxia-gitlab.mp4#t=151.2', 'lien de chapitre : ' + href);
  await ctx.close();
});

for (const [w, h] of [[1368, 768], [1440, 900], [1024, 768], [768, 1024], [390, 844]]) {
  await check(`accueil ${w}×${h} : film en 16:9, pas de défilement horizontal`, async () => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    await p.goto(`${base}/index.html`, { waitUntil: 'networkidle' });
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(over <= 1, `débordement horizontal de ${over}px`);
    const box = await p.locator('#film .gbs-player-frame').boundingBox();
    assert(box && Math.abs(box.width / box.height - 16 / 9) < 0.02, 'cadre du lecteur hors 16:9');
    if (SHOTS) { await shot(p, `accueil-${w}`); await p.locator('#film').evaluate((e) => e.scrollIntoView()); await shot(p, `accueil-${w}-film`); }
    await ctx.close();
  });
}

for (const [w, h] of [[1368, 768], [1440, 900], [1024, 768], [768, 1024], [390, 844]]) {
  await check(`mise en page ${w}×${h} : pas de défilement horizontal`, async () => {
    const p = await newPage(browser, base, { width: w, height: h, query: '?mission=m4&ide=vscode' });
    await p.evaluate(() => localStorage.clear());
    await p.reload({ waitUntil: 'networkidle' });
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(over <= 1, `débordement horizontal de ${over}px`);
    if (SHOTS) {
      await shot(p, `layout-${w}-gitlab`);
      if (w < 900) { await p.locator('[data-fk="mob.stage"]').click().catch(() => {}); }
      await click(p, 'tb.tool-ide');
      await shot(p, `layout-${w}-vscode`);
      await click(p, 'top.ide-rstudio');
      await shot(p, `layout-${w}-rstudio`);
      if (w < 900) { await p.locator('[data-fk="mob.coach"]').click(); await shot(p, `layout-${w}-coach`); }
    }
    assert(!p.errors.length, p.errors.join(' | '));
    await p.context().close();
  });
}

await browser.close();
srv.close();
console.log(results.join('\n'));
console.log(failures ? `\n${failures} échec(s)` : '\nTous les parcours passent.');
process.exit(failures ? 1 : 0);
