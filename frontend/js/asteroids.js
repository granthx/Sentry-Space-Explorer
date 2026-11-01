/* Space Explorer - Asteroids Module Page Logic.
   All text from the server is inserted with textContent, never as HTML.
   No frameworks, no build step. */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  function el(tag, props, children) {
    var node = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === "class") node.className = props[k];
      else if (k === "text") node.textContent = props[k];
      else node.setAttribute(k, props[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function safeUrl(url) {
    try {
      var u = new URL(url, location.href);
      return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
    } catch (e) { return null; }
  }

  function formatDate(d) {
    var year = d.getFullYear();
    var month = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function parseDate(s) {
    if (!s) return new Date();
    var parts = s.split("-");
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  }

  function prettyDate(iso) {
    if (!iso) return "-";
    var d = new Date(iso + "T00:00:00");
    return isNaN(d) ? iso : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function round(num, decimals) {
    if (num == null || isNaN(num)) return "-";
    var factor = Math.pow(10, decimals || 0);
    return (Math.round(num * factor) / factor).toLocaleString();
  }

  function sizeComparison(meters) {
    if (!meters || meters <= 0) return "Size not determined.";
    if (meters < 15) return "About the size of a city bus (" + round(meters, 1) + " m).";
    if (meters < 35) return "About the length of a blue whale or tennis court (" + round(meters, 1) + " m).";
    if (meters < 80) return "About as long as an Olympic swimming pool or passenger airliner (" + round(meters, 1) + " m).";
    if (meters < 150) return "About the length of a regulation football pitch (" + round(meters, 1) + " m).";
    if (meters < 350) return "About the height of the Eiffel Tower (" + round(meters, 1) + " m).";
    if (meters < 700) return "About the height of the Empire State Building (" + round(meters, 1) + " m).";
    return "Massive asteroid, larger than the world's tallest skyscrapers (" + round(meters, 1) + " m).";
  }

  // ------------------------------------------------------------- State
  var currentObjects = [];
  var currentSortCol = "miss_lunar";
  var currentSortAsc = true;
  var scatterChart = null;
  var globe3d = null;
  var lastTriggerElement = null;

  var startDateInput = $("start-date");
  var endDateInput = $("end-date");
  var valError = $("client-validation-error");
  var errorContainer = $("error-container");
  var offlineAlert = $("offline-alert");
  var drawer = $("asteroid-drawer");

  // ------------------------------------------------------------- Retro Synth Audio
  var audioCtx = null;
  var sentryAudioEnabled = localStorage.getItem("sentry_synth_audio") === "true";

  function initAudio() {
    if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioCtx();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  }

  function playSynthBlip(type) {
    if (!sentryAudioEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      var t = audioCtx.currentTime;
      if (type === "hazard") {
        // Warning alert tone
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(340, t);
        osc.frequency.exponentialRampToValueAtTime(170, t + 0.12);
        gain.gain.setValueAtTime(0.06, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.start(t);
        osc.stop(t + 0.12);
      } else if (type === "select") {
        // High-tech targeting lock-on chirp
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, t);
        osc.frequency.exponentialRampToValueAtTime(1760, t + 0.05);
        gain.gain.setValueAtTime(0.04, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        osc.start(t);
        osc.stop(t + 0.06);
      } else {
        // Subtle command blip
        osc.type = "sine";
        osc.frequency.setValueAtTime(1200, t);
        osc.frequency.exponentialRampToValueAtTime(1600, t + 0.03);
        gain.gain.setValueAtTime(0.025, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        osc.start(t);
        osc.stop(t + 0.04);
      }
    } catch (e) {}
  }

  function updateAudioToggleUI() {
    var btn = $("hud-audio-toggle");
    var txt = $("hud-audio-text");
    if (!btn || !txt) return;
    if (sentryAudioEnabled) {
      btn.classList.add("active");
      txt.textContent = "AUDIO: SYNTH [ON]";
    } else {
      btn.classList.remove("active");
      txt.textContent = "AUDIO: SYNTH [OFF]";
    }
  }

  var audioToggleBtn = $("hud-audio-toggle");
  if (audioToggleBtn) {
    updateAudioToggleUI();
    audioToggleBtn.addEventListener("click", function () {
      sentryAudioEnabled = !sentryAudioEnabled;
      localStorage.setItem("sentry_synth_audio", String(sentryAudioEnabled));
      updateAudioToggleUI();
      if (sentryAudioEnabled) {
        initAudio();
        playSynthBlip("select");
      }
    });
  }

  // ------------------------------------------------------------- Live UTC Clock
  function updateHudClock() {
    var clockEl = $("hud-clock");
    if (!clockEl) return;
    var now = new Date();
    var y = now.getUTCFullYear();
    var months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    var m = months[now.getUTCMonth()];
    var d = String(now.getUTCDate()).padStart(2, "0");
    var hh = String(now.getUTCHours()).padStart(2, "0");
    var mm = String(now.getUTCMinutes()).padStart(2, "0");
    var ss = String(now.getUTCSeconds()).padStart(2, "0");
    clockEl.textContent = y + "-" + m + "-" + d + " " + hh + ":" + mm + ":" + ss + "Z";
  }
  updateHudClock();
  setInterval(updateHudClock, 1000);

  // ------------------------------------------------------------- Status / Nav
  function setNav(state, label) {
    var dot = $("nav-dot");
    var txt = $("nav-status");
    if (dot) dot.dataset.state = state;
    if (txt) txt.textContent = label;
  }

  function loadStatus() {
    window.SpaceAPI.health().then(function (h) {
      setNav("ok", "Backend online");
      if (offlineAlert) offlineAlert.style.display = "none";
      var stBackend = $("st-backend");
      var stKey = $("st-key");
      var stRate = $("st-rate");
      var stPhase = $("st-phase");
      if (stBackend) stBackend.textContent = "Online, version " + h.version;
      if (stKey) stKey.textContent = h.api_key_mode === "demo" ? "Demo key (30 requests/hour)" : "Your own key";
      var rem = h.rate_limit && h.rate_limit.remaining;
      var lim = h.rate_limit && h.rate_limit.limit;
      if (stRate) stRate.textContent = rem == null ? "Not used yet" : (lim ? rem + " of " + lim : String(rem));
      if (stPhase) stPhase.textContent = "Phase " + h.phase;
    }).catch(function () {
      setNav("down", "Backend offline");
      if (offlineAlert) offlineAlert.style.display = "block";
      var stBackend = $("st-backend");
      if (stBackend) stBackend.textContent = "Offline";
    });

    window.SpaceAPI.docsUrl().then(function (url) {
      var dl = $("docs-link");
      if (dl) dl.href = url;
    }).catch(function () {});
  }

  // ------------------------------------------------------------- Validation
  function validateClientWindow(startStr, endStr) {
    if (!startStr || !endStr) return "Please choose both start and end dates.";
    var s = parseDate(startStr);
    var e = parseDate(endStr);
    if (e < s) return "End date cannot be earlier than start date.";
    var diffDays = Math.round((e.getTime() - s.getTime()) / (1000 * 3600 * 24));
    if (diffDays > 6) return "The date window can be at most 7 days (end date - start date <= 6 days). Selected: " + (diffDays + 1) + " days.";
    return null;
  }

  function showValidationError(msg) {
    if (msg) {
      valError.textContent = msg;
      valError.style.display = "block";
    } else {
      valError.textContent = "";
      valError.style.display = "none";
    }
  }

  // ------------------------------------------------------------- Summary Tiles
  function renderSummary(data) {
    var container = $("summary-tiles");
    container.replaceChildren();

    var count = data.count || 0;
    var haz = data.hazardous_count || 0;
    var hl = data.highlights || {};

    // 1. Total objects
    container.appendChild(el("div", { class: "tile" }, [
      el("span", { class: "tile-label", text: "Objects found" }),
      el("span", { class: "tile-val", text: String(count) }),
      el("span", { class: "tile-sub", text: "Near-Earth asteroids" })
    ]));

    // 2. Potentially hazardous
    container.appendChild(el("div", { class: "tile" }, [
      el("span", { class: "tile-label", text: "Potentially Hazardous" }),
      el("span", { class: "tile-val " + (haz > 0 ? "hazard" : ""), text: String(haz) }),
      el("span", { class: "tile-sub", text: haz === 1 ? "1 flagged object" : haz + " flagged objects" })
    ]));

    // 3. Closest pass
    var closestTile = el("div", { class: "tile" }, [
      el("span", { class: "tile-label", text: "Closest pass" })
    ]);
    if (hl.closest) {
      var btnClose = el("button", { type: "button", class: "tile-btn", text: hl.closest.name || hl.closest.id });
      btnClose.addEventListener("click", function () { openDrawer(hl.closest.id, btnClose); });
      closestTile.appendChild(btnClose);
      closestTile.appendChild(el("span", { class: "tile-val", text: round(hl.closest.miss_lunar, 1) + " LD" }));
      closestTile.appendChild(el("span", { class: "tile-sub", text: prettyDate(hl.closest.date) }));
    } else {
      closestTile.appendChild(el("span", { class: "tile-sub", text: "None in window" }));
    }
    container.appendChild(closestTile);

    // 4. Fastest
    var fastestTile = el("div", { class: "tile" }, [
      el("span", { class: "tile-label", text: "Fastest relative speed" })
    ]);
    if (hl.fastest) {
      var btnFast = el("button", { type: "button", class: "tile-btn", text: hl.fastest.name || hl.fastest.id });
      btnFast.addEventListener("click", function () { openDrawer(hl.fastest.id, btnFast); });
      fastestTile.appendChild(btnFast);
      fastestTile.appendChild(el("span", { class: "tile-val", text: round(hl.fastest.velocity_kms, 1) + " km/s" }));
      fastestTile.appendChild(el("span", { class: "tile-sub", text: prettyDate(hl.fastest.date) }));
    } else {
      fastestTile.appendChild(el("span", { class: "tile-sub", text: "None in window" }));
    }
    container.appendChild(fastestTile);

    // 5. Largest
    var largestTile = el("div", { class: "tile" }, [
      el("span", { class: "tile-label", text: "Largest estimated size" })
    ]);
    if (hl.largest) {
      var btnLarge = el("button", { type: "button", class: "tile-btn", text: hl.largest.name || hl.largest.id });
      btnLarge.addEventListener("click", function () { openDrawer(hl.largest.id, btnLarge); });
      largestTile.appendChild(btnLarge);
      largestTile.appendChild(el("span", { class: "tile-val", text: round(hl.largest.diameter_m_avg, 0) + " m" }));
      largestTile.appendChild(el("span", { class: "tile-sub", text: "Avg estimated diameter" }));
    } else {
      largestTile.appendChild(el("span", { class: "tile-sub", text: "None in window" }));
    }
    container.appendChild(largestTile);
  }

  // ------------------------------------------------------------- Distance Radar (SVG)
  function stableHash(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) - h) + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  }

  function renderRadar(objects, startStr, endStr) {
    var container = $("radar-container");
    container.replaceChildren();

    var size = 460;
    var center = size / 2;
    var maxR = center - 26;
    var minR = 28;

    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + size + " " + size);
    svg.setAttribute("class", "radar-svg");
    svg.setAttribute("role", "graphics-document");
    svg.setAttribute("aria-label", "Distance radar plotting near-Earth objects in lunar distances");

    // 1. Defs: Linear gradient for phosphor sweep trail wedge
    var defs = document.createElementNS(NS, "defs");

    var sweepGrad = document.createElementNS(NS, "linearGradient");
    sweepGrad.setAttribute("id", "radar-sweep-grad");
    sweepGrad.setAttribute("x1", "100%");
    sweepGrad.setAttribute("y1", "0%");
    sweepGrad.setAttribute("x2", "0%");
    sweepGrad.setAttribute("y2", "100%");

    var stop1 = document.createElementNS(NS, "stop");
    stop1.setAttribute("offset", "0%");
    stop1.setAttribute("stop-color", "#00ffc4");
    stop1.setAttribute("stop-opacity", "0.45");
    sweepGrad.appendChild(stop1);

    var stop2 = document.createElementNS(NS, "stop");
    stop2.setAttribute("offset", "55%");
    stop2.setAttribute("stop-color", "#00ffc4");
    stop2.setAttribute("stop-opacity", "0.12");
    sweepGrad.appendChild(stop2);

    var stop3 = document.createElementNS(NS, "stop");
    stop3.setAttribute("offset", "100%");
    stop3.setAttribute("stop-color", "#00ffc4");
    stop3.setAttribute("stop-opacity", "0");
    sweepGrad.appendChild(stop3);

    defs.appendChild(sweepGrad);
    svg.appendChild(defs);

    // 2. Compass Azimuth outer ring & degree tick marks
    var azRing = document.createElementNS(NS, "circle");
    azRing.setAttribute("cx", String(center));
    azRing.setAttribute("cy", String(center));
    azRing.setAttribute("r", String(maxR + 4));
    azRing.setAttribute("class", "radar-azimuth-ring");
    svg.appendChild(azRing);

    for (var deg = 0; deg < 360; deg += 15) {
      var isMajor = deg % 45 === 0;
      var rad = (deg * Math.PI) / 180;
      var rOuter = maxR + 4;
      var rInner = rOuter - (isMajor ? 7 : 3);
      var x1 = center + rOuter * Math.sin(rad);
      var y1 = center - rOuter * Math.cos(rad);
      var x2 = center + rInner * Math.sin(rad);
      var y2 = center - rInner * Math.cos(rad);

      var tick = document.createElementNS(NS, "line");
      tick.setAttribute("x1", round(x1, 1));
      tick.setAttribute("y1", round(y1, 1));
      tick.setAttribute("x2", round(x2, 1));
      tick.setAttribute("y2", round(y2, 1));
      tick.setAttribute("class", isMajor ? "radar-azimuth-tick major" : "radar-azimuth-tick");
      svg.appendChild(tick);
    }

    var compass = [
      { deg: "000°", x: center, y: center - maxR - 13 },
      { deg: "090°", x: center + maxR + 15, y: center },
      { deg: "180°", x: center, y: center + maxR + 15 },
      { deg: "270°", x: center - maxR - 15, y: center }
    ];
    compass.forEach(function (c) {
      var txt = document.createElementNS(NS, "text");
      txt.setAttribute("x", String(c.x));
      txt.setAttribute("y", String(c.y));
      txt.setAttribute("class", "radar-azimuth-text");
      txt.textContent = c.deg;
      svg.appendChild(txt);
    });

    // Rings at 1, 5, 20, 100 LD using log scale
    var rings = [
      { ld: 1, label: "1 LD (Moon)" },
      { ld: 5, label: "5 LD" },
      { ld: 20, label: "20 LD" },
      { ld: 100, label: "100 LD" }
    ];

    var minLd = 0.5;
    var maxLd = 120;
    var logMin = Math.log10(minLd);
    var logMax = Math.log10(maxLd);

    function ldToRadius(ld) {
      if (!ld || ld <= 0) return minR;
      var clamped = Math.max(minLd, Math.min(ld, maxLd));
      var t = (Math.log10(clamped) - logMin) / (logMax - logMin);
      return minR + t * (maxR - minR);
    }

    // Axes
    var axis1 = document.createElementNS(NS, "line");
    axis1.setAttribute("x1", "10"); axis1.setAttribute("y1", String(center));
    axis1.setAttribute("x2", String(size - 10)); axis1.setAttribute("y2", String(center));
    axis1.setAttribute("class", "radar-axis");
    svg.appendChild(axis1);

    var axis2 = document.createElementNS(NS, "line");
    axis2.setAttribute("x1", String(center)); axis2.setAttribute("y1", "10");
    axis2.setAttribute("x2", String(center)); axis2.setAttribute("y2", String(size - 10));
    axis2.setAttribute("class", "radar-axis");
    svg.appendChild(axis2);

    // Draw rings
    rings.forEach(function (rInfo) {
      var r = ldToRadius(rInfo.ld);
      var circle = document.createElementNS(NS, "circle");
      circle.setAttribute("cx", String(center));
      circle.setAttribute("cy", String(center));
      circle.setAttribute("r", String(r));
      circle.setAttribute("class", rInfo.ld === 1 ? "radar-1ld-ring" : "radar-bg-ring");
      svg.appendChild(circle);

      var txt = document.createElementNS(NS, "text");
      txt.setAttribute("x", String(center + 6));
      txt.setAttribute("y", String(center - r + 13));
      txt.setAttribute("class", "radar-ring-text");
      txt.textContent = rInfo.label;
      svg.appendChild(txt);
    });

    // Rotating 360-degree radar sweep beam
    var sweepGroup = document.createElementNS(NS, "g");
    sweepGroup.setAttribute("class", "radar-sweep-beam");
    sweepGroup.setAttribute("id", "radar-sweep-beam");
    sweepGroup.style.transformOrigin = center + "px " + center + "px";

    var sweepLine = document.createElementNS(NS, "line");
    sweepLine.setAttribute("x1", String(center));
    sweepLine.setAttribute("y1", String(center));
    sweepLine.setAttribute("x2", String(center));
    sweepLine.setAttribute("y2", String(center - maxR));
    sweepLine.setAttribute("class", "radar-sweep-line");
    sweepGroup.appendChild(sweepLine);

    var radTrail = (32 * Math.PI) / 180;
    var trailX = center - maxR * Math.sin(radTrail);
    var trailY = center - maxR * Math.cos(radTrail);
    var sweepTrail = document.createElementNS(NS, "path");
    var trailD = "M " + center + " " + center + " L " + center + " " + (center - maxR) + " A " + maxR + " " + maxR + " 0 0 0 " + round(trailX, 1) + " " + round(trailY, 1) + " Z";
    sweepTrail.setAttribute("d", trailD);
    sweepTrail.setAttribute("class", "radar-sweep-trail");
    sweepTrail.setAttribute("fill", "url(#radar-sweep-grad)");
    sweepGroup.appendChild(sweepTrail);

    svg.appendChild(sweepGroup);

    // Earth at center
    var earth = document.createElementNS(NS, "circle");
    earth.setAttribute("cx", String(center));
    earth.setAttribute("cy", String(center));
    earth.setAttribute("r", "9");
    earth.setAttribute("fill", "#00ffc4");
    earth.setAttribute("stroke", "#ff8c3b");
    earth.setAttribute("stroke-width", "2");
    svg.appendChild(earth);

    var earthLabel = document.createElementNS(NS, "text");
    earthLabel.setAttribute("x", String(center));
    earthLabel.setAttribute("y", String(center + 22));
    earthLabel.setAttribute("text-anchor", "middle");
    earthLabel.setAttribute("fill", "#ff8c3b");
    earthLabel.setAttribute("font-size", "11");
    earthLabel.setAttribute("font-weight", "700");
    earthLabel.setAttribute("font-family", "Share Tech Mono, monospace");
    earthLabel.textContent = "Earth";
    svg.appendChild(earthLabel);

    // Asteroids
    var sDate = parseDate(startStr);
    var eDate = parseDate(endStr);
    var totalTime = Math.max(1, eDate.getTime() - sDate.getTime());

    objects.forEach(function (ast) {
      var ld = ast.miss_lunar != null ? ast.miss_lunar : 50;
      var r = ldToRadius(ld);

      // Angle: date proportion (0..2PI) + pseudo-random jitter from ID
      var astDate = parseDate(ast.date);
      var timeDiff = Math.max(0, astDate.getTime() - sDate.getTime());
      var frac = timeDiff / totalTime;
      var jitter = (stableHash(ast.id || "0") % 100) / 100.0 * 0.4 - 0.2;
      var angle = frac * 2 * Math.PI + jitter;

      var x = center + r * Math.cos(angle);
      var y = center + r * Math.sin(angle);

      // Circle size: clamped to 4-16 px
      var diam = ast.diameter_m_avg || 30;
      var cr = Math.max(4, Math.min(16, 4 + Math.sqrt(diam) * 0.45));

      var blipGroup = document.createElementNS(NS, "g");
      blipGroup.setAttribute("class", "radar-blip-group");
      blipGroup.setAttribute("data-id", String(ast.id));
      blipGroup.setAttribute("data-date", ast.date || "");

      // Target proximity pulse ring
      var pulseRing = document.createElementNS(NS, "circle");
      pulseRing.setAttribute("cx", String(x));
      pulseRing.setAttribute("cy", String(y));
      pulseRing.setAttribute("r", String(cr + 4));
      pulseRing.setAttribute("class", "radar-blip-pulse");
      pulseRing.setAttribute("stroke", ast.hazardous ? "#ff3355" : "#00ffc4");
      pulseRing.setAttribute("fill", "none");
      pulseRing.style.opacity = "0";
      blipGroup.appendChild(pulseRing);

      var circle = document.createElementNS(NS, "circle");
      circle.setAttribute("cx", String(x));
      circle.setAttribute("cy", String(y));
      circle.setAttribute("r", String(cr));
      circle.setAttribute("class", "radar-asteroid");
      circle.setAttribute("tabindex", "0");
      circle.setAttribute("role", "button");
      circle.setAttribute("aria-label", (ast.name || ast.id) + ", " + round(ast.miss_lunar, 1) + " LD, " + (ast.hazardous ? "Hazardous" : "Safe"));

      if (ast.hazardous) {
        circle.setAttribute("fill", "#ff3355");
        circle.setAttribute("stroke", "#ff6b8b");
        circle.setAttribute("stroke-width", "2");
        circle.setAttribute("stroke-dasharray", "3 2");
      } else {
        circle.setAttribute("fill", "#00ffc4");
        circle.setAttribute("stroke", "#00e5a3");
        circle.setAttribute("stroke-width", "1.5");
      }

      var tip = document.createElementNS(NS, "title");
      tip.textContent = (ast.name || ast.id) + "\nDistance: " + round(ast.miss_lunar, 2) + " LD (" + round(ast.miss_km, 0) + " km)\nDiameter: ~" + round(ast.diameter_m_avg, 0) + " m\nSpeed: " + round(ast.velocity_kms, 1) + " km/s\nHazard: " + (ast.hazardous ? "Potentially Hazardous" : "Safe");
      circle.appendChild(tip);

      circle.addEventListener("click", function () { openDrawer(ast.id, circle); });
      circle.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openDrawer(ast.id, circle);
        }
      });

      blipGroup.appendChild(circle);
      svg.appendChild(blipGroup);
    });

    container.appendChild(svg);
  }

  function updateRadarHighlights(curMs, objects) {
    var svg = document.querySelector(".radar-svg");
    if (!svg || !objects || !objects.length) return;

    var closestAst = null;
    var minDiff = Infinity;

    objects.forEach(function (ast) {
      if (!ast.date) return;
      var t = parseDate(ast.date).getTime() + 12 * 3600 * 1000;
      var diff = Math.abs(curMs - t);
      if (diff < minDiff) {
        minDiff = diff;
        closestAst = ast;
      }
    });

    var blipGroups = svg.querySelectorAll(".radar-blip-group");
    blipGroups.forEach(function (grp) {
      var id = grp.getAttribute("data-id");
      var isClosest = closestAst && String(closestAst.id) === id;
      var pulseRing = grp.querySelector(".radar-blip-pulse");
      if (pulseRing) {
        if (isClosest && minDiff < 18 * 3600 * 1000) {
          pulseRing.style.opacity = "1";
        } else {
          pulseRing.style.opacity = "0";
        }
      }
    });
  }

  // ------------------------------------------------------------- Scatter Chart (Chart.js)
  function renderScatterChart(objects) {
    var canvas = $("scatter-chart");
    if (!canvas || !window.Chart) return;

    var safePoints = [];
    var hazardPoints = [];

    objects.forEach(function (ast) {
      if (ast.velocity_kms != null && ast.diameter_m_avg != null && ast.diameter_m_avg > 0) {
        var pt = {
          x: ast.velocity_kms,
          y: ast.diameter_m_avg,
          name: ast.name || ast.id,
          id: ast.id,
          hazardous: ast.hazardous
        };
        if (ast.hazardous) hazardPoints.push(pt);
        else safePoints.push(pt);
      }
    });

    if (scatterChart) {
      scatterChart.destroy();
      scatterChart = null;
    }

    var ctx = canvas.getContext("2d");
    scatterChart = new window.Chart(ctx, {
      type: "scatter",
      data: {
        datasets: [
          {
            label: "Standard NEO",
            data: safePoints,
            backgroundColor: "rgba(56, 225, 198, 0.8)",
            borderColor: "#38e1c6",
            pointRadius: 6,
            pointHoverRadius: 9
          },
          {
            label: "Potentially Hazardous",
            data: hazardPoints,
            backgroundColor: "rgba(255, 159, 90, 0.9)",
            borderColor: "#ff9f5a",
            pointRadius: 7,
            pointHoverRadius: 10
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: function (evt, elements) {
          if (elements && elements.length > 0) {
            var elIdx = elements[0].index;
            var dsIdx = elements[0].datasetIndex;
            var pt = scatterChart.data.datasets[dsIdx].data[elIdx];
            if (pt && pt.id) openDrawer(pt.id, canvas);
          }
        },
        plugins: {
          legend: {
            labels: {
              color: "#eef2ff",
              font: { family: "Figtree", size: 12 }
            }
          },
          tooltip: {
            backgroundColor: "rgba(10, 14, 42, 0.92)",
            titleColor: "#eef2ff",
            bodyColor: "#cfd6f3",
            borderColor: "rgba(160, 175, 255, 0.3)",
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: function (context) {
                var raw = context.raw;
                return [
                  raw.name + (raw.hazardous ? " (Hazardous)" : ""),
                  "Speed: " + round(raw.x, 1) + " km/s",
                  "Avg Diameter: " + round(raw.y, 0) + " m"
                ];
              }
            }
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: "Relative velocity (km/s)",
              color: "#a3acd0",
              font: { family: "Figtree", size: 12 }
            },
            ticks: { color: "#a3acd0", font: { family: "Figtree" } },
            grid: { color: "rgba(160, 175, 255, 0.1)", drawBorder: false }
          },
          y: {
            type: "logarithmic",
            title: {
              display: true,
              text: "Estimated diameter in metres (log)",
              color: "#a3acd0",
              font: { family: "Figtree", size: 12 }
            },
            ticks: {
              color: "#a3acd0",
              font: { family: "Figtree" },
              callback: function (val) {
                if (val === 1 || val === 10 || val === 100 || val === 1000 || val === 10000) return val + " m";
                return "";
              }
            },
            grid: { color: "rgba(160, 175, 255, 0.1)", drawBorder: false }
          }
        }
      }
    });
  }

  // ------------------------------------------------------------- Sortable Table
  function sortObjects(col) {
    if (currentSortCol === col) {
      currentSortAsc = !currentSortAsc;
    } else {
      currentSortCol = col;
      currentSortAsc = true;
    }

    currentObjects.sort(function (a, b) {
      var valA = a[col];
      var valB = b[col];

      if (valA == null && valB == null) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;

      if (typeof valA === "string") {
        return currentSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return currentSortAsc ? valA - valB : valB - valA;
    });

    updateTableHeaders();
    renderTableRows();
  }

  function updateTableHeaders() {
    var buttons = document.querySelectorAll(".th-btn");
    buttons.forEach(function (btn) {
      var col = btn.getAttribute("data-col");
      var icon = btn.querySelector(".sort-icon");
      if (col === currentSortCol) {
        btn.classList.add("active");
        btn.setAttribute("aria-sort", currentSortAsc ? "ascending" : "descending");
        if (icon) icon.textContent = currentSortAsc ? "↑" : "↓";
      } else {
        btn.classList.remove("active");
        btn.setAttribute("aria-sort", "none");
        if (icon) icon.textContent = "↕";
      }
    });
  }

  function renderTableRows() {
    var tbody = $("table-body");
    var empty = $("empty-state");
    tbody.replaceChildren();

    if (!currentObjects || currentObjects.length === 0) {
      if (empty) empty.style.display = "block";
      return;
    }
    if (empty) empty.style.display = "none";

    currentObjects.forEach(function (ast) {
      var tr = el("tr", { tabindex: "0", role: "button", "aria-label": "Inspect " + (ast.name || ast.id) });

      var tdName = el("td", { "data-label": "Name" });
      var btnName = el("button", { type: "button", class: "ast-row-btn", text: ast.name || ast.id });
      tdName.appendChild(btnName);

      var tdDate = el("td", { "data-label": "Date", text: prettyDate(ast.date) });
      var tdDist = el("td", { "data-label": "Distance (LD)", text: round(ast.miss_lunar, 2) });
      var tdDiam = el("td", { "data-label": "Diameter (m)", text: ast.diameter_m_avg != null ? round(ast.diameter_m_avg, 1) : "-" });
      var tdSpeed = el("td", { "data-label": "Speed (km/s)", text: round(ast.velocity_kms, 1) });

      var tdHaz = el("td", { "data-label": "Hazard" });
      var hazBadge = el("span", {
        class: "hazard-badge " + (ast.hazardous ? "yes" : "no"),
        text: ast.hazardous ? "Hazardous" : "Standard"
      });
      tdHaz.appendChild(hazBadge);

      tr.appendChild(tdName);
      tr.appendChild(tdDate);
      tr.appendChild(tdDist);
      tr.appendChild(tdDiam);
      tr.appendChild(tdSpeed);
      tr.appendChild(tdHaz);

      tr.addEventListener("click", function () { openDrawer(ast.id, tr); });
      tr.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openDrawer(ast.id, tr);
        }
      });

      tbody.appendChild(tr);
    });
  }

  // ------------------------------------------------------------- Detail Drawer
  // ------------------------------------------------------------- 3D Holographic Wireframe Preview (Phase D)
  var holoAnimId = null;

  function stopHoloPreview() {
    if (holoAnimId) {
      cancelAnimationFrame(holoAnimId);
      holoAnimId = null;
    }
  }

  function startHoloPreview(canvas, detail) {
    stopHoloPreview();
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    var w = canvas.width;
    var h = canvas.height;
    var isHazard = !!detail.hazardous;

    var phi = 1.6180339887;
    var rawVerts = [
      [-1,  phi, 0], [ 1,  phi, 0], [-1, -phi, 0], [ 1, -phi, 0],
      [ 0, -1,  phi], [ 0,  1,  phi], [ 0, -1, -phi], [ 0,  1, -phi],
      [ phi, 0, -1], [ phi, 0,  1], [-phi, 0, -1], [-phi, 0,  1]
    ];
    var edges = [
      [0,1],[0,5],[0,7],[0,10],[0,11],[1,5],[1,7],[1,8],[1,9],[2,3],
      [2,4],[2,6],[2,10],[2,11],[3,4],[3,6],[3,8],[3,9],[4,5],[4,9],
      [4,11],[5,9],[5,11],[6,7],[6,8],[6,10],[7,8],[7,10],[8,9],[10,11]
    ];

    var hash = 0;
    var idStr = String(detail.id || "0");
    for (var k = 0; k < idStr.length; k++) hash = (hash << 5) - hash + idStr.charCodeAt(k);
    hash = Math.abs(hash);

    var R = 44;
    var verts = [];
    for (var i = 0; i < rawVerts.length; i++) {
      var v = rawVerts[i];
      var len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
      var perturb = 1.0 + (((hash + i * 17) % 35) - 17) / 100.0;
      verts.push({
        x: (v[0] / len) * R * perturb,
        y: (v[1] / len) * R * perturb,
        z: (v[2] / len) * R * perturb
      });
    }

    var rotY = 0;
    var rotX = 0.25;

    function renderHolo() {
      rotY += 0.016;
      ctx.clearRect(0, 0, w, h);

      var cx = w / 2;
      var cy = h / 2;

      ctx.save();
      // Reticle circle
      ctx.strokeStyle = "rgba(0, 255, 196, 0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.35, 0, Math.PI * 2);
      ctx.stroke();

      // Crosshairs
      ctx.beginPath();
      ctx.moveTo(cx - R * 1.5, cy); ctx.lineTo(cx - R * 0.9, cy);
      ctx.moveTo(cx + R * 0.9, cy); ctx.lineTo(cx + R * 1.5, cy);
      ctx.moveTo(cx, cy - R * 1.5); ctx.lineTo(cx, cy - R * 0.9);
      ctx.moveTo(cx, cy + R * 0.9); ctx.lineTo(cx, cy + R * 1.5);
      ctx.stroke();

      // Project vertices
      var proj = [];
      var cosY = Math.cos(rotY), sinY = Math.sin(rotY);
      var cosX = Math.cos(rotX), sinX = Math.sin(rotX);

      for (var j = 0; j < verts.length; j++) {
        var p = verts[j];
        var x1 = p.x * cosY + p.z * sinY;
        var z1 = -p.x * sinY + p.z * cosY;
        var y2 = p.y * cosX - z1 * sinX;
        var z2 = p.y * sinX + z1 * cosX;

        var fov = 300 / (300 - z2);
        proj.push({
          x: cx + x1 * fov,
          y: cy - y2 * fov,
          z: z2
        });
      }

      // Draw wireframe edges
      ctx.strokeStyle = isHazard ? "rgba(255, 51, 85, 0.85)" : "rgba(0, 255, 196, 0.85)";
      ctx.lineWidth = 1.3;
      ctx.shadowColor = isHazard ? "rgba(255, 51, 85, 0.8)" : "rgba(0, 255, 196, 0.8)";
      ctx.shadowBlur = 6;

      ctx.beginPath();
      for (var e = 0; e < edges.length; e++) {
        var p1 = proj[edges[e][0]];
        var p2 = proj[edges[e][1]];
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Draw vertex nodes
      ctx.fillStyle = "#ffffff";
      for (var n = 0; n < proj.length; n++) {
        ctx.fillRect(proj[n].x - 1.5, proj[n].y - 1.5, 3, 3);
      }

      // Vertical laser scan line
      var scanY = cy + Math.sin(Date.now() * 0.0035) * (R * 1.25);
      ctx.strokeStyle = isHazard ? "#ff3355" : "#00ffc4";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = isHazard ? "#ff3355" : "#00ffc4";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(cx - R * 1.25, scanY);
      ctx.lineTo(cx + R * 1.25, scanY);
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.restore();

      holoAnimId = requestAnimationFrame(renderHolo);
    }

    holoAnimId = requestAnimationFrame(renderHolo);
  }

  // ------------------------------------------------------------- Drawer Control & Holographic Readout
  function openDrawer(asteroidId, triggerEl) {
    if (!drawer) return;
    lastTriggerElement = triggerEl || document.activeElement;

    var matchedObj = currentObjects.find(function (o) { return String(o.id) === String(asteroidId); });
    playSynthBlip(matchedObj && matchedObj.hazardous ? "hazard" : "select");
    if (globe3d) globe3d.setSelected(asteroidId);

    logTelemetry("LOCK-ON", "ACQUIRED TELEMETRY FOR TARGET " + (matchedObj ? matchedObj.name : asteroidId) + " [SPK-" + asteroidId + "]", matchedObj && matchedObj.hazardous ? "alert" : "lock");

    var title = $("drawer-title");
    var sub = $("drawer-subtitle");
    var content = $("drawer-content");

    title.textContent = "Asteroid " + asteroidId;
    sub.textContent = "Acquiring NASA trajectory telemetry...";
    content.replaceChildren(
      el("div", { class: "skeleton line w60" }),
      el("div", { class: "skeleton line" }),
      el("div", { class: "skeleton line" })
    );

    if (typeof drawer.showModal === "function") {
      drawer.showModal();
    } else {
      drawer.setAttribute("open", "");
    }

    window.SpaceAPI.asteroid(asteroidId).then(function (detail) {
      renderDrawerContent(detail);
    }).catch(function (err) {
      content.replaceChildren(
        el("div", { class: "validation-msg" }, [
          el("p", { text: (err && err.message) || "Failed to load asteroid detail." })
        ])
      );
    });
  }

  function closeDrawer() {
    if (!drawer) return;
    playSynthBlip("blip");
    stopHoloPreview();
    if (globe3d) globe3d.setSelected(null);
    try {
      if (typeof drawer.close === "function" && drawer.open) {
        drawer.close();
      }
    } catch (e) {}
    drawer.removeAttribute("open");
    if (lastTriggerElement && typeof lastTriggerElement.focus === "function") {
      try { lastTriggerElement.focus(); } catch (e) {}
    }
  }

  function renderDrawerContent(detail) {
    var title = $("drawer-title");
    var sub = $("drawer-subtitle");
    var content = $("drawer-content");

    title.textContent = detail.name || detail.id;
    sub.textContent = "TARGET IDENTIFIER: JPL SPK-" + detail.id;

    content.replaceChildren();

    var orb = detail.orbit || {};
    var apprs = detail.approaches || [];
    var isHazard = !!detail.hazardous;
    var missLd = (detail.miss_lunar != null) ? detail.miss_lunar : (apprs[0] ? apprs[0].miss_lunar : 15);
    var velKms = (detail.velocity_kms != null) ? detail.velocity_kms : (apprs[0] ? apprs[0].velocity_kms : 20);
    var avgDiam = (detail.diameter_m_min != null && detail.diameter_m_max != null)
      ? (detail.diameter_m_min + detail.diameter_m_max) / 2
      : (detail.diameter_m_min || detail.diameter_m_max || 45);

    // 1. 3D Holographic Wireframe Canvas
    var holoWrap = el("div", { class: "holo-wireframe-wrap" });
    var holoCanvas = el("canvas", { class: "holo-wireframe-canvas", width: "480", height: "160" });
    var holoOverlay = el("div", { class: "holo-wireframe-overlay" }, [
      el("div", { class: "holo-overlay-top" }, [
        el("span", { class: "holo-corner-tag", text: "SPK-ID: " + detail.id }),
        el("span", { class: "holo-corner-tag", text: "3D WIREFRAME MESH // SBDB" })
      ]),
      el("div", { class: "holo-overlay-bottom" }, [
        el("span", { class: "holo-corner-tag", text: "ROT: 0.65 RAD/S" }),
        el("span", { class: "holo-corner-tag", text: "ALBEDO: " + (orb.albedo || "0.154") })
      ])
    ]);
    holoWrap.appendChild(holoCanvas);
    holoWrap.appendChild(holoOverlay);
    content.appendChild(holoWrap);
    startHoloPreview(holoCanvas, detail);

    // 2. High-Tech Target Designation Banner
    var targetCard = el("div", { class: "fact-item", style: "border-left: 3px solid " + (isHazard ? "var(--hud-crimson)" : "var(--hud-amber)") + "; margin-bottom: 8px;" }, [
      el("dt", { text: "TARGET DESIGNATION // CNEOS · SBDB" }),
      el("dd", { text: (detail.name || detail.id) + " · " + (isHazard ? "POTENTIALLY HAZARDOUS (PHA)" : "STANDARD NEO") }),
      el("p", { class: "hud-source", style: "margin: 6px 0 0;", text: "JPL SPK-ID: " + detail.id + " · SENTRY WATCH: " + (detail.sentry ? "MONITORED [ACTIVE]" : "NOMINAL [OFF]") })
    ]);
    content.appendChild(targetCard);

    // 3. MAGI Threat Assessment Matrix
    var threatLevel = isHazard ? 2 : (missLd < 5 ? 1 : 0);
    var threatTitles = [
      "LEVEL 0 // NOMINAL TRAJECTORY (BENIGN)",
      "LEVEL 1 // ELEVATED PROXIMITY (< 5 LD)",
      "LEVEL 2 // CRITICAL WATCH (POTENTIALLY HAZARDOUS)"
    ];

    var proxPct = Math.max(5, Math.min(100, (1 - Math.min(20, missLd) / 20) * 100));
    var velPct = Math.max(5, Math.min(100, (velKms / 40) * 100));
    var diamPct = Math.max(5, Math.min(100, (Math.min(500, avgDiam) / 500) * 100));

    var threatMatrix = el("div", { class: "holo-threat-matrix" }, [
      el("div", { class: "threat-level-banner level-" + threatLevel }, [
        el("span", { text: "THREAT ASSESSMENT:" }),
        el("span", { text: threatTitles[threatLevel] })
      ]),
      el("div", { class: "threat-gauges-grid" }, [
        el("div", { class: "threat-gauge" }, [
          el("span", { class: "gauge-lbl", text: "PROXIMITY RISK" }),
          el("div", { class: "gauge-bar-track" }, [
            el("div", { class: "gauge-bar-fill " + (isHazard ? "hazard" : "safe"), style: "width: " + proxPct.toFixed(1) + "%;" })
          ]),
          el("span", { class: "gauge-val", text: round(missLd, 2) + " LD" })
        ]),
        el("div", { class: "threat-gauge" }, [
          el("span", { class: "gauge-lbl", text: "VELOCITY RATING" }),
          el("div", { class: "gauge-bar-track" }, [
            el("div", { class: "gauge-bar-fill " + (isHazard ? "hazard" : "safe"), style: "width: " + velPct.toFixed(1) + "%;" })
          ]),
          el("span", { class: "gauge-val", text: round(velKms, 1) + " km/s" })
        ]),
        el("div", { class: "threat-gauge" }, [
          el("span", { class: "gauge-lbl", text: "KINETIC DIAMETER" }),
          el("div", { class: "gauge-bar-track" }, [
            el("div", { class: "gauge-bar-fill " + (isHazard ? "hazard" : "safe"), style: "width: " + diamPct.toFixed(1) + "%;" })
          ]),
          el("span", { class: "gauge-val", text: "~" + round(avgDiam, 0) + " m" })
        ])
      ])
    ]);
    content.appendChild(threatMatrix);

    // 4. Multi-Unit Telemetry Matrix (LD, km, AU, light-sec, Mach)
    var missKm = (detail.miss_km != null) ? detail.miss_km : (missLd * 384400);
    var missAu = missKm / 149597870.7;
    var missLightSec = missKm / 299792.458;
    var velKmh = velKms * 3600;
    var machNum = (velKms * 1000) / 340.29;

    var multiUnitSec = el("div", { class: "drawer-section" }, [
      el("h3", { text: "Orbital Proximity & Velocity Telemetry" }),
      el("div", { class: "multi-unit-grid" }, [
        el("div", { class: "multi-unit-card" }, [
          el("dt", { text: "LUNAR DISTANCE" }),
          el("dd", { text: round(missLd, 3) + " LD" })
        ]),
        el("div", { class: "multi-unit-card" }, [
          el("dt", { text: "KILOMETERS" }),
          el("dd", { text: Math.round(missKm).toLocaleString() + " km" })
        ]),
        el("div", { class: "multi-unit-card" }, [
          el("dt", { text: "ASTRONOMICAL UNITS" }),
          el("dd", { text: round(missAu, 5) + " AU" })
        ]),
        el("div", { class: "multi-unit-card" }, [
          el("dt", { text: "LIGHT-TIME TRAVEL" }),
          el("dd", { text: round(missLightSec, 3) + " light-sec" })
        ]),
        el("div", { class: "multi-unit-card" }, [
          el("dt", { text: "RELATIVE VELOCITY" }),
          el("dd", { text: round(velKms, 2) + " km/s (" + Math.round(velKmh).toLocaleString() + " km/h)" })
        ]),
        el("div", { class: "multi-unit-card" }, [
          el("dt", { text: "SUPERSONIC MACH" }),
          el("dd", { text: "Mach " + Math.round(machNum).toLocaleString() })
        ])
      ])
    ]);
    content.appendChild(multiUnitSec);

    // 5. Human-Scale Comparative Visual Gauge
    var logMinD = Math.log10(5);
    var logMaxD = Math.log10(1500);
    var clampedD = Math.max(5, Math.min(1500, avgDiam));
    var markerPosPct = ((Math.log10(clampedD) - logMinD) / (logMaxD - logMinD)) * 100;

    var humanScale = el("div", { class: "human-scale-gauge" }, [
      el("div", { class: "human-scale-head" }, [
        el("span", { text: "PHYSICAL SCALE COMPARISON" }),
        el("span", { text: "EST. DIAMETER: ~" + round(avgDiam, 0) + " M" })
      ]),
      el("div", { class: "human-scale-track" }, [
        el("div", { class: "human-scale-marker", style: "left: " + markerPosPct.toFixed(1) + "%;" })
      ]),
      el("div", { class: "human-scale-labels" }, [
        el("span", { text: "Bus (10m)" }),
        el("span", { text: "Airliner (70m)" }),
        el("span", { text: "Stadium (110m)" }),
        el("span", { text: "Eiffel (330m)" }),
        el("span", { text: "Mountain (1km+)" })
      ]),
      el("p", { style: "margin: 8px 0 0; font-size: 0.85rem; color: var(--starlight);", text: sizeComparison(avgDiam) })
    ]);
    content.appendChild(humanScale);

    // 6. Hazard Classification note
    var hazClass = el("div", { class: "drawer-section" }, [
      el("h3", { text: "Classification & Hazard Status" }),
      el("p", {
        text: detail.hazardous
          ? "Flagged as Potentially Hazardous Asteroid (PHA). Potentially hazardous means its orbit brings it within ~7.5 million km of Earth's orbit and its estimated diameter exceeds roughly 140 m; it is not a prediction of impact."
          : "Standard Near-Earth Object. Does not meet the size and orbital threshold for potentially hazardous classification."
      }),
      el("p", {
        text: detail.sentry
          ? "Monitored by NASA's Sentry impact risk system."
          : "Not flagged for Sentry impact monitoring."
      })
    ]);
    content.appendChild(hazClass);

    // 7. Orbit facts
    var orbitSec = el("div", { class: "drawer-section" }, [
      el("h3", { text: "Orbital Parameters" }),
      el("p", { text: orb.orbit_class_description ? (orb.orbit_class_type || "") + ": " + orb.orbit_class_description : "Orbit data from JPL database." }),
      el("dl", { class: "facts-grid" }, [
        el("div", { class: "fact-item" }, [el("dt", { text: "Eccentricity" }), el("dd", { text: round(orb.eccentricity, 4) })]),
        el("div", { class: "fact-item" }, [el("dt", { text: "Semi-major axis" }), el("dd", { text: round(orb.semi_major_axis, 3) + " AU" })]),
        el("div", { class: "fact-item" }, [el("dt", { text: "Inclination" }), el("dd", { text: round(orb.inclination, 2) + "°" })]),
        el("div", { class: "fact-item" }, [el("dt", { text: "Orbital period" }), el("dd", { text: orb.orbital_period != null ? round(orb.orbital_period, 1) + " days (" + round(orb.orbital_period / 365.25, 2) + " yr)" : "-" })]),
        el("div", { class: "fact-item" }, [el("dt", { text: "First observed" }), el("dd", { text: orb.first_observation_date || "-" })]),
        el("div", { class: "fact-item" }, [el("dt", { text: "Last observed" }), el("dd", { text: orb.last_observation_date || "-" })])
      ])
    ]);
    content.appendChild(orbitSec);

    // 8. Close approaches table (up to 12)
    var apprSec = el("div", { class: "drawer-section" }, [
      el("h3", { text: "Close Approaches (Nearest in Time)" })
    ]);
    if (apprs.length > 0) {
      var appTable = el("table", { class: "approaches-table" }, [
        el("thead", {}, [
          el("tr", {}, [
            el("th", { text: "Date" }),
            el("th", { text: "Distance (LD)" }),
            el("th", { text: "Speed (km/s)" }),
            el("th", { text: "Orbiting" })
          ])
        ])
      ]);
      var appTbody = el("tbody");
      apprs.forEach(function (ap) {
        appTbody.appendChild(el("tr", {}, [
          el("td", { text: prettyDate(ap.date) }),
          el("td", { text: round(ap.miss_lunar, 2) }),
          el("td", { text: round(ap.velocity_kms, 1) }),
          el("td", { text: ap.orbiting_body || "Earth" })
        ]));
      });
      appTable.appendChild(appTbody);
      apprSec.appendChild(appTable);
    } else {
      apprSec.appendChild(el("p", { text: "No close approach data available." }));
    }
    content.appendChild(apprSec);

    // 9. NASA JPL link
    var jpl = safeUrl(detail.jpl_url);
    if (jpl) {
      content.appendChild(el("div", { class: "drawer-section" }, [
        el("a", { class: "jpl-link", href: jpl, target: "_blank", rel: "noopener" }, [
          document.createTextNode("Open NASA JPL Small-Body Database page ↗")
        ])
      ]));
    }
  }

  // ------------------------------------------------------------- Live Telemetry Downlink Feed (Phase D)
  var teleAutoScroll = true;
  var telePaused = false;
  var ambientTelemetryTimer = null;

  function logTelemetry(tag, msg, level) {
    var log = $("telemetry-terminal-log");
    if (!log) return;
    if (telePaused && tag === "AMBIENT") return;

    var now = new Date();
    var hh = String(now.getUTCHours()).padStart(2, "0");
    var mm = String(now.getUTCMinutes()).padStart(2, "0");
    var ss = String(now.getUTCSeconds()).padStart(2, "0");
    var timeStr = hh + ":" + mm + ":" + ss + "Z";

    var line = el("div", { class: "tele-line" }, [
      el("span", { class: "tele-time", text: timeStr }),
      el("span", { class: "tele-tag " + (level || "info"), text: "[" + tag + "]" }),
      el("span", { class: "tele-msg", text: msg })
    ]);

    log.appendChild(line);

    while (log.childElementCount > 80) {
      log.removeChild(log.firstChild);
    }

    if (teleAutoScroll) {
      log.scrollTop = log.scrollHeight;
    }
  }

  function initTelemetryTerminal() {
    var btnScroll = $("btn-telemetry-scroll");
    var btnPause = $("btn-telemetry-pause");
    var btnClear = $("btn-telemetry-clear");
    var log = $("telemetry-terminal-log");

    if (btnScroll) {
      btnScroll.addEventListener("click", function () {
        teleAutoScroll = !teleAutoScroll;
        btnScroll.textContent = "AUTO-SCROLL: [" + (teleAutoScroll ? "ON" : "OFF") + "]";
        playSynthBlip("blip");
      });
    }

    if (btnPause) {
      btnPause.addEventListener("click", function () {
        telePaused = !telePaused;
        btnPause.textContent = "STREAM: [" + (telePaused ? "PAUSED" : "LIVE") + "]";
        btnPause.classList.toggle("active", telePaused);
        playSynthBlip("blip");
      });
    }

    if (btnClear) {
      btnClear.addEventListener("click", function () {
        if (log) log.replaceChildren();
        logTelemetry("SYSTEM", "TELEMETRY CONSOLE BUFFER PURGED", "warn");
        playSynthBlip("blip");
      });
    }

    // Initial boot telemetry packets
    logTelemetry("BOOT", "CNEOS TELEMETRY DOWNLINK ESTABLISHED // STREAM 08-B READY", "lock");
    logTelemetry("LINK", "JPL SMALL-BODY DATABASE SPK-KERNEL SYNCED · 32 RECEIVERS ONLINE", "info");

    // Ambient periodic telemetry ping
    if (!ambientTelemetryTimer) {
      ambientTelemetryTimer = setInterval(function () {
        if (telePaused || !currentObjects || currentObjects.length === 0) return;
        var ast = currentObjects[Math.floor(Math.random() * currentObjects.length)];
        var tags = ["DOWNLINK", "ORBIT", "RADAR", "BEARING"];
        var tag = tags[Math.floor(Math.random() * tags.length)];
        var info = "SPK-" + ast.id + " (" + (ast.name || ast.id) + ") · RANGE: " + round(ast.miss_lunar, 2) + " LD · V: " + round(ast.velocity_kms, 1) + " KM/S";
        logTelemetry(tag, info, ast.hazardous ? "alert" : "info");
      }, 4200);
    }
  }

  // ------------------------------------------------------------- 4D Mission Time Scrubber (Phase C)
  var simPlaying = false;
  var simSpeed = 1; // 1, 5, 20
  var simProgress = 0; // 0..1
  var simStartMs = 0;
  var simEndMs = 0;
  var simDurationMs = 0;
  var simAnimHandle = null;
  var lastSimFrame = 0;
  var lastEncounterAlertId = null;
  var scrubberInitialized = false;

  function initOrUpdateScrubber(startStr, endStr, objects) {
    var sDate = parseDate(startStr);
    var eDate = parseDate(endStr);
    simStartMs = sDate.getTime();
    simEndMs = eDate.getTime() + 24 * 3600 * 1000 - 1000;
    simDurationMs = Math.max(1000, simEndMs - simStartMs);

    var scrubStartLabel = $("scrub-start-label");
    var scrubEndLabel = $("scrub-end-label");
    if (scrubStartLabel) scrubStartLabel.textContent = startStr.slice(5);
    if (scrubEndLabel) scrubEndLabel.textContent = endStr.slice(5);

    // Marker ticks on the scrubber bar for each asteroid encounter
    var markersBar = $("scrubber-markers-bar");
    if (markersBar) {
      markersBar.replaceChildren();
      (objects || []).forEach(function (ast) {
        if (!ast.date) return;
        var astTime = parseDate(ast.date).getTime() + 12 * 3600 * 1000;
        var pct = ((astTime - simStartMs) / simDurationMs) * 100;
        if (pct < 0 || pct > 100) return;

        var pip = el("div", {
          class: "scrubber-tick-pip" + (ast.hazardous ? " hazard" : ""),
          title: (ast.name || ast.id) + " · " + ast.date + " (" + round(ast.miss_lunar, 1) + " LD)",
          style: "left: " + pct.toFixed(2) + "%;"
        });

        pip.addEventListener("click", function (e) {
          e.stopPropagation();
          setSimProgress(pct / 100, true);
          openDrawer(ast.id);
          playSynthBlip("select");
        });

        markersBar.appendChild(pip);
      });
    }

    // Default to real-world time if inside window, else 0
    var nowMs = Date.now();
    var initialProg = (nowMs >= simStartMs && nowMs <= simEndMs) ? ((nowMs - simStartMs) / simDurationMs) : 0;
    setSimProgress(initialProg, false);

    if (!scrubberInitialized) {
      bindScrubberEvents();
      scrubberInitialized = true;
    }
  }

  function setSimProgress(progress, isManual) {
    simProgress = Math.max(0, Math.min(1, progress));
    var curMs = simStartMs + simProgress * simDurationMs;
    var curDate = new Date(curMs);

    var scrubSlider = $("scrubber-slider");
    if (scrubSlider && (!document.activeElement || document.activeElement !== scrubSlider)) {
      scrubSlider.value = String(Math.round(simProgress * 1000));
    }

    var scrubFill = $("scrubber-progress-fill");
    if (scrubFill) {
      scrubFill.style.width = (simProgress * 100).toFixed(2) + "%";
    }

    var scrubTimeDisplay = $("scrub-time-display");
    if (scrubTimeDisplay) {
      var y = curDate.getUTCFullYear();
      var m = String(curDate.getUTCMonth() + 1).padStart(2, "0");
      var d = String(curDate.getUTCDate()).padStart(2, "0");
      var hh = String(curDate.getUTCHours()).padStart(2, "0");
      var mm = String(curDate.getUTCMinutes()).padStart(2, "0");
      var ss = String(curDate.getUTCSeconds()).padStart(2, "0");
      scrubTimeDisplay.textContent = y + "-" + m + "-" + d + " " + hh + ":" + mm + ":" + ss + " UTC";
    }

    // Identify nearest asteroid encounter relative to simulated time
    var closestAst = null;
    var minDiff = Infinity;
    (currentObjects || []).forEach(function (ast) {
      if (!ast.date) return;
      var astTime = parseDate(ast.date).getTime() + 12 * 3600 * 1000;
      var diff = Math.abs(curMs - astTime);
      if (diff < minDiff) {
        minDiff = diff;
        closestAst = ast;
      }
    });

    var scrubClosestName = $("scrub-closest-name");
    var scrubClosestDist = $("scrub-closest-dist");
    var scrubCountdown = $("scrub-countdown");

    if (closestAst) {
      if (scrubClosestName) scrubClosestName.textContent = closestAst.name || closestAst.id;
      if (scrubClosestDist) scrubClosestDist.textContent = round(closestAst.miss_lunar, 2) + " LD";

      var astTime = parseDate(closestAst.date).getTime() + 12 * 3600 * 1000;
      var diffHours = Math.round((curMs - astTime) / (3600 * 1000));

      if (scrubCountdown) {
        if (Math.abs(diffHours) < 1) {
          scrubCountdown.textContent = "T-0 (PERIGEE)";
          scrubCountdown.style.color = "#00ffc4";
          if (lastEncounterAlertId !== closestAst.id) {
            lastEncounterAlertId = closestAst.id;
            playSynthBlip("chirp");
            logTelemetry("PERIGEE", "ENCOUNTER PERIGEE PASS: " + (closestAst.name || closestAst.id) + " AT " + round(closestAst.miss_lunar, 2) + " LD · V: " + round(closestAst.velocity_kms, 1) + " KM/S", closestAst.hazardous ? "alert" : "warn");
          }
        } else if (diffHours < 0) {
          scrubCountdown.textContent = "T-" + Math.abs(diffHours) + "h";
          scrubCountdown.style.color = "var(--dust)";
        } else {
          scrubCountdown.textContent = "T+" + diffHours + "h";
          scrubCountdown.style.color = "var(--dust)";
        }
      }
    } else {
      if (scrubClosestName) scrubClosestName.textContent = "--";
      if (scrubClosestDist) scrubClosestDist.textContent = "--";
      if (scrubCountdown) scrubCountdown.textContent = "--";
    }

    // Sync 3D Globe encounter positions
    if (globe3d) {
      globe3d.setSimTime(curDate, simStartMs, simEndMs);
    }

    // Sync Distance Radar target pulses
    updateRadarHighlights(curMs, currentObjects);

    if (isManual && sentryAudioEnabled) {
      // Soft audio tick on active scrub
    }
  }

  function bindScrubberEvents() {
    var playBtn = $("btn-scrub-play");
    var speedBtn = $("btn-scrub-speed");
    var startBtn = $("btn-scrub-start");
    var nowBtn = $("btn-scrub-now");
    var slider = $("scrubber-slider");

    if (playBtn) {
      playBtn.addEventListener("click", function () {
        toggleSimPlay();
        playSynthBlip("select");
      });
    }

    if (speedBtn) {
      speedBtn.addEventListener("click", function () {
        if (simSpeed === 1) simSpeed = 5;
        else if (simSpeed === 5) simSpeed = 20;
        else simSpeed = 1;

        speedBtn.textContent = simSpeed + "x";
        var badge = $("scrub-status-badge");
        if (badge && simPlaying) badge.textContent = "ACTIVE (" + simSpeed + "X)";
        playSynthBlip("blip");
      });
    }

    if (startBtn) {
      startBtn.addEventListener("click", function () {
        setSimProgress(0, true);
        playSynthBlip("blip");
      });
    }

    if (nowBtn) {
      nowBtn.addEventListener("click", function () {
        var nowMs = Date.now();
        var prog = (simDurationMs > 0) ? ((nowMs - simStartMs) / simDurationMs) : 0;
        prog = Math.max(0, Math.min(1, prog));
        setSimProgress(prog, true);
        playSynthBlip("blip");
      });
    }

    if (slider) {
      slider.addEventListener("input", function () {
        var val = parseFloat(slider.value) / 1000.0;
        setSimProgress(val, true);
      });
    }
  }

  function toggleSimPlay() {
    simPlaying = !simPlaying;
    var icon = $("scrub-play-icon");
    var text = $("scrub-play-text");
    var badge = $("scrub-status-badge");
    var playBtn = $("btn-scrub-play");

    if (icon) icon.textContent = simPlaying ? "⏸" : "▶";
    if (text) text.textContent = simPlaying ? "PAUSE" : "PLAY";
    if (playBtn) playBtn.classList.toggle("active", simPlaying);

    if (badge) {
      badge.textContent = simPlaying ? ("ACTIVE (" + simSpeed + "X)") : "PAUSED";
      badge.classList.toggle("playing", simPlaying);
    }

    if (simPlaying) {
      lastSimFrame = performance.now();
      runSimLoop(lastSimFrame);
    } else {
      if (simAnimHandle) {
        cancelAnimationFrame(simAnimHandle);
        simAnimHandle = null;
      }
    }
  }

  function runSimLoop(now) {
    if (!simPlaying) return;
    var dt = (now - lastSimFrame) / 1000;
    lastSimFrame = now;

    var deltaProg = (dt / 35.0) * simSpeed;
    var nextProg = simProgress + deltaProg;
    if (nextProg > 1.0) {
      nextProg = 0.0;
    }

    setSimProgress(nextProg, false);
    simAnimHandle = requestAnimationFrame(runSimLoop);
  }

  // ------------------------------------------------------------- Load Data
  function loadWindow(startStr, endStr) {
    showValidationError(null);
    if (errorContainer) errorContainer.style.display = "none";

    var vErr = validateClientWindow(startStr, endStr);
    if (vErr) {
      showValidationError(vErr);
      return;
    }

    // Sync URL parameters
    var u = new URL(location.href);
    u.searchParams.set("start", startStr);
    u.searchParams.set("end", endStr);
    history.replaceState(null, "", u.toString());

    // Show skeletons
    var sTiles = $("summary-tiles");
    if (sTiles) {
      sTiles.replaceChildren(
        el("div", { class: "tile skeleton" }),
        el("div", { class: "tile skeleton" }),
        el("div", { class: "tile skeleton" }),
        el("div", { class: "tile skeleton" }),
        el("div", { class: "tile skeleton" })
      );
    }
    var rCont = $("radar-container");
    if (rCont) rCont.replaceChildren(el("div", { class: "skeleton radar-skel" }));

    var tBody = $("table-body");
    if (tBody) {
      tBody.replaceChildren(
        el("tr", {}, [el("td", { colspan: "6", class: "skeleton line", style: "height: 48px;" })]),
        el("tr", {}, [el("td", { colspan: "6", class: "skeleton line", style: "height: 48px;" })])
      );
    }

    window.SpaceAPI.asteroids(startStr, endStr).then(function (data) {
      currentObjects = data.objects || [];
      logTelemetry("INGEST", "ACQUIRED " + (data.count || currentObjects.length) + " TARGET TRAJECTORIES FOR WINDOW " + startStr + " TO " + endStr, "info");
      if (data.hazardous_count > 0) {
        logTelemetry("WARNING", "ALERT: " + data.hazardous_count + " POTENTIALLY HAZARDOUS ASTEROIDS (PHA) IN ACTIVE WINDOW", "alert");
      }
      renderSummary(data);
      renderRadar(currentObjects, startStr, endStr);
      renderScatterChart(currentObjects);
      if (globe3d) {
        globe3d.setObjects(currentObjects, function (id) { openDrawer(id); });
      }
      initOrUpdateScrubber(startStr, endStr, currentObjects);
      updateTableHeaders();
      renderTableRows();
    }).catch(function (err) {
      if (errorContainer) {
        var down = err && err.code === "BACKEND_DOWN";
        var title = $("error-title");
        var body = $("error-body");
        if (title) title.textContent = down ? "The backend isn't running" : "Could not load asteroid data";
        if (body) body.textContent = (err && err.message) || "Try again in a moment.";
        errorContainer.style.display = "block";
      }
    });
  }

  // ------------------------------------------------------------- Event Listeners
  $("window-form").addEventListener("submit", function (e) {
    e.preventDefault();
    playSynthBlip("blip");
    loadWindow(startDateInput.value, endDateInput.value);
  });

  $("btn-retry").addEventListener("click", function () {
    playSynthBlip("blip");
    loadWindow(startDateInput.value, endDateInput.value);
  });

  // Table header clicks
  document.querySelectorAll(".th-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      playSynthBlip("blip");
      sortObjects(btn.getAttribute("data-col"));
    });
  });

  // Presets
  document.querySelectorAll("[data-preset]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      playSynthBlip("blip");
      var preset = btn.getAttribute("data-preset");
      var now = new Date();
      var s, e;

      if (preset === "this-week") {
        // Monday to Sunday of current week
        var day = now.getDay();
        var diffToMon = (day === 0 ? -6 : 1) - day;
        s = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMon);
        e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
      } else if (preset === "next-7") {
        s = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        e = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6);
      } else if (preset === "last-7") {
        e = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        s = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      }

      if (s && e) {
        startDateInput.value = formatDate(s);
        endDateInput.value = formatDate(e);
        loadWindow(startDateInput.value, endDateInput.value);
      }
    });
  });

  // Drawer close button & outside click / Escape
  $("drawer-close").addEventListener("click", closeDrawer);
  if (drawer) {
    drawer.addEventListener("close", function () {
      if (lastTriggerElement && typeof lastTriggerElement.focus === "function") {
        lastTriggerElement.focus();
      }
    });
    drawer.addEventListener("click", function (e) {
      if (e.target === drawer) {
        var rect = drawer.getBoundingClientRect();
        var isInDialog = (rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
          rect.left <= e.clientX && e.clientX <= rect.left + rect.width);
        if (!isInDialog) closeDrawer();
      }
    });
  }

  // ------------------------------------------------------------- Boot
  var qParams = new URLSearchParams(location.search);
  var qStart = qParams.get("start");
  var qEnd = qParams.get("end");

  var today = new Date();
  var defaultStart = formatDate(today);
  var plus6 = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 6);
  var defaultEnd = formatDate(plus6);

  startDateInput.value = qStart || defaultStart;
  endDateInput.value = qEnd || defaultEnd;

  // Initialize 3D Vector Globe
  var globeContainer = $("globe-container");
  if (globeContainer && window.Globe3D) {
    globe3d = new window.Globe3D(globeContainer, {});
  }

  // View mode switcher: 3D Globe vs Scatter Chart
  var btnViewGlobe = $("btn-view-globe");
  var btnViewChart = $("btn-view-chart");
  var globeWrap = $("globe-view-wrap");
  var chartWrap = $("chart-container");
  var visTag = $("vis-panel-tag");
  var visTitle = $("vis-panel-title");
  var visDesc = $("vis-panel-desc");

  if (btnViewGlobe && btnViewChart) {
    btnViewGlobe.addEventListener("click", function () {
      playSynthBlip("blip");
      btnViewGlobe.classList.add("active");
      btnViewGlobe.setAttribute("aria-pressed", "true");
      btnViewChart.classList.remove("active");
      btnViewChart.setAttribute("aria-pressed", "false");
      if (globeWrap) globeWrap.style.display = "flex";
      if (chartWrap) chartWrap.style.display = "none";
      if (visTag) visTag.textContent = "[ GEOCENTRIC // 3D VECTOR ORBIT MAP ]";
      if (visTitle) visTitle.textContent = "3D Geocentric Vector Map";
      if (visDesc) visDesc.textContent = "Interactive wireframe Earth with flyby trajectory vectors, Moon orbit (1 LD), and Low Earth Orbit satellite swarms.";
      if (globe3d) globe3d.resize();
    });

    btnViewChart.addEventListener("click", function () {
      playSynthBlip("blip");
      btnViewChart.classList.add("active");
      btnViewChart.setAttribute("aria-pressed", "true");
      btnViewGlobe.classList.remove("active");
      btnViewGlobe.setAttribute("aria-pressed", "false");
      if (globeWrap) globeWrap.style.display = "none";
      if (chartWrap) chartWrap.style.display = "block";
      if (visTag) visTag.textContent = "[ TELEMETRY // SIZE VS VELOCITY ]";
      if (visTitle) visTitle.textContent = "Size vs. speed";
      if (visDesc) visDesc.textContent = "Estimated average diameter in metres (logarithmic) against relative velocity in km/s.";
      if (scatterChart && typeof scatterChart.resize === "function") {
        scatterChart.resize();
      }
    });
  }

  // 3D Globe toolbar actions
  var btnReset = $("btn-globe-reset");
  if (btnReset) {
    btnReset.addEventListener("click", function () {
      playSynthBlip("blip");
      if (globe3d) globe3d.resetView();
    });
  }

  var btnSpin = $("btn-globe-spin");
  if (btnSpin) {
    btnSpin.addEventListener("click", function () {
      playSynthBlip("blip");
      if (globe3d) {
        var active = globe3d.toggleAutoSpin();
        btnSpin.classList.toggle("active", active);
      }
    });
  }

  var btnMoon = $("btn-globe-moon");
  if (btnMoon) {
    btnMoon.addEventListener("click", function () {
      playSynthBlip("blip");
      if (globe3d) {
        var active = globe3d.toggleMoon();
        btnMoon.classList.toggle("active", active);
      }
    });
  }

  initTelemetryTerminal();
  loadStatus();
  loadWindow(startDateInput.value, endDateInput.value);
})();

