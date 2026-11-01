/* Space Explorer - Mars Image Explorer page logic (Path B).
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

  // ------------------------------------------------------------- State
  var currentRover = "curiosity";
  var currentQuery = "";
  var currentPage = 1;
  var currentPhotos = [];
  var totalHits = 0;
  var hasMore = false;
  var activePhotoIndex = -1;
  var activeSkyDate = null;
  var lastTriggerElement = null;
  var roversMeta = {};

  var searchInput = $("search-input");
  var roverBlurb = $("rover-blurb");
  var galleryGrid = $("gallery-grid");
  var galleryCount = $("gallery-count");
  var emptyState = $("empty-state");
  var errorContainer = $("error-container");
  var loadMoreContainer = $("load-more-container");
  var btnLoadMore = $("btn-load-more");
  var liveAnnouncer = $("live-announcer");
  var lightbox = $("photo-lightbox");
  var skyContent = $("sky-day-content");
  var offlineAlert = $("offline-alert");

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

  // ------------------------------------------------------------- Rovers
  function loadRovers() {
    window.SpaceAPI.rovers().then(function (data) {
      (data.rovers || []).forEach(function (r) {
        roversMeta[r.id] = r;
      });
      updateRoverBlurb();
    }).catch(function () {
      if (roverBlurb) roverBlurb.textContent = "Explore photographs sent back from NASA rovers on Mars.";
    });
  }

  function updateRoverBlurb() {
    if (!roverBlurb) return;
    var meta = roversMeta[currentRover];
    if (meta) {
      roverBlurb.textContent = meta.blurb + " Landed on Mars on " + meta.landing_date + " (" + meta.status + ").";
    } else {
      roverBlurb.textContent = "Explore photographs sent back from NASA rovers on Mars.";
    }
  }

  function selectRover(roverSlug) {
    if (currentRover === roverSlug) return;
    currentRover = roverSlug;

    var tabs = document.querySelectorAll(".rover-tab");
    tabs.forEach(function (tab) {
      var r = tab.getAttribute("data-rover");
      if (r === roverSlug) {
        tab.classList.add("active");
        tab.setAttribute("aria-selected", "true");
      } else {
        tab.classList.remove("active");
        tab.setAttribute("aria-selected", "false");
      }
    });

    updateRoverBlurb();
    currentPage = 1;
    currentPhotos = [];
    loadGallery();
  }

  // ------------------------------------------------------------- Gallery
  function syncUrl() {
    var u = new URL(location.href);
    u.searchParams.set("rover", currentRover);
    if (currentQuery) u.searchParams.set("q", currentQuery);
    else u.searchParams.delete("q");
    history.replaceState(null, "", u.toString());
  }

  function renderGallery(items, append) {
    if (!append) {
      galleryGrid.replaceChildren();
    }

    if (errorContainer) errorContainer.style.display = "none";

    if (!items || items.length === 0) {
      if (!append && emptyState) emptyState.style.display = "block";
      if (galleryCount) galleryCount.textContent = "0 photos found";
      if (loadMoreContainer) loadMoreContainer.style.display = "none";
      return;
    }

    if (emptyState) emptyState.style.display = "none";

    items.forEach(function (photo, idx) {
      var absoluteIndex = append ? (currentPhotos.length - items.length + idx) : idx;
      var card = el("article", {
        class: "photo-card",
        tabindex: "0",
        role: "button",
        "aria-label": (photo.title || "Mars photo") + ", " + prettyDate(photo.date)
      });

      var thumbBox = el("div", { class: "photo-thumb-box" });
      var src = safeUrl(photo.thumb_url);
      if (src) {
        var img = el("img", {
          class: "photo-thumb",
          src: src,
          alt: photo.title || "Mars photograph",
          loading: "lazy",
          decoding: "async"
        });
        thumbBox.appendChild(img);
      }
      card.appendChild(thumbBox);

      var info = el("div", { class: "photo-info" }, [
        el("h3", { class: "photo-title", text: photo.title || "Mars Image" }),
        el("div", { class: "photo-meta" }, [
          el("span", { text: prettyDate(photo.date) }),
          el("span", { text: photo.center || "NASA" })
        ])
      ]);
      card.appendChild(info);

      card.addEventListener("click", function () {
        selectPhoto(absoluteIndex, card);
      });
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectPhoto(absoluteIndex, card);
        }
      });

      galleryGrid.appendChild(card);
    });

    if (galleryCount) {
      galleryCount.textContent = (totalHits > 0 ? totalHits.toLocaleString() : currentPhotos.length) + " photos found";
    }

    if (loadMoreContainer) {
      loadMoreContainer.style.display = hasMore ? "flex" : "none";
    }
  }

  function loadGallery(append) {
    syncUrl();

    if (!append) {
      galleryGrid.replaceChildren(
        el("div", { class: "card-skel skeleton" }),
        el("div", { class: "card-skel skeleton" }),
        el("div", { class: "card-skel skeleton" }),
        el("div", { class: "card-skel skeleton" }),
        el("div", { class: "card-skel skeleton" }),
        el("div", { class: "card-skel skeleton" })
      );
      if (galleryCount) galleryCount.textContent = "Searching...";
    }

    if (btnLoadMore) {
      btnLoadMore.disabled = true;
      btnLoadMore.textContent = "Loading...";
    }

    window.SpaceAPI.marsLibrary(currentRover, currentQuery, currentPage).then(function (res) {
      totalHits = res.total_hits || 0;
      hasMore = res.has_more || false;
      var newItems = res.items || [];

      if (append) {
        currentPhotos = currentPhotos.concat(newItems);
        renderGallery(newItems, true);
        if (liveAnnouncer) liveAnnouncer.textContent = newItems.length + " more photos loaded";
      } else {
        currentPhotos = newItems;
        renderGallery(currentPhotos, false);
        // Automatically inspect sky for the first item if available and no date selected
        if (currentPhotos.length > 0 && !activeSkyDate && currentPhotos[0].date) {
          inspectSkyDay(currentPhotos[0].date);
        }
      }
    }).catch(function (err) {
      if (errorContainer) {
        var title = $("error-title");
        var body = $("error-body");
        if (title) title.textContent = "Could not load images";
        if (body) body.textContent = (err && err.message) || "Try again in a moment.";
        errorContainer.style.display = "block";
      }
      if (!append) galleryGrid.replaceChildren();
    }).finally(function () {
      if (btnLoadMore) {
        btnLoadMore.disabled = false;
        btnLoadMore.textContent = "Load more photos";
      }
    });
  }

  // ------------------------------------------------------------- Lightbox
  function selectPhoto(index, triggerEl) {
    if (index < 0 || index >= currentPhotos.length) return;
    activePhotoIndex = index;
    lastTriggerElement = triggerEl || document.activeElement;

    var photo = currentPhotos[index];
    if (photo.date) {
      inspectSkyDay(photo.date);
    }

    openLightbox(photo);
  }

  function openLightbox(photo) {
    if (!lightbox) return;

    var title = $("lightbox-title");
    var dateEl = $("lightbox-date");
    var img = $("lightbox-img");
    var origLink = $("lightbox-orig-link");
    var counter = $("photo-counter");
    var errBox = $("lightbox-error");

    if (title) title.textContent = photo.title || "Mars Photograph";
    if (dateEl) dateEl.textContent = "Earth Date: " + prettyDate(photo.date) + (photo.center ? " • " + photo.center : "");
    if (counter) counter.textContent = (activePhotoIndex + 1) + " of " + currentPhotos.length;
    if (errBox) errBox.style.display = "none";

    // Set initial preview thumbnail while fetching full size
    var thumbSrc = safeUrl(photo.thumb_url);
    if (img && thumbSrc) {
      img.src = thumbSrc;
      img.alt = photo.title || "Mars Rover Photograph";
    }

    if (origLink && thumbSrc) origLink.href = thumbSrc;

    // Show modal dialog
    if (typeof lightbox.showModal === "function") {
      lightbox.showModal();
    } else {
      lightbox.setAttribute("open", "");
    }

    updateLightboxNav();

    // Fetch high-res image asset
    if (photo.nasa_id) {
      window.SpaceAPI.marsAsset(photo.nasa_id).then(function (asset) {
        var highRes = safeUrl(asset.image_url);
        if (highRes && img && lightbox.open) {
          img.src = highRes;
          if (origLink) origLink.href = highRes;
        }
      }).catch(function () {
        // Fallback remains thumbnail
      });
    }

    if (img) {
      img.onerror = function () {
        if (errBox) errBox.style.display = "block";
      };
    }
  }

  function closeLightbox() {
    if (!lightbox) return;
    try {
      if (typeof lightbox.close === "function" && lightbox.open) {
        lightbox.close();
      }
    } catch (e) {}
    lightbox.removeAttribute("open");
    if (lastTriggerElement && typeof lastTriggerElement.focus === "function") {
      try { lastTriggerElement.focus(); } catch (e) {}
    }
  }

  function updateLightboxNav() {
    var btnPrev = $("btn-prev-photo");
    var btnNext = $("btn-next-photo");
    if (btnPrev) btnPrev.disabled = activePhotoIndex <= 0;
    if (btnNext) btnNext.disabled = activePhotoIndex >= currentPhotos.length - 1;
  }

  function nextPhoto() {
    if (activePhotoIndex < currentPhotos.length - 1) {
      selectPhoto(activePhotoIndex + 1, lastTriggerElement);
    }
  }

  function prevPhoto() {
    if (activePhotoIndex > 0) {
      selectPhoto(activePhotoIndex - 1, lastTriggerElement);
    }
  }

  // ------------------------------------------------------------- The Sky That Day
  function inspectSkyDay(earthDateStr) {
    if (!skyContent || !earthDateStr) return;
    activeSkyDate = earthDateStr;

    skyContent.replaceChildren(
      el("div", { class: "sky-day-date", text: "Earth date: " + prettyDate(earthDateStr) }),
      el("div", { class: "skeleton line w60" }),
      el("div", { class: "skeleton line" }),
      el("div", { class: "skeleton line" })
    );

    window.SpaceAPI.marsDay(earthDateStr).then(function (day) {
      renderSkyDay(day);
    }).catch(function (err) {
      skyContent.replaceChildren(
        el("div", { class: "sky-day-date", text: "Earth date: " + prettyDate(earthDateStr) }),
        el("p", { class: "sky-error-note", text: (err && err.message) || "Could not load sky data for this date." })
      );
    });
  }

  function renderSkyDay(day) {
    skyContent.replaceChildren();

    var heading = el("div", { class: "sky-day-date" }, [
      el("span", { text: "Earth date: " + prettyDate(day.earth_date) })
    ]);
    skyContent.appendChild(heading);

    // 1. APOD Card
    var apodCard = el("div", { class: "sky-card" }, [
      el("div", { class: "sky-card-label", text: "Picture of the day" })
    ]);

    if (day.apod) {
      var a = day.apod;
      var src = safeUrl(a.thumbnail_url || a.url);
      if (src && a.media_type === "image") {
        apodCard.appendChild(el("img", {
          class: "sky-apod-thumb",
          src: src,
          alt: a.title || "APOD",
          loading: "lazy"
        }));
      }
      apodCard.appendChild(el("h4", { text: a.title || "Untitled" }));
      if (a.explanation) {
        var snippet = a.explanation.length > 140 ? a.explanation.slice(0, 140) + "..." : a.explanation;
        apodCard.appendChild(el("p", { text: snippet }));
      }
      var apodLink = safeUrl(a.hd_url || a.url);
      if (apodLink) {
        apodCard.appendChild(el("a", { class: "sky-link", href: apodLink, target: "_blank", rel: "noopener", text: "View image ↗" }));
      }
    } else {
      var apodMsg = (day.errors && day.errors.apod) || "Picture of the day is unavailable for this date.";
      apodCard.appendChild(el("p", { class: "sky-error-note", text: apodMsg }));
    }
    skyContent.appendChild(apodCard);

    // 2. Asteroids Card
    var astCard = el("div", { class: "sky-card" }, [
      el("div", { class: "sky-card-label", text: "Near-Earth asteroids" })
    ]);

    if (day.asteroids) {
      var count = day.asteroids.count;
      var closest = day.asteroids.closest;
      if (count > 0) {
        var text = count === 1 ? "1 asteroid passed Earth on this date" : count + " asteroids passed Earth on this date";
        if (closest && closest.miss_lunar != null) {
          text += ", the closest (" + (closest.name || closest.id) + ") at " + round(closest.miss_lunar, 1) + " lunar distances.";
        } else {
          text += ".";
        }
        astCard.appendChild(el("p", { text: text }));
        var astHref = "/asteroids.html?start=" + day.earth_date + "&end=" + day.earth_date;
        astCard.appendChild(el("a", { class: "sky-link", href: astHref, text: "View in Asteroid Tracker →" }));
      } else {
        astCard.appendChild(el("p", { text: "No near-Earth objects recorded passing Earth on this date." }));
      }
    } else {
      var astMsg = (day.errors && day.errors.asteroids) || "Asteroid tracking data is unavailable for this date.";
      astCard.appendChild(el("p", { class: "sky-error-note", text: astMsg }));
    }
    skyContent.appendChild(astCard);
  }

  // ------------------------------------------------------------- Event Listeners
  // Rover Tabs
  document.querySelectorAll(".rover-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      selectRover(tab.getAttribute("data-rover"));
    });
    tab.addEventListener("keydown", function (e) {
      var tabs = Array.from(document.querySelectorAll(".rover-tab"));
      var idx = tabs.indexOf(tab);
      if (e.key === "ArrowRight") {
        e.preventDefault();
        var next = (idx + 1) % tabs.length;
        tabs[next].focus();
        tabs[next].click();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        var prev = (idx - 1 + tabs.length) % tabs.length;
        tabs[prev].focus();
        tabs[prev].click();
      }
    });
  });

  // Search Form
  $("search-form").addEventListener("submit", function (e) {
    e.preventDefault();
    currentQuery = (searchInput.value || "").trim();
    currentPage = 1;
    currentPhotos = [];
    loadGallery();
  });

  $("btn-clear").addEventListener("click", function () {
    searchInput.value = "";
    currentQuery = "";
    document.querySelectorAll(".chip-btn").forEach(function (c) { c.classList.remove("active"); });
    currentPage = 1;
    currentPhotos = [];
    loadGallery();
  });

  // Suggestions Chips
  document.querySelectorAll(".chip-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var kw = btn.getAttribute("data-kw");
      searchInput.value = kw;
      currentQuery = kw;

      document.querySelectorAll(".chip-btn").forEach(function (c) { c.classList.remove("active"); });
      btn.classList.add("active");

      currentPage = 1;
      currentPhotos = [];
      loadGallery();
    });
  });

  // Load More Button
  if (btnLoadMore) {
    btnLoadMore.addEventListener("click", function () {
      if (hasMore) {
        currentPage += 1;
        loadGallery(true);
      }
    });
  }

  $("btn-retry").addEventListener("click", function () {
    loadGallery();
  });

  // Lightbox Close & Navigation
  $("lightbox-close").addEventListener("click", closeLightbox);
  $("btn-prev-photo").addEventListener("click", prevPhoto);
  $("btn-next-photo").addEventListener("click", nextPhoto);

  if (lightbox) {
    lightbox.addEventListener("close", function () {
      if (lastTriggerElement && typeof lastTriggerElement.focus === "function") {
        lastTriggerElement.focus();
      }
    });
    lightbox.addEventListener("click", function (e) {
      if (e.target === lightbox) {
        var rect = lightbox.getBoundingClientRect();
        var isIn = (rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
          rect.left <= e.clientX && e.clientX <= rect.left + rect.width);
        if (!isIn) closeLightbox();
      }
    });
    lightbox.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prevPhoto();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nextPhoto();
      }
    });
  }

  // ------------------------------------------------------------- Boot
  var qParams = new URLSearchParams(location.search);
  var qRover = qParams.get("rover");
  var qText = qParams.get("q");

  if (qRover && ["curiosity", "perseverance", "opportunity", "spirit"].indexOf(qRover.toLowerCase()) !== -1) {
    currentRover = qRover.toLowerCase();
    var activeTab = $("tab-" + currentRover);
    if (activeTab) {
      document.querySelectorAll(".rover-tab").forEach(function (t) {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      activeTab.classList.add("active");
      activeTab.setAttribute("aria-selected", "true");
    }
  }

  if (qText) {
    currentQuery = qText.trim();
    if (searchInput) searchInput.value = currentQuery;
  }

  loadStatus();
  loadRovers();
  loadGallery();
})();

