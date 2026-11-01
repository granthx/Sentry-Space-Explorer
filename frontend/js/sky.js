/* Animated night sky: three parallax star layers that twinkle, plus the occasional shooting star.
   Pure canvas, no libraries. Respects prefers-reduced-motion (draws one still frame). */
(function () {
  "use strict";

  var canvas = document.getElementById("sky");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  // depth: how strongly the layer reacts to scroll and pointer. density: stars per 10,000 px^2.
  var LAYERS = [
    { depth: 0.015, density: 1.3,  size: [0.5, 1.0], alpha: [0.35, 0.75] },
    { depth: 0.04,  density: 0.6,  size: [0.8, 1.5], alpha: [0.55, 0.95] },
    { depth: 0.09,  density: 0.16, size: [1.3, 2.3], alpha: [0.8, 1.0] }
  ];
  var TINTS = ["255,255,255", "205,220,255", "255,236,214", "190,255,240"];

  var W = 0, H = 0, stars = [], shooting = null, nextShot = 0;
  var pointerX = 0, pointerY = 0, targetX = 0, targetY = 0;
  var running = true, rafId = 0;

  function rand(a, b) { return a + Math.random() * (b - a); }

  function build() {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    stars = [];
    LAYERS.forEach(function (layer, li) {
      var count = Math.round((W * H / 10000) * layer.density);
      for (var i = 0; i < count; i++) {
        stars.push({
          layer: li,
          x: Math.random() * W,
          y: Math.random() * H,
          r: rand(layer.size[0], layer.size[1]),
          a: rand(layer.alpha[0], layer.alpha[1]),
          tint: TINTS[Math.floor(Math.random() * TINTS.length)],
          phase: Math.random() * Math.PI * 2,
          speed: rand(0.4, 1.6)
        });
      }
    });
  }

  function wrap(v, max) { return ((v % max) + max) % max; }

  function drawStar(s, t, scrollY) {
    var layer = LAYERS[s.layer];
    var x = wrap(s.x - pointerX * layer.depth * 40, W);
    var y = wrap(s.y - scrollY * layer.depth - pointerY * layer.depth * 40, H);
    var twinkle = reduceMotion ? 1 : 0.65 + 0.35 * Math.sin(t * 0.001 * s.speed + s.phase);
    var alpha = s.a * twinkle;

    ctx.fillStyle = "rgba(" + s.tint + "," + alpha.toFixed(3) + ")";
    ctx.beginPath();
    ctx.arc(x, y, s.r, 0, Math.PI * 2);
    ctx.fill();

    // the brightest layer gets a soft halo
    if (s.layer === 2) {
      var g = ctx.createRadialGradient(x, y, 0, x, y, s.r * 5);
      g.addColorStop(0, "rgba(" + s.tint + "," + (alpha * 0.35).toFixed(3) + ")");
      g.addColorStop(1, "rgba(" + s.tint + ",0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, s.r * 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function launchShootingStar(t) {
    var fromLeft = Math.random() > 0.5;
    var angle = rand(0.35, 0.7);                      // radians below horizontal
    var speed = rand(0.9, 1.5);                       // px per ms
    shooting = {
      x: fromLeft ? rand(-50, W * 0.5) : rand(W * 0.5, W + 50),
      y: rand(-20, H * 0.45),
      vx: (fromLeft ? 1 : -1) * Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      born: t,
      life: rand(650, 1000)
    };
    nextShot = t + rand(7000, 16000);
  }

  function drawShootingStar(t, dt) {
    if (!shooting) return;
    var age = t - shooting.born;
    if (age > shooting.life) { shooting = null; return; }
    shooting.x += shooting.vx * dt;
    shooting.y += shooting.vy * dt;
    var fade = 1 - age / shooting.life;
    var tail = 130;
    var len = Math.hypot(shooting.vx, shooting.vy);
    var tx = shooting.x - (shooting.vx / len) * tail;
    var ty = shooting.y - (shooting.vy / len) * tail;
    var g = ctx.createLinearGradient(shooting.x, shooting.y, tx, ty);
    g.addColorStop(0, "rgba(255,255,255," + (0.95 * fade).toFixed(3) + ")");
    g.addColorStop(1, "rgba(160,190,255,0)");
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(shooting.x, shooting.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
  }

  var last = 0;
  function frame(t) {
    var dt = Math.min(t - last, 50);
    last = t;

    // ease pointer toward target for smooth parallax
    pointerX += (targetX - pointerX) * 0.05;
    pointerY += (targetY - pointerY) * 0.05;

    ctx.clearRect(0, 0, W, H);
    var scrollY = window.scrollY || 0;
    for (var i = 0; i < stars.length; i++) drawStar(stars[i], t, scrollY);

    if (!shooting && t > nextShot) launchShootingStar(t);
    drawShootingStar(t, dt);

    if (running && !reduceMotion) rafId = requestAnimationFrame(frame);
  }

  function start() {
    cancelAnimationFrame(rafId);
    last = performance.now();
    nextShot = last + rand(2500, 5000);
    rafId = requestAnimationFrame(frame);
  }

  window.addEventListener("resize", function () {
    build();
    if (reduceMotion) frame(performance.now());
  });

  if (!reduceMotion) {
    window.addEventListener("pointermove", function (e) {
      targetX = e.clientX - W / 2;
      targetY = e.clientY - H / 2;
    }, { passive: true });

    document.addEventListener("visibilitychange", function () {
      running = !document.hidden;
      if (running) start(); else cancelAnimationFrame(rafId);
    });
  }

  build();
  if (reduceMotion) { frame(performance.now()); } else { start(); }
})();
