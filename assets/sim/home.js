// Accueil : reprise de session et état des missions (lecture seule du stockage local).
(function () {
  var KEY = 'git-bac-a-sable/v1';
  var TITLES = { m1: 'A1 · Créer mon dépôt distant', m2: 'A2 · Préparer mon accès', m3: 'A3 · Cloner dans mon environnement', m4: 'A4 · Enregistrer une modification', m5: 'A5 · Envoyer et vérifier', m1b: 'B1 · Créer un dépôt distant vide', m2b: 'B2 · Préparer mon accès', m3b: 'B3 · Relier mon dossier au dépôt GitLab', m4b: 'B4 · Choisir ce qui part dans le premier commit', m5b: 'B5 · Envoyer et vérifier', m7: 'Refaire seul (A)', m7b: 'Refaire seul (B)' };
  var GROUPS = { m1: ['m1', 'm2', 'm3', 'm4', 'm5'], m1b: ['m1b', 'm2b', 'm3b', 'm4b', 'm5b'], m7: ['m7', 'm7b'] };
  var data = null;
  try { data = JSON.parse(window.localStorage.getItem(KEY) || 'null'); } catch (e) { data = null; }
  if (!data || !data.progress) return;
  var p = data.progress;
  var status = function (id) { return p[id] ? p[id].status : 'todo'; };
  var label = { todo: 'À faire', started: 'En cours', done: 'Maîtrisé' };
  document.querySelectorAll('#gbs-missions li').forEach(function (li) {
    var id = li.getAttribute('data-m');
    var st;
    var ids = id === 'm6' ? ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9', 'd10'] : (GROUPS[id] || [id]);
    var done = ids.filter(function (x) { return status(x) === 'done'; }).length;
    st = done === ids.length ? 'Maîtrisé' : done ? done + ' / ' + ids.length + ' réussies' : (ids.some(function (x) { return status(x) === 'started'; }) ? 'En cours' : 'À faire');
    if (done === ids.length) li.querySelector('.gbs-m-status').classList.add('is-done');
    li.querySelector('.gbs-m-status').textContent = st;
  });
  var active = data.active;
  var box = document.getElementById('gbs-resume');
  if (box && active && p[active] && p[active].status !== 'todo') {
    var name = TITLES[active] || (active.charAt(0) === 'd' ? 'Exercice de dépannage ' + active.replace('d', '6.') : active);
    var t = document.createElement('p');
    t.style.margin = '0';
    t.textContent = 'Dernière mission ouverte : ' + name + (p[active].status === 'done' ? ' (réussie).' : '.');
    var a = document.createElement('a');
    a.className = 'gbs-btn gbs-btn-primary';
    a.href = 'bac-a-sable.html?mission=' + encodeURIComponent(active);
    a.textContent = 'Reprendre';
    box.appendChild(t);
    box.appendChild(a);
    box.classList.add('is-on');
  }
})();
