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
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };

function serve() {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!u.startsWith(PREFIX + '/')) { res.writeHead(404); return res.end('hors du sous-répertoire'); }
    let f = path.join(ROOT, u.slice(PREFIX.length));
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
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

async function mission2(p) {
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
  await expectDone(p, 'm2');
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

await check('parcours complet depuis un état vierge — VS Code', async () => { const p = await fullJourney(browser, base, 'vscode'); await p.context().close(); });
await check('parcours complet depuis un état vierge — RStudio', async () => { const p = await fullJourney(browser, base, 'rstudio'); await p.context().close(); });

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
  await p.goto(`${base}/index.html`, { waitUntil: 'networkidle' });
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
