/**
 * Mars Data Lab - Interactive statistics and Chart.js visualizations
 */

(function () {
  "use strict";

  var ROVER_COLORS = {
    curiosity: { hex: "#ff9f5a", rgb: "255, 159, 90", dash: [], point: "circle" },
    perseverance: { hex: "#38e1c6", rgb: "56, 225, 198", dash: [5, 5], point: "rect" },
    opportunity: { hex: "#8d78ff", rgb: "141, 120, 255", dash: [2, 2], point: "triangle" },
    spirit: { hex: "#eef2ff", rgb: "238, 242, 255", dash: [6, 3, 2, 3], point: "crossRot" }
  };

  var state = {
    selectedRover: "curiosity",
    bucketSize: 50,
    compareRovers: ["curiosity", "perseverance"],
    roverStatsCache: {},
    overviewData: null,
    charts: {
      timeline: null,
      cameras: null,
      compare: null
    }
  };

  // ---------------- Chart.js Global Setup ----------------

  function setupChartDefaults() {
    if (typeof Chart === "undefined") return;
    Chart.defaults.color = "#a3acd0";
    Chart.defaults.font.family = "'Figtree', 'Segoe UI', system-ui, sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.plugins.tooltip.backgroundColor = "#0d1235";
    Chart.defaults.plugins.tooltip.titleColor = "#eef2ff";
    Chart.defaults.plugins.tooltip.bodyColor = "#a3acd0";
    Chart.defaults.plugins.tooltip.borderColor = "rgba(160, 175, 255, 0.3)";
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 6;
  }

  // ---------------- URL State Management ----------------

  function readUrlState() {
    var params = new URLSearchParams(window.location.search);
    var r = params.get("rover");
    if (r && ["curiosity", "perseverance", "opportunity", "spirit"].indexOf(r.toLowerCase()) !== -1) {
      state.selectedRover = r.toLowerCase();
    }
    var c = params.get("compare");
    if (c) {
      var parts = c.split(",").map(function (s) { return s.trim().toLowerCase(); });
      var valid = parts.filter(function (s) {
        return ["curiosity", "perseverance", "opportunity", "spirit"].indexOf(s) !== -1;
      });
      if (valid.length >= 2) {
        state.compareRovers = valid;
      }
    }
    var b = parseInt(params.get("bucket"), 10);
    if (!isNaN(b) && [25, 50, 100, 250].indexOf(b) !== -1) {
      state.bucketSize = b;
    }
  }

  function updateUrlState() {
    var params = new URLSearchParams();
    params.set("rover", state.selectedRover);
    params.set("bucket", state.bucketSize);
    params.set("compare", state.compareRovers.join(","));
    var newUrl = window.location.pathname + "?" + params.toString();
    window.history.replaceState(null, "", newUrl);
  }

  // ---------------- UI Helpers (No innerHTML for server data) ----------------

  function formatNumber(num) {
    if (typeof num !== "number") return "--";
    return num.toLocaleString("en-US");
  }

  function renderStatTiles(stats) {
    var elTotal = document.getElementById("stat-total-photos");
    var elActive = document.getElementById("stat-active-sols");
    var elRate = document.getElementById("stat-activity-rate");
    var elAvg = document.getElementById("stat-avg-photos");
    var elLength = document.getElementById("stat-mission-length");

    var elLanding = document.getElementById("stat-landing");
    var elQuiet = document.getElementById("stat-quiet-sols");
    var elMedian = document.getElementById("stat-median-photos");
    var elStatus = document.getElementById("stat-status");

    if (elTotal) elTotal.textContent = formatNumber(stats.total_photos);
    if (elActive) elActive.textContent = formatNumber(stats.active_sols);
    if (elRate) elRate.textContent = (stats.activity_rate * 100).toFixed(1) + "%";
    if (elAvg) elAvg.textContent = stats.avg_photos_per_active_sol.toFixed(1);
    if (elLength) elLength.textContent = formatNumber(stats.max_sol + 1) + " sols";

    if (elLanding) elLanding.textContent = "Landed: " + stats.landing_date;
    if (elQuiet) elQuiet.textContent = formatNumber(stats.quiet_sols) + " quiet sols";
    if (elMedian) elMedian.textContent = "Median: " + stats.median_photos_per_active_sol.toFixed(1) + " / sol";
    if (elStatus) elStatus.textContent = "Status: " + stats.status;
  }

  function renderBusiestTable(busiestSols, roverSlug) {
    var tbody = document.getElementById("busiest-tbody");
    if (!tbody) return;
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

    if (!busiestSols || busiestSols.length === 0) {
      var emptyRow = document.createElement("tr");
      var emptyCell = document.createElement("td");
      emptyCell.colSpan = 4;
      emptyCell.className = "empty-cell";
      emptyCell.textContent = "No sol data available";
      emptyRow.appendChild(emptyCell);
      tbody.appendChild(emptyRow);
      return;
    }

    busiestSols.forEach(function (item) {
      var tr = document.createElement("tr");

      var tdSol = document.createElement("td");
      tdSol.textContent = "Sol " + item.sol;
      tr.appendChild(tdSol);

      var tdDate = document.createElement("td");
      tdDate.textContent = item.earth_date || "--";
      tr.appendChild(tdDate);

      var tdPhotos = document.createElement("td");
      tdPhotos.className = "num-col";
      tdPhotos.textContent = formatNumber(item.total_photos);
      tr.appendChild(tdPhotos);

      var tdAction = document.createElement("td");
      tdAction.className = "action-col";
      var a = document.createElement("a");
      a.className = "sol-link";
      a.href = "/mars.html?rover=" + encodeURIComponent(roverSlug) + "&q=sol+" + encodeURIComponent(item.sol);
      a.textContent = "View photos \u2192";
      tdAction.appendChild(a);
      tr.appendChild(tdAction);

      tbody.appendChild(tr);
    });
  }

  function renderGapsTable(longestGaps) {
    var tbody = document.getElementById("gaps-tbody");
    if (!tbody) return;
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

    if (!longestGaps || longestGaps.length === 0) {
      var emptyRow = document.createElement("tr");
      var emptyCell = document.createElement("td");
      emptyCell.colSpan = 4;
      emptyCell.className = "empty-cell";
      emptyCell.textContent = "No quiet gaps recorded";
      emptyRow.appendChild(emptyCell);
      tbody.appendChild(emptyRow);
      return;
    }

    longestGaps.forEach(function (gap) {
      var tr = document.createElement("tr");

      var tdFrom = document.createElement("td");
      tdFrom.textContent = "Sol " + gap.from_sol;
      tr.appendChild(tdFrom);

      var tdTo = document.createElement("td");
      tdTo.textContent = "Sol " + gap.to_sol;
      tr.appendChild(tdTo);

      var tdLen = document.createElement("td");
      tdLen.className = "num-col";
      tdLen.textContent = gap.length_sols + (gap.length_sols === 1 ? " sol" : " sols");
      tr.appendChild(tdLen);

      var tdCause = document.createElement("td");
      tdCause.textContent = gap.length_sols >= 10 ? "Solar conjunction / Stand-down" : "Science operational pause";
      tr.appendChild(tdCause);

      tbody.appendChild(tr);
    });
  }

  // ---------------- Charts Rendering ----------------

  function renderTimelineChart(series, roverSlug) {
    var ctx = document.getElementById("chart-timeline");
    if (!ctx) return;

    var labels = series.map(function (s) { return "Sol " + s.start_sol + "-" + s.end_sol; });
    var dataPhotos = series.map(function (s) { return s.photos; });
    var color = ROVER_COLORS[roverSlug] || ROVER_COLORS.curiosity;

    if (state.charts.timeline) {
      state.charts.timeline.destroy();
    }

    state.charts.timeline = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [{
          label: "Photos",
          data: dataPhotos,
          backgroundColor: "rgba(" + color.rgb + ", 0.65)",
          borderColor: color.hex,
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxTicksLimit: 12 }
          },
          y: {
            beginAtZero: true,
            grid: { color: "rgba(160, 175, 255, 0.08)" },
            title: { display: true, text: "Photos Taken" }
          }
        }
      }
    });

    // Plain text summary
    var totalPhotosInSeries = dataPhotos.reduce(function (a, b) { return a + b; }, 0);
    var maxBucket = series.reduce(function (prev, cur) { return cur.photos > prev.photos ? cur : prev; }, series[0] || { photos: 0 });
    var summaryEl = document.getElementById("timeline-summary");
    if (summaryEl) {
      summaryEl.textContent = "Over " + series.length + " intervals (" + state.bucketSize + " sols each), peak photographic activity occurred during Sols " +
        maxBucket.start_sol + "–" + maxBucket.end_sol + " with " + formatNumber(maxBucket.photos) + " photos.";
    }

    // Screen reader table
    var tbody = document.querySelector("#timeline-table tbody");
    if (tbody) {
      while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
      series.forEach(function (s) {
        var tr = document.createElement("tr");
        var tdRange = document.createElement("td");
        tdRange.textContent = "Sols " + s.start_sol + "-" + s.end_sol;
        var tdPhotos = document.createElement("td");
        tdPhotos.textContent = s.photos;
        var tdActive = document.createElement("td");
        tdActive.textContent = s.active_sols;
        var tdAvg = document.createElement("td");
        tdAvg.textContent = s.avg_per_sol;
        tr.appendChild(tdRange);
        tr.appendChild(tdPhotos);
        tr.appendChild(tdActive);
        tr.appendChild(tdAvg);
        tbody.appendChild(tr);
      });
    }
  }

  function renderCameraChart(cameraSols) {
    var ctx = document.getElementById("chart-cameras");
    if (!ctx) return;

    var labels = cameraSols.map(function (c) { return c.camera; });
    var dataSols = cameraSols.map(function (c) { return c.sols_used; });

    if (state.charts.cameras) {
      state.charts.cameras.destroy();
    }

    state.charts.cameras = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [{
          label: "Sols with photos",
          data: dataSols,
          backgroundColor: "rgba(56, 225, 198, 0.65)",
          borderColor: "#38e1c6",
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: "rgba(160, 175, 255, 0.08)" },
            title: { display: true, text: "Active Sols Used" }
          },
          y: {
            grid: { display: false }
          }
        }
      }
    });

    // Plain text summary
    var summaryEl = document.getElementById("camera-summary");
    if (summaryEl && cameraSols.length > 0) {
      var topCam = cameraSols[0];
      summaryEl.textContent = "Most utilized instrument: " + topCam.camera + " (" + formatNumber(topCam.sols_used) +
        " sols, " + (topCam.share * 100).toFixed(1) + "% of active sols). Note: counts reflect sols with photos from this camera.";
    }

    // Screen reader table
    var tbody = document.querySelector("#camera-table tbody");
    if (tbody) {
      while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
      cameraSols.forEach(function (c) {
        var tr = document.createElement("tr");
        var tdCam = document.createElement("td");
        tdCam.textContent = c.camera;
        var tdSols = document.createElement("td");
        tdSols.textContent = c.sols_used;
        var tdShare = document.createElement("td");
        tdShare.textContent = (c.share * 100).toFixed(1) + "%";
        tr.appendChild(tdCam);
        tr.appendChild(tdSols);
        tr.appendChild(tdShare);
        tbody.appendChild(tr);
      });
    }
  }

  function renderComparisonChart(compareData) {
    var ctx = document.getElementById("chart-compare");
    if (!ctx) return;

    var sameAge = compareData.same_age || {};
    var solMilestones = Object.keys(sameAge).map(function (k) { return parseInt(k, 10); }).sort(function (a, b) { return a - b; });

    var datasets = [];
    var rovers = compareData.rovers || [];

    rovers.forEach(function (rStats) {
      var slug = rStats.rover;
      var color = ROVER_COLORS[slug] || ROVER_COLORS.curiosity;

      var points = [];
      solMilestones.forEach(function (m) {
        if (sameAge[m] && sameAge[m][slug] !== undefined) {
          points.push({ x: m, y: sameAge[m][slug] });
        }
      });

      datasets.push({
        label: rStats.name,
        data: points,
        borderColor: color.hex,
        backgroundColor: "rgba(" + color.rgb + ", 0.2)",
        borderDash: color.dash,
        pointStyle: color.point,
        pointRadius: 5,
        pointHoverRadius: 7,
        fill: false,
        tension: 0.2
      });
    });

    if (state.charts.compare) {
      state.charts.compare.destroy();
    }

    state.charts.compare = new Chart(ctx, {
      type: "line",
      data: { datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false
        },
        plugins: {
          legend: {
            display: true,
            position: "top",
            labels: { usePointStyle: true, padding: 16 }
          }
        },
        scales: {
          x: {
            type: "linear",
            grid: { color: "rgba(160, 175, 255, 0.08)" },
            title: { display: true, text: "Mission Age (Mars Sols)" }
          },
          y: {
            beginAtZero: true,
            grid: { color: "rgba(160, 175, 255, 0.08)" },
            title: { display: true, text: "Cumulative Photos" }
          }
        }
      }
    });

    // Plain text summary
    var summaryEl = document.getElementById("compare-summary");
    if (summaryEl && rovers.length >= 2) {
      var sortedByRate = rovers.slice().sort(function (a, b) {
        return b.avg_photos_per_active_sol - a.avg_photos_per_active_sol;
      });
      summaryEl.textContent = sortedByRate[0].name + " has generated the highest rate with " +
        sortedByRate[0].avg_photos_per_active_sol.toFixed(1) + " photos per active sol, compared to " +
        sortedByRate[1].name + "'s " + sortedByRate[1].avg_photos_per_active_sol.toFixed(1) + " photos per active sol.";
    }

    // Screen reader table
    var tbody = document.querySelector("#compare-table tbody");
    if (tbody) {
      while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
      solMilestones.forEach(function (m) {
        var tr = document.createElement("tr");
        var tdSol = document.createElement("td");
        tdSol.textContent = "Sol " + m;
        tr.appendChild(tdSol);

        ["curiosity", "perseverance", "opportunity", "spirit"].forEach(function (slug) {
          var tdVal = document.createElement("td");
          tdVal.textContent = sameAge[m] && sameAge[m][slug] !== undefined ? sameAge[m][slug] : "N/A";
          tr.appendChild(tdVal);
        });
        tbody.appendChild(tr);
      });
    }
  }

  // ---------------- Data Loading Flow ----------------

  function loadRoverData(roverSlug) {
    var cached = state.roverStatsCache[roverSlug];
    if (cached) {
      renderStatTiles(cached);
      renderBusiestTable(cached.busiest_sols, roverSlug);
      renderGapsTable(cached.longest_gaps);
      renderCameraChart(cached.camera_sols);
    }

    // Fetch stats
    window.SpaceAPI.roverStats(roverSlug).then(function (stats) {
      state.roverStatsCache[roverSlug] = stats;
      renderStatTiles(stats);
      renderBusiestTable(stats.busiest_sols, roverSlug);
      renderGapsTable(stats.longest_gaps);
      renderCameraChart(stats.camera_sols);
    }).catch(function (err) {
      showError("Could not load statistics for " + roverSlug + ": " + err.message);
    });

    // Fetch series
    window.SpaceAPI.roverSeries(roverSlug, state.bucketSize).then(function (series) {
      renderTimelineChart(series, roverSlug);
    }).catch(function (err) {
      showError("Could not load timeline for " + roverSlug + ": " + err.message);
    });
  }

  function loadComparison() {
    if (state.compareRovers.length < 2) return;
    window.SpaceAPI.compareRovers(state.compareRovers).then(function (res) {
      renderComparisonChart(res);
    }).catch(function (err) {
      showError("Could not compare rovers: " + err.message);
    });
  }

  function showError(msg) {
    var alertEl = document.getElementById("error-alert");
    var msgEl = document.getElementById("error-alert-msg");
    if (alertEl && msgEl) {
      msgEl.textContent = msg;
      alertEl.style.display = "block";
    }
  }

  // ---------------- Event Listeners & Initialization ----------------

  function setupEventListeners() {
    // Rover tab switching
    var tabs = document.querySelectorAll(".rover-tab");
    tabs.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var slug = btn.getAttribute("data-rover");
        if (slug === state.selectedRover) return;

        tabs.forEach(function (t) {
          t.classList.remove("active");
          t.setAttribute("aria-selected", "false");
        });
        btn.classList.add("active");
        btn.setAttribute("aria-selected", "true");

        state.selectedRover = slug;
        updateUrlState();
        loadRoverData(slug);
      });
    });

    // Bucket selector buttons
    var bucketBtns = document.querySelectorAll(".bucket-btn");
    bucketBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var b = parseInt(btn.getAttribute("data-bucket"), 10);
        if (b === state.bucketSize) return;

        bucketBtns.forEach(function (bBtn) { bBtn.classList.remove("active"); });
        btn.classList.add("active");

        state.bucketSize = b;
        updateUrlState();
        window.SpaceAPI.roverSeries(state.selectedRover, state.bucketSize).then(function (series) {
          renderTimelineChart(series, state.selectedRover);
        });
      });
    });

    // Comparison checkboxes
    var compCheckboxes = document.querySelectorAll("input[name='rover-comp']");
    compCheckboxes.forEach(function (cb) {
      cb.addEventListener("change", function () {
        var checked = [];
        compCheckboxes.forEach(function (item) {
          if (item.checked) checked.push(item.value);
        });
        if (checked.length < 2) {
          cb.checked = true; // prevent selecting fewer than 2
          return;
        }
        state.compareRovers = checked;
        updateUrlState();
        loadComparison();
      });
    });
  }

  function init() {
    setupChartDefaults();
    readUrlState();

    // Sync UI with initial state
    var initialTab = document.getElementById("tab-" + state.selectedRover);
    if (initialTab) {
      document.querySelectorAll(".rover-tab").forEach(function (t) {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      initialTab.classList.add("active");
      initialTab.setAttribute("aria-selected", "true");
    }

    var initialBucketBtn = document.querySelector(".bucket-btn[data-bucket='" + state.bucketSize + "']");
    if (initialBucketBtn) {
      document.querySelectorAll(".bucket-btn").forEach(function (b) { b.classList.remove("active"); });
      initialBucketBtn.classList.add("active");
    }

    var compCheckboxes = document.querySelectorAll("input[name='rover-comp']");
    compCheckboxes.forEach(function (cb) {
      cb.checked = state.compareRovers.indexOf(cb.value) !== -1;
    });

    setupEventListeners();

    // Check backend health
    window.SpaceAPI.health().then(function (h) {
      var navDot = document.getElementById("nav-dot");
      var navStatus = document.getElementById("nav-status");
      if (navDot) navDot.setAttribute("data-state", "online");
      if (navStatus) navStatus.textContent = "Backend online";

      loadRoverData(state.selectedRover);
      loadComparison();
    }).catch(function () {
      var navDot = document.getElementById("nav-dot");
      var navStatus = document.getElementById("nav-status");
      if (navDot) navDot.setAttribute("data-state", "offline");
      if (navStatus) navStatus.textContent = "Backend offline";

      var offlineAlert = document.getElementById("offline-alert");
      if (offlineAlert) offlineAlert.style.display = "block";
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

