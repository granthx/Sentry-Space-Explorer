/* Space Explorer - Phase 0 page logic.
   All text from the server is inserted with textContent, never as HTML. */
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

  function prettyDate(iso) {
    if (!iso) return "";
    var d = new Date(iso + "T00:00:00");
    return isNaN(d) ? iso : d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }

  function isoToday() {
    var d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  var BACKEND_HELP = "In a terminal, open the backend folder and run: uvicorn app.main:app --reload. Then refresh this page.";

  /* ------------------------------------------------------------- APOD */

  var apodBox = $("apod");
  var dateInput = $("apod-date");
  var loadToken = 0;

  function showApodError(err) {
    var down = err && err.code === "BACKEND_DOWN";
    var title = down ? "The backend isn't running" : (err && err.status === 429 ? "NASA's limit was reached" : "Today's picture didn't load");
    var body = down ? BACKEND_HELP : (err && err.message) || "Try again in a moment.";
    var retry = el("button", { type: "button", class: "btn small", text: "Try again" });
    retry.addEventListener("click", function () { loadApod(dateInput.value || undefined); });
    apodBox.replaceChildren(el("div", { class: "notice", role: "alert" }, [
      el("h3", { text: title }),
      el("p", { text: body }),
      retry
    ]));
    apodBox.setAttribute("aria-busy", "false");
  }

  function mediaFor(a) {
    var box = el("div", { class: "apod-media" });
    var page = safeUrl(a.hd_url || a.url);

    if (a.media_type === "image") {
      var src = safeUrl(a.url);
      if (src) {
        var img = el("img", { src: src, alt: a.title || "Astronomy picture of the day", loading: "eager", decoding: "async" });
        if (page) {
          var link = el("a", { class: "media-link", href: page, target: "_blank", rel: "noopener", "aria-label": "Open the full-size image" });
          link.appendChild(img);
          box.appendChild(link);
        } else box.appendChild(img);
      }
    } else {
      var video = safeUrl(a.url);
      var embeddable = video && /^https:\/\/(www\.)?(youtube\.com\/embed|player\.vimeo\.com)\//.test(video);
      if (embeddable) {
        box.appendChild(el("iframe", { src: video, title: a.title || "Video", allowfullscreen: "", loading: "lazy", referrerpolicy: "no-referrer" }));
      } else {
        var thumb = safeUrl(a.thumbnail_url);
        var vlink = el("a", { class: "media-link", href: video || "#", target: "_blank", rel: "noopener", "aria-label": "Open the video" });
        if (thumb) vlink.appendChild(el("img", { src: thumb, alt: a.title || "Video thumbnail" }));
        vlink.appendChild(el("span", { class: "play", text: "Watch on NASA's page" }));
        box.appendChild(vlink);
      }
    }
    return box;
  }

  function renderApod(a) {
    var links = el("div", { class: "apod-links" });
    var hd = safeUrl(a.hd_url);
    if (hd && a.media_type === "image") links.appendChild(el("a", { href: hd, target: "_blank", rel: "noopener", text: "Open full size" }));
    links.appendChild(el("a", {
      href: "https://apod.nasa.gov/apod/ap" + (a.date || "").slice(2).replace(/-/g, "") + ".html",
      target: "_blank", rel: "noopener", text: "View on NASA's APOD site"
    }));

    var text = el("div", { class: "apod-text" }, [
      el("p", { class: "apod-meta", text: prettyDate(a.date) }),
      el("h3", { text: a.title || "Untitled" }),
      el("p", { class: "explain", text: a.explanation || "" }),
      a.copyright ? el("p", { class: "apod-credit", text: "Image credit: " + a.copyright }) : null,
      links
    ]);

    apodBox.replaceChildren(mediaFor(a), text);
    apodBox.setAttribute("aria-busy", "false");
    if (a.date) dateInput.value = a.date;
  }

  function loadApod(date, random) {
    var token = ++loadToken;
    apodBox.setAttribute("aria-busy", "true");
    var request = random
      ? window.SpaceAPI.randomApod().then(function (r) { return r.items[0]; })
      : window.SpaceAPI.apod(date);

    request.then(function (a) {
      if (token !== loadToken) return;
      if (!a) throw new Error("NASA returned no picture for that day.");
      renderApod(a);
    }).catch(function (err) {
      if (token !== loadToken) return;
      showApodError(err);
    });
  }

  dateInput.max = isoToday();
  dateInput.addEventListener("change", function () { if (dateInput.value) loadApod(dateInput.value); });
  $("apod-latest").addEventListener("click", function () { loadApod(undefined); });
  $("apod-random").addEventListener("click", function () { loadApod(undefined, true); });

  /* ---------------------------------------------------------- modules */

  var NS = "http://www.w3.org/2000/svg";
  function glyph(id) {
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 64 64");
    svg.setAttribute("class", "glyph");
    svg.setAttribute("aria-hidden", "true");
    var shapes = {
      asteroids: '<path d="M14 40c-4-8 0-18 9-22 7-3 16-2 22 3 6 5 8 13 4 20-4 8-14 11-22 9-6-1-11-4-13-10z" fill="#2a2f66" stroke="#ff9f5a" stroke-width="2"/><circle cx="27" cy="30" r="4" fill="none" stroke="#ff9f5a" stroke-width="1.6"/><circle cx="41" cy="40" r="3" fill="none" stroke="#ff9f5a" stroke-width="1.6"/><path d="M6 14l10 6M4 24l8 3" stroke="#eef2ff" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>',
      "mars-images": '<circle cx="32" cy="32" r="20" fill="#7a2f22"/><circle cx="32" cy="32" r="20" fill="none" stroke="#ff6e50" stroke-width="2"/><path d="M14 30c8-4 12 4 20 0s10-6 16-2" fill="none" stroke="#ff9f6a" stroke-width="2" opacity=".7"/><circle cx="40" cy="42" r="4" fill="#5a2018"/><circle cx="24" cy="40" r="2.5" fill="#5a2018"/><rect x="4" y="8" width="16" height="12" rx="3" fill="none" stroke="#eef2ff" stroke-width="1.6" opacity=".7"/><circle cx="12" cy="14" r="3" fill="none" stroke="#eef2ff" stroke-width="1.6" opacity=".7"/>',
      "mars-data": '<rect x="6" y="8" width="52" height="48" rx="8" fill="none" stroke="#38e1c6" stroke-width="2"/><path d="M14 44l10-12 9 7 10-17 7 9" fill="none" stroke="#38e1c6" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24" cy="32" r="2.6" fill="#eef2ff"/><circle cx="43" cy="22" r="2.6" fill="#eef2ff"/>'
    };
    svg.innerHTML = shapes[id] || shapes["mars-data"]; // static markup written above, no server data
    return svg;
  }

  var FALLBACK_MODULES = [
    { id: "asteroids", name: "Asteroid Tracker", tagline: "Near-Earth objects passing by this week, plotted by size, speed and distance.", phase: 1, status: "planned", api: "NASA NeoWs", features: ["Close approaches for any 7-day window", "Distance radar in lunar distances", "Hazard flags and size comparisons"] },
    { id: "mars-images", name: "Mars Image Explorer", tagline: "Browse rover photographs by sol and camera, then see the sky on that same day.", phase: 2, status: "planned", api: "Mars Rover Photos + NASA Image Library", features: ["Curiosity, Perseverance and more", "Sol, camera and date filters with a lightbox", "APOD and asteroid pass for each Earth date"] },
    { id: "mars-data", name: "Mars Data Lab", tagline: "Mission statistics and trends across the rovers, with an AI assistant on top.", phase: 3, status: "planned", api: "Rover manifests + Claude", features: ["Photos per sol, cameras and quiet periods", "Rover-to-rover comparisons", "Ask questions in plain language"] }
  ];

  function moduleCard(m) {
    var live = m.status === "live" && m.href;
    var feats = el("ul", { class: "feat" }, (m.features || []).map(function (f) { return el("li", { text: f }); }));
    var meta = el("div", { class: "meta" }, [
      el("span", { class: "chip" + (live ? " live" : ""), text: live ? "Live" : "Opens in phase " + m.phase }),
      live ? el("a", { class: "open", href: m.href, text: "Open " + m.name }) : el("span", { text: m.api || "" })
    ]);
    var card = el("li", { class: "module", "data-id": m.id }, [
      glyph(m.id),
      el("h3", { text: m.name }),
      el("p", { class: "tag", text: m.tagline }),
      feats,
      meta
    ]);
    return card;
  }

  function renderModules(list) {
    $("module-grid").replaceChildren.apply($("module-grid"), list.map(moduleCard));
  }

  /* ------------------------------------------------------------ status */

  function setNav(state, label) {
    $("nav-dot").dataset.state = state;
    $("nav-status").textContent = label;
  }

  function loadStatus() {
    window.SpaceAPI.health().then(function (h) {
      setNav("ok", "Backend online");
      $("st-backend").textContent = "Online, version " + h.version;
      $("st-key").textContent = h.api_key_mode === "demo" ? "Demo key (30 requests/hour)" : "Your own key";
      var rem = h.rate_limit && h.rate_limit.remaining;
      var lim = h.rate_limit && h.rate_limit.limit;
      $("st-rate").textContent = rem == null ? "Not used yet" : (lim ? rem + " of " + lim : String(rem));
      $("st-phase").textContent = "Phase " + h.phase;
    }).catch(function () {
      setNav("down", "Backend offline");
      $("st-backend").textContent = "Offline";
      $("st-key").textContent = "-";
      $("st-rate").textContent = "-";
      $("st-phase").textContent = "-";
    });

    window.SpaceAPI.docsUrl().then(function (url) { $("docs-link").href = url; }).catch(function () {});
  }

  $("check-nasa").addEventListener("click", function () {
    var btn = $("check-nasa");
    var list = $("upstream");
    btn.disabled = true;
    btn.textContent = "Checking";
    var NAMES = { apod: "Astronomy Picture of the Day", neows: "Asteroid data (NeoWs)", mars_rover_photos: "Mars rover photos", nasa_image_library: "NASA Image Library" };

    window.SpaceAPI.upstream().then(function (r) {
      list.replaceChildren.apply(list, Object.keys(r.services).map(function (key) {
        var s = r.services[key];
        var li = el("li", {}, [
          el("span", { class: "dot", "data-state": s.ok ? "ok" : "down" }),
          el("span", { text: (NAMES[key] || key) + (s.ok ? "" : ": " + (s.error || "unavailable")) }),
          el("span", { class: "ms", text: s.latency_ms + " ms" })
        ]);
        return li;
      }));
    }).catch(function (err) {
      list.replaceChildren(el("li", { text: (err && err.message) || "Could not run the check." }));
    }).finally(function () {
      btn.disabled = false;
      btn.textContent = "Check NASA services";
    });
  });

  /* -------------------------------------------------------------- boot */

  renderModules(FALLBACK_MODULES);
  window.SpaceAPI.modules().then(function (r) { renderModules(r.modules); }).catch(function () { /* keep the built-in copy */ });
  loadApod(undefined);
  loadStatus();
})();
