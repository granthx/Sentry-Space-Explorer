/* anomaly.js — Spacecraft anomaly detection */

(function () {
  'use strict';

  const API = '/api/anomaly';

  const datasetSelect  = document.getElementById('dataset-select');
  const channelSelect  = document.getElementById('channel-select');
  const detectBtn      = document.getElementById('detect-btn');
  const loadingDiv     = document.getElementById('anomaly-loading');
  const errorDiv       = document.getElementById('anomaly-error');
  const resultDiv      = document.getElementById('anomaly-result');
  const summaryDiv     = document.getElementById('anomaly-summary');
  const anomalyCanvas  = document.getElementById('anomaly-chart');

  const CHANNELS = {
    smap: ['T-1', 'T-2', 'T-3', 'D-14', 'F-4'],
    msl:  ['M-1', 'M-2', 'M-6', 'S-2',  'P-15'],
  };

  datasetSelect.addEventListener('change', () => {
    const ds = datasetSelect.value;
    channelSelect.innerHTML = CHANNELS[ds].map(c => `<option value="${c}">${c}</option>`).join('');
  });

  detectBtn.addEventListener('click', runDetection);

  async function runDetection() {
    const dataset = datasetSelect.value;
    const channel = channelSelect.value;

    setLoading(true);
    clearError();
    resultDiv.hidden = true;

    try {
      const data = await apiFetch(`${API}/detect?dataset=${encodeURIComponent(dataset)}&channel=${encodeURIComponent(channel)}`);
      renderResult(data);
    } catch (err) {
      showError(err.message || 'Detection failed. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }

  function renderResult(d) {
    const sevClass = 'severity-' + d.severity;
    const sevLabel = d.severity.charAt(0).toUpperCase() + d.severity.slice(1);
    const pct = Math.round(d.anomaly_rate * 100);

    summaryDiv.innerHTML = `
      <span class="severity-badge ${sevClass}">${sevLabel} severity</span>
      <div class="anomaly-stats">
        <div class="stat-pill"><strong>${d.anomaly_count}</strong><span>anomalies</span></div>
        <div class="stat-pill"><strong>${pct}%</strong><span>anomaly rate</span></div>
        <div class="stat-pill"><strong>${d.n_samples}</strong><span>samples</span></div>
        <div class="stat-pill"><strong>${d.threshold.toFixed(4)}</strong><span>threshold</span></div>
      </div>
    `;

    drawAnomalyChart(d.errors, d.anomaly_flags, d.threshold);
    resultDiv.hidden = false;
  }

  function drawAnomalyChart(errors, flags, threshold) {
    const ctx = anomalyCanvas.getContext('2d');
    const W   = anomalyCanvas.width;
    const H   = anomalyCanvas.height;
    const PAD = { top: 16, right: 16, bottom: 28, left: 52 };
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top  - PAD.bottom;

    ctx.clearRect(0, 0, W, H);

    const maxErr = Math.max(...errors, threshold) * 1.1 || 1;
    const toX = i => PAD.left + (i / (errors.length - 1)) * innerW;
    const toY = v => PAD.top  + (1 - v / maxErr) * innerH;

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let t = 0; t <= 4; t++) {
      const y = PAD.top + (t / 4) * innerH;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
    }

    // Anomaly highlight bands
    flags.forEach((flag, i) => {
      if (!flag) return;
      const x1 = toX(i);
      const x2 = i < errors.length - 1 ? toX(i + 1) : x1 + innerW / errors.length;
      ctx.fillStyle = 'rgba(255,80,80,0.13)';
      ctx.fillRect(x1, PAD.top, x2 - x1, innerH);
    });

    // Threshold line
    const thY = toY(threshold);
    ctx.strokeStyle = 'rgba(255,150,80,0.7)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(PAD.left, thY); ctx.lineTo(W - PAD.right, thY); ctx.stroke();
    ctx.setLineDash([]);

    // Error area
    const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + innerH);
    grad.addColorStop(0, 'rgba(96,165,250,0.2)');
    grad.addColorStop(1, 'rgba(96,165,250,0)');

    ctx.beginPath();
    ctx.moveTo(toX(0), toY(errors[0]));
    for (let i = 1; i < errors.length; i++) ctx.lineTo(toX(i), toY(errors[i]));
    ctx.lineTo(toX(errors.length - 1), PAD.top + innerH);
    ctx.lineTo(toX(0), PAD.top + innerH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Error line
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(errors[0]));
    for (let i = 1; i < errors.length; i++) ctx.lineTo(toX(i), toY(errors[i]));
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Threshold label
    ctx.fillStyle = 'rgba(255,160,80,0.7)';
    ctx.font = '11px Figtree, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('95th pct', PAD.left + 4, thY - 4);

    // Axes labels
    ctx.fillStyle = 'rgba(200,215,255,0.45)';
    ctx.textAlign = 'left';
    ctx.fillText('Error', 2, PAD.top + innerH / 2 + 4);
    ctx.textAlign = 'center';
    ctx.fillText('Window →', PAD.left + innerW / 2, H - 4);
  }

  function setLoading(on) {
    loadingDiv.hidden = !on;
    detectBtn.disabled = on;
  }

  function showError(msg) {
    errorDiv.textContent = msg;
    errorDiv.hidden = false;
  }

  function clearError() {
    errorDiv.hidden = true;
  }

  function apiFetch(url, opts) {
    return fetch(url, opts).then(r => {
      if (!r.ok) return r.json().then(b => { throw new Error((b.error && b.error.message) || r.statusText); });
      return r.json();
    });
  }
})();

