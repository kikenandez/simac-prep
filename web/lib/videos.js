// lib/videos.js — vidéos de démonstration de l'accueil.
// Une seule vidéo joue à la fois, et tout s'arrête quand l'accueil se ferme (l'attribut hidden ne coupe pas le son).
const gate = document.getElementById('gate');
const videos = [...document.querySelectorAll('.gate-videos video')];
videos.forEach((v) => v.addEventListener('play', () => videos.forEach((o) => { if (o !== v) o.pause(); })));
if (gate) new MutationObserver(() => { if (gate.hidden) videos.forEach((v) => v.pause()); })
  .observe(gate, { attributes: true, attributeFilter: ['hidden'] });
