// Accueil : lecteur du film « Synchroniser Onyxia & GitLab ».
// Amélioration progressive : sans ce script, le lecteur natif et les liens de
// chapitres (fragments #t= vers le fichier MP4) restent utilisables.
// Seule la position de lecture est conservée dans le stockage local.
(function () {
  'use strict';
  var film = document.getElementById('film');
  if (!film) return;
  var player = film.querySelector('[data-film]');
  var video = film.querySelector('video');
  var source = video && video.querySelector('source');
  var cover = film.querySelector('.gbs-player-cover');
  var errorBox = film.querySelector('.gbs-player-error');
  var links = Array.prototype.slice.call(film.querySelectorAll('.gbs-chapter'));
  if (!player || !video || !cover || !links.length) return;

  var KEY = 'git-bac-a-sable/film';
  var DUREE = Number(player.getAttribute('data-duree')) || 564.6;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var starts = links.map(function (a) { return Number(a.getAttribute('data-t')) || 0; });
  var bars = links.map(function (a) { return a.querySelector('.gbs-chapter-bar > span'); });
  var current = -1;
  var pendingT = null;
  var failed = false;
  var lastSave = 0;

  // ---- utilitaires ----
  function duree() { return isFinite(video.duration) && video.duration > 0 ? video.duration : DUREE; }
  function mmss(t) { t = Math.max(0, Math.floor(t)); var s = t % 60; return Math.floor(t / 60) + ':' + (s < 10 ? '0' : '') + s; }
  function parle(t) {
    t = Math.max(0, Math.floor(t));
    var m = Math.floor(t / 60), s = t % 60;
    return (m ? m + (m > 1 ? ' minutes ' : ' minute ') : '') + s + (s > 1 ? ' secondes' : ' seconde');
  }
  function lire() {
    try {
      var v = JSON.parse(window.localStorage.getItem(KEY) || 'null');
      if (v && typeof v.t === 'number' && isFinite(v.t)) return { t: Math.max(0, v.t), fin: v.fin === true };
    } catch (e) { /* stockage indisponible : on repart du début */ }
    return null;
  }
  function ecrire(t, fin) {
    try { window.localStorage.setItem(KEY, JSON.stringify({ t: Math.round(t), fin: !!fin })); } catch (e) { /* sans effet */ }
  }

  // ---- chapitres : actif + progression ----
  function indexAt(t) {
    var i = 0;
    for (var k = 0; k < starts.length; k++) if (t + 0.25 >= starts[k]) i = k;
    return i;
  }
  function setActive(i) {
    if (i === current) return;
    current = i;
    links.forEach(function (a, k) {
      if (k === i) a.setAttribute('aria-current', 'time'); else a.removeAttribute('aria-current');
    });
  }
  function paint(t) {
    var d = duree();
    var i = indexAt(t);
    setActive(i);
    if (t > 0.5) film.classList.add('has-progress');
    bars.forEach(function (b, k) {
      if (!b) return;
      var a = starts[k], z = k + 1 < starts.length ? starts[k + 1] : d;
      var f = k < i ? 1 : k > i ? 0 : Math.min(1, Math.max(0, (t - a) / Math.max(1, z - a)));
      b.style.transform = 'scaleX(' + f.toFixed(4) + ')';
    });
  }

  // ---- couverture : lire / reprendre / revoir ----
  function cover_state() {
    var st = lire();
    var action = cover.querySelector('.gbs-player-action');
    var meta = cover.querySelector('.gbs-player-meta');
    var prog = cover.querySelector('.gbs-player-progress');
    var d = duree();
    if (st && st.fin) {
      action.textContent = 'Revoir le film';
      meta.textContent = mmss(Math.round(d)) + ' · déjà vu en entier';
      cover.setAttribute('aria-label', 'Revoir le film depuis le début, ' + parle(d));
      cover.setAttribute('data-from', '0');
    } else if (st && st.t > 5 && st.t < d - 5) {
      action.textContent = 'Reprendre';
      meta.textContent = 'à ' + mmss(st.t) + ' sur ' + mmss(Math.round(d));
      cover.setAttribute('aria-label', 'Reprendre le film à ' + parle(st.t));
      cover.setAttribute('data-from', String(st.t));
      if (prog) { prog.hidden = false; prog.firstElementChild.style.transform = 'scaleX(' + (st.t / d).toFixed(4) + ')'; }
      paint(st.t);
    } else {
      cover.setAttribute('aria-label', 'Lire le film, ' + parle(d));
      cover.setAttribute('data-from', '0');
    }
  }

  // ---- lecture ----
  function seek(t) {
    if (video.readyState >= 1) { try { video.currentTime = t; } catch (e) { /* ignoré */ } return; }
    pendingT = t;
    try { video.currentTime = t; } catch (e) { /* position appliquée au chargement */ }
  }
  video.addEventListener('loadedmetadata', function () {
    if (pendingT !== null && Math.abs(video.currentTime - pendingT) > 0.5) {
      try { video.currentTime = pendingT; } catch (e) { /* ignoré */ }
    }
    pendingT = null;
  });

  function start(t, focus) {
    if (failed) return;
    cover.hidden = true;
    player.classList.add('is-started');
    if (typeof t === 'number') { seek(t); paint(t); }
    var p = video.play();
    if (p && typeof p.catch === 'function') p.catch(function () { /* lecture refusée : les commandes natives restent là */ });
    if (focus) { try { video.focus({ preventScroll: true }); } catch (e) { video.focus(); } }
  }

  // Point de départ : la position mémorisée au chargement, sauf si la lecture a déjà commencé.
  function from() { return player.classList.contains('is-started') ? null : Number(cover.getAttribute('data-from')) || 0; }

  function inView(el) {
    var r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= (window.innerHeight || document.documentElement.clientHeight);
  }

  function fail() {
    if (failed) return;
    failed = true;
    cover.hidden = true;
    player.classList.add('is-error');
    film.classList.add('is-film-error');
    if (errorBox) errorBox.hidden = false;
  }

  // ---- branchements ----
  if (video.canPlayType && video.canPlayType('video/mp4') === '') { fail(); return; }
  player.classList.add('is-enhanced');
  cover.hidden = false;
  cover_state();

  cover.addEventListener('click', function () { start(from(), true); });

  film.querySelector('.gbs-chapters-list').addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('.gbs-chapter');
    if (!a || failed || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button > 0) return;
    ev.preventDefault();
    var k = links.indexOf(a);
    start(starts[k], false);
    if (!inView(player)) player.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-film-play]'), function (btn) {
    btn.addEventListener('click', function (ev) {
      if (failed) return;
      ev.preventDefault();
      film.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      start(from(), true);
    });
  });

  video.addEventListener('timeupdate', function () {
    paint(video.currentTime);
    var now = Date.now();
    if (now - lastSave > 3000 && !video.seeking) { lastSave = now; ecrire(video.currentTime, false); }
  });
  video.addEventListener('play', function () { player.classList.add('is-started'); cover.hidden = true; film.classList.add('is-playing'); });
  video.addEventListener('pause', function () {
    film.classList.remove('is-playing');
    if (!video.ended && video.currentTime > 0) ecrire(video.currentTime, false);
  });
  video.addEventListener('ended', function () { film.classList.remove('is-playing'); ecrire(0, true); });
  video.addEventListener('error', fail);
  if (source) source.addEventListener('error', fail);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && player.classList.contains('is-started') && !video.ended) ecrire(video.currentTime, false);
  });
})();
