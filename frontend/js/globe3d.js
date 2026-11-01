/* Space Explorer - 3D Tactical Geocentric Vector Globe
   Theme: Retrofuturistic Tactical Command Console / Evangelion MAGI & NORAD Telemetry HUD
   Pure Vanilla Canvas 2D with 3D Matrix Projection (Zero external dependencies).
*/

(function () {
  "use strict";

  // Stylized polygonal continental coastline vectors (lat, lon degrees)
  var CONTINENTS = [
    // North America
    [
      [71, -156], [68, -165], [60, -166], [55, -163], [58, -157], [58, -137],
      [50, -127], [38, -123], [32, -117], [23, -110], [19, -104], [16, -93],
      [14, -87], [9, -79], [10, -75], [16, -83], [21, -87], [29, -89],
      [25, -80], [31, -81], [37, -75], [44, -66], [48, -64], [52, -56],
      [58, -62], [62, -72], [68, -63], [73, -80], [70, -100], [72, -125],
      [71, -156]
    ],
    // South America
    [
      [11, -74], [8, -77], [1, -80], [-5, -81], [-14, -76], [-23, -70],
      [-38, -73], [-52, -75], [-55, -67], [-50, -68], [-42, -63], [-34, -53],
      [-23, -42], [-13, -38], [-5, -35], [0, -50], [5, -52], [7, -58],
      [11, -63], [11, -74]
    ],
    // Eurasia & North Africa
    [
      [36, -6], [43, -9], [48, -4], [54, 5], [58, 8], [62, 5], [70, 20],
      [71, 28], [69, 34], [67, 50], [73, 70], [76, 100], [77, 105],
      [73, 125], [71, 150], [66, 170], [60, 162], [52, 142], [43, 132],
      [38, 128], [35, 129], [30, 122], [22, 114], [16, 108], [10, 104],
      [1, 104], [8, 98], [15, 96], [22, 89], [13, 80], [8, 77], [21, 70],
      [25, 62], [25, 57], [13, 45], [12, 44], [22, 38], [31, 35], [31, 32],
      [36, 36], [41, 28], [37, 24], [40, 18], [44, 12], [43, 4], [36, -6]
    ],
    // Africa (Sub-Saharan)
    [
      [12, -17], [5, -10], [4, 2], [4, 9], [1, 9], [-6, 12], [-15, 12],
      [-23, 14], [-34, 18], [-34, 26], [-28, 32], [-16, 40], [-4, 40],
      [5, 48], [12, 44], [12, -17]
    ],
    // Australia
    [
      [-12, 136], [-15, 129], [-20, 119], [-26, 113], [-34, 115], [-35, 118],
      [-32, 129], [-35, 137], [-38, 144], [-38, 150], [-32, 153], [-24, 153],
      [-19, 147], [-12, 142], [-12, 136]
    ],
    // Antarctica (Ring approximation)
    [
      [-65, -60], [-68, -40], [-71, -10], [-69, 20], [-66, 60], [-66, 90],
      [-65, 120], [-66, 140], [-68, 170], [-72, -170], [-72, -130], [-70, -90],
      [-65, -60]
    ]
  ];

  function Globe3D(container, options) {
    this.container = container;
    this.options = options || {};
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.canvas.className = "globe-3d-canvas";
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", "Interactive 3D geocentric vector map of near-Earth asteroids");
    this.container.appendChild(this.canvas);

    // Orientation & Camera
    this.yaw = 0.55;       // Initial horizontal rotation
    this.pitch = 0.35;     // Initial vertical tilt
    this.zoom = 1.0;       // Zoom multiplier
    this.autoSpin = true;
    this.showMoon = true;
    this.showSatellites = true;
    this.lastInteraction = 0;

    // Dimensions
    this.width = 460;
    this.height = 380;
    this.earthR = 56;      // Base radius of Earth in pixels

    // Data
    this.objects = [];
    this.selectedId = null;
    this.hoveredObject = null;
    this.hoverPos = null;

    // 4D Mission Simulation Time (Phase C)
    this.simDate = null;
    this.windowStart = null;
    this.windowEnd = null;

    // Satellite swarm particles (simulating Starlink & debris from video)
    this.satellites = this.generateSatelliteSwarm(64);

    // Animation handle
    this.animHandle = null;
    this.onSelectCallback = null;

    this.bindEvents();
    this.resize();
    this.start();
  }

  Globe3D.prototype.generateSatelliteSwarm = function (count) {
    var sats = [];
    for (var i = 0; i < count; i++) {
      var inc = (Math.random() * 80 + 10) * (Math.PI / 180);
      var alt = 1.1 + Math.random() * 0.35; // 1.1 to 1.45 Earth radii
      var node = Math.random() * Math.PI * 2;
      var speed = (Math.random() * 0.008 + 0.004) * (Math.random() > 0.5 ? 1 : -1);
      sats.push({
        inc: inc,
        alt: alt,
        node: node,
        speed: speed,
        theta: Math.random() * Math.PI * 2
      });
    }
    return sats;
  };

  Globe3D.prototype.resize = function () {
    var rect = this.container.getBoundingClientRect();
    this.width = Math.max(280, rect.width || 460);
    this.height = Math.max(320, rect.height || 380);

    var dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = this.width + "px";
    this.canvas.style.height = this.height + "px";
    this.ctx.scale(dpr, dpr);

    this.earthR = Math.max(42, Math.min(68, this.width * 0.13));
  };

  Globe3D.prototype.bindEvents = function () {
    var self = this;
    var isDragging = false;
    var startX = 0;
    var startY = 0;
    var moved = false;

    window.addEventListener("resize", function () {
      self.resize();
    });

    // Pointer events
    this.canvas.addEventListener("pointerdown", function (e) {
      isDragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      self.canvas.setPointerCapture(e.pointerId);
      self.lastInteraction = Date.now();
    });

    this.canvas.addEventListener("pointermove", function (e) {
      var rect = self.canvas.getBoundingClientRect();
      var mouseX = e.clientX - rect.left;
      var mouseY = e.clientY - rect.top;

      if (isDragging) {
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;

        self.yaw += dx * 0.0075;
        self.pitch += dy * 0.0075;
        // Clamp pitch to prevent gimbal flip
        self.pitch = Math.max(-1.3, Math.min(1.3, self.pitch));

        startX = e.clientX;
        startY = e.clientY;
        self.lastInteraction = Date.now();
      } else {
        // Hit-test asteroids
        self.checkHit(mouseX, mouseY);
      }
    });

    var endDrag = function (e) {
      if (!isDragging) return;
      isDragging = false;
      try { self.canvas.releasePointerCapture(e.pointerId); } catch (err) {}

      // If clicked without dragging, select asteroid
      if (!moved && self.hoveredObject) {
        if (typeof self.onSelectCallback === "function") {
          self.onSelectCallback(self.hoveredObject.id);
        }
      }
    };

    this.canvas.addEventListener("pointerup", endDrag);
    this.canvas.addEventListener("pointercancel", endDrag);

    // Zoom on wheel
    this.canvas.addEventListener("wheel", function (e) {
      e.preventDefault();
      var delta = e.deltaY < 0 ? 0.08 : -0.08;
      self.zoom = Math.max(0.65, Math.min(2.8, self.zoom + delta));
      self.lastInteraction = Date.now();
    }, { passive: false });
  };

  // 3D coordinate transformation
  Globe3D.prototype.project = function (x, y, z) {
    // 1. Rotate around Y (yaw)
    var cosY = Math.cos(this.yaw);
    var sinY = Math.sin(this.yaw);
    var x1 = x * cosY + z * sinY;
    var z1 = -x * sinY + z * cosY;

    // 2. Rotate around X (pitch)
    var cosP = Math.cos(this.pitch);
    var sinP = Math.sin(this.pitch);
    var y2 = y * cosP - z1 * sinP;
    var z2 = y * sinP + z1 * cosP;

    // 3. Perspective Camera
    var dist = 520;
    var k = (dist / (dist - z2)) * this.zoom;
    var screenX = this.width / 2 + x1 * k;
    var screenY = this.height / 2 - y2 * k;

    return {
      x: screenX,
      y: screenY,
      z: z2,
      visible: z2 > -dist + 40,
      scale: k
    };
  };

  // Convert (lat, lon) on Earth sphere of radius R into 3D XYZ
  Globe3D.prototype.latLonToXYZ = function (latDeg, lonDeg, r) {
    var lat = (latDeg * Math.PI) / 180;
    var lon = (lonDeg * Math.PI) / 180;
    var rad = r || this.earthR;
    return {
      x: rad * Math.cos(lat) * Math.cos(lon),
      y: rad * Math.sin(lat),
      z: -rad * Math.cos(lat) * Math.sin(lon)
    };
  };

  // Convert Lunar Distance to screen scale in pixels
  Globe3D.prototype.ldToRadius = function (ld) {
    // 1 LD (Moon) = 2.4 Earth radii on screen
    var moonDist = this.earthR * 2.4;
    var clamped = Math.max(0.1, ld);
    if (clamped <= 1.0) {
      return this.earthR + (moonDist - this.earthR) * Math.sqrt(clamped);
    }
    // Beyond Moon: compressed logarithm up to ~120 LD
    var outerMax = Math.min(this.width, this.height) * 0.44;
    var logFactor = Math.log10(clamped) / Math.log10(100);
    return moonDist + (outerMax - moonDist) * Math.min(1.25, logFactor);
  };

  Globe3D.prototype.setObjects = function (objects, onSelect) {
    this.objects = objects || [];
    this.onSelectCallback = onSelect;
  };

  Globe3D.prototype.setSimTime = function (simDate, windowStart, windowEnd) {
    this.simDate = simDate instanceof Date ? simDate : (simDate ? new Date(simDate) : null);
    if (windowStart) this.windowStart = windowStart instanceof Date ? windowStart : new Date(windowStart);
    if (windowEnd) this.windowEnd = windowEnd instanceof Date ? windowEnd : new Date(windowEnd);
  };

  Globe3D.prototype.setSelected = function (id) {
    this.selectedId = id ? String(id) : null;
  };

  Globe3D.prototype.checkHit = function (mouseX, mouseY) {
    var hit = null;
    var hitDist = 20;

    for (var i = 0; i < this.objects.length; i++) {
      var ast = this.objects[i];
      if (ast._proj && ast._proj.visible) {
        var dx = mouseX - ast._proj.x;
        var dy = mouseY - ast._proj.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < hitDist) {
          hitDist = d;
          hit = ast;
        }
      }
    }

    if (this.hoveredObject !== hit) {
      this.hoveredObject = hit;
      this.canvas.style.cursor = hit ? "pointer" : "grab";
    }
    this.hoverPos = hit ? { x: mouseX, y: mouseY } : null;
  };

  // Render loop
  Globe3D.prototype.render = function () {
    var ctx = this.ctx;
    var w = this.width;
    var h = this.height;

    // Auto-spin when idle
    if (this.autoSpin && Date.now() - this.lastInteraction > 3500) {
      this.yaw += 0.0035;
    }

    // Update satellites
    for (var s = 0; s < this.satellites.length; s++) {
      this.satellites[s].theta += this.satellites[s].speed;
    }

    ctx.clearRect(0, 0, w, h);

    // 1. Ambient Background Grid & Concentric Encounter Zones
    this.renderTacticalBackground(ctx, w, h);

    // 2. Earth Central Sphere Radial Glow
    var centerProj = this.project(0, 0, 0);
    var radGlow = ctx.createRadialGradient(centerProj.x, centerProj.y, 0, centerProj.x, centerProj.y, this.earthR * 1.8 * this.zoom);
    radGlow.addColorStop(0, "rgba(0, 255, 196, 0.12)");
    radGlow.addColorStop(0.5, "rgba(255, 140, 59, 0.06)");
    radGlow.addColorStop(1, "transparent");
    ctx.fillStyle = radGlow;
    ctx.beginPath();
    ctx.arc(centerProj.x, centerProj.y, this.earthR * 1.8 * this.zoom, 0, Math.PI * 2);
    ctx.fill();

    // 3. Moon Orbital Ring (1 LD)
    if (this.showMoon) {
      this.renderMoonOrbit(ctx);
    }

    // 4. Low Earth Orbit / Satellite Swarm
    if (this.showSatellites) {
      this.renderSatellites(ctx);
    }

    // 5. Wireframe Earth (Meridians, Parallels, Continents)
    this.renderEarthWireframe(ctx);

    // 6. Asteroid Flyby Trajectories & Encounters
    this.renderAsteroids(ctx);

    // 7. Targeting HUD Reticle on Hover / Selected
    this.renderTargetHUD(ctx);
  };

  Globe3D.prototype.renderTacticalBackground = function (ctx, w, h) {
    ctx.save();
    ctx.strokeStyle = "rgba(255, 140, 59, 0.06)";
    ctx.lineWidth = 1;

    // Coordinate crosshairs at screen center
    var cx = w / 2;
    var cy = h / 2;
    ctx.beginPath();
    ctx.moveTo(cx - 30, cy); ctx.lineTo(cx + 30, cy);
    ctx.moveTo(cx, cy - 30); ctx.lineTo(cx, cy + 30);
    ctx.stroke();

    // Distance threshold rings (1 LD, 5 LD, 20 LD)
    var rings = [1, 5, 20];
    ctx.setLineDash([2, 4]);
    for (var i = 0; i < rings.length; i++) {
      var rPx = this.ldToRadius(rings[i]) * this.zoom;
      ctx.strokeStyle = rings[i] === 1 ? "rgba(0, 255, 196, 0.18)" : "rgba(255, 140, 59, 0.08)";
      ctx.beginPath();
      ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "rgba(255, 140, 59, 0.4)";
      ctx.font = "9px 'Share Tech Mono', monospace";
      ctx.fillText(rings[i] + " LD", cx + rPx + 4, cy - 4);
    }
    ctx.setLineDash([]);
    ctx.restore();
  };

  Globe3D.prototype.renderEarthWireframe = function (ctx) {
    var self = this;
    ctx.save();

    // Earth Sphere Outline
    var centerProj = this.project(0, 0, 0);
    ctx.strokeStyle = "rgba(0, 255, 196, 0.5)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(centerProj.x, centerProj.y, this.earthR * this.zoom, 0, Math.PI * 2);
    ctx.stroke();

    // Latitude Parallels
    var lats = [-60, -40, -20, 0, 20, 40, 60];
    for (var l = 0; l < lats.length; l++) {
      var latDeg = lats[l];
      var isEquator = latDeg === 0;
      ctx.strokeStyle = isEquator ? "rgba(255, 140, 59, 0.45)" : "rgba(0, 255, 196, 0.15)";
      ctx.lineWidth = isEquator ? 1.4 : 0.8;

      ctx.beginPath();
      var first = true;
      for (var lon = 0; lon <= 360; lon += 10) {
        var p = self.latLonToXYZ(latDeg, lon);
        var proj = self.project(p.x, p.y, p.z);
        if (proj.visible) {
          if (first) { ctx.moveTo(proj.x, proj.y); first = false; }
          else { ctx.lineTo(proj.x, proj.y); }
        } else {
          first = true;
        }
      }
      ctx.stroke();
    }

    // Longitude Meridians
    for (var m = 0; m < 360; m += 30) {
      ctx.strokeStyle = (m === 0 || m === 180) ? "rgba(255, 140, 59, 0.35)" : "rgba(0, 255, 196, 0.12)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      var firstM = true;
      for (var lat = -80; lat <= 80; lat += 8) {
        var pM = self.latLonToXYZ(lat, m);
        var projM = self.project(pM.x, pM.y, pM.z);
        if (projM.visible) {
          if (firstM) { ctx.moveTo(projM.x, projM.y); firstM = false; }
          else { ctx.lineTo(projM.x, projM.y); }
        } else {
          firstM = true;
        }
      }
      ctx.stroke();
    }

    // Continental Vector Outlines
    ctx.strokeStyle = "#ffbe76";
    ctx.lineWidth = 1.3;
    ctx.shadowColor = "rgba(255, 190, 118, 0.5)";
    ctx.shadowBlur = 4;

    for (var c = 0; c < CONTINENTS.length; c++) {
      var poly = CONTINENTS[c];
      ctx.beginPath();
      var started = false;

      for (var pt = 0; pt < poly.length; pt++) {
        var coord = poly[pt];
        var ptXYZ = self.latLonToXYZ(coord[0], coord[1]);
        var ptProj = self.project(ptXYZ.x, ptXYZ.y, ptXYZ.z);

        // Only draw vertices on front-facing hemisphere
        if (ptProj.z > -this.earthR * 0.15) {
          if (!started) { ctx.moveTo(ptProj.x, ptProj.y); started = true; }
          else { ctx.lineTo(ptProj.x, ptProj.y); }
        } else {
          started = false;
        }
      }
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // Earth Label
    ctx.fillStyle = "rgba(0, 255, 196, 0.85)";
    ctx.font = "bold 10px 'Share Tech Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText("EARTH", centerProj.x, centerProj.y + 4);

    ctx.restore();
  };

  Globe3D.prototype.renderMoonOrbit = function (ctx) {
    var self = this;
    ctx.save();
    var moonR = this.ldToRadius(1.0);

    ctx.strokeStyle = "rgba(0, 255, 196, 0.4)";
    ctx.lineWidth = 1.1;
    ctx.setLineDash([3, 4]);

    ctx.beginPath();
    var first = true;
    for (var a = 0; a <= 360; a += 6) {
      var rad = (a * Math.PI) / 180;
      // Slight 5.14 deg tilt to Moon orbit
      var mx = moonR * Math.cos(rad);
      var my = moonR * Math.sin(rad) * Math.sin(0.09);
      var mz = moonR * Math.sin(rad) * Math.cos(0.09);
      var proj = self.project(mx, my, mz);
      if (proj.visible) {
        if (first) { ctx.moveTo(proj.x, proj.y); first = false; }
        else { ctx.lineTo(proj.x, proj.y); }
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Moon Position marker
    var moonAngle = (Date.now() * 0.00015) % (Math.PI * 2);
    var curMx = moonR * Math.cos(moonAngle);
    var curMy = moonR * Math.sin(moonAngle) * Math.sin(0.09);
    var curMz = moonR * Math.sin(moonAngle) * Math.cos(0.09);
    var moonProj = self.project(curMx, curMy, curMz);

    if (moonProj.visible) {
      ctx.fillStyle = "#eef2ff";
      ctx.beginPath();
      ctx.arc(moonProj.x, moonProj.y, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(0, 255, 196, 0.8)";
      ctx.font = "9px 'Share Tech Mono', monospace";
      ctx.fillText("MOON (1 LD)", moonProj.x + 8, moonProj.y - 4);
    }
    ctx.restore();
  };

  Globe3D.prototype.renderSatellites = function (ctx) {
    var self = this;
    ctx.save();
    ctx.fillStyle = "rgba(0, 255, 196, 0.7)";

    for (var s = 0; s < this.satellites.length; s++) {
      var sat = this.satellites[s];
      var r = this.earthR * sat.alt;
      var x = r * Math.cos(sat.theta);
      var y = r * Math.sin(sat.theta) * Math.sin(sat.inc);
      var z = r * Math.sin(sat.theta) * Math.cos(sat.inc);

      var p = self.project(x, y, z);
      if (p.visible && p.z > -this.earthR * 0.4) {
        ctx.fillRect(p.x - 0.75, p.y - 0.75, 1.5, 1.5);
      }
    }

    // ISS orbit marker
    var issR = this.earthR * 1.15;
    var issTheta = (Date.now() * 0.0008) % (Math.PI * 2);
    var issP = self.project(
      issR * Math.cos(issTheta),
      issR * Math.sin(issTheta) * Math.sin(0.9),
      issR * Math.sin(issTheta) * Math.cos(0.9)
    );
    if (issP.visible && issP.z > -this.earthR * 0.3) {
      ctx.fillStyle = "#ffaa00";
      ctx.beginPath();
      ctx.arc(issP.x, issP.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 170, 0, 0.75)";
      ctx.font = "8px 'Share Tech Mono', monospace";
      ctx.fillText("ISS", issP.x + 5, issP.y - 2);
    }

    ctx.restore();
  };

  Globe3D.prototype.renderAsteroids = function (ctx) {
    var self = this;
    var count = this.objects.length;
    if (!count) return;

    ctx.save();

    for (var i = 0; i < count; i++) {
      var ast = this.objects[i];
      var isHazard = !!ast.hazardous;
      var isSelected = self.selectedId && String(ast.id) === self.selectedId;
      var isHovered = self.hoveredObject && self.hoveredObject.id === ast.id;

      var ld = ast.miss_lunar != null ? ast.miss_lunar : 15;
      var rMin = self.ldToRadius(ld);

      // Deterministic orbital approach angle from asteroid ID
      var hash = 0;
      var idStr = String(ast.id || i);
      for (var h = 0; h < idStr.length; h++) hash = (hash << 5) - hash + idStr.charCodeAt(h);
      hash = Math.abs(hash);

      var phi = ((hash % 360) * Math.PI) / 180;
      var theta = (((hash >> 4) % 180 - 90) * Math.PI) / 180;

      // Closest approach 3D coordinate (perigee)
      var perigeeX = rMin * Math.cos(theta) * Math.cos(phi);
      var perigeeY = rMin * Math.sin(theta);
      var perigeeZ = -rMin * Math.cos(theta) * Math.sin(phi);

      // Trajectory vector tangent direction
      var vSpeed = ast.velocity_kms || 20;
      var vLen = Math.max(60, Math.min(180, vSpeed * 4.5));
      var tVecX = -Math.sin(phi) * vLen;
      var tVecY = Math.cos(phi) * Math.sin(theta) * (vLen * 0.5);
      var tVecZ = -Math.cos(phi) * vLen;

      // Determine simulated position along vector (Phase C 4D timeline)
      var sPos = 0;
      var hasSim = self.simDate != null && ast.date;
      var deltaHours = 0;

      if (hasSim) {
        var astTime = new Date(ast.date + "T00:00:00Z").getTime();
        var simTime = self.simDate.getTime();
        deltaHours = (simTime - astTime) / (3600 * 1000);
        // Encounter scale: 36 hours from entrance to perigee
        sPos = deltaHours / 36.0;
        sPos = Math.max(-1.3, Math.min(1.3, sPos));
      }

      // Project trajectory curve: sample points forming hyperbolic flyby line
      ctx.beginPath();
      var firstPt = true;
      for (var s = -1.2; s <= 1.2; s += 0.2) {
        var ptX = perigeeX + tVecX * s;
        var ptY = perigeeY + tVecY * s;
        var ptZ = perigeeZ + tVecZ * s;
        var projPt = self.project(ptX, ptY, ptZ);

        if (projPt.visible) {
          if (firstPt) { ctx.moveTo(projPt.x, projPt.y); firstPt = false; }
          else { ctx.lineTo(projPt.x, projPt.y); }
        }
      }

      // Trajectory line styling
      if (isSelected || isHovered) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.2;
        ctx.shadowColor = isHazard ? "rgba(255, 51, 85, 0.9)" : "rgba(0, 255, 196, 0.9)";
        ctx.shadowBlur = 10;
      } else if (isHazard) {
        ctx.strokeStyle = "rgba(255, 51, 85, 0.75)";
        ctx.lineWidth = 1.4;
        ctx.shadowBlur = 0;
      } else {
        ctx.strokeStyle = "rgba(0, 255, 196, 0.4)";
        ctx.lineWidth = 1.0;
        ctx.shadowBlur = 0;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Current Simulated Position
      var curX = perigeeX + tVecX * sPos;
      var curY = perigeeY + tVecY * sPos;
      var curZ = perigeeZ + tVecZ * sPos;
      var curProj = self.project(curX, curY, curZ);
      ast._proj = curProj; // Cached for mouse hit testing

      // Perigee Reference Marker (when sim active)
      var perigeeProj = self.project(perigeeX, perigeeY, perigeeZ);
      if (hasSim && perigeeProj.visible && Math.abs(sPos) > 0.08) {
        ctx.strokeStyle = isHazard ? "rgba(255, 51, 85, 0.45)" : "rgba(0, 255, 196, 0.35)";
        ctx.lineWidth = 1;
        ctx.strokeRect(perigeeProj.x - 3, perigeeProj.y - 3, 6, 6);
      }

      // Motion wake / trail behind the asteroid when sim active
      if (hasSim && curProj.visible) {
        var trailS = Math.max(-1.3, sPos - (sPos >= 0 ? 0.25 : -0.25));
        var trailX = perigeeX + tVecX * trailS;
        var trailY = perigeeY + tVecY * trailS;
        var trailZ = perigeeZ + tVecZ * trailS;
        var trailProj = self.project(trailX, trailY, trailZ);
        if (trailProj.visible) {
          ctx.strokeStyle = isHazard ? "rgba(255, 51, 85, 0.6)" : "rgba(0, 255, 196, 0.6)";
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(trailProj.x, trailProj.y);
          ctx.lineTo(curProj.x, curProj.y);
          ctx.stroke();
        }
      }

      // Render Asteroid Node at current position
      if (curProj.visible) {
        var diam = ast.diameter_m_avg || 40;
        var nodeR = Math.max(3, Math.min(9, 3 + Math.sqrt(diam) * 0.22));

        ctx.fillStyle = isHazard ? "#ff3355" : "#00ffc4";
        ctx.beginPath();
        ctx.arc(curProj.x, curProj.y, nodeR, 0, Math.PI * 2);
        ctx.fill();

        // Pulsing ring around hazardous, selected, or active perigee encounter
        var isEncounterNow = hasSim && Math.abs(deltaHours) < 6;
        if (isHazard || isSelected || isHovered || isEncounterNow) {
          var pulse = (Math.sin(Date.now() * 0.008) + 1) * 2;
          ctx.strokeStyle = isHazard ? "rgba(255, 51, 85, 0.8)" : "rgba(0, 255, 196, 0.8)";
          ctx.lineWidth = isEncounterNow ? 2 : 1.5;
          ctx.beginPath();
          ctx.arc(curProj.x, curProj.y, nodeR + 3 + pulse, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Object label for close or hazardous encounters
        if (ld < 8 || isHazard || isSelected || isHovered || isEncounterNow) {
          ctx.fillStyle = isHazard ? "#ff6b8b" : "#eef2ff";
          ctx.font = "9px 'Share Tech Mono', monospace";
          var labelText = (ast.name || ast.id) + " (" + (Math.round(ld * 10) / 10) + " LD)";
          if (isEncounterNow) {
            labelText += " [ENCOUNTER]";
          }
          ctx.fillText(labelText, curProj.x + nodeR + 4, curProj.y - 2);
        }
      }
    }

    ctx.restore();
  };

  Globe3D.prototype.renderTargetHUD = function (ctx) {
    var target = this.hoveredObject;
    if (!target && this.selectedId) {
      target = this.objects.find(function (o) { return String(o.id) === this.selectedId; });
    }
    if (!target || !target._proj || !target._proj.visible) return;

    var px = target._proj.x;
    var py = target._proj.y;
    var isHazard = !!target.hazardous;

    ctx.save();

    // 1. Tactical Reticle Brackets [ + ]
    var rSize = 14;
    var pulse = (Math.sin(Date.now() * 0.01) + 1) * 2;
    var totalR = rSize + pulse;

    ctx.strokeStyle = isHazard ? "#ff3355" : "#00ffc4";
    ctx.lineWidth = 1.8;
    ctx.shadowColor = isHazard ? "rgba(255, 51, 85, 0.8)" : "rgba(0, 255, 196, 0.8)";
    ctx.shadowBlur = 8;

    // Top-left
    ctx.beginPath();
    ctx.moveTo(px - totalR, py - totalR + 6); ctx.lineTo(px - totalR, py - totalR); ctx.lineTo(px - totalR + 6, py - totalR);
    // Top-right
    ctx.moveTo(px + totalR - 6, py - totalR); ctx.lineTo(px + totalR, py - totalR); ctx.lineTo(px + totalR, py - totalR + 6);
    // Bottom-left
    ctx.moveTo(px - totalR, py + totalR - 6); ctx.lineTo(px - totalR, py + totalR); ctx.lineTo(px - totalR + 6, py + totalR);
    // Bottom-right
    ctx.moveTo(px + totalR - 6, py + totalR); ctx.lineTo(px + totalR, py + totalR); ctx.lineTo(px + totalR, py + totalR - 6);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 2. Floating Telemetry Tooltip Chip
    var chipW = 168;
    var chipH = 68;
    var chipX = px + 22;
    var chipY = py - 34;

    // Keep on screen
    if (chipX + chipW > this.width - 10) chipX = px - chipW - 22;
    if (chipY < 10) chipY = 10;
    if (chipY + chipH > this.height - 10) chipY = this.height - chipH - 10;

    // Connector line
    ctx.strokeStyle = "rgba(255, 140, 59, 0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + (chipX > px ? totalR : -totalR), py);
    ctx.lineTo(chipX + (chipX > px ? 0 : chipW), chipY + chipH / 2);
    ctx.stroke();

    // Chip box
    ctx.fillStyle = "rgba(4, 7, 20, 0.92)";
    ctx.strokeStyle = isHazard ? "var(--hud-crimson)" : "var(--hud-line-bright)";
    ctx.lineWidth = 1.2;
    ctx.fillRect(chipX, chipY, chipW, chipH);
    ctx.strokeRect(chipX, chipY, chipW, chipH);

    // Chip text
    ctx.fillStyle = isHazard ? "#ff6b8b" : "#ffbe76";
    ctx.font = "bold 10px 'Share Tech Mono', monospace";
    ctx.textAlign = "left";
    ctx.fillText("TARGET: " + (target.name || target.id).slice(0, 18), chipX + 8, chipY + 16);

    ctx.fillStyle = "#eef2ff";
    ctx.font = "9px 'Share Tech Mono', monospace";
    ctx.fillText("CLOSEST: " + (target.miss_lunar ? target.miss_lunar.toFixed(2) : "-") + " LD (" + Math.round(target.miss_km || 0).toLocaleString() + " km)", chipX + 8, chipY + 32);
    ctx.fillText("SPEED:   " + (target.velocity_kms ? target.velocity_kms.toFixed(1) : "-") + " km/s", chipX + 8, chipY + 46);

    ctx.fillStyle = isHazard ? "#ff3355" : "#00ffc4";
    ctx.fillText("STATUS:  " + (isHazard ? "HAZARDOUS (PHA)" : "NOMINAL NEO"), chipX + 8, chipY + 60);

    ctx.restore();
  };

  Globe3D.prototype.resetView = function () {
    this.yaw = 0.55;
    this.pitch = 0.35;
    this.zoom = 1.0;
    this.lastInteraction = Date.now();
  };

  Globe3D.prototype.toggleAutoSpin = function () {
    this.autoSpin = !this.autoSpin;
    return this.autoSpin;
  };

  Globe3D.prototype.toggleMoon = function () {
    this.showMoon = !this.showMoon;
    return this.showMoon;
  };

  Globe3D.prototype.start = function () {
    var self = this;
    var loop = function () {
      self.render();
      self.animHandle = requestAnimationFrame(loop);
    };
    this.animHandle = requestAnimationFrame(loop);
  };

  Globe3D.prototype.destroy = function () {
    if (this.animHandle) cancelAnimationFrame(this.animHandle);
  };

  window.Globe3D = Globe3D;
})();

