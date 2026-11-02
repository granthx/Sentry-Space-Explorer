/* exoplanets.js — Kepler light curve transit classification */

(function () {
  'use strict';

  const API = '/api/exoplanets';

  const kepidInput   = document.getElementById('kepid-input');
  const predictBtn   = document.getElementById('predict-btn');
  const resultDiv    = document.getElementById('exo-result');
  const badgeEl      = document.getElementById('result-badge');
  const metaEl       = document.getElementById('result-meta');
  const errorDiv     = document.getElementById('exo-error');
  const loadingDiv   = document.getElementById('exo-loading');
  const fluxCanvas   = document.getElementById('flux-chart');
  const chips        = document.querySelectorAll('.chip[data-kepid]');

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      kepidInput.value = chip.dataset.kepid;
      runPrediction();
    });
  });

  predictBtn.addEventListener('click', runPrediction);
  kepidInput.addEventListener('keydown', e => { if (e.key === 'Enter') runPrediction(); });

  async function runPrediction() {
    const kepid = parseInt(kepidInput.value.trim(), 10);
    if (!kepid || kepid <= 0) {
      showError('Enter a valid Kepler ID (positive integer).');
      return;
    }

    setLoading(true);
    clearError();
    resultDiv.hidden = true;

    try {
      const data = await apiFetch(`${API}/predict?kepid=${kepid}`);
      renderResult(data);
    } catch (err) {
      showError(err.message || 'Prediction failed. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }

  function renderResult(d) {
    const isplanet = d.label === 'PLANET';

    badgeEl.className = 'result-badge ' + (isplanet ? 'planet' : 'fp');
    badgeEl.textContent = isplanet ? '🪐 Planet detected' : '✗ False positive';

    const pct   = Math.round(d.confidence * 100);
    const src   = d.source === 'sample' ? 'offline sample' : d.source;
    const period = d.period_days ? ` · Period ${d.period_days} d` : '';
    const disp  = d.disposition ? ` · ${d.disposition}` : '';

    metaEl.textContent = `KIC ${d.kepid} · Confidence ${pct}%${period}${disp} · Source: ${src}`;

    drawFluxChart(d.flux_sample);
    resultDiv.hidden = false;
  }

  function drawFluxChart(flux) {
    const ctx  = fluxCanvas.getContext('2d');
    const W    = fluxCanvas.width;
    const H    = fluxCanvas.height;
    const PAD  = { top: 16, right: 16, bottom: 28, left: 46 };
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top  - PAD.bottom;

    ctx.clearRect(0, 0, W, H);

    const min = Math.min(...flux);
    const max = Math.max(...flux);
    const range = max - min || 1;

    const toX = i => PAD.left + (i / (flux.length - 1)) * innerW;
    const toY = v => PAD.top  + (1 - (v - min) / range) * innerH;

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let t = 0; t <= 4; t++) {
      const y = PAD.top + (t / 4) * innerH;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
    }

    // Zero line
    const zeroY = toY(0);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(PAD.left, zeroY); ctx.lineTo(W - PAD.right, zeroY); ctx.stroke();
    ctx.setLineDash([]);

    // Flux area fill
    const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + innerH);
    grad.addColorStop(0, 'rgba(96,165,250,0.18)');
    grad.addColorStop(1, 'rgba(96,165,250,0)');

    ctx.beginPath();
    ctx.moveTo(toX(0), toY(flux[0]));
    for (let i = 1; i < flux.length; i++) ctx.lineTo(toX(i), toY(flux[i]));
    ctx.lineTo(toX(flux.length - 1), PAD.top + innerH);
    ctx.lineTo(toX(0), PAD.top + innerH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Flux line
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(flux[0]));
    for (let i = 1; i < flux.length; i++) ctx.lineTo(toX(i), toY(flux[i]));
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = 'rgba(200,215,255,0.45)';
    ctx.font = '11px Figtree, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Flux', 2, PAD.top + innerH / 2 + 4);
    ctx.textAlign = 'center';
    ctx.fillText('Time →', PAD.left + innerW / 2, H - 4);
  }

  function setLoading(on) {
    loadingDiv.hidden = !on;
    predictBtn.disabled = on;
  }

  function showError(msg) {
    errorDiv.textContent = msg;
    errorDiv.hidden = false;
  }

  function clearError() {
    errorDiv.hidden = true;
  }

  /* apiFetch is provided by js/api.js */
  function apiFetch(url) {
    return fetch(url).then(r => {
      if (!r.ok) return r.json().then(b => { throw new Error((b.error && b.error.message) || r.statusText); });
      return r.json();
    });
  }
})();

