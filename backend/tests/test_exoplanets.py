"""Tests for the Exoplanet Finder service and router."""

from __future__ import annotations

import math
from unittest.mock import AsyncMock, patch, MagicMock

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.exoplanets import (
    DEFAULT_KEPID,
    FLUX_BINS,
    CHART_POINTS,
    _normalise_flux,
    _downsample_chart,
    _run_model,
)


# ---------------------------------------------------------------------------
# Unit: _normalise_flux
# ---------------------------------------------------------------------------

class TestNormaliseFlux:
    def test_output_shape(self):
        raw = [1.0 + 0.001 * i for i in range(300)]
        result = _normalise_flux(raw)
        assert result.shape == (FLUX_BINS,)

    def test_shorter_than_bins(self):
        raw = [1.0] * 50
        result = _normalise_flux(raw)
        assert result.shape == (FLUX_BINS,)

    def test_empty_input_returns_zeros(self):
        result = _normalise_flux([])
        assert result.shape == (FLUX_BINS,)
        assert np.all(result == 0.0)

    def test_nan_filtered(self):
        raw = [float('nan'), 1.0, 1.001, float('nan'), 1.002]
        result = _normalise_flux(raw)
        assert result.shape == (FLUX_BINS,)
        assert np.all(np.isfinite(result))

    def test_uniform_signal_near_zero(self):
        # Median-normalised constant should be near 0
        raw = [2.0] * 200
        result = _normalise_flux(raw)
        assert np.allclose(result, 0.0, atol=1e-5)


class TestDownsampleChart:
    def test_correct_length(self):
        flux = np.zeros(FLUX_BINS, dtype=np.float32)
        result = _downsample_chart(flux)
        assert len(result) == CHART_POINTS

    def test_values_are_floats(self):
        flux = np.linspace(-0.01, 0.01, FLUX_BINS, dtype=np.float32)
        result = _downsample_chart(flux)
        assert all(isinstance(v, float) for v in result)


# ---------------------------------------------------------------------------
# Unit: _run_model (no ONNX model present → falls back to heuristic)
# ---------------------------------------------------------------------------

class TestRunModel:
    def test_returns_label_and_confidence(self):
        flux = np.zeros(FLUX_BINS, dtype=np.float32)
        label, conf = _run_model(flux)
        assert label in ("PLANET", "FALSE_POSITIVE")
        assert 0.0 <= conf <= 1.0

    def test_dip_classified_as_planet(self):
        flux = np.zeros(FLUX_BINS, dtype=np.float32)
        mid = FLUX_BINS // 2
        flux[mid - 5: mid + 5] = -0.003
        label, _ = _run_model(flux)
        assert label == "PLANET"

    def test_flat_signal_classified_as_fp(self):
        # Flat signal → no dip → false positive
        flux = np.zeros(FLUX_BINS, dtype=np.float32)
        label, _ = _run_model(flux)
        # heuristic: min==0, p_planet=min(1.0, 1.0 - (0+0.003)/0.003) == 0
        assert label == "FALSE_POSITIVE"


# ---------------------------------------------------------------------------
# Integration: HTTP routes
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


class TestExoplanetRouter:
    def test_predict_default_kepid(self, client):
        resp = client.get(f"/api/exoplanets/predict?kepid={DEFAULT_KEPID}")
        assert resp.status_code == 200
        data = resp.json()
        assert "kepid" in data
        assert "label" in data
        assert data["label"] in ("PLANET", "FALSE_POSITIVE")
        assert "confidence" in data
        assert 0.0 <= data["confidence"] <= 1.0
        assert "flux_sample" in data
        assert len(data["flux_sample"]) == CHART_POINTS

    def test_predict_false_positive_kepid(self, client):
        resp = client.get("/api/exoplanets/predict?kepid=10666592")
        assert resp.status_code == 200
        data = resp.json()
        assert data["kepid"] == 10666592

    def test_predict_unknown_kepid(self, client):
        # Unknown KIC falls back to synthetic; should still succeed
        resp = client.get("/api/exoplanets/predict?kepid=99999999")
        assert resp.status_code == 200

    def test_predict_invalid_kepid(self, client):
        resp = client.get("/api/exoplanets/predict?kepid=-5")
        assert resp.status_code == 422

    def test_predict_zero_kepid(self, client):
        resp = client.get("/api/exoplanets/predict?kepid=0")
        assert resp.status_code == 422

    def test_samples_endpoint(self, client):
        resp = client.get("/api/exoplanets/samples")
        assert resp.status_code == 200
        data = resp.json()
        assert "samples" in data
        assert len(data["samples"]) >= 1
        assert "kepid" in data["samples"][0]

