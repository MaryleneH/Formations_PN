// Accueil : reprise de session et état des missions (lecture seule du stockage local).
(function () {
  var KEY = 'git-bac-a-sable/v1';
  var TITLES = { m1: 'Créer mon dépôt distant', m2: 'Préparer mon accès', m3: 'Cloner dans mon environnement', m4: 'Enregistrer une modification', m5: 'Envoyer et vérifier', m7: 'Refaire seul' };
  var data = null;
  try { data = JSON.parse(window.localStorage.getItem(KEY) || 'null'); } catch (e) { data = null; }
  if (!data || !data.progress) return;
  var p = data.progress;
  var status = function (id) { return p[id] ? p[id].status : 'todo'; };
  var label = { todo: 'À faire', started: 'En cours', done: 'Maîtrisé' };
  document.querySelectorAll('#gbs-missions li').forEach(function (li) {
    var id = li.getAttribute('data-m');
    var st;
    if (id === 'm6') {
      var ids = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9'];
      var done = ids.filter(function (x) { return status(x) === 'done'; }).length;
      st = done ? done + ' / 9 maîtrisés' : (ids.some(function (x) { return status(x) === 'started'; }) ? 'En cours' : 'À faire');
      if (done === 9) li.querySelector('.gbs-m-status').classList.add('is-done');
    } else {
      st = label[status(id)];
      if (status(id) === 'done') li.querySelector('.gbs-m-status').classList.add('is-done');
    }
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
