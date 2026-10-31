/* Tiny client for the Space Explorer backend.

   Where is the backend?
   1. window.SPACE_API_BASE, if you set it before this script loads
   2. the same origin ("/api"), which is the case when the backend serves this folder (default setup)
   3. http://localhost:8000/api, when you open the frontend from another server or a file
*/
(function () {
  "use strict";

  var FALLBACK = "http://localhost:8000/api";
  var base = null;

  function withTimeout(url, ms) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, ms);
    return fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } })
      .finally(function () { clearTimeout(timer); });
  }

  function isJson(res) {
    var type = res.headers.get("content-type") || "";
    return type.indexOf("application/json") !== -1;
  }

  function detectBase() {
    if (base) return Promise.resolve(base);

    var candidates = [];
    if (window.SPACE_API_BASE) candidates.push(window.SPACE_API_BASE);
    if (location.protocol.indexOf("http") === 0) candidates.push("/api");
    candidates.push(FALLBACK);

    var chain = Promise.resolve(null);
    candidates.forEach(function (candidate) {
      chain = chain.then(function (found) {
        if (found) return found;
        return withTimeout(candidate.replace(/\/$/, "") + "/health", 4000)
          .then(function (res) { return res.ok && isJson(res) ? candidate.replace(/\/$/, "") : null; })
          .catch(function () { return null; });
      });
    });

    return chain.then(function (found) {
      if (!found) {
        var err = new Error("The backend is not running.");
        err.code = "BACKEND_DOWN";
        throw err;
      }
      base = found;
      return base;
    });
  }

  function get(path, params) {
    return detectBase().then(function (root) {
      var query = "";
      if (params) {
        var usp = new URLSearchParams();
        Object.keys(params).forEach(function (k) {
          if (params[k] !== undefined && params[k] !== null && params[k] !== "") usp.set(k, params[k]);
        });
        var s = usp.toString();
        if (s) query = "?" + s;
      }
      return withTimeout(root + path + query, 30000).then(function (res) {
        return res.json().catch(function () { return null; }).then(function (body) {
          if (!res.ok) {
            var message = body && body.error && body.error.message ? body.error.message : "Request failed (" + res.status + ").";
            var err = new Error(message);
            err.status = res.status;
            throw err;
          }
          return body;
        });
      });
    });
  }

  function post(path, data, signal) {
    return detectBase().then(function (root) {
      return fetch(root + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        signal: signal,
      }).then(function (res) {
        return res.json().catch(function () { return null; }).then(function (body) {
          if (!res.ok) {
            var message = body && body.error && body.error.message ? body.error.message : "Request failed (" + res.status + ").";
            var err = new Error(message);
            err.status = res.status;
            err.retryAfter = res.headers ? res.headers.get("Retry-After") : null;
            throw err;
          }
          return body;
        });
      });
    });
  }

  window.SpaceAPI = {
    health: function () { return get("/health"); },
    upstream: function () { return get("/health/upstream"); },
    modules: function () { return get("/modules"); },
    apod: function (date) { return get("/apod", { date: date }); },
    randomApod: function () { return get("/apod/random", { count: 1 }); },
    asteroids: function (start, end) { return get("/asteroids", { start: start, end: end }); },
    asteroid: function (id) { return get("/asteroids/" + encodeURIComponent(id)); },
    rovers: function () { return get("/mars/rovers"); },
    marsLibrary: function (rover, query, page) { return get("/mars/library", { rover: rover, q: query, page: page }); },
    marsAsset: function (nasaId) { return get("/mars/library/" + encodeURIComponent(nasaId)); },
    marsDay: function (earthDate) { return get("/mars/day", { earth_date: earthDate }); },
    labOverview: function () { return get("/lab/overview"); },
    roverStats: function (rover) { return get("/lab/rovers/" + encodeURIComponent(rover) + "/stats"); },
    roverSeries: function (rover, bucket) { return get("/lab/rovers/" + encodeURIComponent(rover) + "/series", { bucket: bucket }); },
    compareRovers: function (rovers) { return get("/lab/compare", { rovers: Array.isArray(rovers) ? rovers.join(",") : rovers }); },
    assistantChat: function (messages, signal) { return post("/assistant/chat", { messages: messages }, signal); },
    docsUrl: function () { return detectBase().then(function (root) { return root.replace(/\/api$/, "") + "/api/docs"; }); }
  };
})();
