/* terrain.js — Mars terrain segmentation */

(function () {
  'use strict';

  const API = '/api/terrain';

  const imgUrlInput  = document.getElementById('img-url');
  const imgUpload    = document.getElementById('img-upload');
  const segBtn       = document.getElementById('segment-btn');
  const loadingDiv   = document.getElementById('terrain-loading');
  const errorDiv     = document.getElementById('terrain-error');
  const resultDiv    = document.getElementById('terrain-result');
  const origCanvas   = document.getElementById('orig-canvas');
  const segCanvas    = document.getElementById('seg-canvas');
  const statsDiv     = document.getElementById('terrain-stats');
  const legendDiv    = document.getElementById('terrain-legend');

  // Sample chip
  document.querySelectorAll('.chip[data-url]').forEach(chip => {
    chip.addEventListener('click', () => {
      imgUrlInput.value = chip.dataset.url;
    });
  });

  // File upload → base64
  imgUpload.addEventListener('change', () => {
    const file = imgUpload.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => { imgUrlInput.value = e.target.result; };
    reader.readAsDataURL(file);
  });

  segBtn.addEventListener('click', runSegmentation);

  async function runSegmentation() {
    const src = imgUrlInput.value.trim();
    if (!src) { showError('Enter an image URL or upload a file.'); return; }

    setLoading(true);
    clearError();
    resultDiv.hidden = true;

    try {
      // First draw the original image on orig-canvas
      if (src.startsWith('http')) {
        await drawOriginal(src);
      } else {
        await drawOriginal(src); // data URI also works
      }

      const data = await apiFetch(API + '/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_source: src }),
      });

      renderResult(data);
    } catch (err) {
      showError(err.message || 'Segmentation failed. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }

  function drawOriginal(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const ctx = origCanvas.getContext('2d');
        ctx.clearRect(0, 0, 256, 256);
        ctx.drawImage(img, 0, 0, 256, 256);
        resolve();
      };
      img.onerror = () => {
        // Can't load (CORS etc.) — just blank
        const ctx = origCanvas.getContext('2d');
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.font = '13px Figtree';
        ctx.textAlign = 'center';
        ctx.fillText('Preview unavailable', 128, 128);
        resolve();
      };
      img.src = src;
    });
  }

  const CLASSES = ['soil', 'bedrock', 'sand', 'big_rock'];

  function renderResult(d) {
    const palette = d.palette;
    const map     = d.class_map; // 64×64 array of class indices
    const H = d.height, W = d.width;

    // Draw segmentation onto seg-canvas (scaled to 256×256)
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width  = W;
    tmpCanvas.height = H;
    const tmpCtx = tmpCanvas.getContext('2d');
    const imgData = tmpCtx.createImageData(W, H);

    for (let row = 0; row < H; row++) {
      for (let col = 0; col < W; col++) {
        const cls  = map[row][col];
        const name = CLASSES[cls];
        const rgb  = (palette[name] || [150, 150, 150]);
        const idx  = (row * W + col) * 4;
        imgData.data[idx]     = rgb[0];
        imgData.data[idx + 1] = rgb[1];
        imgData.data[idx + 2] = rgb[2];
        imgData.data[idx + 3] = 200; // slight transparency for overlay feel
      }
    }
    tmpCtx.putImageData(imgData, 0, 0);

    const sCtx = segCanvas.getContext('2d');
    sCtx.clearRect(0, 0, 256, 256);
    sCtx.drawImage(tmpCanvas, 0, 0, 256, 256);

    // Stats
    const total  = H * W;
    const counts = d.class_counts;
    statsDiv.innerHTML = `
      ${CLASSES.map(cls => `
        <div class="stat-pill">
          <strong>${Math.round((counts[cls] / total) * 100)}%</strong>
          <span>${cls.replace('_', ' ')}</span>
        </div>
      `).join('')}
      <div class="stat-pill">
        <strong>
          <span class="safe-badge ${d.safe_to_drive ? 'safe' : 'unsafe'}">
            ${d.safe_to_drive ? '✓ Safe' : '⚠ Risk'}
          </span>
        </strong>
        <span>drive assessment</span>
      </div>
    `;

    // Legend
    legendDiv.innerHTML = CLASSES.map(cls => {
      const rgb = palette[cls] || [150, 150, 150];
      return `<div class="legend-item">
        <span class="legend-swatch" style="background:rgb(${rgb.join(',')})"></span>
        ${cls.replace('_', ' ')}
      </div>`;
    }).join('');

    resultDiv.hidden = false;
  }

  function setLoading(on) {
    loadingDiv.hidden = !on;
    segBtn.disabled = on;
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

